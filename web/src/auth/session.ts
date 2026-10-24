import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { forbidden as forbiddenPage, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db/client";
import { learningRoles, profiles, users } from "@/db/schema";
import { forbidden, unauthorized } from "@/server/errors";
import { auth } from "./auth";

export type Role = "guest" | "learner" | "editor" | "admin";

export interface CurrentUser {
  id: number;
  name: string;
  email: string;
  emailVerified: boolean;
  role: Exclude<Role, "guest">;
}

/**
 * The signed-in user for this request, or null. A user whose profile is marked deleted is
 * treated as signed out (port of current_user()'s deleted_at check).
 */
export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const id = Number(session.user.id);
  const [row] = await db()
    .select({ deletedAt: profiles.deletedAt, role: learningRoles.role })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(learningRoles, eq(learningRoles.userId, users.id))
    .where(eq(users.id, id))
    .limit(1);
  if (!row || row.deletedAt) return null;
  return {
    id,
    name: session.user.name,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
    role: row.role ?? "learner",
  };
});

export async function currentRole(): Promise<Role> {
  return (await currentUser())?.role ?? "guest";
}

// Guards for Server Actions and route handlers: throw AppError so callers render the message.

export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) throw unauthorized("Bạn cần đăng nhập để thực hiện thao tác này.");
  return user;
}

export async function requireStaff(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "editor" && user.role !== "admin") throw forbidden();
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw forbidden();
  return user;
}

// Guards for pages: redirect instead of throwing.

export async function userOrLogin(): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Page guard for staff screens: signed-out → /login, learners → a 403 page via forbidden(). */
export async function staffOrLogin(admin = false): Promise<CurrentUser> {
  const user = await userOrLogin();
  const ok = user.role === "admin" || (!admin && user.role === "editor");
  if (!ok) forbiddenPage();
  return user;
}
