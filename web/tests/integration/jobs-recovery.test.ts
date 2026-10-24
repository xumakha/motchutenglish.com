import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { eq, sql, type SQL } from "drizzle-orm";
import { createConnection } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { jobs, users } from "@/db/schema";
import { withTx } from "@/db/tx";
import { ensureProfile } from "@/domain/identity/profile";
import { env } from "@/env";
import { run } from "@/worker/jobs";
import { createUser } from "./fixtures";

// Port of tests/jobs_recovery.php: kill the real CLI worker in the middle of a job, restart, and
// check that safe jobs are requeued with backoff, external deliveries are never replayed, and
// results committed before the crash are acknowledged instead of redone.

afterAll(() => pool().end());

async function rows<T>(query: SQL): Promise<T[]> {
  return ((await db().execute(query)) as unknown as [T[]])[0];
}

async function job(id: number) {
  const [row] = await db().select().from(jobs).where(eq(jobs.id, id));
  return row!;
}

async function addJob(
  type: string,
  payload: Record<string, unknown>,
  status = "running",
  attempts = 1,
): Promise<number> {
  const [row] = await db()
    .insert(jobs)
    .values({
      type: type as never,
      payload,
      eventKey: `recovery-test:${randomBytes(16).toString("hex")}`,
      availableAt: new Date(),
      status: status as never,
      attempts,
      lockedAt: status === "running" ? new Date() : null,
    })
    .$returningId();
  return row!.id;
}

async function learner(): Promise<number> {
  const { userId } = await createUser();
  await withTx((tx) => ensureProfile(tx, userId!));
  return userId!;
}

const due = (id: number) =>
  db().update(jobs).set({ availableAt: new Date() }).where(eq(jobs.id, id));

beforeAll(async () => {
  if (env().APP_ENV === "production") throw new Error("Never run against production");
  // The queue is global: park leftover work from other suites so run(1) picks our jobs.
  await db().execute(sql`
    UPDATE mce_jobs SET status = 'expired', last_error = 'Parked by jobs-recovery test'
    WHERE status IN ('pending', 'running')`);
});

