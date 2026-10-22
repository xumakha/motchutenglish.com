# Rà soát spec so với bản hiện tại — 21/10/2026

## Trạng thái tổng hợp sau A14 — 22/10/2026

Bảng phát hiện và mô tả môi trường audit 21/10 bên dưới được giữ làm lịch sử. Các câu “chưa sửa trong lượt này” chỉ nói về lượt audit gốc; trạng thái mới ưu tiên bảng này và các phần cập nhật A03–A12 cuối tài liệu.

| Audit ID | Kết quả hiện tại | Phần chưa nghiệm thu |
|---|---|---|
| A01, A13 | Đã sửa và kiểm local queue recovery/timezone/DST | Vận hành cron/worker trên staging |
| A03, A04 | Đã sửa và kiểm local workflow, draft edit/return và membership snapshot | Nghiệm thu biên tập trên staging |
| A05, A06, A07 | Đã sửa và kiểm local pagination, review POS/audio, tuần/lịch sử attempt | Lesson flashcard flip được bổ sung ở lượt riêng cuối tài liệu; chưa có biểu đồ tương tác |
| A08, A09 | Đã sửa và kiểm local consent funnel/SEO override | GA4 ingestion thật và cấu hình triển khai |
| A10 | Field errors/focus/keyboard và bổ sung menu/skip/AX tree/không che focus đã sửa, kiểm Chrome local | Screen reader thủ công/WCAG còn chờ |
| A11 | Đã sửa và kiểm local field diagnostics/progress thực/atomic rollback/retry | Worker và polling trên staging |
| A12 | Hướng dẫn/runtime/container config đã sửa; 15 smoke checks local qua | Docker chưa có trên máy; chưa build image hoặc chạy CI từ xa |
| A14 | Đã đồng bộ progress/traceability/số đo và phạm vi bằng chứng | Không thay việc kiểm chứng các mục còn mở |
| A02 | Đã tối ưu và đo lại local, còn mở | CGI p95 1151.40 ms chưa đạt; Apache riêng + PHP 8.5 FastCGI ba lượt 607.98/613.66/642.30 ms đạt ngưỡng local, 0 lỗi. Chưa staging. Xem cập nhật A02 cuối tài liệu. |

Xem [tiến độ](progress.md) và [đối chiếu spec](spec-traceability.md). Hồi quy ngày 22/10 và smoke install A12 là các lượt riêng; benchmark/restore chức năng là artifact lịch sử, không được báo là phép đo mới.

## Lịch sử audit và các lượt sửa trước A14


> Cập nhật phần sửa 2: **A13 đã được xử lý**. API và HTML ôn tập dùng chung `Review::queue`, áp dụng pending timezone dưới profile lock trước khi đếm ngày; cron lấy lại profile/reminder trong transaction và dùng một mốc giờ cho ngày/giờ gửi. Worker kiểm lại timezone trước gửi reminder. Test clock cố định, DST 23/25 giờ, snapshot không bị sửa, reminder stale-day và HTTP API/HTML đã qua; hồi quy đầy đủ không gồm browser/performance/restore đã qua trên DB riêng `mce_auth_test_7c1d8cdc4a8e`. Các mục khác ngoài A01/A13 vẫn chờ sửa theo từng phần được duyệt.

> Cập nhật sau audit — phần sửa 1: **A01 đã được xử lý** trong `Jobs.php`. Worker mới chỉ phục hồi sau khi có named lock độc quyền; retry có backoff/giới hạn cho import/export/delete; xác nhận kết quả đã commit; cách ly delivery chưa rõ. `tests/jobs_recovery.php` đã kiểm ngắt/restart worker thật và bộ hồi quy HTTP/tài khoản đã qua trên DB riêng `mce_auth_test_3d05086b58ae`. Không chạy lại browser/performance/restore trong phần sửa này. Bảng dưới giữ nguyên phát hiện tại thời điểm audit; A02–A14 chưa được sửa trong phần 1. Chi tiết vận hành ở `operations.md`.

Kết luận: **chưa đáp ứng đầy đủ Definition of Done**. Các luồng học chính có code và bằng chứng kiểm thử, nhưng bảng đối chiếu cũ đang ghi nhận một số mục rộng hơn mức thực hiện thực tế. Đây là báo cáo audit; chưa sửa logic ứng dụng trong lượt này.

## Phạm vi và bằng chứng

