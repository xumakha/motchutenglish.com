import "server-only";
import { existsSync } from "node:fs";
import { pool } from "@/db/client";
import { env } from "@/env";
import { backup, restoreDrill } from "./backup";
import { cleanup, reconcile, run, tick } from "./jobs";

// Worker and operations CLI (ports of database/worker.php, backup.php and restore-drill.php).
//   pnpm worker run [limit]     process due jobs (1-100, default 50)
//   pnpm worker tick            close streak days, queue reminders (cron: every 5 minutes)
//   pnpm worker cleanup         retention cleanup (cron: nightly)
//   pnpm worker reconcile       rebuild reward balances from the ledger
//   pnpm worker backup          SQL dump into writable/backups
//   pnpm worker restore-drill FILE
// Production runs the bundled copy: node dist/worker.mjs <command>.

const usage =
  "Usage: worker run [limit] | tick | cleanup | reconcile | backup | restore-drill FILE";

async function main(argv: string[]): Promise<unknown> {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  env(); // fail fast on a bad environment
  const [command = "run", arg] = argv;
  switch (command) {
    case "run":
      return run(Math.min(100, Math.max(1, Number.parseInt(arg ?? "50", 10) || 50)));
    case "tick":
      return tick();
    case "cleanup": {
      const result = await cleanup();
      if (result.stalePending)
        console.error(`WARNING: ${result.stalePending} pending jobs are more than 1 hour late`);
      return result;
    }
    case "reconcile":
      return reconcile();
    case "backup":
      return { file: await backup() };
    case "restore-drill":
      if (!arg) throw new Error(usage);
      return restoreDrill(arg);
    default:
      throw new Error(usage);
  }
}

main(process.argv.slice(2))
  .then((result) => {
    console.log(JSON.stringify(result));
    process.exitCode = 0;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  // Other pools (import progress telemetry) may still hold sockets; exit explicitly.
  .finally(async () => {
    await pool()
      .promise()
      .end()
      .catch(() => {});
    process.exit();
  });
