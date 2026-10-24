# Đối chiếu toàn bộ spec — cập nhật 22/10/2026

> Ghi chú 24/10/2026: tài liệu này mô tả bản PHP (tag `php-final`), không phải app Next.js hiện tại. Code hiện nay: [architecture.md](architecture.md), [testing.md](testing.md), [migration/fix-tests.md](migration/fix-tests.md).

Nguồn: [specification.md](specification.md). “Có code” và “đã nghiệm thu ra mắt” là hai trạng thái khác nhau. Bảng ghi vị trí thực hiện và bằng chứng, không thay thế số đo staging.

| Mục | Yêu cầu | Thực hiện | Bằng chứng/phạm vi |
|---|---|---|---|
| 1–3 | Phạm vi, kiến trúc, dịch vụ | PHP/PDO hiện hữu; migration, DB queue/cache, local persistent media; SMTP adapter; Docker/CI và hướng dẫn deploy. Dịch vụ ngoài tắt rõ nếu thiếu cấu hình. | architecture/decisions/operations; setup + product tests |
| 4 | Vai trò | Guest/learner/editor/admin, server authorization, no impersonation, audit. | HTTP403/404 + editor publish/role deny |
| 5–6 | Sitemap/hành trình | Public SSR, dashboard, lesson, review/notebook/progress/account; CMS; guest->signup->explicitclaim. | site_http + browser + product_http |
| 7 | Onboarding/placement | Goal/selflevel/minutes/timezone, skip/sửa,20câu cố định/blueprint, bỏqua/resume, gợiý chưa hiệuchuẩn. | product_http testmode + browser |
| 8 | Path/unit/lesson | Stable IDs, metadata/ảnh, soft prerequisites/order, chỉ path có nội dung, progress/next lesson, không khóa. | Content/Study + seed + product HTTP |
| 9 | Player | Blocks, native audio/rate/transcript, draft/resume/offline, requiredcompletion/pass riêng, practice/test feedback, snapshot. | Assessment/Study/product.js; HTTP + Chrome |
| 10.1–10.9 | Các dạng câu | Choice, boolean, fill, order, match, correction, listeningchoice/fill, closedanswer, self/flashcard; stableIDs/partial/null. Flashcard lesson có mặt trước/sau và ghi nhớ tùy chọn; chỉ lật sau server xác nhận, test giữ kín đến finish; vẫn tự đánh giá/null. | unit grading + real uploaded WAV HTTP + all-exercises template |
| 11 | Attempts | Server first response/best score, presentedorder, revision409, ownerchecks, heartbeat không giả thời gian. | HTTP + fixture verify |
| 12 | Spaced review | Due queue, daily limit/voluntaryextra,4ratings, UTC fixed intervals/cap180, immutableevents, reset/hide/remove. | Review; unit fixedclock + HTTP dailycap/ownership/retry |
| 13 | Sổ từ | Entry-as-sense rows, many-to-many sets, IPA/examples/translation/audio, notesprivate, savedcards; lịch sử attempt ở mục14, chưa có màn lịch sử mọi review event. | CMS set + product/account HTTP |
| 14 | Dashboard | Nextlesson, goals, activity/progress, XP/streak/tasks/badges, interactiontime; reward secondary. | Motivation + page + HTTP |
| 15 | Tài khoản | Auth/verify/reset/changeemail/password, opt-in reminders, export, erase, sessionrevocation. | auth/account HTTP + worker log sink |
| 16 | CMS | Paths/units/versions/questions/words/sets/articles/media/reports/roles/settings/audit, realpreview, reorder, slugredirect, import/export. Questions là lookup, lesson editor dùng JSON. A03/A04 bổ sung sửa/return draft và snapshot membership; A11 thêm field paths và processed/total. | product HTTP + templates; authoring guide |
| 17 | Dữ liệu | FK/unique/transactions/indexes; immutable version documents là blocks/exerciseversions; additive migrations. | migrations + data-model + fixture assertions |
| 18 | API | JSON errors/requestId/fieldErrors, owner/CSRF, revision/idempotency, no public XP setter. | api.md + product/auth HTTP |
| 19–20 | UI/accessibility | Tokens vàng/xanh/kem, font tự host Baloo 2/Be Vietnam Pro, focus/labels/touch44, keyboardalternatives, reducedmotion, responsive. | Chrome360/390/768/1440 + screenshots; chưa WCAGaudit/screenreader |
| 21 | SEO/marketing | SSR/title/meta/canonical/OG/breadcrumb/sitemap/robots/noindex,301; campaign landing theo path; A09 SEO override tĩnh/entity qua workflow và fallback; A08 UTM allowlist chỉ giữ journey sau consent. | site_http + header/router + campaign smoke |
| 22 | Analytics | DB operational/cohort D1/D7 từ hoạt động, versionedevents dedupe, GA4consentadapter whitelist noPII; A08 consent journey/funnel, timestamp event gốc, thu hồi/xóa/retention. | Jobs/MarketingAnalytics + DB events; ingestion ngoài chưa cấu hình |
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

## Trạng thái và giới hạn theo nhóm yêu cầu

Bảng trên là bản đồ code và test, không phải danh sách yêu cầu đã nghiệm thu. “Local” dưới đây chỉ xác nhận các case có trong báo cáo; không xác nhận mọi yêu cầu con.

