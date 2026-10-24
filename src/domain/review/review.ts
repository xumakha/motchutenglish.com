import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { db, type Tx } from "@/db/client";
import {
  items,
  reviewCards,
  reviewEvents,
  userVocabulary,
  vocabulary,
  type CardSnapshot,
  type Schedule,
} from "@/db/schema";
import { withTx } from "@/db/tx";
import { AppError, conflict, invalid } from "@/server/errors";
import { requireUserId, type Actor } from "../actor";
import { recordEvent } from "../events";
import { ensureQuests, reviewRewarded } from "../motivation/rewards";
import { localDay, lockProfile, type LockedProfile } from "../motivation/profile";
import { field, hexKey, text } from "../php";
import { readAttempt } from "../study/attempts";

// Port of application/libraries/Review.php and the review/vocabulary routes of Product::execute.
// Fix 15: re-adding a card refreshes its snapshot (the learner explicitly asked for it again, so
// it also becomes visible again).

export type Rating = "again" | "hard" | "good" | "easy";
const RATINGS: Rating[] = ["again", "hard", "good", "easy"];
export const PAGE_SIZE = 30;

const sqlTime = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
const fromSqlTime = (s: string) => new Date(`${s.replace(" ", "T")}Z`);

/**
 * Review algorithm v1. Intervals are days of exactly 24 h in UTC, so DST never shifts them.
 * again: 10 minutes · hard: ×1.2 (≥1) · good: ×2 (first: 1) · easy: ×3 (first: 3, ≥3) · cap 180.
 */
export function schedule(rating: string, previous: number, now: Date): Schedule {
  if (!RATINGS.includes(rating as Rating) || previous < 0) throw invalid("Mức nhớ không hợp lệ.");
  let days =
    rating === "again"
      ? 0
      : rating === "hard"
        ? Math.max(1, Math.ceil(previous * 1.2))
        : rating === "good"
          ? previous === 0
            ? 1
            : Math.max(1, previous * 2)
          : previous === 0
            ? 3
            : Math.max(3, previous * 3);
  days = Math.min(180, days);
  const due = new Date(now.getTime() + (rating === "again" ? 10 * 60_000 : days * 86_400_000));
  return { intervalDays: days, dueAt: sqlTime(due), algorithmVersion: 1 };
}

/** Review::add. Fix 15: an existing card gets the fresh snapshot. */
export async function addCard(
  tx: Tx,
  userId: number,
  targetKey: string,
  snapshot: CardSnapshot,
  now = new Date(),
) {
  // Raw SQL keeps the assignment order: the revision bump must read `hidden` before it is reset
  // (MariaDB applies ON DUPLICATE KEY assignments left to right; Drizzle orders them by column).
  await tx.execute(sql`
    INSERT INTO mce_review_cards (user_id, target_key, snapshot, due_at)
    VALUES (${userId}, ${targetKey}, ${JSON.stringify(snapshot)}, ${now})
    ON DUPLICATE KEY UPDATE
      revision = revision + IF(hidden <> 0, 1, 0),
      hidden = 0,
      snapshot = VALUES(snapshot)`);
}

/** Reviews done today, between the learner's local midnights (23 or 25 hours on DST days). */
export async function reviewsToday(
  tx: Tx,
  userId: number,
  p: LockedProfile,
  now = new Date(),
): Promise<number> {
  const start = DateTime.fromISO(localDay(p, now), { zone: p.questTimezone }).startOf("day");
  const end = start.plus({ days: 1 });
  const [row] = await tx
    .select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(reviewEvents)
    .where(
      and(
        eq(reviewEvents.userId, userId),
        sql`${reviewEvents.occurredAt} >= ${start.toJSDate()}`,
        sql`${reviewEvents.occurredAt} < ${end.toJSDate()}`,
      ),
    );
  return row?.n ?? 0;
}

/** Review::pagination */
export function pagination(total: number, requested: unknown) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const asked = /^[0-9]{1,9}$/.test(String(requested ?? "")) ? Math.max(1, Number(requested)) : 1;
  const page = Math.min(pages, asked);
  return { page, pages, total, size: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
}

/** Due cards (respecting the daily limit unless `extra`), or every card for the manage view. */
export async function reviewQueue(
  actor: Actor,
  {
    extra = false,
    manage = false,
    page = 1,
    now = new Date(),
  }: { extra?: boolean; manage?: boolean; page?: unknown; now?: Date } = {},
) {
  const userId = requireUserId(actor);
  return withTx(async (tx) => {
    const profile = await lockProfile(tx, userId, { now });
    await ensureQuests(tx, userId, profile, now);
    const used = await reviewsToday(tx, userId, profile, now);
    if (manage) {
      const [count] = await tx
        .select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
        .from(reviewCards)
        .where(eq(reviewCards.userId, userId));
      const paging = pagination(count?.n ?? 0, page);
      const cards = await tx
        .select()
        .from(reviewCards)
        .where(eq(reviewCards.userId, userId))
        .orderBy(asc(reviewCards.hidden), asc(reviewCards.dueAt), asc(reviewCards.id))
        .limit(PAGE_SIZE)
        .offset(paging.offset);
      return { profile, used, cards, paging };
    }
    const limit = extra ? 100 : Math.max(0, profile.reviewLimit - used);
    const cards = limit
      ? await tx
          .select({
            id: reviewCards.id,
            snapshot: reviewCards.snapshot,
            revision: reviewCards.revision,
            dueAt: reviewCards.dueAt,
          })
          .from(reviewCards)
          .where(
            and(
              eq(reviewCards.userId, userId),
              eq(reviewCards.hidden, 0),
              sql`${reviewCards.dueAt} <= ${now}`,
            ),
          )
          .orderBy(asc(reviewCards.dueAt), asc(reviewCards.id))
          .limit(limit)
      : [];
    return { profile, used, cards, paging: null };
  });
}

