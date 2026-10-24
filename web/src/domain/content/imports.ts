import "server-only";
import { drizzle } from "drizzle-orm/mysql2";
import { and, eq, or, sql } from "drizzle-orm";
import { createDbPool, db, type Tx } from "@/db/client";
import {
  externalRefs,
  importProgress,
  imports,
  jobs,
  lessons,
  units,
  versions,
  type ImportError,
} from "@/db/schema";
import { withTx } from "@/db/tx";
import { AppError, conflict, invalid } from "@/server/errors";
import { requireStaff, type Actor } from "../actor";
import { validateDocument } from "../assessment/validate";
import { enqueue } from "../jobs/enqueue";
import { field, hexKey, isObject, phpTrim, randomHex, text } from "../php";
import { addToTopicSet, entityRow, insertRow, type Kind } from "./entities";
import { audioOk, audit, slug } from "./shared";

// Batch imports (Content::importPreview, Content::importCommit, ImportStatus). A preview validates
// every record and stores per-field errors; a commit inserts all records in one transaction or
// none. Batches over 100 records run in the worker. Fix 13: CSV batches take their namespace from
// the caller instead of a fixed "csv-vocabulary". Fix 23: the worker passes the actor explicitly.

const IMPORT_KINDS = [
  "paths",
  "units",
  "articles",
  "vocabulary_sets",
  "vocabulary",
  "lessons",
] as const;
type ImportKind = (typeof IMPORT_KINDS)[number];
const NAMESPACE = /^[a-z0-9-]{1,50}$/;
const MAX_BYTES = 1024 * 1024;
const INLINE_LIMIT = 100;

// ---- Progress telemetry on its own autocommit connection ----

let progressDb: ReturnType<typeof drizzle> | undefined;

/** Written outside the import transaction so pollers see progress while content stays atomic. */
async function writeProgress(importId: string, processed: number, total: number, phase: string) {
  try {
    progressDb ??= drizzle({ client: createDbPool(undefined, 1) });
    await progressDb
      .insert(importProgress)
      .values({ importId, processed, total, phase, updatedAt: new Date() })
      .onDuplicateKeyUpdate({ set: { processed, total, phase, updatedAt: new Date() } });
  } catch (error) {
    console.error("Import progress telemetry unavailable", error);
  }
}

/** ImportStatus::errors: one entry per field error, with a dotted path and 1-based record. */
function importErrors(
  error: unknown,
  prefix: string,
  index: number,
  phase: ImportError["phase"] = "preview",
): ImportError[] {
  const fields =
    error instanceof AppError && Object.keys(error.fieldErrors).length
      ? error.fieldErrors
      : {
          "":
            error instanceof AppError
              ? error.message
              : "Record không hợp lệ hoặc xung đột dữ liệu.",
        };
  return Object.entries(fields).map(([f, message]) => ({
    record: index + 1,
    field: prefix + (f !== "" ? `.${f}` : ""),
    message: String(message),
    phase,
  }));
}

/** ImportStatus::document: lesson document errors, prefixed with "document". */
async function validateImportedDocument(document: unknown) {
  if (!isObject(document))
    throw new AppError(422, "Document cần object.", { document: "Cần object bài học." });
  try {
    await validateDocument(document, { audioOk });
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    const entries: [string, string][] = Object.keys(error.fieldErrors).length
      ? Object.entries(error.fieldErrors)
      : [["", error.message]];
    throw new AppError(
      error.status,
      error.message,
      Object.fromEntries(entries.map(([f, m]) => [`document${f !== "" ? `.${f}` : ""}`, m])),
    );
  }
}

