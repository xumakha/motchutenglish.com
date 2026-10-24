import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import {
  activeTime,
  attempts,
  items,
  lessons,
  paths,
  progress,
  units,
  versions,
  type ItemState,
} from "@/db/schema";
import { withTx } from "@/db/tx";
import { AppError, conflict, invalid } from "@/server/errors";
import type { Actor } from "../actor";
import { requireStaff, requireUserId } from "../actor";
import {
  grade,
  publicExercise,
  solution,
  type PresentedOrder,
  type PublicExercise,
} from "../assessment/grade";
import type { Exercise, Grading, LessonDocument } from "../assessment/types";
import { recordEvent } from "../events";
import { ensureQuests, lessonCompleted, questEvent } from "../motivation/hooks";
import { localDay, lockProfile, type LockedProfile } from "../motivation/profile";
import { canonicalJson, hexKey, randomHex, safeEqual, shuffle } from "../php";

// Port of application/libraries/Study.php: starting, playing, finishing and claiming lesson
// attempts. Bug fixes from the migration plan: 1 (preview shuffles and reuses its attempt),
// 2 (heartbeat never bumps the revision), 4 (retry locks and rejects finished attempts),
// 6 (view validates its position), 7 (guest claim keeps a finished attempt finished),
// 12 (placement suggestion uses the highest threshold met).

const NOT_FOUND = "Không tìm thấy lượt học.";
const OBJECTIVE = (e: Exercise) => e.type !== "self" && e.type !== "flashcard";

export type Mode = "practice" | "test";
export type Action =
  "view" | "draft" | "submit" | "skip" | "heartbeat" | "finish" | "navigate" | "audio_error";

export interface MutationInput {
  revision?: unknown;
  block?: unknown;
  position?: unknown;
  exerciseId?: unknown;
  response?: unknown;
  active?: unknown;
}

interface AttemptRow {
  attempt: typeof attempts.$inferSelect;
  document: LessonDocument;
  title: string;
  lessonId: number;
  subtype: string;
}

async function loadAttempt(q: Tx | ReturnType<typeof db>, id: string, forUpdate = false) {
  const query = q
    .select({
      attempt: attempts,
      document: versions.document,
      title: versions.title,
      lessonId: versions.lessonId,
      subtype: lessons.subtype,
    })
    .from(attempts)
    .innerJoin(versions, eq(versions.id, attempts.versionId))
    .innerJoin(lessons, eq(lessons.id, versions.lessonId))
    .where(eq(attempts.id, id));
  const [row] = forUpdate ? await query.for("update") : await query;
  return row as AttemptRow | undefined;
}

/** Study::owner: the owner or the guest who started it; preview attempts are staff-only. */
function assertOwner(a: typeof attempts.$inferSelect, actor: Actor) {
  if (a.userId !== null) {
    if (actor.userId !== a.userId) throw new AppError(404, NOT_FOUND);
  } else if (!a.guestKey || !actor.guestKey || !safeEqual(a.guestKey, actor.guestKey)) {
    throw new AppError(404, NOT_FOUND);
  }
  if (a.mode === "preview") requireStaff(actor);
}

/** Shuffled choice/token order and opaque match keys, fixed for the life of the attempt. */
function presentedOrder(e: Exercise): PresentedOrder {
  const order: PresentedOrder = {};
  const p = e.payload;
  if (p.choices) order.choices = shuffle(Object.keys(p.choices));
  if (p.tokens) order.tokens = shuffle(Object.keys(p.tokens));
  if (p.pairs)
    order.right = shuffle(Object.keys(p.pairs).map((pairId) => ({ key: randomHex(8), pairId })));
  return order;
}

async function insertAttempt(
  tx: Tx,
  values: Omit<typeof attempts.$inferInsert, "viewed">,
  doc: LessonDocument,
): Promise<void> {
  await tx.insert(attempts).values({ ...values, viewed: [] });
  if (doc.exercises.length)
    await tx.insert(items).values(
      doc.exercises.map((e) => ({
        attemptId: values.id,
        exerciseId: e.id,
        presentedOrder: presentedOrder(e),
      })),
    );
}