Đọc toàn bộ mục1–31 của `docs/specification.md`, đối chiếu controllers/services/views/JS, schema, CLI, Docker và các artifacts. Chạy `database/check.php` chỉ đọc: kết nối/schema/extensions đạt. Kiểm tra HTTP bản local thật: 5route public và 8route đăng nhập/CMS trả200, không có fatal error. Đăng nhập admin local chỉ phục vụ đọc màn hình, không publish/import/mua/thay cấu hình. Không chạy lại toàn bộ suite, không diễn tập crash worker hoặc load test mới trong lượt audit này.

DB hiện tại: PHP8.5.11/MariaDB10.4.32;2path công khai,15lesson/checkpoint công khai,40nghĩa từ/4bộ từ,3bài kiến thức. SMTP=false, analytics=false,0audio có license metadata,0job running ở thời điểm kiểm tra. Rủi ro job kẹt dưới đây là thiếu cơ chế phục hồi trong code, không phải đang có job kẹt ở database này.

Artifact test trước đó (20/10/2026) ghi `all_passed=true`. Performance cùng đợt:50phiên,0lỗi,p95=1145.16ms, `target_met=false`. Test runner kiểm lỗi request, không assert p95<800; vì vậy “tests passed” không đồng nghĩa đạt tiêu chí hiệu năng hoặc đầy đủ spec.

## Phần thiếu hoặc chưa hoàn chỉnh trong code

P1: cần xử lý trước nghiệm thu ra mắt. P2: thiếu so với yêu cầu hoặc cần hoàn thiện luồng. Các nhận định dưới đây dựa trên code trừ nơi có ghi bằng chứng HTTP/artifact.

