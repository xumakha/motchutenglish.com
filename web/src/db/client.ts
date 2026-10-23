import "server-only";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2";
import { env } from "@/env";
import * as schema from "./schema";

// One pool per process (kept across dev hot reloads). Every connection runs in UTC so
// CURRENT_TIMESTAMP and NOW() match the UTC values the app writes, and DATE columns come back as
// 'YYYY-MM-DD' strings instead of shifted Date objects.

export function createDbPool(uri = env().DATABASE_URL, connectionLimit = 10): Pool {
  const pool = createPool({
    uri,
    connectionLimit,
    timezone: "Z",
    dateStrings: ["DATE"],
    charset: "utf8mb4_unicode_ci",
    supportBigNumbers: true,
  });
  pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'");
  });
  return pool;
}

const globalForDb = globalThis as unknown as { mcePool?: Pool };

export function pool(): Pool {
  globalForDb.mcePool ??= createDbPool();
  return globalForDb.mcePool;
}

export const db = () => drizzle({ client: pool(), schema, mode: "default" });

export type Db = ReturnType<typeof db>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
