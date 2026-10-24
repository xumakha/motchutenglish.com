import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { API_DOCS_PATH, renderApiDocs } from "@/contracts/api-docs";

// pnpm docs:api — regenerate docs/api-v1.md from the zod route contracts (fix 17).
const target = resolve(process.cwd(), API_DOCS_PATH);
writeFileSync(target, renderApiDocs());
console.log(`wrote ${target}`);