| ID/ưu tiên | Mục spec | Phát hiện | Vị trí và việc cần làm |
|---|---|---|---|
| A01/P1 |24,29|Worker đổi job sang `running` rồi xử lý, nhưng chỉ lấy job `pending`. Không có lease timeout/recovery cho process bị kill; cleanup và nút retry cũng không giải quyết `running` bị bỏ dở.|`application/libraries/Jobs.php:18`, `:70`; `application/controllers/Product.php` admin/job-retry. Thêm recovery có phân loại: job idempotent có thể retry; mail chưa rõ đã gửi phải đối soát, không replay mù. Test kill/restart.|
| A02/P1 |24,26.23|Mục tiêu p95<800ms chưa đạt trong phép đo local:1145.16ms dù0/50lỗi. Chưa có số đo staging để kết luận đạt/không đạt trên hạ tầng mục tiêu.|`docs/artifacts/performance.json`; `tests/performance.py`. Profile query/lock/runtime, đo lại50phiên trên cấu hình staging đã ghi rõ. Không suy diễn nguyên nhân chỉ từ benchmark hiện có.|
| A03/P2 |16|Workflow không đồng nhất cho nội dung ngoài lesson. Admin có thể lưu entity mới hoặc draft thành `published` trực tiếp; kiểm tra status chủ yếu là quyền admin, không bắt buộc trạng thái trước `in_review`. Membership bộ từ published được thay trực tiếp, không qua version/draft.|`application/libraries/Content.php:81`, `:109`; `application/controllers/Product.php` admin/set-items. Chuẩn hóa chuyển trạng thái và snapshot membership published. Lesson workflow riêng đã có kiểm tra gửi duyệt.|
| A04/P2 |16|Draft metadata/bài viết tạo từ published có nút review/publish nhưng chưa có luồng mở lại chính draft/proposal đó để sửa hoặc trả về kèm lý do. Form sửa đọc projection gốc; lưu lại thường tạo proposal khác.|`application/views/product/admin.php:46`, `:48`; `Content::articleWorkflow/entityWorkflow`. Thêm edit draft và return/reject; bảo toàn published.|
| A05/P2 |13,18,24|Sổ từ và quản lý thẻ chỉ `LIMIT100`, không offset/next page. Khi vượt100, một phần dữ liệu không thể duyệt đầy đủ qua giao diện.|`application/controllers/Product.php:207`, `:210`; page.php on-tap/so-tu-vung. Thêm pagination/cursor, giữ query/filter khi chuyển trang. Public vocabulary/articles và nhiều danh sách CMS đã phân trang.|
| A06/P2 |10.9,12–13|Snapshot thẻ ôn lưu audioId nhưng màn ôn không render audio; snapshot cũng chưa mang part_of_speech. Trang từ vựng có audio là một luồng khác, chưa thay thế audio ở mặt sau thẻ.|`application/controllers/Product.php:74`; `application/views/product/page.php:56`. Thêm POS/audio cùng lỗi tải và transcript phù hợp; test với audio thật.|
| A07/P2 |11,14|Trang tiến độ có first/best và hoạt động28ngày nhưng accuracy là tổng mọi thời gian, chưa có tổng hợp tuần gồm sốbài/ngàyhoạtđộng/lượtôn/accuracy. Chưa có danh sách đầy đủ các attempt đã kết thúc để mở lại từng kết quả/version cũ; link progress hiện đưa đến intro của lesson hiện tại.|`application/controllers/Product.php:211`; `application/views/product/page.php` tien-do. Thêm bộ lọc tuần và lịch sử attempt thuộc user, link kết quả cũ kể cả nội dung archive. Dữ liệu attempt cũ đã được lưu, đây là thiếu giao diện/truy vấn.|
| A08/P2 |21–22|Campaign nhận UTM và có CTA, nhưng chưa có ghi nhận landing/attribution và báo cáo funnel landing→guest→signup→firstlesson→return đầy đủ. Operations hiện là sốevent theo type và cohortD1/D7. Analytics queue/payload chưa mang timestamp gốc của event khi gửi ra ngoài.|`application/controllers/Product.php` chien-dich/adminData operations; `application/libraries/MarketingAnalytics.php:5`. Bổ sung contract thời điểm, funnel liên kết guest có consent, attribution allowlist khôngPII. Giữ GA4 tùy chọn.|
| A09/P2 |21|SEO override mới thấy cho lesson document (`seo.title/description`); CMS path/article không có trường override riêng. Chưa có giải pháp tổng quát cho title/meta override các trang public như spec yêu cầu.|`application/controllers/Product.php:225`; `Content::entityRow`, admin entity form. Thêm schema/form/SSR fallback/validation cho override. Title/meta tự sinh và canonical hiện đã có.|
| A10/P2 |18,20,26.21|Lỗi form sản phẩm thường gom ở một alert; JS gắn aria-describedby cho cả form, chưa ánh xạ fieldErrors tới từng input/aria-invalid. Keyboard Chrome đã kiểm một hành trình, chưa đủ chứng minh match/order, CMS và screen reader/WCAG2.2AA.|`assets/js/product.js:5`, page.php form-error và form inputs; `tests/browser.mjs`. Hoàn thiện field errors và audit các control bằng bàn phím/screenreader. Không coi thiếu chứng nhận là thiếu tính năng; thiếu ở đây là phạm vi kiểm chứng và field association.|
| A11/P2 |16|Import có dry-run/atomic/queue/status/error, nhưng field lỗi phần lớn mới là `lessons.i`/`vocabulary.i` hoặc record, chưa chỉ rõ mọi trường con; batch lớn chưa có số records processed/total trong UI. Retry failed qua operations dành admin có sẵn.|`application/libraries/Content.php:193`; admin.php imports; mce_imports schema. Bổ sung field path chuẩn và tiến độ/chẩn đoán batch; giữ atomic, không ghi đè.|
| A12/P2 |28|README hướng dẫn `create-admin.php --local` thiếu EMAIL/NAME, trong khi CLI yêu cầu email ở argv1 nên lệnh đó không chạy được. Docker image chưa cài Python nhưng docs vận hành có dùng `database/media-backup.py`; phải cài hoặc mô tả rõ chạy từ host có mount volume.|`README.md:12`, `database/create-admin.php:5`, `Dockerfile`, `docs/operations.md`. Sửa và thử toàn bộ hướng dẫn cài mới trên môi trường sạch. Không kết luận Docker build lỗi chỉ vì chưa có Python; thiếu là luồng media backup đã hướng dẫn.|
| A13/P2 |12,14,30.3–30.4,30.7|Chuyển timezone chưa nhất quán ở mọi đường đọc/job. API review/queue dùng profile chưa áp dụng pending change; HTML on-tap gọi lock áp dụng. tick gọi lock cập nhật timezone nhưng sau đó tính giờ/ngày nhắc bằng profile được lấy trước transaction.|`application/controllers/Product.php:21`, `application/libraries/Jobs.php:5`. Dùng cùng profile đã áp dụng hoặc tính effective timezone thống nhất; thêm test boundary cho API và reminder.|
| A14/P2 |25,28–29|Tài liệu tiến độ còn ghi số đo cũ739.89ms/restore1.042s trong khi artifacts cuối là1145.16ms/1.219s; traceability ghi khá nhiều mục như hoàn chỉnh dù còn các thiếu ở trên.|`docs/progress.md`, `docs/spec-traceability.md`. Cập nhật evidence/version và checklist trạng thái từng yêu cầu.|

