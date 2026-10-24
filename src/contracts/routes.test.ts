import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { routes } from "./routes";

// Every route the PHP API accepted (Product::api/execute), extracted from
// application/controllers/Product.php before it was removed at cutover (tag php-final).
const phpRouteList: string[] = JSON.parse(
  readFileSync(resolve(__dirname, "../../tests/golden/php-routes.json"), "utf8"),
);

describe("route contracts", () => {
  it("has unique method + path pairs", () => {
    const keys = Object.values(routes).map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("covers every route the PHP API accepted", () => {
    const php = new Set(phpRouteList);
    const contracted = new Set(Object.values(routes).map((r) => r.path));
    expect(php.size).toBeGreaterThan(50);
    expect([...php].filter((r) => !contracted.has(r)).sort()).toEqual([]);
    expect([...contracted].filter((r) => !php.has(r)).sort()).toEqual([]);
  });

  it("client-player routes stay on /api/v1", () => {
    const playerRoutes = Object.values(routes).filter((r) => r.path.startsWith("attempts/{id}"));
    expect(playerRoutes.every((r) => r.transport === "api")).toBe(true);
  });

  it("validates a typical submit payload", () => {
    const parsed = routes["attempts.submit"].input.safeParse({
      revision: 3,
      exerciseId: "q1",
      response: "b",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects non-hex request keys", () => {
    const parsed = routes["shop.purchase"].input.safeParse({ itemId: "mint", requestKey: "nope" });
    expect(parsed.success).toBe(false);
  });
});
