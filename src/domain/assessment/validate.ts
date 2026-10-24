import { AppError } from "@/server/errors";
import {
  field,
  isArrayLike,
  isInt,
  isIntegerKey,
  isObject,
  mbLen,
  phpEmpty,
  phpTrim,
  text,
} from "../php";
import { BLOCK_TYPES, EXERCISE_TYPES, type AudioCheck } from "./types";

// Port of Assessment::validate and Assessment::document (application/libraries/Assessment.php).
// Error messages, field paths and check order match the PHP app.

const RESERVED = new Set(["__proto__", "prototype", "constructor"]);

/** Assessment::id for string values. */
export const isId = (v: unknown): v is string =>
  typeof v === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(v) && !RESERVED.has(v);

/** Assessment::id for object keys, which PHP turns into ints when they look like integers. */
const isIdKey = (k: string) => isId(k) && !isIntegerKey(k);

const entries = (v: object) => Object.entries(v);

/** Assessment::answers: 1–30 non-blank strings of at most 4000 characters. */
const isAnswerList = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.length <= 30 &&
  v.every((s) => typeof s === "string" && phpTrim(s) !== "" && mbLen(s) <= 4000);

const nonBlank = (v: unknown, max?: number): v is string =>
  typeof v === "string" && phpTrim(v) !== "" && (max === undefined || mbLen(v) <= max);

const sortedEqual = (a: unknown[], b: unknown[]) => {
  if (a.length !== b.length) return false;
  const x = [...a].map(String).sort();
  const y = [...b].map(String).sort();
  return x.every((v, i) => v === y[i]) && a.every((v) => typeof v === "string");
};

function failer(prefix: string) {
  return (message: string, path = ""): never => {
    throw new AppError(422, `${prefix}: ${message}`, {
      [prefix + (path !== "" ? `.${path}` : "")]: message,
    });
  };
}

