import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { routes } from "@/contracts/routes";

describe("server actions", () => {
  it("cover every route that HTML forms use", () => {
    const source = readFileSync(resolve(__dirname, "routes.ts"), "utf8");
    const wired = new Set([...source.matchAll(/routeAction\("([^"]+)"\)/g)].map((m) => m[1]));
    const formRoutes = Object.entries(routes)
      .filter(([, r]) => r.transport === "action")
      .map(([name]) => name);
    expect(formRoutes.filter((name) => !wired.has(name))).toEqual([]);
    expect([...wired].filter((name) => !(name! in routes))).toEqual([]);
  });
});
