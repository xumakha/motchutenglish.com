## Repository layout

- The Next.js 16 + TypeScript app is the repo root (`app/`, `src/`, `proxy.ts`). Run `pnpm check`, `pnpm test:db`, `pnpm build`, `pnpm test:e2e` from here.
- Tests: `src/**/*.test.ts` (unit), `tests/integration` (database), `tests/e2e` (Playwright), `tests/http` (black-box HTTP suites, `python3 tests/http/run_next.py`).
- The PHP app it replaced is at git tag `php-final`. The migration plan and its progress log are in `docs/migration/nextjs-typescript-plan.md`.
- Next.js docs for the installed version are in `node_modules/next/dist/docs/`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