export async function validateExercise(
  e: Record<string, unknown>,
  prefix = "exercise",
  publishing = false,
  audioOk?: AudioCheck,
): Promise<void> {
  const fail = failer(prefix);
  const checks: [string, boolean][] = [
    ["id", isId(e.id)],
    ["type", EXERCISE_TYPES.includes(e.type as never)],
    ["payload", isArrayLike(e.payload)],
    ["explanation", typeof e.explanation === "string" && mbLen(e.explanation) <= 5000],
    ["schemaVersion", e.schemaVersion === 1],
    ["contentVersion", isInt(e.contentVersion) && e.contentVersion >= 1],
    ["skillTags", Array.isArray(e.skillTags) && e.skillTags.length <= 20],
    ["level", typeof e.level === "string" && mbLen(e.level) <= 20],
  ];
  for (const [name, valid] of checks) if (!valid) fail("Trường câu hỏi không hợp lệ.", name);
  (e.skillTags as unknown[]).forEach((tag, i) => {
    if (typeof tag !== "string" || mbLen(tag) > 80) fail("Tag tối đa 80 ký tự.", `skillTags.${i}`);
  });

  const p = e.payload as Record<string, unknown>;
  const t = e.type as string;
  if (
    p.whitespace !== undefined &&
    p.whitespace !== null &&
    !["preserve", "trim", "collapse"].includes(p.whitespace as string)
  )
    fail("Whitespace policy không hợp lệ.", "payload.whitespace");
  for (const flag of ["caseSensitive", "ignoreTerminalPunctuation", "partialCredit"])
    if (p[flag] !== undefined && p[flag] !== null && typeof p[flag] !== "boolean")
      fail(`${flag} phải là boolean.`, `payload.${flag}`);
  if (!nonBlank(p.prompt, 5000)) fail("Câu hỏi cần từ 1 đến 5000 ký tự.", "payload.prompt");

  if (t === "choice" || t === "listening_choice") {
    const c = p.choices ?? [];
    if (!isArrayLike(c) || entries(c).length < 2 || entries(c).length > 6)
      fail("Cần 2–6 lựa chọn.", "payload.choices");
    const choices = c as Record<string, unknown>;
    if (
      typeof p.answerId !== "string" ||
      !Object.hasOwn(choices, p.answerId) ||
      choices[p.answerId] == null
    )
      fail("Cần 2-6 lựa chọn và một answerId hợp lệ.", "payload.answerId");
    for (const [id, value] of entries(choices))
      if (!nonBlank(value, 2000) || !isIdKey(id))
        fail("ID hoặc nội dung lựa chọn không hợp lệ.", `payload.choices.${id}`);
  }

  // Fix 18: one true/false check instead of two overlapping ones.
  if (t === "true_false") {
    if (p.answer === false && !nonBlank(p.correction)) fail("Cần câu sửa.", "payload.correction");
    if (typeof p.answer !== "boolean")
      fail("Cần đáp án boolean và câu sửa cho mệnh đề sai.", "payload.answer");
  }

  if (t === "fill" || t === "listening_fill") {
    if (phpEmpty(p.blanks) || !isArrayLike(p.blanks) || entries(p.blanks).length === 0)
      fail("Thiếu blanks.", "payload.blanks");
    for (const [id, answers] of entries(p.blanks as object))
      if (!isIdKey(id) || !isAnswerList(answers))
        fail(
          "Mỗi blank cần ID và acceptedAnswers dạng danh sách không rỗng.",
          `payload.blanks.${id}`,
        );
  }

  if ((t === "closed" || t === "correction") && !isAnswerList(p.acceptedAnswers))
    fail("Cần danh sách đáp án biên tập hợp lệ.", "payload.acceptedAnswers");

  if (t === "correction" && p.errorSegment !== undefined && p.errorSegment !== null) {
    const seg = p.errorSegment as Record<string, unknown>;
    const prompt = p.prompt as string;
    if (
      !isObject(seg) ||
      !isInt(seg.start) ||
      !isInt(seg.length) ||
      seg.start < 0 ||
      seg.length < 1 ||
      seg.start + seg.length > mbLen(prompt)
    )
      fail("Vị trí lỗi không hợp lệ.", "payload.errorSegment");
  }

  if (t === "order") {
    if (!Array.isArray(p.acceptedOrders) || p.acceptedOrders.length === 0)
      fail("Thiếu acceptedOrders.", "payload.acceptedOrders");
    const tokens = p.tokens ?? [];
    const count = isArrayLike(tokens) ? entries(tokens).length : 0;
    if (!isArrayLike(tokens) || count < 2 || count > 100)
      fail("Thiếu tokens hoặc acceptedOrders.", "payload.tokens");
    for (const [id, value] of entries(tokens as object))
      if (!isIdKey(id) || !nonBlank(value, 300))
        fail("Token cần stable ID và nội dung hợp lệ.", `payload.tokens.${id}`);
    const ids = Object.keys(tokens as object);
    (p.acceptedOrders as unknown[]).forEach((order, oi) => {
      if (!Array.isArray(order)) fail("Order không hợp lệ.", `payload.acceptedOrders.${oi}`);
      if (!sortedEqual(order as unknown[], ids))
        fail("Mỗi token phải xuất hiện đúng một lần.", `payload.acceptedOrders.${oi}`);
    });
  }

  if (t === "match") {
    if (phpEmpty(p.pairs) || !isArrayLike(p.pairs) || entries(p.pairs).length === 0)
      fail("Thiếu các cặp.", "payload.pairs");
    for (const [id, pair] of entries(p.pairs as object)) {
      if (!isIdKey(id) || !isArrayLike(pair)) fail("Cặp không hợp lệ.", `payload.pairs.${id}`);
      for (const side of ["left", "right"] as const)
        if (!nonBlank((pair as Record<string, unknown>)[side]))
          fail("Vế ghép không hợp lệ.", `payload.pairs.${id}.${side}`);
    }
  }

  if (t === "self" || t === "flashcard") {
    const criteriaOk =
      typeof p.criteria === "string" ? phpTrim(p.criteria) !== "" : isAnswerList(p.criteria);
    if (!criteriaOk) fail("Cần tiêu chí tự đánh giá.", "payload.criteria");
    if (!nonBlank(p.modelAnswer, 5000))
      fail("Cần đáp án mẫu và tiêu chí tự đánh giá dạng văn bản/danh sách.", "payload.modelAnswer");
  }

  if (t.startsWith("listening_") && (publishing || !phpEmpty(p.audioId))) {
    if (phpEmpty(p.transcript)) fail("Cần transcript.", "payload.transcript");
    const audioId = Number(p.audioId ?? 0) || 0;
    if (!audioOk || !(await audioOk(audioId)))
      fail("Bài nghe cần audio hợp lệ, quyền sử dụng và transcript.", "payload.audioId");
  }
}

