import "server-only";
import { readdir, rm, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import { createConnection } from "mysql2/promise";
import { db } from "@/db/client";
import {
  authVerifications,
  deliveries,
  learningRoles,
  profiles,
  reminders,
  users,
} from "@/db/schema";
import { withTx } from "@/db/tx";
import type { Role } from "@/auth/session";
import { sendAnalytics, type AnalyticsJob } from "@/domain/analytics/marketing";
import { commitImport, writeProgress } from "@/domain/content/imports";
import { cleanupExports, buildExport } from "@/domain/exports/exports";
import {
  createEmailToken,
  eraseAccount,
  mintEmailToken,
  releaseEmailToken,
} from "@/domain/identity/account";
import type { MailPayload } from "@/domain/jobs/enqueue";
import { PermanentJobError } from "@/domain/jobs/errors";
import { localDay, lockProfile } from "@/domain/motivation/profile";
import { reconcileBalances, updateStreak } from "@/domain/motivation/rewards";
import { env, mailConfigured } from "@/env";
import { DeliveryUncertainError, sendMail, type OutgoingMail } from "./mail/mailer";
import { reminderMail, resetPasswordMail, verifyEmailMail } from "./mail/templates";

// Port of application/libraries/Jobs.php. One worker at a time (GET_LOCK on a dedicated
// connection that lives for the whole run). Retries back off exponentially and stop after 5
// tries. After a crash, jobs that are safe to repeat (import, export, delete_account) are
// requeued, while external deliveries (mail, reminder, analytics) are marked failed as
// "delivery uncertain" and are never resent automatically.

const MAX_TRIES = 5;
const DAY_MS = 86_400_000;

interface JobRow {
  id: number;
  type: string;
  payload: string;
  attempts: number;
}

async function rows<T>(query: SQL): Promise<T[]> {
  const [result] = (await db().execute(query)) as unknown as [T[]];
  return result;
}

const backoffSeconds = (attempts: number) =>
  Math.min(3600, 30 * 2 ** Math.min(7, Math.max(0, attempts)));
const later = (seconds: number) => new Date(Date.now() + seconds * 1000);

function decode(payload: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(payload);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const str = (value: unknown) => (typeof value === "string" ? value : "");

const markDone = (id: number) =>
  db().execute(
    sql`UPDATE mce_jobs SET status = 'done', payload = '{}', locked_at = NULL, last_error = NULL
        WHERE id = ${id}`,
  );

/** Import total for the progress projection: the stored total, or the record count. */
async function importTotal(importId: string): Promise<number> {
  const [progress] = await rows<{ total: number }>(
    sql`SELECT total FROM mce_import_progress WHERE import_id = ${importId}`,
  );
  if (progress) return Number(progress.total);
  const [row] = await rows<{ document: string }>(
    sql`SELECT document FROM mce_imports WHERE id = ${importId}`,
  );
  const doc = decode(row?.document ?? "{}") ?? {};
  for (const kind of ["paths", "units", "articles", "vocabulary_sets", "vocabulary", "lessons"])
    if (Array.isArray(doc[kind])) return (doc[kind] as unknown[]).length;
  return 0;
}

type Recovery = "requeued" | "completed" | "failed";

/**
 * Jobs left "running" by a worker that died. Only called while holding the worker lock: a live
 * worker keeps the lock even during long jobs, so elapsed time alone never steals work.
 */
async function recoverInterrupted() {
  const counts: Record<Recovery, number> = { requeued: 0, completed: 0, failed: 0 };
  const candidates = await rows<{ id: number }>(
    sql`SELECT id FROM mce_jobs WHERE status = 'running' ORDER BY id`,
  );
  for (const { id } of candidates) {
    const outcome = await withTx(async (tx): Promise<Recovery | null> => {
      const [locked] = (await tx.execute(
        sql`SELECT * FROM mce_jobs WHERE id = ${id} AND status = 'running' FOR UPDATE`,
      )) as unknown as [JobRow[]];
      const job = locked[0];
      if (!job) return null;
      const payload = decode(job.payload);
      const exists = async (query: SQL) =>
        ((await tx.execute(query)) as unknown as [unknown[]])[0].length > 0;

      // The job finished its work but died before acknowledging it.
      let completed = false;
      if (payload && job.type === "import")
        completed = await exists(
          sql`SELECT id FROM mce_imports WHERE id = ${str(payload.importId)} AND status = 'committed'`,
        );
      else if (payload && job.type === "export")
        completed = await exists(
          sql`SELECT id FROM mce_exports WHERE id = ${str(payload.exportId)} AND status = 'ready'`,
        );
      else if (payload && job.type === "reminder")
        completed = await exists(sql`
          SELECT user_id FROM mce_deliveries WHERE user_id = ${Number(payload.userId) || 0}
            AND local_date = ${str(payload.localDate)} AND type = 'reminder'
            AND status IN ('sent', 'skipped')`);
      if (completed) {
        await tx.execute(
          sql`UPDATE mce_jobs SET status = 'done', payload = '{}', locked_at = NULL,
              last_error = NULL WHERE id = ${job.id}`,
        );
        return "completed";
      }

      const retryable = !!payload && ["import", "export", "delete_account"].includes(job.type);
      const retry = retryable && job.attempts < MAX_TRIES;
      const error = retry
        ? "Worker interrupted - safe retry scheduled"
        : retryable
          ? "Worker interrupted - retry limit reached"
          : ["mail", "reminder", "analytics"].includes(job.type)
            ? "Delivery uncertain - worker interrupted; manual reconciliation required"
            : "Worker interrupted - unsupported or invalid payload; manual inspection required";
      await tx.execute(sql`
        UPDATE mce_jobs SET status = ${retry ? "pending" : "failed"},
          available_at = ${later(backoffSeconds(job.attempts))}, locked_at = NULL,
          last_error = ${error}
        WHERE id = ${job.id}`);
      const phase = retry ? "queued" : "failed";
      if (payload && job.type === "import") {
        const importId = str(payload.importId);
        await tx.execute(
          sql`UPDATE mce_imports SET status = ${phase} WHERE id = ${importId} AND status <> 'committed'`,
        );
        await writeProgress(importId, 0, await importTotal(importId), phase);
      }
      if (payload && job.type === "export")
        await tx.execute(
          sql`UPDATE mce_exports SET status = ${phase} WHERE id = ${str(payload.exportId)} AND status <> 'ready'`,
        );
      return retry ? "requeued" : "failed";
    });
    if (outcome) counts[outcome]++;
  }
  return counts;
}

// ---- Job handlers ----

const link = (path: string, token: string) => `${env().APP_URL}${path}#token=${token}`;

/** Send an email whose link token is minted now (fix 22); a definite failure releases it. */
async function sendWithToken(
  verificationId: number,
  build: (token: string) => OutgoingMail,
): Promise<void> {
  const minted = await mintEmailToken(verificationId);
  if (!minted) return; // used, expired or already minted by an earlier uncertain attempt
  try {
    await sendMail(build(minted.token));
  } catch (error) {
    if (!(error instanceof DeliveryUncertainError)) await releaseEmailToken(verificationId);
    throw error;
  }
}

async function profileDeleted(userId: number): Promise<boolean> {
  const [p] = await rows<{ deleted_at: string | null }>(
    sql`SELECT deleted_at FROM mce_profiles WHERE user_id = ${userId}`,
  );
  return !!p?.deleted_at;
}

async function mailJob(payload: Record<string, unknown>) {
  const mail = payload as unknown as MailPayload;
  if (await profileDeleted(Number(mail.userId))) return;
  const verificationId = Number(mail.data?.verificationId);
  const base = { to: mail.to, subject: mail.subject };
  if (mail.template === "reset-password") {
    // Better Auth keeps the reset token in the row identifier; rebuild the link from the row id.
    const [row] = await db()
      .select({ identifier: authVerifications.identifier, expiresAt: authVerifications.expiresAt })
      .from(authVerifications)
      .where(eq(authVerifications.id, verificationId));
    if (!row || row.expiresAt <= new Date() || !row.identifier.startsWith("reset-password:"))
      return;
    const token = row.identifier.slice("reset-password:".length);
    await sendMail({
      ...base,
      ...resetPasswordMail(mail.data.name, link("/dat-lai-mat-khau", token)),
    });
  } else if (mail.template === "verify-email") {
    await sendWithToken(verificationId, (token) => ({
      ...base,
      ...verifyEmailMail(mail.data.name, link("/xac-minh-email", token), !!mail.data.newEmail),
    }));
  } else throw new PermanentJobError("Unknown mail template");
}

const learnedOn = async (userId: number, date: string) =>
  (
    await rows(
      sql`SELECT user_id FROM mce_activities WHERE user_id = ${userId} AND local_date = ${date}`,
    )
  ).length > 0;

const setDelivery = (userId: number, date: string, status: string) =>
  db()
    .update(deliveries)
    .set({ status })
    .where(
      and(
        eq(deliveries.userId, userId),
        eq(deliveries.localDate, date),
        eq(deliveries.type, "reminder"),
      ),
    );

async function reminderJob(payload: Record<string, unknown>) {
  const userId = Number(payload.userId);
  const date = str(payload.localDate);
  const now = new Date();
  const due = await withTx(async (tx) => {
    const profile = await lockProfile(tx, userId, { allowDeleted: true, now });
    const [r] = await tx
      .select({ enabled: reminders.enabled })
      .from(reminders)
      .where(eq(reminders.userId, userId));
    return !!r?.enabled && !profile.deletedAt && localDay(profile, now) === date;
  });
  if (!due || (await learnedOn(userId, date))) {
    await setDelivery(userId, date, "skipped");
    return;
  }
  const [delivery] = await db()
    .select({ status: deliveries.status })
    .from(deliveries)
    .where(
      and(
        eq(deliveries.userId, userId),
        eq(deliveries.localDate, date),
        eq(deliveries.type, "reminder"),
      ),
    );
  if (!delivery || delivery.status === "sent") return;
  const [user] = await db().select({ email: users.email }).from(users).where(eq(users.id, userId));
  const verificationId = await withTx((tx) =>
    createEmailToken(tx, userId, "unsubscribe", { minutes: 60 * 24 * 30 }),
  );
  try {
    await sendWithToken(verificationId, (token) => ({
      to: user!.email,
      subject: "Một chút English hôm nay",
      ...reminderMail(`${env().APP_URL}/hoc`, link("/huy-nhac-hoc", token)),
    }));
  } catch (error) {
    // A retry creates its own token; drop this one unless the email may have gone out.
    if (!(error instanceof DeliveryUncertainError))
      await db().delete(authVerifications).where(eq(authVerifications.id, verificationId));
    throw error;
  }
  await setDelivery(userId, date, "sent");
}

/** Fix 23: the import runs as its actor, passed explicitly (no faked session). */
async function importJob(payload: Record<string, unknown>) {
  const actorId = Number(payload.actorId);
  const [actor] = await db()
    .select({ id: users.id, role: learningRoles.role })
    .from(users)
    .leftJoin(learningRoles, eq(learningRoles.userId, users.id))
    .where(eq(users.id, actorId));
  if (!actor) throw new Error("Import actor unavailable");
  const importId = str(payload.importId);
  await db().execute(
    sql`UPDATE mce_imports SET status = 'running' WHERE id = ${importId} AND status <> 'committed'`,
  );
  const role: Role = actor.role ?? "learner";
  await commitImport({ userId: actor.id, role, guestKey: null }, importId, true);
}

async function handle(job: JobRow, payload: Record<string, unknown>) {
  switch (job.type) {
    case "mail":
      return mailJob(payload);
    case "reminder":
      return reminderJob(payload);
    case "analytics":
      return sendAnalytics(payload as unknown as AnalyticsJob);
    case "export":
      return buildExport(str(payload.exportId), Number(payload.userId));
    case "import":
      return importJob(payload);
    case "delete_account":
      return eraseAccount(Number(payload.userId));
    default:
      throw new PermanentJobError("Unsupported job");
  }
}

export interface RunResult {
  processed: number;
  failed?: number;
  busy?: true;
  recovery?: Record<Recovery, number>;
}

/** Process up to `limit` due jobs. Returns `busy` when another worker holds the lock. */
export async function run(limit = 50): Promise<RunResult> {
  // A dedicated connection: the lock belongs to it, and the server frees it if we die.
  const lock = await createConnection({ uri: env().DATABASE_URL });
  try {
    const [[got]] = (await lock.query("SELECT GET_LOCK('mce_worker', 0) AS got")) as unknown as [
      { got: number }[],
    ];
    if (!Number(got?.got)) return { processed: 0, busy: true };
    let processed = 0;
    let failed = 0;
    try {
      const recovery = await recoverInterrupted();
      for (let i = 0; i < limit; i++) {
        const [job] = await rows<JobRow>(sql`
          SELECT id, type, payload, attempts FROM mce_jobs
          WHERE status = 'pending' AND available_at <= UTC_TIMESTAMP(3) ORDER BY id LIMIT 1`);
        if (!job) break;
        await db().execute(sql`
          UPDATE mce_jobs SET status = 'running', locked_at = UTC_TIMESTAMP(3),
            attempts = attempts + 1 WHERE id = ${job.id}`);
        const payload = decode(job.payload) ?? {};
        try {
          if (!decode(job.payload)) throw new PermanentJobError("Invalid payload");
          await handle(job, payload);
          await markDone(job.id);
          processed++;
        } catch (error) {
          failed++;
          const tries = job.attempts + 1;
          const uncertain = error instanceof DeliveryUncertainError;
          const permanent = error instanceof PermanentJobError;
          const message = uncertain
            ? "Delivery uncertain - manual reconciliation required"
            : permanent
              ? error.message.slice(0, 200)
              : `${error instanceof Error ? error.name : "Error"} - transport or job failed`;
          await db().execute(sql`
            UPDATE mce_jobs SET status = ${tries >= MAX_TRIES || uncertain || permanent ? "failed" : "pending"},
              available_at = ${later(backoffSeconds(tries))}, locked_at = NULL, last_error = ${message}
            WHERE id = ${job.id}`);
          if (job.type === "import") {
            await db().execute(
              sql`UPDATE mce_imports SET status = 'failed' WHERE id = ${str(payload.importId)} AND status <> 'committed'`,
            );
          }
          if (job.type === "export")
            await db().execute(
              sql`UPDATE mce_exports SET status = 'failed' WHERE id = ${str(payload.exportId)} AND status <> 'ready'`,
            );
          console.error(`Job ${job.id} (${job.type}) failed: ${message}`, error);
        }
      }
      return { processed, failed, recovery };
    } finally {
      await lock.query("SELECT RELEASE_LOCK('mce_worker')");
    }
  } finally {
    await lock.end();
  }
}

/**
 * Daily evaluation, run often (every few minutes): close streak days for every learner and queue
 * the reminder for learners whose local reminder hour has passed and who have not learned today.
 */
export async function tick(now = new Date()) {
  await db().execute(
    sql`DELETE FROM mce_journeys WHERE landed_at < ${new Date(now.getTime() - 90 * DAY_MS)}`,
  );
  const learners = await rows<{ user_id: number }>(
    sql`SELECT user_id FROM mce_profiles WHERE deleted_at IS NULL`,
  );
  let queued = 0;
  let errors = 0;
  for (const { user_id: userId } of learners) {
    // One learner with bad data must not stop the evaluation for everyone else.
    try {
      await withTx(async (tx) => {
        const p = await lockProfile(tx, userId, { allowDeleted: true, now });
        if (p.deletedAt) return;
        await updateStreak(tx, userId, p, false, now);
        if (!mailConfigured()) return;
        const [r] = await tx.select().from(reminders).where(eq(reminders.userId, userId));
        const [u] = await tx
          .select({ verified: users.emailVerified })
          .from(users)
          .where(eq(users.id, userId));
        if (!r?.enabled || !u?.verified) return;
        const date = localDay(p, now);
        const hour = Number(
          new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            hourCycle: "h23",
            timeZone: p.questTimezone,
          }).format(now),
        );
        if (hour < r.hour) return;
        const [learned] = (await tx.execute(
          sql`SELECT user_id FROM mce_activities WHERE user_id = ${userId} AND local_date = ${date}`,
        )) as unknown as [unknown[]];
        if (learned.length) return;
        const [inserted] = (await tx.execute(sql`
          INSERT IGNORE INTO mce_deliveries (user_id, local_date, type, status)
          VALUES (${userId}, ${date}, 'reminder', 'queued')`)) as unknown as [
          { affectedRows: number },
        ];
        if (!inserted.affectedRows) return;
        await tx.execute(sql`
          INSERT IGNORE INTO mce_jobs (type, payload, event_key, available_at)
          VALUES ('reminder', ${JSON.stringify({ userId, localDate: date })},
            ${`reminder:${userId}:${date}`}, ${now})`);
        queued++;
      });
    } catch (error) {
      errors++;
      console.error(`tick: learner ${userId} skipped`, error);
    }
  }
  return { learners: learners.length, remindersQueued: queued, errors };
}

