import "server-only";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db, type Db, type Tx } from "@/db/client";
import { consents, events, jobs, journeys, lessons, paths } from "@/db/schema";
import { affectedRows, withTx } from "@/db/tx";
import { env } from "@/env";
import { AppError } from "@/server/errors";
import type { MarketingSession } from "../actor";
import { enqueue } from "../jobs/enqueue";
import { PermanentJobError } from "../jobs/errors";
import { randomHex } from "../php";

// Port of application/libraries/MarketingAnalytics.php: opt-in campaign funnel (landing → guest
// trial → signup → first lesson → return) and GA4 Measurement Protocol forwarding. Nothing is
// recorded or sent without consent. Guests keep consent and their journey id in a cookie
// (MarketingSession), signed-in users in mce_consents.

const SOURCES = [
  "direct",
  "google",
  "facebook",
  "instagram",
  "youtube",
  "tiktok",
  "newsletter",
  "partner",
];
const MEDIUMS = ["none", "organic", "cpc", "social", "email", "referral"];
const WINDOW_MS = 30 * 86_400_000;
const FUNNEL_TYPES = ["signup_completed", "lesson_started", "lesson_completed"];

export const noMarketing: MarketingSession = { consent: false, journeyId: null };

export function labels(query: Record<string, unknown>, pathSlug: string) {
  const source = String(query.utm_source ?? "");
  const medium = String(query.utm_medium ?? "");
  return {
    source: SOURCES.includes(source) ? source : "direct",
    medium: MEDIUMS.includes(medium) ? medium : "none",
    campaign: query.utm_campaign === pathSlug ? pathSlug : "",
  };
}

const clientId = () =>
  `${100000000 + Math.floor(Math.random() * 900000000)}.${Math.floor(Date.now() / 1000)}`;

/** Grant or revoke consent. Revoking deletes journeys and queued analytics for that person. */
export async function setConsent(
  userId: number | null,
  enabled: boolean,
  session: MarketingSession,
): Promise<MarketingSession> {
  await withTx(async (tx) => {
    if (userId !== null) {
      await tx
        .insert(consents)
        .values({ userId, analytics: enabled, clientId: clientId(), updatedAt: new Date() })
        .onDuplicateKeyUpdate({ set: { analytics: enabled, updatedAt: new Date() } });
      if (!enabled) {
        await tx.delete(journeys).where(eq(journeys.userId, userId));
        await tx.execute(
          sql`DELETE FROM mce_jobs WHERE type = 'analytics' AND JSON_VALUE(payload, '$.userId') = ${userId}`,
        );
      }
    }
    if (!enabled && session.journeyId)
      await tx
        .delete(journeys)
        .where(and(eq(journeys.id, session.journeyId), isNull(journeys.userId)));
  });
  return { consent: enabled, journeyId: enabled ? session.journeyId : null };
}

async function allowed(q: Tx | Db, userId: number | null, session: MarketingSession) {
  if (userId === null) return session.consent;
  const [c] = await q
    .select({ analytics: consents.analytics })
    .from(consents)
    .where(eq(consents.userId, userId));
  return !!c?.analytics;
}

/** A campaign landing (/chien-dich/{slug}) starts or reuses a 30-day journey. */
export async function landing(
  userId: number | null,
  pathSlug: string,
  query: Record<string, unknown>,
  session: MarketingSession,
): Promise<MarketingSession> {
  if (!(await allowed(db(), userId, session))) return session;
  const [path] = await db()
    .select({ id: paths.id })
    .from(paths)
    .where(and(eq(paths.slug, pathSlug), eq(paths.status, "published")));
  if (!path) throw new AppError(404, "Không tìm thấy chiến dịch.");
  const since = new Date(Date.now() - WINDOW_MS);
  let existing = userId
    ? (
        await db()
          .select({ id: journeys.id })
          .from(journeys)
          .where(and(eq(journeys.userId, userId), gte(journeys.landedAt, since)))
          .orderBy(journeys.landedAt, journeys.id)
          .limit(1)
      )[0]
    : undefined;
  if (!existing && session.journeyId)
    existing = (
      await db()
        .select({ id: journeys.id })
        .from(journeys)
        .where(
          and(
            eq(journeys.id, session.journeyId),
            userId === null ? isNull(journeys.userId) : eq(journeys.userId, userId),
            gte(journeys.landedAt, since),
          ),
        )
    )[0];
  if (existing) return { ...session, journeyId: existing.id };
  const id = randomHex(16);
  await db()
    .insert(journeys)
    .values({ id, userId, pathSlug, ...labels(query, pathSlug), landedAt: new Date() });
  return { ...session, journeyId: id };
}

