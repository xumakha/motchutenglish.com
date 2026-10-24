import "./load-env";
import { randomBytes } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { RowDataPacket } from "mysql2";
import { sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { auth } from "@/auth/auth";
import { db, pool } from "@/db/client";
import { learningRoles } from "@/db/schema";
import type { CardSnapshot } from "@/db/schema/learning";
import { withTx } from "@/db/tx";
import type { Actor } from "@/domain/actor";
import type { LessonDocument } from "@/domain/assessment/types";
import { validateDocument } from "@/domain/assessment/validate";
import { commitImport, previewImport } from "@/domain/content/imports";
import { catalogLessons, catalogPaths } from "@/domain/content/lessons";
import { audioOk } from "@/domain/content/shared";
import { ensureProfile } from "@/domain/identity/profile";
import { submitLegacy } from "@/domain/legacy/lessons";
import { lockProfile } from "@/domain/motivation/profile";
import { award, purchase, updateStreak } from "@/domain/motivation/rewards";
import { addCard } from "@/domain/review/review";
import {
  mutateAttempt,
  startAttempt,
  type Action,
  type MutationInput,
} from "@/domain/study/attempts";
import { env } from "@/env";

// Test fixture CLI for the black-box HTTP suites in tests/*_http.py (port of
// tests/product_fixture.php, tests/learning_fixture.php and tests/timezone_fixture.php).
//   tsx --import ./scripts/worker-hooks.mjs scripts/fixture.ts <product|learning|timezone> <op> [args]
// Output shapes follow the PHP fixtures: rows use the database column names, and JSON columns
// (document, snapshot) stay as the stored JSON text. Refuses to run outside an isolated test
// database created by tests/run_next.py.

type Row = Record<string, unknown>;

/** A plain-text result (the PHP fixtures echoed these); everything else prints as JSON. */
class Text {
  constructor(readonly value: string) {}
}
const text = (value: string) => new Text(value);

const database = new URL(env().DATABASE_URL).pathname.slice(1);
if (!/^mce_next_http_[a-f0-9]+$/.test(database))
  throw new Error("Isolated test database required (mce_next_http_<hex>)");

const tag = () => randomBytes(5).toString("hex");
const key = () => randomBytes(16).toString("hex");
const userActor = (userId: number, role: Actor["role"] = "learner"): Actor => ({
  userId,
  role,
  guestKey: null,
});

async function all(query: string, params: unknown[] = []): Promise<Row[]> {
  const [rows] = await pool().promise().query<RowDataPacket[]>(query, params);
  return rows as Row[];
}
const one = async (query: string, params: unknown[] = []) => (await all(query, params))[0] ?? null;
const count = async (query: string, params: unknown[] = []) =>
  Number(Object.values((await one(query, params)) ?? { n: 0 })[0]);
async function exec(query: string, params: unknown[] = []): Promise<number> {
  const [result] = await pool().promise().query(query, params);
  return (result as { insertId: number }).insertId;
}

/** A real Better Auth account (credential password) with its profile and optional staff role. */
async function createUser(name: string, email: string, password: string, role?: string) {
  const ctx = await auth().$context;
  const user = await ctx.internalAdapter.createUser({ email, name }, { method: "admin" });
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(password),
  });
  const id = Number(user.id);
  await withTx((tx) => ensureProfile(tx, id));
  if (role === "admin" || role === "editor")
    await db().insert(learningRoles).values({ userId: id, role });
  return id;
}

async function staffUsers(prefix: string, password: string) {
  const result: Record<string, { id: number; email: string }> = {};
  for (const role of ["admin", "editor", "learner", "other"]) {
    const email = `${prefix}${role}-${tag()}@example.com`;
    result[role] = { id: await createUser(role, email, password, role), email };
  }
  return result;
}

async function userByEmail(email: string) {
  const u = await one("SELECT id, name, email FROM users WHERE email = ?", [email]);
  if (!u) throw new Error("Missing browser test user");
  return u as { id: number; name: string; email: string };
}

