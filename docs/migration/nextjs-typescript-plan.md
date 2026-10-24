# Migration plan: PHP → Next.js + TypeScript

Status: **draft for review** · Branch: `plan/nextjs-typescript-migration` · Date: 2026-10-23

Goal: replace the PHP application completely with a Next.js + TypeScript app. Copy every user flow, including the legacy ones, fix every known bug, and use idiomatic Next.js tools where they fit. No code is written by this document; it is the plan.

Owner direction (2026-10-23):

- Copy the exact user flows to Next.js, **including the original/legacy flows**.
- **Fix all bugs** found in the review (§1.4) during the port.
- The tech stack may change to **match Next.js patterns**. Parity means the same user-visible behaviour, not the same internals.
- **No users yet**, so there is no session, password or guest-attempt migration. The DB can be rebuilt from seed data.
- Production supports **Node and MariaDB**.

---

## 0. Summary

| Item       | Decision                                                                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework  | Next.js **16.4.x** (App Router, Node runtime only), React 19                                                                                                                                               |
| Language   | TypeScript **5.9.x**, `strict: true` (TS 7 not adopted until Next tooling confirms support)                                                                                                                |
| Runtime    | Node **24 LTS** in production (Next 16 needs ≥ 20.9)                                                                                                                                                       |
| Database   | **MariaDB**. Same domain model, but **Drizzle owns the schema** (a fresh baseline migration replaces `schema.sql`/`product.sql`/PHP migrations). Content is reloaded from `product-seed.json`              |
| DB access  | **Drizzle ORM + mysql2**, raw SQL where locking/idempotency needs it                                                                                                                                       |
| Validation | **zod 4**, shared by forms, Server Actions and route handlers                                                                                                                                              |
| Auth       | **Better Auth** (email + password, DB sessions, email verification, password reset, rate limit) with its Drizzle adapter. App rules (roles, last-admin guard, account erase, guest claim) stay in our code |
| Mutations  | **Server Actions** for all forms; **Route Handlers** only for `/api/v1` (player, polling), media, downloads, sitemap/robots                                                                                |
| Caching    | **Cache Components** (`"use cache"` + `cacheTag`) for public catalog pages; personal pages stay dynamic                                                                                                    |
| Dates      | **Luxon** for wall-clock/timezone math (streaks, quests, review cap)                                                                                                                                       |
| Mail       | **Nodemailer** + **React Email** templates, wrapped so any failure after DATA counts as "delivery uncertain"                                                                                               |
| Jobs       | Separate Node worker process (`run`, `tick`, `cleanup`, `reconcile`), same queue design; `after()` for small post-response work                                                                            |
| Styling    | Same look. Global design tokens + **CSS Modules** per component; fonts via **`next/font/local`**; images via `next/image`                                                                                  |
| Tests      | Vitest (unit), black-box HTTP suites adapted to the new auth/redirect details, Playwright (browser, replaces CDP scripts)                                                                                  |
| Strategy   | **Parallel rebuild, then one cutover.** No users, so no coexistence phase and no data migration                                                                                                            |
| Effort     | **~15–18 person-weeks** for one experienced full-stack developer (see §11)                                                                                                                                 |

Hosting confirmed (2026-10-23): production supports Node and MariaDB, so the `docs/specification.md` §3 concern does not block this plan.

---

## 1. What exists today (review findings)

Source of truth: four deep reviews of the whole repo on 2026-10-23.

### 1.1 Size

- 326 KB of dense PHP (~8–10k lines in normal formatting). The biggest files are `Product.php` (48 KB, all pages and the API), `Content.php` (42 KB), `Study.php` (20 KB) and `Assessment.php` (15 KB).
- 29 view files covering ~45 distinct screens. `product/page.php` (35 KB) switches over 17 public/learner sections and `product/admin.php` (21 KB) over ~15 CMS sections.
- Client JS: `product.js` (30 KB, the lesson player) and `app.js` (8 KB, legacy static site).
- CSS: `style.css` (1,277 lines, legacy), `redesign.css` (active tokens), `product.css`.
- DB: 59 tables (9 legacy, 47 `mce_*`, 3 added by migrations) and 19 JSON columns.
- Tests: ~2,150 lines across Python HTTP suites, PHP unit scripts and two Chrome CDP scripts.

### 1.2 Architecture

- No framework. `index.php` → `bootstrap.php` (eager `require` of everything) → regex route table (`application/config/routes.php`) → controller → `View` (header/view/footer).
- `Product.php` handles every new page and `/api/v1/*`. The same `execute()` serves JSON API calls and HTML form POSTs; forms send a `command` field naming the API route.
- Domain logic lives in 17 libraries: Assessment, Study, Content, ImportStatus, AssetStorage, Review, Motivation, Jobs, MailTransport, Exports, MarketingAnalytics, Identity, Auth, ProductSupport, Seo, CatalogCache, Learning (legacy).
- **Two learning systems run side by side.** The new one uses `mce_*` tables. The legacy one (`learning_lessons`, `learning_attempts`, `/admin`, `/hoc/bai/{n}`, `/ket-qua/{id}`) is still routed. Legacy static pages (`/courses`, `/listening`, `/toeic`, `/placement`, `/dashboard`) render from `assets/json/courses.json`.

### 1.3 Behaviours the rewrite must keep exactly

These are the contracts. Each one gets a test before or during the port.

Since the owner allows the stack to follow Next.js patterns and there are no users, the **auth and HTTP internals below are now reference, not hard contracts**. Better Auth replaces the session cookie, CSRF token, bcrypt cost and limiter internals; Next.js defaults replace 301→308 trailing-slash redirects and blanket `no-store`. What must stay: the same flows, the same security outcomes (session revoked on password/email change and delete, generic reset responses, login throttling, CSRF protection, constant-time checks), and **every learning, review, reward, job and content rule exactly as listed**.

**Request and HTTP**

- Response headers on every request: `Cache-Control: no-store, private`, `X-Content-Type-Options`, `Referrer-Policy`, the CSP (`script-src 'self'`; inline styles allowed), `X-Request-ID` (16 hex chars), and HSTS when secure.
- Redirects: `/index.php` and `?page=x` → 301; trailing slash → 301; the `mce_redirects` table is checked before the routes and again before the 404; three asset aliases.
- API envelope: `{data, requestId}` on success. On failure: `{error:{code:"HTTP_n", message, fieldErrors, requestId, currentAttempt?}}`. `currentAttempt` is included on `attempts/{id}/*` 409s.
- JSON input: object only, body ≤ 1,050,000 bytes, depth 64. Array values are allowed only for `document`, `response` and `ids`.
- Error mapping in transactions: MySQL 1062/1205/1213 → 409 and 1451/1452 → 422. Deadlocks (1205/1213) retry up to 3× with 10–50 ms jitter. Every connection uses READ COMMITTED and `time_zone='+00:00'`.

**Auth and identity**