/** On signup, a consenting guest's journey moves to the new account. */
export async function claimGuestJourney(
  userId: number,
  session: MarketingSession,
): Promise<MarketingSession> {
  if (!session.consent || !session.journeyId) return session;
  const result = await db()
    .update(journeys)
    .set({ userId })
    .where(
      and(
        eq(journeys.id, session.journeyId),
        isNull(journeys.userId),
        gte(journeys.landedAt, new Date(Date.now() - WINDOW_MS)),
      ),
    );
  if (affectedRows(result)) return setConsent(userId, true, session);
  return session;
}

/** Advance the funnel for a product event (called by recordEvent). */
export async function recordFunnel(
  tx: Tx | Db,
  userId: number | null,
  type: string,
  resourceId: string,
  at: Date,
  session: MarketingSession,
) {
  if (!FUNNEL_TYPES.includes(type) || !(await allowed(tx, userId, session))) return;
  if (type === "lesson_started") {
    const [lesson] = await tx
      .select({ subtype: lessons.subtype })
      .from(lessons)
      .where(eq(lessons.id, Number(resourceId)));
    if (!lesson || lesson.subtype === "placement") return;
  }
  const cutoff = new Date(at.getTime() - WINDOW_MS);
  const [j] = userId
    ? await tx
        .select()
        .from(journeys)
        .where(and(eq(journeys.userId, userId), gte(journeys.landedAt, cutoff)))
        .orderBy(journeys.landedAt, journeys.id)
        .limit(1)
    : session.journeyId
      ? await tx
          .select()
          .from(journeys)
          .where(
            and(
              eq(journeys.id, session.journeyId),
              isNull(journeys.userId),
              gte(journeys.landedAt, cutoff),
            ),
          )
      : [];
  if (!j) return;
  const columns = {
    guestTrialAt: journeys.guestTrialAt,
    signupAt: journeys.signupAt,
    firstLessonAt: journeys.firstLessonAt,
    returnedAt: journeys.returnedAt,
  };
  // Each milestone keeps its first time.
  const set = (key: keyof typeof columns) =>
    tx
      .update(journeys)
      .set({ [key]: sql`COALESCE(${columns[key]}, ${at})` })
      .where(eq(journeys.id, j.id));
  if (!userId && type === "lesson_started") await set("guestTrialAt");
  else if (userId && type === "signup_completed") await set("signupAt");
  else if (userId && j.signupAt && type === "lesson_completed") await set("firstLessonAt");
  if (
    userId &&
    j.firstLessonAt &&
    j.firstLessonAt.getTime() <= at.getTime() - 86_400_000 &&
    type !== "signup_completed"
  )
    await set("returnedAt");
}

export const ga4Configured = () => !!(env().GA4_MEASUREMENT_ID && env().GA4_API_SECRET);

/** Queue a consented event for GA4 (called by recordEvent for signed-in users). */
export async function enqueueAnalytics(
  tx: Tx | Db,
  eventId: string,
  userId: number,
  type: string,
  resourceId: string,
  occurredAt: Date,
) {
  if (!ga4Configured()) return;
  const [c] = await tx.select().from(consents).where(eq(consents.userId, userId));
  if (!c?.analytics) return;
  await enqueue(
    "analytics",
    `analytics:${eventId}`,
    {
      userId,
      clientId: c.clientId,
      eventId,
      type,
      resource: resourceId,
      occurredAt: occurredAt.toISOString(),
    },
    tx,
  );
}

export interface AnalyticsJob {
  userId: number;
  clientId: string;
  eventId: string;
  type: string;
  resource: string;
  occurredAt: string;
}

