# Vận hành, deploy và phục hồi

## Local

Bật XAMPP MySQL; dùng README và php-local.ps1/start.ps1. Config local root không mật khẩu chỉ dành máy phát triển. `.env.example` là template, PHP không tự load; truyền biến môi trường từ process/service/hosting. Secret config và writable nằm ngoài Git. Admin local có thông tin ở tệp private do CLI tạo; không đưa credentials vào handoff hoặc lên web.

## Staging/production

Chọn PHP >=8.3 <8.6 với pdo_mysql/mbstring/intl/fileinfo, MariaDB10.11, Apache rewrite, HTTPS. Dockerfile và compose.yaml là ví dụ deploy: set MCE_DB_PASSWORD, MCE_DB_ROOT_PASSWORD, APP_URL HTTPS; `docker compose up -d --build`, `docker compose exec web php database/migrate.php`, lệnh tạo admin bên dưới (bắt buộc email/tên và mật khẩu qua stdin). Dùng reverse proxy HTTPS tới port localhost8080; APP_ENV=production trong image, SESSION_SECURE=1. Cookie Secure không dùng qua HTTP. Composer lock lưu dependency/platform contract; không cần vendor packages.

Trước đổi release: backup SQL+media+secret config, chạy migrations trên staging copy, smoke/acceptance, kiểm queue và permissions; sau đó áp dụng lên DB production đã backup. Web DB user chỉ quyền CRUD, migration dùng tài khoản DDL riêng. Chỉ writable cần quyền ghi. Không phục vụ application/database/tests/docs/legacy/dotfiles/writable. Apache .htaccess được cung cấp; nếu nginx phải cấu hình deny tương đương, PHP execution chỉ index.php. Không upload local database.php, log, test fixture hoặc node_modules. Image .dockerignore loại các file này.

## Cài mới Docker và tạo admin

Sau khi khai báo biến môi trường của Compose và cấu hình reverse proxy HTTPS:

```bash
docker compose up -d --build
docker compose exec --user www-data -T web php database/migrate.php
docker compose exec --user www-data -T web php database/check.php
# Bash trên host: mật khẩu không nằm trong argv, history hoặc output.
read -r -s -p 'Mat khau admin: ' mce_admin_password
printf '\n'
printf '%s' "$mce_admin_password" | docker compose exec --user www-data -T web php database/create-admin.php admin@example.com "Quan tri vien"
unset mce_admin_password
```

Thay email/tên bằng tài khoản thật của chủ dự án; không chạy tạo lại nếu đã tồn tại. CLI đọc stdin đến EOF, không tự hiện prompt; `-T` tránh TTY và pipeline trên đóng stdin khi hết mật khẩu. Không dùng `--local` trong container production (`DB_HOST=db` cũng không phải host local được phép). `create-admin.php EMAIL NAME --local` chỉ dùng khi cài mới local, sinh mật khẩu ngẫu nhiên trong file private.

User MariaDB do Compose mẫu tạo có quyền bootstrap trong database đã khai báo. Đây không tự động là phân quyền CRUD tối thiểu: trước production cần chuẩn bị tài khoản migration riêng và cấp lại quyền runtime theo hạ tầng. Không sửa quyền DB production bằng các lệnh test. Chạy CLI với `--user www-data` để tệp trong volume writable không bị tạo thành root-owned.