const fail = (message: string): never => {
  throw new Error(message);
};

// ---- product (tests/product_fixture.php) ----

const product: Record<string, (...args: string[]) => Promise<unknown>> = {
  async "review-card-count"(uid) {
    return count("SELECT COUNT(*) FROM mce_review_cards WHERE user_id = ?", [uid]);
  },

  async "browser-flashcard"() {
    const source = await one(
      "SELECT v.*, l.unit_id FROM mce_versions v JOIN mce_lessons l ON l.current_version = v.id WHERE v.status = 'published' ORDER BY v.id LIMIT 1",
    );
    if (!source) fail("No published lesson");
    const doc = JSON.parse(String(source!.document)) as LessonDocument & Row;
    doc.blocks = [];
    doc.preview = true;
    doc.exercises = [
      {
        id: "memory",
        type: "flashcard",
        schemaVersion: 1,
        contentVersion: 1,
        level: "A1",
        skillTags: ["memory"],
        payload: {
          prompt: "Remember family",
          modelAnswer: "PRIVATE-FLASHCARD-BACK — family means gia đình.",
          criteria: ["Nhớ nghĩa gia đình", "Đặt câu phù hợp"],
        },
        explanation: "Đối chiếu với mẫu, không tự động chấm điểm.",
      },
    ] as never;
    await validateDocument(doc as never, { publishing: true, audioOk });
    const lesson = await exec(
      "INSERT INTO mce_lessons (unit_id, slug, required) VALUES (?, ?, 0)",
      [source!.unit_id, `browser-card-${tag()}`],
    );
    const version = await exec(
      "INSERT INTO mce_versions (lesson_id, title, document, status, author_id, published_at) VALUES (?, 'Browser flashcard', ?, 'published', ?, UTC_TIMESTAMP())",
      [lesson, JSON.stringify(doc), source!.author_id],
    );
    await exec("UPDATE mce_lessons SET current_version = ? WHERE id = ?", [version, lesson]);
    return lesson;
  },

  async "review-audio"(uid, audio) {
    return exec(
      "INSERT INTO mce_vocabulary (slug, lemma, ipa, part_of_speech, topic, meaning, example, translation, level, audio_id, status) VALUES (?, 'Audio review', 'IPA-TEST', 'noun', 'audio-review', 'Audio meaning', 'Audio example', 'Audio translation', 'A1', ?, 'published')",
      [`audio-review-${uid}`, audio],
    );
  },

  async "review-audio-state"(uid, sense, archive) {
    if (archive)
      await exec(
        "UPDATE mce_vocabulary SET status = 'archived', part_of_speech = 'changed' WHERE id = ?",
        [sense],
      );
    return one("SELECT snapshot FROM mce_review_cards WHERE user_id = ? AND target_key = ?", [
      uid,
      `sense:${sense}`,
    ]);
  },

  async "browser-review"(email) {
    const u = await userByEmail(email!);
    const audio = await one(
      "SELECT id FROM mce_media WHERE mime LIKE 'audio/%' ORDER BY id DESC LIMIT 1",
    );
    await withTx(async (tx) => {
      const card: CardSnapshot = {
        front: "Browser review",
        back: "Meaning",
        partOfSpeech: "noun",
        audioId: audio ? Number(audio.id) : null,
      };
      await addCard(tx, u.id, "browser-audio", card);
      await addCard(tx, u.id, "browser-legacy", { front: "Legacy review", back: "Legacy meaning" });
    });
    return undefined;
  },

  async "cms-state"(kind, id) {
    if (!["paths", "articles", "vocabulary", "vocabulary_sets"].includes(kind!))
      fail("Invalid fixture kind");
    return {
      row: await one(`SELECT * FROM mce_${kind} WHERE id = ?`, [id]),
      draft: await one(
        "SELECT * FROM mce_entity_drafts WHERE kind = ? AND entity_id = ? ORDER BY id DESC LIMIT 1",
        [kind, id],
      ),
      article: await one(
        "SELECT * FROM mce_article_versions WHERE article_id = ? ORDER BY id DESC LIMIT 1",
        [id],
      ),
      items: await all(
        "SELECT sense_id FROM mce_vocabulary_set_items WHERE set_id = ? ORDER BY sense_id",
        [id],
      ),
    };
  },

  async pagination(uidArg) {
    const uid = Number(uidArg);
    await withTx(async (tx) => {
      for (let i = 0; i < 121; i++) {
        const slug = `paging-${uid}-${i}`;
        await tx.execute(sql`
          INSERT INTO mce_vocabulary (slug, lemma, ipa, part_of_speech, topic, meaning, example, translation, level, status)
          VALUES (${slug}, ${`Paging ${i}`}, '', 'noun', 'paging', 'Pagination meaning', 'Example', 'Translation', 'A1', 'published')`);
        const [[row]] = (await tx.execute(
          sql`SELECT id FROM mce_vocabulary WHERE slug = ${slug}`,
        )) as unknown as [{ id: number }[]];
        const id = row!.id;
        await tx.execute(
          sql`INSERT INTO mce_user_vocabulary (user_id, sense_id, notes) VALUES (${uid}, ${id}, ${`PRIVATE-PAGING-${uid}`})`,
        );
        await addCard(tx, uid, `sense:${id}`, { front: `Paging ${i}`, back: "Meaning" });
        if (i % 2 === 0)
          await tx.execute(
            sql`UPDATE mce_review_cards SET hidden = 1 WHERE user_id = ${uid} AND target_key = ${`sense:${id}`}`,
          );
      }
    });
    return undefined;
  },

  async "marketing-state"(email) {
    const u = await one("SELECT id FROM users WHERE email = ?", [email]);
    return u ? all("SELECT * FROM mce_journeys WHERE user_id = ?", [u.id]) : [];
  },

  async "seo-source"(kind) {
    if (!["paths", "vocabulary", "articles", "vocabulary_sets"].includes(kind!))
      fail("Invalid kind");
    return one(`SELECT * FROM mce_${kind} WHERE status = 'published' ORDER BY id LIMIT 1`);
  },

  async "browser-role"(email) {
    const u = await userByEmail(email!);
    await exec(
      "INSERT INTO learning_roles (user_id, role) VALUES (?, 'admin') ON DUPLICATE KEY UPDATE role = 'admin'",
      [u.id],
    );
    return undefined;
  },

  async "browser-import"(email) {
    const u = await userByEmail(email!);
    const role = (await one("SELECT role FROM learning_roles WHERE user_id = ?", [u.id]))?.role;
    const actor = userActor(u.id, (role as Actor["role"]) ?? "learner");
    const prefix = `browser-import-${randomBytes(4).toString("hex")}`;
    const articles = Array.from({ length: 101 }, (_, i) => ({
      externalId: `a${i}`,
      slug: `${prefix}-${i}`,
      title: `Browser import ${i}`,
      body: "Owned test content",
    }));
    const preview = await previewImport(
      actor,
      JSON.stringify({ schemaVersion: 1, namespace: prefix, articles }),
    );
    if (preview.errors.length) fail("Invalid browser import fixture");
    await commitImport(actor, preview.id);
    await exec("UPDATE mce_jobs SET available_at = ? WHERE event_key = ?", [
      "2000-01-01 00:00:00",
      `import:${preview.id}`,
    ]);
    return preview.id;
  },

  /** Empty the limiter windows (PHP: auth_attempts) so a suite starts below every limit. */
  async authclear() {
    await exec("DELETE FROM rate_limits");
    return undefined;
  },

  async streak(uid, at) {
    await withTx(async (tx) => {
      const p = await lockProfile(tx, Number(uid));
      const when = DateTime.fromISO(String(at).replace(" ", "T"), { zone: "utc" });
      if (!when.isValid) fail("Invalid date");
      await updateStreak(tx, Number(uid), p, false, when.toJSDate());
    });
    return "ok";
  },

  /** 55 signed-in learners, each with a started attempt (load test). Cookie from a real sign-in. */
  async performance() {
    const lesson = await one("SELECT id FROM mce_lessons WHERE slug = 'chao-hoi-tung-buoc'");
    const sessions = [];
    for (let i = 0; i < 55; i++) {
      const email = `load-${randomBytes(8).toString("hex")}@example.com`;
      const password = randomBytes(20).toString("hex");
      const uid = await createUser("Load test", email, password);
      const attempt = await startAttempt(userActor(uid), {
        lessonId: Number(lesson!.id),
        requestKey: key(),
        mode: "practice",
      });
      sessions.push({ cookie: await sessionCookie(email, password), csrf: "", attempt });
    }
    return sessions;
  },

  async "mail-token"(recipient, subject = "") {
    const dir = resolve(process.cwd(), env().WRITABLE_DIR, "mail");
    const files = await Promise.all(
      (await readdir(dir))
        .filter((f) => f.endsWith(".json"))
        .map(async (name) => ({ name, mtime: (await stat(resolve(dir, name))).mtimeMs })),
    );
    for (const { name } of files.sort((a, b) => b.mtime - a.mtime)) {
      const mail = JSON.parse(await readFile(resolve(dir, name), "utf8"));
      if (mail.recipient === recipient && String(mail.subject).includes(subject))
        return text(/#token=([A-Za-z0-9_-]+)/.exec(mail.text)?.[1] ?? "");
    }
    return fail("Mail was not delivered to development sink");
  },

  async user(uid) {
    return one("SELECT id, name, email FROM users WHERE id = ?", [uid]);
  },

  async "privacy-check"(uid) {
    const u = await one("SELECT name, email FROM users WHERE id = ?", [uid]);
    if (u?.name !== "Tài khoản đã xóa" || !String(u.email).endsWith("@invalid.local"))
      fail("PII not erased");
    for (const t of ["mce_user_vocabulary", "mce_review_cards", "mce_attempts", "mce_reminders"])
      if (await count(`SELECT COUNT(*) FROM ${t} WHERE user_id = ?`, [uid]))
        fail(`Private data retained: ${t}`);
    // PHP mce_auth_tokens → Better Auth sessions and app-owned email tokens.
    if (await count("SELECT COUNT(*) FROM auth_sessions WHERE user_id = ?", [uid]))
      fail("Private data retained: auth_sessions");
    if (
      await count(
        "SELECT COUNT(*) FROM auth_verifications WHERE JSON_VALID(value) AND JSON_VALUE(value, '$.userId') = ?",
        [uid],
      )
    )
      fail("Private data retained: auth_verifications");
    return text(
      "PASS: queued account erasure removes PII, notes, attempts, review, tokens and reminders",
    );
  },

  async setup() {
    return staffUsers("product-", "Product-test-123!");
  },

  async catalog() {
    const asPhp = (l: Row & { document: unknown }) => ({
      ...snake(l),
      document: JSON.stringify(l.document),
    });
    const lessons = (await catalogLessons()).map(asPhp);
    const placement = await all(
      "SELECT l.*, v.document, v.title, v.id AS version_id FROM mce_lessons l JOIN mce_versions v ON v.id = l.current_version WHERE l.subtype = 'placement' AND v.status = 'published'",
    );
    return {
      paths: (await catalogPaths()).map(snake),
      lessons: [...lessons, ...placement],
      vocabulary: await all("SELECT * FROM mce_vocabulary WHERE status = 'published'"),
    };
  },

  async coins(uid) {
    await withTx(async (tx) => {
      await lockProfile(tx, Number(uid));
      await award(tx, Number(uid), "coin", 100, `test-credit:${uid}`);
    });
    return undefined;
  },

  async verify(uid, attempt) {
    const a = await one("SELECT * FROM mce_attempts WHERE id = ?", [attempt]);
    if (a?.status !== "finished" || Number(a.score) !== 6 || Number(a.max_score) !== 6)
      fail("Wrong persisted score");
    if ((await count("SELECT COUNT(*) FROM mce_progress WHERE user_id = ?", [uid])) !== 1)
      fail("Progress duplicated");
    const keys = await all(
      "SELECT event_key FROM reward_ledger WHERE user_id = ? AND currency = 'xp'",
      [uid],
    );
    if (keys.length !== 3) fail("Expected completion/pass/review rewards");
    const balance = await count(
      "SELECT COALESCE(SUM(amount), 0) FROM reward_ledger WHERE user_id = ? AND currency = 'coin'",
      [uid],
    );
    if (balance < 0) fail("Negative balance");
    if ((await count("SELECT COUNT(*) FROM mce_review_events WHERE user_id = ?", [uid])) !== 1)
      fail("Duplicate review event");
    return text(
      "PASS: database score/progress, reward and review uniqueness, nonnegative coin balance",
    );
  },

  async purchase(uid, item, requestKey) {
    await purchase(userActor(Number(uid)), item!, requestKey);
    return "ok";
  },

  /** One player action as the attempt's owner: {action, revision, ...fields}. */
  async submit(uid, attempt, input) {
    const data = JSON.parse(input!) as MutationInput & { action: Action };
    await mutateAttempt(userActor(Number(uid)), attempt, data.action, data);
    return "ok";
  },

  /** PHP read the profile's session_version; Better Auth revokes by deleting sessions instead. */
  async "read-session-version"(uid) {
    return count(
      "SELECT COUNT(*) FROM auth_sessions WHERE user_id = ? AND expires_at > UTC_TIMESTAMP()",
      [uid],
    );
  },

  async environment() {
    return {
      node: process.version,
      database: Object.values((await one("SELECT VERSION()"))!)[0],
      lessons: await count("SELECT COUNT(*) FROM mce_lessons"),
      attempts: await count("SELECT COUNT(*) FROM mce_attempts"),
    };
  },
};

/** Session cookie header value (`name=value`) from a real email + password sign-in. */
async function sessionCookie(email: string, password: string): Promise<string> {
  const response = await auth().api.signInEmail({
    body: { email, password, rememberMe: false },
    asResponse: true,
  });
  const cookie = response.headers
    .getSetCookie()
    .find((c) => c.startsWith("mce.session_token=") || c.startsWith("__Secure-mce.session_token="));
  if (!cookie) throw new Error("Sign-in returned no session cookie");
  return cookie.split(";")[0]!;
}

function snake(row: Row): Row {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), v]),
  );
}

