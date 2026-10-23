import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { authAccounts, authSessions, authVerifications, users } from "@/db/schema";
import { enqueueMail } from "@/domain/jobs/enqueue";
import { env, secureCookies } from "@/env";

// Better Auth is only called server-side (Server Actions and Server Components via auth.api).
// No /api/auth route is mounted, so there is no extra public HTTP surface to rate-limit or
// CSRF-protect; Server Actions carry Next.js's origin check plus proxy.ts's stricter one.

const DAY = 60 * 60 * 24;

function createAuth() {
  const { APP_URL, BETTER_AUTH_SECRET } = env();
  return betterAuth({
    appName: "Một chút English",
    baseURL: APP_URL,
    secret: BETTER_AUTH_SECRET,
    telemetry: { enabled: false },
    database: drizzleAdapter(db(), {
      provider: "mysql",
      schema: {
        users,
        auth_sessions: authSessions,
        auth_accounts: authAccounts,
        auth_verifications: authVerifications,
      },
    }),
    user: { modelName: "users" },
    session: {
      modelName: "auth_sessions",
      // The PHP app used browser-session cookies; sign-in passes rememberMe: false to keep that,
      // and the server-side session slides for a day of inactivity.
      expiresIn: DAY,
      updateAge: 60 * 60,
      cookieCache: { enabled: false },
    },
    account: { modelName: "auth_accounts" },
    verification: { modelName: "auth_verifications" },
    advanced: {
      cookiePrefix: "mce",
      useSecureCookies: secureCookies(),
      database: { generateId: "serial" },
    },
    // Our own limiter runs inside the Server Actions (fix 8 counts failures per IP + email).
    rateLimit: { enabled: false },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 72,
      autoSignIn: true,
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      async sendResetPassword({ user, token }) {
        // Fix 22: the job stores the verification row id, never the raw token; the worker rebuilds
        // the link from that row at send time.
        const [row] = await db()
          .select({ id: authVerifications.id })
          .from(authVerifications)
          .where(eq(authVerifications.identifier, `reset-password:${token}`))
          .limit(1);
        if (!row) return;
        await enqueueMail(`reset:${row.id}`, {
          to: user.email,
          subject: "Đặt lại mật khẩu Một chút English",
          template: "reset-password",
          data: { verificationId: row.id, name: user.name },
        });
      },
    },
    // Email verification and email change are configured in Phase 3 (identity) with the mail
    // templates and worker.
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { mceAuth?: Auth };

export function auth(): Auth {
  globalForAuth.mceAuth ??= createAuth();
  return globalForAuth.mceAuth;
}
