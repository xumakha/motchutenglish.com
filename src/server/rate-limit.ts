import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { AppError } from "./errors";

// Fixed-window limiter backed by the rate_limits table (port of mce_limit). The window resets in
// the same statement that counts, so concurrent requests cannot all slip through a stale read.

export const TOO_FAST = "Bạn thao tác quá nhanh. Vui lòng thử lại sau.";

export interface LimitRule {
  max: number;
  windowSeconds: number;
}

export const limitKey = (...parts: (string | number)[]) =>
  createHash("sha256").update(parts.join(":")).digest("hex");

interface WindowRow {
  count: number;
  elapsed: number;
}

async function readWindow(key: string, windowSeconds: number): Promise<WindowRow> {
  const [rows] = (await db().execute(
    sql`SELECT count, TIMESTAMPDIFF(SECOND, window_started_at, UTC_TIMESTAMP(3)) AS elapsed
        FROM rate_limits WHERE \`key\` = ${key}`,
  )) as unknown as [{ count: number; elapsed: number }[]];
  const row = rows[0];
  if (!row || row.elapsed >= windowSeconds) return { count: 0, elapsed: 0 };
  return { count: Number(row.count), elapsed: Number(row.elapsed) };
}

/**
 * Add one hit to the window, starting a new window if the old one expired, and return this hit's
 * position in the window. LAST_INSERT_ID(expr) makes the statement report the count it wrote, so
 * concurrent hits each see their own number without a second (racy) read. MariaDB applies the
 * assignments left to right, so `count = 1` below sees the new count (1 only for a fresh window).
 */
async function hit(key: string, windowSeconds: number): Promise<number> {
  const result = await db().execute(sql`
    INSERT INTO rate_limits (\`key\`, count, window_started_at)
    VALUES (${key}, LAST_INSERT_ID(1), UTC_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE
      count = LAST_INSERT_ID(
        IF(window_started_at <= UTC_TIMESTAMP(3) - INTERVAL ${windowSeconds} SECOND, 1, count + 1)),
      window_started_at = IF(count = 1, UTC_TIMESTAMP(3), window_started_at)`);
  const header = (Array.isArray(result) ? result[0] : result) as { insertId?: number };
  return Number(header.insertId ?? 0);
}

/**
 * Count this request and reject it once the window is full. Returns seconds until the window
 * frees up when rejected.
 */
export async function consume(
  key: string,
  { max, windowSeconds }: LimitRule,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const count = await hit(key, windowSeconds);
  if (count <= max) return { allowed: true, retryAfter: 0 };
  const { elapsed } = await readWindow(key, windowSeconds);
  return { allowed: false, retryAfter: Math.max(1, windowSeconds - elapsed) };
}

/** Throw 429 when the scope is over its limit (mce_limit). */
export async function limit(scope: string, subject: string, rule: LimitRule): Promise<void> {
  const { allowed } = await consume(limitKey(scope, subject), rule);
  if (!allowed) throw new AppError(429, TOO_FAST);
}

/**
 * Failure-only counters (fix 8: login lockouts count failed attempts, not successes).
 */
export const failures = {
  async blocked(key: string, { max, windowSeconds }: LimitRule) {
    const { count, elapsed } = await readWindow(key, windowSeconds);
    return count >= max ? windowSeconds - elapsed : 0;
  },
  async record(key: string, rule: LimitRule) {
    await hit(key, rule.windowSeconds);
  },
  async clear(key: string) {
    await db().execute(sql`DELETE FROM rate_limits WHERE \`key\` = ${key}`);
  },
};
