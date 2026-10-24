import type { Role } from "@/auth/session";
import { AppError } from "@/server/errors";

/**
 * Who is acting. Built by the server layer from the session and the guest cookie, so domain
 * modules never read cookies or headers themselves.
 */
export interface Actor {
  userId: number | null;
  role: Role;
  /** sha256 of the guest cookie, when the visitor has one. */
  guestKey: string | null;
}

export const isStaff = (a: Actor) => a.role === "editor" || a.role === "admin";

/** mce_uid */
export function requireUserId(a: Actor): number {
  if (a.userId === null) throw new AppError(401, "Bạn cần đăng nhập để thực hiện thao tác này.");
  return a.userId;
}

/** mce_staff(admin) */
export function requireStaff(a: Actor, admin = false): number {
  const ok = admin ? a.role === "admin" : isStaff(a);
  if (!ok) throw new AppError(403, "Bạn không có quyền thực hiện thao tác này.");
  return requireUserId(a);
}
