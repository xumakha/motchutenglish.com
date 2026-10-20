# Đối chiếu toàn bộ spec

Nguồn: [specification.md](specification.md). “Có code” và “đã nghiệm thu ra mắt” là hai trạng thái khác nhau. Bảng ghi vị trí thực hiện và bằng chứng, không thay thế số đo staging.

| Mục | Yêu cầu | Thực hiện | Bằng chứng/phạm vi |
|---|---|---|---|
| 1–3 | Phạm vi, kiến trúc, dịch vụ | PHP/PDO hiện hữu; migration, DB queue/cache, local persistent media; SMTP adapter; Docker/CI và hướng dẫn deploy. Dịch vụ ngoài tắt rõ nếu thiếu cấu hình. | architecture/decisions/operations; setup + product tests |
| 4 | Vai trò | Guest/learner/editor/admin, server authorization, no impersonation, audit. | HTTP403/404 + editor publish/role deny |
| 5–6 | Sitemap/hành trình | Public SSR, dashboard, lesson, review/notebook/progress/account; CMS; guest->signup->explicitclaim. | site_http + browser + product_http |
| 7 | Onboarding/placement | Goal/selflevel/minutes/timezone, skip/sửa,20câu cố định/blueprint, bỏqua/resume, gợiý chưa hiệuchuẩn. | product_http testmode + browser |
| 8 | Path/unit/lesson | Stable IDs, metadata/ảnh, soft prerequisites/order, chỉ path có nội dung, progress/next lesson, không khóa. | Content/Study + seed + product HTTP |
| 9 | Player | Blocks, native audio/rate/transcript, draft/resume/offline, requiredcompletion/pass riêng, practice/test feedback, snapshot. | Assessment/Study/product.js; HTTP + Chrome |
| 10.1–10.9 | Các dạng câu | Choice, boolean, fill, order, match, correction, listeningchoice/fill, closedanswer, self/flashcard; stableIDs/partial/null. | unit grading + real uploaded WAV HTTP + all-exercises template |
| 11 | Attempts | Server first response/best score, presentedorder, revision409, ownerchecks, heartbeat không giả thời gian. | HTTP + fixture verify |
| 12 | Spaced review | Due queue, daily limit/voluntaryextra,4ratings, UTC fixed intervals/cap180, immutableevents, reset/hide/remove. | Review; unit fixedclock + HTTP dailycap/ownership/retry |
| 13 | Sổ từ | Entry-as-sense rows, many-to-many sets, IPA/examples/translation/audio, notesprivate, savedcards/history. | CMS set + product/account HTTP |
| 14 | Dashboard | Nextlesson, goals, activity/progress, XP/streak/tasks/badges, interactiontime; reward secondary. | Motivation + page + HTTP |
| 15 | Tài khoản | Auth/verify/reset/changeemail/password, opt-in reminders, export, erase, sessionrevocation. | auth/account HTTP + worker log sink |
| 16 | CMS | Paths/units/versions/questions/words/sets/articles/media/reports/roles/settings/audit, realpreview, reorder, slugredirect, import/export. | product HTTP + templates; authoring guide |
| 17 | Dữ liệu | FK/unique/transactions/indexes; immutable version documents là blocks/exerciseversions; additive migrations. | migrations + data-model + fixture assertions |
| 18 | API | JSON errors/requestId/fieldErrors, owner/CSRF, revision/idempotency, no public XP setter. | api.md + product/auth HTTP |
| 19–20 | UI/accessibility | Tokens vàng/xanh/kem, systemfont VN, focus/labels/touch44, keyboardalternatives, reducedmotion, responsive. | Chrome360/390/768/1440 + screenshots; chưa WCAGaudit/screenreader |
| 21 | SEO/marketing | SSR/title/meta/canonical/OG/breadcrumb/sitemap/robots/noindex,301; campaign landing theo path và UTM. | site_http + header/router + campaign smoke |
| 22 | Analytics | DB operational/cohort D1/D7 từ hoạt động, versionedevents dedupe, GA4consentadapter whitelist noPII. | Jobs/MarketingAnalytics + DB events; ingestion ngoài chưa cấu hình |
| 23 | Bảo mật | CSRF/XSS/IDOR/ratelimit, parametrizedSQL, MIME/extension/10MB, privatemedia, CSP/HTTPS, retention. | auth/product/account HTTP; operations |
| 24 | Hiệu năng/ổn định | Pagination/index/cache, queue/backoff/failedview, health/requestID, SQL/media backup/restore. | performance.json số đo local; staging chưa có |
| 25 | Seed | 15course lessons + placement20 +2audio drafts,90exercises,40senses/4sets,3articles; nofakeusers. | seed rerun twice + real DB count |
| 26–29 | Acceptance/deliverables/DoD | Code, lockfile,migrations,templates,env,docs,CLIadmin,realtests/restore. Không coi staging chưa có là đã nghiệm thu. | Bảng acceptance bên dưới; progress/operations |
| 30.1 | Learning loop/map | Map/list theo units, statuses, checkpoint/review, không hearts/paywall/leaderboardfake. | page/product.js; browser responsive |
| 30.2 | XP | 20first/5firstpass/5repeatmax2distinct/day/2reviewmax10/30checkpoint; stable IDs,ledger/cache/reconcile. | Motivation + fixture/motivation tests |
| 30.3 | Quests | Tối đa3 khảthi, frozen target/ngày/tz, cooldown7d, uniqueevents;5coin/task+5all. | motivation fixedclock + HTTP |
| 30.4 | Streak | learned/protected/missed,7real days ticket cap2, lazy/job lock, no futureticket/backward rewrite. | motivation 2process fixedclock |
| 30.5 | Shop | 30/60/100 CSScosmetics, no negative/doublepurchase, durableownership, no cash. | purchase concurrency + DB balance assert |
| 30.6 | Checkpoint/badges | Lesson subtype+blueprint/80%, no lessonXP duplication; firstlesson/unit/7days/review50; memory fromreview. | Content/Motivation + unit/HTTP |
| 30.7 | Reminders | Opt-in hour/tz, max1/day, pre-send eligibility recheck, unsubscribe, dedupe/uncertainsend handling. | account mail-sink/worker tests; SMTP staging pending |
| 30.8–30.9 | Reward data/API/tests | Ledger/events/snapshots/compensating audit; no clientaward; gamification off preserves study. | Motivation/schema/api + disabled-review HTTP |
| 31 | Tham khảo | Dùng nguyên tắc trải nghiệm, không sao chép mascot/logo/audio/content của nguồn tham khảo. | Nội dung gốc, UI riêng; không tích hợp dịch vụ tham khảo |

