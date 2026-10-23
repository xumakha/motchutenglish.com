import "server-only";
import { basename, extname } from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { db } from "@/db/client";
import {
  attempts,
  lessons,
  media,
  mediaRefs,
  paths,
  reviewCards,
  settings,
  versions,
  vocabulary,
} from "@/db/schema";
import { AppError } from "@/server/errors";
import { isStaff, requireStaff, type Actor } from "../actor";
import { field, randomHex, text } from "../php";
import { storage } from "./storage";

// Port of Content::upload and the /media/{id} visibility rules (Product::media).

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Detected MIME → allowed extensions. SVG is never accepted. */
const ALLOWED: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "audio/mpeg": ["mp3"],
  "audio/ogg": ["ogg"],
  "audio/wav": ["wav"],
};

export interface Upload {
  name: string;
  bytes: Uint8Array;
}

/** Store an upload after checking its real type and extension. The caller rate-limits uploads. */
export async function uploadMedia(
  actor: Actor,
  file: Upload,
  data: { alt?: unknown; source?: unknown; license?: unknown },
): Promise<number> {
  const uid = requireStaff(actor);
  if (!file.bytes.length || file.bytes.length > MAX_UPLOAD_BYTES)
    throw new AppError(422, "Tệp không hợp lệ hoặc vượt quá 10 MB.");
  const detected = await fileTypeFromBuffer(file.bytes);
  // "image/apng" is a PNG; Ogg Opus reports "audio/ogg; codecs=opus".
  const mime = detected?.mime === "image/apng" ? "image/png" : detected?.mime.split(";")[0];
  const ext = extname(file.name).slice(1).toLowerCase();
  if (!mime || !ALLOWED[mime]?.includes(ext))
    throw new AppError(
      422,
      "Chỉ nhận JPG, PNG, WebP, MP3, OGG hoặc WAV đúng MIME. Không nhận SVG.",
    );
  const alt = field("alt", () => text(data.alt ?? "", 500));
  const source = field("source", () => text(data.source ?? "", 2000));
  const license = field("license", () => text(data.license ?? "", 500));

  const key = `${randomHex(20)}.${ext}`;
  await storage().put(key, file.bytes);
  try {
    const [created] = await db()
      .insert(media)
      .values({
        storageKey: key,
        filename: [...basename(file.name)].slice(0, 200).join(""),
        mime,
        bytes: file.bytes.length,
        altText: alt,
        source,
        licenseText: license,
        uploaderId: uid,
      })
      .$returningId();
    return created!.id;
  } catch (error) {
    await storage().delete(key);
    throw error;
  }
}

async function exists(query: Promise<unknown[]>) {
  return (await query).length > 0;
}

/**
 * May this visitor fetch the file? Public: logo/favicon, audio of published vocabulary, images
 * of published paths, audio in a current published lesson. Signed-in: audio in their review
 * cards or in a version they have an attempt on. Staff: everything.
 */
export async function canViewMedia(actor: Actor, mediaId: number): Promise<boolean> {
  if (isStaff(actor)) return true;
  const q = db();
  if (
    await exists(
      q
        .select({ name: settings.name })
        .from(settings)
        .where(
          and(
            inArray(settings.name, ["logo_media_id", "favicon_media_id"]),
            eq(settings.value, String(mediaId)),
          ),
        ),
    )
  )
    return true;
  if (
    await exists(
      q
        .select({ id: vocabulary.id })
        .from(vocabulary)
        .where(and(eq(vocabulary.audioId, mediaId), eq(vocabulary.status, "published")))
        .limit(1),
    )
  )
    return true;
  if (
    await exists(
      q
        .select({ id: paths.id })
        .from(paths)
        .where(and(eq(paths.imageId, mediaId), eq(paths.status, "published")))
        .limit(1),
    )
  )
    return true;
  if (
    await exists(
      q
        .select({ id: lessons.id })
        .from(mediaRefs)
        .innerJoin(lessons, eq(lessons.currentVersion, mediaRefs.versionId))
        .innerJoin(versions, eq(versions.id, mediaRefs.versionId))
        .where(
          and(
            eq(mediaRefs.mediaId, mediaId),
            eq(versions.status, "published"),
            eq(lessons.archived, false),
          ),
        )
        .limit(1),
    )
  )
    return true;
  if (actor.userId === null) return false;
  if (
    await exists(
      q
        .select({ id: reviewCards.id })
        .from(reviewCards)
        .where(
          and(
            eq(reviewCards.userId, actor.userId),
            sql`JSON_VALUE(${reviewCards.snapshot}, '$.audioId') = ${mediaId}`,
          ),
        )
        .limit(1),
    )
  )
    return true;
  return exists(
    q
      .select({ id: attempts.id })
      .from(attempts)
      .innerJoin(mediaRefs, eq(mediaRefs.versionId, attempts.versionId))
      .where(and(eq(attempts.userId, actor.userId), eq(mediaRefs.mediaId, mediaId)))
      .limit(1),
  );
}

/** The media row a visitor may fetch, or a 404 that does not reveal whether it exists. */
export async function mediaForViewer(actor: Actor, mediaId: number) {
  const [row] = await db().select().from(media).where(eq(media.id, mediaId));
  if (!row || !(await canViewMedia(actor, mediaId)) || !(await storage().exists(row.storageKey)))
    throw new AppError(404, "Không tìm thấy tệp.");
  return row;
}