/** Review::rate: idempotent per request key; revision guards against two tabs. */
export async function rateCard(
  actor: Actor,
  input: { cardId: number; rating: string; requestKey: unknown; revision: number; extra?: boolean },
  now = new Date(),
): Promise<Schedule> {
  const userId = requireUserId(actor);
  return withTx(async (tx) => {
    const profile = await lockProfile(tx, userId, { now });
    await ensureQuests(tx, userId, profile, now);
    const key = hexKey(input.requestKey);
    const [prior] = await tx.select().from(reviewEvents).where(eq(reviewEvents.requestKey, key));
    if (prior) {
      if (prior.userId !== userId || prior.cardId !== input.cardId || prior.rating !== input.rating)
        throw conflict("Yêu cầu đã được sử dụng.");
      return prior.newSchedule;
    }
    const [card] = await tx
      .select()
      .from(reviewCards)
      .where(and(eq(reviewCards.id, input.cardId), eq(reviewCards.userId, userId)))
      .for("update");
    if (!card) throw new AppError(404, "Không tìm thấy thẻ ôn.");
    if (!input.extra && (await reviewsToday(tx, userId, profile, now)) >= profile.reviewLimit)
      throw invalid("Bạn đã đạt giới hạn ôn hôm nay. Chọn Ôn thêm nếu muốn tiếp tục.");
    if (card.revision !== input.revision)
      throw conflict("Thẻ đã thay đổi ở tab khác. Vui lòng tải lại.");
    if (card.hidden || card.dueAt > now) throw invalid("Thẻ chưa đến hạn hoặc đã tạm ẩn.");

    const next = schedule(input.rating, card.intervalDays, now);
    await tx
      .update(reviewCards)
      .set({
        intervalDays: next.intervalDays,
        dueAt: fromSqlTime(next.dueAt),
        revision: sql`${reviewCards.revision} + 1`,
      })
      .where(eq(reviewCards.id, card.id));
    await tx.insert(reviewEvents).values({
      userId,
      cardId: card.id,
      requestKey: key,
      rating: input.rating,
      previousSchedule: {
        intervalDays: card.intervalDays,
        dueAt: sqlTime(card.dueAt),
        algorithmVersion: 1,
      },
      newSchedule: next,
      occurredAt: now,
    });
    await reviewRewarded(tx, userId, profile, card.id, now);
    await recordEvent(`review:${key}`, "review_completed", String(card.id), userId, tx);
    return next;
  });
}

/** Reset the schedule, hide, show or remove a card (reset and remove need confirm=yes). */
export async function manageCard(actor: Actor, cardId: number, action: unknown, confirm: unknown) {
  const userId = requireUserId(actor);
  await withTx(async (tx) => {
    await lockProfile(tx, userId);
    const [card] = await tx
      .select({ id: reviewCards.id })
      .from(reviewCards)
      .where(and(eq(reviewCards.id, cardId), eq(reviewCards.userId, userId)));
    if (!card) throw new AppError(404, "Không tìm thấy thẻ.");
    const bump = sql`${reviewCards.revision} + 1`;
    if (action === "reset") {
      if (confirm !== "yes") throw invalid("Hãy xác nhận đặt lại lịch ôn.");
      await tx
        .update(reviewCards)
        .set({ intervalDays: 0, dueAt: new Date(), revision: bump })
        .where(eq(reviewCards.id, cardId));
    } else if (action === "hide" || action === "show" || action === "remove") {
      if (action === "remove" && confirm !== "yes")
        throw invalid("Hãy xác nhận bỏ thẻ khỏi hàng đợi.");
      const hidden = action === "remove" ? 2 : action === "hide" ? 1 : 0;
      await tx
        .update(reviewCards)
        .set({ hidden, revision: bump })
        .where(eq(reviewCards.id, cardId));
    } else throw invalid("Thao tác không hợp lệ.");
  });
}