- Passwords: bcrypt `$2y$`, cost 12, rehashed on login. Length is limited to 72 **bytes**, with a minimum of 8 **characters** on register and reset. Login checks a fixed dummy hash when the email is unknown, so timing doesn't leak which accounts exist.
- Session cookie: `mce_session`, HttpOnly, SameSite=Lax, browser-session lifetime, ~24 min idle expiry (PHP GC default). The session ID rotates on sign-in, and the CSRF token rotates at the same time.
- Revocation: every request compares `session.user.session_version` with `mce_profiles.session_version`; a deleted profile ends the session. A missing profile row counts as valid.
- CSRF: one token per session, sent as a `<meta>` tag plus the `X-CSRF-Token` header or a `csrf` field, compared in constant time.
- Login limiter: `sha256('auth:'+IP)`, 15 attempts per 900 s, the 16th gets 429 with `Retry-After: 900`. It counts successes too. Forwarded headers are ignored.
- Generic limiter `mce_limit(scope, max, secs)` with per-scope limits (reset 5, verify 5, password 10, consume-token 20, reports 10, consent 30, start 60, study 500/60 s, review 120/60 s, import 10, upload 30, export 5/h).
- Tokens: 64 hex chars, stored as sha256. Reset lasts 60 min, verify 24 h, unsubscribe 30 days. Links carry the token in the URL **fragment**.
- Guests: a random 32-byte session value; the attempt stores `sha256(value)`. A wrong guest gets 404. Claiming moves the attempt to the user and regrades it.
- Roles: `learning_roles` ENUM editor/admin; no row means learner; logged out means guest. An admin cannot change their own role. The last active admin cannot be deleted.

**Learning engine**

- The lesson document schema (schemaVersion 1, blocks, 11 exercise types, blueprint) with all limits, as listed in the review.
- Grading normalisation: NFC; whitespace policy `collapse|trim|preserve`; optional removal of trailing `.!?`; case-insensitive by default. No accent or apostrophe folding.
- Per-type grading rules, partial credit for fill/match, skip (score 0, max kept), and audio_error (unavailable).
- Redaction: answers are never in a public exercise. Test mode returns no feedback until finish and strips transcripts.
- Attempts: optimistic `revision`; a list of no-op actions that bypass the revision check; the first submit is final; finish requires all required blocks viewed and all items resolved. Pass rule: `score*100 >= max*passThreshold` and no unavailable audio.
- Active time: adds `min(30, elapsed)` when 0 < elapsed ≤ 45 s, with the daily cap per `last_pulse`.
- Presented order: shuffled choice/token IDs, and opaque right-side IDs for match.

**Review, rewards, streaks**

- Review intervals (algorithm v1): again → +10 min; hard `max(1,ceil(p*1.2))`; good `p=0?1:max(1,p*2)`; easy `p=0?3:max(3,p*3)`; cap 180 days; due = UTC now + N×24 h.
- Daily review cap uses wall-clock local midnights in `quest_timezone` (23/25 h days on DST).
- Ledger: `INSERT IGNORE` with `v2:`-prefixed `event_key`s. Balances are always computed as SUM(ledger) inside the profile lock, and `mce_balances` is only a projection. The reward amounts table (20/30/5/5/2/5/5, caps 2/day and 10/day) is in the review notes.
- Profile row lock is the per-user serialisation point. Lock order: profile, then quest/card/streak.
- Streaks: closed dates are immutable. Auto-protect uses tickets, and every 7th learned day grants a ticket (max 2). A timezone change takes effect at the next local midnight, with a 7-day cooldown.
- Purchases and review rates are idempotent by `request_key`. The same key with a different body gets 409.

**Jobs, mail, exports, analytics**

- One worker at a time via `GET_LOCK('mce_worker',0)` on a dedicated connection.
- Backoff `min(3600, 30*2^min(7,tries))`, failing after 5 tries. Recovery after a crash: imports, exports and deletes are requeued; mail, reminders and analytics are marked **failed, "delivery uncertain"** and never resent automatically. Admin retry refuses "uncertain" jobs.
- SMTP: STARTTLS/TLS only, peer verification, 15 s timeouts, CR/LF injection guards. A missing 250 after DATA counts as "uncertain".
- Exports: private files (0600, exclusive create) streamed with an unbuffered cursor, expire after 24 h, owner-only download.
- GA4 Measurement Protocol only with consent and both env vars set. Events older than 72 h are rejected.

**Content and media**

- Workflow: draft → in_review → published, plus return, archive and restore (rollback). Publishing is admin-only. Editing a published entity creates a proposal. Entity drafts detect stale edits via the sha256 of the stored document. A slug change writes a 301 and collapses redirect chains.
- Import: JSON or CSV, ≤ 1 MB and ≤ 1,000 records. Preview errors carry dot-paths. Commits of ≤ 100 records run inline, larger ones are queued. Commits are atomic, and progress is written through a second connection.
- Media: upload ≤ 10 MB; both the detected MIME type and the extension must be on the allowlist (jpg, png, webp, mp3, ogg, wav); `alt`, `source` and `license` are required. `/media/{id}` visibility rules as in the review.

### 1.4 Known bugs and quirks found during the review

Owner decision: **fix all of them during the port.** Each fix gets a test that fails on the PHP behaviour and passes on the new one, and the fix is listed in the changelog so parity diffs are expected, not surprises.

| #   | Issue                                                                                                                    | Fix                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 1   | Lesson preview does not shuffle match right-IDs, which leaks answers. Each preview GET also creates a new attempt        | Shuffle in preview too; reuse one preview attempt per staff user and version                 |
| 2   | Heartbeat bumps `revision`, so a second tab gets a 409 on its next action                                                | Heartbeat updates time only, not `revision`                                                  |
| 3   | Offline outbox keeps only the last action with a frozen revision; actions sent while busy are dropped                    | Ordered outbox queue; replay on reconnect and on page load; queue instead of drop while busy |
| 4   | `retry` has no lock, no revision check and no finished check                                                             | Lock the attempt; reject retry after finish                                                  |
| 5   | Lesson drafts have no stale-edit check (entity drafts do)                                                                | Same `expected` hash check as entity drafts                                                  |
| 6   | `view` stores an unvalidated `position`                                                                                  | Validate against block/exercise count                                                        |
| 7   | Guest claim reopens a finished attempt                                                                                   | Keep it finished; rescore on the server and record progress for the new user                 |
| 8   | Login limiter counts successful logins (shared Wi-Fi gets locked out)                                                    | Count failures only, keyed by IP + email (Better Auth rate limit + custom rule)              |
| 9   | Rate-limit rows accumulate (cleanup deletes after 7 days only)                                                           | Expire by window in the limiter store; nightly purge                                         |
| 10  | Search uses `LIKE '%q%'` without escaping `%`/`_`, and scans every lesson document                                       | Escape wildcards; MariaDB FULLTEXT index on a search table filled on publish                 |
| 11  | `/media/{id}` decodes every published lesson on each request; no Range support, so audio seeking breaks                  | `media_refs` table filled on publish; HTTP Range + ETag                                      |
| 12  | Placement suggestion picks the last matching rule, not the highest threshold                                             | Pick the highest `minPercent` that is met                                                    |
| 13  | CSV import namespace is fixed to `csv-vocabulary`, so externalIds collide across batches                                 | Namespace becomes a required CSV import field                                                |
| 14  | `correct` quest counts exercises across all lessons, not the user's path                                                 | Count within the user's enrolled path                                                        |
| 15  | Re-adding a review card does not refresh its snapshot and un-removes `hidden=2`                                          | Refresh the snapshot; keep removed cards removed unless the user re-adds explicitly          |
| 16  | `cleanup` expires _pending_ jobs older than 7 days                                                                       | Only expire failed jobs; alert on pending jobs older than 1 hour                             |
| 17  | Docs and code disagree (`blockId` vs `block`, `ignorePunctuation` vs `ignoreTerminalPunctuation`, `reportId` vs `id`, …) | Code is the truth; zod schemas generate the API docs                                         |
| 18  | Duplicated `true_false` validation                                                                                       | Remove duplicate                                                                             |
| 19  | `/hoc` route shadows `Learning::index('hoc')` (dead code)                                                                | Legacy lesson list moves to its own route (see §4)                                           |
| 20  | Every page is `no-store`, so nothing is CDN-cacheable                                                                    | Cache Components for public pages; `private, no-store` only for personal/admin pages and API |
| 21  | `Identity::base()` throws 503 on every page in production if `APP_URL` isn't https                                       | Validate env with zod at boot; fail the deploy, not the request                              |
| 22  | Mail jobs keep the raw reset token in the payload until done                                                             | Store the token ID; build the link at send time                                              |
| 23  | Import jobs impersonate the actor by faking a session                                                                    | Pass the actor ID explicitly to the domain function                                          |
| 24  | Analytics events older than 72 h are retried 5 times before failing                                                      | Fail immediately as "too old"                                                                |

