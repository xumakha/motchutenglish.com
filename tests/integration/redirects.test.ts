import { afterAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { redirects } from "@/db/schema";
import { clearRedirectCache, redirectFor } from "@/server/redirects";

afterAll(() => pool().end());

describe("redirectFor", () => {
  it("matches stored paths with their leading slash, as the PHP app wrote them", async () => {
    const old = `/bai-hoc/cu-${Date.now()}`;
    await db().insert(redirects).values({ oldPath: old, newPath: "/bai-hoc/moi" });
    clearRedirectCache();
    expect(await redirectFor(old)).toBe("/bai-hoc/moi");
    expect(await redirectFor(old.slice(1))).toBeNull();
  });
});