Một tùy chọn chưa hỗ trợ: replay limit trong listening test. Hiện không có counter/enforcement/config UI; nếu sau này cho biên tập viên đặt giới hạn phải triển khai server/client và test, không chỉ thêm trường JSON. Spec ghi điều kiện “nếu được cấu hình”, nên không tính đây là blocker khi chưa bật tùy chọn.

## Có code nhưng còn điều kiện triển khai/kiểm chứng

- SMTP hiện chưa cấu hình; xác minh/reset/nhắc học chưa hoạt động với email thật trên bản local này. Mail sink integration đã có test trước đó. Đây là cấu hình ngoài, không phải thiếu SMTP adapter.
- Không có audio có license trong DB hiện tại. Listening renderer/grader có code và test WAV; bản nháp nghe chưa thể xuất bản hợp lệ. Spec cho phép giữ draft khi chưa có nguồn audio.
- Chưa có staging/production/domain/HTTPS được nghiệm thu; Docker/CI chuẩn bị không thay bằng chứng deploy, cron, persistent media, off-host backup và alert thật. Local MariaDB10.4.32 khác target container/CI10.11, cần chạy trên target trước ra mắt.
- Backup SQL/media đã có drill local1.219s trên dataset nhỏ; chưa chứng minh RPO24h/RTO4h với dung lượng/hạ tầng thật và lịch backup tự động ngoài máy.
- GA4 mặc định tắt; chưa kiểm ingestion thật. Analytics ngoài là tùy cấu hình, không bắt buộc phải bật GA4 mới được học.
- Contact/privacy/terms vẫn cần chủ dự án điền và duyệt; CMS đã có field. Kiểm hạ tầng SSL/secret/debug/headers/image trước public.

## Các phần chính đã có

Auth/roles/CSRF/IDOR; onboarding;2paths/units/15lessons gồm4checkpoint; placement20câu; các type grader và self null; versioned attempts/draft/resume/revision/idempotency/guestclaim; vocabulary/sets/private notes; due review/scheduling; XP/quests/streak/tickets/badges/cosmetics; CMS/media/report/import/export; SEO SSR; audit/queue/backup/restore. Không liệt kê các mục ngoài scope (AI tutor, thanh toán, speaking scoring, teacher dashboard, league, OAuth tùy chọn) như phần “còn thiếu”.

## Thứ tự xử lý đề xuất

A01 và A13 (độ ổn định queue/thời gian) → A03/A04 (biên tập) → A05/A06/A07 (học/ôn và lịch sử) → A08–A11 (analytics/SEO/form/import) → A12/A14 (hướng dẫn/evidence) → nghiệm thu staging và đo lại A02. Cập nhật bảng đối chiếu theo yêu cầu con; không dùng một dòng “đã có CMS” để thay cho toàn bộ mục16.


## Cập nhật A03 — 21/10/2026

Đã chặn xuất bản entity mới/draft trực tiếp cho path, nghĩa từ, bài viết và bộ từ. Gửi `in_review` tạo snapshot; thao tác publish của admin kiểm trạng thái đã gửi duyệt. Không sửa trực tiếp projection đang chờ duyệt; nội dung archived không được xuất bản qua proposal cũ.

Thành viên bộ từ published có đề xuất snapshot riêng, không thay danh sách công khai trước duyệt. Snapshot giữ cả danh sách gốc để từ chối đề xuất lỗi thời (409); xuất bản lặp không thay dữ liệu lần nữa. Bộ đang chờ duyệt không cho sửa membership. Tự gắn nghĩa từ theo topic cũng tuân thủ đề xuất khi bộ đã published. Không cần migration, dùng bảng proposal hiện có.

Kiểm chứng: `tests/product_http.py` bổ sung A03 qua HTTP thật cho cả bốn entity, quyền editor/admin, draft publish bị từ chối, membership không đổi trước duyệt, publish lặp, đề xuất stale, ID không hợp lệ và quyền học viên. A04 (mở lại sửa/return draft) vẫn để riêng, chưa xử lý.


## Cập nhật A04 — 22/10/2026

