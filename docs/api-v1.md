# API v1 reference

Generated from `src/contracts/routes.ts` by `pnpm docs:api`; do not edit by hand.
Every route is `/api/v1/<path>`; `{id}` is a 32-hex attempt or import id. Fields marked `?` are
optional. Transport `action` means HTML forms use a Server Action; the route is still reachable
over `/api/v1`.

| Method | Path | Auth | Transport | Input | Rate limit | Fixes |
|---|---|---|---|---|---|---|
| POST | `account/delete` | user | action | `password: string` | — | — |
| POST | `admin/article-workflow` | staff | action | `versionId: integer`, `action: "review" \| "publish" \| "return"`, `reason?: string` | — | — |
| POST | `admin/draft-save` | staff | action | `type: "entity" \| "article"`, `draftId: integer`, `expected: string`, `document: object` | — | — |
| POST | `admin/entity` | staff | action | `kind: "paths" \| "units" \| "vocabulary" \| "vocabulary_sets" \| "articles"`, `id?: integer`, `status?: "draft" \| "in_review" \| "published" \| "archived"`, `seo_title?: string`, `seo_description?: string` | — | — |
| POST | `admin/entity-workflow` | staff | action | `draftId: integer`, `action: "review" \| "publish" \| "return"`, `reason?: string` | — | — |
| POST | `admin/import-commit` | staff | action | `importId: string` | — | 23 |
| POST | `admin/import-preview` | staff | action | `raw: string`, `namespace?: string` | import: 10/900s | 13 |
| GET | `admin/import-status/{id}` | staff | api | — | — | — |
| POST | `admin/job-retry` | admin | action | `jobId: integer` | — | — |
| POST | `admin/reorder` | staff | action | `kind: "paths" \| "units" \| "lessons"`, `ids: integer[]` | — | — |
| POST | `admin/report` | staff | action | `id: integer`, `status: "open" \| "in_progress" \| "resolved" \| "rejected"`, `resolution?: string` | — | — |
| POST | `admin/reward-adjust` | admin | action | `userId: integer`, `amount: integer`, `currency: "xp" \| "coin"`, `reason: string`, `requestKey: string` | — | — |
| POST | `admin/role` | admin | action | `userId: integer`, `role: "learner" \| "editor" \| "admin"` | — | — |
| POST | `admin/seo` | admin | action | `path: string`, `title?: string`, `description?: string` | — | — |
| POST | `admin/set-items` | staff | action | `setId: integer`, `ids: integer[]` | — | — |
| POST | `admin/settings` | admin | action | `name: "site_name" \| "primary" \| "accent" \| "logo_media_id" \| "favicon_media_id" \| "social_url" \| "default_minutes" \| "gamification" \| "contact_email" \| "privacy_text" \| "terms_text"`, `value?: string` | — | — |
| POST | `admin/unit-state` | admin | action | `unitId: integer`, `archived?: boolean \| string \| number` | — | — |
| POST | `admin/upload` | staff | api | `alt: string`, `source: string`, `license: string` | upload: 30/900s | — |
| POST | `admin/version` | staff | action | `title: string`, `document: object`, `lessonId?: integer`, `versionId?: integer`, `unitId?: integer`, `subtype?: "lesson" \| "checkpoint" \| "placement"`, `slug?: string`, `sortOrder?: integer`, `externalKey?: string`, `expected?: string` | — | 5 |
| POST | `admin/workflow` | staff | action | `versionId: integer`, `action: "review" \| "publish" \| "return" \| "archive" \| "restore"` | — | — |
| POST | `analytics/consent` | public | action | `enabled?: "yes" \| "no"`, `campaignSlug?: string`, `utm_source?: string`, `utm_medium?: string`, `utm_campaign?: string` | marketing-consent: 30/900s | — |
| GET | `attempts/{id}` | guest-or-owner | api | — | — | — |
| POST | `attempts/{id}/audio_error` | guest-or-owner | api | `revision: integer`, `exerciseId: string` | study: 500/60s | — |
| POST | `attempts/{id}/draft` | guest-or-owner | api | `revision: integer`, `exerciseId: string`, `response: any` | study: 500/60s | — |
| POST | `attempts/{id}/finish` | guest-or-owner | api | `revision: integer` | study: 500/60s | — |
| POST | `attempts/{id}/heartbeat` | guest-or-owner | api | `revision: integer`, `active: boolean` | study: 500/60s | 2 |
| POST | `attempts/{id}/navigate` | guest-or-owner | api | `revision: integer`, `position: integer` | study: 500/60s | — |
| POST | `attempts/{id}/retry` | guest-or-owner | api | `exerciseId: string`, `response: any` | — | 4 |
| POST | `attempts/{id}/skip` | guest-or-owner | api | `revision: integer`, `exerciseId: string` | study: 500/60s | — |
| POST | `attempts/{id}/submit` | guest-or-owner | api | `revision: integer`, `exerciseId: string`, `response: any` | study: 500/60s | — |
| POST | `attempts/{id}/view` | guest-or-owner | api | `revision: integer`, `block: string`, `position?: integer` | study: 500/60s | 6 |
| POST | `attempts/start` | public | action | `lessonId: integer`, `requestKey: string`, `mode?: "practice" \| "test"` | start: 60/900s | — |
| POST | `avatar` | user | action | `itemId: string` | — | — |
| GET | `catalog` | public | api | — | — | — |
| POST | `consent` | user | action | `analytics?: boolean \| string \| number` | — | — |
| POST | `email/consume` | public | api | `token: string`, `purpose: "verify" \| "unsubscribe"` | consume-token: 20/900s | — |
| POST | `email/verify` | user | action | `email?: string` | verify: 5/900s | — |
| POST | `enrollments` | user | action | `pathId: integer` | — | — |
| POST | `exports/request` | user | action | `kind?: "personal" \| "content"`, `requestKey: string` | export: 5/3600s | — |
| POST | `guest/claim` | user | action | `attemptId: string` | — | 7 |
| GET | `me/quests` | user | api | — | — | — |
| GET | `me/rewards` | user | api | — | — | — |
| GET | `me/streak` | user | api | — | — | — |
| POST | `password/change` | user | action | `current: string`, `password: string` | password: 10/900s | — |
| POST | `password/reset` | public | action | `token: string`, `password: string` | — | — |
| POST | `password/reset-request` | public | action | `email: string` | reset: 5/900s | — |
| POST | `profile` | user | action | `goal?: "foundation" \| "communication" \| "work" \| "toeic"`, `selfLevel?: "beginner" \| "A1" \| "A2" \| "B1"`, `minutes?: integer`, `timezone?: string`, `reviewLimit?: integer`, `gamification?: boolean \| string \| number`, `animations?: boolean \| string \| number` | — | — |
| GET | `progress` | user | api | — | — | — |
| POST | `reminders` | user | action | `enabled?: boolean \| string \| number`, `hour?: integer` | — | — |
| POST | `reports` | user | api | `versionId: integer`, `position?: string`, `category: "answer" \| "typo" \| "audio" \| "other"`, `description: string` | reports: 10/900s | — |
| POST | `review/concept` | user | api | `attemptId: string`, `exerciseId: string` | — | — |
| POST | `review/manage` | user | action | — | — | — |
| GET | `review/queue` | user | api | `more?: string` | — | — |
| POST | `review/rate` | user | api | `cardId: integer`, `rating: "again" \| "hard" \| "good" \| "easy"`, `requestKey: string`, `revision: integer`, `extra?: boolean \| string \| number` | review: 120/60s | — |
| POST | `shop/purchase` | user | action | `itemId: string`, `requestKey: string` | — | — |
| POST | `streak/preferences` | user | action | `autoProtect?: boolean \| string \| number` | — | — |
| POST | `vocabulary/remove` | user | action | `senseId: integer` | — | — |
| POST | `vocabulary/save` | user | action | `senseId: integer`, `notes?: string`, `review?: boolean \| string \| number` | — | 15 |