## Acceptance26

| # | Bằng chứng |
|---|---|
|1|Chrome guest mobile finish/result|
|2|auth_http + account_http: mail sink/verify/reset/login/logout|
|3|product_http owner404, notes/private, review; progress session-only|
|4|editor publish403/role403|
|5|CMS version draft/review/publish, sameplayer preview; type templates/unit validators|
|6|test API redaction, opaque match IDs, export grading redacted|
|7|Unicode NFC/whitespace/options/can't vs cant unit|
|8|stable IDs/token trùng chữ unit + HTTP|
|9|submit/finish retry + ledger uniqueness|
|10|optimisticrevision409/currentAttempt|
|11|saved draft/position/resume HTTP|
|12|publish changedanswer while originalattempt stays old|
|13|fixedclock UTC/DST/scheduling + motivation dayboundary|
|14|unique usertarget and rate keyretry/owner checks|
|15|self null objective grade unit|
|16|archive history/owned media HTTP|
|17|dryrun errors/atomiccommit/retry + CSV/largequeue/templates|
|18|missing SMTP503/audio draft/unavailable grading|
|19|restore.py SQL freshDB/newprocess login/progress + media SHA|
|20|auth/product XSS/CSRF/ratelimit/upload rejection|
|21|Chrome keyboard/360/390/768/1440 nooverflow|
|22|SSR canonical/noindex/robots/sitemap route tests|
|23|performance.json thực tế; staging target còn chờ hạ tầng|
|24|Docker ignore/secrets env/private storage; cần image/staging scan khi deploy|

## Điều kiện ngoài workspace chưa thể nghiệm thu

Chưa có staging/domain/HTTPS production, SMTP provider, GA4 property, off-host backup/alert destination hoặc audio có quyền. Các adapter và hướng dẫn có sẵn; không báo gửi email thật, analytics ingestion, backup ngoài máy hay production load đã đạt. Privacy/terms/contact có CMS field để chủ dự án cung cấp và duyệt. Không chứng nhận WCAG khi chưa audit. Audio drafts không được publish lách validation. Không triển khai các mục “giai đoạn sau”: payment/AI tutor/speaking/teacher/push/socialquest/league.
