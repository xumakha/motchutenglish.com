import { execFileSync } from "node:child_process";
import { stat } from "node:fs/promises";
import { createConnection } from "mysql2/promise";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "@/db/client";
import { env } from "@/env";
import { backup, restoreDrill } from "@/worker/backup";

// SQL dump and restore drill (ports of database/backup.php and restore-drill.php). Needs the
// MariaDB client tools; CI installs them.

const hasClient = (() => {
  try {
    execFileSync(env().MYSQLDUMP_BIN, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

afterAll(() => pool().end());

describe.skipIf(!hasClient && !process.env.CI)("backup and restore drill", () => {
  it("dumps privately and restores into a new database with matching counts", async () => {
    const file = await backup();
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    const report = await restoreDrill(file);
    expect(report.database).toMatch(/^mce_restore_test_[a-f0-9]{12}$/);
    expect(report.originalDatabaseUnchanged).toBe(true);
    expect(Object.keys(report.counts)).toContain("users");
    const admin = await createConnection({ uri: env().DATABASE_URL });
    await admin.query(`DROP DATABASE \`${report.database}\``);
    await admin.end();
  }, 120_000);

  it("refuses files outside writable/backups", async () => {
    await expect(restoreDrill("package.json")).rejects.toThrow("writable/backups");
  });
});