/** RFC 4180 CSV (comma, double-quote, "" escape), like fgetcsv with no escape character. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // fgetcsv returns [null] for blank lines; skip them.
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function csvDocument(raw: string, namespace: unknown) {
  const [headers, ...lines] = parseCsv(raw);
  if (!headers || new Set(headers).size !== headers.length || !headers.includes("externalId"))
    throw invalid("CSV cần header theo template từ vựng.");
  const records: Record<string, string>[] = [];
  for (const line of lines) {
    if (line.length !== headers.length)
      throw invalid(`CSV có số cột không khớp tại dòng ${records.length + 2}.`);
    records.push(Object.fromEntries(headers.map((h, i) => [h, line[i]!])));
    if (records.length > 1000) throw invalid("CSV tối đa 1000 records.");
  }
  return { schemaVersion: 1, namespace, vocabulary: records };
}

async function exists(q: Tx | ReturnType<typeof db>, query: ReturnType<typeof sql>) {
  const [rows] = (await q.execute(query)) as unknown as [unknown[]];
  return rows.length > 0;
}

export interface PreviewResult {
  id: string;
  errors: ImportError[];
  count: number;
  status: "preview";
}

/** Validate a batch and store it for commit. The caller applies the import rate limit. */
export async function previewImport(
  actor: Actor,
  raw: string,
  csvNamespace?: unknown,
): Promise<PreviewResult> {
  const uid = requireStaff(actor);
  if (Buffer.byteLength(raw) > MAX_BYTES) throw invalid("Batch tối đa 1 MB.");
  let doc: Record<string, unknown>;
  if (!raw.trimStart().startsWith("{")) doc = csvDocument(raw, csvNamespace);
  else {
    try {
      doc = JSON.parse(raw);
    } catch {
      throw new AppError(422, "JSON không hợp lệ.", { raw: "Kiểm tra cú pháp JSON." });
    }
  }
  if (!isObject(doc) || typeof doc.namespace !== "string" || !NAMESPACE.test(doc.namespace))
    throw new AppError(422, "Namespace không hợp lệ.", {
      namespace: "Dùng chữ thường, số và gạch ngang, tối đa 50 ký tự.",
    });
  const present = IMPORT_KINDS.filter((k) => Object.hasOwn(doc, k));
  if (present.length !== 1) throw invalid("Mỗi batch chỉ chứa một loại dữ liệu.");
  const kind = present[0]!;
  const records = doc[kind];
  if (doc.schemaVersion !== 1 || !Array.isArray(records) || records.length > 1000)
    throw invalid(
      kind === "lessons"
        ? "Batch cần schemaVersion=1, namespace và tối đa 1000 lessons."
        : kind === "vocabulary"
          ? "Batch từ vựng không hợp lệ."
          : "Batch cần schemaVersion=1 và tối đa 1000 records.",
    );
  const namespace = doc.namespace;
  const errors: ImportError[] = [];
  const keys = new Set<string>();
  const slugs = new Set<string>();

  for (const [i, record] of records.entries()) {
    try {
      if (kind === "lessons") await previewLesson(record, namespace, keys, slugs);
      else if (kind === "vocabulary")
        await previewVocabulary(actor, record, namespace, keys, slugs);
      else await previewEntity(actor, kind, record, namespace, keys, slugs);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      errors.push(...importErrors(error, `${kind}.${i}`, i));
    }
  }

  const id = randomHex(16);
  await db().insert(imports).values({ id, actorId: uid, document: doc, errors });
  await writeProgress(id, 0, records.length, "preview");
  return { id, errors, count: records.length, status: "preview" };
}

const externalKey = (record: Record<string, unknown>) =>
  field("externalId", () => text(record.externalId ?? "", 100)).toLowerCase();

async function previewEntity(
  actor: Actor,
  kind: Exclude<ImportKind, "lessons" | "vocabulary">,
  record: unknown,
  namespace: string,
  keys: Set<string>,
  slugs: Set<string>,
) {
  if (!isObject(record)) throw invalid("Record phải là object.");
  const key = externalKey(record);
  if (keys.has(key))
    throw new AppError(422, "externalId trùng.", { externalId: "externalId bị trùng." });
  keys.add(key);
  const row = await entityRow(actor, kind, { ...record, status: "draft", id: 0 });
  if (row.slug !== undefined) {
    const s = String(row.slug);
    if (
      slugs.has(s) ||
      (await exists(db(), sql`SELECT id FROM ${sql.raw(`mce_${kind}`)} WHERE slug = ${s}`))
    )
      throw new AppError(422, "Slug đã tồn tại hoặc trùng trong batch.", {
        slug: "Slug đã tồn tại hoặc trùng trong batch.",
      });
    slugs.add(s);
  }
  const [ref] = await db()
    .select({ id: externalRefs.entityId })
    .from(externalRefs)
    .where(
      and(
        eq(externalRefs.namespace, namespace),
        eq(externalRefs.externalId, key),
        eq(externalRefs.kind, kind),
      ),
    );
  if (ref)
    throw new AppError(422, "externalId đã tồn tại.", { externalId: "externalId đã tồn tại." });
}