---

## 2. Target architecture

```
web/                         # new Next.js app (moves to repo root at cutover)
  app/
    (public)/                # /, /lo-trinh, /bai-hoc/[slug], /tu-vung, /kien-thuc, legal pages…
    (learner)/               # /hoc, /hoc/luot/[id], /on-tap, /so-tu-vung, /tien-do, /tai-khoan, /reward-shop
    (auth)/                  # /login, /register, /quen-mat-khau, /dat-lai-mat-khau, /xac-minh-email
    admin/                   # CMS, layout-level staff guard
    (legacy)/                # /courses…, /listening…, /toeic, /placement, /dashboard, /hoc/bai/[id], /ket-qua/[id]
    api/auth/[...all]/route.ts   # Better Auth handler
    api/v1/[...route]/route.ts   # single dispatcher, same route table as Product::execute
    media/[id]/route.ts
    du-lieu/…/route.ts       # downloads, templates, export files
    theme.css/route.ts
    health/route.ts
    robots.ts, sitemap.ts
    not-found.tsx            # checks redirects table before rendering 404
  proxy.ts                   # request id, security headers + CSP nonce, ?page= / index.php redirects, optimistic auth redirects
  src/
    env.ts     zod-validated environment (fails at boot)
    db/        schema/*.ts (Drizzle, source of truth), client.ts, tx.ts (READ COMMITTED + retry + error map), locks.ts
    auth/      better-auth config, roles.ts, guards (requireUser/requireStaff/requireAdmin)
    server/    errors.ts, envelope.ts, rateLimit.ts, settings.ts, actions.ts (Server Action wrapper: auth + zod + flash)
    domain/    assessment/, study/, content/, imports/, review/, motivation/, identity/,
               exports/, analytics/, seo/, media/, jobs/, legacy/
    emails/    React Email templates
    components/ shared UI (Button, Field, ErrorSummary, Pagination, …) with CSS Modules
    player/    client lesson player (React), outbox queue, audio
  worker/      cli.ts (run|tick|cleanup|reconcile), mailer.ts
  scripts/     db-reset.ts, seed.ts, create-admin.ts, set-role.ts, check.ts, backup.ts, restore-drill.ts
  tests/       unit (vitest), parity runner glue, playwright
```

Rules:

- **Domain modules are framework-free.** They take a `tx` plus plain inputs and return plain data. Pages, Server Actions, route handlers and the worker all call the same functions.
- **Reads in Server Components, writes in Server Actions.** Pages read straight from domain modules (no HTTP hop). Forms call Server Actions with `useActionState` for field errors and keep working without JS.
- **`/api/v1/*` stays** for the client lesson player, review rating and polling, with the same paths and envelope, so `product.js` behaviour ports one to one.
- **Node runtime everywhere.** No edge runtime, because of mysql2 and the file system.

### Next.js 16 specifics to respect (from `node_modules/next/dist/docs`)

- `middleware.ts` is now **`proxy.ts`**. It must not do slow data fetching, so DB redirects go in `not-found.tsx`, not in the proxy.
- `cookies()`, `headers()`, `params` and `searchParams` are **async only**.
- Turbopack is the default bundler, and `next lint` is removed (use ESLint flat config directly).
- Cache Components on (`cacheComponents: true`, `partialPrefetching: true`). Public catalog reads use `"use cache"` + `cacheTag('catalog')`, and admin publish calls `updateTag`/`revalidateTag`. Personal data is read inside `<Suspense>` with `cookies()`, so it is never cached.
- Server Actions default to a 1 MB body. The 10 MB media upload goes through a route handler; import uses `serverActions.bodySizeLimit: '2mb'`.
- Trailing-slash redirects use Next's default **308** (owner accepted Next defaults). Parity tests are updated.
- Use `output: 'standalone'` for the Docker image.

---

## 3. Key technical decisions (with reasons)

1. **Drizzle owns a fresh schema.** No users means no data to keep. Generate a first draft with `drizzle-kit pull` from today's DB, then clean it up into `src/db/schema/*.ts`:
   - Explicit `utf8mb4_unicode_ci` on every table.
   - Real FKs from the start.
   - Arrays instead of key-ordered objects for `presented_order`.
   - New tables: `media_refs` (fix 11) and a search table (fix 10).
   - Better Auth's `user`/`session`/`account`/`verification` tables replace `users`, `auth_attempts`, `mce_auth_tokens` and the session-version check.
   - App profile data stays in `mce_profiles`, linked 1:1 to the auth user.

   `drizzle-kit generate` produces the baseline migration, and `scripts/seed.ts` loads `product-seed.json`. The PHP migration runner and `mce_migrations` are retired.

2. **Drizzle over Prisma.** The app depends on `SELECT … FOR UPDATE`, `INSERT IGNORE` with row-count gating, `ON DUPLICATE KEY UPDATE`, `GET_LOCK`, and per-transaction isolation. Drizzle allows raw SQL inside typed transactions; Prisma makes these awkward.
3. **mysql2 settings:** `timezone: 'Z'`; `dateStrings: ['DATE']` so `local_date` never shifts; READ COMMITTED per transaction; JSON columns typed with `$type<T>()` and parsed (MariaDB returns JSON as text).
4. **Better Auth** (email + password) with the Drizzle MySQL adapter.
   - Database sessions with a cookie cache off, so revocation is immediate.
   - Built-in CSRF/origin checks and rate limiting, with custom rules for fix 8.
   - Email verification and password reset flows, with emails sent through our job queue (so the "uncertain delivery" rule still applies).
   - **Session revocation rules kept:** `revokeOtherSessions`/`revokeSessions` on password change, password reset, email change and account delete.
   - Roles stay in our own `roles` table (editor/admin) and are checked by `requireStaff`/`requireAdmin` guards in layouts, actions and handlers. Better Auth's admin plugin is not used, to keep the last-admin and self-demote rules in one place.
   - Guests keep the current model: a signed random guest ID in an HttpOnly cookie, stored hashed on the attempt, claimed on sign-up or login.
5. **Explicit arrays instead of object key order** for shuffled choices, tokens and match sides. No legacy read adapter is needed.
6. **Time:** Luxon `DateTime.setZone(tz).startOf('day').plus({days:1})` reproduces PHP `modify('+1 day')` wall-clock semantics. Timezones come from `Intl.supportedValuesOf('timeZone')`.
7. **Unicode:** `normalize('NFC')`, `toLowerCase()` (parity-tested against `mb_strtolower` on Vietnamese text), and code-point lengths via `[...s].length` wherever PHP used `mb_strlen`.
8. **Validation:** one zod schema per action, shared by the form (client hints), the Server Action and the route handler. Field errors come back in the same `{field: message}` shape the UI shows today.
9. **Mail:** Nodemailer SMTP (STARTTLS/TLS, `rejectUnauthorized: true`, 15 s timeouts) and React Email templates. A wrapper marks a job "delivery uncertain" when the error happens after the DATA command was sent (inspect `err.command`/`err.responseCode`). This is proven by a fake SMTP server test that drops the connection after DATA. Dev uses a `log` transport (writes `.eml` to `writable/mail`).
10. **Worker lock:** one dedicated mysql2 connection (not from the pool) for the whole run, holding `GET_LOCK('mce_worker',0)`, released in `finally`. Small fire-and-forget work after a response (analytics enqueue) uses `after()`.
11. **Caching:** Cache Components with `cacheTag('catalog')` replaces `CatalogCache` and `catalog_revision`. Publish/archive/reorder actions call `updateTag('catalog')`.
12. **Styling:**
    - `redesign.css` tokens become `app/globals.css` (`:root` variables, base styles).
    - Component styles move into CSS Modules with the same values (2.5px borders, 20px radius, ink shadow, capsule buttons, same breakpoints).
    - Baloo 2 and Be Vietnam Pro load via `next/font/local` from the existing TTFs.
    - `theme.css` becomes CSS variables injected by the root layout from settings, cached with `cacheTag('settings')`.
    - Visual parity is checked by screenshot diff.
