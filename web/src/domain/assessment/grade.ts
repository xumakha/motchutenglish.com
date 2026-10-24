import { AppError } from "@/server/errors";
import { isObject, mbLen } from "../php";
import type { Exercise, Grading, Payload } from "./types";

export type { Grading } from "./types";

// Port of Assessment::normalize, grade, solution and publicExercise.

// PCRE \s without UCP is ASCII whitespace; \p{Z} adds Unicode separators (NBSP, thin space, …).
const SPACE = "[ \\t\\n\\x0B\\f\\r\\p{Z}]";
const COLLAPSE = new RegExp(`${SPACE}+`, "gu");
const TRIM = new RegExp(`^${SPACE}+|${SPACE}+$`, "gu");
// PCRE's `$` also matches before a final newline, which matters with whitespace "preserve".
const TERMINAL_PUNCTUATION = /[.!?]+(?=\n?$)/u;

export function normalize(input: string, p: Partial<Payload> = {}): string {
  let s = input.normalize("NFC");
  const policy = p.whitespace ?? "collapse";
  if (policy === "collapse") s = s.replace(COLLAPSE, " ");
  if (policy !== "preserve") s = s.replace(TRIM, "");
  if (p.ignoreTerminalPunctuation) s = s.replace(TERMINAL_PUNCTUATION, "");
  if (policy !== "preserve") s = s.replace(TRIM, "");
  return p.caseSensitive ? s : s.toLowerCase();
}

const invalid = (message: string) => new AppError(422, message);

const sameList = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export function grade(e: Exercise, r: unknown): Grading {
  const p = e.payload;
  const t = e.type;
  if (t === "self" || t === "flashcard")
    return {
      score: null,
      maxScore: null,
      isCorrect: null,
      feedback: e.explanation,
      acceptedAnswerDisplay: p.modelAnswer!,
      gradingMode: "self_assessed",
      criteria: p.criteria,
    };

  let correct = false;
  let max = 1;
  let score = 0;
  let display = "";

  if (t === "choice" || t === "listening_choice") {
    const choices = p.choices!;
    if (typeof r !== "string" || !Object.hasOwn(choices, r))
      throw invalid("Chọn một đáp án hợp lệ.");
    correct = r === p.answerId;
    display = choices[p.answerId!]!;
  } else if (t === "true_false") {
    if (typeof r !== "boolean") throw invalid("Đáp án phải là đúng hoặc sai.");
    correct = r === p.answer;
    display = p.answer ? "Đúng" : `Sai. ${p.correction}`;
  } else if (t === "fill" || t === "listening_fill") {
    const blanks = p.blanks!;
    const ids = Object.keys(blanks);
    if (!isObject(r)) throw invalid("Điền đủ các ô trống.");
    const given = Object.keys(r);
    if (given.length !== ids.length || !ids.every((id) => Object.hasOwn(r, id)))
      throw invalid("Điền đủ các ô trống.");
    max = ids.length;
    let n = 0;
    const answers: string[] = [];
    for (const [id, accepted] of Object.entries(blanks)) {
      const value = r[id];
      if (typeof value !== "string") throw invalid("Đáp án không hợp lệ.");
      const match = accepted.map((s) => normalize(s, p));
      if (match.includes(normalize(value, p))) n++;
      answers.push(`Ô ${answers.length + 1}: ${accepted.join(" / ")}`);
    }
    score = n;
    correct = n === max;
    display = answers.join("; ");
  } else if (t === "closed" || t === "correction") {
    if (typeof r !== "string" || mbLen(r) > 4000) throw invalid("Đáp án không hợp lệ.");
    const accepted = p.acceptedAnswers!;
    correct = accepted.map((s) => normalize(s, p)).includes(normalize(r, p));
    display = accepted.join(" / ");
  } else if (t === "order") {
    if (!Array.isArray(r)) throw invalid("Thứ tự không hợp lệ.");
    const tokens = p.tokens!;
    const ids = Object.keys(tokens).sort();
    const sorted = [...r].sort();
    if (!r.every((v) => typeof v === "string") || !sameList(ids, sorted))
      throw invalid("Mỗi token phải được dùng đúng một lần.");
    correct = p.acceptedOrders!.some((order) => sameList(order, r));
    display = p.acceptedOrders![0]!.map((id) => tokens[id]).join(" ");
  } else if (t === "match") {
    const pairs = p.pairs!;
    const pairIds = Object.keys(pairs);
    // PHP accepts any array here; a list then fails the per-pair lookup below.
    if (typeof r !== "object" || r === null) throw invalid("Ghép đủ các cặp, không dùng trùng.");
    const given = r as Record<string, unknown>;
    const values = Object.values(given);
    if (
      values.length !== pairIds.length ||
      !values.every((v) => typeof v === "string") ||
      new Set(values).size !== values.length
    )
      throw invalid("Ghép đủ các cặp, không dùng trùng.");
    let n = 0;
    for (const id of pairIds) {
      const chosen = Object.hasOwn(given, id) ? given[id] : undefined;
      if (typeof chosen !== "string" || !Object.hasOwn(pairs, chosen))
        throw invalid("Cặp không hợp lệ.");
      if (chosen === id) n++;
    }
    correct = n === pairIds.length;
    max = p.partialCredit ? pairIds.length : 1;
    score = p.partialCredit ? n : correct ? 1 : 0;
    display = Object.values(pairs)
      .map((v) => `${v.left} = ${v.right}`)
      .join("; ");
  } else {
    throw invalid("Dạng bài chưa được hỗ trợ.");
  }

  if (t !== "fill" && t !== "listening_fill" && t !== "match") score = correct ? 1 : 0;
  return {
    score,
    maxScore: max,
    isCorrect: correct,
    feedback: e.explanation,
    acceptedAnswerDisplay: display,
    gradingMode: "objective",
  };
}