async function previewVocabulary(
  actor: Actor,
  v: unknown,
  namespace: string,
  keys: Set<string>,
  slugs: Set<string>,
) {
  if (isObject(v) && v.schemaVersion !== undefined && Number(v.schemaVersion) !== 1)
    throw new AppError(422, "schemaVersion record phải bằng 1.", {
      schemaVersion: "Cần phiên bản 1.",
    });
  if (!isObject(v)) throw invalid("Record phải là object.");
  for (const f of [
    "externalId",
    "slug",
    "lemma",
    "part_of_speech",
    "topic",
    "meaning",
    "example",
    "translation",
    "level",
  ])
    field(f, () =>
      text(v[f] ?? "", ["meaning", "example", "translation"].includes(f) ? 15000 : 200),
    );
  await entityRow(actor, "vocabulary", { ...v, status: "draft", id: 0 });
  const s = String(v.slug);
  if (slugs.has(s))
    throw new AppError(422, "Slug trùng trong batch.", { slug: "Slug trùng trong batch." });
  slugs.add(s);
  field("slug", () => slug(s));
  const key = externalKey(v);
  if (keys.has(key))
    throw new AppError(422, "externalId trùng.", { externalId: "externalId bị trùng." });
  keys.add(key);
  if (await exists(db(), sql`SELECT id FROM mce_vocabulary WHERE slug = ${s}`))
    throw new AppError(422, "Slug đã tồn tại.", { slug: "Không ghi đè slug đã tồn tại." });
  const [ref] = await db()
    .select({ id: externalRefs.entityId })
    .from(externalRefs)
    .where(
      and(
        eq(externalRefs.namespace, namespace),
        eq(externalRefs.externalId, key),
        eq(externalRefs.kind, "vocabulary"),
      ),
    );
  if (ref)
    throw new AppError(422, "externalId đã tồn tại.", { externalId: "Không ghi đè externalId." });
}

async function previewLesson(
  row: unknown,
  namespace: string,
  keys: Set<string>,
  slugs: Set<string>,
) {
  if (!isObject(row)) throw invalid("Record không hợp lệ.");
  field("slug", () => slug(row.slug ?? ""));
  field("title", () => text(row.title ?? "", 200));
  const s = row.slug as string;
  if (slugs.has(s))
    throw new AppError(422, "Slug trùng trong batch.", { slug: "Slug trùng trong batch." });
  slugs.add(s);
  const key = `${namespace}:${externalKey(row)}`;
  if (keys.has(key))
    throw new AppError(422, "externalId trùng trong batch.", {
      externalId: "externalId trùng trong batch.",
    });
  keys.add(key);
  const [unit] = await db()
    .select({ id: units.id })
    .from(units)
    .where(eq(units.id, Number(row.unitId ?? 0) || 0));
  if (!unit) throw new AppError(422, "unitId không tồn tại.", { unitId: "Chọn chương tồn tại." });
  await validateImportedDocument(row.document ?? null);
  const [clash] = await db()
    .select({ id: lessons.id })
    .from(lessons)
    .where(or(eq(lessons.externalKey, key), eq(lessons.slug, s)));
  if (clash) throw invalid("externalId hoặc slug đã tồn tại. Batch không ghi đè nội dung.");
}

const kindOf = (doc: Record<string, unknown>): ImportKind | undefined =>
  IMPORT_KINDS.find((k) => Object.hasOwn(doc, k));

/**
 * Commit a previewed batch. Only the actor who previewed it may commit. `fromWorker` runs large
 * batches inline (the worker passes the original actor).
 */
