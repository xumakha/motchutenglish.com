import "server-only";
import { and, asc, desc, eq, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db/client";
import {
  activeTime,
  activities,
  attempts,
  badges,
  consents,
  exports,
  inventory,
  learningAttempts,
  learningLessons,
  lessons,
  profiles,
  progress,
  quests,
  reminders,
  reviewCards,
  rewardLedger,
  shop,
  streakCalendar,
  streakState,
  versions,
} from "@/db/schema";
import { withTx } from "@/db/tx";
import type { Actor } from "@/domain/actor";
import { ensureProfile } from "@/domain/identity/profile";
import { localDay, lockProfile } from "@/domain/motivation/profile";
import { ensureQuests, ledgerBalance, updateStreak } from "@/domain/motivation/rewards";
import { publicLessons } from "@/site/catalog";

// Page reads for the learner screens (the learner branches of Product::page()).

const uidOf = (actor: Actor) => {
  if (actor.userId === null) throw new Error("learner query without a user");
  return actor.userId;
};

/** PHP's 'd/m/Y H:i' in the learner's display timezone. */
export const localTime = (d: Date, timezone: string) =>
  DateTime.fromJSDate(d, { zone: "utc" }).setZone(timezone).toFormat("dd/MM/yyyy HH:mm");

/** A UTC time as MySQL printed it ('Y-m-d H:i:s'). */
export const sqlTime = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

/** mce_profile: the learner's own settings (without the site-wide gamification switch). */
export async function learnerProfile(actor: Actor) {
  const userId = uidOf(actor);
  return withTx(async (tx) => {
    await ensureProfile(tx, userId);
    const [p] = await tx.select().from(profiles).where(eq(profiles.userId, userId));
    return p!;
  });
}

/** /hoc: today's dashboard. Locks the profile, then creates quests and closes streak days. */
export async function today(actor: Actor) {
  const userId = uidOf(actor);
  const now = new Date();
  const profile = await withTx(async (tx) => {
    const p = await lockProfile(tx, userId, { now });
    await ensureQuests(tx, userId, p, now);
    await updateStreak(tx, userId, p, false, now);
    return p;
  });
  const day = localDay(profile, now);
  const [
    catalog,
    done,
    active,
    legacy,
    legacyHistory,
    todayQuests,
    streak,
    due,
    seconds,
    balanceRows,
    guestImports,
  ] = await Promise.all([
    publicLessons(profile.pathId ?? undefined),
    db().select({ lessonId: progress.lessonId }).from(progress).where(eq(progress.userId, userId)),
    db()
      .select({ id: attempts.id, title: versions.title })
      .from(attempts)
      .innerJoin(versions, eq(versions.id, attempts.versionId))
      .where(and(eq(attempts.userId, userId), eq(attempts.status, "active")))
      .orderBy(desc(attempts.startedAt))
      .limit(5),
    db()
      .select({ id: learningLessons.id, title: learningLessons.title })
      .from(learningLessons)
      .where(eq(learningLessons.status, "published"))
      .orderBy(asc(learningLessons.id)),
    db()
      .select({
        id: learningAttempts.id,
        submittedAt: learningAttempts.submittedAt,
        title: learningLessons.title,
      })
      .from(learningAttempts)
      .innerJoin(learningLessons, eq(learningLessons.id, learningAttempts.lessonId))
      .where(eq(learningAttempts.userId, userId))
      .orderBy(desc(learningAttempts.submittedAt))
      .limit(20),
    db()
      .select()
      .from(quests)
      .where(and(eq(quests.userId, userId), eq(quests.localDate, day))),
    db().select().from(streakState).where(eq(streakState.userId, userId)),
    db()
      .select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(reviewCards)
      .where(
        and(
          eq(reviewCards.userId, userId),
          eq(reviewCards.hidden, 0),
          sql`${reviewCards.dueAt} <= ${now}`,
        ),
      ),
    db()
      .select({ total: sql<number>`COALESCE(SUM(${activeTime.seconds}), 0)`.mapWith(Number) })
      .from(activeTime)
      .where(and(eq(activeTime.userId, userId), eq(activeTime.localDate, day))),
    db()
      .select({
        currency: rewardLedger.currency,
        amount: sql<number>`SUM(${rewardLedger.amount})`.mapWith(Number),
      })
      .from(rewardLedger)
      .where(eq(rewardLedger.userId, userId))
      .groupBy(rewardLedger.currency),
    actor.guestKey
      ? db()
          .select({ id: attempts.id, title: versions.title })
          .from(attempts)
          .innerJoin(versions, eq(versions.id, attempts.versionId))
          .where(and(isNull(attempts.userId), eq(attempts.guestKey, actor.guestKey)))
          .orderBy(desc(attempts.startedAt))
          .limit(5)
      : Promise.resolve([]),
  ]);
  const completed = new Set(done.map((d) => d.lessonId));
  return {
    profile,
    lessonCount: catalog.length,
    next: catalog.find((l) => !completed.has(l.id)) ?? null,
    active,
    legacy,
    legacyHistory,
    quests: todayQuests,
    streak: streak[0] ?? null,
    due: due[0]?.n ?? 0,
    todaySeconds: seconds[0]?.total ?? 0,
    balances: balanceRows,
    guestImports,
  };
}

/** /tien-do: everything besides progressHistory. */
export async function progressExtras(actor: Actor) {
  const userId = uidOf(actor);
  const [done, recent, earned, calendar, accuracy, seconds] = await Promise.all([
    db()
      .select({
        firstScore: progress.firstScore,
        bestScore: progress.bestScore,
        passedAt: progress.passedAt,
        title: versions.title,
        slug: lessons.slug,
      })
      .from(progress)
      .innerJoin(lessons, eq(lessons.id, progress.lessonId))
      .innerJoin(versions, eq(versions.id, lessons.currentVersion))
      .where(eq(progress.userId, userId)),
    db()
      .select()
      .from(activities)
      .where(eq(activities.userId, userId))
      .orderBy(desc(activities.localDate))
      .limit(28),
    db().select().from(badges).where(eq(badges.userId, userId)),
    db()
      .select()
      .from(streakCalendar)
      .where(eq(streakCalendar.userId, userId))
      .orderBy(desc(streakCalendar.localDate))
      .limit(35),
    db()
      .select({
        score: sql<number | null>`SUM(${attempts.score})`.mapWith((v) =>
          v === null ? null : Number(v),
        ),
        maxScore: sql<number | null>`SUM(${attempts.maxScore})`.mapWith((v) =>
          v === null ? null : Number(v),
        ),
      })
      .from(attempts)
      .where(
        and(
          eq(attempts.userId, userId),
          eq(attempts.status, "finished"),
          ne(attempts.mode, "preview"),
        ),
      ),
    db()
      .select({ total: sql<number>`COALESCE(SUM(${activeTime.seconds}), 0)`.mapWith(Number) })
      .from(activeTime)
      .where(eq(activeTime.userId, userId)),
  ]);
  return {
    progress: done,
    activities: recent,
    badges: earned,
    calendar,
    accuracy: {
      ...(accuracy[0] ?? { score: null, maxScore: null }),
      seconds: seconds[0]?.total ?? 0,
    },
  };
}

/** /reward-shop: items on sale or owned, and the coin balance from the ledger. */
export async function rewardShop(actor: Actor) {
  const userId = uidOf(actor);
  const [items, coins] = await Promise.all([
    db()
      .select({
        id: shop.id,
        title: shop.title,
        price: shop.price,
        style: shop.style,
        owned: inventory.itemId,
      })
      .from(shop)
      .leftJoin(inventory, and(eq(inventory.itemId, shop.id), eq(inventory.userId, userId)))
      .where(or(eq(shop.active, true), isNotNull(inventory.itemId))),
    ledgerBalance(db(), userId, "coin"),
  ]);
  return { items, coins };
}

/** /tai-khoan: reminder, recent exports and the analytics consent. */
export async function accountExtras(actor: Actor) {
  const userId = uidOf(actor);
  const [reminder, recentExports, consent] = await Promise.all([
    db()
      .select({ enabled: reminders.enabled, hour: reminders.hour })
      .from(reminders)
      .where(eq(reminders.userId, userId)),
    db()
      .select({
        id: exports.id,
        kind: exports.kind,
        status: exports.status,
        createdAt: exports.createdAt,
        expiresAt: exports.expiresAt,
      })
      .from(exports)
      .where(eq(exports.userId, userId))
      .orderBy(desc(exports.createdAt))
      .limit(10),
    db()
      .select({ analytics: consents.analytics })
      .from(consents)
      .where(eq(consents.userId, userId)),
  ]);
  return {
    reminder: reminder[0] ?? null,
    exports: recentExports,
    analytics: consent[0]?.analytics ?? false,
  };
}