export async function startAttempt(
  actor: Actor,
  input: { lessonId: number; requestKey: unknown; mode: unknown },
  now = new Date(),
): Promise<string> {
  const key = hexKey(input.requestKey);
  if (input.mode !== "practice" && input.mode !== "test") throw invalid("Chế độ học không hợp lệ.");
  let mode: Mode = input.mode;
  return withTx(async (tx) => {
    const uid = actor.userId;
    const [kind] = await tx
      .select({ subtype: lessons.subtype })
      .from(lessons)
      .where(eq(lessons.id, input.lessonId));
    if (kind?.subtype === "placement") mode = "test";
    if (uid !== null) await ensureQuests(tx, uid, await lockProfile(tx, uid, { now }));

    const existing = await loadAttempt(tx, key);
    if (existing) {
      assertOwner(existing.attempt, actor);
      if (existing.lessonId !== input.lessonId || existing.attempt.mode !== mode)
        throw conflict("Mã yêu cầu đã dùng cho bài khác.");
      return key;
    }

    const [v] = await tx
      .select({ id: versions.id, document: versions.document })
      .from(lessons)
      .innerJoin(versions, eq(versions.id, lessons.currentVersion))
      .innerJoin(units, eq(units.id, lessons.unitId))
      .innerJoin(paths, eq(paths.id, units.pathId))
      .where(
        and(
          eq(lessons.id, input.lessonId),
          eq(units.archived, false),
          eq(lessons.archived, false),
          eq(versions.status, "published"),
          eq(paths.status, "published"),
        ),
      );
    if (!v) throw new AppError(404, "Bài học chưa khả dụng.");
    if (uid === null && (!v.document.preview || !actor.guestKey))
      throw new AppError(401, "Bạn cần đăng nhập để lưu bài học này.");

    await insertAttempt(
      tx,
      {
        id: key,
        userId: uid,
        guestKey: uid === null ? actor.guestKey : null,
        versionId: v.id,
        mode,
        lastHeartbeat: now,
      },
      v.document,
    );
    await recordEvent(
      `start:${key}`,
      "lesson_started",
      String(input.lessonId),
      uid,
      tx,
      actor.marketing,
    );
    return key;
  });
}

/** Staff preview of any version. Fix 1: shuffled like a real attempt, and reused per staff user. */
export async function previewAttempt(actor: Actor, versionId: number): Promise<string> {
  const uid = requireStaff(actor);
  return withTx(async (tx) => {
    const [v] = await tx.select().from(versions).where(eq(versions.id, versionId));
    if (!v) throw new AppError(404, "Không tìm thấy phiên bản.");
    const [open] = await tx
      .select({ id: attempts.id })
      .from(attempts)
      .where(
        and(
          eq(attempts.userId, uid),
          eq(attempts.versionId, versionId),
          eq(attempts.mode, "preview"),
          eq(attempts.status, "active"),
        ),
      )
      .limit(1);
    if (open) return open.id;
    const key = randomHex(16);
    await insertAttempt(tx, { id: key, userId: uid, versionId, mode: "preview" }, v.document);
    return key;
  });
}

export async function readAttempt(actor: Actor, id: unknown): Promise<AttemptRow> {
  const row = await loadAttempt(db(), hexKey(id));
  if (!row) throw new AppError(404, NOT_FOUND);
  assertOwner(row.attempt, actor);
  return row;
}

/** Study::response: match answers arrive as {leftPairId: opaqueRightKey}. */
export function decodeResponse(e: Exercise, response: unknown, order: PresentedOrder): unknown {
  if (e.type !== "match" || typeof response !== "object" || response === null) return response;
  const byKey = new Map((order.right ?? []).map((r) => [r.key, r.pairId]));
  const decoded: Record<string, string> = {};
  for (const [id, opaque] of Object.entries(response)) {
    const pairId = typeof opaque === "string" ? byKey.get(opaque) : undefined;
    if (!pairId) throw invalid("Đáp án ghép không hợp lệ.");
    decoded[id] = pairId;
  }
  return decoded;
}

const exerciseById = (doc: LessonDocument, id: string) => doc.exercises.find((e) => e.id === id);

const sameResponse = (stored: unknown, given: unknown) =>
  stored !== null && stored !== undefined && canonicalJson(stored) === canonicalJson(given ?? null);

