import "server-only";
import { db } from "@/db/client";
import { redirects } from "@/db/schema";

// Slug-change redirects (mce_redirects), checked in proxy.ts before routing like the PHP router.
// The table is small and changes only on publish, so it is held in memory for a minute instead of
// costing a query on every request.

const TTL_MS = 60_000;
let cache: { at: number; map: Map<string, string> } | undefined;

async function load(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  const rows = await db().select().from(redirects);
  const map = new Map(
    rows.filter((r) => r.oldPath !== r.newPath).map((r) => [r.oldPath, r.newPath]),
  );
  cache = { at: Date.now(), map };
  return map;
}

/** Target path for an old path ("/bai-hoc/old-slug"), or null. Database errors never block a page. */
export async function redirectFor(pathname: string): Promise<string | null> {
  try {
    return (await load()).get(pathname.replace(/^\/+/, "")) ?? null;
  } catch (error) {
    console.error("Redirect lookup failed", error);
    return null;
  }
}

export function clearRedirectCache() {
  cache = undefined;
}
