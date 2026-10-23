import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import {
  articleVersions,
  entityDrafts,
  media,
  vocabulary,
  vocabularySetItems,
  vocabularySets,
} from "@/db/schema";
import { withTx } from "@/db/tx";
import { AppError, conflict, invalid } from "@/server/errors";
import { requireStaff, type Actor } from "../actor";
import { seoText } from "../assessment/validate";
import { field, isObject, safeEqual, sha256, text } from "../php";
import { storage } from "../media/storage";
import { addRedirect, audit, phpInt, rawDocument, slug } from "./shared";

// Paths, units, vocabulary, vocabulary sets and articles (Content::entityRow, saveEntity,
// saveDraft, articleWorkflow, entityWorkflow and the set-membership helpers).
//
// Editing something already published never changes the public row directly: paths, vocabulary
// and sets get a proposal in mce_entity_drafts, articles a row in mce_article_versions. An admin
// publishes the proposal. Rows use the PHP column names (snake_case) because drafts and import
// files store them as JSON in that shape.

export const KINDS = ["paths", "units", "vocabulary", "articles", "vocabulary_sets"] as const;
export type Kind = (typeof KINDS)[number];
type Row = Record<string, string | number | null>;

const FIELDS: Record<Kind, string[]> = {
  paths: [
    "slug",
    "title",
    "description",
    "level",
    "objectives",
    "prerequisites",
    "image_id",
    "status",
    "sort_order",
  ],
  units: ["path_id", "title", "objectives", "sort_order"],
  vocabulary: [
    "slug",
    "lemma",
    "ipa",
    "part_of_speech",
    "topic",
    "meaning",
    "example",
    "translation",
    "level",
    "audio_id",
    "status",
  ],
  articles: ["slug", "title", "body", "status"],
  vocabulary_sets: ["slug", "title", "description", "status", "sort_order"],
};

const LONG_TEXT = [
  "description",
  "body",
  "objectives",
  "prerequisites",
  "meaning",
  "example",
  "translation",
];
const maxLength = (f: string) =>
  ["slug", "lemma", "ipa"].includes(f)
    ? 150
    : f === "part_of_speech"
      ? 60
      : f === "topic"
        ? 100
        : f === "level" || f === "status"
          ? 20
          : LONG_TEXT.includes(f)
            ? 15000
            : 200;

const SLUG_PREFIX: Partial<Record<Kind, string>> = {
  paths: "/lo-trinh/",
  vocabulary: "/tu-vung/",
  articles: "/kien-thuc/",
  vocabulary_sets: "/tu-vung/chu-de/",
};

const table = (kind: Kind) => sql.raw(`mce_${kind}`);

export function assertKind(kind: unknown): Kind {
  if (!KINDS.includes(kind as Kind)) throw invalid("Loại nội dung không hợp lệ.");
  return kind as Kind;
}

async function selectRow(q: Tx, kind: Kind, id: number, lock = false): Promise<Row | undefined> {
  const [rows] = (await q.execute(
    sql`SELECT * FROM ${table(kind)} WHERE id = ${id}${lock ? sql` FOR UPDATE` : sql``}`,
  )) as unknown as [Row[]];
  return rows[0];
}

