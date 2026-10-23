import { existsSync } from "node:fs";

// Next's loadEnvConfig ignores .env.local when NODE_ENV=test (which Vitest sets), so load it
// directly. CI passes DATABASE_URL and friends as real environment variables instead.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