/** Delete files older than `days` directly inside `dir` (never follows links or subfolders). */
async function pruneFiles(dir: string, days: number, match: (name: string) => boolean) {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    if (!match(name)) continue;
    const file = resolve(dir, name);
    const stat = await lstat(file);
    if (stat.isFile() && stat.mtimeMs < Date.now() - days * DAY_MS) {
      await rm(file);
      removed++;
    }
  }
  return removed;
}

/** Retention cleanup (nightly). */
export async function cleanup(now = new Date()) {
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
  await cleanupExports(now);
  await withTx(async (tx) => {
    await tx.execute(sql`
      DELETE i FROM mce_items i JOIN mce_attempts a ON a.id = i.attempt_id
      WHERE a.user_id IS NULL AND a.started_at < ${ago(30)}`);
    await tx.execute(
      sql`DELETE FROM mce_attempts WHERE user_id IS NULL AND started_at < ${ago(30)}`,
    );
    await tx.execute(sql`DELETE FROM auth_verifications WHERE expires_at < ${ago(7)}`);
    await tx.execute(sql`DELETE FROM auth_sessions WHERE expires_at < ${ago(7)}`);
    await tx.execute(sql`DELETE FROM mce_jobs WHERE status = 'done' AND created_at < ${ago(30)}`);
    // Fix 16: only failed jobs expire. Pending work is never dropped silently.
    await tx.execute(sql`
      UPDATE mce_jobs SET status = 'expired', payload = '{}',
        last_error = 'Payload expired under retention policy'
      WHERE status = 'failed' AND created_at < ${ago(7)}`);
    // Fix 9: limiter windows are at most 1 hour, so day-old rows are dead.
    await tx.execute(sql`DELETE FROM rate_limits WHERE window_started_at < ${ago(1)}`);
  });
  const writable = resolve(process.cwd(), env().WRITABLE_DIR);
  const files = {
    mail: await pruneFiles(resolve(writable, "mail"), 7, () => true),
    cache: await pruneFiles(resolve(writable, "cache"), 1, () => true),
    backups: await pruneFiles(
      resolve(writable, "backups"),
      30,
      (name) => /^backup-.*\.sql$/.test(name) || /^media-.*\.tar\.gz$/.test(name),
    ),
  };
  const [stale] = await rows<{ n: number }>(sql`
    SELECT COUNT(*) AS n FROM mce_jobs
    WHERE status = 'pending' AND available_at < ${new Date(now.getTime() - 3_600_000)}`);
  const stalePending = Number(stale?.n ?? 0);
  return { files, stalePending };
}

/** Rebuild every balance projection from the ledger. */
export async function reconcile() {
  const ids = await db()
    .select({ id: users.id })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(isNull(profiles.deletedAt));
  for (const { id } of ids)
    await withTx(async (tx) => {
      await lockProfile(tx, id);
      await reconcileBalances(tx, id);
    });
  return { users: ids.length };
}