/** Content::entityRow: validate and normalise one record of a kind. */
export async function entityRow(
  actor: Actor,
  kind: Kind,
  data: Record<string, unknown>,
): Promise<Row> {
  const id = phpInt(data.id);
  const row: Row = {};
  for (const f of FIELDS[kind]) {
    if (f === "sort_order" || f === "path_id") row[f] = phpInt(data[f]);
    else if (f === "audio_id" || f === "image_id") row[f] = data[f] ? phpInt(data[f]) : null;
    else
      row[f] = field(f, () =>
        text(data[f] ?? "", maxLength(f), f !== "ipa" && f !== "prerequisites"),
      );
  }
  if (kind !== "units") {
    const previous = id ? await withTx((tx) => selectRow(tx, kind, id)) : undefined;
    for (const [name, max] of [
      ["seo_title", 160],
      ["seo_description", 320],
    ] as const)
      row[name] = field(name, () => seoText(data[name] ?? previous?.[name] ?? "", max));
  }
  if (row.slug !== undefined) field("slug", () => slug(row.slug));
  if (kind === "vocabulary") field("topic", () => slug(row.topic));

  if (row.audio_id) {
    const [m] = await db()
      .select()
      .from(media)
      .where(eq(media.id, Number(row.audio_id)));
    if (
      !m ||
      !m.mime.startsWith("audio/") ||
      !m.licenseText ||
      !(await storage().exists(m.storageKey))
    )
      throw new AppError(422, "Chọn audio từ thư viện có quyền sử dụng.", {
        audio_id: "Chọn audio từ thư viện có quyền sử dụng.",
      });
  }
  if (row.image_id) {
    const [image] = await db()
      .select({ mime: media.mime })
      .from(media)
      .where(eq(media.id, Number(row.image_id)));
    if (!image || !image.mime.startsWith("image/"))
      throw new AppError(422, "Ảnh lộ trình cần tệp ảnh trong thư viện.", {
        image_id: "Ảnh lộ trình cần tệp ảnh trong thư viện.",
      });
  }
  if (row.status !== undefined) {
    if (!["draft", "in_review", "published", "archived"].includes(String(row.status)))
      throw new AppError(422, "Trạng thái không hợp lệ.", { status: "Trạng thái không hợp lệ." });
    if (row.status === "published" || row.status === "archived") requireStaff(actor, true);
  }
  if (kind === "units") {
    const exists = await withTx((tx) => selectRow(tx, "paths", Number(row.path_id)));
    if (!exists)
      throw new AppError(422, "Lộ trình không tồn tại.", { path_id: "Lộ trình không tồn tại." });
  }
  if (kind === "vocabulary_sets" && row.status === "published") {
    const [hasPublished] = id
      ? await db()
          .select({ id: vocabularySetItems.senseId })
          .from(vocabularySetItems)
          .innerJoin(vocabulary, eq(vocabulary.id, vocabularySetItems.senseId))
          .where(and(eq(vocabularySetItems.setId, id), eq(vocabulary.status, "published")))
          .limit(1)
      : [];
    if (!hasPublished)
      throw invalid("Thêm ít nhất một nghĩa từ đã xuất bản trước khi xuất bản bộ từ.");
  }
  return row;
}

const columns = (row: Row) => sql.raw(Object.keys(row).join(", "));
const values = (row: Row) =>
  sql.join(
    Object.values(row).map((v) => sql`${v}`),
    sql`, `,
  );
const assignments = (row: Row) =>
  sql.join(
    Object.entries(row).map(([k, v]) => sql`${sql.raw(k)} = ${v}`),
    sql`, `,
  );

export async function insertRow(tx: Tx, kind: Kind, row: Row): Promise<number> {
  const [result] = (await tx.execute(
    sql`INSERT INTO ${table(kind)} (${columns(row)}) VALUES (${values(row)})`,
  )) as unknown as [{ insertId: number }];
  return Number(result.insertId);
}

async function updateRow(tx: Tx, kind: Kind, id: number, row: Row): Promise<void> {
  await tx.execute(sql`UPDATE ${table(kind)} SET ${assignments(row)} WHERE id = ${id}`);
}

// ---- Vocabulary-set membership ----

async function setItemIds(tx: Tx, setId: number): Promise<number[]> {
  const rows = await tx
    .select({ id: vocabularySetItems.senseId })
    .from(vocabularySetItems)
    .where(eq(vocabularySetItems.setId, setId))
    .orderBy(asc(vocabularySetItems.senseId));
  return rows.map((r) => r.id);
}

