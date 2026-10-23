import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit loads this file with its own bundler, so read .env.local directly.
if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