/** GA4 Measurement Protocol body; ad signals are always denied. */
export function ga4Payload(e: AnalyticsJob) {
  return {
    client_id: e.clientId,
    timestamp_micros: Math.floor(new Date(e.occurredAt).getTime() / 1000) * 1_000_000,
    consent: { ad_user_data: "DENIED", ad_personalization: "DENIED" },
    events: [
      {
        name: e.type,
        params: {
          event_id: e.eventId,
          event_version: 1,
          resource_id: e.resource,
          engagement_time_msec: 1,
        },
      },
    ],
  };
}

/**
 * Worker job: send one event. Consent is checked again at send time. GA4 rejects events older
 * than 72 hours, so those fail permanently instead of retrying (fix 24).
 */
export async function sendAnalytics(e: AnalyticsJob, fetcher: typeof fetch = fetch): Promise<void> {
  const [c] = await db()
    .select({ analytics: consents.analytics })
    .from(consents)
    .where(eq(consents.userId, e.userId));
  if (!c?.analytics) return;
  if (new Date(e.occurredAt).getTime() < Date.now() - 72 * 3_600_000)
    throw new PermanentJobError("Analytics event too old; original time preserved, do not replay");
  if (!ga4Configured()) throw new Error("Analytics not configured");
  const url = new URL("https://www.google-analytics.com/mp/collect");
  url.searchParams.set("measurement_id", env().GA4_MEASUREMENT_ID);
  url.searchParams.set("api_secret", env().GA4_API_SECRET);
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ga4Payload(e)),
    signal: AbortSignal.timeout(10_000),
  });
  // A 2xx only means GA4 accepted the request, not that it processed the event.
  if (!response.ok) throw new Error("Analytics transport failed");
}

/** Last 30 days of journeys as a nested funnel (each step requires the previous ones). */
export async function funnelReport() {
  const since = new Date(Date.now() - WINDOW_MS);
  const [rows] = (await db().execute(sql`
    SELECT path_slug, source, medium, campaign, COUNT(*) AS landings,
      SUM(guest_trial_at IS NOT NULL) AS trials,
      SUM(guest_trial_at IS NOT NULL AND signup_at IS NOT NULL) AS signups,
      SUM(guest_trial_at IS NOT NULL AND signup_at IS NOT NULL AND first_lesson_at IS NOT NULL) AS first_lessons,
      SUM(guest_trial_at IS NOT NULL AND signup_at IS NOT NULL AND first_lesson_at IS NOT NULL AND returned_at IS NOT NULL) AS returns
    FROM mce_journeys WHERE landed_at >= ${since}
    GROUP BY path_slug, source, medium, campaign
    ORDER BY landings DESC, path_slug, source, medium, campaign LIMIT 100`)) as unknown as [
    Record<string, unknown>[],
  ];
  return rows;
}

/** Day-1 and day-7 return rates per signup day (in the learner's timezone). */
export async function cohortReport() {
  const [rows] = (await db().execute(sql`
    SELECT c.local_date AS registered, COUNT(DISTINCT c.user_id) AS users,
      COUNT(DISTINCT CASE WHEN a.local_date = DATE_ADD(c.local_date, INTERVAL 1 DAY) THEN c.user_id END) AS d1,
      COUNT(DISTINCT CASE WHEN a.local_date = DATE_ADD(c.local_date, INTERVAL 7 DAY) THEN c.user_id END) AS d7
    FROM mce_cohorts c LEFT JOIN mce_activities a ON a.user_id = c.user_id
    GROUP BY c.local_date ORDER BY registered DESC LIMIT 30`)) as unknown as [
    Record<string, unknown>[],
  ];
  return rows;
}

export async function eventCounts() {
  return db()
    .select({ type: events.type, count: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(events)
    .groupBy(events.type);
}

export async function recentJobs() {
  return db()
    .select({
      id: jobs.id,
      type: jobs.type,
      status: jobs.status,
      attempts: jobs.attempts,
      lastError: jobs.lastError,
      availableAt: jobs.availableAt,
    })
    .from(jobs)
    .orderBy(desc(jobs.id))
    .limit(30);
}