export async function validateSetItems(
  tx: Tx,
  input: unknown,
  publishing = false,
): Promise<number[]> {
  let ids = input;
  if (typeof ids === "string") ids = ids.trim() === "" ? [] : ids.split(",");
  if (!Array.isArray(ids) || ids.length > 1000) throw invalid("Danh sách nghĩa từ không hợp lệ.");
  for (const id of ids)
    if (!["string", "number"].includes(typeof id) || !/^[1-9][0-9]*$/.test(String(id)))
      throw invalid("ID nghĩa từ phải là số nguyên dương.");
  const numbers = ids.map((id) => Number.parseInt(String(id), 10));
  if (new Set(numbers).size !== numbers.length) throw invalid("ID nghĩa từ bị trùng.");
  numbers.sort((a, b) => a - b);
  let published = 0;
  for (const id of numbers) {
    const [v] = await tx
      .select({ status: vocabulary.status })
      .from(vocabulary)
      .where(eq(vocabulary.id, id))
      .for("update");
    if (!v) throw invalid("Có ID nghĩa từ không tồn tại.");
    if (v.status === "published") published++;
  }
  if (publishing && !published) throw invalid("Bộ từ cần ít nhất một nghĩa từ đã xuất bản.");
  return numbers;
}

async function replaceSetItems(tx: Tx, setId: number, ids: number[]) {
  await tx.delete(vocabularySetItems).where(eq(vocabularySetItems.setId, setId));
  if (ids.length)
    await tx.insert(vocabularySetItems).values(ids.map((senseId) => ({ setId, senseId })));
}

async function saveSetItemsIn(tx: Tx, actor: Actor, setId: number, input: unknown) {
  const uid = requireStaff(actor);
  const [record] = await tx
    .select()
    .from(vocabularySets)
    .where(eq(vocabularySets.id, setId))
    .for("update");
  if (!record) throw new AppError(404, "Không tìm thấy bộ từ.");
  if (record.status === "archived") throw conflict("Không sửa thành viên bộ đã lưu trữ.");
  if (record.status === "in_review")
    throw conflict("Không sửa thành viên khi bộ từ đang chờ duyệt.");
  const ids = await validateSetItems(tx, input);
  if (record.status !== "draft") {
    await tx.insert(entityDrafts).values({
      kind: "vocabulary_sets",
      entityId: setId,
      document: {
        title: record.title,
        membershipOnly: true,
        senseIds: ids,
        baseSenseIds: await setItemIds(tx, setId),
      },
      status: "draft",
      authorId: uid,
    });
    await audit(tx, actor, "set_membership_proposed", `set:${setId}`);
    return;
  }
  await replaceSetItems(tx, setId, ids);
  await audit(tx, actor, "set_membership_saved", `set:${setId}`);
}

export const saveSetItems = (actor: Actor, setId: number, ids: unknown) =>
  withTx((tx) => saveSetItemsIn(tx, actor, setId, ids));

const TOPIC_TITLES: Record<string, string> = {
  greetings: "Chào hỏi",
  daily: "Đời sống",
  work: "Công việc",
  time: "Thời gian",
};

/** Content::vocabularySet: put a sense into its topic's set, creating the set if needed. */
export async function addToTopicSet(
  tx: Tx,
  actor: Actor,
  senseId: number,
  topic: string,
  publish = false,
) {
  const setSlug = /^[a-z0-9-]{1,100}$/.test(topic) ? topic : `chu-de-${sha256(topic).slice(0, 12)}`;
  const title = TOPIC_TITLES[topic] ?? topic;
  await tx
    .insert(vocabularySets)
    .ignore()
    .values({
      slug: setSlug,
      title,
      description: `Các nghĩa từ và ví dụ theo chủ đề ${title}.`,
      status: publish ? "published" : "draft",
    });
  const [set] = await tx
    .select({ id: vocabularySets.id, status: vocabularySets.status })
    .from(vocabularySets)
    .where(eq(vocabularySets.slug, setSlug))
    .for("update");
  if (!set) return;
  if (!publish && set.status !== "draft") {
    const ids = await setItemIds(tx, set.id);
    if (!ids.includes(senseId)) await saveSetItemsIn(tx, actor, set.id, [...ids, senseId]);
    return;
  }
  await tx.insert(vocabularySetItems).ignore().values({ setId: set.id, senseId });
}

// ---- Save, drafts and workflows ----

