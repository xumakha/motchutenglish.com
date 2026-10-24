import "./load-env";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { createConnection, type Connection, type RowDataPacket } from "mysql2/promise";
import { searchText } from "../src/domain/content/search-text";

// Database lifecycle for local development and tests.
//   pnpm db:migrate   apply pending migrations from ./drizzle
//   pnpm db:reset     drop and recreate the database (refuses in production), then migrate

const url = new URL(process.env.DATABASE_URL ?? "");
const database = url.pathname.slice(1);
if (!/^[a-zA-Z0-9_]+$/.test(database)) throw new Error("DATABASE_URL must name a database");

async function migrateDatabase() {
  const connection = await createConnection({
    uri: url.toString(),
    timezone: "Z",
    multipleStatements: false,
  });
  try {
    await connection.query("SET time_zone = '+00:00'");
    await migrate(drizzle({ client: connection }), { migrationsFolder: "./drizzle" });
    await indexUnsearchedVersions(connection);
  } finally {
    await connection.end();
  }
}

/**
 * Fix 10: publishing fills mce_search; versions published before that table existed (or written by
 * an import of PHP data) get their row here. Idempotent: only versions without a row are read.
 */
async function indexUnsearchedVersions(connection: Connection) {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT v.id, v.title, v.document FROM mce_versions v
     LEFT JOIN mce_search s ON s.version_id = v.id
     WHERE v.status = 'published' AND s.version_id IS NULL`,
  );
  for (const row of rows) {
    const doc = typeof row.document === "string" ? JSON.parse(row.document) : row.document;
    await connection.query(
      "INSERT IGNORE INTO mce_search (version_id, title, body) VALUES (?, ?, ?)",
      [row.id, row.title, searchText(doc)],
    );
  }
  if (rows.length) console.log(`search: indexed ${rows.length} published versions`);
}

async function resetDatabase() {
  if (process.env.APP_ENV === "production") throw new Error("db:reset is disabled in production");
  const server = new URL(url);
  server.pathname = "/";
  const connection = await createConnection({ uri: server.toString() });
  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    // Every table inherits this collation, so email uniqueness behaves the same on every server.
    await connection.query(
      `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await connection.end();
  }
  await migrateDatabase();
}

const command = process.argv[2];
const run = { migrate: migrateDatabase, reset: resetDatabase }[command ?? ""];
if (!run) {
  console.error("Usage: tsx scripts/db.ts <migrate|reset>");
  process.exit(2);
}
await run();
console.log(`${command}: ${database} ready`);