// ---- learning (tests/learning_fixture.php): the legacy single-question lessons ----

const learning: Record<string, (...args: string[]) => Promise<unknown>> = {
  async setup() {
    return staffUsers("", "Learning-test-123!");
  },

  async submit(attempt, uid, response) {
    await submitLegacy(userActor(Number(uid)), attempt!, response!);
    return text("Submitted");
  },

  async verify(uid, lesson) {
    if (
      (await count(
        "SELECT COUNT(*) FROM learning_seed_keys WHERE seed_key = 'sample-greetings-v1'",
      )) !== 1
    )
      fail("Seed not idempotent");
    const r = await one(
      "SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS entries FROM reward_ledger WHERE user_id = ?",
      [uid],
    );
    if (Number(r!.total) !== 25 || Number(r!.entries) !== 2) fail("Duplicate or missing XP");
    if (
      (await count(
        "SELECT COUNT(*) FROM learning_audit WHERE action = 'publish' AND target_id = ?",
        [lesson],
      )) !== 1
    )
      fail("Publication audit must be idempotent");
    const e = await one(
      "SELECT COUNT(*) AS events, COUNT(DISTINCT attempt_id) AS attempts FROM learning_events WHERE user_id = ?",
      [uid],
    );
    if (Number(e!.events) !== 3 || Number(e!.attempts) !== 3)
      fail("Duplicate or missing completion event");
    return text("PASS: persisted XP ledger and publication audit are idempotent");
  },

  /** A later publication changes source data; existing attempts must keep their snapshot. */
  async "change-content"(lesson) {
    await exec("UPDATE learning_lessons SET answer_id = ?, explanation = ? WHERE id = ?", [
      "two",
      "Changed source explanation",
      lesson,
    ]);
    return undefined;
  },
};

