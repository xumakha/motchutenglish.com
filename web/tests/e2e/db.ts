import { existsSync } from "node:fs";
import { createConnection, type RowDataPacket } from "mysql2/promise";

// Direct database access for e2e setup (finding seeded ids, granting roles). Tests never use it
// to assert behaviour the HTTP layer should prove.

if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");

export async function query<T = RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
  const connection = await createConnection({ uri: process.env.DATABASE_URL!, timezone: "Z" });
  try {
    const [rows] = await connection.query(sql, params);
    return rows as T[];
  } finally {
    await connection.end();
  }
}

export async function lessonId(slug: string): Promise<number> {
  const [row] = await query<{ id: number }>("SELECT id FROM mce_lessons WHERE slug = ?", [slug]);
  if (!row)
    throw new Error(`Seed lesson ${slug} missing; run pnpm seed --publish-reviewed-samples`);
  return row.id;
}