Image dùng [variant PHP Apache Trixie chính thức](https://github.com/docker-library/official-images/blob/master/library/php), cài Python và kiểm >=3.12 ở build, kiểm pdo_mysql/intl/mbstring/fileinfo và binary mariadb-dump/mariadb. Khi sửa base image, build phải qua các kiểm tra này. CI có job container smoke; chưa có Docker trên máy audit local nên chưa xác nhận build image tại đây.

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

Hàng ngày `php database/backup.php`; MYSQLDUMP_BIN cấu hình absolute path nếu cần. Dump --single-transaction (InnoDB), password truyền child env, không trên command line. `python3 database/media-backup.py backup` (Linux; Windows dùng `python`) lưu media; cấu hình/SMTP secrets backup riêng với quyền và mã hóa của hạ tầng. Local managed backups30ngày; copy off-host mã hóa, kiểm mã băm và cảnh báo thất bại. Mục tiêu vận hành đề xuất RPO24h, RTO4h, chỉ xác nhận sau drill staging với dung lượng thật.

`php database/restore-drill.php writable/backups/FILE.sql` tạo DB mới mce_restore_test_*, so counts, giữ DB gốc. Cần quyền CREATE DATABASE cho tài khoản drill riêng. `python3 database/media-backup.py restore ARCHIVE` (Linux; Windows dùng `python`) chỉ bung vào thư mục mới, từ chối traversal/symlink. `python tests/restore.py` kiểm login/lesson/attempt/progress bằng process mới và so SHA media. Report local ở docs/artifacts/restore-report.json, không suy diễn tốc độ production.

Backup khi dùng Compose (file nằm trong volume persistent, không phải filesystem host):

```bash
docker compose exec --user www-data -T web php database/backup.php
docker compose exec --user www-data -T web python3 database/media-backup.py backup
# Điền đường dẫn archive được lệnh trên in ra, không dùng tên demo cố định.
docker compose exec --user www-data -T web python3 database/media-backup.py restore /var/www/html/writable/backups/MEDIA_ARCHIVE.tar.gz
```

Lệnh restore media tạo thư mục drill mới, không ghi đè media đang phục vụ. SQL restore-drill cần user có CREATE DATABASE (user runtime Compose mẫu không có quyền tạo database mới ngoài database đã cấp); chạy bằng tài khoản drill riêng có quyền phù hợp, không mở rộng quyền web chỉ để chạy drill. SQL client trong image lấy từ MYSQLDUMP_BIN=/usr/bin/mariadb-dump và MYSQL_BIN=/usr/bin/mariadb. Sao chép SQL/media ra kho off-host do hạ tầng quản lý; chỉ có file trong volume chưa đáp ứng yêu cầu backup ngoài máy.

Rollback: chuyển release code trước + config tương thích, giữ bảng additive, không chạy DROP. Nếu migration dữ liệu lỗi: dựng DB/media backup vào đích mới, chạy kiểm login/history/queue, rồi đổi DB config có kiểm soát; chặn worker cũ trước chuyển. Không replay email/analytics đã gửi. Chỉ bỏ backup cũ sau drill và retention.

Cleanup: export24h, guest attempts30ngày, mail sink7ngày, public cache hết hạn, completed jobs30ngày, failed payload nhạy cảm7ngày; auth token hết hạn được dọn. Account deletion worker xóa dữ liệu riêng, revoke session ngay. Backup chứa dữ liệu trước xóa hết hạn theo30ngày; yêu cầu pháp lý dài/ngắn khác phải chủ dự án quyết định và công bố.

## Monitoring và xử lý sự cố

`/health` chỉ trạng thái không credentials; PHP error log/request ID để đối chiếu, không ghi token/answers/notes. Alert HTTP5xx, DB unavailable, queue oldest>5phút, job failures, disk free, backup tuổi>26h, SMTP failure. Hạ tầng cần cung cấp nơi nhận cảnh báo. Catalog cache lỗi được fallback DB; chạy reconcile để rebuild balance nếu projection lệch, không sửa ledger trực tiếp. Đổi quyền/adjustment qua CMS để có audit. Không impersonation.

## Cấu hình còn cần từ chủ dự án

Domain+hosting+HTTPS, DB user production, persistent storage/backup ngoài máy, cron, SMTP/sandbox, logo/favicon/social/contact, nội dung privacy/terms được duyệt, nguồn/license audio, analytics ID nếu chọn bật, nơi nhận cảnh báo. Không cần thanh toán hoặc API AI cho bản đầu. Chưa triển khai external staging/production.


## Bổ sung kiểm image/CI A12 — 22/10/2026

CI mở rộng từ media backup rỗng sang `tests/container_smoke.py`: database/network/web riêng, kiểm packaged runtime/migration/admin stdin/public HTTP/Secure cookie/private paths/worker/SQL backup và media restore hash. [Chi tiết và lệnh kiểm image](container-a12.md). Report upload chỉ JSON đã chọn, không writable/SQL dumps. CI xóa report cũ trước test để tránh nhận nhầm evidence local.

Máy local chưa có Docker CLI; mới kiểm cú pháp Python/PHP snippets/Composer và trường hợp thiếu Docker. Chưa xác nhận image build, Compose config, container HTTP hoặc CI từ xa. Không dùng smoke HTTP này để nghiệm thu login HTTPS, full SQL restore trong container hoặc persistent Compose volumes. Những phần đó vẫn cần chạy trên môi trường có Docker/staging.
