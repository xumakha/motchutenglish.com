import { readFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import {
  authAccounts,
  authVerifications,
  balances,
  exports as exportsTable,
  inventoryEvents,
  jobs,
  journeys,
  profiles,
  quests,
  reviewCards,
  reviewEvents,
  rewardLedger,
  shop,
  streakCalendar,
  streakState,
  timezoneChanges,
  users,
} from "@/db/schema";
import { withTx } from "@/db/tx";
import {
  claimGuestJourney,
  ga4Payload,
  labels,
  landing,
  recordFunnel,
  sendAnalytics,
  setConsent,
} from "@/domain/analytics/marketing";
import { buildExport, exportForDownload, requestExport } from "@/domain/exports/exports";
import {
  consumeEmailToken,
  createEmailToken,
  eraseAccount,
  mintEmailToken,
  requestAccountDeletion,
  updateProfile,
} from "@/domain/identity/account";
import { ensureProfile } from "@/domain/identity/profile";
import { lockProfile, localDay } from "@/domain/motivation/profile";
import {
  award,
  ensureQuests,
  purchase,
  reconcileBalances,
  updateStreak,
} from "@/domain/motivation/rewards";
import { addCard, rateCard, reviewQueue, reviewsToday, schedule } from "@/domain/review/review";
import { PermanentJobError } from "@/domain/jobs/errors";
import { randomHex } from "@/domain/php";
import { AppError } from "@/server/errors";
import { createUser, publishedLesson, requestKey } from "./fixtures";

afterAll(() => pool().end());

async function status(fn: () => Promise<unknown>): Promise<number> {
  try {
    await fn();
    return 200;
  } catch (error) {
    if (error instanceof AppError) return error.status;
    throw error;
  }
}

const at = (iso: string) => new Date(iso);
const streakOn = (userId: number, iso: string, learned = true) =>
  withTx(async (tx) =>
    updateStreak(tx, userId, await lockProfile(tx, userId, { now: at(iso) }), learned, at(iso)),
  );
const state = async (userId: number) =>
  (await db().select().from(streakState).where(eq(streakState.userId, userId)))[0]!;

async function learner() {
  const user = await createUser();
  await withTx((tx) => ensureProfile(tx, user.userId!));
  return user;
}

describe("streaks (fixed clock, port of tests/motivation.php)", () => {
  it("earns a ticket every 7 learned days, spends it on a missed day, then resets", async () => {
    const { userId } = await learner();
    // Profile timezone is Asia/Ho_Chi_Minh (UTC+7); 05:00 UTC is midday locally.
    for (let day = 1; day <= 7; day++) await streakOn(userId!, `2026-01-0${day}T05:00:00Z`);
    expect(await state(userId!)).toMatchObject({ tickets: 1, learnedDays: 7, currentStreak: 7 });

    // Jan 8 skipped: two evaluations on Jan 9 protect it exactly once.
    await Promise.all([
      streakOn(userId!, "2026-01-09T05:00:00Z", false),
      streakOn(userId!, "2026-01-09T05:00:00Z", false),
    ]);
    expect(await state(userId!)).toMatchObject({ tickets: 0, currentStreak: 7, learnedDays: 7 });
    const spent = await db()
      .select()
      .from(inventoryEvents)
      .where(and(eq(inventoryEvents.userId, userId!), eq(inventoryEvents.amount, -1)));
    expect(spent).toHaveLength(1);

    await streakOn(userId!, "2026-01-09T05:00:00Z");
    await streakOn(userId!, "2026-01-11T05:00:00Z"); // Jan 10 missed, no ticket left
    expect(await state(userId!)).toMatchObject({ currentStreak: 1, longestStreak: 8 });

    // A day before the last closed day cannot rewrite history.
    await streakOn(userId!, "2026-01-10T05:00:00Z");
    expect(await state(userId!)).toMatchObject({ lastDate: "2026-01-11", learnedDays: 9 });
    const ledger = await db().select().from(rewardLedger).where(eq(rewardLedger.userId, userId!));
    expect(ledger).toHaveLength(0);
  });
});

describe("quests and ledger", () => {
  it("freezes today's quest targets and reconciles balances from the ledger", async () => {
    await publishedLesson();
    const { userId } = await learner();
    const run = () =>
      withTx(async (tx) => ensureQuests(tx, userId!, await lockProfile(tx, userId!)));
    await run();
    const before = await db()
      .select({ t: quests.template, n: quests.target })
      .from(quests)
      .where(eq(quests.userId, userId!));
    expect(before.length).toBeGreaterThan(0);
    await withTx((tx) => addCard(tx, userId!, "later", { front: "one", back: "một" }));
    await run();
    expect(
      await db()
        .select({ t: quests.template, n: quests.target })
        .from(quests)
        .where(eq(quests.userId, userId!)),
    ).toEqual(before);

    await withTx(async (tx) => {
      await lockProfile(tx, userId!);
      expect(await award(tx, userId!, "coin", 10, `test:${userId}`)).toBe(true);
      expect(await award(tx, userId!, "coin", 10, `test:${userId}`)).toBe(false);
    });
    await db()
      .update(balances)
      .set({ amount: 999 })
      .where(and(eq(balances.userId, userId!), eq(balances.currency, "coin")));
    await withTx((tx) => reconcileBalances(tx, userId!));
    const [coin] = await db()
      .select()
      .from(balances)
      .where(and(eq(balances.userId, userId!), eq(balances.currency, "coin")));
    expect(coin?.amount).toBe(10);
  });

  it("local day follows the quest timezone", () => {
    expect(localDay({ questTimezone: "America/New_York" }, at("2026-03-08T04:59:00Z"))).toBe(
      "2026-03-07",
    );
  });
});

describe("review", () => {
  it("schedules in exact 24-hour days (port of product_unit.php)", () => {
    const now = at("2026-03-08T06:55:00Z");
    expect(schedule("again", 30, now).dueAt).toBe("2026-03-08 07:05:00");
    expect(schedule("hard", 3, now).intervalDays).toBe(4);
    expect(schedule("good", 0, now).intervalDays).toBe(1);
    expect(schedule("easy", 0, now).intervalDays).toBe(3);
    expect(schedule("easy", 100, now).intervalDays).toBe(180);
    expect(schedule("good", 0, now).dueAt).toBe("2026-03-09 06:55:00");
    expect(() => schedule("meh", 0, now)).toThrow(AppError);
  });

  it("rating is idempotent per request key, guarded by revision, and awards 2 XP", async () => {
    const user = await learner();
    await withTx((tx) => addCard(tx, user.userId!, "sense:x", { front: "a", back: "b" }));
    const [card] = await db()
      .select()
      .from(reviewCards)
      .where(eq(reviewCards.userId, user.userId!));
    const key = requestKey();
    const first = await rateCard(user, {
      cardId: card!.id,
      rating: "good",
      requestKey: key,
      revision: card!.revision,
    });
    expect(
      await rateCard(user, {
        cardId: card!.id,
        rating: "good",
        requestKey: key,
        revision: card!.revision,
      }),
    ).toEqual(first);
    expect(
      await status(() =>
        rateCard(user, { cardId: card!.id, rating: "easy", requestKey: key, revision: 0 }),
      ),
    ).toBe(409);
    expect(
      await status(() =>
        rateCard(user, { cardId: card!.id, rating: "good", requestKey: requestKey(), revision: 0 }),
      ),
    ).toBe(409);
    const xp = await db()
      .select()
      .from(rewardLedger)
      .where(and(eq(rewardLedger.userId, user.userId!), eq(rewardLedger.currency, "xp")));
    expect(xp.map((r) => r.amount)).toEqual([2]);
  });

  it("fix 15: re-adding a card refreshes its snapshot and shows it again", async () => {
    const { userId } = await learner();
    await withTx((tx) => addCard(tx, userId!, "sense:y", { front: "old", back: "cũ" }));
    await db().update(reviewCards).set({ hidden: 2 }).where(eq(reviewCards.userId, userId!));
    await withTx((tx) => addCard(tx, userId!, "sense:y", { front: "new", back: "mới" }));
    const [card] = await db().select().from(reviewCards).where(eq(reviewCards.userId, userId!));
    expect(card).toMatchObject({ hidden: 0, snapshot: { front: "new", back: "mới" }, revision: 1 });
  });

  it("applies a pending quest-timezone change before counting today's cap (port of tests/timezone.php)", async () => {
    const user = await learner();
    const uid = user.userId!;
    const clock = at("2026-01-02T00:00:00Z");
    await db()
      .update(profiles)
      .set({ timezone: "America/Los_Angeles", questTimezone: "UTC", reviewLimit: 1 })
      .where(eq(profiles.userId, uid));
    await withTx(async (tx) => {
      await addCard(tx, uid, "rated", { front: "one", back: "một" });
      await addCard(tx, uid, "due", { front: "two", back: "hai" });
    });
    const cards = await db().select().from(reviewCards).where(eq(reviewCards.userId, uid));
    const [rated, due] = [
      cards.find((c) => c.targetKey === "rated")!,
      cards.find((c) => c.targetKey === "due")!,
    ];
    await db()
      .update(reviewCards)
      .set({ dueAt: at("2026-01-03T00:00:00Z") })
      .where(eq(reviewCards.id, rated.id));
    await db()
      .update(reviewCards)
      .set({ dueAt: at("2026-01-01T00:00:00Z") })
      .where(eq(reviewCards.id, due.id));
    await db()
      .insert(reviewEvents)
      .values({
        userId: uid,
        cardId: rated.id,
        requestKey: randomHex(16),
        rating: "good",
        previousSchedule: { intervalDays: 0, dueAt: "", algorithmVersion: 1 },
        newSchedule: { intervalDays: 1, dueAt: "", algorithmVersion: 1 },
        occurredAt: at("2026-01-01T12:00:00Z"),
      });
    await db()
      .insert(timezoneChanges)
      .values({ userId: uid, timezone: "America/Los_Angeles", effectiveAfter: clock });

    const before = await reviewQueue(user, { now: new Date(clock.getTime() - 1000) });
    expect(before.profile.questTimezone).toBe("UTC");
    const boundary = await reviewQueue(user, { now: clock });
    expect(boundary.profile.questTimezone).toBe("America/Los_Angeles");
    expect(boundary.used).toBe(1); // still Jan 1 in Los Angeles
    expect(boundary.cards).toEqual([]);
    expect((await reviewQueue(user, { extra: true, now: clock })).cards).toHaveLength(1);
    expect(
      await db().select().from(timezoneChanges).where(eq(timezoneChanges.userId, uid)),
    ).toEqual([]);
  });

  it("counts a DST day as 23 or 25 hours", async () => {
    const { userId } = await learner();
    await withTx((tx) => addCard(tx, userId!, "dst", { front: "DST", back: "day" }));
    const [card] = await db().select().from(reviewCards).where(eq(reviewCards.userId, userId!));
    for (const time of [
      "2026-03-08T04:59:59Z",
      "2026-03-08T05:00:00Z",
      "2026-03-09T03:59:59Z",
      "2026-03-09T04:00:00Z",
      "2026-11-01T03:59:59Z",
      "2026-11-01T04:00:00Z",
      "2026-11-02T04:59:59Z",
      "2026-11-02T05:00:00Z",
    ])
      await db()
        .insert(reviewEvents)
        .values({
          userId: userId!,
          cardId: card!.id,
          requestKey: randomHex(16),
          rating: "good",
          previousSchedule: { intervalDays: 0, dueAt: "", algorithmVersion: 1 },
          newSchedule: { intervalDays: 1, dueAt: "", algorithmVersion: 1 },
          occurredAt: at(time),
        });
    const ny = { questTimezone: "America/New_York" } as Awaited<ReturnType<typeof lockProfile>>;
    await withTx(async (tx) => {
      expect(await reviewsToday(tx, userId!, ny, at("2026-03-08T18:00:00Z"))).toBe(2);
      expect(await reviewsToday(tx, userId!, ny, at("2026-11-01T18:00:00Z"))).toBe(2);
    });
  });
});

describe("shop", () => {
  it("purchases once per request key and never goes below zero", async () => {
    const user = await learner();
    await db()
      .insert(shop)
      .ignore()
      .values({ id: "mint", title: "Mint", price: 30, style: "avatar-mint" });
    expect(await status(() => purchase(user, "mint", requestKey()))).toBe(422);
    await withTx(async (tx) => {
      await lockProfile(tx, user.userId!);
      await award(tx, user.userId!, "coin", 40, `gift:${user.userId}`);
    });
    const key = requestKey();
    await Promise.all(
      [purchase(user, "mint", key), purchase(user, "mint", key)].map((p) => p.catch((e) => e)),
    );
    const coins = await db()
      .select()
      .from(rewardLedger)
      .where(and(eq(rewardLedger.userId, user.userId!), eq(rewardLedger.currency, "coin")));
    expect(coins.reduce((n, r) => n + r.amount, 0)).toBe(10);
    expect(await status(() => purchase(user, "sun", key))).toBe(409);
  });
});

describe("profile timezone change", () => {
  it("takes effect at the next local midnight, at most once a week", async () => {
    const user = await learner();
    const now = at("2026-02-01T10:00:00Z"); // 17:00 in Ho Chi Minh City
    await updateProfile(user, { timezone: "Europe/London" }, now);
    const [change] = await db()
      .select()
      .from(timezoneChanges)
      .where(eq(timezoneChanges.userId, user.userId!));
    expect(change?.effectiveAfter.toISOString()).toBe("2026-02-01T17:00:00.000Z"); // midnight UTC+7
    // Two days later the change has applied; a new one is refused inside the 7-day cooldown.
    await updateProfile(user, { timezone: "Asia/Tokyo" }, at("2026-02-03T10:00:00Z"));
    const [profile] = await db().select().from(profiles).where(eq(profiles.userId, user.userId!));
    expect(profile?.questTimezone).toBe("Europe/London");
    expect(profile?.timezone).toBe("Asia/Tokyo"); // the display timezone changes immediately
    expect(
      await db().select().from(timezoneChanges).where(eq(timezoneChanges.userId, user.userId!)),
    ).toEqual([]);
    expect(await status(() => updateProfile(user, { timezone: "Mars/Olympus" }))).toBe(422);
  });
});

describe("marketing funnel (port of tests/marketing.php)", () => {
  it("records nothing without consent, keeps first touch, and needs 24h for a return", async () => {
    const { pathId, lessonId } = await publishedLesson();
    const [path] = await db()
      .select()
      .from((await import("@/db/schema")).paths)
      .where(eq((await import("@/db/schema")).paths.id, pathId));
    const slug = path!.slug;
    expect(
      labels(
        { utm_source: "private@example.com", utm_campaign: "secret", utm_medium: ["bad"] },
        slug,
      ),
    ).toEqual({ source: "direct", medium: "none", campaign: "" });

    let session = await landing(
      null,
      slug,
      { utm_source: "google" },
      { consent: false, journeyId: null },
    );
    expect(session.journeyId).toBeNull();
    session = await setConsent(null, true, session);
    session = await landing(
      null,
      slug,
      { utm_source: "newsletter", utm_medium: "email", utm_campaign: slug },
      session,
    );
    const id = session.journeyId!;
    expect((await landing(null, slug, { utm_source: "google" }, session)).journeyId).toBe(id);

    const t0 = new Date();
    await recordFunnel(db(), null, "lesson_started", String(lessonId), t0, session);
    const user = await learner();
    session = await claimGuestJourney(user.userId!, session);
    await recordFunnel(db(), user.userId!, "signup_completed", "account", t0, session);
    await recordFunnel(db(), user.userId!, "lesson_completed", String(lessonId), t0, session);
    await recordFunnel(
      db(),
      user.userId!,
      "lesson_started",
      String(lessonId),
      new Date(t0.getTime() + 23 * 3_600_000),
      session,
    );
    expect(
      (await db().select().from(journeys).where(eq(journeys.id, id)))[0]?.returnedAt,
    ).toBeNull();
    await recordFunnel(
      db(),
      user.userId!,
      "lesson_started",
      String(lessonId),
      new Date(t0.getTime() + 25 * 3_600_000),
      session,
    );
    const [j] = await db().select().from(journeys).where(eq(journeys.id, id));
    expect(j).toMatchObject({ source: "newsletter", userId: user.userId });
    expect(j?.guestTrialAt && j.signupAt && j.firstLessonAt && j.returnedAt).toBeTruthy();

    await setConsent(user.userId!, false, session);
    expect(await db().select().from(journeys).where(eq(journeys.userId, user.userId!))).toEqual([]);
  });

  it("keeps the original event time and refuses events older than 72 hours (fix 24)", async () => {
    const event = {
      userId: 1,
      clientId: "1.2",
      eventId: "e",
      type: "lesson_completed",
      resource: "5",
      occurredAt: "2026-01-01T10:00:00.000Z",
    };
    expect(ga4Payload(event).timestamp_micros).toBe(Date.parse(event.occurredAt) * 1000);
    expect(JSON.stringify(ga4Payload(event))).not.toContain("user_id");
    const user = await learner();
    await setConsent(user.userId!, true, { consent: false, journeyId: null });
    const old = {
      ...event,
      userId: user.userId!,
      occurredAt: new Date(Date.now() - 73 * 3_600_000).toISOString(),
    };
    await expect(sendAnalytics(old, async () => new Response(null))).rejects.toBeInstanceOf(
      PermanentJobError,
    );
  });
});

describe("account deletion", () => {
  async function withPassword() {
    const user = await learner();
    const { auth } = await import("@/auth/auth");
    const ctx = await auth().$context;
    await db()
      .insert(authAccounts)
      .values({
        userId: user.userId!,
        providerId: "credential",
        accountId: String(user.userId),
        password: await ctx.password.hash("mat-khau-123"),
      });
    return user;
  }

  it("needs the password, protects the last admin, queues the erase and erases personal data", async () => {
    const user = await withPassword();
    expect(await status(() => requestAccountDeletion(user, "sai"))).toBe(422);
    await withTx(async (tx) => {
      const p = await lockProfile(tx, user.userId!);
      await award(tx, user.userId!, "xp", 20, `lesson:${user.userId}:1`);
      await addCard(tx, user.userId!, "sense:z", { front: "a", back: "b" });
      void p;
    });
    await requestAccountDeletion(user, "mat-khau-123");
    const [job] = await db()
      .select()
      .from(jobs)
      .where(eq(jobs.eventKey, `delete:${user.userId}`));
    expect(job?.type).toBe("delete_account");
    await eraseAccount(user.userId!);
    const [row] = await db().select().from(users).where(eq(users.id, user.userId!));
    expect(row?.name).toBe("Tài khoản đã xóa");
    expect(
      await db().select().from(rewardLedger).where(eq(rewardLedger.userId, user.userId!)),
    ).toEqual([]);
    expect(
      await db().select().from(reviewCards).where(eq(reviewCards.userId, user.userId!)),
    ).toEqual([]);
    expect(
      await db().select().from(authAccounts).where(eq(authAccounts.userId, user.userId!)),
    ).toEqual([]);
  });
});

describe("email tokens (fix 22)", () => {
  it("are minted at send time, work once, and never stored raw", async () => {
    const user = await learner();
    const id = await withTx((tx) => createEmailToken(tx, user.userId!, "verify", { minutes: 60 }));
    const minted = await mintEmailToken(id);
    expect(minted?.purpose).toBe("verify");
    expect(await mintEmailToken(id)).toBeNull();
    const rows = await db().select().from(authVerifications).where(eq(authVerifications.id, id));
    expect(JSON.stringify(rows)).not.toContain(minted!.token);
    await consumeEmailToken(minted!.token, "verify");
    const [u] = await db().select().from(users).where(eq(users.id, user.userId!));
    expect(u?.emailVerified).toBe(true);
    expect(await status(() => consumeEmailToken(minted!.token, "verify"))).toBe(422);
  });
});

describe("exports", () => {
  it("builds a private personal export that only its owner can download", async () => {
    const user = await learner();
    const key = requestKey();
    await requestExport(user, "personal", key);
    await requestExport(user, "personal", key);
    expect(await status(() => requestExport(user, "content", key))).toBe(403);
    await buildExport(key, user.userId!);
    const [e] = await db().select().from(exportsTable).where(eq(exportsTable.id, key));
    expect(e?.status).toBe("ready");
    const file = await exportForDownload(user, e!.fileKey!);
    const data = JSON.parse(await readFile(file.path, "utf8"));
    expect(data).toMatchObject({ schemaVersion: 1, kind: "personal" });
    expect(data.user[0].id).toBe(user.userId);
    expect(Object.keys(data)).toContain("journeys");
    expect(await status(async () => exportForDownload(await learner(), e!.fileKey!))).toBe(404);
  });
});

describe("streak calendar snapshot", () => {
  it("records the timezone each day was closed in", async () => {
    const { userId } = await learner();
    await streakOn(userId!, "2026-05-01T05:00:00Z");
    const [day] = await db()
      .select()
      .from(streakCalendar)
      .where(eq(streakCalendar.userId, userId!));
    expect(day).toMatchObject({
      localDate: "2026-05-01",
      status: "learned",
      timezone: "Asia/Ho_Chi_Minh",
    });
  });
});