13. **CSP:** nonce-based CSP set in `proxy.ts` (per the Next.js CSP guide). JSON data islands become props passed to client components.
14. **Env:** `src/env.ts` validates every variable with zod at boot (fix 21).

### Legacy flows (kept, per owner)

Port as-is in behaviour, under an `app/(legacy)` route group:

- **Static pages** `/courses`, `/courses/[c]`, `/courses/[c]/[l]`, `/listening`, `/listening/[id]`, `/toeic`, `/placement`, `/dashboard`. They render from `courses.json`, imported at build time (fully static, `generateStaticParams`). The browser-side progress (`mce-progress` in localStorage), text-to-speech and client quiz from `app.js` become a client component.
- **Legacy DB lessons:** the `learning_lessons`/`learning_attempts` tables stay. The old admin CRUD at `/admin` and `/admin/preview/[id]`, start at `/hoc/bai/[id]` (POST via Server Action) and results at `/ket-qua/[id]` keep their rules (+20 XP on first completion, +5 on pass, idempotent per lesson; editor creates, admin publishes).
- The legacy lesson list that `/hoc` used to shadow (fix 19) becomes visible as a "Bài học cũ" section on `/hoc`.

---

## 4. Route parity map

Every row needs a Next.js owner and a parity test. "P" means page, "R" means route handler, "A" means server action.

| Current                                                                                            | Next.js                                                     | Auth                   |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------- |
| `/`                                                                                                | P `app/(public)/page.tsx`                                   | public                 |
| `/lo-trinh`, `/lo-trinh/[slug]`, `/bai-hoc/[slug]`                                                 | P                                                           | public                 |
| `/tu-vung`, `/tu-vung/[slug]`, `/tu-vung/chu-de/[slug]`                                            | P                                                           | public                 |
| `/kien-thuc`, `/kien-thuc/[slug]`, `/chien-dich/[slug]`                                            | P                                                           | public                 |
| `/tim-kiem`, `/kiem-tra-dau-vao`, `/gioi-thieu`, `/lien-he`, `/dieu-khoan`, `/bao-mat`             | P                                                           | public                 |
| `/quen-mat-khau`, `/dat-lai-mat-khau`, `/xac-minh-email`, `/huy-nhac-hoc`                          | P + A                                                       | public                 |
| `/login`, `/register`, `/account`, `/logout` (POST only, GET → 405)                                | P + A calling Better Auth; same URLs and redirects as today | mixed                  |
| `/hoc`, `/bat-dau`, `/on-tap`, `/so-tu-vung`, `/tien-do`, `/tai-khoan`, `/reward-shop`             | P + A                                                       | user                   |
| `/hoc/luot/[id]`                                                                                   | P (server-rendered state) + client player                   | guest or owner         |
| `/admin/{paths,units,lessons,questions,vocabulary,vocabulary-sets,articles,media,imports,reports}` | P + A                                                       | staff                  |
| `/admin/{users,settings,audit,operations}`                                                         | P + A                                                       | admin                  |
| `/admin/lesson-preview/[id]`                                                                       | P                                                           | staff                  |
| `/api/v1/*` (≈45 actions, 8 GETs)                                                                  | R `api/v1/[...route]`                                       | per action             |
| `/media/[id]`                                                                                      | R (+ Range)                                                 | rules                  |
| `/du-lieu/export`, `/du-lieu/content-export`, `/du-lieu/template-*`, `/du-lieu/export-file/[key]`  | R                                                           | user / staff           |
| `/sitemap.xml`, `/robots.txt`                                                                      | `sitemap.ts`, `robots.ts`                                   | public                 |
| `/theme.css`, `/health`                                                                            | R                                                           | public                 |
| Legacy `/courses…`, `/listening…`, `/toeic`, `/placement`, `/dashboard`                            | P (static) + client component, `app/(legacy)`               | public                 |
| Legacy `/admin`, `/admin/preview/[n]`                                                              | P + A, `app/(legacy)`                                       | staff (publish: admin) |
| Legacy `/hoc/bai/[n]` (POST), `/ket-qua/[id]`                                                      | A + P, `app/(legacy)`                                       | user / owner           |
| `/api/auth/*`                                                                                      | R (Better Auth)                                             | public                 |

The full API action list (start, view/draft/submit/skip/navigate/heartbeat/finish/audio_error, retry, guest/claim, profile, enrollments, vocabulary, review/_, shop/purchase, avatar, reports, password/_, email/_, account/delete, exports/request, reminders, consent, analytics/consent, streak/preferences, admin/_) gets built straight from `Product::execute`. Phase 4 checks it line by line against that source.

---

## 5. Phases

Each phase ends with a **gate**: the listed tests pass and there are no open P0 issues.

### Phase 0: Decisions and foundations (1 week)

- Confirm the exact production MariaDB version (≥ 10.6 needed for the features used).
- Scaffold `web/` with `create-next-app` (Next 16.4.x, TS 5.9, App Router, no Tailwind), pnpm, ESLint flat config, Prettier, Vitest, Playwright.
- Turn on `cacheComponents`, `partialPrefetching`, `typedRoutes` and `output: 'standalone'` in `next.config.ts`.
- Fix `AGENTS.md` so agents read the Next docs from `web/node_modules/next/dist/docs/`.
- `tsconfig` strict, `noUncheckedIndexedAccess`, path aliases.
- CI job: typecheck, lint, unit tests, `next build`.
- Write the **contracts doc**: export the API envelope, error codes, and request/response zod schemas for every `/api/v1` action. This becomes the TypeScript types.

Gate: empty app builds in CI; contracts reviewed.

### Phase 1: Data layer and platform core (2 weeks)

- `drizzle-kit pull` as a starting draft, then the cleaned schema from §3 item 1; `drizzle-kit generate` baseline; `scripts/db-reset.ts` + `scripts/seed.ts` (from `product-seed.json`, keeping the `--publish-reviewed-samples` rule and the seed lock).
- `db/tx.ts`: `withTx(fn)` with READ COMMITTED, 3 retries on 1205/1213, and the error → HTTP map.
- `db/locks.ts`: `lockProfile(tx, uid)` (creates profile and cohort rows like `mce_profile`), `forUpdate` helpers, `insertIgnore` that returns `affectedRows`.
- `env.ts`, request ID, error envelope, security headers + CSP nonce in `proxy.ts`, `?page=` and `index.php` redirects, DB redirects in `not-found.tsx`.
- Better Auth: email/password, DB sessions, verification, reset, rate limits (fix 8), session revocation hooks. Roles and guards. Guest cookie and claim.
- Login, register, account, logout pages with the same validation rules and messages (Vietnamese copy moved into `copy.ts`).
- Settings, `theme` variables, `health`, `create-admin`/`set-role`/`check` scripts.

