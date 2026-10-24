import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { audit as auditLog, media, redirects } from "@/db/schema";
import { AppError } from "@/server/errors";
import type { Actor } from "../actor";
import type { AudioCheck, LessonDocument } from "../assessment/types";
import { storage } from "../media/storage";

/** Content::slug */
export function slug(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 150)
    throw new AppError(422, "Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang.");
  return value;
}

/** Content::redirect: record old → new and collapse chains so no redirect points at another. */
export async function addRedirect(tx: Tx, oldPath: string, newPath: string): Promise<void> {
  if (oldPath === newPath) return;
  await tx.delete(redirects).where(eq(redirects.oldPath, newPath));
  await tx.update(redirects).set({ newPath }).where(eq(redirects.newPath, oldPath));
  await tx
    .insert(redirects)
    .values({ oldPath, newPath })
    .onDuplicateKeyUpdate({ set: { newPath } });
}

/** mce_audit. Catalog caches are invalidated by the calling action with updateTag('catalog'). */
export async function audit(
  tx: Tx,
  actor: Actor,
  action: string,
  target: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await tx
    .insert(auditLog)
    .values({ actorId: actor.userId, action, target, details, occurredAt: new Date() });
}

/** A licensed audio file that exists in storage (Assessment's listening/audio checks). */
export const audioOk: AudioCheck = async (mediaId) => {
  if (!mediaId) return false;
  const [m] = await db().select().from(media).where(eq(media.id, mediaId));
  return (
    !!m && m.mime.startsWith("audio/") && !!m.licenseText && (await storage().exists(m.storageKey))
  );
};

/** Media ids a lesson document plays (audio blocks and listening exercises). */
export function documentMediaIds(doc: LessonDocument): number[] {
  const ids = new Set<number>();
  for (const b of doc.blocks) if (b.audioId) ids.add(Number(b.audioId));
  for (const e of doc.exercises) if (e.payload.audioId) ids.add(Number(e.payload.audioId));
  return [...ids].filter((id) => Number.isInteger(id) && id > 0);
}

/** PHP (int) cast for form values: "12" → 12, "12abc" → 12, "abc" → 0, true → 1. */
export function phpInt(v: unknown): number {
  if (typeof v === "number") return Math.trunc(v);
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const m = /^\s*[+-]?\d+/.exec(v);
    return m ? Number.parseInt(m[0], 10) : 0;
  }
  return 0;
}

/** Raw stored JSON text of a document column, for stale-edit hashes (sha256 of exactly this). */
export async function rawDocument(
  tx: Tx,
  table: "mce_versions" | "mce_entity_drafts" | "mce_article_versions",
  id: number,
): Promise<string | null> {
  const [rows] = (await tx.execute(
    sql`SELECT document FROM ${sql.raw(table)} WHERE id = ${id} FOR UPDATE`,
  )) as unknown as [{ document: string }[]];
  return rows[0]?.document ?? null;
}
