import "server-only";
import { and, eq, isNull, like, or, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { auth } from "@/auth/auth";
import { db, type Tx } from "@/db/client";
import {
  audit as auditLog,
  authAccounts,
  authVerifications,
  enrollments,
  learningRoles,
  profiles,
  reminders,
  streakState,
  timezoneChanges,
  users,
} from "@/db/schema";
import { withTx } from "@/db/tx";
import { mailConfigured } from "@/env";
import { AppError, invalid } from "@/server/errors";
import { requireUserId, type Actor } from "../actor";
import { catalogLessons } from "../content/lessons";
import { audit } from "../content/shared";
import { recordEvent } from "../events";
import { deleteExportsFor } from "../exports/exports";
import { enqueue, enqueueMail } from "../jobs/enqueue";
import { localDay, lockProfile } from "../motivation/profile";
import { randomHex, sha256 } from "../php";
import { isTimezone } from "../timezone";

// Port of application/libraries/Identity.php plus the account routes of Product::execute.
// Passwords and sessions belong to Better Auth; this module adds the app's rules on top: the
// last admin cannot leave, every credential change signs the user out everywhere, and email
// links (verify, change email, unsubscribe) use tokens created when the email is sent, so no raw
// token is ever stored in a job or the database (fix 22).

const MAIL_OFF = "Email chưa được cấu hình. Chức năng này hiện chưa khả dụng.";
const BAD_LINK = "Liên kết không hợp lệ hoặc đã hết hạn.";
const GOALS = ["foundation", "communication", "work", "toeic"];
const LEVELS = ["beginner", "A1", "A2", "B1"];
const MINUTES = [5, 10, 15, 20];

const passwordOk = (pw: string) => [...pw].length >= 8 && Buffer.byteLength(pw) <= 72;
const PASSWORD_RULE = "Mật khẩu cần ít nhất 8 ký tự và tối đa 72 byte.";

// ---- Profile and preferences ----

export interface ProfileInput {
  goal?: unknown;
  selfLevel?: unknown;
  minutes?: unknown;
  timezone?: unknown;
  reviewLimit?: unknown;
  gamification?: boolean;
  animations?: boolean;
}

/**
 * Save onboarding/profile choices. A new quest timezone applies at the next local midnight of
 * the old one, at most once every 7 days, so a learner cannot shift days to rescue a streak.
 */
export async function updateProfile(actor: Actor, input: ProfileInput, now = new Date()) {
  const userId = requireUserId(actor);
  const goal = input.goal ?? "foundation";
  const level = input.selfLevel ?? "beginner";
  const minutes = Number(input.minutes ?? 10);
  const timezone = String(input.timezone ?? "Asia/Ho_Chi_Minh");
  const reviewLimit = Number(input.reviewLimit ?? 20);
  const checks: [string, boolean][] = [
    ["goal", GOALS.includes(goal as string)],
    ["selfLevel", LEVELS.includes(level as string)],
    ["minutes", MINUTES.includes(minutes)],
    ["timezone", isTimezone(timezone)],
    ["reviewLimit", Number.isInteger(reviewLimit) && reviewLimit >= 1 && reviewLimit <= 100],
  ];
  const fields = Object.fromEntries(
    checks.filter(([, ok]) => !ok).map(([f]) => [f, "Chọn giá trị hợp lệ cho mục này."]),
  );
  if (Object.keys(fields).length)
    throw new AppError(422, "Mục tiêu, thời gian hoặc múi giờ không hợp lệ.", fields);

  await withTx(async (tx) => {
    const p = await lockProfile(tx, userId, { now });
    let changedAt = p.timezoneChangedAt;
    const cooledDown = !changedAt || changedAt.getTime() <= now.getTime() - 7 * 86_400_000;
    if (timezone !== p.questTimezone && cooledDown) {
      changedAt = now;
      const boundary = DateTime.fromISO(localDay(p, now), { zone: p.questTimezone })
        .plus({ days: 1 })
        .toJSDate();
      await tx
        .insert(timezoneChanges)
        .values({ userId, timezone, effectiveAfter: boundary })
        .onDuplicateKeyUpdate({ set: { timezone, effectiveAfter: boundary } });
    }
    await tx
      .update(profiles)
      .set({
        goal: goal as string,
        selfLevel: level as string,
        minutes,
        timezone,
        timezoneChangedAt: changedAt,
        reviewLimit,
        gamification: input.gamification ?? true,
        animations: input.animations ?? true,
        onboardingAt: sql`COALESCE(${profiles.onboardingAt}, ${now})`,
      })
      .where(eq(profiles.userId, userId));
    await recordEvent(`onboard:${userId}`, "onboarding_completed", "profile", userId, tx);
  });
}

export async function enroll(actor: Actor, pathId: number) {
  const userId = requireUserId(actor);
  if (!(await catalogLessons(pathId)).length) throw new AppError(404, "Lộ trình chưa khả dụng.");
  await withTx(async (tx) => {
    await lockProfile(tx, userId);
    await tx.insert(enrollments).ignore().values({ userId, pathId });
    await tx.update(profiles).set({ pathId }).where(eq(profiles.userId, userId));
  });
}

export async function setReminders(actor: Actor, enabled: boolean, hour: number) {
  const userId = requireUserId(actor);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw invalid("Giờ nhắc học không hợp lệ.");
  if (enabled && !mailConfigured())
    throw new AppError(503, "Email chưa được cấu hình. Chưa thể bật nhắc học.");
  await db()
    .insert(reminders)
    .values({ userId, enabled, hour, unsubscribeHash: sha256(randomHex(32)) })
    .onDuplicateKeyUpdate({ set: { enabled, hour } });
}

export async function setStreakPreferences(actor: Actor, autoProtect: boolean) {
  const userId = requireUserId(actor);
  await db().insert(streakState).ignore().values({ userId });
  await db().update(streakState).set({ autoProtect }).where(eq(streakState.userId, userId));
}

// ---- Email tokens (verify, change email, unsubscribe) ----

export type EmailPurpose = "verify" | "unsubscribe";
const pendingIdentifier = () => `mce-pending:${randomHex(16)}`;
const tokenIdentifier = (purpose: EmailPurpose, token: string) => `mce-${purpose}:${sha256(token)}`;

/** Reserve a token row now; the worker mints the token itself when it sends the email. */
export async function createEmailToken(
  tx: Tx,
  userId: number,
  purpose: EmailPurpose,
  { email = null, minutes }: { email?: string | null; minutes: number },
): Promise<number> {
  const [row] = await tx
    .insert(authVerifications)
    .values({
      identifier: pendingIdentifier(),
      value: JSON.stringify({ userId, purpose, email }),
      expiresAt: new Date(Date.now() + minutes * 60_000),
    })
    .$returningId();
  return row!.id;
}

/** Worker side: mint the link token for a reserved row (only once). Returns null if already used. */
export async function mintEmailToken(
  verificationId: number,
): Promise<{ token: string; purpose: EmailPurpose } | null> {
  return withTx(async (tx) => {
    const [row] = await tx
      .select()
      .from(authVerifications)
      .where(eq(authVerifications.id, verificationId))
      .for("update");
    if (!row || !row.identifier.startsWith("mce-pending:") || row.expiresAt <= new Date())
      return null;
    const { purpose } = JSON.parse(row.value) as { purpose: EmailPurpose };
    const token = randomHex(32);
    await tx
      .update(authVerifications)
      .set({ identifier: tokenIdentifier(purpose, token) })
      .where(eq(authVerifications.id, verificationId));
    return { token, purpose };
  });
}

/**
 * Worker side: the email was definitely not sent (a failure before SMTP DATA), so return the row
 * to pending and let the retry mint a fresh token. The old token stops working.
 */
export async function releaseEmailToken(verificationId: number): Promise<void> {
  await db()
    .update(authVerifications)
    .set({ identifier: pendingIdentifier() })
    .where(
      and(
        eq(authVerifications.id, verificationId),
        or(
          like(authVerifications.identifier, "mce-verify:%"),
          like(authVerifications.identifier, "mce-unsubscribe:%"),
        ),
      ),
    );
}

/** Ask for a verification email, or to change the account email to `newEmail`. */
export async function requestEmailVerification(actor: Actor, newEmail?: string) {
  const userId = requireUserId(actor);
  let email: string | null = null;
  if (newEmail !== undefined && newEmail !== "") {
    email = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      throw new AppError(422, "Email không hợp lệ.", { email: "Email không hợp lệ." });
  }
  if (!mailConfigured()) throw new AppError(503, MAIL_OFF);
  await withTx(async (tx) => {
    await lockProfile(tx, userId);
    const [user] = await tx
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, userId));
    const verificationId = await createEmailToken(tx, userId, "verify", {
      email,
      minutes: 24 * 60,
    });
    await enqueueMail(
      `verify:${verificationId}`,
      {
        userId,
        to: email ?? user!.email,
        subject: "Xác minh email Một Chút English",
        template: "verify-email",
        data: { verificationId, name: user!.name, newEmail: email },
      },
      tx,
    );
  });
}

