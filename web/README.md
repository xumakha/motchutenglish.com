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
