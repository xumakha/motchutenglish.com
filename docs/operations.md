# Vận hành, deploy và phục hồi

## Local

Bật XAMPP MySQL; dùng README và php-local.ps1/start.ps1. Config local root không mật khẩu chỉ dành máy phát triển. `.env.example` là template, PHP không tự load; truyền biến môi trường từ process/service/hosting. Secret config và writable nằm ngoài Git. Admin local đã tạo có mật khẩu tại tệp riêng được ghi trong progress, không đưa lên web.

## Staging/production

Chọn PHP >=8.3 <8.6 với pdo_mysql/mbstring/intl/fileinfo, MariaDB10.11, Apache rewrite, HTTPS. Dockerfile và compose.yaml là ví dụ deploy: set MCE_DB_PASSWORD, MCE_DB_ROOT_PASSWORD, APP_URL HTTPS; `docker compose up -d --build`, `docker compose exec web php database/migrate.php`, `docker compose exec web php database/create-admin.php`. Dùng reverse proxy HTTPS tới port localhost8080; APP_ENV=production trong image, SESSION_SECURE=1. Cookie Secure không dùng qua HTTP. Composer lock lưu dependency/platform contract; không cần vendor packages.

Trước đổi release: backup SQL+media+secret config, chạy migrations trên staging copy, smoke/acceptance, kiểm queue và permissions; sau đó áp dụng lên DB production đã backup. Web DB user chỉ quyền CRUD, migration dùng tài khoản DDL riêng. Chỉ writable cần quyền ghi. Không phục vụ application/database/tests/docs/legacy/dotfiles/writable. Apache .htaccess được cung cấp; nếu nginx phải cấu hình deny tương đương, PHP execution chỉ index.php. Không upload local database.php, log, test fixture hoặc node_modules. Image .dockerignore loại các file này.

## Queue/cron

Cùng code/config/environment với web. Mỗi phút: `php database/worker.php tick` rồi `php database/worker.php run 50`. Worker dùng DB named lock, job event keys và retry/backoff; monitor pending tuổi cao, failed/dead-letter. Chạy cleanup hàng ngày, reconcile hàng ngày hoặc sau sự cố. Cron Linux dùng flock để tránh overlap tick/backup; Windows Task Scheduler đặt không chạy instance thứ hai. Chọn cùng tài khoản service có quyền private writable. `/admin/operations` hiển thị counts/cohorts/jobs, admin có thể retry failed an toàn. Email ở trạng thái delivery uncertain cần đối chiếu provider trước thao tác thủ công, không tự gửi lặp.

## Phục hồi worker bị ngắt (bổ sung 21/10/2026)

Mỗi lần `database/worker.php run` giành được named lock độc quyền `mce_worker`, worker kiểm tra các job còn `running` từ lần chạy đã ngắt. Không chỉ dựa vào tuổi `locked_at`: worker khác còn giữ lock thì lần chạy mới trả `busy` và không lấy lại job, kể cả job đang chạy lâu.

- Import/export đã có kết quả `committed`/`ready`, hoặc reminder có delivery `sent`/`skipped`: xác nhận job `done`, không thực hiện lại.
- Import/export/xóa tài khoản bị gián đoạn: đưa về `pending` nếu chưa dùng hết 5 lần thử; giữ bộ đếm, xóa `locked_at`, backoff theo lần thử (60, 120, 240, 480 giây cho các lần ngắt 1–4). Projection import/export trở về `queued`. Export chưa hoàn chỉnh được dựng lại thành tệp riêng khi retry.
- Mail/reminder/analytics chưa có bằng chứng hoàn tất: chuyển `failed`, ghi `Delivery uncertain`, yêu cầu đối soát. Không tự gửi lại; endpoint retry quản trị hiện từ chối trạng thái uncertain.
- Job hết lượt thử hoặc loại không hỗ trợ: chuyển `failed` để kiểm tra thủ công. Không chứa payload riêng tư trong thông báo lỗi phục hồi.

CLI trả thêm trường `recovery` gồm số `requeued`, `completed`, `failed`; giữ các trường `processed`/`failed` hiện có cho lần xử lý bình thường. Không cần migration hoặc daemon phụ. Lần cron tiếp theo sẽ phục hồi sau khi database giải phóng lock của process cũ; job được retry khi đến `available_at`.

Kiểm thử `tests/jobs_recovery.php` chạy trên database test riêng: ngắt process worker CLI thật khi đang chờ khóa, khởi động lại, kiểm tra không lấy job của worker đang sống, backoff/giới hạn retry, không replay delivery chưa rõ, dedupe kết quả đã commit và rebuild partial export. Không chạy fixture này trên database ứng dụng.

## Email và analytics

MAIL_DRIVER=disabled mặc định. log chỉ development/test, private file có token, xóa sau7ngày. SMTP dùng MAIL_FROM, SMTP_HOST/PORT/USER/PASSWORD/ENCRYPTION(starttls hoặc tls). Worker mới thực hiện send; kiểm provider/sandbox inbox và link HTTPS/expiry/reset/session revoke trên staging trước ra mắt. Không coi enqueue là delivery. Reminder opt-in theo timezone/hour, unsubscribe một lần, dedupe ngày. GA4 chỉ khi có cả measurementID/APIsecret và consent; whitelist không có PII. HTTP2xx chỉ là transport, cần debug/GA dashboard xác nhận ingestion. Chưa cấu hình real SMTP hoặc GA4 trong phiên này.