Đã bổ sung sửa trực tiếp đúng ID proposal/version ở trạng thái draft; admin trả in_review về draft với lý do bắt buộc, editor đọc lý do, sửa rồi gửi duyệt lại. CMS có JSON editor và link mở riêng `?draft=ID`; không cần migration. Document có hash đối chiếu để chặn ghi đè từ tab cũ. Bản nháp hoặc public projection khác không bị thay khi lưu. Bỏ việc tạo snapshot lịch sử draft bài viết thừa trong mỗi lần lưu projection chưa xuất bản.

Kiểm chứng qua HTTP thật: path/vocabulary/article trả về nháp, quyền admin/editor/learner, thiếu lý do, không sửa bản in_review/published, giữ nguyên ID, từ chối hash cũ, sửa proposal khi projection published vẫn giữ nguyên, sửa đề xuất membership và render form CMS. Kiểm tra cú pháp PHP và bộ integration local chạy trên database riêng; không nghiệm thu staging hoặc browser accessibility trong đợt này.


## Cập nhật A05 — 22/10/2026

Đã bỏ cắt danh sách cá nhân ở 100: Sổ từ và Quản lý thẻ có phân trang 30 mục, tổng count, trang trước/sau và thứ tự ổn định bằng ID. Sổ từ giữ tìm kiếm/bộ lọc, cả hai màn giữ query sau POST; trang ngoài phạm vi được clamp. Query luôn lọc user hiện tại. Queue ôn đến hạn/daily cap không đổi.

Kiểm chứng: fixture riêng thêm 121 nghĩa từ/thẻ vào tài khoản test, duyệt đủ các trang không lặp, kiểm count/filter, trang vượt giới hạn, query sai, dữ liệu không lộ sang owner khác và redirect sau POST giữ ngữ cảnh. Không tạo thêm nội dung vào database ứng dụng hiện tại.


## Cập nhật A06 — 22/10/2026

Đã bổ sung `partOfSpeech` và audioId kiểu số cho snapshot từ mới, render POS/audio ở mặt sau thẻ ôn. Có tốc độ, status lỗi tải và nút thử lại, không autoplay. Giữ nguyên snapshot cũ; thiếu POS/audio không làm hỏng ôn. Rating không bị khóa do audio lỗi. Media vẫn kiểm quyền owner của snapshot khi từ gốc archived.

Kiểm chứng dùng WAV tạo trong database test: lưu snapshot qua API, kiểm POS/audio, đọc audio sau archive và chặn account khác, xác nhận snapshot không đổi khi sửa nguồn. Chrome kiểm thẻ legacy, tốc độ, đường lỗi 404 và nút retry, rating còn dùng được, không tràn màn 360px. Flashcard lật trong lesson không nằm trong thay đổi này; vẫn là phần chưa hoàn chỉnh riêng trong hướng dẫn redesign.


## Cập nhật A07 — 22/10/2026

Trang Tiến độ đã có thống kê tuần, chọn tuần, tổng số lượt bài/ngày hoạt động/lượt ôn/accuracy/thời gian, danh sách hoạt động ngày. Lịch sử tất cả lượt finished (trừ preview) có phân trang 30, ngày giờ địa phương, title/version/điểm đã lưu và link mở lại đúng attempt kể cả bài archived. Lịch sử không phụ thuộc phiên bản hiện tại, quyền owner vẫn được kiểm tại player. Không cần migration.

Kiểm chứng A07: HTTP thật cho link/người sở hữu/query sai; PHP fixture 35 lượt để kiểm phân trang không lặp, title/version cũ khi bài archived và current_version đã thay, mốc tuần DST New York, tổng activity/phút, loại preview và giữ score null. Chưa bổ sung biểu đồ tương tác hoặc thay API progress hiện có.


## Cập nhật A08 — 22/10/2026

Đã bổ sung bảng journeys/migration, campaign opt-in không chặn học, lưu first-touch 30 ngày bằng nhãn UTM allowlist. Chỉ nối guest với đăng ký mới trong phiên đã đồng ý; không gắn tự động khi login tài khoản có sẵn. Mốc guest trial/signup/first lesson/return được ghi từ server events, idempotent theo event hiện có; return yêu cầu hoạt động học sau ít nhất 24 giờ, loại placement khỏi trial/return. CMS admin operations có funnel cho cohort landing 30 ngày (tối đa 100 nhóm), nêu rõ chỉ dữ liệu đã đồng ý.

Rút lại xóa journeys và analytics jobs của account/current guest; thêm journeys vào export/erase, dọn quá 90 ngày khi tick. Không lưu PII/raw UTM trong attribution. Queue GA4 giữ thời gian gốc và payload timestamp_micros, không gửi event quá 72 giờ hoặc mất thời gian gốc. Analytics ngoài vẫn mặc định tắt.