export async function commitImport(
  actor: Actor,
  importId: unknown,
  fromWorker = false,
): Promise<void> {
  const uid = requireStaff(actor);
  const id = hexKey(importId);
  let started = false;
  let total = 0;
  let processed = 0;
  let kind: ImportKind | undefined;
  try {
    await withTx(async (tx) => {
      const [job] = await tx
        .select()
        .from(imports)
        .where(and(eq(imports.id, id), eq(imports.actorId, uid)))
        .for("update");
      if (!job) throw new AppError(404, "Không tìm thấy batch.");
      if (job.status === "committed") return;
      if (job.errors.some((e) => (e.phase ?? "preview") !== "commit"))
        throw invalid("Batch còn lỗi. Không có nội dung nào được nhập.");
      const doc = job.document;
      kind = kindOf(doc);
      const records = kind ? doc[kind] : undefined;
      if (!kind || !Array.isArray(records)) throw invalid("Batch không còn hợp lệ.");
      total = records.length;

      if (!fromWorker && total > INLINE_LIMIT) {
        if (job.status === "failed")
          throw conflict("Batch đã lỗi. Kiểm tra chẩn đoán và retry từ Operations.");
        await enqueue("import", `import:${id}`, { actorId: uid, importId: id }, tx);
        await tx.update(imports).set({ status: "queued" }).where(eq(imports.id, id));
        await writeProgress(id, 0, total, "queued");
        await audit(tx, actor, "import_queued", id);
        return;
      }

      started = true;
      processed = 0;
      await writeProgress(id, 0, total, "running");
      await tx.update(imports).set({ status: "running", errors: [] }).where(eq(imports.id, id));
      const namespace = String(doc.namespace);
      for (const [i, r] of (records as Record<string, unknown>[]).entries()) {
        try {
          await commitRecord(tx, actor, kind, namespace, r, uid);
        } catch (error) {
          const mapped =
            (error as { cause?: { errno?: number } })?.cause?.errno === 1062 ||
            (error as { errno?: number })?.errno === 1062
              ? new AppError(409, "Slug hoặc externalId đã tồn tại; không ghi đè.", {
                  [String((error as Error).message).includes("slug") ? "slug" : "externalId"]:
                    "Giá trị đã tồn tại.",
                })
              : error;
          const errors = importErrors(mapped, `${kind}.${i}`, i, "commit");
          throw new AppError(
            mapped instanceof AppError ? mapped.status : 503,
            `Import lỗi ở record ${i + 1}; không có record nào được lưu.`,
            { __import: JSON.stringify(errors) },
          );
        }
        processed = i + 1;
        if (processed % 10 === 0 || processed === total)
          await writeProgress(id, processed, total, "running");
      }
      await tx.update(imports).set({ status: "committed" }).where(eq(imports.id, id));
      await audit(tx, actor, "import_committed", id);
    });
    if (started) await writeProgress(id, total, total, "committed");
  } catch (error) {
    if (!started) throw error;
    const errors: ImportError[] =
      error instanceof AppError && error.fieldErrors.__import
        ? JSON.parse(error.fieldErrors.__import)
        : importErrors(error, `${kind}.${processed}`, processed, "commit");
    await db()
      .update(imports)
      .set({ status: "failed", errors })
      .where(
        and(eq(imports.id, id), eq(imports.actorId, uid), sql`${imports.status} <> 'committed'`),
      );
    await writeProgress(id, processed, total, "failed");
    throw new AppError(error instanceof AppError ? error.status : 503, (error as Error).message, {
      importId: "Xem lỗi theo record/field của batch.",
    });
  }
}

async function commitRecord(
  tx: Tx,
  actor: Actor,
  kind: ImportKind,
  namespace: string,
  r: Record<string, unknown>,
  uid: number,
) {
  const external = phpTrim(String(r.externalId ?? "")).toLowerCase();
  if (kind === "lessons") {
    await validateImportedDocument(r.document ?? null);
    const [created] = await tx
      .insert(lessons)
      .values({
        unitId: Number(r.unitId),
        slug: String(r.slug),
        externalKey: `${namespace}:${external}`,
      })
      .$returningId();
    await tx.insert(versions).values({
      lessonId: created!.id,
      title: phpTrim(String(r.title)),
      document: r.document as never,
      authorId: uid,
    });
    return;
  }
  const row = await entityRow(actor, kind as Kind, { ...r, status: "draft", id: 0 });
  const entityId = await insertRow(tx, kind as Kind, row);
  if (kind === "vocabulary") await addToTopicSet(tx, actor, entityId, String(row.topic));
  await tx.insert(externalRefs).values({ namespace, externalId: external, kind, entityId });
}

/** Status for polling (ImportStatus::read). Admins see every batch; editors only their own. */
export async function importStatus(actor: Actor, importId: unknown) {
  const uid = requireStaff(actor);
  const id = hexKey(importId);
  const [row] = await db()
    .select({ imp: imports, progress: importProgress })
    .from(imports)
    .leftJoin(importProgress, eq(importProgress.importId, imports.id))
    .where(eq(imports.id, id));
  if (!row || (actor.role !== "admin" && row.imp.actorId !== uid))
    throw new AppError(404, "Không tìm thấy batch.");
  const kind = kindOf(row.imp.document);
  const records = kind ? row.imp.document[kind] : [];
  const total = row.progress?.total ?? (Array.isArray(records) ? records.length : 0);
  const status = row.imp.status;
  const processed = status === "committed" ? total : (row.progress?.processed ?? 0);
  const [job] = await db()
    .select({ status: jobs.status, attempts: jobs.attempts, availableAt: jobs.availableAt })
    .from(jobs)
    .where(eq(jobs.eventKey, `import:${id}`));
  return {
    canCommit: row.imp.actorId === uid && status === "preview" && row.imp.errors.length === 0,
    id,
    status,
    processed: Math.min(processed, total),
    total,
    committed: status === "committed" ? total : 0,
    phase:
      status === "committed"
        ? "committed"
        : status === "failed"
          ? "failed"
          : (row.progress?.phase ?? status),
    errors: row.imp.errors,
    updatedAt: row.progress?.updatedAt ?? null,
    job: job ?? null,
  };
}
