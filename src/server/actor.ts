import "server-only";
import { cookies } from "next/headers";
import { currentUser } from "@/auth/session";
import { secureCookies } from "@/env";
import type { Actor, MarketingSession } from "@/domain/actor";
import { randomHex, sha256 } from "@/domain/php";

// Builds the domain Actor from the request: the Better Auth session, the guest cookie (a random
// value; attempts store only its sha256) and the guest marketing cookie. Cookies can only be set
// in Server Actions and Route Handlers, so pages call currentActor() without createGuest.

const GUEST_COOKIE = "mce_guest";
const MARKETING_COOKIE = "mce_marketing";
const YEAR = 60 * 60 * 24 * 365;

const cookieOptions = (maxAge?: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: secureCookies(),
  path: "/",
  ...(maxAge ? { maxAge } : {}),
});

function parseMarketing(raw: string | undefined): MarketingSession | undefined {
  if (!raw) return undefined;
  try {
    const v = JSON.parse(raw) as { c?: unknown; j?: unknown };
    const journeyId = typeof v.j === "string" && /^[a-f0-9]{32}$/.test(v.j) ? v.j : null;
    return { consent: v.c === 1, journeyId };
  } catch {
    return undefined;
  }
}

/** The acting visitor. With createGuest, a guest without a cookie gets one (actions/handlers only). */
export async function currentActor({ createGuest = false } = {}): Promise<Actor> {
  const jar = await cookies();
  const user = await currentUser();
  let guest = jar.get(GUEST_COOKIE)?.value;
  if (!guest || !/^[a-f0-9]{64}$/.test(guest)) guest = undefined;
  if (!guest && !user && createGuest) {
    guest = randomHex(32);
    // Browser-session cookie, like the PHP guest key that lived in the session.
    jar.set(GUEST_COOKIE, guest, cookieOptions());
  }
  return {
    userId: user?.id ?? null,
    role: user?.role ?? "guest",
    guestKey: guest ? sha256(guest) : null,
    marketing: parseMarketing(jar.get(MARKETING_COOKIE)?.value),
  };
}

/** Persist the guest marketing state (consent + journey id). */
export async function saveMarketing(session: MarketingSession): Promise<void> {
  const jar = await cookies();
  if (!session.consent && !session.journeyId) jar.delete(MARKETING_COOKIE);
  else
    jar.set(
      MARKETING_COOKIE,
      JSON.stringify({ c: session.consent ? 1 : 0, j: session.journeyId }),
      cookieOptions(YEAR),
    );
}