const isPosition = (doc: LessonDocument, p: unknown): p is number =>
  typeof p === "number" && Number.isInteger(p) && p >= 0 && p < Math.max(1, doc.exercises.length);

export async function mutateAttempt(
  actor: Actor,
  id: unknown,
  action: Action,
  input: MutationInput,
  now = new Date(),
): Promise<{ saved: true } | { finished: true }> {
  const key = hexKey(id);
  const owner = await readAttempt(actor, key);
  const uid = owner.attempt.userId;

  return withTx(async (tx) => {
    const profile = uid !== null ? await lockProfile(tx, uid, { now }) : null;
    const row = await loadAttempt(tx, key, true);
    if (!row) throw new AppError(404, NOT_FOUND);
    const a = row.attempt;
    assertOwner(a, actor);
    if (uid !== null && profile && a.mode !== "preview") await ensureQuests(tx, uid, profile);
    const doc = row.document;

    // Repeats of an action that already took effect succeed without a revision check.
    if (action === "finish" && a.status === "finished") return { finished: true };
    if (a.status === "finished") throw conflict("Bài đã hoàn thành. Bạn có thể bắt đầu lượt mới.");
    if (action === "view" && a.viewed.includes(String(input.block ?? ""))) return { saved: true };
    if (
      action === "navigate" &&
      typeof input.position === "number" &&
      input.position === a.position
    )
      return { saved: true };
    const exerciseId = String(input.exerciseId ?? "");
    const [item] =
      action === "draft" || action === "submit" || action === "skip" || action === "audio_error"
        ? await tx
            .select()
            .from(items)
            .where(and(eq(items.attemptId, key), eq(items.exerciseId, exerciseId)))
        : [];
    if (
      action === "draft" &&
      item?.state === "draft" &&
      sameResponse(item.response, input.response)
    )
      return { saved: true };
    if (
      item &&
      ((action === "submit" &&
        item.state === "submitted" &&
        sameResponse(item.firstResponse, input.response)) ||
        (action === "skip" && item.state === "skipped") ||
        (action === "audio_error" && item.state === "unavailable"))
    )
      return { saved: true };

    // Fix 2: heartbeats only record time, so they neither need nor change the revision.
    if (action !== "heartbeat" && input.revision !== a.revision)
      throw conflict("Bài đã thay đổi ở tab khác. Bản mới đã được giữ; hãy tải lại.");

    switch (action) {
      case "navigate": {
        if (!isPosition(doc, input.position)) throw invalid("Vị trí học không hợp lệ.");
        await tx.update(attempts).set({ position: input.position }).where(eq(attempts.id, key));
        break;
      }
      case "view": {
        const block = String(input.block ?? "");
        if (!doc.blocks.some((b) => b.id === block)) throw invalid("Mục nội dung không hợp lệ.");
        // Fix 6: the position sent with a view must be a real exercise position.
        const position = input.position === undefined ? a.position : input.position;
        if (!isPosition(doc, position)) throw invalid("Vị trí học không hợp lệ.");
        await tx
          .update(attempts)
          .set({ viewed: [...new Set([...a.viewed, block])], position })
          .where(eq(attempts.id, key));
        break;
      }
      case "draft":
      case "submit":
      case "skip":
      case "audio_error":
        await answer(tx, row, action, exerciseId, input.response, profile);
        break;
      case "heartbeat":
        await heartbeat(tx, row, input.active === true, profile, now);
        return { saved: true };
      case "finish":
        await finish(tx, row, profile, now);
        break;
      default:
        throw invalid("Thao tác không hợp lệ.");
    }
    await tx
      .update(attempts)
      .set({ revision: sql`${attempts.revision} + 1` })
      .where(eq(attempts.id, key));
    return { saved: true };
  });
}

