import "server-only";
import { headers } from "next/headers";

export const REQUEST_ID_HEADER = "x-request-id";

/** Request id set by proxy.ts (16 hex chars, same format as the PHP app). */
export async function requestId(): Promise<string> {
  return (await headers()).get(REQUEST_ID_HEADER) ?? "0000000000000000";
}

/**
 * Client IP for rate limiting. Production runs behind a reverse proxy that appends the real
 * client address to X-Forwarded-For, so the rightmost entry is the one we trust. Next.js fills the
 * header from the socket only when it is absent, which covers local development.
 */
export async function clientIp(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for") ?? "";
  const last = forwarded.split(",").at(-1)?.trim();
  return last || "unknown";
}
