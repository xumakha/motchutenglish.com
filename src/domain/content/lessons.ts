import "server-only";
import { and, asc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { lessons, mediaRefs, paths, units, versions } from "@/db/schema";
import { withTx } from "@/db/tx";
import { AppError, conflict, invalid } from "@/server/errors";
import { requireStaff, type Actor } from "../actor";
import type { Exercise, LessonDocument } from "../assessment/types";
import { validateDocument } from "../assessment/validate";
import { isObject, safeEqual, sha256, text } from "../php";
import { indexVersion } from "./search";
import { addRedirect, audioOk, audit, documentMediaIds, phpInt, rawDocument, slug } from "./shared";

// Lesson versions and their workflow (Content::saveVersion, Content::workflow, paths, lessons).
// draft → in_review → published; publishing points the lesson at the version. Fix 5: editing an
// existing draft needs the hash of the document the editor loaded.

export type WorkflowAction = "review" | "publish" | "return" | "archive" | "restore";

export interface SaveVersionInput {
  title: unknown;
  document: unknown;
  lessonId?: unknown;
  versionId?: unknown;
  unitId?: unknown;
  subtype?: unknown;
  slug?: unknown;
  sortOrder?: unknown;
  externalKey?: unknown;
  /** sha256 of the stored draft document, required when versionId is set (fix 5). */
  expected?: unknown;
}

/** Hash an editor must send back when saving an existing draft version. */
export async function versionHash(versionId: number): Promise<string | null> {
  return withTx(async (tx) => {
    const raw = await rawDocument(tx, "mce_versions", versionId);
    return raw === null ? null : sha256(raw);
  });
}

/** Exercise contentVersion: unchanged exercises keep the published number, changed ones +1. */
function bumpContentVersions(doc: LessonDocument, published: LessonDocument) {
  const previous = new Map(published.exercises.map((e) => [e.id, e]));
  const strip = ({ contentVersion: _v, ...rest }: Exercise) => JSON.stringify(rest);
  for (const exercise of doc.exercises) {
    const old = previous.get(exercise.id);
    if (!old) continue;
    exercise.contentVersion = old.contentVersion + (strip(old) === strip(exercise) ? 0 : 1);
  }
}

export async function saveVersion(actor: Actor, input: SaveVersionInput): Promise<number> {
  const uid = requireStaff(actor);
  const title = text(input.title, 200);
  if (!isObject(input.document)) throw invalid("Document phải là JSON object.");
  const document = structuredClone(input.document) as unknown as LessonDocument;
  await validateDocument(document as never, { audioOk });

  return withTx(async (tx) => {
    let lessonId = phpInt(input.lessonId);
    if (!lessonId) {
      const unitId = phpInt(input.unitId);
      const [unit] = await tx.select({ id: units.id }).from(units).where(eq(units.id, unitId));
      if (!unit) throw invalid("Chọn chương hợp lệ.");
      const subtype = input.subtype ?? "lesson";
      if (subtype !== "lesson" && subtype !== "checkpoint" && subtype !== "placement")
        throw invalid("Loại bài không hợp lệ.");
      const [created] = await tx
        .insert(lessons)
        .values({
          unitId,
          slug: slug(input.slug ?? ""),
          subtype,
          sortOrder: phpInt(input.sortOrder),
          externalKey: typeof input.externalKey === "string" ? input.externalKey : null,
        })
        .$returningId();
      lessonId = created!.id;
    } else {
      const [existing] = await tx
        .select()
        .from(lessons)
        .where(eq(lessons.id, lessonId))
        .for("update");
      if (!existing) throw new AppError(404, "Không tìm thấy bài.");
      document.slug = slug(input.slug ?? existing.slug);
      if (existing.currentVersion) {
        const [published] = await tx
          .select({ document: versions.document })
          .from(versions)
          .where(eq(versions.id, existing.currentVersion));
        if (published) bumpContentVersions(document, published.document);
      }
    }

    let versionId = phpInt(input.versionId);
    if (versionId) {
      const [v] = await tx
        .select()
        .from(versions)
        .where(and(eq(versions.id, versionId), eq(versions.lessonId, lessonId)))
        .for("update");
      if (!v || v.status !== "draft")
        throw conflict("Chỉ sửa trực tiếp bản nháp. Hãy tạo bản nháp mới từ bản đã xuất bản.");
      const raw = await rawDocument(tx, "mce_versions", versionId);
      if (!raw || typeof input.expected !== "string" || !safeEqual(sha256(raw), input.expected))
        throw conflict("Bản nháp đã thay đổi. Tải lại trước khi sửa.");
      await tx.update(versions).set({ title, document }).where(eq(versions.id, versionId));
    } else {
      const [created] = await tx
        .insert(versions)
        .values({ lessonId, title, document, authorId: uid })
        .$returningId();
      versionId = created!.id;
    }
    await audit(tx, actor, "draft_saved", `version:${versionId}`);
    return versionId;
  });
}

export async function lessonWorkflow(actor: Actor, versionId: number, action: WorkflowAction) {
  requireStaff(actor, action !== "review");
  await withTx(async (tx) => {
    const [v] = await tx.select().from(versions).where(eq(versions.id, versionId)).for("update");
    if (!v) throw new AppError(404, "Không tìm thấy phiên bản.");

    if (action === "review") {
      if (v.status !== "draft") throw conflict("Chỉ gửi duyệt bản nháp.");
      await validateDocument(v.document as never, { audioOk });
      await tx.update(versions).set({ status: "in_review" }).where(eq(versions.id, versionId));
    } else if (action === "publish") {
      if (v.status === "published") return;
      if (v.status !== "in_review") throw conflict("Hãy gửi duyệt trước khi xuất bản.");
      const doc = v.document;
      await validateDocument(doc as never, { publishing: true, audioOk });
      const [lesson] = await tx
        .select({ slug: lessons.slug, subtype: lessons.subtype })
        .from(lessons)
        .where(eq(lessons.id, v.lessonId))
        .for("update");
      if (!lesson) throw new AppError(404, "Không tìm thấy bài.");
      await checkBlueprint(lesson.subtype, doc);
      if (doc.slug !== undefined && doc.slug !== lesson.slug) {
        const next = slug(doc.slug);
        await tx.update(lessons).set({ slug: next }).where(eq(lessons.id, v.lessonId));
        await addRedirect(tx, `/bai-hoc/${lesson.slug}`, `/bai-hoc/${next}`);
      }
      await tx
        .update(versions)
        .set({ status: "published", publishedAt: new Date() })
        .where(eq(versions.id, versionId));
      await tx
        .update(lessons)
        .set({ currentVersion: versionId, archived: false })
        .where(eq(lessons.id, v.lessonId));
      // Fix 10: store the version's text for the search index.
      await indexVersion(tx, versionId, v.title, doc);
      // Fix 11: remember which media this published version plays.
      const mediaIds = documentMediaIds(doc);
      if (mediaIds.length)
        await tx
          .insert(mediaRefs)
          .ignore()
          .values(mediaIds.map((mediaId) => ({ mediaId, versionId })));
    } else if (action === "archive") {
      await tx.update(lessons).set({ archived: true }).where(eq(lessons.id, v.lessonId));
    } else if (action === "restore") {
      if (v.status !== "published") throw invalid("Chỉ khôi phục bản đã xuất bản.");
      await tx
        .update(lessons)
        .set({ archived: false, currentVersion: versionId })
        .where(eq(lessons.id, v.lessonId));
    } else if (action === "return") {
      if (v.status !== "in_review") throw conflict("Phiên bản chưa được gửi duyệt.");
      await tx.update(versions).set({ status: "draft" }).where(eq(versions.id, versionId));
    } else {
      throw new AppError(422, "Trạng thái không hợp lệ.", { status: "Trạng thái không hợp lệ." });
    }
    await audit(tx, actor, action, `version:${versionId}`);
  });
}

async function checkBlueprint(subtype: string, doc: LessonDocument) {
  if (subtype === "checkpoint") {
    const ids = doc.blueprint?.questionIds;
    const exerciseIds = new Set(doc.exercises.map((e) => e.id));
    const objective = doc.exercises.some((e) => e.type !== "self" && e.type !== "flashcard");
    if (!Array.isArray(ids) || !ids.length || ids.some((id) => !exerciseIds.has(id)) || !objective)
      throw invalid("Checkpoint cần blueprint tham chiếu câu hỏi thật và phần chấm khách quan.");
  }
  if (subtype === "placement") {
    const rules = doc.blueprint?.rules;
    if (doc.exercises.length !== 20 || doc.blueprint?.questionCount !== 20 || !rules?.length)
      throw invalid("Kiểm tra gợi ý cần 20 câu cố định và quy tắc blueprint.");
    for (const rule of rules) {
      const valid =
        Number.isInteger(rule.minPercent) &&
        rule.minPercent >= 0 &&
        rule.minPercent <= 100 &&
        (await pathHasLessons(String(rule.pathSlug ?? "")));
      if (!valid) throw invalid("Quy tắc gợi ý phải trỏ tới lộ trình có bài học khả dụng.");
    }
  }
}

async function pathHasLessons(pathSlug: string): Promise<boolean> {
  const [row] = await db()
    .select({ id: paths.id })
    .from(paths)
    .innerJoin(units, eq(units.pathId, paths.id))
    .innerJoin(lessons, eq(lessons.unitId, units.id))
    .where(
      and(
        eq(paths.slug, pathSlug),
        eq(paths.status, "published"),
        isNotNull(lessons.currentVersion),
        eq(lessons.archived, false),
      ),
    )
    .limit(1);
  return !!row;
}

// ---- Public catalog (Content::paths / Content::lessons) ----

const visible = and(
  eq(paths.status, "published"),
  eq(units.archived, false),
  eq(lessons.archived, false),
  ne(lessons.subtype, "placement"),
  eq(versions.status, "published"),
);

/** Published paths that have at least one playable lesson. */
export async function catalogPaths() {
  return db()
    .select({
      id: paths.id,
      slug: paths.slug,
      title: paths.title,
      description: paths.description,
      level: paths.level,
      objectives: paths.objectives,
      prerequisites: paths.prerequisites,
      imageId: paths.imageId,
      sortOrder: paths.sortOrder,
      seoTitle: paths.seoTitle,
      seoDescription: paths.seoDescription,
      lessonCount: sql<number>`COUNT(DISTINCT ${lessons.id})`.mapWith(Number),
    })
    .from(paths)
    .innerJoin(units, eq(units.pathId, paths.id))
    .innerJoin(lessons, eq(lessons.unitId, units.id))
    .innerJoin(versions, eq(versions.id, lessons.currentVersion))
    .where(visible)
    .groupBy(paths.id)
    .orderBy(asc(paths.sortOrder), asc(paths.id));
}

/** Playable lessons, optionally for one path, in path → unit → lesson order. */
export async function catalogLessons(pathId?: number) {
  return db()
    .select({
      id: lessons.id,
      slug: lessons.slug,
      subtype: lessons.subtype,
      required: lessons.required,
      sortOrder: lessons.sortOrder,
      unitId: lessons.unitId,
      versionId: versions.id,
      title: versions.title,
      document: versions.document,
      unitTitle: units.title,
      pathId: units.pathId,
      pathTitle: paths.title,
      pathSlug: paths.slug,
    })
    .from(lessons)
    .innerJoin(versions, eq(versions.id, lessons.currentVersion))
    .innerJoin(units, eq(units.id, lessons.unitId))
    .innerJoin(paths, eq(paths.id, units.pathId))
    .where(pathId ? and(visible, eq(paths.id, pathId)) : visible)
    .orderBy(asc(paths.sortOrder), asc(units.sortOrder), asc(lessons.sortOrder), asc(lessons.id));
}
