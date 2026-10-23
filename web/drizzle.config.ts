import nextEnv from "@next/env";
import { defineConfig } from "drizzle-kit";

nextEnv.loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
