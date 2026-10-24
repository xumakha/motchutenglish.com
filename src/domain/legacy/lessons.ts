import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  learningAttempts,
  learningAudit,
  learningEvents,
  learningLessons,
  rewardLedger,
} from "@/db/schema";
import { withTx } from "@/db/tx";
import { AppError, conflict, invalid } from "@/server/errors";
import { requireStaff, requireUserId, type Actor } from "../actor";
import { hexKey, mbLen, phpTrim, safeEqual } from "../php";

// The original single-question lessons (application/controllers/Learning.php and
// libraries/Learning.php): editors write drafts with two choices, admins publish, learners start
// an immutable snapshot and submit once. Rewards keep their legacy keys (no "v2:" prefix):
// +20 XP on the first completion of a lesson, +5 when correct.

type LegacyLesson = typeof learningLessons.$inferSelect;

export async function listLegacyLessons(actor: Actor, section: "hoc" | "admin") {
  const uid = requireUserId(actor);
  if (section === "admin") requireStaff(actor);
  const lessons = await db()
    .select({
      id: learningLessons.id,
      title: learningLessons.title,
      status: learningLessons.status,
    })
    .from(learningLessons)
    .where(section === "admin" ? undefined : eq(learningLessons.status, "published"))
    .orderBy(asc(learningLessons.id));
  const history = await db()
    .select({
      id: learningAttempts.id,
      score: learningAttempts.score,
      submittedAt: learningAttempts.submittedAt,
      snapshot: learningAttempts.snapshot,
    })
    .from(learningAttempts)
    .where(eq(learningAttempts.userId, uid))
    .orderBy(desc(learningAttempts.submittedAt))
    .limit(20);
  const [xp] = await db()
    .select({ total: sql<number>`COALESCE(SUM(${rewardLedger.amount}), 0)`.mapWith(Number) })
    .from(rewardLedger)
    .where(and(eq(rewardLedger.userId, uid), eq(rewardLedger.currency, "xp")));
  return { lessons, history, xp: xp?.total ?? 0 };
}

/** A draft for the edit form (published lessons are never edited). */
export async function legacyDraft(actor: Actor, id: number) {
  requireStaff(actor);
  const [draft] = await db()
    .select()
    .from(learningLessons)
    .where(and(eq(learningLessons.id, id), eq(learningLessons.status, "draft")));
  return draft ?? null;
}

export interface LegacyLessonInput {
  action: "create" | "edit";
  lessonId?: number;
  title: string;
  body: string;
  question: string;
  explanation: string;
  one: string;
  two: string;
  answer: string;
}

const INVALID_LESSON = "Điền đủ nội dung, hai lựa chọn và đáp án đúng; kiểm tra giới hạn độ dài.";
const bytes = (s: string) => Buffer.byteLength(s);

export async function saveLegacyLesson(actor: Actor, input: LegacyLessonInput): Promise<void> {
  const uid = requireStaff(actor);
  const title = phpTrim(input.title);
  const body = phpTrim(input.body);
  const question = phpTrim(input.question);
  const explanation = phpTrim(input.explanation);
  const choices = { one: phpTrim(input.one), two: phpTrim(input.two) };
  if (
    title === "" ||
    mbLen(title) > 200 ||
    body === "" ||
    bytes(body) > 30000 ||
    question === "" ||
    bytes(question) > 5000 ||
    explanation === "" ||
    bytes(explanation) > 5000 ||
    Object.values(choices).includes("") ||
    Math.max(...Object.values(choices).map(bytes)) > 2000 ||
    !Object.hasOwn(choices, input.answer)
  )
    throw invalid(INVALID_LESSON);
  const values = { title, body, question, choices, answerId: input.answer, explanation };

  if (input.action === "edit") {
    await withTx(async (tx) => {
      const [row] = await tx
        .select({ status: learningLessons.status })
        .from(learningLessons)
        .where(eq(learningLessons.id, input.lessonId ?? 0))
        .for("update");
      if (row?.status !== "draft")
        throw invalid("Chỉ được sửa bài nháp. Bài xuất bản được giữ nguyên.");
      await tx.update(learningLessons).set(values).where(eq(learningLessons.id, input.lessonId!));
    });
    return;
  }
  await db()
    .insert(learningLessons)
    .values({ ...values, createdBy: uid });
}