## Múi giờ ôn tập và nhắc học (bổ sung 21/10/2026)

`timezone` dùng cho lựa chọn/hiển thị của người học; `quest_timezone` là múi giờ nghiệp vụ đang có hiệu lực. Thay đổi chờ trong `mce_timezone_changes` chỉ được áp dụng từ `effective_after`, dưới profile lock. Không sửa lại lịch streak hoặc snapshot nhiệm vụ đã chốt.

API `/api/v1/review/queue` và trang `/on-tap` dùng chung `Review::queue`: áp dụng thay đổi đến hạn, tạo nhiệm vụ nếu cần, đếm lượt ôn và lấy thẻ trong cùng transaction/mốc giờ. Giới hạn ngày tính theo khoảng từ nửa đêm địa phương tới nửa đêm kế tiếp; ngày DST có thể dài 23 hoặc 25 giờ. Điều này khác với khoảng lịch ôn thuật toán, vẫn tính bằng thời gian trôi qua UTC với một ngày bằng 24 giờ.

Cron `tick` chỉ lấy danh sách user IDs ban đầu, sau đó đọc profile/reminder mới trong transaction cho từng user. Ngày hoạt động, giờ nhắc và ngày delivery đều lấy theo `quest_timezone` sau khi áp dụng thay đổi. Trước gửi, worker kiểm lại pending timezone; reminder đã xếp hàng cho ngày địa phương cũ được đánh dấu `skipped`. Tick lặp cùng ngày không tạo trùng delivery. Không cần migration hoặc đặt lại lịch sử người học.

Kiểm thử: `tests/timezone.php` dùng clock cố định để kiểm trước/đúng ranh giới hiệu lực, daily cap, DST, snapshot và cron; kiểm delivery bằng mail sink local. `tests/timezone_http.py` so sánh API/SSR thật với pending change, ôn thêm tự nguyện và API nhiệm vụ. Chỉ dùng các fixture trên DB test riêng, không trên database ứng dụng.

## Backup và retention

Hàng ngày `php database/backup.php`; MYSQLDUMP_BIN cấu hình absolute path nếu cần. Dump --single-transaction (InnoDB), password truyền child env, không trên command line. `python database/media-backup.py backup` lưu media; cấu hình/SMTP secrets backup riêng với quyền và mã hóa của hạ tầng. Local managed backups30ngày; copy off-host mã hóa, kiểm mã băm và cảnh báo thất bại. Mục tiêu vận hành đề xuất RPO24h, RTO4h, chỉ xác nhận sau drill staging với dung lượng thật.

`php database/restore-drill.php writable/backups/FILE.sql` tạo DB mới mce_restore_test_*, so counts, giữ DB gốc. Cần quyền CREATE DATABASE cho tài khoản drill riêng. `python database/media-backup.py restore ARCHIVE` chỉ bung vào thư mục mới, từ chối traversal/symlink. `python tests/restore.py` kiểm login/lesson/attempt/progress bằng process mới và so SHA media. Report local ở docs/artifacts/restore-report.json, không suy diễn tốc độ production.

Rollback: chuyển release code trước + config tương thích, giữ bảng additive, không chạy DROP. Nếu migration dữ liệu lỗi: dựng DB/media backup vào đích mới, chạy kiểm login/history/queue, rồi đổi DB config có kiểm soát; chặn worker cũ trước chuyển. Không replay email/analytics đã gửi. Chỉ bỏ backup cũ sau drill và retention.

Cleanup: export24h, guest attempts30ngày, mail sink7ngày, public cache hết hạn, completed jobs30ngày, failed payload nhạy cảm7ngày; auth token hết hạn được dọn. Account deletion worker xóa dữ liệu riêng, revoke session ngay. Backup chứa dữ liệu trước xóa hết hạn theo30ngày; yêu cầu pháp lý dài/ngắn khác phải chủ dự án quyết định và công bố.

## Monitoring và xử lý sự cố

`/health` chỉ trạng thái không credentials; PHP error log/request ID để đối chiếu, không ghi token/answers/notes. Alert HTTP5xx, DB unavailable, queue oldest>5phút, job failures, disk free, backup tuổi>26h, SMTP failure. Hạ tầng cần cung cấp nơi nhận cảnh báo. Catalog cache lỗi được fallback DB; chạy reconcile để rebuild balance nếu projection lệch, không sửa ledger trực tiếp. Đổi quyền/adjustment qua CMS để có audit. Không impersonation.

## Cấu hình còn cần từ chủ dự án

Domain+hosting+HTTPS, DB user production, persistent storage/backup ngoài máy, cron, SMTP/sandbox, logo/favicon/social/contact, nội dung privacy/terms được duyệt, nguồn/license audio, analytics ID nếu chọn bật, nơi nhận cảnh báo. Không cần thanh toán hoặc API AI cho bản đầu. Chưa triển khai external staging/production.