// ---- timezone (tests/timezone_fixture.php) ----

const sqlTime = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

const timezone: Record<string, (...args: string[]) => Promise<unknown>> = {
  async state(uid) {
    const p = await one("SELECT quest_timezone FROM mce_profiles WHERE user_id = ?", [uid]);
    return {
      timezone: p?.quest_timezone,
      pending: await count("SELECT COUNT(*) FROM mce_timezone_changes WHERE user_id = ?", [uid]),
    };
  },

  async setup() {
    const email = `timezone-http-${randomBytes(8).toString("hex")}@example.com`;
    const uid = await createUser("Timezone HTTP", email, "Timezone-http-test-123!");
    const now = new Date();
    const oldStart = DateTime.fromJSDate(now).setZone("Etc/GMT+12").startOf("day").toJSDate();
    const newStart = DateTime.fromJSDate(now)
      .setZone("Pacific/Kiritimati")
      .startOf("day")
      .toJSDate();
    const eventAt = newStart < oldStart ? newStart : oldStart;
    const used = newStart < oldStart ? 1 : 0;
    await exec(
      "UPDATE mce_profiles SET timezone = 'Pacific/Kiritimati', quest_timezone = 'Etc/GMT+12', review_limit = 1 WHERE user_id = ?",
      [uid],
    );
    await exec(
      "INSERT INTO mce_timezone_changes (user_id, timezone, effective_after) VALUES (?, 'Pacific/Kiritimati', ?)",
      [uid, sqlTime(new Date(now.getTime() - 60_000))],
    );
    const card = async (target: string, snapshot: CardSnapshot, due: Date) => {
      await withTx((tx) => addCard(tx, uid, target, snapshot));
      await exec("UPDATE mce_review_cards SET due_at = ? WHERE user_id = ? AND target_key = ?", [
        sqlTime(due),
        uid,
        target,
      ]);
      return Number(
        (await one("SELECT id FROM mce_review_cards WHERE user_id = ? AND target_key = ?", [
          uid,
          target,
        ]))!.id,
      );
    };
    const rated = await card(
      "timezone-http-rated",
      { front: "Rated", back: "Done" },
      new Date(now.getTime() + 2 * 86_400_000),
    );
    await exec(
      "INSERT INTO mce_review_events (user_id, card_id, request_key, rating, previous_schedule, new_schedule, occurred_at) VALUES (?, ?, ?, 'good', '{}', '{}', ?)",
      [uid, rated, key(), sqlTime(eventAt)],
    );
    const due = await card(
      "timezone-http-due",
      { front: "Timezone HTTP due", back: "Due" },
      new Date(now.getTime() - 86_400_000),
    );
    return { id: uid, email, used, queueCount: 1 - used, dueId: due };
  },
};

const suites = { product, learning, timezone } as const;

async function main() {
  const [suite, op, ...args] = process.argv.slice(2);
  const run = suites[suite as keyof typeof suites]?.[op ?? ""];
  if (!run) throw new Error(`Unknown fixture operation: ${suite} ${op}`);
  const result = await run(...args);
  // Plain text results print as-is (PHP echoed them); everything else as JSON.
  if (result === undefined) return;
  if (result instanceof Text) process.stdout.write(`${result.value}\n`);
  else if (typeof result === "string" || typeof result === "number")
    process.stdout.write(`${result}`);
  else process.stdout.write(JSON.stringify(result));
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool().promise().end();
}
