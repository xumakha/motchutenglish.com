import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { API_DOCS_PATH, inputFields, renderApiDocs } from "./api-docs";
import { routes } from "./routes";

const docsFile = resolve(__dirname, "../..", API_DOCS_PATH);

describe("fix 17: API docs are generated from the code", () => {
  it("names fields the way the code reads them", () => {
    // PHP docs/api.md said blockId and reportId; the handlers read block and id.
    expect(inputFields(routes["attempts.view"])).toEqual([
      "revision: integer",
      "block: string",
      "position: integer",
    ]);
    expect(inputFields(routes["admin.report"])[0]).toBe("id: integer");
    const docs = renderApiDocs();
    expect(docs).not.toContain("blockId");
    expect(docs).not.toContain("reportId");
    expect(docs.match(/^\| (GET|POST) \|/gm)).toHaveLength(Object.keys(routes).length);
  });

  it("docs/api-v1.md is up to date (run pnpm docs:api)", () => {
    expect(existsSync(docsFile)).toBe(true);
    expect(readFileSync(docsFile, "utf8")).toBe(renderApiDocs());
  });
});
