import "server-only";
import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import type { Tx } from "@/db/client";
import { profiles, settings, timezoneChanges } from "@/db/schema";
import { AppError } from "@/server/errors";
import { ensureProfile } from "../identity/profile";

// Port of Motivation::lock and Motivation::day. The profile row lock is the per-user
// serialisation point for every reward, quest, streak, review and attempt write: always take it
// first, then lock other rows.

export type LockedProfile = typeof profiles.$inferSelect;

export async function lockProfile(
  tx: Tx,
  userId: number,
  { allowDeleted = false, now = new Date() }: { allowDeleted?: boolean; now?: Date } = {},
): Promise<LockedProfile> {
  await ensureProfile(tx, userId);
  const [profile] = await tx
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .for("update");
  if (!profile) throw new AppError(401, "Tài khoản đang được xóa.");
  if (profile.deletedAt && !allowDeleted) throw new AppError(401, "Tài khoản đang được xóa.");

  // A pending quest-timezone change applies once its local-midnight boundary has passed.
  const [pending] = await tx
    .select()
    .from(timezoneChanges)
    .where(eq(timezoneChanges.userId, userId));
  if (pending && pending.effectiveAfter <= now) {
    await tx
      .update(profiles)
      .set({ questTimezone: pending.timezone })
      .where(eq(profiles.userId, userId));
    await tx.delete(timezoneChanges).where(eq(timezoneChanges.userId, userId));
    profile.questTimezone = pending.timezone;
  }

  const [switchOff] = await tx
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.name, "gamification"));
  if (switchOff?.value === "0") profile.gamification = false;
  return profile;
}

/** The learner's current calendar day (YYYY-MM-DD) in their quest timezone. */
export function localDay(profile: Pick<LockedProfile, "questTimezone">, now = new Date()): string {
  return DateTime.fromJSDate(now, { zone: "utc" }).setZone(profile.questTimezone).toISODate()!;
}
