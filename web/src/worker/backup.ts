import "server-only";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { resolve, sep } from "node:path";
import { createConnection } from "mysql2/promise";
import { env } from "@/env";

// Ports of database/backup.php and restore-drill.php. The password goes through MYSQL_PWD, never
// argv (other users can read argv). Dumps are private files in writable/backups.

function connection() {
  const url = new URL(env().DATABASE_URL);
  return {
    host: url.hostname || "127.0.0.1",
    port: url.port || "3306",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
  };
}

const backupsDir = () => resolve(process.cwd(), env().WRITABLE_DIR, "backups");

/** Run a client binary; stdin/stdout may be files. Rejects with stderr on a non-zero exit. */
async function client(
  bin: string,
  args: string[],
  io: { stdin?: string; stdout?: string },
): Promise<void> {
  const { password } = connection();
  const child = spawn(bin, args, {
    env: { ...process.env, MYSQL_PWD: password },
    stdio: [io.stdin ? "pipe" : "ignore", io.stdout ? "pipe" : "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr!.on("data", (chunk) => (stderr += chunk));
  const out = io.stdout ? createWriteStream(io.stdout, { flags: "wx", mode: 0o600 }) : null;
  if (out) child.stdout!.pipe(out);
  if (io.stdin) createReadStream(io.stdin).pipe(child.stdin!);
  const [code] = (await once(child, "close")) as [number | null];
  if (out && !out.closed) await once(out, "close");
  if (code !== 0) throw new Error(`${bin} failed (${code}): ${stderr.trim().slice(0, 500)}`);
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

/** mariadb-dump into writable/backups/backup-YYYYMMDD-HHMMSS-xxxxxxxx.sql (0600). */
export async function backup(): Promise<string> {
  const c = connection();
  await mkdir(backupsDir(), { recursive: true, mode: 0o700 });
  const file = resolve(backupsDir(), `backup-${stamp()}-${randomBytes(4).toString("hex")}.sql`);
  try {
    await client(
      env().MYSQLDUMP_BIN,
      [
        `--host=${c.host}`,
        `--port=${c.port}`,
        `--user=${c.user}`,
        "--single-transaction",
        "--skip-lock-tables",
        "--hex-blob",
        c.database,
      ],
      { stdout: file },
    );
  } catch (error) {
    await rm(file, { force: true });
    throw error;
  }
  return file;
}

const CHECKED_TABLES = [
  "users",
  "mce_lessons",
  "mce_versions",
  "mce_attempts",
  "mce_progress",
  "mce_review_cards",
  "reward_ledger",
];

/**
 * Restore a dump into a new database (mce_restore_test_*) and compare row counts with the live
 * one. The live database is never written. The restored database is kept for inspection.
 */
export async function restoreDrill(fileArg: string) {
  const root = await realpath(backupsDir());
  const file = await realpath(resolve(fileArg)).catch(() => "");
  if (!file || !file.startsWith(root + sep) || !(await stat(file)).isFile())
    throw new Error("Choose a backup inside writable/backups");
  const c = connection();
  const name = `mce_restore_test_${randomBytes(6).toString("hex")}`;
  const started = performance.now();
  const admin = await createConnection({ uri: env().DATABASE_URL });
  try {
    await admin.query(
      `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await client(
      env().MYSQL_BIN,
      [`--host=${c.host}`, `--port=${c.port}`, `--user=${c.user}`, name],
      {
        stdin: file,
      },
    );
    const counts: Record<string, number> = {};
    for (const table of CHECKED_TABLES) {
      const count = async (db: string) => {
        const [[row]] = (await admin.query(
          `SELECT COUNT(*) AS n FROM \`${db}\`.\`${table}\``,
        )) as unknown as [{ n: number }[]];
        return Number(row!.n);
      };
      const [expected, actual] = [await count(c.database), await count(name)];
      if (actual !== expected) throw new Error(`Restored count mismatch: ${table}`);
      counts[table] = actual;
    }
    const report = {
      database: name,
      seconds: Math.round(performance.now() - started) / 1000,
      counts,
      originalDatabaseUnchanged: true,
    };
    await writeFile(
      resolve(process.cwd(), env().WRITABLE_DIR, "restore-report.json"),
      JSON.stringify(report, null, 2),
    );
    return report;
  } finally {
    await admin.end();
  }
}
