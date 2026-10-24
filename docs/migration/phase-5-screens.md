# Phase 5: porting screens

How to port a PHP screen to `web/`. The goal is **the same page**: same markup, classes and text as the PHP view, so the existing CSS renders it identically. Read the PHP view and the data it gets from `Product::page()` (`application/controllers/Product.php`, the `page()` method) before writing anything.

## Reference implementation

`web/app/page.tsx` (home, a port of `views/home/product.php`) is pixel-identical to PHP at 1440 and 360 px. Copy its patterns.

## Page skeleton

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteShell } from "@/components/site/site-shell";
import { PageHeading } from "@/components/site/page-heading";
import { pageMetadata } from "@/site/seo";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/lo-trinh", "Lộ trình học");          // path, PHP title
}

export default function Page() {
  return (
    <SiteShell page="lo-trinh">                              {/* root segment → page-<root> class */}
      <PageHeading title="…" description="…" eyebrow="…" />  {/* PHP heading() */}
      <Suspense><Content /></Suspense>                       {/* anything reading DB/session */}
    </SiteShell>
  );
}
```

- `params`/`searchParams` are Promises (`await props.params`). Use `PageProps<"/lo-trinh/[slug]">`.
- `SiteShell lessonMode` adds the `lesson-mode` class (player pages).
- Missing item → `notFound()` from `next/navigation`.

## Data

- **Public catalog**: `publicPaths()`, `publicLessons(pathId?)` from `@/site/catalog` (cached, tag `catalog`).
- **Site settings**: `currentSiteSettings()` from `@/site/settings`.
- **Everything else**: call domain modules directly (`@/domain/...`). Never call `/api/v1` from a server component.
- **Who is viewing**: `currentUser()` / `userOrLogin()` / `staffOrLogin(admin?)` from `@/auth/session`; `currentActor()` from `@/server/actor` when a domain function needs an `Actor`.
- Any component that reads the database or the session must sit inside `<Suspense>` and must not run during `next build`. Cached helpers already call `connection()`; for direct DB reads call `await connection()` (from `next/server`) first, or read the session first (that also makes it request-time).
- Page-specific queries go in `src/site/queries/<your-area>.ts`.

## Forms (PHP `product_form()` and `<form method=post>` with `command`)

- Actions live in `src/actions/routes.ts` (one per contract route). Use them; do not write new Server Actions for things a route already does.
- One-button forms: `<RouteForm action={buyItem} fields={{ itemId, requestKey }} label="Mua" />` from `@/components/route-form`.
- Bigger forms: a client component with `useActionState(action, idleState)`, `<ActionStatus state={state} />`, and `Field` from `@/components/form-fields` for labelled inputs with field errors.
- Request keys (`requestKey`, `request_key`) are generated **on the server** when rendering: `randomHex(16)` from `@/domain/php`.
- Checkboxes: send `"1"` when checked (the contract `flag` reads "", "0" as false).
- PHP's success flash is the action's `state.message` (or `"Đã lưu thay đổi."`).

## Client-side JSON calls

Only for things the PHP JavaScript did (polling import status, rating review cards, consuming email tokens). `fetch("/api/v1/…", { method: "POST", headers: { "Content-Type": "application/json" }, body })`. Responses are `{ data }` or `{ error: { message, fieldErrors } }`. No CSRF token is needed (same-origin check in `proxy.ts`).

## Links

- Internal links: `<Link href="/lo-trinh">` (typed routes; dynamic ones like `` `/bai-hoc/${slug}` `` type-check against existing pages).
- Uploaded images: plain `<img src="/media/{id}">` with an eslint-disable comment (see the home page).

## Visual check

The PHP app runs at `http://127.0.0.1:8080` (dev DB `motchutenglish`). Screenshot both apps at 360 and 1440 px and compare. Data differs between the two databases, but structure, spacing and styles must match.

## Tests

Add Playwright specs in `web/tests/e2e/<area>.spec.ts`. Flow tests run once (`test.skip(({ viewport }) => viewport?.width !== 1440)`); layout checks at all four widths. The dev database holds the seeded sample catalog; create users through `/register` and grant roles with `tests/e2e/db.ts`.

## Ownership while three people work in parallel

| Area | Owns (may create/edit) |
|---|---|
| Public + identity | `app/{lo-trinh,bai-hoc,tu-vung,kien-thuc,chien-dich,tim-kiem,kiem-tra-dau-vao,gioi-thieu,lien-he,dieu-khoan,bao-mat,quen-mat-khau,dat-lai-mat-khau,xac-minh-email,huy-nhac-hoc}/**`, `src/site/queries/public.ts`, `src/components/public/**`, `tests/e2e/public.spec.ts` |
| Learner | `app/{hoc,bat-dau,on-tap,so-tu-vung,tien-do,tai-khoan,reward-shop}/**` except `app/hoc/luot/**` and `app/hoc/bai/**`, `src/site/queries/learner.ts`, `src/components/learner/**`, `tests/e2e/learner.spec.ts` |
| Admin + legacy | `app/admin/**`, `app/{courses,listening,toeic,placement,dashboard,ket-qua}/**`, `app/hoc/bai/**`, `src/site/queries/{admin,legacy}.ts`, `src/components/{admin,legacy}/**`, `tests/e2e/{admin,legacy}.spec.ts` |
| Lesson player | `app/hoc/luot/**`, `src/components/player/**`, `tests/e2e/player.spec.ts` |

Everything else (shell, auth, server, domain, contracts, schema, config, CSS in `public/assets`) is shared: do not edit it. If you need a change there, describe it in your hand-back.