Gate: **`tests/site_http.py` passes** against the Next server. `tests/auth_http.py` is adapted (cookie name, 308, Better Auth rate-limit response) and passes. All flows match: register → account, login throttling, logout POST-only, CSRF rejection, XSS/SQLi inputs handled.

### Phase 2: Learning engine (3 weeks)

The order follows the dependencies. Port the unit specs **first**, then the code.

1. **Assessment** (pure): document validation, normalisation, all 11 types, solution, publicExercise redaction. Port `tests/product_unit.php` cases to Vitest first, then build a **golden-file harness**: run PHP `Assessment` over every exercise in `product-seed.json` with generated responses, save the outputs, and assert TypeScript produces the same.
2. **Study**: start (idempotent request key), presented order (arrays), mutations with the revision/no-op table, finish/scoring/progress, active time, retry, guest key and claim, preview. Fixes 1, 2, 4, 6, 7, 12.
3. **Content**: versions and workflow, entity proposals, stale-draft hash, slug redirects, set membership, SEO fields, reorder, unit state. On publish: fill `media_refs` and the search table, then `updateTag('catalog')`. Fixes 5, 10, 18.
4. **Imports**: JSON/CSV parsing, dot-path errors, preview, commit (inline ≤ 100 records, otherwise queued with the actor ID), progress via a second connection, rollback. Fixes 13, 23.
5. **Media**: upload (`file-type` for MIME detection, extension allowlist, 0600, `writable/media`), the `/media/[id]` rules via `media_refs`, Range + ETag. Fix 11.
6. **Legacy lessons**: `domain/legacy` for `learning_lessons`/`learning_attempts` (single-choice, snapshot JSON, +20/+5 XP idempotent per lesson).

Gate: Vitest suites green; golden-file diff empty; `/api/v1/attempts/*` and `admin/*` sections of `tests/product_http.py` pass.

### Phase 3: Review, motivation, identity, exports, analytics (2 weeks)

- **Review**: schedule v1, add/manage/rate with the idempotent request key, the daily cap in local wall-clock time, concept cards, snapshots. Fix 15.
- **Motivation**: ledger award, balances projection, quests (lazy create, events, set bonus), streak walk with protection and tickets, badges, timezone change pipeline, shop purchase. Fix 14.
- **Identity** (on top of Better Auth): email change with re-verification, password change, profile, reminders and unsubscribe, delete with the last-admin guard, `erase()` over ~30 tables. Fix 22.
- **Exports**: streaming JSON writer (mysql2 `query().stream()`), private files, expiry, download route.
- **Analytics**: consent, journeys and UTM, funnel, cohort D1/D7, GA4 payload. Fix 24.
- Port `tests/motivation.php`, `timezone.php`, `marketing.php` and `progress_history.php` to Vitest with an injectable clock.

Gate: those Vitest suites green, including DST cases; `timezone_http.py` and the review/shop parts of `product_http.py` pass.

### Phase 4: API surface (1 week, overlaps Phase 2–3)

- `api/v1/[...route]/route.ts` dispatcher for the actions the client player and polling need, with zod input, the 1,050,000-byte body limit, depth 64, Better Auth session + origin check, and `currentAttempt` on attempt 409s.
- **Server Actions** for every HTML form (profile, enrollments, vocabulary, review manage, shop, reports, password, email, account delete, exports, reminders, consent, streak preferences, all `admin/*` commands). A shared `action()` wrapper handles auth guard, zod parse, domain call, flash message and `redirect()` with the allowlisted query params. The `command`-field POST pattern is retired.
- Line-by-line review against `Product.php`; tick off every action in §4 as either an action or an API route.

Gate: `tests/product_http.py` passes, adapted so form-POST cases go through the API equivalents or Playwright.

### Phase 5: UI (3 weeks)

- **Shell:** root layout (`lang="vi"`, skip link, sticky header, `main#main-content`), footer, auth nav with the CSRF logout form. Metadata API for title, description, canonical, OG and the noindex list. BreadcrumbList JSON-LD. `theme-color` from settings.
- **CSS:** tokens and base styles in `globals.css`; component styles in CSS Modules; fonts via `next/font/local`; theme colours from settings as CSS variables in the root layout. The legacy pages keep `style.css` scoped to the `(legacy)` layout. No visual changes.
- **Primitives** (spec §19): Button, Field with error, ErrorSummary (focus + `role=alert`), Status, Pagination, ConfirmDialog, Card. Accessibility from A10: `aria-invalid`/`aria-describedby`, focus management, reduced motion, the per-user animations flag.
- **Pages:** split `product/page.php`'s 17 sections and `admin.php`'s ~15 sections into route-level server components. Data comes straight from the domain modules (no HTTP hop).
- **Player** (client component): port `product.js`.
  - Same endpoints and the same `localStorage` keys (`mce-draft:{account}:{attemptId}`) so drafts carry over.
  - Text formatting stays text-node based (no `dangerouslySetInnerHTML`).
  - Audio speed control, flashcard flip, order/match keyboard behaviour, aria-live announcements.
  - Fix 3: replace the single-slot outbox with an ordered queue, and replay on page load as well as on reconnect.
- **Admin:** JSON document editors stay as textareas (no visual builder, which is out of scope). Import upload and status polling every 3 s.
- **Legacy:** static course/listening/TOEIC/placement/dashboard pages (SSG from `courses.json`) plus the `app.js` features as a client component; legacy lesson admin, start and result pages.

Gate: `tests/redesign_browser.mjs` (44 cases) passes unchanged, and `tests/browser.mjs` is ported to Playwright and passes at 360/390/768/1440 px. Screenshot diff against PHP for every public page is under the agreed threshold.

### Phase 6: Worker, mail, operations (1 week)

- `worker/cli.ts run [n] | tick | cleanup | reconcile`, with the same semantics as `Jobs.php`, including `recoverInterrupted`, backoff, the "uncertain" rule, and import jobs running as the actor ID. Fixes 9, 16.
- `mailer.ts`: Nodemailer + React Email templates (reset, verify, email change, reminder), `log` transport for dev, the after-DATA "uncertain" classifier with its fake-SMTP test.
- `backup.ts` (`mariadb-dump`, `MYSQL_PWD` env, 0600), `restore-drill.ts`. Keep `media-backup.py` as-is (it is Python, not PHP).
- Port the `jobs_recovery.php` scenario test (kill the worker mid-job, restart, check the outcomes).

Gate: `tests/account_http.py` passes (it shells out to the worker, so point it at the TS CLI); jobs recovery test green.

### Phase 7: Parity, performance, hardening (1.5 weeks)

- Run the whole black-box suite with `tests/run_auth.py`, with the server command switched to `next start`. The schema changed, so the PHP fixture CLIs are replaced by a TS fixture CLI (`tests/fixtures.ts`, same 26 operations) built during Phases 2–3.
- One regression test per fix in §1.4 (24 tests).
- Performance A02: 50 concurrent grading sessions, p95 target as in `docs/performance-a02.md`; compare with PHP FastCGI (608–642 ms).
- Security pass: CSP with nonces, CSRF on every mutation (API and actions), IDOR checks on attempts, exports and media, rate limits, upload MIME checks, no secrets in logs, `X-Powered-By` off.
- Accessibility: rerun the A10 checks; the manual screen-reader audit stays an open launch item.

Gate: all suites green, p95 at or under the target, security checklist signed off.

### Phase 8: Cutover and cleanup (1 week)

