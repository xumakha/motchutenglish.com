import { z } from "zod";
import { routes, type RouteContract } from "./routes";

// API reference generated from the zod contracts (migration bug fix 17: the PHP docs said
// `blockId`, `ignorePunctuation`, `reportId`… while the code read `block`,
// `ignoreTerminalPunctuation`, `id`). The code is the truth; `pnpm docs:api` writes
// docs/api-v1.md from it and a unit test fails when the file is stale.

export const API_DOCS_PATH = "docs/api-v1.md";

interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonSchema[];
  items?: JsonSchema;
}

function typeName(s: JsonSchema | undefined): string {
  if (!s) return "any";
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(" \\| ");
  if (s.anyOf) return [...new Set(s.anyOf.map(typeName))].join(" \\| ");
  if (s.type === "array") return `${typeName(s.items)}[]`;
  if (Array.isArray(s.type)) return s.type.join(" \\| ");
  return s.type ?? "any";
}

/** Input fields of a route as `name?: type`, in declaration order. */
export function inputFields(route: Pick<RouteContract, "input">): string[] {
  const schema = z.toJSONSchema(route.input, {
    io: "input",
    unrepresentable: "any",
  }) as JsonSchema;
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).map(
    ([name, s]) => `${name}${required.has(name) ? "" : "?"}: ${typeName(s)}`,
  );
}

export function renderApiDocs(): string {
  const lines = [
    "# API v1 reference",
    "",
    "Generated from `web/src/contracts/routes.ts` by `pnpm docs:api`; do not edit by hand.",
    "Every route is `/api/v1/<path>`; `{id}` is a 32-hex attempt or import id. Fields marked `?` are",
    "optional. Transport `action` means HTML forms use a Server Action; the route is still reachable",
    "over `/api/v1`.",
    "",
    "| Method | Path | Auth | Transport | Input | Rate limit | Fixes |",
    "|---|---|---|---|---|---|---|",
  ];
  const sorted = Object.values(routes as Record<string, RouteContract>).sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );
  for (const r of sorted) {
    const fields = inputFields(r);
    const input = fields.length ? fields.map((f) => `\`${f}\``).join(", ") : "—";
    const limit = r.rateLimit
      ? `${r.rateLimit.scope}: ${r.rateLimit.max}/${r.rateLimit.windowSeconds}s`
      : "—";
    const fixes = r.fixes?.length ? r.fixes.join(", ") : "—";
    lines.push(
      `| ${r.method} | \`${r.path}\` | ${r.auth} | ${r.transport} | ${input} | ${limit} | ${fixes} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}
