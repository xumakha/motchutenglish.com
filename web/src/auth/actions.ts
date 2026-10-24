"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { newPassword } from "@/contracts/fields";
import { db } from "@/db/client";
import { profiles, users } from "@/db/schema";
import { withTx } from "@/db/tx";
import { claimGuestJourney, noMarketing } from "@/domain/analytics/marketing";
import { recordEvent } from "@/domain/events";
import { ensureProfile } from "@/domain/identity/profile";
import { formAction } from "@/server/action";
import { currentActor } from "@/server/actor";
import { AppError, invalid } from "@/server/errors";
import { consume, failures, limitKey } from "@/server/rate-limit";
import { clientIp } from "@/server/request";
import { auth } from "./auth";
import { currentUser } from "./session";

// Login, registration and logout (port of handle_auth in application/libraries/Auth.php).

const WINDOW = 15 * 60;
const TOO_MANY = "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.";
// Fix 8: lock out on failed logins only — per IP + email, and a looser cap per IP.
const LOGIN_PER_ACCOUNT = { max: 15, windowSeconds: WINDOW };
const LOGIN_PER_IP = { max: 50, windowSeconds: WINDOW };
const REGISTER_PER_IP = { max: 15, windowSeconds: WINDOW };

const passwordBytes = z
  .string()
  .min(1, "Mật khẩu phải có từ 1 đến 72 byte.")
  .refine((s) => new TextEncoder().encode(s).length <= 72, "Mật khẩu phải có từ 1 đến 72 byte.");

const email = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.email("Vui lòng nhập email hợp lệ.").max(254, "Vui lòng nhập email hợp lệ."));

const loginSchema = z.object({ email, password: passwordBytes });

const registerSchema = z
  .object({
    name: z
      .string()
      .transform((s) => s.trim())
      .refine((s) => s.length > 0 && [...s].length <= 100, "Tên phải có từ 1 đến 100 ký tự."),
    email,
    password: newPassword,
    password_confirm: z.string(),
  })
  .refine((d) => d.password === d.password_confirm, {
    path: ["password_confirm"],
    message: "Mật khẩu nhập lại chưa khớp.",
  });

async function redirectIfSignedIn() {
  if (await currentUser()) redirect("/account");
}

export const login = formAction(loginSchema, async ({ email, password }) => {
  await redirectIfSignedIn();
  const ip = await clientIp();
  const accountKey = limitKey("login", ip, email);
  const ipKey = limitKey("login-ip", ip);
  if (
    (await failures.blocked(accountKey, LOGIN_PER_ACCOUNT)) ||
    (await failures.blocked(ipKey, LOGIN_PER_IP))
  )
    throw new AppError(429, TOO_MANY);

  const rejected = async () => {
    await failures.record(accountKey, LOGIN_PER_ACCOUNT);
    await failures.record(ipKey, LOGIN_PER_IP);
    return invalid("Email hoặc mật khẩu chưa đúng.");
  };

  // An account that is being deleted cannot sign in again.
  const [account] = await db()
    .select({ deletedAt: profiles.deletedAt })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.email, email))
    .limit(1);
  if (account?.deletedAt) throw await rejected();

  try {
    await auth().api.signInEmail({
      body: { email, password, rememberMe: false },
      headers: await headers(),
    });
  } catch (error) {
    if (!isAPIError(error)) throw error;
    throw await rejected();
  }
  await failures.clear(accountKey);
  redirect("/account");
});

export const register = formAction(registerSchema, async ({ name, email, password }) => {
  await redirectIfSignedIn();
  const marketing = (await currentActor()).marketing ?? noMarketing;
  const { allowed } = await consume(limitKey("register", await clientIp()), REGISTER_PER_IP);
  if (!allowed) throw new AppError(429, TOO_MANY);

  let userId: number;
  try {
    const result = await auth().api.signUpEmail({
      body: { name, email, password, rememberMe: false },
      headers: await headers(),
    });
    userId = Number(result.user.id);
  } catch (error) {
    if (isAPIError(error) && error.body?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL")
      throw invalid("Email này đã được đăng ký. Vui lòng đăng nhập.", {
        email: "Email này đã được đăng ký.",
      });
    throw error;
  }

  await withTx((tx) => ensureProfile(tx, userId));
  // A consenting guest's campaign journey moves to the new account before the signup event, so
  // the funnel records the signup on it (PHP: MarketingAnalytics::claimGuest in Auth.php).
  await claimGuestJourney(userId, marketing);
  await withTx((tx) => recordEvent(`signup:${userId}`, "signup_completed", "account", userId, tx));
  redirect("/account");
});