- New `Dockerfile` (node:24-slim, standalone output, non-root, `writable/` volume, `mariadb-client` + python3 for backups), compose with `web`, `worker` (cron loop or supercronic) and `db`.
- Update CI: build the image, compose config, container smoke test ported to the Node image.
- Fresh-install smoke test (`install_smoke.py` against the TS scripts) and a restore drill.
- Move `web/` to the repo root. Delete `application/`, `index.php`, `router.php`, `.htaccess`, the PHP scripts and `composer.*`. Archive the PHP-only tests.
- Rewrite `README.md`, `docs/architecture.md`, `docs/operations.md`, `docs/testing.md` and `docs/api.md` (fix 17).
- Rollback: there are no users and the schema changed, so rollback means redeploying the PHP tag with its own DB rebuilt from seed. Keep the PHP tag (`php-final`) and its seed scripts.

Gate: staging deploy (HTTPS, SMTP, cron) passes the full suite and the §27–29 acceptance items in the spec.

---

## 6. Testing strategy

| Layer          | Tool                                                         | Source                                                                                                                                                             |
| -------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit           | Vitest                                                       | ports of `product_unit.php`, `learning.php`, `motivation.php`, `timezone.php`, `marketing.php`, `progress_history.php`, `imports.php`, `jobs_recovery.php`         |
| Golden parity  | Vitest + PHP snapshot script                                 | grading, redaction, schedule and streak outputs from PHP vs TS on the same inputs (snapshots taken once from PHP before it is removed)                             |
| Bug fixes      | Vitest / Playwright                                          | one regression test per §1.4 item, written to fail on PHP behaviour                                                                                                |
| HTTP black-box | existing Python suites                                       | `site_http` unchanged; `auth_http`, `product_http`, `account_http`, `learning_http`, `timezone_http` adapted to Better Auth, Server Actions and the TS fixture CLI |
| Browser        | `redesign_browser.mjs` unchanged; `browser.mjs` → Playwright | 4 viewports, keyboard flows, offline/reconnect                                                                                                                     |
| Concurrency    | targeted Vitest + HTTP                                       | double purchase, double rate, two-tab attempt edits, worker lock                                                                                                   |
| Performance    | `performance.py`                                             | A02 p95                                                                                                                                                            |

Rule: **the PHP app stays runnable until cutover**, so every parity question can be answered by running both.

---

## 7. Risks

| Risk                                                                                 | Impact                            | Mitigation                                                                                                                                             |
| ------------------------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Better Auth doesn't fit a rule (guest claim, revocation timing, Vietnamese messages) | Auth rework                       | Spike in week 1 of Phase 1 covering register, login throttling, reset, email change, revoke-all; fall back to a small custom session layer if it fails |
| Server Actions change form behaviour (no-JS, field-error echo, flash)                | UX regressions                    | Shared `action()` wrapper; Playwright tests with JS disabled on key forms                                                                              |
| Subtle grading differences (Unicode, case, whitespace)                               | Wrong scores                      | Golden-file harness over all seed exercises plus fuzzed strings                                                                                        |
| Timezone/DST drift in streaks and quests                                             | Lost streaks, double rewards      | Luxon wall-clock helpers; port the DST tests first; injectable clock                                                                                   |
| Idempotency or lock order changes                                                    | Double rewards, negative balances | Keep `INSERT IGNORE` + affectedRows gating and lock order; concurrency tests                                                                           |
| Worker exclusion broken by the connection pool                                       | Duplicate mail                    | Dedicated connection for `GET_LOCK`; recovery test                                                                                                     |
| SMTP "uncertain" handling lost                                                       | Duplicate emails                  | After-DATA classifier wrapper around Nodemailer, proven with a fake SMTP server test                                                                   |
| Fixing 24 bugs hides real parity regressions                                         | Missed bugs                       | Every fix has its own test and changelog entry; golden diffs list expected differences explicitly                                                      |
| Collation differs between servers                                                    | Email uniqueness/case bugs        | Explicit `utf8mb4_unicode_ci` on every table in the Drizzle schema                                                                                     |
| Scope creep (redesign, new features)                                                 | Timeline slips                    | Strict parity rule; new work goes in a "post-cutover" list                                                                                             |
| Next.js 16 API churn                                                                 | Rework                            | Pin exact versions; read bundled docs; no experimental flags at first                                                                                  |

---

## 8. Decisions needed from the owner

| #   | Question                                 | Recommendation                                                                                               |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| D1  | Will production hosting run Node?        | **Yes** (2026-10-23)                                                                                         |
| D2  | Production database?                     | **MariaDB** (2026-10-23); exact version to confirm in Phase 0                                                |
| D3  | Keep the legacy flows?                   | **Keep and port all of them** (2026-10-23)                                                                   |
| D4  | Fix or preserve the bugs in §1.4?        | **Fix all** (2026-10-23)                                                                                     |
| D5  | Exact PHP internals or Next.js patterns? | **Next.js patterns** (2026-10-23): Better Auth, Server Actions, Cache Components, CSS Modules, 308 redirects |
| D6  | Any live users?                          | **No** (2026-10-23): no data or session migration; DB rebuilt from seed                                      |

All decisions are answered. Remaining small confirmations: exact MariaDB version, SMTP provider, and production domain for `APP_URL`.

---

## 9. Out of scope

Visual redesign, visual lesson builder, question-bank CRUD, interactive charts, new features, Postgres, i18n framework (strings stay Vietnamese and hard-coded, moved into one `copy.ts` per area), edge runtime.

## 10. After cutover (not part of this plan)

Move media to object storage (the storage module stays an adapter); visual block editor; question-bank CRUD; interactive progress charts; CDN in front of cached public pages.

## 11. Effort estimate

| Phase                                                      | Weeks                          |
| ---------------------------------------------------------- | ------------------------------ |
| 0 Foundations                                              | 1                              |
| 1 Data + platform core (Better Auth saves ~0.5)            | 2                              |
| 2 Learning engine + legacy lessons + fixes                 | 3.5                            |
| 3 Review, motivation, identity, exports, analytics + fixes | 2                              |
| 4 API + Server Actions (overlaps 2–3)                      | 1.5                            |
| 5 UI incl. legacy pages and CSS Modules                    | 3.5                            |
| 6 Worker + ops                                             | 1                              |
| 7 Parity + bug regression tests + perf + hardening         | 2                              |
| 8 Cutover                                                  | 1                              |
| **Total**                                                  | **~17.5 (15–18 with overlap)** |

This assumes one experienced developer working full time. Keeping the legacy flows adds ~1.5 weeks and fixing all bugs adds ~1.5 weeks; Better Auth and the fresh schema save ~1 week.

---

## 12. Progress log

### Phase 0 (done, PR #1)

Scaffold in `web/`, tooling, CI, zod contracts for all 61 PHP API operations with a drift test against `Product.php`.

### Phase 1 (done on `migration/phase-1`)

Built:

- Drizzle schema for all tables (`web/src/db/schema/*`), baseline migration `web/drizzle/0000_baseline.sql`, `pnpm db:reset` / `db:migrate`. 60 app tables + the Drizzle migrations table; database created with `utf8mb4_unicode_ci`.
- `db/client.ts` (UTC sessions, DATE as strings, MariaDB JSON parsing), `db/tx.ts` (READ COMMITTED, deadlock retry, error → 409/422 map).
- `env.ts` validated at first use (fix 21).
- Better Auth with serial ids, DB sessions, browser-session cookies, reset-password mail queued by verification id (fix 22).
- Login / register / account pages and POST-only `/logout`; fixed-window limiter on `rate_limits` with an atomic count; failure-only login lockout per IP + email (fix 8).
- `proxy.ts`: request id, `?page=` / `index.php` / slug redirects (301), optimistic 303 to `/login` for private pages, same-origin check for every POST.
- Security headers in `next.config.ts`, `/health`, admin CLI (`pnpm admin create|set-role|check`).
- Tests: 32 unit, 4 database, 8 browser flows; CI runs them against MariaDB 10.11.

