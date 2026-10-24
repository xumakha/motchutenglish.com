import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { allSettings, themeColors } from "@/server/settings";

// Site settings used by every page (logo, name, social link, colours). Cached under the
// "catalog" tag, which every admin change refreshes.

export async function siteSettings() {
  "use cache";
  cacheTag("catalog");
  cacheLife("hours");
  const all = await allSettings();
  const logoId = Number(all.logo_media_id) || null;
  const faviconId = Number(all.favicon_media_id) || null;
  return {
    siteName: all.site_name ?? "",
    logo: logoId ? `/media/${logoId}` : "/assets/images/logo.png",
    favicon: faviconId ? `/media/${faviconId}` : "/favicon.ico",
    ogImage: logoId ? `/media/${logoId}` : "/android-chrome-512x512.png",
    socialUrl: all.social_url ?? "",
    contactEmail: all.contact_email ?? "",
    privacyText: all.privacy_text ?? "",
    termsText: all.terms_text ?? "",
    gamification: all.gamification !== "0",
    ...themeColors(all),
  };
}

export type SiteSettings = Awaited<ReturnType<typeof siteSettings>>;

/** siteSettings() for request-time rendering (never runs during `next build`). */
export async function currentSiteSettings(): Promise<SiteSettings> {
  await connection();
  return siteSettings();
}