async function answer(
  tx: Tx,
  row: AttemptRow,
  action: "draft" | "submit" | "skip" | "audio_error",
  exerciseId: string,
  response: unknown,
  profile: LockedProfile | null,
) {
  const a = row.attempt;
  const exercise = exerciseById(row.document, exerciseId);
  if (!exercise) throw new AppError(404, "Không tìm thấy câu hỏi.");
  const [item] = await tx
    .select()
    .from(items)
    .where(and(eq(items.attemptId, a.id), eq(items.exerciseId, exerciseId)));
  if (!item) throw new AppError(404, "Không tìm thấy câu hỏi.");
  if (item.state === "submitted" || item.state === "skipped" || item.state === "unavailable")
    throw conflict("Câu này đã nộp. Kết quả lần đầu được giữ nguyên.");
  if (Buffer.byteLength(JSON.stringify(response ?? null)) > 12000) throw invalid("Đáp án quá dài.");

  let grading: Grading | null = null;
  let state: ItemState = "draft";
  if (action === "submit") {
    grading = grade(exercise, decodeResponse(exercise, response, item.presentedOrder));
    state = "submitted";
  } else if (action === "skip") {
    state = "skipped";
    grading = solution(exercise);
    if (grading.gradingMode === "objective") {
      grading.score = 0;
      grading.isCorrect = false;
    }
    grading.feedback = `Bạn đã bỏ qua câu này. ${grading.feedback}`;
  } else if (action === "audio_error") {
    if (!exercise.type.startsWith("listening_")) throw invalid("Câu này không phải bài nghe.");
    state = "unavailable";
    grading = {
      ...solution(exercise),
      score: null,
      maxScore: null,
      isCorrect: null,
      gradingMode: "unavailable",
      feedback: "Audio chưa khả dụng. Câu này không được tính là sai và không có điểm khách quan.",
    };
  }

  await tx
    .update(items)
    .set({
      response: response ?? null,
      state,
      firstResponse: state === "submitted" ? (response ?? null) : null,
      grading,
    })
    .where(and(eq(items.attemptId, a.id), eq(items.exerciseId, exerciseId)));

  if (action === "draft") return;
  const uid = a.userId;
  if (a.mode !== "preview")
    await recordEvent(`exercise:${a.id}:${exerciseId}`, "exercise_submitted", exerciseId, uid, tx);
  if (a.mode === "practice" && uid !== null && profile?.gamification && grading?.isCorrect)
    await questEvent(tx, uid, profile, "correct", `question:${row.lessonId}:${exerciseId}`);
}

async function heartbeat(
  tx: Tx,
  row: AttemptRow,
  active: boolean,
  profile: LockedProfile | null,
  now: Date,
) {
  const a = row.attempt;
  if (active && a.lastHeartbeat) {
    const elapsed = Math.floor((now.getTime() - a.lastHeartbeat.getTime()) / 1000);
    if (elapsed > 0 && elapsed <= 45) {
      await tx
        .update(attempts)
        .set({ activeSeconds: sql`${attempts.activeSeconds} + ${Math.min(30, elapsed)}` })
        .where(eq(attempts.id, a.id));
      if (a.userId !== null && profile && a.mode !== "preview") {
        const day = localDay(profile, now);
        const [time] = await tx
          .select()
          .from(activeTime)
          .where(and(eq(activeTime.userId, a.userId), eq(activeTime.localDate, day)))
          .for("update");
        // Several tabs pulse at once; count wall-clock time since the last pulse only once.
        const sinceLastPulse = time
          ? Math.floor((now.getTime() - time.lastPulse.getTime()) / 1000)
          : elapsed;
        const delta = time
          ? Math.max(0, Math.min(30, elapsed, sinceLastPulse))
          : Math.min(30, elapsed);
        await tx
          .insert(activeTime)
          .values({ userId: a.userId, localDate: day, seconds: delta, lastPulse: now })
          .onDuplicateKeyUpdate({
            set: { seconds: sql`${activeTime.seconds} + ${delta}`, lastPulse: now },
          });
      }
    }
  }
  await tx.update(attempts).set({ lastHeartbeat: now }).where(eq(attempts.id, a.id));
}

/** Score, maximum and whether any listening item was unavailable. */
async function tally(tx: Tx, row: AttemptRow, requireResolved: boolean) {
  const all = await tx.select().from(items).where(eq(items.attemptId, row.attempt.id));
  let score = 0;
  let max = 0;
  let unavailable = false;
  for (const item of all) {
    if (requireResolved && !["submitted", "skipped", "unavailable"].includes(item.state))
      throw invalid("Hãy kết thúc các câu luyện tập trước khi hoàn thành.");
    if (item.state === "unavailable") unavailable = true;
    const e = exerciseById(row.document, item.exerciseId);
    if (item.grading) {
      score += item.grading.score ?? 0;
      max += item.grading.maxScore ?? 0;
    } else if (e && OBJECTIVE(e)) {
      max +=
        e.type === "fill" || e.type === "listening_fill"
          ? Object.keys(e.payload.blanks ?? {}).length
          : e.type === "match" && e.payload.partialCredit
            ? Object.keys(e.payload.pairs ?? {}).length
            : 1;
    }
  }
  return { all, score, max, unavailable };
}

