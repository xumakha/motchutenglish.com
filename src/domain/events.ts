import "server-only";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { affectedRows } from "@/db/tx";
import type { MarketingSession } from "./actor";
import { enqueueAnalytics, noMarketing, recordFunnel } from "./analytics/marketing";

/**
 * Record a product event once per key (port of mce_event). A new event also advances the
 * consented marketing funnel and, for signed-in users, queues it for GA4. Returns false when the
 * event already happened.
 */
export async function recordEvent(
  key: string,
  type: string,
  resourceId: string,
  userId: number | null,
  tx?: Tx,
  marketing: MarketingSession = noMarketing,
): Promise<boolean> {
  const q = tx ?? db();
  const id = randomBytes(16).toString("hex");
  const at = new Date();
  const result = await q.execute(sql`
    INSERT IGNORE INTO mce_events (id, event_key, user_id, type, resource_id, occurred_at)
    VALUES (${id}, ${key}, ${userId}, ${type}, ${resourceId}, ${at})`);
  if (!affectedRows(result)) return false;
  await recordFunnel(q, userId, type, resourceId, at, marketing);
  if (userId !== null) await enqueueAnalytics(q, id, userId, type, resourceId, at);
  return true;
}
