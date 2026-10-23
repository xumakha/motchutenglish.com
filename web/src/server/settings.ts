import "server-only";
import { db } from "@/db/client";
import { settings } from "@/db/schema";

// Site settings (mce_settings). Read once per call site; Phase 5 caches them with
// cacheTag('settings') once the admin settings action can invalidate the tag.

export type SettingName =
  | "site_name"
  | "primary"
  | "accent"
  | "logo_media_id"
  | "favicon_media_id"
  | "social_url"
  | "default_minutes"
  | "gamification"
  | "contact_email"
  | "privacy_text"
  | "terms_text";

export async function allSettings(): Promise<Partial<Record<SettingName, string>>> {
  const rows = await db().select().from(settings);
  return Object.fromEntries(rows.map((r) => [r.name, r.value]));
}

export async function setting(name: SettingName, fallback = ""): Promise<string> {
  return (await allSettings())[name] ?? fallback;
}

const HEX_COLOR = /^#[a-fA-F0-9]{6}$/;

/** Theme colours from settings, with the same defaults and invalid-value fallbacks as theme.css. */
export function themeColors(all: Partial<Record<SettingName, string>>) {
  const pick = (value: string | undefined, fallback: string, invalid: string) =>
    value === undefined || value === "" ? fallback : HEX_COLOR.test(value) ? value : invalid;
  return {
    primary: pick(all.primary, "#2864dc", "#146b50"),
    accent: pick(all.accent, "#f5823b", "#f7ce53"),
  };
}
