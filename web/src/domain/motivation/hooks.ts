import "server-only";
import type { Tx } from "@/db/client";
import type { LockedProfile } from "./profile";

// Reward hooks called by the study module. Their signatures match Motivation::quests,
// questEvent and completion; the bodies arrive with the motivation module in Phase 3 (quests,
// XP awards, streaks, badges). Until then lessons complete without rewards.

export async function ensureQuests(
  _tx: Tx,
  _userId: number,
  _profile: LockedProfile,
): Promise<void> {}

export async function questEvent(
  _tx: Tx,
  _userId: number,
  _profile: LockedProfile,
  _template: "lesson" | "practice" | "correct" | "review",
  _sourceKey: string,
): Promise<void> {}

export async function lessonCompleted(
  _tx: Tx,
  _userId: number,
  _profile: LockedProfile,
  _lesson: { id: number; subtype: string; passed: boolean; objective: boolean; first: boolean },
): Promise<void> {}