export async function publishLegacyLesson(actor: Actor, lessonId: number): Promise<void> {
  const uid = requireStaff(actor, true);
  await withTx(async (tx) => {
    const [result] = await tx
      .update(learningLessons)
      .set({ status: "published" })
      .where(and(eq(learningLessons.id, lessonId), eq(learningLessons.status, "draft")));
    if ((result as { affectedRows?: number }).affectedRows)
      await tx
        .insert(learningAudit)
        .values({ actorId: uid, action: "publish", targetId: lessonId });
  });
}

/** learning_grade: 1 when the response is the answer, 0 otherwise; unknown choice → 422. */
export function gradeLegacy(
  lesson: Pick<LegacyLesson, "choices" | "answerId">,
  response: string,
): 0 | 1 {
  if (!Object.hasOwn(lesson.choices, response)) throw invalid("Vui lòng chọn một đáp án hợp lệ.");
  return safeEqual(lesson.answerId, response) ? 1 : 0;
}

/** Staff preview: grade without saving anything. */
export async function previewLegacy(actor: Actor, lessonId: number, response?: string) {
  requireStaff(actor);
  const [lesson] = await db()
    .select()
    .from(learningLessons)
    .where(eq(learningLessons.id, lessonId));
  if (!lesson) throw new AppError(404, "Không tìm thấy bài học.");
  const score = response === undefined ? null : gradeLegacy(lesson, response);
  return { lesson, score };
}

/** Start (or resume) a snapshot of a published lesson; the request key makes refreshes safe. */
export async function startLegacy(
  actor: Actor,
  lessonId: number,
  requestKey: unknown,
): Promise<string> {
  const uid = requireUserId(actor);
  const [lesson] = await db()
    .select()
    .from(learningLessons)
    .where(and(eq(learningLessons.id, lessonId), eq(learningLessons.status, "published")));
  if (!lesson) throw new AppError(404, "Không tìm thấy bài học.");
  let id: string;
  try {
    id = hexKey(requestKey);
  } catch {
    throw invalid("Yêu cầu không hợp lệ.");
  }
  await db()
    .insert(learningAttempts)
    .values({ id, userId: uid, lessonId, snapshot: lesson as unknown as Record<string, unknown> })
    .onDuplicateKeyUpdate({ set: { id: sql`id` } });
  const [owner] = await db()
    .select({ userId: learningAttempts.userId, lessonId: learningAttempts.lessonId })
    .from(learningAttempts)
    .where(eq(learningAttempts.id, id));
  if (owner?.userId !== uid || owner.lessonId !== lessonId)
    throw conflict("Yêu cầu đã được dùng cho lượt học khác.");
  return id;
}

export async function legacyAttempt(actor: Actor, id: string) {
  const uid = requireUserId(actor);
  const [attempt] = await db()
    .select()
    .from(learningAttempts)
    .where(and(eq(learningAttempts.id, id), eq(learningAttempts.userId, uid)));
  if (!attempt) throw new AppError(404, "Không tìm thấy lượt học.");
  return { attempt, lesson: attempt.snapshot as unknown as LegacyLesson };
}

/** Submit once. Re-sending the same answer is fine; a different answer is a 409. */
export async function submitLegacy(actor: Actor, id: string, response: string): Promise<void> {
  const uid = requireUserId(actor);
  await withTx(async (tx) => {
    const [a] = await tx
      .select()
      .from(learningAttempts)
      .where(and(eq(learningAttempts.id, id), eq(learningAttempts.userId, uid)))
      .for("update");
    if (!a) throw new AppError(404, "Không tìm thấy lượt học.");
    if (a.submittedAt !== null && a.response !== response)
      throw conflict("Bài đã được nộp với đáp án khác. Kết quả lần đầu được giữ nguyên.");
    if (a.submittedAt !== null) return;
    const score = gradeLegacy(a.snapshot as unknown as LegacyLesson, response);
    await tx
      .update(learningAttempts)
      .set({ response, score, submittedAt: new Date() })
      .where(eq(learningAttempts.id, id));
    await tx.insert(learningEvents).values({
      eventKey: `completed:${id}`,
      userId: uid,
      lessonId: a.lessonId,
      attemptId: id,
      eventType: "lesson_completed",
      payload: { score, maxScore: 1, ruleVersion: 1 },
    });
    const reward = (amount: number, eventKey: string) =>
      tx
        .insert(rewardLedger)
        .values({ userId: uid, amount, eventKey })
        .onDuplicateKeyUpdate({ set: { eventKey: sql`event_key` } });
    await reward(20, `completion:${uid}:${a.lessonId}`);
    if (score === 1) await reward(5, `pass:${uid}:${a.lessonId}`);
  });
}