Kiểm chứng: HTTP campaign guest consent → học thử → đăng ký → nối journey, revoke và quyền admin report; PHP kiểm không consent không ghi, UTM không hợp lệ bị bỏ, first-touch không bị refresh đổi, return 23/25 giờ, thời gian gốc trong job/payload, từ chối quá hạn trước network, guest quá 30 ngày không gắn, export/erase. Bộ integration local chạy với GA4/mail ngoài tắt; không tuyên bố đã nghiệm thu ingestion GA4. Migration đã áp dụng trên local, không sửa dữ liệu nội dung.


## Cập nhật A09 — 22/10/2026

Đã có SEO title/description cho path, vocabulary sense/set và article trong draft workflow; lesson document.seo bổ sung validation/fallback rỗng. Static/catalog/campaign/legacy dùng admin-only page SEO tại settings; không nhận private/auth/admin hoặc bypass SEO entity qua endpoint trang. Header SSR áp dụng cho title/description/OG, không thay H1/canonical/noindex. Plain text, giới hạn 160/320, xóa để dùng fallback.

Migration idempotent thêm cột SEO và page_seo đã chạy local. Test HTTP kiểm quyền, URL/HTML/độ dài sai bị từ chối, escape dấu nháy/& trong HTML, clear override, metadata chỉ đổi sau publish ở bốn loại entity, canonical và private noindex giữ nguyên. Kiểm tra đã phát hiện/sửa truy vấn chi tiết path khi login dùng nhầm lesson_id trên attempts; nay join versions lấy lesson_id. Không bổ sung OG image/canonical tùy ý hoặc thay quy tắc index.


## Cập nhật A10 — 22/10/2026

Đã bổ sung fieldErrors cho các validation có tên trường, SSR error state theo đúng command/resource/action, không còn gắn một lỗi chung lên mọi form. Lỗi được liên kết bằng aria-describedby/aria-invalid, giữ hint cũ, có summary focus/link tới ô lỗi và mở details chứa lỗi. Giữ dữ liệu không nhạy cảm; không serialize mật khẩu/current/token/csrf. CMS JSON lỗi gắn vào document; lỗi trạng thái/quyền/mạng vẫn ở summary. Inline enhancement dùng JS, summary/native validation vẫn hoạt động khi không có JS.

Player giữ focus sau thao tác thêm/bỏ/sắp xếp token, status thông báo vị trí; nộp/đổi câu/kết thúc focus đúng nội dung. Match dùng native select và label. Thêm focus-visible rõ và hiển thị lỗi bằng chữ. HTTP kiểm contract fields + JSON state an toàn; Chrome kiểm order/match bằng phím, hint password, summary link, dữ liệu giữ lại và scope giữa nhiều form CMS. Chưa chạy NVDA/VoiceOver hoặc audit WCAG 2.2 AA toàn diện; phần nghiệm thu thủ công này vẫn mở, không coi test Chrome là chứng nhận.


## Cập nhật A11 — 22/10/2026

Dry-run/commit có lỗi record + dot field path sâu (metadata/CSV/lesson blocks/exercise payload), phase và message. Thêm import-status API chỉ owner editor/admin, CMS có progress/total/committed, trạng thái job/retry và polling. Processed là công việc trong giao dịch, không tuyên bố đã lưu. Telemetry dùng bảng riêng/kết nối autocommit phụ để nhìn thấy khi content transaction còn khóa; dữ liệu nội dung vẫn chỉ commit nguyên khối.

Lỗi runtime lưu chẩn đoán sau rollback, worker retry không bị chặn bởi issue commit cũ; recovery reset counter. Giữ draft-only/không overwrite/dedupe. Migration đã áp dụng local. Sửa lời gọi saveSetItems khi nhập từ vào topic published để dùng transaction đang có, tránh mở transaction lồng và vẫn giữ proposal membership A03.

Kiểm chứng: 11 dạng exercise với đường dẫn payload cụ thể, metadata/CSV/block paths; lỗi sau dry-run rollback record trước đó; worker thật bị chặn ở record 51 có progress 50/101 nhưng kết nối khác thấy 0 content mới; thả chặn rồi commit 101; queued conflict rollback, pending/backoff và retry thành công; owner khác không đọc status, API/UI counters và A01 recovery reset. Không dùng progress để che lỗi hoặc cho phép partial import.


## Cập nhật A12 — 22/10/2026

