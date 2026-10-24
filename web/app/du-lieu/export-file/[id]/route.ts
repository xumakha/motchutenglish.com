import { exportForDownload } from "@/domain/exports/exports";
import { currentActor } from "@/server/actor";
import { AppError } from "@/server/errors";
import { fileResponse } from "@/server/files";

// A finished background export, for its owner only, until it expires.
export async function GET(_request: Request, ctx: RouteContext<"/du-lieu/export-file/[id]">) {
  try {
    const file = await exportForDownload(await currentActor(), (await ctx.params).id);
    return await fileResponse(file.path, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="motchutenglish-${file.kind}.json"`,
      "Cache-Control": "no-store, private",
    });
  } catch (error) {
    if (!(error instanceof AppError)) console.error("Export download failed", error);
    return new Response(error instanceof AppError ? error.message : "Chưa thể tải tệp.", {
      status: error instanceof AppError ? error.status : 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, private",
      },
    });
  }
}