/** Use a link from an email. Verify: marks the email verified (or switches to the new email). */
export async function consumeEmailToken(token: unknown, purpose: EmailPurpose) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) throw invalid(BAD_LINK);
  await withTx(async (tx) => {
    const [row] = await tx
      .select()
      .from(authVerifications)
      .where(eq(authVerifications.identifier, tokenIdentifier(purpose, token)))
      .for("update");
    if (!row || row.expiresAt <= new Date()) throw invalid(BAD_LINK);
    const { userId, email } = JSON.parse(row.value) as { userId: number; email: string | null };
    await lockProfile(tx, userId, { allowDeleted: purpose === "unsubscribe" });
    if (purpose === "verify") {
      if (email) {
        const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
        if (taken && taken.id !== userId) throw invalid("Địa chỉ email không còn khả dụng.");
        await tx.update(users).set({ email, emailVerified: true }).where(eq(users.id, userId));
        await (await auth().$context).internalAdapter.deleteUserSessions(String(userId));
      } else {
        await tx.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
      }
    } else {
      await tx.update(reminders).set({ enabled: false }).where(eq(reminders.userId, userId));
    }
    await tx.delete(authVerifications).where(eq(authVerifications.id, row.id));
  });
}

// ---- Passwords ----

/** Always answers the same way, whether or not the email has an account. */
export async function requestPasswordReset(email: string) {
  if (!mailConfigured())
    throw new AppError(503, "Email chưa được cấu hình. Hiện chưa thể đặt lại mật khẩu.");
  const normalized = email.trim().toLowerCase();
  const [user] = await db()
    .select({ id: users.id, deletedAt: profiles.deletedAt })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.email, normalized));
  if (!user || user.deletedAt) return;
  // Better Auth stores the reset token and calls sendResetPassword (auth.ts), which queues the
  // email by verification id.
  await auth().api.requestPasswordReset({ body: { email: normalized } });
}