/** Progress row and completion rewards for a finished, owned, non-preview attempt. */
async function recordCompletion(
  tx: Tx,
  row: AttemptRow,
  uid: number,
  profile: LockedProfile,
  t: { score: number; max: number; unavailable: boolean },
  now: Date,
) {
  if (row.attempt.mode === "preview" || row.subtype === "placement") return;
  const [prior] = await tx
    .select({ userId: progress.userId })
    .from(progress)
    .where(and(eq(progress.userId, uid), eq(progress.lessonId, row.lessonId)));
  const passed = !t.unavailable && t.max > 0 && t.score * 100 >= t.max * row.document.passThreshold;
  const percent = t.max ? Math.floor((t.score * 100) / t.max) : null;
  await tx
    .insert(progress)
    .values({
      userId: uid,
      lessonId: row.lessonId,
      firstScore: percent,
      bestScore: percent,
      completedAt: now,
      passedAt: passed ? now : null,
    })
    .onDuplicateKeyUpdate({
      set: {
        bestScore: sql`IF(VALUES(best_score) IS NULL, best_score, GREATEST(COALESCE(best_score, 0), VALUES(best_score)))`,
        passedAt: sql`COALESCE(passed_at, VALUES(passed_at))`,
      },
    });
  await lessonCompleted(tx, uid, profile, {
    id: row.lessonId,
    subtype: row.subtype,
    passed,
    objective: t.max > 0,
    first: !prior,
  });
}

async function finish(tx: Tx, row: AttemptRow, profile: LockedProfile | null, now: Date) {
  const a = row.attempt;
  const required = row.document.blocks.filter((b) => b.required ?? true).map((b) => b.id);
  if (required.some((id) => !a.viewed.includes(id)))
    throw invalid("Hãy đọc các mục nội dung bắt buộc trước khi hoàn thành.");
  const t = await tally(tx, row, true);
  await tx
    .update(attempts)
    .set({
      status: "finished",
      score: t.max ? t.score : null,
      maxScore: t.max || null,
      finishedAt: now,
    })
    .where(eq(attempts.id, a.id));

  const uid = a.userId;
  if (uid !== null && profile?.gamification && a.mode === "test" && row.subtype !== "placement")
    for (const item of t.all)
      if (item.grading?.isCorrect)
        await questEvent(
          tx,
          uid,
          profile,
          "correct",
          `question:${row.lessonId}:${item.exerciseId}`,
        );
  if (uid !== null && profile) await recordCompletion(tx, row, uid, profile, t, now);
  if (a.mode !== "preview")
    await recordEvent(
      `finish:${a.id}:${uid ?? "guest"}`,
      row.subtype === "placement" ? "placement_completed" : "lesson_completed",
      String(row.lessonId),
      uid,
      tx,
    );
}

/**
 * Grade a different answer for practice without changing the first result. Fix 4: runs under the
 * attempt lock and only while the attempt is active.
 */
export async function retryExercise(
  actor: Actor,
  id: unknown,
  exerciseId: unknown,
  response: unknown,
) {
  const key = hexKey(id);
  await readAttempt(actor, key);
  return withTx(async (tx) => {
    const row = await loadAttempt(tx, key, true);
    if (!row) throw new AppError(404, NOT_FOUND);
    assertOwner(row.attempt, actor);
    if (row.attempt.mode === "test")
      throw new AppError(403, "Chế độ kiểm tra không chấm thử lại từng câu.");
    if (row.attempt.status === "finished")
      throw conflict("Bài đã hoàn thành. Bạn có thể bắt đầu lượt mới.");
    const eid = String(exerciseId ?? "");
    const [item] = await tx
      .select()
      .from(items)
      .where(and(eq(items.attemptId, key), eq(items.exerciseId, eid)));
    const exercise = exerciseById(row.document, eid);
    if (!item || item.state !== "submitted" || !exercise)
      throw invalid("Nộp lần đầu trước khi luyện lại.");
    return {
      feedback: grade(exercise, decodeResponse(exercise, response, item.presentedOrder)),
      firstScorePreserved: true as const,
    };
  });
}