/** The canonical correct response for an exercise (used by skip and audio_error). */
export function solutionResponse(e: Exercise): unknown {
  const p = e.payload;
  switch (e.type) {
    case "choice":
    case "listening_choice":
      return p.answerId;
    case "true_false":
      return p.answer;
    case "fill":
    case "listening_fill":
      return Object.fromEntries(Object.entries(p.blanks!).map(([id, a]) => [id, a[0]]));
    case "closed":
    case "correction":
      return p.acceptedAnswers![0];
    case "order":
      return p.acceptedOrders![0];
    case "match":
      return Object.fromEntries(Object.keys(p.pairs!).map((id) => [id, id]));
    default:
      return "";
  }
}

export const solution = (e: Exercise): Grading => grade(e, solutionResponse(e));

// ---- Public (answer-free) view ----

const SECRET_KEYS = [
  "answerId",
  "answer",
  "correction",
  "acceptedAnswers",
  "acceptedOrders",
  "modelAnswer",
  "criteria",
  "transcript",
] as const;

/**
 * What the learner may see before answering. Order-sensitive collections are arrays (plan §3.5);
 * `order` supplies the shuffled order chosen when the attempt started.
 */
export interface PublicExercise {
  id: string;
  type: Exercise["type"];
  payload: Record<string, unknown> & {
    choices?: { id: string; text: string }[];
    tokens?: { id: string; text: string }[];
    blanks?: string[];
    left?: { id: string; text: string }[];
    right?: { key: string; text: string }[];
  };
}

export interface PresentedOrder {
  choices?: string[];
  tokens?: string[];
  right?: { key: string; pairId: string }[];
}

export function publicExercise(e: Exercise, order: PresentedOrder = {}): PublicExercise {
  const p: Record<string, unknown> = { ...e.payload };
  for (const key of SECRET_KEYS) delete p[key];
  const src = e.payload;
  if (src.choices) {
    const ids = order.choices ?? Object.keys(src.choices);
    p.choices = ids.map((id) => ({ id, text: src.choices![id]! }));
  }
  if (src.tokens) {
    const ids = order.tokens ?? Object.keys(src.tokens);
    p.tokens = ids.map((id) => ({ id, text: src.tokens![id]! }));
  }
  if (src.blanks) p.blanks = Object.keys(src.blanks);
  if (src.pairs) {
    const pairs = src.pairs;
    delete p.pairs;
    p.left = Object.entries(pairs).map(([id, v]) => ({ id, text: v.left }));
    p.right = (order.right ?? Object.keys(pairs).map((id) => ({ key: id, pairId: id }))).map(
      ({ key, pairId }) => ({ key, text: pairs[pairId]!.right }),
    );
  }
  return { id: e.id, type: e.type, payload: p as PublicExercise["payload"] };
}
