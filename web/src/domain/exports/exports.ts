import "server-only";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { exports as exportsTable, learningRoles, profiles } from "@/db/schema";
import { withTx } from "@/db/tx";
import { env } from "@/env";
import { AppError, conflict, invalid } from "@/server/errors";
import { requireStaff, requireUserId, type Actor } from "../actor";
import { audit } from "../content/shared";
import { enqueue } from "../jobs/enqueue";
import { lockProfile } from "../motivation/profile";
import { hexKey, randomHex } from "../php";

// Port of application/libraries/Exports.php: personal data and content exports, built by the
// worker into private files that expire after 24 hours and only their owner can download.

export type ExportKind = "personal" | "content";
const FILE = /^[a-f0-9]{32}\.json$/;

const exportsDir = () => resolve(process.cwd(), env().WRITABLE_DIR, "exports");

export function exportPath(fileKey: string): string {
  if (!FILE.test(fileKey)) throw new AppError(404, "Không tìm thấy tệp.");
  return join(exportsDir(), fileKey);
}

/** Queue an export. The request key makes repeats safe; the caller applies the 5/hour limit. */
export async function requestExport(actor: Actor, kind: unknown, requestKey: unknown) {
  const userId = requireUserId(actor);
  if (kind !== "personal" && kind !== "content") throw invalid("Loại bản xuất không hợp lệ.");
  if (kind === "content") requireStaff(actor);
  const id = hexKey(requestKey);
  await withTx(async (tx) => {
    await lockProfile(tx, userId);
    const [old] = await tx.select().from(exportsTable).where(eq(exportsTable.id, id));
    if (old) {
      if (old.userId !== userId || old.kind !== kind) throw conflict("Mã yêu cầu đã được sử dụng.");
      return;
    }
    await tx
      .insert(exportsTable)
      .values({ id, userId, kind, expiresAt: new Date(Date.now() + 86_400_000) });
    await enqueue("export", `export:${id}`, { userId, exportId: id }, tx);
    await audit(tx, actor, "export_requested", kind);
  });
}

const PERSONAL_TABLES = [
  "profiles",
  "enrollments",
  "progress",
  "attempts",
  "user_vocabulary",
  "review_cards",
  "review_events",
  "activities",
  "quests",
  "streak_state",
  "streak_calendar",
  "badges",
  "inventory",
  "purchases",
  "consents",
  "cohorts",
  "active_time",
  "journeys",
];
const CONTENT_TABLES = [
  "paths",
  "units",
  "lessons",
  "vocabulary",
  "vocabulary_sets",
  "vocabulary_set_items",
  "articles",
];

function queries(kind: ExportKind, userId: number): [string, string, unknown[]][] {
  if (kind === "content")
    return [
      ...CONTENT_TABLES.map((t): [string, string, unknown[]] => [t, `SELECT * FROM mce_${t}`, []]),
      [
        "versions",
        "SELECT id, lesson_id, title, document, status, created_at, published_at FROM mce_versions",
        [],
      ],
      [
        "media",
        "SELECT id, storage_key, filename, mime, bytes, alt_text, source, license_text FROM mce_media",
        [],
      ],
    ];
  return [
    ["user", "SELECT id, name, email, created_at FROM users WHERE id = ?", [userId]],
    // Test answers stay hidden until the test is finished, even in an export.
    [
      "answers",
      `SELECT i.attempt_id, i.exercise_id, i.response, i.first_response, i.state,
         CASE WHEN a.mode = 'test' AND a.status <> 'finished' THEN NULL ELSE i.grading END AS grading
       FROM mce_items i JOIN mce_attempts a ON a.id = i.attempt_id WHERE a.user_id = ?`,
      [userId],
    ],
    [
      "legacy_attempts",
      "SELECT id, lesson_id, response, score, submitted_at FROM learning_attempts WHERE user_id = ?",
      [userId],
    ],
    ["reminders", "SELECT enabled, hour FROM mce_reminders WHERE user_id = ?", [userId]],
    [
      "rewards",
      "SELECT currency, amount, event_key, rule_version, created_at FROM reward_ledger WHERE user_id = ?",
      [userId],
    ],
    ...PERSONAL_TABLES.map((t): [string, string, unknown[]] => [
      t,
      `SELECT * FROM mce_${t} WHERE user_id = ?`,
      [userId],
    ]),
  ];
}

