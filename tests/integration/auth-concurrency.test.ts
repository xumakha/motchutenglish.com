import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { auth } from "@/auth/auth";
import { pool } from "@/db/client";

afterAll(() => pool().end());

// Regression for the patched Better Auth Drizzle adapter (patches/@better-auth__drizzle-adapter.patch).
// Unpatched, MySQL inserts read their id back with LAST_INSERT_ID() on another pooled connection, so
// concurrent creates got null ("Failed to create user") or another request's row.
describe("Better Auth creates under concurrency", () => {
  it("returns each caller its own new user", async () => {
    const ctx = await auth().$context;
    const emails = Array.from(
      { length: 20 },
      (_, i) => `conc-${randomBytes(4).toString("hex")}-${i}@example.test`,
    );
    const users = await Promise.all(
      emails.map((email) =>
        ctx.internalAdapter.createUser({ email, name: email }, { method: "admin" }),
      ),
    );
    expect(users.map((u) => u?.email)).toEqual(emails);
    expect(new Set(users.map((u) => u.id)).size).toBe(20);
  });
});
