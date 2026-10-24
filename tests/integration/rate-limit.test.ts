import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "@/db/client";
import { consume, failures, limitKey } from "@/server/rate-limit";

const key = () => limitKey("test", randomBytes(8).toString("hex"));

afterAll(() => pool().end());

describe("consume (mce_limit)", () => {
  it("allows max hits per window, then rejects with a retry time", async () => {
    const k = key();
    const rule = { max: 3, windowSeconds: 60 };
    for (let i = 0; i < 3; i++) expect((await consume(k, rule)).allowed).toBe(true);
    const blocked = await consume(k, rule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.retryAfter).toBeLessThanOrEqual(60);
  });

  it("does not let concurrent requests slip past the limit", async () => {
    const k = key();
    const rule = { max: 5, windowSeconds: 60 };
    const results = await Promise.all(Array.from({ length: 20 }, () => consume(k, rule)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });

  it("starts a new window after the old one expires", async () => {
    const k = key();
    const rule = { max: 1, windowSeconds: 1 };
    expect((await consume(k, rule)).allowed).toBe(true);
    expect((await consume(k, rule)).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 1100));
    expect((await consume(k, rule)).allowed).toBe(true);
  });
});

describe("failures (fix 8: only failed logins count)", () => {
  it("blocks after max recorded failures and clears on success", async () => {
    const k = key();
    const rule = { max: 2, windowSeconds: 60 };
    expect(await failures.blocked(k, rule)).toBe(0);
    await failures.record(k, rule);
    expect(await failures.blocked(k, rule)).toBe(0);
    await failures.record(k, rule);
    expect(await failures.blocked(k, rule)).toBeGreaterThan(0);
    await failures.clear(k);
    expect(await failures.blocked(k, rule)).toBe(0);
  });
});