/** Better Auth checks the token, sets the password and revokes every session. */
export async function resetPassword(token: unknown, password: string) {
  if (typeof token !== "string" || !token) throw invalid(BAD_LINK);
  if (!passwordOk(password)) throw new AppError(422, PASSWORD_RULE, { password: PASSWORD_RULE });
  try {
    await auth().api.resetPassword({ body: { token, newPassword: password } });
  } catch {
    throw invalid(BAD_LINK);
  }
}

async function credential(userId: number) {
  const [account] = await db()
    .select({ password: authAccounts.password })
    .from(authAccounts)
    .where(and(eq(authAccounts.userId, userId), eq(authAccounts.providerId, "credential")));
  return account?.password ?? null;
}

async function passwordMatches(userId: number, password: string) {
  const hash = await credential(userId);
  return !!hash && (await auth().$context).password.verify({ hash, password });
}

/** Change the password, then sign out everywhere (the caller clears this browser's cookie). */
export async function changePassword(actor: Actor, current: string, next: string) {
  const userId = requireUserId(actor);
  if (!(await passwordMatches(userId, current)))
    throw new AppError(422, "Mật khẩu hiện tại chưa đúng.", {
      current: "Mật khẩu hiện tại chưa đúng.",
    });
  if (!passwordOk(next)) throw new AppError(422, PASSWORD_RULE, { password: PASSWORD_RULE });
  const ctx = await auth().$context;
  const hash = await ctx.password.hash(next);
  await withTx(async (tx) => {
    await lockProfile(tx, userId);
    await ctx.internalAdapter.updatePassword(String(userId), hash);
    // Outstanding reset links stop working once the password has changed.
    await tx
      .delete(authVerifications)
      .where(
        and(
          like(authVerifications.identifier, "reset-password:%"),
          eq(authVerifications.value, String(userId)),
        ),
      );
  });
  await ctx.internalAdapter.deleteUserSessions(String(userId));
}