Changes from the plan (decided during Phase 1):

| Plan said                                 | Now                                                                           | Why                                                                                                                                                                         |
| ----------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nonce-based CSP                           | Static CSP with `'unsafe-inline'` scripts                                     | Next.js 16 docs: nonces force fully dynamic rendering and are incompatible with Cache Components' static shells. Switch to nonces later only if Cache Components is dropped |
| `/api/auth/*` route (Better Auth handler) | Not mounted; Server Actions call `auth.api`                                   | No extra public endpoints to rate-limit or protect                                                                                                                          |
| CSRF token in forms and `X-CSRF-Token`    | Origin / `Sec-Fetch-Site` check in `proxy.ts` for every POST/PUT/PATCH/DELETE | Next.js lets Server Actions without an `Origin` through with a warning; the proxy rejects them                                                                              |
| Seed script in Phase 1                    | Moved to Phase 2                                                              | It needs lesson validation and vocabulary-set logic from the content module                                                                                                 |
| `db/locks.ts` (`lockProfile`) in Phase 1  | Phase 2/3 with its first callers                                              | Avoid untested helpers                                                                                                                                                      |

Operations notes for Phase 8:

- Run behind a reverse proxy that **appends** the client IP to `X-Forwarded-For`; the limiter trusts the rightmost entry.
- Multi-instance deploys need a shared `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
- Start with `pnpm start` (standalone `server.js`), not `next start`.

Not yet covered from the Phase 1 gate: `tests/site_http.py` checks the legacy public pages, which arrive in Phase 5.

### Phase 2 (done on `migration/phase-2`)

Built (domain modules only; screens are Phase 5, HTTP routes Phase 4):

- **Assessment** (`web/src/domain/assessment`): validation, normalisation, grading, solutions, public view. A golden file produced by running the PHP class (`web/tests/golden/assessment.php`) is replayed in CI: 99 sample exercises, 614 answer cases, 84 normalisation cases and 34 broken-document cases match PHP exactly.
- **Study** (`domain/study/attempts.ts`): start, preview, read, the eight player actions, retry, finish with progress, guest claim, public attempt (arrays instead of key-ordered objects).
- **Content** (`domain/content`): lesson versions and workflow, entity proposals and workflows, vocabulary-set membership, reorder, unit archive, reports, imports (JSON/CSV, atomic commit, worker hand-off), media upload and visibility.
- **Legacy lessons** (`domain/legacy`), **seed** (`pnpm seed`), new table `mce_media_refs` (migration 0001).
- Fixes done: 1, 2, 4, 5, 6, 7, 11 (lookup table; Range serving lands with the route in Phase 4), 12, 13, 18, 23.
- Tests: 348 unit (incl. golden), 31 database; CI also seeds the sample catalog.

Bugs found in earlier phases while doing this: redirect lookups ignored the leading slash PHP stores (fixed); mysql2 parsed some JSON columns twice (fixed with `jsonStrings`).

Changes from the plan:

| Plan said                                             | Now                                                      | Why                                                                             |
| ----------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Fix 10 (search) in Phase 2                            | Phase 5, with the search page                            | The search table and query belong with the page that uses them                  |
| Reward hooks in Study                                 | No-op hooks (`domain/motivation/hooks.ts`) until Phase 3 | Lessons complete correctly; XP/quests/streaks arrive with the motivation module |
| `progressHistory` (weekly stats) in Study             | Phase 3                                                  | It is part of the progress page and review pagination                           |
| Catalog cache rotation (`catalog_revision`)           | Dropped                                                  | Phase 4 actions call `updateTag('catalog')`                                     |
| Rate limits inside content functions (import, upload) | Applied by the caller (Phase 4 actions)                  | Domain functions stay free of request details                                   |

### Phase 3 (done on `migration/phase-3`)

Built (domain modules; screens Phase 5, routes Phase 4, jobs run by the Phase 6 worker):

- **Rewards** (`domain/motivation/rewards.ts`): ledger awards, quests (create, progress, set bonus), streaks with tickets and protected days, activity, badges, lesson and review XP, shop purchase, avatar, balance reconcile. The Phase 2 no-op hooks are now real, so finishing a lesson awards XP.
- **Review** (`domain/review/review.ts`): schedule v1, queue with the local-day cap, rate (idempotent, revision-guarded), manage, word save/remove, concept cards, notebook.
- **Account** (`domain/identity/account.ts`): profile with the delayed quest-timezone change, enrollment, reminders, streak preferences, password reset/change (sign-out everywhere), email verification and change, unsubscribe, account deletion with last-admin guard, erase job.
- **Exports** (streamed private files, 24 h expiry, owner-only download), **marketing** (consent, journeys, funnel, cohorts, GA4 payload/send), **progress history**.
- Fixes done: 14, 15, 22 (completed: email links use tokens minted at send time, nothing raw stored), 24; fix 10 partly (notebook search escapes LIKE wildcards).
- Tests: 47 database tests incl. ports of `tests/motivation.php`, `timezone.php` (queue parts) and `marketing.php`.

Bug found: Drizzle orders `ON DUPLICATE KEY UPDATE` assignments by column, so an expression reading a column reset in the same statement saw the new value. The review-card upsert now uses explicit SQL; the other upserts were checked.

Changes from the plan:

| Plan said                                     | Now                                                                         | Why                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Better Auth email verification                | App-owned tokens in `auth_verifications`, minted by the worker at send time | Better Auth's verify tokens can't be rebuilt from a row id, and fix 22 forbids raw tokens in jobs |
| Guest marketing state in the session          | `MarketingSession` passed in `Actor`; Phase 4 stores it in a cookie         | Domain code never reads cookies                                                                   |
| Reminder `tick` and job runs in Phase 3 tests | Phase 6                                                                     | They belong to the worker                                                                         |

### Phase 4 (done on `migration/phase-4`)

Built:

- **One handler per contract route** (`web/src/server/handlers.ts`, type-checked against all 58 routes; an earlier version of this log said 69) and one runner (`run-route.ts`: auth level → rate limit → zod input → handler).
- **`/api/v1/*`** (`app/api/v1/[...route]`): every route, same paths, envelope, error codes, 1 MB/depth-64 JSON rules, scalar-field rule and `currentAttempt` on attempt 409s.
- **Server Actions** for every form route (`src/actions/routes.ts`, coverage-tested): flash message or redirect, `updateTag('catalog')` after content changes, `refresh()` for fresh page data, field errors echoed without secrets.
- **Actor from the request** (`server/actor.ts`): session, guest cookie (sha256 stored), guest marketing cookie.
- **File routes**: `/media/{id}` with Range + ETag (fix 11 complete), `/du-lieu/*` templates and direct exports, `/du-lieu/export-file/{id}`, `/theme.css`, `robots.txt`, `sitemap.xml`. Import templates now ship with the app (`web/templates`).
- Admin site commands ported (`domain/admin/site.ts`): page SEO, settings, roles, reward corrections, job retry.
- Tests: 7 HTTP API tests (envelope, origin rule, JSON rules, guest attempt with 409 payload, cross-visitor 404, auth levels, media Range/ETag/304/416, public files) and 5 action-wrapper tests.

Changes from the plan:

| Plan said                                                | Now                              | Why                                                                                                 |
| -------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/api/v1` only for player routes; forms only via actions | Every route on `/api/v1` as well | Matches PHP (all commands were API-reachable) and lets the PHP HTTP suites run unchanged in Phase 7 |
| `tests/product_http.py` passes at the Phase 4 gate       | Phase 7                          | It depends on PHP fixture CLIs and the PHP cookie name; the TS fixture CLI is a Phase 7 task        |

### Phase 5 (done on `migration/phase-5`)

Built:

- **Every screen** from the PHP views, same markup and classes, inside one `SiteShell` (header, nav, footer, skip link, motion preference). Home is pixel-identical at 360 and 1440 px.
- Public + identity (19 screens), learner area (`/hoc`, `/bat-dau`, `/tai-khoan`, `/on-tap`, `/so-tu-vung`, `/tien-do`, `/reward-shop`), admin CMS (14 sections + lesson preview), legacy screens (`/courses`, `/listening`, `/toeic`, `/placement`, `/dashboard`, `/ket-qua`, legacy `/admin`).
- **Lesson player** (`src/components/player`, port of `product.js`): all exercise types, keyboard order input, audio controls, fix 3 offline outbox replayed in order with the current revision, 409 adopts the newer attempt with a reload button.
- **Real 404s**: `proxy.ts` checks content existence before rendering (`server/content-exists.ts`) and rewrites missing items to a 404 page.
- Shared fixes found while porting: timezone validation via `Intl` (ICU names `Asia/Saigon`), campaign landing sets the guest marketing cookie, `admin.setItems` accepts an empty list, login/register use `isAPIError`.
- **Better Auth patch** (`web/patches/`): serial IDs read `insertId` instead of `LAST_INSERT_ID()`, which raced across pooled connections (20-way concurrent sign-up test).
- Tests: 121 e2e across 4 widths (each test gets its own client IP), 351 unit, 53 DB.

Changes from the plan:

| Plan said                  | Now                                                  | Why                                                        |
| -------------------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| CSS Modules + `next/font`  | PHP CSS kept as global CSS, fonts from `public/`     | Same CSS = same pixels; restyling is out of scope          |
| `notFound()` in pages      | Proxy pre-check + rewrite                            | `notFound()` after streaming starts keeps HTTP 200         |
| Flash messages at page top | Inside the form                                      | Server Actions return state to the form; text is unchanged |
| `/api/auth` route          | None; actions call `auth.api`                        | No OAuth or client SDK needed                              |
| —                          | Admin 403/404 and `/ket-qua` return 200 with noindex | Private pages; revisit in Phase 7                          |

### Phase 6 (done on `migration/phase-6`)

Built:

- **Worker** (`web/src/worker/jobs.ts`, CLI `pnpm worker run|tick|cleanup|reconcile|backup|restore-drill`): same rules as `Jobs.php`. One worker at a time (GET_LOCK on its own connection), backoff `min(3600, 30·2^tries)`, 5 tries, crash recovery (requeue import/export/delete; mail/reminder/analytics → failed "uncertain"; finished results acknowledged), imports run as their actor (fix 23).
- **Mail** (`worker/mail`): `log` sink (private JSON files) and SMTP over STARTTLS/TLS with a verified peer and 15 s timeouts. Templates have HTML and text parts. Link tokens are minted at send time (fix 22); a definite failure releases the token so the retry sends a working link.
- **Fixes**: 9 (cleanup purges limiter rows older than 1 day), 16 (only failed jobs expire; cleanup warns about pending jobs over 1 hour late), 24 (analytics older than 72 h fail at once).
- **Operations**: SQL backup (`MYSQL_PWD`, 0600 files) and restore drill into a new database with row-count checks. Production runs one bundled file, `dist/worker.mjs` (`pnpm build:worker`, 4.5 MB). Cron lines are in `web/README.md`.
- Tests: 21 new DB tests. Fake SMTP server (8 cases: failures before the body are retryable, after it "uncertain"), crash recovery with the real CLI killed mid-job (port of `jobs_recovery.php`), the account email flow through the worker (port of `account_http.py`), backup and restore drill.
- CI: installs the MariaDB client and smoke-tests the bundled worker.

Changes from the plan:

| Plan said                                         | Now                                                                                | Why                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| React Email templates                             | Plain React components rendered with `react-dom/server`                            | `@react-email/components` is pulled from npm ("no longer supported")                    |
| Nodemailer transport, classify by `err.command`   | Nodemailer's `SMTPConnection`, "uncertain" once the server starts reading the body | Nodemailer labels every dropped connection `CONN`, whatever the stage                   |
| `.eml` files in dev                               | JSON files, like the PHP sink                                                      | Same shape the PHP fixture reads; holds both parts                                      |
| Separate `backup.ts` / `restore-drill.ts` scripts | Subcommands of the worker CLI                                                      | One bundled file to ship                                                                |
| Gate: `tests/account_http.py` against the TS CLI  | Ported as a Vitest DB test                                                         | The Python suite needs the PHP fixture CLI and CSRF form; the TS fixture CLI is Phase 7 |
| Alert on pending jobs over 1 hour                 | `cleanup` prints a warning and returns the count                                   | No alerting system yet; hook it up at cutover                                           |

### Phase 7 (done on `migration/phase-7`, fix 20 open)

Built:

- **PHP black-box suites run against Next.js**: `tests/http_target.py` (`HTTP_TARGET=php|next`), TS fixture CLI `web/scripts/fixture.ts` (all 29 operations), runner `tests/run_next.py` (own database, build, server, all six suites). PHP still runs the same suites via `tests/run_auth.py`. CI runs both.
- **Fix regression tests**: 23 of 24 fixes have a test that fails on the PHP behaviour (`docs/migration/fix-tests.md`). Completed now: fix 10 (FULLTEXT `mce_search` table filled on publish), 17 (`pnpm docs:api` generates `docs/api-v1.md` from the contracts, checked by a test), 19 (legacy lesson list at `/hoc/bai`).
- **Performance A02**: `pnpm benchmark`, 50 concurrent signed-in graded submits. Local p95 166–182 ms over 3 rounds, 0 errors (target 800 ms; PHP FastCGI was 608–642 ms). Report in `docs/artifacts/a02-next-local.json`; CI runs it too.
- **Security** (`docs/migration/security-checklist.md`): safe error logging (no SQL, parameters or quoted values), SRI on script files, Permissions-Policy and COOP headers, real 403/404 for refused private pages (proxy pre-check), export ownership test.
- **Accessibility**: Playwright ports of the A10 and redesign checks (`tests/e2e/a11y.spec.ts`). The manual screen-reader audit stays open.
- App bugs found by the suites and fixed: sign-up didn't attach a consenting guest's campaign journey; `/api/v1` edits served stale catalog once; `attempts/{id}/view` wrongly required `position`; 3 legacy asset aliases missing; the mobile menu kept a reference to the replaced placeholder nav, so Escape could stop working; the lesson player pulled keyboard focus back to the question heading when the server confirmed a move, so a keyboard user lost their place on the first answer.
- Totals: 358 unit, 87 DB, 152 e2e, six HTTP suites.

Changes from the plan:

| Plan said           | Now                                                         | Why                                                                                                                                       |
| ------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| CSP with nonces     | Static CSP + SRI, inline scripts allowed                    | Nonces force every page to render per request and break Cache Components' static shells; the app renders no user HTML (see the checklist) |
| `tests/fixtures.ts` | `web/scripts/fixture.ts`                                    | Runs with the app's own modules and env loading                                                                                           |
| —                   | `/api/v1` content edits visible a few ms after the response | Next.js expires cache tags after a route handler responds; CMS forms (Server Actions) are immediate                                       |

Open (owner decision): **fix 20**. Public pages still send `private, no-store`, because the header shows the signed-in nav on every page. The data underneath is cached on the server. Making public HTML CDN-cacheable means rendering the signed-in nav in the browser on every page. There is no CDN in the target hosting, so this can wait until one is added.
