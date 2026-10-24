"use server";

import { landing, noMarketing } from "@/domain/analytics/marketing";
import { currentActor, saveMarketing } from "@/server/actor";

/**
 * Record a campaign landing (/chien-dich/{slug}) and keep the guest's journey id in their cookie.
 * Called once from the page after load, because rendering a page cannot set cookies. Does nothing
 * without analytics consent (landing() checks it).
 */
export async function recordCampaignLanding(slug: string, query: Record<string, string>) {
  if (typeof slug !== "string" || !/^[a-z0-9-]{1,150}$/.test(slug)) return;
  const utm = Object.fromEntries(
    ["utm_source", "utm_medium", "utm_campaign"]
      .filter((k) => typeof query?.[k] === "string")
      .map((k) => [k, query[k]!.slice(0, 200)]),
  );
  const actor = await currentActor();
  const before = actor.marketing ?? noMarketing;
  try {
    const after = await landing(actor.userId, slug, utm, before);
    if (actor.userId === null && after.journeyId !== before.journeyId) await saveMarketing(after);
  } catch {
    // An unpublished campaign is a 404 for the page itself; the beacon stays silent.
  }
}
