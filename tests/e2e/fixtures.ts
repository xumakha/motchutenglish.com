import { randomInt } from "node:crypto";
import { test as base } from "@playwright/test";

export { expect, type APIRequestContext, type Page } from "@playwright/test";

// Each test comes from its own client address (clientIp() trusts the rightmost X-Forwarded-For),
// so per-IP limits such as 15 sign-ups per 15 minutes apply within a test, not across the suite.
export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, provide) => {
    const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
    await provide({ ...extraHTTPHeaders, "X-Forwarded-For": ip });
  },
});