export async function saveEntity(
  actor: Actor,
  kindInput: unknown,
  data: Record<string, unknown>,
): Promise<number> {
  const uid = requireStaff(actor);
  const kind = assertKind(kindInput);
  let id = phpInt(data.id);
  const row = await entityRow(actor, kind, data);
  return withTx(async (tx) => {
    if (!id && row.status === "published")
      throw conflict("Gửi duyệt bản nháp rồi xuất bản bằng thao tác duyệt.");
    if (id) {
      const old = await selectRow(tx, kind, id, true);
      if (!old) throw new AppError(404, "Nội dung không tồn tại.");
      if (kind !== "units")
        for (const f of ["seo_title", "seo_description"])
          if (!Object.hasOwn(data, f)) row[f] = old[f] ?? "";
      if (row.status === "published" && old.status !== "published")
        throw conflict("Gửi duyệt bản nháp rồi xuất bản bằng thao tác duyệt.");
      if (old.status === "in_review" && row.status !== "archived")
        throw conflict("Nội dung đang chờ duyệt; không sửa bản đã gửi.");

      if (
        ["paths", "vocabulary", "vocabulary_sets"].includes(kind) &&
        old.status === "published" &&
        row.status !== "archived"
      ) {
        const document: Record<string, unknown> = { ...row };
        if (kind === "vocabulary_sets") {
          const ids = await setItemIds(tx, id);
          Object.assign(document, { senseIds: ids, baseSenseIds: ids });
        }
        await tx.insert(entityDrafts).values({
          kind,
          entityId: id,
          document,
          status: row.status === "published" ? "in_review" : (row.status as "draft" | "in_review"),
          authorId: uid,
        });
        await audit(tx, actor, "entity_draft_created", `${kind}:${id}`);
        return id;
      }
      if (kind === "articles" && old.status === "published" && row.status !== "archived") {
        await tx.insert(articleVersions).values({
          articleId: id,
          document: { ...row, status: row.status === "published" ? "in_review" : row.status },
          actorId: uid,
          createdAt: new Date(),
        });
        await audit(tx, actor, "article_draft_created", `article:${id}`);
        return id;
      }
      // Keep a copy of a public article before replacing it (e.g. when archiving).
      if (kind === "articles" && old.status === "published")
        await tx
          .insert(articleVersions)
          .values({ articleId: id, document: old, actorId: uid, createdAt: new Date() });
      await updateRow(tx, kind, id, row);
      const prefix = SLUG_PREFIX[kind];
      if (prefix && old.slug !== undefined && old.slug !== row.slug)
        await addRedirect(tx, `${prefix}${old.slug}`, `${prefix}${row.slug}`);
    } else {
      id = await insertRow(tx, kind, row);
    }
    if (row.status === "in_review") {
      if (kind === "articles")
        await tx
          .insert(articleVersions)
          .values({ articleId: id, document: row, actorId: uid, createdAt: new Date() });
      else {
        const document: Record<string, unknown> = { ...row };
        if (kind === "vocabulary_sets") {
          const ids = await setItemIds(tx, id);
          Object.assign(document, { senseIds: ids, baseSenseIds: ids });
        }
        await tx
          .insert(entityDrafts)
          .values({ kind, entityId: id, document, status: "in_review", authorId: uid });
      }
    }
    if (kind === "vocabulary") await addToTopicSet(tx, actor, id, String(row.topic));
    await audit(tx, actor, `save_${kind}`, String(id));
    return id;
  });
}

const draftTable = (type: "entity" | "article") =>
  type === "article" ? "mce_article_versions" : "mce_entity_drafts";

/** Hash the editor must send back when saving a draft (stale-edit detection). */
export async function draftHash(type: "entity" | "article", id: number): Promise<string | null> {
  return withTx(async (tx) => {
    const raw = await rawDocument(tx, draftTable(type), id);
    return raw === null ? null : sha256(raw);
  });
}

