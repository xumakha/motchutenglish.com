import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { routes } from "./routes";

const productPhp = resolve(__dirname, "../../../application/controllers/Product.php");

// Extract every route string Product::api/execute matches, normalising the attempt/import id regex.
function phpRoutes(source: string): Set<string> {
  const api = source.slice(
    source.indexOf("public function api"),
    source.indexOf("public function page"),
  );
  const found = new Set<string>();
  for (const [, route] of api.matchAll(/\$route===\s*'([^']+)'/g)) found.add(route!);
  for (const [, list] of api.matchAll(/in_array\(\$route,\[([^\]]+)\]/g))
    for (const [, route] of list!.matchAll(/'([^']+)'/g)) found.add(route!);
  for (const [, pattern] of api.matchAll(/preg_match\('#\^([^#$]+)\$?#D?',\$route/g)) {
    const base = pattern!.replace("([a-f0-9]{32})", "{id}");
    if (base.endsWith("/")) continue; // prefix check for the 409 currentAttempt payload, not a route
    const alternatives = base.match(/\/\(([a-z_|]+)\)$/);
    if (alternatives) {
      const prefix = base.slice(0, base.length - alternatives[0].length);
      for (const action of alternatives[1]!.split("|")) found.add(`${prefix}/${action}`);
    } else found.add(base);
  }
  return found;
}

describe("route contracts", () => {
  it("has unique method + path pairs", () => {
    const keys = Object.values(routes).map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.skipIf(!existsSync(productPhp))("covers every route the PHP API accepts", () => {
    const php = phpRoutes(readFileSync(productPhp, "utf8"));
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
