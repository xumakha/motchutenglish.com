import "server-only";
import { eq, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import type { Tx } from "@/db/client";
import { cohorts, profiles, settings, users } from "@/db/schema";

const MINUTE_CHOICES = [5, 10, 15, 20];

/**
 * Create the profile and cohort rows for a user if they are missing (port of mce_profile's side
 * effects). Safe to call repeatedly; runs inside the caller's transaction.
 */
export async function ensureProfile(tx: Tx, userId: number): Promise<void> {
  const [defaultMinutes] = await tx
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.name, "default_minutes"));
  const minutes = Number(defaultMinutes?.value ?? 10);
  await tx
    .insert(profiles)
    .values({ userId, minutes: MINUTE_CHOICES.includes(minutes) ? minutes : 10 })
    .onDuplicateKeyUpdate({ set: { userId: sql`user_id` } });

  const [row] = await tx
    .select({ createdAt: users.createdAt, timezone: profiles.timezone })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, userId));
  if (!row) return;
  const localDate = DateTime.fromJSDate(row.createdAt, { zone: "utc" })
    .setZone(row.timezone)
    .toISODate();
  await tx
    .insert(cohorts)
    .ignore()
    .values({ userId, localDate: localDate!, timezone: row.timezone });
}
