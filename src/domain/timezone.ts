// IANA timezones. Intl.supportedValuesOf("timeZone") lists only canonical names, and some ICU
// builds list "Asia/Saigon" instead of "Asia/Ho_Chi_Minh" (PHP's name and our default), so
// validity is checked by actually constructing a formatter instead.

export const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";

export function isTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 80) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Choices for timezone selects: the runtime's list plus the default and UTC, sorted. */
export function timezoneChoices(): string[] {
  return [...new Set([...Intl.supportedValuesOf("timeZone"), DEFAULT_TIMEZONE, "UTC"])].sort();
}