export async function saveDraft(
  actor: Actor,
  type: unknown,
  id: number,
  input: { expected?: unknown; document?: unknown },
): Promise<void> {
  requireStaff(actor);
  if (type !== "entity" && type !== "article") throw invalid("Loại bản nháp không hợp lệ.");
  await withTx(async (tx) => {
    const raw = await rawDocument(tx, draftTable(type), id);
    if (raw === null) throw new AppError(404, "Không tìm thấy bản nháp.");
    const [draft] =
      type === "article"
        ? await tx
            .select({
              kind: sql<string>`'articles'`,
              entityId: articleVersions.articleId,
              status: sql<string>`''`,
            })
            .from(articleVersions)
            .where(eq(articleVersions.id, id))
        : await tx
            .select({
              kind: entityDrafts.kind,
              entityId: entityDrafts.entityId,
              status: entityDrafts.status,
            })
            .from(entityDrafts)
            .where(eq(entityDrafts.id, id));
    const old = JSON.parse(raw) as Record<string, unknown>;
    const status = type === "article" ? old.status : draft!.status;
    if (status !== "draft")
      throw conflict("Chỉ sửa bản nháp; bản chờ duyệt cần được trả lại trước.");
    if (typeof input.expected !== "string" || !safeEqual(sha256(raw), input.expected))
      throw conflict("Bản nháp đã thay đổi. Tải lại trước khi sửa.");
    const data = input.document;
    if (!isObject(data)) throw invalid("Nội dung bản nháp cần JSON object.");
    if (data.status !== undefined && data.status !== null && data.status !== "draft")
      throw invalid("Lưu bản nháp không thay trạng thái duyệt.");
    const kind = draft!.kind as Kind;
    if (!["paths", "vocabulary", "vocabulary_sets", "articles"].includes(kind))
      throw invalid("Loại nội dung không hợp lệ.");
    const parent = await selectRow(tx, kind, draft!.entityId, true);
    if (!parent || parent.status === "archived")
      throw conflict("Nội dung đã lưu trữ hoặc không còn tồn tại.");

    let document: Record<string, unknown>;
    if (old.membershipOnly) {
      document = {
        title: old.title,
        membershipOnly: true,
        senseIds: await validateSetItems(tx, data.senseIds ?? null),
        baseSenseIds: old.baseSenseIds,
      };
    } else {
      document = await entityRow(actor, kind, { ...data, status: "draft", id: draft!.entityId });
      if (kind === "vocabulary_sets" && old.senseIds !== undefined)
        Object.assign(document, {
          senseIds: await validateSetItems(tx, data.senseIds ?? old.senseIds),
          baseSenseIds: old.baseSenseIds,
        });
    }
    if (old.reviewFeedback !== undefined) document.reviewFeedback = old.reviewFeedback;
    if (type === "article")
      await tx.update(articleVersions).set({ document }).where(eq(articleVersions.id, id));
    else await tx.update(entityDrafts).set({ document }).where(eq(entityDrafts.id, id));
    await audit(tx, actor, "draft_saved", `${type}:${id}`);
  });
}

const feedback = (actor: Actor, reason: unknown) => ({
  reason: text(reason ?? "", 2000),
  actor: actor.userId,
  at: new Date().toISOString().slice(0, 19).replace("T", " "),
});

export async function articleWorkflow(
  actor: Actor,
  versionId: number,
  action: unknown,
  reason: unknown = "",
) {
  requireStaff(actor, action === "publish" || action === "return");
  await withTx(async (tx) => {
    const [v] = await tx
      .select()
      .from(articleVersions)
      .where(eq(articleVersions.id, versionId))
      .for("update");
    if (!v) throw new AppError(404, "Không tìm thấy bản bài viết.");
    let d: Record<string, unknown> = { ...v.document };
    if (action === "review") {
      if (d.status !== "draft") throw conflict("Chỉ gửi duyệt bản nháp.");
      d.status = "in_review";
    } else if (action === "return") {
      if (d.status !== "in_review") throw conflict("Chỉ trả lại bản đang chờ duyệt.");
      d = { ...d, status: "draft", reviewFeedback: feedback(actor, reason) };
    } else if (action === "publish") {
      if (d.status === "published") return;
      if (d.status !== "in_review") throw conflict("Bài viết chưa được gửi duyệt.");
      const old = await selectRow(tx, "articles", v.articleId, true);
      if (!old || old.status === "archived")
        throw conflict("Bài viết đã lưu trữ hoặc không còn tồn tại.");
      await tx
        .insert(articleVersions)
        .values({
          articleId: v.articleId,
          document: old,
          actorId: actor.userId!,
          createdAt: new Date(),
        });
      const row = await entityRow(actor, "articles", {
        ...d,
        status: "published",
        id: v.articleId,
      });
      await tx.execute(sql`
        UPDATE mce_articles SET slug = ${row.slug}, title = ${row.title}, body = ${row.body},
          seo_title = ${row.seo_title}, seo_description = ${row.seo_description}, status = 'published',
          revision = revision + 1, updated_at = UTC_TIMESTAMP(3)
        WHERE id = ${v.articleId}`);
      if (old.slug !== row.slug)
        await addRedirect(tx, `/kien-thuc/${old.slug}`, `/kien-thuc/${row.slug}`);
      d = row;
    } else {
      throw invalid("Thao tác không hợp lệ.");
    }
    await tx.update(articleVersions).set({ document: d }).where(eq(articleVersions.id, versionId));
    await audit(
      tx,
      actor,
      `article_${String(action)}`,
      `article_version:${versionId}`,
      action === "return" ? { reason } : {},
    );
  });
}

