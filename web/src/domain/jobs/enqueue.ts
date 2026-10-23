import "server-only";
import { sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { affectedRows } from "@/db/tx";
import type { JobType } from "@/db/schema";

// Queue writes shared by every domain module. The worker (Phase 6) runs the jobs; enqueueing
// never means delivered.

export interface MailPayload {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
}

/** INSERT IGNORE on event_key: returns false when the same event was already queued. */
export async function enqueue(
  type: JobType,
  eventKey: string,
  payload: Record<string, unknown>,
  tx?: Tx,
): Promise<boolean> {
  const result = await (tx ?? db()).execute(sql`
    INSERT IGNORE INTO mce_jobs (type, payload, event_key, available_at)
    VALUES (${type}, ${JSON.stringify(payload)}, ${eventKey}, UTC_TIMESTAMP(3))`);
  return affectedRows(result) > 0;
}

export const enqueueMail = (eventKey: string, mail: MailPayload, tx?: Tx) =>
  enqueue("mail", eventKey, { ...mail }, tx);
