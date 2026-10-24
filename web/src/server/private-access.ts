import "server-only";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth/auth";
import { db } from "@/db/client";
import { learningAttempts, learningRoles } from "@/db/schema";
import { ADMIN_ONLY, type Section } from "@/site/queries/admin";
import { logError } from "./log";

// Pre-render access check for private pages, run by proxy.ts so the HTTP status is right
// (forbidden()/notFound() after streaming starts keep 200). Pages still check access themselves;
// this only decides the status. Signed-out visitors are left to the login redirect.

const ADMIN = /^\/admin(?:\/([^/]+))?(?:\/|$)/;
const RESULT = /^\/ket-qua\/([a-f0-9]{32})\/?$/;

export async function privateStatus(pathname: string, headers: Headers): Promise<403 | 404 | null> {
  const admin = ADMIN.exec(pathname);
  const result = RESULT.exec(pathname);
  if (!admin && !result) return null;
  try {
    const session = await auth().api.getSession({ headers });
    if (!session) return null;
    const userId = Number(session.user.id);
    if (admin) {
      const [row] = await db()
        .select({ role: learningRoles.role })
        .from(learningRoles)
        .where(eq(learningRoles.userId, userId));
      const role = row?.role ?? "learner";
      if (role === "admin") return null;
      if (role !== "editor") return 403;
      return ADMIN_ONLY.includes(admin[1] as Section) ? 403 : null;
    }
    const [own] = await db()
      .select({ id: learningAttempts.id })
      .from(learningAttempts)
      .where(and(eq(learningAttempts.id, result![1]!), eq(learningAttempts.userId, userId)));
    return own ? null : 404;
  } catch (error) {
    // The page performs the same checks; never block a request because this one failed.
    logError("Private access check failed", error);
    return null;
  }
}