// ---- Deleting an account ----

/** Mark the account deleted, sign it out everywhere and queue the erase job. */
export async function requestAccountDeletion(actor: Actor, password: string) {
  const userId = requireUserId(actor);
  if (!(await passwordMatches(userId, password)))
    throw new AppError(422, "Mật khẩu xác nhận chưa đúng.", {
      password: "Mật khẩu xác nhận chưa đúng.",
    });
  await withTx(async (tx) => {
    const admins = await tx
      .select({ userId: learningRoles.userId, deletedAt: profiles.deletedAt })
      .from(learningRoles)
      .leftJoin(profiles, eq(profiles.userId, learningRoles.userId))
      .where(eq(learningRoles.role, "admin"))
      .for("update");
    const active = admins.filter((a) => !a.deletedAt);
    if (active.some((a) => a.userId === userId) && active.length <= 1)
      throw invalid(
        "Hãy cấp quyền cho một quản trị viên khác trước khi xóa quản trị viên cuối cùng.",
      );
    await lockProfile(tx, userId);
    await tx.update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.userId, userId));
    await enqueue("delete_account", `delete:${userId}`, { userId }, tx);
    await audit(tx, actor, "delete_requested", `user:${userId}`);
  });
  await (await auth().$context).internalAdapter.deleteUserSessions(String(userId));
}

/** Tables holding a learner's own data, erased by the delete_account job. */
const USER_TABLES = [
  "mce_review_events",
  "mce_review_cards",
  "mce_user_vocabulary",
  "mce_attempts",
  "mce_enrollments",
  "mce_progress",
  "mce_activities",
  "mce_quest_events",
  "mce_quests",
  "mce_streak_calendar",
  "mce_streak_state",
  "mce_inventory_events",
  "mce_badges",
  "mce_inventory",
  "mce_purchases",
  "mce_balances",
  "mce_reminders",
  "mce_deliveries",
  "mce_reports",
  "mce_events",
  "mce_timezone_changes",
  "mce_consents",
  "mce_cohorts",
  "mce_active_time",
  "mce_journeys",
  "learning_attempts",
  "learning_roles",
  "reward_ledger",
  "learning_events",
  "auth_sessions",
];

/**
 * Worker job: remove everything personal and anonymise the users row (kept so authored content
 * and audit references stay valid). Export files go first.
 */
export async function eraseAccount(userId: number) {
  await deleteExportsFor(userId);
  await withTx(async (tx) => {
    await lockProfile(tx, userId, { allowDeleted: true });
    await tx.execute(
      sql`DELETE i FROM mce_items i JOIN mce_attempts a ON a.id = i.attempt_id WHERE a.user_id = ${userId}`,
    );
    for (const table of USER_TABLES)
      await tx.execute(sql`DELETE FROM ${sql.raw(table)} WHERE user_id = ${userId}`);
    await tx.delete(authAccounts).where(eq(authAccounts.userId, userId));
    await tx.execute(
      sql`DELETE FROM auth_verifications WHERE JSON_VALID(value) AND JSON_VALUE(value, '$.userId') = ${userId}`,
    );
    await tx.execute(
      sql`DELETE FROM auth_verifications WHERE identifier LIKE 'reset-password:%' AND value = ${String(userId)}`,
    );
    await tx.execute(sql`
      DELETE FROM mce_jobs WHERE type IN ('mail', 'reminder', 'analytics', 'export')
        AND JSON_VALUE(payload, '$.userId') = ${userId}`);
    await tx.update(auditLog).set({ actorId: null }).where(eq(auditLog.actorId, userId));
    await tx.execute(sql`UPDATE learning_audit SET actor_id = 0 WHERE actor_id = ${userId}`);
    await tx
      .update(users)
      .set({
        name: "Tài khoản đã xóa",
        email: `deleted-${randomHex(16)}@invalid.local`,
        emailVerified: false,
        image: null,
      })
      .where(eq(users.id, userId));
    await tx
      .update(profiles)
      .set({ goal: "foundation", pathId: null, avatarStyle: null })
      .where(eq(profiles.userId, userId));
  });
}

/** Users whose account is still active (for the worker's per-user jobs). */
export async function activeUserIds(): Promise<number[]> {
  const rows = await db()
    .select({ id: users.id })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(isNull(profiles.deletedAt));
  return rows.map((r) => r.id);
}
