import "server-only";
import { and, eq, like, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { db, type Tx } from "@/db/client";
import {
  activities,
  badges,
  balances,
  inventory,
  inventoryEvents,
  progress,
  profiles,
  purchases,
  questEvents,
  quests,
  reviewCards,
  rewardLedger,
  shop,
  streakCalendar,
  streakState,
  type Currency,
} from "@/db/schema";
import { affectedRows, withTx } from "@/db/tx";
import { AppError, conflict, invalid } from "@/server/errors";
import { requireUserId, type Actor } from "../actor";
import { catalogLessons } from "../content/lessons";
import { recordEvent } from "../events";
import { hexKey } from "../php";
import { localDay, lockProfile, type LockedProfile } from "./profile";

// Port of application/libraries/Motivation.php. Every function here runs inside a transaction
// that already holds the learner's profile lock (lockProfile), which serialises rewards per user.
// reward_ledger is the source of truth; event keys make each reward happen at most once.
// Fix 14: the "correct answers" quest counts objective exercises in the learner's own path.

const OBJECTIVE = (type: string) => type !== "self" && type !== "flashcard";

export type QuestTemplate = "lesson" | "practice" | "correct" | "review";

/** Motivation::award: idempotent ledger entry; refreshes the balance projection. */
export async function award(
  tx: Tx,
  userId: number,
  currency: Currency,
  amount: number,
  key: string,
): Promise<boolean> {
  if (amount === 0) return false;
  const result = await tx
    .insert(rewardLedger)
    .ignore()
    .values({ userId, currency, amount, eventKey: `v2:${key}`, ruleVersion: 1 });
  if (!affectedRows(result)) return false;
  await tx.insert(balances).ignore().values({ userId, currency, amount: 0 });
  // The sum includes legacy (non-v2) rewards too.
  await tx
    .update(balances)
    .set({
      amount: sql`(SELECT COALESCE(SUM(amount), 0) FROM reward_ledger WHERE user_id = ${userId} AND currency = ${currency})`,
    })
    .where(and(eq(balances.userId, userId), eq(balances.currency, currency)));
  await recordEvent(`reward:${key}`, "reward_awarded", currency, userId, tx);
  return true;
}

export async function ledgerBalance(
  q: Tx | ReturnType<typeof db>,
  userId: number,
  currency: Currency,
): Promise<number> {
  const [row] = await q
    .select({ total: sql<number>`COALESCE(SUM(${rewardLedger.amount}), 0)`.mapWith(Number) })
    .from(rewardLedger)
    .where(and(eq(rewardLedger.userId, userId), eq(rewardLedger.currency, currency)));
  return row?.total ?? 0;
}

async function countLedger(tx: Tx, prefix: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(rewardLedger)
    .where(like(rewardLedger.eventKey, `${prefix.replace(/[\\%_]/g, "\\$&")}%`));
  return row?.n ?? 0;
}

/** Motivation::quests: create today's quests once, from what the learner can actually do. */
export async function ensureQuests(
  tx: Tx,
  userId: number,
  p: LockedProfile,
  now = new Date(),
): Promise<void> {
  const date = localDay(p, now);
  const [existing] = await tx
    .select({ userId: quests.userId })
    .from(quests)
    .where(and(eq(quests.userId, userId), eq(quests.localDate, date)))
    .limit(1);
  if (existing) return;
  const available = await catalogLessons();
  const [due] = await tx
    .select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(reviewCards)
    .where(
      and(
        eq(reviewCards.userId, userId),
        eq(reviewCards.hidden, 0),
        sql`${reviewCards.dueAt} <= ${now}`,
      ),
    );
  const dueCount = due?.n ?? 0;
  if (!available.length && !dueCount) return;

  const inPath = p.pathId ? available.filter((l) => l.pathId === p.pathId) : [];
  const counted = inPath.length ? inPath : available;
  const objective = counted.reduce(
    (n, l) => n + l.document.exercises.filter((e) => OBJECTIVE(e.type)).length,
    0,
  );

  const tasks: [QuestTemplate, number][] = [];
  if (available.length) tasks.push(["lesson", 1]);
  if (dueCount > 0) tasks.push(["review", Math.min(5, dueCount)]);
  else if (available.length) tasks.push(["practice", 1]);
  if (objective) tasks.push(["correct", Math.min(5, objective)]);
  await tx
    .insert(quests)
    .ignore()
    .values(
      tasks.map(([template, target]) => ({
        userId,
        localDate: date,
        template,
        timezone: p.questTimezone,
        target,
      })),
    );
}

/** Motivation::questEvent: one step per distinct source; coins when a quest and the set finish. */
export async function questEvent(
  tx: Tx,
  userId: number,
  p: LockedProfile,
  template: QuestTemplate,
  sourceKey: string,
  now = new Date(),
): Promise<void> {
  const date = localDay(p, now);
  const where = and(
    eq(quests.userId, userId),
    eq(quests.localDate, date),
    eq(quests.template, template),
  );
  const [q] = await tx.select().from(quests).where(where).for("update");
  if (!q || q.rewarded) return;
  const step = await tx
    .insert(questEvents)
    .ignore()
    .values({ userId, localDate: date, template, sourceKey });
  if (!affectedRows(step)) return;
  const n = Math.min(q.target, q.progress + 1);
  await tx.update(quests).set({ progress: n }).where(where);
  if (n === q.target) {
    await award(tx, userId, "coin", 5, `quest:${userId}:${date}:${template}`);
    await tx.update(quests).set({ rewarded: true }).where(where);
    await recordEvent(
      `quest:${userId}:${date}:${template}`,
      "quest_completed",
      template,
      userId,
      tx,
    );
  }
  const [left] = await tx
    .select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(quests)
    .where(and(eq(quests.userId, userId), eq(quests.localDate, date), eq(quests.rewarded, false)));
  if (!left?.n) await award(tx, userId, "coin", 5, `quest-set:${userId}:${date}`);
}

const nextDay = (date: string) =>
  DateTime.fromISO(date, { zone: "utc" }).plus({ days: 1 }).toISODate()!;

/**
 * Motivation::streak: close every day between the last evaluated day and today (protected by a
 * ticket when auto-protect is on, otherwise missed), then count today if the learner learned.
 * Closed days never change. Every 7th learned day earns a ticket, up to 2.
 */
export async function updateStreak(
  tx: Tx,
  userId: number,
  p: LockedProfile,
  learned: boolean,
  now = new Date(),
) {
  const today = localDay(p, now);
  await tx.insert(streakState).ignore().values({ userId });
  const [s] = await tx
    .select()
    .from(streakState)
    .where(eq(streakState.userId, userId))
    .for("update");
  if (!s) return;
  // A timezone change can move "today" before the last closed day; closed days are final.
  if (s.lastDate && today < s.lastDate) return s;

  if (s.lastDate) {
    for (let date = nextDay(s.lastDate); date < today; date = nextDay(date)) {
      let status: "protected" | "missed" = "missed";
      if (s.autoProtect && s.tickets > 0) {
        status = "protected";
        s.tickets--;
        await tx
          .insert(inventoryEvents)
          .ignore()
          .values({ userId, eventKey: `protect:${userId}:${date}`, amount: -1, occurredAt: now });
        await recordEvent(`protect:${userId}:${date}`, "streak_protected", date, userId, tx);
      } else s.currentStreak = 0;
      await tx
        .insert(streakCalendar)
        .ignore()
        .values({ userId, localDate: date, status, timezone: p.questTimezone, evaluatedAt: now });
      s.lastDate = date;
    }
  }

  if (learned) {
    const [counted] = await tx
      .select({ status: streakCalendar.status })
      .from(streakCalendar)
      .where(and(eq(streakCalendar.userId, userId), eq(streakCalendar.localDate, today)));
    if (!counted) {
      s.currentStreak++;
      s.learnedDays++;
      s.longestStreak = Math.max(s.longestStreak, s.currentStreak);
      await tx.insert(streakCalendar).values({
        userId,
        localDate: today,
        status: "learned",
        timezone: p.questTimezone,
        evaluatedAt: now,
      });
      if (s.learnedDays % 7 === 0 && s.tickets < 2) {
        s.tickets++;
        await tx
          .insert(inventoryEvents)
          .ignore()
          .values({
            userId,
            eventKey: `ticket:${userId}:${s.learnedDays}`,
            amount: 1,
            occurredAt: now,
          });
      }
      s.lastDate = today;
    }
  }
  await tx
    .update(streakState)
    .set({
      currentStreak: s.currentStreak,
      longestStreak: s.longestStreak,
      learnedDays: s.learnedDays,
      tickets: s.tickets,
      lastDate: s.lastDate,
    })
    .where(eq(streakState.userId, userId));
  return s;
}

export async function awardBadges(tx: Tx, userId: number, now = new Date()) {
  const [lessonsDone] = await tx
    .select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(progress)
    .where(eq(progress.userId, userId));
  const [streak] = await tx
    .select({ days: streakState.learnedDays })
    .from(streakState)
    .where(eq(streakState.userId, userId));
  const [[reviewed]] = (await tx.execute(
    sql`SELECT COUNT(DISTINCT card_id) AS n FROM mce_review_events WHERE user_id = ${userId}`,
  )) as unknown as [{ n: number }[]];
  const [[unit]] = (await tx.execute(sql`
    SELECT u.id FROM mce_units u
      JOIN mce_lessons l ON l.unit_id = u.id
      JOIN mce_versions v ON v.id = l.current_version
      LEFT JOIN mce_progress p ON p.lesson_id = l.id AND p.user_id = ${userId}
    WHERE l.required = 1 AND l.archived = 0 AND v.status = 'published'
    GROUP BY u.id HAVING COUNT(*) = COUNT(p.lesson_id) LIMIT 1`)) as unknown as [
    ({ id: number } | undefined)[],
  ];
  const earned = {
    first_lesson: (lessonsDone?.n ?? 0) >= 1,
    seven_days: (streak?.days ?? 0) >= 7,
    review_fifty: Number(reviewed?.n ?? 0) >= 50,
    first_unit: !!unit,
  };
  for (const [badge, ok] of Object.entries(earned))
    if (ok) await tx.insert(badges).ignore().values({ userId, badge, awardedAt: now });
}

/** Motivation::activity: count today's lesson or review, extend the streak, check badges. */
export async function recordActivity(
  tx: Tx,
  userId: number,
  p: LockedProfile,
  kind: "lesson" | "review",
  now = new Date(),
) {
  const localDate = localDay(p, now);
  const column = kind === "review" ? activities.reviews : activities.lessons;
  await tx
    .insert(activities)
    .values({
      userId,
      localDate,
      timezone: p.questTimezone,
      lessons: kind === "lesson" ? 1 : 0,
      reviews: kind === "review" ? 1 : 0,
    })
    .onDuplicateKeyUpdate({
      set: { [kind === "review" ? "reviews" : "lessons"]: sql`${column} + 1` },
    });
  await updateStreak(tx, userId, p, true, now);
  await awardBadges(tx, userId, now);
}

/**
 * Motivation::completion: XP for a finished lesson. First time: 20 (checkpoint 30). Repeats: 5,
 * not on the day of the first reward, at most twice a day. Passing an objective lesson: +5.
 */
export async function lessonCompleted(
  tx: Tx,
  userId: number,
  p: LockedProfile,
  lesson: { id: number; subtype: string; passed: boolean; objective: boolean; first: boolean },
  now = new Date(),
): Promise<void> {
  await recordActivity(tx, userId, p, "lesson", now);
  if (!p.gamification) return;
  const day = localDay(p, now);
  const checkpoint = lesson.subtype === "checkpoint";
  if (lesson.first)
    await award(
      tx,
      userId,
      "xp",
      checkpoint ? 30 : 20,
      `${checkpoint ? "checkpoint" : "lesson"}:${userId}:${lesson.id}`,
    );
  else if (!checkpoint) {
    const [first] = await tx
      .select({ at: rewardLedger.createdAt })
      .from(rewardLedger)
      .where(eq(rewardLedger.eventKey, `v2:lesson:${userId}:${lesson.id}`));
    const firstDay = first ? localDay(p, first.at) : null;
    if (firstDay !== day && (await countLedger(tx, `v2:repeat:${userId}:${day}:`)) < 2)
      await award(tx, userId, "xp", 5, `repeat:${userId}:${day}:${lesson.id}`);
  }
  if (lesson.passed && lesson.objective && !checkpoint)
    await award(tx, userId, "xp", 5, `pass:${userId}:${lesson.id}`);
  await questEvent(tx, userId, p, "lesson", `lesson:${lesson.id}`, now);
  await questEvent(tx, userId, p, "practice", `lesson:${lesson.id}`, now);
}

/** Review XP: 2 per card, at most 10 cards a day; plus the review quest. */
export async function reviewRewarded(
  tx: Tx,
  userId: number,
  p: LockedProfile,
  cardId: number,
  now = new Date(),
) {
  await recordActivity(tx, userId, p, "review", now);
  if (!p.gamification) return;
  const day = localDay(p, now);
  if ((await countLedger(tx, `v2:review:${userId}:${day}:`)) < 10)
    await award(tx, userId, "xp", 2, `review:${userId}:${day}:${cardId}`);
  await questEvent(tx, userId, p, "review", `card:${cardId}`, now);
}

/** Motivation::purchase: idempotent per request key; owning an item already costs nothing. */
export async function purchase(actor: Actor, itemId: string, requestKey: unknown): Promise<void> {
  const userId = requireUserId(actor);
  await withTx(async (tx) => {
    await lockProfile(tx, userId);
    const key = hexKey(requestKey);
    const [prior] = await tx.select().from(purchases).where(eq(purchases.requestKey, key));
    if (prior) {
      if (prior.userId !== userId || prior.itemId !== itemId)
        throw conflict("Mã yêu cầu đã được sử dụng.");
      return;
    }
    const [item] = await tx
      .select()
      .from(shop)
      .where(and(eq(shop.id, itemId), eq(shop.active, true)));
    if (!item) throw new AppError(404, "Vật phẩm không còn được bán.");
    const [owned] = await tx
      .select({ itemId: inventory.itemId })
      .from(inventory)
      .where(and(eq(inventory.userId, userId), eq(inventory.itemId, itemId)));
    const now = new Date();
    if (owned) {
      await tx
        .insert(purchases)
        .values({ requestKey: key, userId, itemId, price: 0, createdAt: now });
      return;
    }
    if ((await ledgerBalance(tx, userId, "coin")) < item.price)
      throw invalid("Bạn chưa đủ xu học tập. Hãy tiếp tục học và hoàn thành nhiệm vụ.");
    await award(tx, userId, "coin", -item.price, `purchase:${key}`);
    await tx.insert(inventory).values({ userId, itemId, purchasedAt: now });
    await tx
      .insert(purchases)
      .values({ requestKey: key, userId, itemId, price: item.price, createdAt: now });
    await recordEvent(`purchase:${key}`, "reward_purchased", itemId, userId, tx);
  });
}

/** Wear an owned shop item as avatar style. */
export async function setAvatar(actor: Actor, itemId: string): Promise<void> {
  const userId = requireUserId(actor);
  const [owned] = await db()
    .select({ style: shop.style })
    .from(inventory)
    .innerJoin(shop, eq(shop.id, inventory.itemId))
    .where(and(eq(inventory.userId, userId), eq(inventory.itemId, itemId)));
  if (!owned) throw new AppError(403, "Bạn chưa sở hữu vật phẩm này.");
  await db().update(profiles).set({ avatarStyle: owned.style }).where(eq(profiles.userId, userId));
}

/** Rebuild the balance projection from the ledger (worker "reconcile"). */
export async function reconcileBalances(tx: Tx, userId: number) {
  for (const currency of ["xp", "coin"] as const) {
    const amount = await ledgerBalance(tx, userId, currency);
    await tx
      .insert(balances)
      .values({ userId, currency, amount })
      .onDuplicateKeyUpdate({ set: { amount } });
  }
}
