# Một Chút English

Vietnamese English-learning site: lessons with graded exercises, spaced review, a vocabulary notebook, streaks and rewards, and a CMS for editors. Next.js 16 + TypeScript + MariaDB.

The PHP app it replaced is at git tag `php-final`. How the move happened: [`docs/migration/nextjs-typescript-plan.md`](docs/migration/nextjs-typescript-plan.md).

## Local setup

Needs Node 24+, pnpm, and a MariaDB (10.11 in CI) user that can create databases.

Create `.env.local`:

```sh
APP_URL=http://localhost:3000
DATABASE_URL=mysql://USER:PASSWORD@127.0.0.1:3306/mce_dev
BETTER_AUTH_SECRET=at-least-32-random-characters
MAIL_DRIVER=log
```

`src/env.ts` lists every variable and its default. A bad value stops the app at boot.

```sh
pnpm install
pnpm db:reset                              # drop + create the database, apply migrations (refuses in production)
pnpm seed --publish-reviewed-samples       # sample catalog; plain `pnpm seed` leaves it as drafts
pnpm admin create you@example.com "Name" --local   # admin; password written to writable/local-admin-*.txt
pnpm dev                                   # http://localhost:3000
```

Other admin commands: `pnpm admin set-role EMAIL admin|editor|learner`, `pnpm admin check`. Without `--local`, `pnpm admin create` reads the password from stdin. `--local` is refused unless the database is on `127.0.0.1`/`localhost`.

## Checks and tests

```sh
pnpm check        # typecheck, lint, format check, unit tests
pnpm test:db      # database tests (needs DATABASE_URL on a migrated database)
pnpm build
pnpm test:e2e     # Playwright at 360/390/768/1440 px; starts `pnpm start`, so build first
pnpm benchmark    # A02: 50 concurrent graded submits against a running build
python3 tests/http/run_next.py   # black-box HTTP suites in their own database
```

Details: [`docs/testing.md`](docs/testing.md).

## Where things are

- `app/`: pages, `/api/v1/[...route]`, file routes (`/media`, `/du-lieu`).
- `src/domain/`: business rules (assessment, study, content, review, motivation, identity, exports).
- `src/contracts/`: zod contract for every API route; `pnpm docs:api` writes [`docs/api-v1.md`](docs/api-v1.md) from it.
- `src/server/`, `src/actions/`: request handling for `/api/v1` and Server Actions.
- `src/worker/`: background jobs and operations CLI.
- `proxy.ts`: request id, redirects, same-origin check, sign-in redirect.
- `drizzle/`: migrations. `seed/`, `templates/`: sample catalog and import templates.

More: [`docs/architecture.md`](docs/architecture.md), [`docs/api.md`](docs/api.md), [`docs/data-model.md`](docs/data-model.md).

## Worker

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

## Mail

- `MAIL_DRIVER=disabled` (default): features that need mail say it is unavailable.
- `MAIL_DRIVER=log`: each message is a private JSON file in `writable/mail`. Development and test only; refused when `APP_ENV=production`.
- `MAIL_DRIVER=smtp`: needs `MAIL_FROM`, `SMTP_HOST`, and STARTTLS or TLS (`SMTP_ENCRYPTION`).

If the SMTP connection fails after the server started reading the message, the job is marked "delivery uncertain" and is never resent automatically. Check the mail provider before retrying it by hand.

## Deployment

See [`docs/operations.md`](docs/operations.md).