README sửa cú pháp create-admin: EMAIL và NAME đứng trước --local. Operations có ví dụ Bash stdin cho production/Docker, không gọi đây là prompt tương tác của CLI, không đưa mật khẩu lên argv. Làm rõ chỉ tạo admin khi cài mới, không ghi đè account đã có; chạy CLI container bằng www-data, quyền migration/restore-drill tách với quyền runtime.

Dockerfile chọn variant php:8.5-apache-trixie, cài python3, kiểm >=3.12 cùng các extension PHP và binary MariaDB ở build; đặt MYSQLDUMP_BIN/MYSQL_BIN đúng tên mariadb-dump/mariadb. Docs dùng python3 trong container/Linux và python cho Windows, giải thích archive nằm trong volume và restore media chỉ tạo đích mới. CI thêm job build/container media backup smoke.

Đã chạy `python tests/install_smoke.py`: database mới riêng, schema/migration lặp, check extensions, CLI thiếu args bị từ chối, cú pháp/launcher Windows đúng, account trùng không đổi password, password stdin, seed/worker, SQL backup/restore database mới, media backup/restore SHA khớp và chặn traversal. Credential file và SQL dump chỉ do test tạo được dọn; admin local đang dùng không đổi. Bằng chứng: [a12-install-report.json](artifacts/a12-install-report.json).

Máy local chưa có Docker CLI/daemon nên chưa build image/Compose; job CI mới cũng chưa được chạy từ phiên này. Đây còn là bước kiểm chứng container trước staging, không khẳng định Docker đã nghiệm thu. Các lệnh PHP/Python đã kiểm bằng runtime local, không thay bằng chứng deploy production.


## Cập nhật A14 — 22/10/2026

Đối chiếu lại mục 1–31, đặc biệt 24 và 26–29, với báo cáo kiểm thử lưu trong repo. Cập nhật `progress.md` thành checklist có giới hạn; bổ sung trạng thái theo nhóm yêu cầu và giới hạn từng acceptance case trong `spec-traceability.md`. Sửa số đo cũ thành p95 1145.16 ms (`target_met=false`) và restore 1.219 giây; không chạy benchmark hoặc sửa artifact đo cũ.

Bằng chứng: `test-report.json` lúc 03:55 UTC ngày 22/10 có `all_passed=true`; Chrome lúc 03:58 UTC không overflow/exception trong các case đã chạy; A12 lúc 04:05 UTC có 15 smoke checks qua. Docker/CI từ xa, screen reader, staging, SMTP/GA4 thật và off-host backup còn chờ. A14 chỉ sửa tài liệu và kiểm tham chiếu/số liệu; không thay logic, cấu hình hoặc dữ liệu ứng dụng.


## Cập nhật A02 — 22/10/2026

Giảm đường đọc/khóa profile từ ba lần xuống một ở profile đã có, giữ kiểm quyền/transaction/timezone; dựng public attempt không lọc lại danh sách exercise mỗi câu. Diagnostic CLI ghi nhận 28 → 26 statements. Hồi quy đầy đủ có Chrome, benchmark và account qua trên DB test riêng `mce_auth_test_59bf9094af90`.

Không kết luận đã tối ưu đạt tốc độ: trước sửa fresh DB p95 1095.29 ms, sau sửa fresh DB 1151.40 ms; lượt trong hồi quy 1190.16 ms, đều 0/50 lỗi và target_met=false. Số 1145.16 ms ở audit gốc là lịch sử. Chi tiết cấu hình, artifacts, runner và giới hạn ở [báo cáo A02](performance-a02.md). A02 còn mở, cần đo/phân tích trên runtime staging; chưa có bằng chứng nút thắt dưới tải hoặc nghiệm thu mục tiêu.


### A02 — xác minh runtime Apache/FastCGI, 22/10/2026

Không dùng module PHP 8.2.12 đang có trong XAMPP vì ngoài mức hỗ trợ; chạy Apache instance riêng chỉ localhost với PHP 8.5.11 FastCGI và DB test riêng. Ba lượt 50 phiên/fresh DB có p95 607.98/613.66/642.30 ms, đều 0 lỗi và target_met=true. Lượt 2/3 kiểm thêm private-file denial, attempt owner và CSRF trên server Apache thực. Kết quả mới nhất là `artifacts/performance.json`; từng lượt và CGI trước đó giữ riêng trong [báo cáo A02](performance-a02.md).

