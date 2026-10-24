import { mediaForViewer } from "@/domain/media/media";
import { storage } from "@/domain/media/storage";
import { currentActor } from "@/server/actor";
import { AppError } from "@/server/errors";
import { parseRange, toWebStream } from "@/server/files";

// /media/{id}: uploaded images and audio, visible per the rules in domain/media/media.ts.
// Fix 11: supports HTTP Range (audio seeking) and ETag revalidation. Files never change after
// upload, so the ETag is the id plus size.
export async function GET(request: Request, ctx: RouteContext<"/media/[id]">) {
  const id = Number((await ctx.params).id);
  try {
    if (!Number.isInteger(id) || id <= 0) throw new AppError(404, "Không tìm thấy tệp.");
    const media = await mediaForViewer(await currentActor(), id);
    const size = await storage().size(media.storageKey);
    const etag = `"m${media.id}-${size}"`;
    const base = {
      "Content-Type": media.mime,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
      ETag: etag,
    };
    if (request.headers.get("if-none-match") === etag)
      return new Response(null, { status: 304, headers: base });
    const range = parseRange(request.headers.get("range"), size);
    if (range === "invalid")
      return new Response(null, {
        status: 416,
        headers: { ...base, "Content-Range": `bytes */${size}` },
      });
    if (range)
      return new Response(toWebStream(storage().stream(media.storageKey, range)), {
        status: 206,
        headers: {
          ...base,
          "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
          "Content-Length": String(range.end - range.start + 1),
        },
      });
    return new Response(toWebStream(storage().stream(media.storageKey)), {
      headers: { ...base, "Content-Length": String(size) },
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: error.status });
    throw error;
  }
}