/** Save a published word sense to the notebook, optionally as a review card. */
export async function saveWord(
  actor: Actor,
  senseId: number,
  notesInput: unknown,
  review: boolean,
) {
  const userId = requireUserId(actor);
  const [v] = await db()
    .select()
    .from(vocabulary)
    .where(and(eq(vocabulary.id, senseId), eq(vocabulary.status, "published")));
  if (!v) throw new AppError(404, "Không tìm thấy nghĩa từ.");
  const notes = field("notes", () => text(notesInput ?? "", 2000, false));
  await withTx(async (tx) => {
    await lockProfile(tx, userId);
    await tx
      .insert(userVocabulary)
      .values({ userId, senseId, notes, hidden: false })
      .onDuplicateKeyUpdate({ set: { notes, hidden: false } });
    if (review)
      await addCard(tx, userId, `sense:${senseId}`, {
        front: `${v.lemma} - ${v.example}`,
        back: v.meaning,
        ipa: v.ipa,
        partOfSpeech: v.partOfSpeech,
        example: v.example,
        translation: v.translation,
        audioId: v.audioId ?? null,
      });
    await recordEvent(
      `vocab:${userId}:${senseId}`,
      "vocabulary_saved",
      String(senseId),
      userId,
      tx,
    );
  });
}

export async function removeWord(actor: Actor, senseId: number) {
  const userId = requireUserId(actor);
  await withTx(async (tx) => {
    await lockProfile(tx, userId);
    await tx
      .delete(userVocabulary)
      .where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.senseId, senseId)));
    await tx
      .update(reviewCards)
      .set({ hidden: 1, revision: sql`${reviewCards.revision} + 1` })
      .where(and(eq(reviewCards.userId, userId), eq(reviewCards.targetKey, `sense:${senseId}`)));
  });
}

/** Turn a finished exercise into a review card ("Lưu câu cần ôn"). */
export async function saveConcept(actor: Actor, attemptId: unknown, exerciseId: string) {
  const userId = requireUserId(actor);
  const row = await readAttempt(actor, attemptId);
  const exercise = row.document.exercises.find((e) => e.id === exerciseId);
  if (row.attempt.mode === "preview")
    throw invalid("Phiên xem trước không thêm kiến thức vào lịch ôn cá nhân.");
  if (row.attempt.userId === null)
    throw invalid("Hãy xác nhận chuyển bài học thử vào tài khoản trước khi thêm kiến thức vào ôn.");
  if (!exercise || row.attempt.status !== "finished")
    throw invalid("Hoàn thành bài trước khi lưu câu cần ôn.");
  const [item] = await db()
    .select({ grading: items.grading })
    .from(items)
    .where(and(eq(items.attemptId, row.attempt.id), eq(items.exerciseId, exerciseId)));
  await withTx(async (tx) => {
    await lockProfile(tx, userId);
    await addCard(tx, userId, `concept:${row.lessonId}:${exerciseId}`, {
      front: exercise.payload.prompt,
      back: item?.grading?.acceptedAnswerDisplay ?? exercise.explanation,
      example: exercise.explanation,
    });
  });
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

/** The vocabulary notebook with search, filter and paging. Search escapes LIKE wildcards (fix 10). */
export async function notebook(
  actor: Actor,
  q: string,
  filter: "all" | "review" | "hidden",
  page: unknown = 1,
) {
  const userId = requireUserId(actor);
  const pattern = `%${escapeLike(q)}%`;
  const conditions = and(
    eq(userVocabulary.userId, userId),
    sql`(${vocabulary.lemma} LIKE ${pattern} OR ${vocabulary.meaning} LIKE ${pattern})`,
    filter === "review"
      ? sql`${reviewCards.id} IS NOT NULL AND ${reviewCards.hidden} = 0`
      : filter === "hidden"
        ? eq(reviewCards.hidden, 1)
        : undefined,
  );
  const base = () =>
    db()
      .select()
      .from(userVocabulary)
      .innerJoin(vocabulary, eq(vocabulary.id, userVocabulary.senseId))
      .leftJoin(
        reviewCards,
        and(
          eq(reviewCards.userId, userVocabulary.userId),
          sql`${reviewCards.targetKey} = CONCAT('sense:', ${vocabulary.id})`,
        ),
      )
      .where(conditions);
  const [count] = await db()
    .select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(userVocabulary)
    .innerJoin(vocabulary, eq(vocabulary.id, userVocabulary.senseId))
    .leftJoin(
      reviewCards,
      and(
        eq(reviewCards.userId, userVocabulary.userId),
        sql`${reviewCards.targetKey} = CONCAT('sense:', ${vocabulary.id})`,
      ),
    )
    .where(conditions);
  const paging = pagination(count?.n ?? 0, page);
  const rows = await base()
    .orderBy(desc(userVocabulary.createdAt), desc(userVocabulary.senseId))
    .limit(PAGE_SIZE)
    .offset(paging.offset);
  const words = rows.map((r) => ({
    ...r.mce_vocabulary,
    notes: r.mce_user_vocabulary.notes,
    hidden: r.mce_user_vocabulary.hidden,
    card: r.mce_review_cards
      ? {
          id: r.mce_review_cards.id,
          dueAt: r.mce_review_cards.dueAt,
          hidden: r.mce_review_cards.hidden,
          intervalDays: r.mce_review_cards.intervalDays,
        }
      : null,
  }));
  return { words, paging };
}