describe("worker crash recovery", () => {
  it("a killed worker's deletion job is requeued with backoff, then runs", async () => {
    const uid = await learner();
    const jobId = await addJob("delete_account", { userId: uid }, "pending", 0);

    // Hold the learner's profile lock so the real worker blocks inside eraseAccount.
    const holder = await createConnection({ uri: env().DATABASE_URL });
    await holder.query("START TRANSACTION");
    await holder.query("SELECT user_id FROM mce_profiles WHERE user_id = ? FOR UPDATE", [uid]);
    const worker = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "--import",
        "./scripts/worker-hooks.mjs",
        "src/worker/cli.ts",
        "run",
        "1",
      ],
      { stdio: "ignore" },
    );
    try {
      let claimed = await job(jobId);
      for (let i = 0; i < 300 && claimed.status !== "running"; i++) {
        await new Promise((r) => setTimeout(r, 50));
        claimed = await job(jobId);
      }
      expect(claimed).toMatchObject({ status: "running", attempts: 1 });

      // A second worker must not steal a live job.
      expect(await run(1)).toMatchObject({ busy: true });
      expect((await job(jobId)).status).toBe("running");
      worker.kill("SIGKILL");
      await new Promise((r) => worker.once("exit", r));
    } finally {
      if (worker.exitCode === null && !worker.killed) worker.kill("SIGKILL");
      await holder.query("ROLLBACK");
      await holder.end();
    }

    // The server frees the dead worker's lock when its connection drops.
    for (let i = 0; i < 200; i++) {
      const [lock] = await rows<{ owner: number | null }>(
        sql`SELECT IS_USED_LOCK('mce_worker') AS owner`,
      );
      if (lock?.owner === null) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    const result = await run(1);
    expect(result.recovery?.requeued).toBe(1);
    const recovered = await job(jobId);
    expect(recovered).toMatchObject({ status: "pending", attempts: 1, lockedAt: null });
    expect(recovered.availableAt.getTime()).toBeGreaterThan(Date.now());
    expect((await run(1)).recovery?.requeued).toBe(0); // idempotent

    await due(jobId);
    expect((await run(1)).processed).toBe(1);
    expect((await job(jobId)).status).toBe("done");
    const [user] = await db().select({ name: users.name }).from(users).where(eq(users.id, uid));
    expect(user!.name).toBe("Tài khoản đã xóa");
  }, 30_000);

  it("mail, reminder and analytics are never replayed; exhausted and unknown jobs fail", async () => {
    const uid = await learner();
    const external = [];
    for (const type of ["mail", "reminder", "analytics"])
      external.push(await addJob(type, { userId: uid, localDate: "2026-01-01" }));
    const exhausted = await addJob("delete_account", { userId: uid }, "running", 5);
    const unknown = await addJob("unknown", {});

    expect((await run(1)).recovery?.failed).toBe(5);
    for (const id of external) {
      const j = await job(id);
      expect(j.status).toBe("failed");
      expect(j.lastError).toContain("uncertain");
      expect(j.lockedAt).toBeNull();
    }
    expect((await job(exhausted)).attempts).toBe(5);
    expect((await job(unknown)).status).toBe("failed");
    expect((await run(1)).processed).toBe(0);
  });

  it("results committed before the crash are acknowledged, not redone", async () => {
    const owner = await learner();
    const [importId, exportId] = [randomBytes(16).toString("hex"), randomBytes(16).toString("hex")];
    await db().execute(sql`
      INSERT INTO mce_imports (id, actor_id, document, errors, status)
      VALUES (${importId}, ${owner}, '{}', '[]', 'committed')`);
    await db().execute(sql`
      INSERT INTO mce_exports (id, user_id, kind, status, expires_at)
      VALUES (${exportId}, ${owner}, 'personal', 'ready', ${new Date(Date.now() + 86_400_000)})`);
    await db().execute(sql`
      INSERT INTO mce_deliveries (user_id, local_date, type, status)
      VALUES (${owner}, '2026-01-01', 'reminder', 'sent')`);
    const finished = [
      await addJob("import", { actorId: owner, importId }),
      await addJob("export", { userId: owner, exportId }),
      await addJob("reminder", { userId: owner, localDate: "2026-01-01" }),
    ];
    const result = await run(1);
    expect(result.recovery?.completed).toBe(3);
    expect(result.processed).toBe(0);
    for (const id of finished) expect(await job(id)).toMatchObject({ status: "done", payload: {} });
  });

  it("interrupted import and export go back to queued; the partial export is rebuilt", async () => {
    const owner = await learner();
    const [importId, exportId] = [randomBytes(16).toString("hex"), randomBytes(16).toString("hex")];
    const exportsDir = resolve(process.cwd(), env().WRITABLE_DIR, "exports");
    await mkdir(exportsDir, { recursive: true, mode: 0o700 });
    const partial = `${randomBytes(16).toString("hex")}.json`;
    await writeFile(resolve(exportsDir, partial), "partial");
    await db().execute(sql`
      INSERT INTO mce_imports (id, actor_id, document, errors, status)
      VALUES (${importId}, ${owner}, '{}', '[]', 'running')`);
    await db().execute(sql`
      INSERT INTO mce_import_progress (import_id, processed, total, phase, updated_at)
      VALUES (${importId}, 40, 100, 'running', UTC_TIMESTAMP(3))`);
    await db().execute(sql`
      INSERT INTO mce_exports (id, user_id, kind, status, file_key, expires_at)
      VALUES (${exportId}, ${owner}, 'personal', 'running', ${partial},
        ${new Date(Date.now() + 86_400_000)})`);
    const importJob = await addJob("import", { actorId: owner, importId });
    const exportJob = await addJob("export", { userId: owner, exportId });

    expect((await run(1)).recovery?.requeued).toBe(2);
    const [imp] = await rows<{ status: string }>(
      sql`SELECT status FROM mce_imports WHERE id = ${importId}`,
    );
    expect(imp!.status).toBe("queued");
    const [progress] = await rows<{ processed: number }>(
      sql`SELECT processed FROM mce_import_progress WHERE import_id = ${importId}`,
    );
    expect(Number(progress!.processed)).toBe(0);
    const [exp] = await rows<{ status: string }>(
      sql`SELECT status FROM mce_exports WHERE id = ${exportId}`,
    );
    expect(exp!.status).toBe("queued");

    await due(exportJob);
    expect((await run(1)).processed).toBe(1);
    const [ready] = await rows<{ status: string; file_key: string }>(
      sql`SELECT status, file_key FROM mce_exports WHERE id = ${exportId}`,
    );
    expect(ready!.status).toBe("ready");
    expect(existsSync(resolve(exportsDir, partial))).toBe(false);
    const built = JSON.parse(await readFile(resolve(exportsDir, ready!.file_key), "utf8"));
    expect(built.kind).toBe("personal");
    // Keep the deliberately incomplete import from running in later suites.
    await db().update(jobs).set({ status: "failed" }).where(eq(jobs.id, importJob));
  });
});
