import "server-only";
import { and, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import type { Tx } from "@/db/client";
import { activeTime, activities, attempts, lessons, versions } from "@/db/schema";
import { withTx } from "@/db/tx";
import { requireUserId, type Actor } from "../actor";
import { lockProfile } from "../motivation/profile";
import { pagination, PAGE_SIZE } from "../review/review";

// Port of Study::progressHistory: one week of activity (Monday to Sunday in the learner's display
// timezone, `week` weeks back) plus a paged history of finished attempts.

async function count(tx: Tx, where: ReturnType<typeof and>) {
  const [row] = await tx
    .select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(attempts)
    .where(where);
  return row?.n ?? 0;
}

export async function progressHistory(
  actor: Actor,
  week: unknown = 0,
  page: unknown = 1,
  now = new Date(),
) {
  const userId = requireUserId(actor);
  return withTx(async (tx) => {
    const profile = await lockProfile(tx, userId, { now });
    const offset = /^[0-9]{1,3}$/.test(String(week ?? "")) ? Math.min(520, Number(week)) : 0;
    const start = DateTime.fromJSDate(now, { zone: "utc" })
      .setZone(profile.timezone)
      .startOf("week") // ISO weeks start on Monday
      .minus({ weeks: offset });
    const end = start.plus({ weeks: 1 });
    const from = start.toISODate()!;
    const to = end.toISODate()!;

    const days = await tx
      .select({
        localDate: activities.localDate,
        lessons: activities.lessons,
        reviews: activities.reviews,
      })
      .from(activities)
      .where(
        and(
          eq(activities.userId, userId),
          gte(activities.localDate, from),
          lt(activities.localDate, to),
        ),
      )
      .orderBy(activities.localDate);
    const totals = days.reduce(
      (t, d) => ({
        lessons: t.lessons + d.lessons,
        reviews: t.reviews + d.reviews,
        activeDays: t.activeDays + (d.lessons + d.reviews > 0 ? 1 : 0),
      }),
      { lessons: 0, reviews: 0, activeDays: 0 },
    );

    const finished = and(
      eq(attempts.userId, userId),
      eq(attempts.status, "finished"),
      ne(attempts.mode, "preview"),
    );
    const [score] = await tx
      .select({
        score: sql<number | null>`SUM(${attempts.score})`.mapWith((v) =>
          v === null ? null : Number(v),
        ),
        maxScore: sql<number | null>`SUM(${attempts.maxScore})`.mapWith((v) =>
          v === null ? null : Number(v),
        ),
      })
      .from(attempts)
      .innerJoin(versions, eq(versions.id, attempts.versionId))
      .innerJoin(lessons, eq(lessons.id, versions.lessonId))
      .where(
        and(
          finished,
          ne(lessons.subtype, "placement"),
          gte(attempts.finishedAt, start.toJSDate()),
          lt(attempts.finishedAt, end.toJSDate()),
        ),
      );
    const [seconds] = await tx
      .select({ total: sql<number>`COALESCE(SUM(${activeTime.seconds}), 0)`.mapWith(Number) })
      .from(activeTime)
      .where(
        and(
          eq(activeTime.userId, userId),
          gte(activeTime.localDate, from),
          lt(activeTime.localDate, to),
        ),
      );

    const paging = pagination(await count(tx, finished), page);
    const history = await tx
      .select({
        id: attempts.id,
        versionId: attempts.versionId,
        finishedAt: attempts.finishedAt,
        score: attempts.score,
        maxScore: attempts.maxScore,
        mode: attempts.mode,
        title: versions.title,
        subtype: lessons.subtype,
        archived: lessons.archived,
      })
      .from(attempts)
      .innerJoin(versions, eq(versions.id, attempts.versionId))
      .innerJoin(lessons, eq(lessons.id, versions.lessonId))
      .where(finished)
      .orderBy(desc(attempts.finishedAt), desc(attempts.id))
      .limit(PAGE_SIZE)
      .offset(paging.offset);

    return {
      profile,
      weekOffset: offset,
      weekStart: from,
      weekEnd: end.minus({ days: 1 }).toISODate()!,
      weekDays: days,
      weekTotals: totals,
      weekScore: score ?? { score: null, maxScore: null },
      weekSeconds: seconds?.total ?? 0,
      history,
      historyPaging: paging,
    };
  });
}