async function deleted(userId: number) {
  const [p] = await db()
    .select({ deletedAt: profiles.deletedAt })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  return !!p?.deletedAt;
}

/**
 * Worker job: stream every row into a new private file (rows are never all held in memory).
 * A partial file is removed on failure; a file for an account deleted meanwhile is discarded.
 */
export async function buildExport(exportId: string, userId: number): Promise<void> {
  const [e] = await db()
    .select()
    .from(exportsTable)
    .where(and(eq(exportsTable.id, exportId), eq(exportsTable.userId, userId)));
  if (!e || e.status === "ready" || e.expiresAt <= new Date() || (await deleted(userId))) return;
  if (e.kind === "content") {
    const [role] = await db()
      .select({ role: learningRoles.role })
      .from(learningRoles)
      .where(eq(learningRoles.userId, userId));
    if (!role) throw new AppError(403, "Quyền xuất nội dung đã bị thu hồi.");
  }
  if (e.fileKey) await rm(exportPath(e.fileKey), { force: true });

  const fileKey = `${randomHex(16)}.json`;
  const path = exportPath(fileKey);
  await mkdir(exportsDir(), { recursive: true, mode: 0o700 });
  await db()
    .update(exportsTable)
    .set({ status: "running", fileKey })
    .where(eq(exportsTable.id, exportId));
  const out = createWriteStream(path, { flags: "wx", mode: 0o600 });
  const write = async (s: string) => {
    if (!out.write(s)) await once(out, "drain");
  };
  try {
    await write(`{"schemaVersion":1,"kind":${JSON.stringify(e.kind)}`);
    for (const [name, query, params] of queries(e.kind, userId)) {
      await write(`,${JSON.stringify(name)}:[`);
      let first = true;
      for await (const row of pool().query(query, params).stream()) {
        await write((first ? "" : ",") + JSON.stringify(row));
        first = false;
      }
      await write("]");
    }
    await write("}");
    out.end();
    await once(out, "finish");
  } catch (error) {
    out.destroy();
    await rm(path, { force: true });
    throw error;
  }
  if (await deleted(userId)) {
    await rm(path, { force: true });
    return;
  }
  await db()
    .update(exportsTable)
    .set({ status: "ready", fileKey })
    .where(eq(exportsTable.id, exportId));
}

/** The file a learner may download: theirs, ready and not expired (content needs staff). */
export async function exportForDownload(actor: Actor, fileKey: string) {
  const userId = requireUserId(actor);
  const [e] = await db().select().from(exportsTable).where(eq(exportsTable.fileKey, fileKey));
  if (!e || e.userId !== userId || e.status !== "ready" || e.expiresAt <= new Date())
    throw new AppError(404, "Không tìm thấy tệp.");
  if (e.kind === "content") requireStaff(actor);
  return { path: exportPath(fileKey), kind: e.kind };
}

export async function deleteExportsFor(userId: number) {
  const rows = await db().select().from(exportsTable).where(eq(exportsTable.userId, userId));
  for (const e of rows) if (e.fileKey) await rm(exportPath(e.fileKey), { force: true });
  await db().delete(exportsTable).where(eq(exportsTable.userId, userId));
}

/** Worker cleanup: expired exports and their files. */
export async function cleanupExports(now = new Date()) {
  const rows = await db()
    .select()
    .from(exportsTable)
    .where(sql`${exportsTable.expiresAt} < ${now}`);
  for (const e of rows) {
    if (e.fileKey) await rm(exportPath(e.fileKey), { force: true });
    await db().delete(exportsTable).where(eq(exportsTable.id, e.id));
  }
}