Không sửa code ứng dụng hoặc Apache hiện tại. Chỉ sửa runner/config benchmark và tài liệu; các process test đã dừng. Đạt ngưỡng local không đóng yêu cầu staging; A02 còn mở ở nghiệm thu môi trường mục tiêu. Không coi khác biệt CGI/FastCGI là phép đo tác dụng riêng của thay đổi SQL.


## Bổ sung lesson flashcard — 22/10/2026

Đã thay renderer flashcard text đơn thuần bằng mặt trước/mặt sau: ghi nhớ tùy chọn, nộp/lật sau server xác nhận; test giữ kín đáp án/criteria đến finish. Có xem lại hai mặt bằng Enter/Space, focus theo mặt đang mở, hidden mặt còn lại và layout mobile. Không thêm animation; không đổi schema/grading, first response hoặc revision khi chỉ xem lại mặt thẻ. Thẻ vẫn self_assessed/null, không dùng rating/lịch ôn mới.

Hồi quy đầy đủ có Chrome qua trên DB riêng `mce_auth_test_b217ce2e72f7`. Chrome kiểm trước submit không có modelAnswer trong HTML; khi offline mặt sau chưa xuất hiện; online gửi lại rồi lật; reload giữ ghi nhớ; test sau submit vẫn không lộ đáp án/API; finish mới hiện back và score/max/isCorrect null. Bản browser-report mới bổ sung các flags flashcard. Không đo lại performance/restore và không thay dữ liệu main DB trong lượt này. Field từ điển có cấu trúc/audio trong mặt sau lesson không được thêm ở đây; payload hiện có vẫn là prompt/modelAnswer/criteria.


## A10 — bổ sung navigation và vùng focus, 22/10/2026

Đã sửa menu mobile: Enter mở/focus link đầu, Escape đóng/return focus, focus ra ngoài thì đóng, reset khi đổi desktop; menu dài cuộn trong viewport. Main có tabindex=-1 và skip link thực sự focus vào main. Save status không còn sticky che nội dung; chiều cao header được đo để đặt scroll-padding. Không đổi auth/permissions/grading.

Hồi quy CGI local có Chrome qua trên DB riêng `mce_auth_test_d204fac342dd`; flags mới accessibleMenuEscapeSkipLink/flashcardAccessibilityTree/focusBelowStickyHeader đều true. Kiểm accessibility tree chỉ xác nhận semantics/hidden/name trong Chrome, không phải kết quả đọc bằng screen reader. Xem [biên bản A10 và checklist còn mở](accessibility-a10.md). Không chạy benchmark/restore mới. NVDA/VoiceOver, contrast/reflow và nghiệm thu WCAG toàn diện vẫn chờ.


## A12 — mở rộng pipeline kiểm image, 22/10/2026

Thay bước CI backup media rỗng bằng smoke runner image với MariaDB/network riêng, migrations lặp, admin stdin/hash/role, seed, public HTTP/Secure cookie/private denial, worker/SQL backup và media restore hash. Thêm Compose config validation, report upload và xóa evidence cũ trước run. Dockerfile kiểm openssl theo composer contract.

Local qua Python syntax, ba PHP snippets lint, composer validate và diff whitespace. Chạy runner xác nhận exit lỗi khi không có Docker; chưa chạy build/container/Compose hoặc CI từ xa. Không thay dữ liệu/logic ứng dụng, không chạy lại full regression trong lượt chỉ sửa tools/CI. A12 còn mở ở xác minh runtime. [Phạm vi và giới hạn](container-a12.md).


## Bổ sung — cách ly preview/guest khỏi lịch ôn tài khoản, 22/10/2026

Phát hiện mới khi rà review/concept: route cũ chấp nhận attempt preview đã finish và guest attempt cùng session dù chưa xác nhận chuyển vào account. Đã thêm server guards trả 422 cho cả hai, giữ owner check 404 cho account khác. Public attempt có canSaveConcepts để player ẩn CTA; không tự claim bài thử. Sau claim + finish, owner thêm concept được và target ổn định chống trùng khi retry.

Hồi quy đầy đủ có Chrome qua trên DB riêng `mce_auth_test_9808d83839d2`: preview bị chặn và số cards không đổi; guest signup chưa claim queue rỗng, claim/finish mới thêm được; retry không trùng và foreign owner 404. Chrome xác nhận CTA không xuất hiện trong kết quả preview có câu sai. Không sửa dữ liệu main DB hoặc xóa thẻ lịch sử; không chạy performance/restore mới. Contract bổ sung trong api.md.
