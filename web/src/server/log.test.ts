import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";
import { safeError } from "./log";

describe("safeError", () => {
  it("drops SQL parameters from Drizzle and mysql2 errors", () => {
    const driver = Object.assign(new Error("Duplicate entry 'a@example.test' for key 'email'"), {
      code: "ER_DUP_ENTRY",
      errno: 1062,
      sql: "INSERT INTO users (email, password) VALUES ('a@example.test', 'secret-hash')",
    });
    const error = new DrizzleQueryError(
      "insert into users (email, password) values (?, ?)",
      ["a@example.test", "secret-hash"],
      driver,
    );
    const logged = JSON.stringify(safeError(error));
    expect(logged).not.toContain("secret-hash");
    expect(logged).not.toContain("a@example.test");
    expect(logged).not.toContain("insert into users");
    expect(logged).toContain("ER_DUP_ENTRY");
    expect(safeError(error)).toHaveLength(2);
  });

  it("handles non-Error values", () => {
    expect(safeError("boom")).toEqual([{ name: "string", message: "non-Error thrown" }]);
  });
});