| Mục spec | Trạng thái hiện tại | Phần còn chờ |
|---|---|---|
| 1–3, 17, 28 | Có code/schema/tài liệu; smoke install A12 local qua | Docker build, CI từ xa, staging/runtime mục tiêu |
| 4–8, 11, 15, 18 | Luồng chính có hồi quy local | SMTP thật, kiểm duyệt placement/nội dung và nghiệm thu môi trường triển khai |
| 9–10 | Grading/player có kiểm thử local; audio dùng fixture hợp lệ | Flashcard flip đã kiểm keyboard/offline/resume/test redaction; audio sản phẩm cần quyền sử dụng |
| 12–14 | A05–A07 local: phân trang, POS/audio thẻ mới, tuần/lịch sử attempt | Chưa có màn lịch sử mọi review event hoặc biểu đồ tuần tương tác |
| 16 | A03/A04/A11 local: draft/review/publish/return, snapshot membership, import diagnostics/progress | CMS vẫn dùng JSON; questions là lookup, chưa visual builder/bank CRUD độc lập |
| 19–20 | A10 Chrome/keyboard/field errors, menu Escape/skip focus, main landmark/flashcard AX tree và focus dưới header qua các case đã chạy | Chưa audit screen reader thủ công hoặc nghiệm thu WCAG |
| 21–22 | A08/A09: SEO override và funnel consent có test local | Chưa gửi/kiểm GA4 ingestion thật; funnel chỉ nhóm opt-in, không đại diện toàn bộ khách |
| 23–24 | Authorization/validation/queue recovery và restore local có bằng chứng | CGI local 1151.40 ms chưa đạt; Apache/PHP 8.5 FastCGI ba lượt 607.98/613.66/642.30 ms đạt ngưỡng local; chưa load staging, HTTPS/alert/off-host backup hoặc scan image production |
| 25 | Seed có test lặp; nội dung audit được ghi ngày riêng | Audio nghe hợp lệ và duyệt chất lượng nội dung trước publish |
| 26–29 | Các case local và deliverables được đối chiếu | Chưa đủ DoD/hoàn thành giai đoạn 3; xem giới hạn từng case dưới |
| 30.1–30.9 | Motivation/review/streak/ledger có test local | Reminder SMTP thật và nghiệm thu vận hành; XP không là chứng nhận năng lực |
| 31 | Tài liệu tham khảo, không phải dịch vụ tích hợp | Quyền media/nội dung phải xác minh khi bổ sung tài sản thật |

Bằng chứng có ngày và số đo: [progress.md](progress.md). Hồi quy [test-report.json](artifacts/test-report.json) mới nhất ngày 22/10 gồm Chrome flashcard, không chạy lại benchmark/restore; [báo cáo A02](performance-a02.md) ghi cả trước/sau. [A12](artifacts/a12-install-report.json) là lượt smoke install riêng. Không sửa thời gian hoặc số đo của artifact cũ để coi là phép đo mới.

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
|23|performance.json: Apache riêng/PHP 8.5 FastCGI, 50 phiên local, 0 lỗi, p95 642.30 ms, target_met=true; ba lượt đạt local, chưa có số đo staging|
|24|Có cấu hình Docker ignore/env/private storage; CHƯA nghiệm thu build production: Docker local chưa có, CI mới bổ sung chưa chạy từ xa; cần build, scan và kiểm cấu hình image/staging thực|

Các case 1–18, 20–22 có bằng chứng local trong hồi quy/Chrome với phạm vi nêu trên; case 19 dùng artifact restore lịch sử (1.219 giây, dataset nhỏ), không phải lượt restore chức năng mới sau A12. Case 21 chưa chứng nhận accessibility toàn site. Case 23 đã đạt ngưỡng local trên Apache/FastCGI, chưa nghiệm thu staging; case 24 chưa có build production để kiểm chứng. Không diễn giải toàn bộ bảng là 24/24 đã nghiệm thu staging.

## Điều kiện ngoài workspace chưa thể nghiệm thu

Chưa có staging/domain/HTTPS production, SMTP provider, GA4 property, off-host backup/alert destination hoặc audio có quyền. Các adapter và hướng dẫn có sẵn; không báo gửi email thật, analytics ingestion, backup ngoài máy hay production load đã đạt. Privacy/terms/contact có CMS field để chủ dự án cung cấp và duyệt. Không chứng nhận WCAG khi chưa audit. Audio drafts không được publish lách validation. Không triển khai các mục “giai đoạn sau”: payment/AI tutor/speaking/teacher/push/socialquest/league.


Bổ sung A10 ngày 22/10: [phạm vi accessibility và checklist thủ công](accessibility-a10.md). Chrome kiểm menu Enter/Escape, skip link tới main, accessible name của ghi nhớ, hidden back không ở accessibility tree và heading không bị sticky che trong case flashcard. Save status về luồng trang, header dùng chiều cao đo thực cho scroll-padding. Chưa chạy NVDA/VoiceOver, kiểm contrast/reflow toàn diện hoặc chứng nhận WCAG.


A12 bổ sung pipeline: [container-a12.md](container-a12.md) mô tả runner packaged-image/MariaDB riêng, public HTTP/Secure cookies, migrations/admin/worker/backup/media restore hash và report upload không lấy evidence cũ. Mới kiểm cú pháp tại local; Docker/Compose/CI thật còn chờ. Chưa nghiệm thu acceptance 26.24 hoặc toàn bộ mục 28–29 từ thay đổi pipeline này.


Bổ sung review/concept 22/10: server chặn preview và guest chưa claim khỏi lịch ôn account; player ẩn CTA theo canSaveConcepts. HTTP kiểm 422 không ghi card, claim/finish hợp lệ, retry chống trùng, account khác 404; Chrome kiểm kết quả preview không có nút thêm ôn. Đây là kiểm local; không thay nghiệm thu staging hoặc quyền dữ liệu ở các route khác.
