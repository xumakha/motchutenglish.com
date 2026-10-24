import { resolve } from "node:path";
import { exportChunks } from "@/domain/exports/exports";
import { requireStaff, requireUserId } from "@/domain/actor";
import { audit } from "@/domain/content/shared";
import { withTx } from "@/db/tx";
import { currentActor } from "@/server/actor";
import { AppError } from "@/server/errors";
import { chunksToStream, fileResponse } from "@/server/files";

// /du-lieu/{file}: import templates (staff), a direct personal export and a direct content
// export (staff). Background exports are downloaded from /du-lieu/export-file/{id}.

const TEMPLATES: Record<string, string> = {
  "template-lesson": "lesson.json",
  "template-import": "import.json",
  "template-exercises": "all-exercises.json",
  "template-csv": "vocabulary.csv",
  "template-paths": "paths.json",
  "template-units": "units.json",
  "template-articles": "articles.json",
  "template-vocabulary_sets": "vocabulary_sets.json",
};

const PRIVATE = { "Cache-Control": "no-store, private" };

export async function GET(_request: Request, ctx: RouteContext<"/du-lieu/[file]">) {
  const what = (await ctx.params).file;
  try {
    const actor = await currentActor();
    if (what.startsWith("template-")) {
      requireStaff(actor);
      const file = TEMPLATES[what];
      if (!file) throw new AppError(404, "Không tìm thấy mẫu.");
      return fileResponse(resolve(process.cwd(), "templates", file), {
        ...PRIVATE,
        "Content-Type": `${file.endsWith(".csv") ? "text/csv" : "application/json"}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${file}"`,
      });
    }
    if (what !== "export" && what !== "content-export")
      throw new AppError(404, "Không tìm thấy tệp.");
    const kind = what === "export" ? "personal" : "content";
    const userId = kind === "personal" ? requireUserId(actor) : requireStaff(actor);
    await withTx((tx) =>
      audit(
        tx,
        actor,
        kind === "personal" ? "personal_export" : "content_export",
        kind === "personal" ? `user:${userId}` : "catalog",
      ),
    );
    return new Response(chunksToStream(exportChunks(kind, userId)), {
      headers: {
        ...PRIVATE,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${kind === "personal" ? "my-learning.json" : "content.json"}"`,
      },
    });
  } catch (error) {
    if (!(error instanceof AppError)) console.error("Download failed", error);
    return new Response("Không thể xuất dữ liệu.", {
      status: error instanceof AppError ? error.status : 503,
      headers: { ...PRIVATE, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
