# Vận hành, deploy và phục hồi

## Local

Bật XAMPP MySQL; dùng README và php-local.ps1/start.ps1. Config local root không mật khẩu chỉ dành máy phát triển. `.env.example` là template, PHP không tự load; truyền biến môi trường từ process/service/hosting. Secret config và writable nằm ngoài Git. Admin local đã tạo có mật khẩu tại tệp riêng được ghi trong progress, không đưa lên web.

## Staging/production

Chọn PHP >=8.3 <8.6 với pdo_mysql/mbstring/intl/fileinfo, MariaDB10.11, Apache rewrite, HTTPS. Dockerfile và compose.yaml là ví dụ deploy: set MCE_DB_PASSWORD, MCE_DB_ROOT_PASSWORD, APP_URL HTTPS; `docker compose up -d --build`, `docker compose exec web php database/migrate.php`, `docker compose exec web php database/create-admin.php`. Dùng reverse proxy HTTPS tới port localhost8080; APP_ENV=production trong image, SESSION_SECURE=1. Cookie Secure không dùng qua HTTP. Composer lock lưu dependency/platform contract; không cần vendor packages.

Trước đổi release: backup SQL+media+secret config, chạy migrations trên staging copy, smoke/acceptance, kiểm queue và permissions; sau đó áp dụng lên DB production đã backup. Web DB user chỉ quyền CRUD, migration dùng tài khoản DDL riêng. Chỉ writable cần quyền ghi. Không phục vụ application/database/tests/docs/legacy/dotfiles/writable. Apache .htaccess được cung cấp; nếu nginx phải cấu hình deny tương đương, PHP execution chỉ index.php. Không upload local database.php, log, test fixture hoặc node_modules. Image .dockerignore loại các file này.

## Queue/cron

Cùng code/config/environment với web. Mỗi phút: `php database/worker.php tick` rồi `php database/worker.php run 50`. Worker dùng DB named lock, job event keys và retry/backoff; monitor pending tuổi cao, failed/dead-letter. Chạy cleanup hàng ngày, reconcile hàng ngày hoặc sau sự cố. Cron Linux dùng flock để tránh overlap tick/backup; Windows Task Scheduler đặt không chạy instance thứ hai. Chọn cùng tài khoản service có quyền private writable. `/admin/operations` hiển thị counts/cohorts/jobs, admin có thể retry failed an toàn. Email ở trạng thái delivery uncertain cần đối chiếu provider trước thao tác thủ công, không tự gửi lặp.

## Email và analytics

MAIL_DRIVER=disabled mặc định. log chỉ development/test, private file có token, xóa sau7ngày. SMTP dùng MAIL_FROM, SMTP_HOST/PORT/USER/PASSWORD/ENCRYPTION(starttls hoặc tls). Worker mới thực hiện send; kiểm provider/sandbox inbox và link HTTPS/expiry/reset/session revoke trên staging trước ra mắt. Không coi enqueue là delivery. Reminder opt-in theo timezone/hour, unsubscribe một lần, dedupe ngày. GA4 chỉ khi có cả measurementID/APIsecret và consent; whitelist không có PII. HTTP2xx chỉ là transport, cần debug/GA dashboard xác nhận ingestion. Chưa cấu hình real SMTP hoặc GA4 trong phiên này.

## Backup và retention

Hàng ngày `php database/backup.php`; MYSQLDUMP_BIN cấu hình absolute path nếu cần. Dump --single-transaction (InnoDB), password truyền child env, không trên command line. `python database/media-backup.py backup` lưu media; cấu hình/SMTP secrets backup riêng với quyền và mã hóa của hạ tầng. Local managed backups30ngày; copy off-host mã hóa, kiểm mã băm và cảnh báo thất bại. Mục tiêu vận hành đề xuất RPO24h, RTO4h, chỉ xác nhận sau drill staging với dung lượng thật.

`php database/restore-drill.php writable/backups/FILE.sql` tạo DB mới mce_restore_test_*, so counts, giữ DB gốc. Cần quyền CREATE DATABASE cho tài khoản drill riêng. `python database/media-backup.py restore ARCHIVE` chỉ bung vào thư mục mới, từ chối traversal/symlink. `python tests/restore.py` kiểm login/lesson/attempt/progress bằng process mới và so SHA media. Report local ở docs/artifacts/restore-report.json, không suy diễn tốc độ production.

Rollback: chuyển release code trước + config tương thích, giữ bảng additive, không chạy DROP. Nếu migration dữ liệu lỗi: dựng DB/media backup vào đích mới, chạy kiểm login/history/queue, rồi đổi DB config có kiểm soát; chặn worker cũ trước chuyển. Không replay email/analytics đã gửi. Chỉ bỏ backup cũ sau drill và retention.

Cleanup: export24h, guest attempts30ngày, mail sink7ngày, public cache hết hạn, completed jobs30ngày, failed payload nhạy cảm7ngày; auth token hết hạn được dọn. Account deletion worker xóa dữ liệu riêng, revoke session ngay. Backup chứa dữ liệu trước xóa hết hạn theo30ngày; yêu cầu pháp lý dài/ngắn khác phải chủ dự án quyết định và công bố.

## Monitoring và xử lý sự cố

`/health` chỉ trạng thái không credentials; PHP error log/request ID để đối chiếu, không ghi token/answers/notes. Alert HTTP5xx, DB unavailable, queue oldest>5phút, job failures, disk free, backup tuổi>26h, SMTP failure. Hạ tầng cần cung cấp nơi nhận cảnh báo. Catalog cache lỗi được fallback DB; chạy reconcile để rebuild balance nếu projection lệch, không sửa ledger trực tiếp. Đổi quyền/adjustment qua CMS để có audit. Không impersonation.

## Cấu hình còn cần từ chủ dự án

Domain+hosting+HTTPS, DB user production, persistent storage/backup ngoài máy, cron, SMTP/sandbox, logo/favicon/social/contact, nội dung privacy/terms được duyệt, nguồn/license audio, analytics ID nếu chọn bật, nơi nhận cảnh báo. Không cần thanh toán hoặc API AI cho bản đầu. Chưa triển khai external staging/production.
