# Regression tests for the §1.4 bug fixes

Phase 7 gate: one regression test per deliberate fix in
[`nextjs-typescript-plan.md` §1.4](nextjs-typescript-plan.md#14-known-bugs-and-quirks-found-during-the-review).
Each test asserts the fixed behaviour, so it fails on the PHP behaviour.

Paths are relative to `web/`. Unit tests run with `pnpm test`, `tests/integration/*` with `pnpm test:db`,
`tests/e2e/*` with `pnpm test:e2e` (flow tests at `desktop-1440`). New tests are named
`fix N: …` so `grep -rn "fix N" web/src web/tests` finds them.

Status: **covered** = a test already existed and asserts the fix · **added** = new test in Phase 7 ·
**implemented now** = the fix was missing or incomplete; Phase 7 added it and its test ·
**open** = not done, reason given.

| # | Fix | Test (file › name) | Status |
|---|---|---|---|
| 1 | Preview shuffles match keys and reuses one attempt per staff user and version | `tests/integration/study.test.ts` › preview (fix 1) › is staff-only and reuses the open preview attempt | covered |
| 2 | Heartbeat updates time only, never `revision` | `tests/integration/study.test.ts` › fix 2: heartbeats do not change the revision | covered |
| 3 | Ordered offline outbox, replayed on reconnect and on page load | `tests/e2e/player.spec.ts` › fix 3: answers made offline are queued and sent when the connection returns (reconnect); `tests/e2e/fixes.spec.ts` › fix 3 › several offline actions are kept in order and replayed on the next page load | covered + added (the old test queued one action, which PHP also kept) |
| 4 | Retry locks the attempt and is refused after finish | `tests/integration/study.test.ts` › retry (fix 4) › grades another answer without touching the first, and stops after finish | covered |
| 5 | Lesson drafts need the `expected` hash of what the editor loaded | `tests/integration/content.test.ts` › fix 5: saving an existing draft needs the hash of what the editor loaded | covered |
| 6 | `view` validates `position` | `tests/integration/study.test.ts` › fix 6: view rejects positions outside the lesson | covered |
| 7 | Guest claim keeps a finished attempt finished and records progress | `tests/integration/study.test.ts` › guest claim (fix 7) › keeps a finished guest attempt finished and records progress for the new owner | covered |
| 8 | Login limiter counts failures only, per IP + email | `tests/integration/fixes-auth.test.ts` › fix 8 › never locks out repeated successful logins from one IP; locks one email after 15 failures…; a success clears the failures for that email | added (the existing tests never logged in successfully more than 15 times) |
| 9 | Limiter windows expire in place; nightly purge | `tests/integration/rate-limit.test.ts` › starts a new window after the old one expires; `tests/integration/fixes.test.ts` › fix 9 › cleanup drops windows older than a day, not after 7 days | covered + added |
| 10 | Escape `%`/`_`; FULLTEXT search table filled on publish | `tests/integration/fixes.test.ts` › fix 10 (5 tests: publish fills plain text, prefix/accent/all-words match, `%`/`_` literal, notebook escaping, safe boolean query); `tests/e2e/fixes.spec.ts` › fix 10 › the search page finds a published lesson through the search index; `tests/e2e/public.spec.ts` › % and _ match literally (fix 10) | **implemented now** (escaping existed; the lesson search still decoded every document per request) |
| 11 | `media_refs` filled on publish; Range + ETag | `tests/integration/fixes.test.ts` › fix 11 › audio in a published lesson becomes public through the lookup table; `tests/integration/content.test.ts` › fix 11: media referenced by a current published lesson is public; `tests/e2e/api.spec.ts` › media: staff upload, Range and ETag; hidden from guests until referenced | covered + added (no test went through publish) |
| 12 | Placement picks the highest `minPercent` met | `tests/integration/study.test.ts` › placement suggestion (fix 12) › picks the highest threshold reached, whatever the rule order | covered |
| 13 | CSV import namespace is required | `tests/integration/content.test.ts` › fix 13: CSV batches use the namespace the editor chose | covered |
| 14 | `correct` quest counts the learner's own path | `tests/integration/fixes.test.ts` › fix 14 › targets the objective exercises of the enrolled path, not of every lesson | added |
| 15 | Re-adding a review card refreshes its snapshot | `tests/integration/motivation.test.ts` › fix 15: re-adding a card refreshes its snapshot and shows it again | covered (both callers of `addCard` are explicit learner actions, so un-hiding is the intended "re-add") |
| 16 | Cleanup expires failed jobs only; flags pending jobs over 1 hour late | `tests/integration/fixes.test.ts` › fix 16 › keeps week-old pending jobs, expires week-old failed jobs, counts late pending work | added |
| 17 | Code is the truth; zod schemas generate the API docs | `src/contracts/api-docs.test.ts` › fix 17 › names fields the way the code reads them; docs/api-v1.md is up to date; `src/contracts/routes.test.ts` › covers every route the PHP API accepts | **implemented now** (`pnpm docs:api` writes `docs/api-v1.md` from the contracts; `docs/api.md` is the old PHP text) |
| 18 | One `true_false` check instead of two | `src/domain/assessment/fixes.test.ts` › fix 18 (3 tests) | added; behaviour-preserving cleanup: PHP threw on the first failed check, so the duplicate never produced a different result. The tests pin the single check; `golden.test.ts` › document validation matches PHP covers the rest |
| 19 | Legacy lesson list gets its own route | `tests/e2e/fixes.spec.ts` › fix 19 › /hoc/bai lists published legacy lessons and the learner's history | **implemented now** (`app/hoc/bai/page.tsx`; the domain query existed but no page used it) |
| 20 | Public pages cacheable; `private, no-store` only for personal/admin pages and API | `tests/e2e/fixes.spec.ts` › fix 20 › personal pages and the API stay private and uncached; build assets are cacheable forever; public pages can be cached by a CDN (`test.fixme`); `tests/e2e/api.spec.ts` › envelope, request id and no-store on every response | **open**: every page, even `/gioi-thieu`, returns `private, no-cache, no-store` because `SiteShell` renders the signed-in nav in a dynamic hole. Needs the nav (and other per-user bits) moved client-side or out of public pages; belongs to the performance work |
| 21 | Validate env at boot, fail the deploy | `src/env.test.ts` › env (fix 21: fail at boot, not per request) (5 tests) | covered |
| 22 | Mail jobs store a token id; link built at send time | `tests/integration/motivation.test.ts` › email tokens (fix 22) › are minted at send time, work once, and never stored raw; `tests/integration/worker-account.test.ts` › a definite send failure releases the token so the retry mints a working one | covered |
| 23 | Import jobs get the actor id explicitly | `tests/integration/content.test.ts` › queues batches over 100 records for the worker (payload); `tests/integration/fixes.test.ts` › fix 23 › a queued import is committed by the worker under the editor who previewed it | covered + added (no test ran the worker on an import) |
| 24 | Analytics older than 72 h fail at once | `tests/integration/motivation.test.ts` › keeps the original event time and refuses events older than 72 hours (fix 24) | covered |

Totals: 12 covered as they were (1, 2, 4, 5, 6, 7, 12, 13, 15, 21, 22, 24), 4 covered and strengthened (3, 9, 11, 23), 4 added where no real test existed (8, 14, 16, 18), 3 implemented now (10, 17, 19), 1 open (20).

## Notes on the fixes implemented in Phase 7

- **Fix 10.** New table `mce_search` (migration `0002_search.sql`, FULLTEXT index `search_text`), filled by `indexVersion` when a version is published (`lessonWorkflow`, `pnpm seed`). `pnpm db:migrate` indexes published versions that have no row yet (data from before the table, or imported PHP data). `/tim-kiem` asks the index for matching version ids and keeps the catalog's visibility rules and order. Queries are boolean-mode prefix matches on every word of 3+ letters that is not an InnoDB stopword; a query made only of short words or stopwords (e.g. "am", "is") falls back to an escaped `LIKE` on the same table. Behaviour change: matching is by word prefix, not substring ("ell" no longer finds "hello"), and accent-insensitive ("chao" finds "chào").
- **Fix 17.** `src/contracts/api-docs.ts` renders method, path, auth, transport, input fields, rate limit and fix numbers for all routes from the zod schemas. `pnpm docs:api` rewrites `docs/api-v1.md`; the unit test fails when it is stale. Phase 8 can delete the hand-written `docs/api.md`.
- **Fix 19.** `/hoc/bai` ports the learner branch of `views/learning/index.php`: XP panel, published legacy lessons with "Bắt đầu học", and the history. Signed-out visitors get the usual 303 to `/login` (the `/hoc` prefix is already private in `proxy.ts`). Nothing links to it yet, as in PHP.

## Known data-dependent failure (not caused by these fixes)

`tests/e2e/public.spec.ts` › finds lessons, words and articles fails on a long-lived dev database: about 80 published test lessons contain "Hello", so lessons fill the 60-result cap before any word. The old document scan matched the same lessons. It passes in CI, where the database is reset first.