/** Seo::text: plain single-line text. */
export function seoText(value: unknown, max: number): string {
  const v = text(value, max, false);
  if (/[<>\x00-\x1f\x7f]/u.test(v))
    throw new AppError(422, "SEO chỉ nhận văn bản thuần trên một dòng.");
  return v;
}

export async function validateDocument(
  d: Record<string, unknown>,
  { publishing = false, audioOk }: { publishing?: boolean; audioOk?: AudioCheck } = {},
): Promise<void> {
  const fail = (path: string, message: string): never => {
    throw new AppError(422, message, { [path]: message });
  };

  if (d.seo !== undefined && d.seo !== null) {
    if (!isArrayLike(d.seo) || (Array.isArray(d.seo) && d.seo.length > 0))
      fail("seo", "SEO cần object.");
    const seo = d.seo as Record<string, unknown>;
    for (const [name, max] of [
      ["title", 160],
      ["description", 320],
    ] as const)
      if (Object.hasOwn(seo, name)) field(`seo.${name}`, () => seoText(seo[name], max));
  }

  const checks: [string, boolean][] = [
    ["schemaVersion", d.schemaVersion === 1],
    ["objectives", nonBlank(d.objectives, 2000)],
    ["minutes", isInt(d.minutes) && d.minutes >= 1 && d.minutes <= 120],
    ["passThreshold", isInt(d.passThreshold) && d.passThreshold >= 0 && d.passThreshold <= 100],
    ["blocks", Array.isArray(d.blocks) && d.blocks.length <= 100],
    ["exercises", Array.isArray(d.exercises) && d.exercises.length <= 100],
  ];
  for (const [name, valid] of checks)
    if (!valid) fail(name, `Trường bài học không hợp lệ: ${name}`);

  const ids = new Set<string>();
  const blocks = d.blocks as unknown[];
  for (const [i, raw] of blocks.entries()) {
    if (!isArrayLike(raw)) fail(`blocks.${i}`, "Block phải là object.");
    const b = raw as Record<string, unknown>;
    if (!isId(b.id) || ids.has(b.id))
      fail(`blocks.${i}.id`, "ID block không hợp lệ hoặc bị trùng.");
    if (!BLOCK_TYPES.includes(b.type as never))
      fail(`blocks.${i}.type`, "Loại block không hợp lệ.");
    ids.add(b.id as string);
    if (b.type === "audio") {
      if (publishing || !phpEmpty(b.audioId)) {
        if (phpEmpty(b.transcript)) fail(`blocks.${i}.transcript`, "Cần transcript.");
        if (!audioOk || !(await audioOk(Number(b.audioId ?? 0) || 0)))
          fail(`blocks.${i}.audioId`, "Audio cần tệp có quyền sử dụng.");
      }
    } else if (typeof b.text !== "string" || mbLen(b.text) > 20000) {
      fail(`blocks.${i}.text`, "Block cần text tối đa 20000 ký tự.");
    }
  }

  const exercises = d.exercises as unknown[];
  for (const [i, raw] of exercises.entries()) {
    if (!isArrayLike(raw)) fail(`exercises.${i}`, "Câu hỏi phải là object.");
    const e = raw as Record<string, unknown>;
    await validateExercise(e, `exercises.${i}`, publishing, audioOk);
    if (ids.has(e.id as string)) fail(`exercises.${i}.id`, "ID bị trùng.");
    ids.add(e.id as string);
  }
  if (blocks.length === 0 && exercises.length === 0) fail("exercises", "Bài học không được trống.");
}
