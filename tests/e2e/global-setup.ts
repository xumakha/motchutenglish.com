import { existsSync } from "node:fs";
import { createConnection } from "mysql2/promise";

// Every e2e run registers accounts from one IP, which trips the real sign-up limiter across
// repeated runs. Start each run with empty limiter windows. Never runs against production.
export default async function globalSetup() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  if (process.env.APP_ENV === "production") throw new Error("e2e must not run against production");
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const connection = await createConnection({ uri: url });
  try {
    await connection.query("DELETE FROM rate_limits");
  } finally {
    await connection.end();
  }
}
