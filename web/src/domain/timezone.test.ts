import { describe, expect, it } from "vitest";
import { isTimezone, timezoneChoices } from "./timezone";

describe("timezones", () => {
  it("accepts the default and other real zones, rejects junk", () => {
    expect(isTimezone("Asia/Ho_Chi_Minh")).toBe(true);
    expect(isTimezone("America/New_York")).toBe(true);
    expect(isTimezone("UTC")).toBe(true);
    expect(isTimezone("Mars/Olympus")).toBe(false);
    expect(isTimezone("")).toBe(false);
    expect(isTimezone(7)).toBe(false);
  });
  it("always offers the default zone", () => {
    expect(timezoneChoices()).toContain("Asia/Ho_Chi_Minh");
  });
});
