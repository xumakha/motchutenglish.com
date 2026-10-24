# Một chút English — Next.js app

Rewrite of the PHP app in Next.js 16 + TypeScript. Plan: [`docs/migration/nextjs-typescript-plan.md`](../docs/migration/nextjs-typescript-plan.md).

Requires Node 24+ and pnpm.

```sh
pnpm install
pnpm dev          # http://localhost:3000
pnpm check        # typecheck, lint, format check, unit tests
pnpm build
pnpm test:e2e     # Playwright at 360/390/768/1440 px (runs `pnpm start`, so build first)
```

`src/contracts/` holds the zod contract for every `/api/v1` route and form action the PHP app accepts. A unit test fails if `application/controllers/Product.php` and the contracts drift apart.

## Worker and operations

Background jobs (email, reminders, exports, large imports, account deletion, analytics) run in a separate process, never inside a web request. Only one worker runs at a time; a second one exits with `{"busy":true}`.

```sh
pnpm worker run [limit]       # process due jobs (default 50, max 100)
pnpm worker tick              # close streak days, queue reminders
pnpm worker cleanup           # retention cleanup; warns about pending jobs over 1 hour late
pnpm worker reconcile         # rebuild reward balances from the ledger
pnpm worker backup            # SQL dump into writable/backups (needs mariadb-dump)
pnpm worker restore-drill FILE  # restore a dump into a new mce_restore_test_* database and compare counts
```

Production runs the bundled copy (`pnpm build:worker` → `dist/worker.mjs`, no dev dependencies needed):

```cron
* * * * *    node dist/worker.mjs run 50
*/5 * * * *  node dist/worker.mjs tick
15 3 * * *   node dist/worker.mjs cleanup
30 3 * * *   node dist/worker.mjs backup
```

Mail: `MAIL_DRIVER=log` writes each message as a private JSON file in `writable/mail` (development and test only). `MAIL_DRIVER=smtp` needs `MAIL_FROM`, `SMTP_HOST`, and STARTTLS or TLS. If the connection fails after the server started reading the message, the job is marked "delivery uncertain" and is never resent automatically; check the mail provider before retrying it by hand.
