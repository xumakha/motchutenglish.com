import "server-only";
import type { learnerProfile } from "@/site/queries/learner";
import { ProfileSection } from "./account-forms";

/**
 * Timezones offered in the profile form. The current one is always included, even when this
 * runtime's ICU lists it under another name (Node lists Asia/Saigon, PHP Asia/Ho_Chi_Minh).
 */
function timezones(current: string): string[] {
  const list = Intl.supportedValuesOf("timeZone");
  return list.includes(current) ? list : [...list, current].sort();
}

/** "Mục tiêu và nhịp học", shared by /bat-dau and /tai-khoan. */
export function Profile({ profile: p }: { profile: Awaited<ReturnType<typeof learnerProfile>> }) {
  return (
    <ProfileSection
      profile={{
        goal: p.goal,
        selfLevel: p.selfLevel,
        minutes: p.minutes,
        timezone: p.timezone,
        reviewLimit: p.reviewLimit,
        gamification: p.gamification,
        animations: p.animations,
      }}
      timezones={timezones(p.timezone)}
    />
  );
}
