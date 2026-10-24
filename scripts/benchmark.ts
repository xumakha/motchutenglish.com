import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { cpus, platform, release } from "node:os";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { auth } from "@/auth/auth";
import { db, pool } from "@/db/client";
import { lessons } from "@/db/schema";
import { withTx } from "@/db/tx";
import { ensureProfile } from "@/domain/identity/profile";
import { startAttempt } from "@/domain/study/attempts";
import { env } from "@/env";

// A02 benchmark (port of tests/performance.py + the `performance` fixture): 50 signed-in learners
// submit an answer to the seeded lesson at the same time; the server grades it and returns the
// attempt. Target: p95 under 800 ms with under 1% errors. A local measurement, not a staging
// capacity claim. Run against a started production build:
//   pnpm benchmark [BASE_URL]        (default http://127.0.0.1:3000)
// Needs the seeded sample catalog (pnpm seed --publish-reviewed-samples). Creates 55 users.

const SESSIONS = 55;
const WARMUP = 5;
const TARGET_P95_MS = 800;

interface Session {
  cookie: string;
  attempt: string;
}

async function signedInLearner(lessonId: number): Promise<Session> {
  const email = `load-${randomBytes(8).toString("hex")}@example.test`;
  const password = randomBytes(16).toString("hex");
  const ctx = await auth().$context;
  const user = await ctx.internalAdapter.createUser(
    { email, name: "Load test" },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(password),
  });
  const userId = Number(user.id);
  await withTx((tx) => ensureProfile(tx, userId));
  // A real sign-in, so the cookie is exactly what a browser would hold.
  const response = await auth().api.signInEmail({
    body: { email, password, rememberMe: false },
    asResponse: true,
  });
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!cookie.includes("session_token")) throw new Error("Sign-in returned no session cookie");
  const attempt = await startAttempt(
    { userId, role: "learner", guestKey: null },
    { lessonId, requestKey: randomBytes(16).toString("hex"), mode: "practice" },
  );
  return { cookie, attempt };
}

async function submit(base: string, s: Session) {
  const started = performance.now();
  let error: string | null = null;
  try {
    const response = await fetch(`${base}/api/v1/attempts/${s.attempt}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base, Cookie: s.cookie },
      body: JSON.stringify({ revision: 0, exerciseId: "hello", response: "greeting" }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await response.json()) as {
      data?: { items: { feedback?: { isCorrect?: boolean } }[] };
    };
    if (response.status !== 200) error = `HTTP ${response.status}`;
    else if (body.data?.items[0]?.feedback?.isCorrect !== true) error = "unexpected grading";
  } catch (e) {
    error = e instanceof Error ? e.name : "Error";
  }
  return { ms: Math.round((performance.now() - started) * 100) / 100, error };
}

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  if (env().APP_ENV === "production") throw new Error("Never benchmark against production data");
  const base = (process.argv[2] ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  const [lesson] = await db()
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.slug, "chao-hoi-tung-buoc"));
  if (!lesson) throw new Error("Seed the sample catalog first");

  const sessions: Session[] = [];
  for (let i = 0; i < SESSIONS; i++) sessions.push(await signedInLearner(lesson.id));

  // Security preflight on the measured server: no cookie → 404, cross-origin → 403.
  const anonymous = await fetch(`${base}/api/v1/attempts/${sessions[0]!.attempt}`);
  const crossOrigin = await fetch(`${base}/api/v1/attempts/${sessions[0]!.attempt}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://evil.example",
      Cookie: sessions[0]!.cookie,
    },
    body: "{}",
  });
  if (anonymous.status !== 404 || crossOrigin.status !== 403)
    throw new Error(`Security preflight failed: ${anonymous.status}, ${crossOrigin.status}`);

  for (const s of sessions.slice(0, WARMUP)) {
    const warm = await submit(base, s);
    if (warm.error) throw new Error(`Warmup failed: ${warm.error}`);
  }
  const started = performance.now();
  const results = await Promise.all(sessions.slice(WARMUP).map((s) => submit(base, s)));
  const seconds = Math.round(performance.now() - started) / 1000;
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const errors = results.filter((r) => r.error).length;
  const p95 = times[Math.ceil(times.length * 0.95) - 1]!;
  const report = {
    timestamp: new Date().toISOString(),
    environment: `Local ${platform()} ${release()}, Node ${process.version}, next start (standalone); not staging`,
    logicalCpus: cpus().length,
    cpu: cpus()[0]?.model,
    concurrency: results.length,
    operation: "authenticated server submit + grading + attempt read",
    p50_ms: times[Math.floor(times.length / 2)],
    p95_ms: p95,
    max_ms: times.at(-1),
    errors,
    error_rate: errors / results.length,
    seconds,
    target_p95_ms: TARGET_P95_MS,
    target_met: p95 < TARGET_P95_MS && errors / results.length < 0.01,
    securityPreflight: { privateAttemptUnauthenticated: 404, crossOrigin: 403 },
    results,
  };
  const dir = resolve(process.cwd(), env().WRITABLE_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, "performance.json"), JSON.stringify(report, null, 2));
  console.log(
    `MEASURED: ${results.length} sessions, p50=${report.p50_ms}ms, p95=${p95}ms, errors=${errors}, target met=${report.target_met}`,
  );
  if (errors) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool()
      .promise()
      .end()
      .catch(() => {});
    process.exit();
  });
