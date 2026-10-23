import "server-only";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { affectedRows } from "@/db/tx";

/**
 * Record a product event once per key (port of mce_event's insert). Returns false when the event
 * already happened. Funnel and GA4 forwarding hook in here in Phase 3.
 */
export async function recordEvent(
  key: string,
  type: string,
  resourceId: string,
  userId: number | null,
  tx?: Tx,
): Promise<boolean> {
  const id = randomBytes(16).toString("hex");
  const result = await (tx ?? db()).execute(sql`
    INSERT IGNORE INTO mce_events (id, event_key, user_id, type, resource_id, occurred_at)
    VALUES (${id}, ${key}, ${userId}, ${type}, ${resourceId}, UTC_TIMESTAMP(3))`);
  return affectedRows(result) > 0;
}