export async function entityWorkflow(
  actor: Actor,
  draftId: number,
  action: unknown,
  reason: unknown = "",
) {
  requireStaff(actor, action === "publish" || action === "return");
  await withTx(async (tx) => {
    const [v] = await tx
      .select()
      .from(entityDrafts)
      .where(eq(entityDrafts.id, draftId))
      .for("update");
    if (!v) throw new AppError(404, "Không tìm thấy bản đề xuất.");
    if (action === "review") {
      if (v.status !== "draft") throw conflict("Chỉ gửi duyệt bản nháp.");
      await tx
        .update(entityDrafts)
        .set({ status: "in_review" })
        .where(eq(entityDrafts.id, draftId));
    } else if (action === "return") {
      if (v.status !== "in_review") throw conflict("Chỉ trả lại bản đang chờ duyệt.");
      const document = { ...v.document, status: "draft", reviewFeedback: feedback(actor, reason) };
      await tx
        .update(entityDrafts)
        .set({ status: "draft", document })
        .where(eq(entityDrafts.id, draftId));
    } else if (action === "publish") {
      if (v.status === "published") return;
      if (v.status !== "in_review") throw conflict("Bản đề xuất chưa gửi duyệt.");
      const kind = v.kind as Kind;
      if (!["paths", "vocabulary", "vocabulary_sets"].includes(kind))
        throw invalid("Loại dữ liệu không hợp lệ.");
      const d: Record<string, unknown> = { ...v.document, status: "published" };
      const old = await selectRow(tx, kind, v.entityId, true);
      if (!old || old.status === "archived")
        throw conflict("Nội dung đã lưu trữ hoặc không còn tồn tại.");
      if (kind === "vocabulary_sets" && d.senseIds !== undefined) {
        const ids = await validateSetItems(tx, d.senseIds, true);
        const current = await setItemIds(tx, v.entityId);
        if (JSON.stringify(current) !== JSON.stringify(d.baseSenseIds))
          throw conflict("Thành viên bộ từ đã thay đổi. Hãy tạo đề xuất mới.");
        await replaceSetItems(tx, v.entityId, ids);
        if (d.membershipOnly) {
          if (old.status !== "published") throw conflict("Bộ từ không còn ở trạng thái xuất bản.");
          await tx
            .update(entityDrafts)
            .set({ status: "published" })
            .where(eq(entityDrafts.id, draftId));
          await audit(tx, actor, "entity_publish", `draft:${draftId}`);
          return;
        }
      }
      const row = await entityRow(actor, kind, { ...d, id: v.entityId });
      await updateRow(tx, kind, v.entityId, row);
      const prefix = SLUG_PREFIX[kind]!;
      if (old.slug !== row.slug)
        await addRedirect(tx, `${prefix}${old.slug}`, `${prefix}${row.slug}`);
      if (kind === "vocabulary") await addToTopicSet(tx, actor, v.entityId, String(row.topic));
      await tx
        .update(entityDrafts)
        .set({ status: "published" })
        .where(eq(entityDrafts.id, draftId));
    } else {
      throw invalid("Thao tác không hợp lệ.");
    }
    await audit(
      tx,
      actor,
      `entity_${String(action)}`,
      `draft:${draftId}`,
      action === "return" ? { reason } : {},
    );
  });
}
