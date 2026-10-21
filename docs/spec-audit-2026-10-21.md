# Rà soát spec so với bản hiện tại — 21/10/2026

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