export interface PublicItem {
  exercise: PublicExercise;
  state: string;
  response: unknown;
  feedback: Grading | null;
}

/** What the player sees. Answers stay hidden until feedback is allowed (test mode: after finish). */
export async function publicAttempt(row: AttemptRow) {
  const a = row.attempt;
  const doc = row.document;
  const stored = await db().select().from(items).where(eq(items.attemptId, a.id));
  const byId = new Map(stored.map((i) => [i.exerciseId, i]));
  const showFeedback = a.mode !== "test" || a.status === "finished";

  const publicItems: PublicItem[] = doc.exercises.map((e) => {
    const i = byId.get(e.id);
    let feedback = i?.grading && showFeedback ? { ...i.grading } : null;
    if (feedback && e.payload.transcript !== undefined)
      feedback = { ...feedback, transcript: e.payload.transcript };
    return {
      exercise: publicExercise(e, i?.presentedOrder ?? {}),
      state: i?.state ?? "unanswered",
      response: i?.response ?? null,
      feedback,
    };
  });

  // Test mode hides audio transcripts until the attempt is finished.
  const hideTranscripts = a.mode === "test" && a.status !== "finished";
  const blocks = doc.blocks.map((b) => {
    if (!hideTranscripts || b.type !== "audio") return b;
    const { transcript: _hidden, ...rest } = b;
    return rest;
  });

  // Fix 12: suggest the path with the highest threshold the learner reached.
  let suggestion: string | null = null;
  if (a.status === "finished" && doc.blueprint?.rules) {
    const percent = a.maxScore ? (100 * (a.score ?? 0)) / a.maxScore : 0;
    const met = doc.blueprint.rules.filter((r) => percent >= r.minPercent);
    met.sort((x, y) => y.minPercent - x.minPercent);
    suggestion = met[0]?.pathSlug ?? null;
  }

  return {
    canSaveConcepts: a.userId !== null && a.mode !== "preview" && a.status === "finished",
    id: a.id,
    title: row.title,
    revision: a.revision,
    mode: a.mode,
    status: a.status,
    position: a.position,
    blocks,
    viewed: a.viewed,
    items: publicItems,
    score: a.status === "finished" ? a.score : null,
    maxScore: a.status === "finished" ? a.maxScore : null,
    objectives: doc.objectives,
    versionId: a.versionId,
    lessonId: row.lessonId,
    passThreshold: doc.passThreshold,
    suggestion,
    skipped: publicItems.filter((i) => i.state === "skipped").length,
    audioUnavailable: publicItems.some((i) => i.state === "unavailable"),
  };
}

export type PublicAttempt = Awaited<ReturnType<typeof publicAttempt>>;

/**
 * Move a guest attempt to the signed-in learner. Fix 7: a finished attempt stays finished; its
 * server-side grading is kept and progress is recorded for the new owner.
 */
export async function claimGuestAttempt(
  actor: Actor,
  id: unknown,
  now = new Date(),
): Promise<void> {
  const uid = requireUserId(actor);
  const key = hexKey(id);
  await withTx(async (tx) => {
    const profile = await lockProfile(tx, uid, { now });
    const row = await loadAttempt(tx, key, true);
    if (!row) throw new AppError(404, NOT_FOUND);
    if (row.attempt.userId !== null) {
      if (row.attempt.userId === uid) return;
      throw conflict("Lượt học đã có chủ sở hữu.");
    }
    assertOwner(row.attempt, actor);
    await tx
      .update(attempts)
      .set({ userId: uid, guestKey: null, revision: sql`${attempts.revision} + 1` })
      .where(eq(attempts.id, key));
    if (row.attempt.status === "finished") {
      const t = await tally(tx, row, false);
      await recordCompletion(
        tx,
        { ...row, attempt: { ...row.attempt, userId: uid } },
        uid,
        profile,
        t,
        now,
      );
    }
  });
}
