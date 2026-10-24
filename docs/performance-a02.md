# A02 — chẩn đoán và tối ưu local, 22/10/2026

> Ghi chú 24/10/2026: tài liệu này mô tả bản PHP (tag `php-final`), không phải app Next.js hiện tại. Benchmark hiện nay: `pnpm benchmark`, kết quả `docs/artifacts/a02-next-local.json` (xem [testing.md](testing.md#hiệu-năng-a02)).

A02 còn mở ở bước nghiệm thu staging. Ba lượt mới trên Apache riêng + PHP 8.5 FastCGI đã đạt p95 dưới 800 ms tại local. Các lượt CGI cũ bên dưới vẫn được giữ làm lịch sử; thay runtime không chứng minh riêng thay đổi code đã làm giảm latency.

## Thay đổi

- `mce_profile` đọc toàn bộ profile ngay lần đầu; tùy chọn `FOR UPDATE` để `Motivation::lock` dùng chính hàng đã khóa. Bỏ truy vấn kiểm tồn tại và đọc lại profile ở đường dữ liệu đã tồn tại; vẫn tạo profile nếu thiếu, kiểm deleted/session, đồng bộ pending timezone và giữ profile lock.
- `Study::publicAttempt` dùng exercise đang duyệt, thay vì lọc lại toàn bộ danh sách mỗi câu. Giữ thứ tự, IDs, redaction và feedback theo mode.
- Thêm `tests/performance_local.py`: tạo DB riêng, admin mật khẩu ngẫu nhiên qua stdin, seed được duyệt, chạy HTTP CGI local và 50 requests; từ chối khi cổng 8089 đã được dùng. Không sửa DB/tài khoản ứng dụng.
- Thêm CLI diagnostic `tests/performance_profile.php`, chỉ chấp nhận DB test. Dùng MariaDB session profiling; report chỉ chứa số đếm/thời gian, không SQL text, cookie hoặc dữ liệu người dùng.

## Số đo thật

| Lượt | p95 | Lỗi | Phạm vi |
|---|---|---|---|
| [Trước sửa](artifacts/a02-performance-before.json) | 1095.29 ms | 0/50 | Fresh DB, runner local riêng |
| [Sau sửa](artifacts/a02-performance-after.json) | 1151.40 ms | 0/50 | Fresh DB, cùng runner/seed; chưa đạt |
| [Sau sửa trong hồi quy](artifacts/a02-performance-regression.json) | 1190.16 ms | 0/50 | DB nhiều fixtures hơn sau các test khác, không so trực tiếp với fresh DB |

Cấu hình trong artifact: Windows 10, PHP 8.5.11, MariaDB 10.4.32-MariaDB, 12 logical CPUs, Python threaded server khởi động một PHP CGI process mỗi request. Mỗi lượt gồm 5 warmup và 50 phiên độc lập nộp lần đầu, chấm và đọc attempt; fresh seed có 18 lessons và 55 attempts khi ghi report. Email/analytics ngoài tắt. Timestamps UTC nằm trong từng report HTTP. Mục tiêu spec là staging, không suy ra capacity production từ CGI local.

[Profile trước](artifacts/a02-profile-before.json)/[sau](artifacts/a02-profile-after.json): 5 requests tuần tự, số SQL statements được MariaDB profiling ghi nhận giảm **28 → 26** (kể cả transaction statements). Wall time CLI gồm khởi động process lớn hơn phần xử lý service; số đo này không tách được bottleneck khi 50 request tranh tài nguyên. Không quy kết toàn bộ chậm cho SQL hoặc Windows từ các mẫu này; không có đo lock/CPU/I/O dưới tải để kết luận đó.

## Xác minh và việc còn lại

[Hồi quy](artifacts/test-report.json) `2026-10-22T04:24:49.708092+00:00` có `all_passed=true`, gồm job recovery, timezone API/HTML/DST, học/CMS/import, motivation, Chrome, benchmark, auth và account/mail sink. Syntax PHP của các file sửa đạt. Performance test assert request không lỗi; `target_met=false` vẫn phải giữ trạng thái chưa đạt hiệu năng. Không chạy restore mới trong phần này.

Lệnh chạy lại: `python tests/performance_local.py` (cần MySQL CREATE DATABASE, PHP đủ extension và cổng 8089 trống). Database test được giữ để kiểm tra; log private ở `writable/performance-server.log`. Không chạy đồng thời với suite dùng cùng cổng. Chạy nhiều lần trên cấu hình staging được ghi lại, thu CPU/I/O/query/lock timings và runtime worker trước khi kết luận nút thắt hoặc nghiệm thu 800 ms. Ở lượt CGI này chưa kiểm persistent worker. Kết quả Apache/FastCGI bổ sung bên dưới; vẫn chưa có staging hoặc Docker để nghiệm thu.


## Bổ sung Apache/FastCGI — 22/10/2026

Apache XAMPP đang chạy có module PHP 8.2.12, ngoài mức dự án hỗ trợ 8.3–8.5. Không sửa hoặc restart instance đó. Runner tạo cấu hình riêng dưới `writable/apache-benchmark`, Apache 2.4.58 chỉ nghe 127.0.0.1:8090, một PHP 8.5.11 FastCGI worker nghe 127.0.0.1:8091, 64 Apache request threads. PHP worker xử lý từng request; không diễn giải là 50 PHP workers song song. Không bật thêm OPcache trong runner.

Dùng [mod_proxy_fcgi và ProxyFCGISetEnvIf](https://httpd.apache.org/docs/2.4/mod/mod_proxy_fcgi.html) để nối FastCGI và đặt SCRIPT_FILENAME đúng đường dẫn Windows. Config này chỉ phục vụ benchmark với front controller `index.php`, không phải cấu hình deploy production. Không dùng PHP module 8.2 hoặc thay PHP toàn máy để đạt số đo.

| Lượt fresh DB | p95 | Lỗi | Artifact |
|---|---|---|---|
| 1 | 607.98 ms | 0/50 | [round1](artifacts/a02-apache-round1.json) |
| 2 | 613.66 ms | 0/50 | [round2](artifacts/a02-apache-round2.json) |
| 3 | 642.30 ms | 0/50 | [round3](artifacts/a02-apache-round3.json) |

`artifacts/performance.json` hiện là lượt Apache thứ 3, không phải kết quả CGI 1151.40 ms; CGI vẫn lưu trong `a02-performance-after.json`. Mỗi lượt tạo DB riêng, cùng seed, 5 warmup + 50 phiên nộp/chấm/đọc attempt mới. Không gộp 3 lượt thành phép thử 150 phiên đồng thời. Runtime từ HTTP header của guard riêng xác nhận PHP 8.5.11/cgi-fcgi và PID giữ nguyên qua các request trước tải; báo cáo không lưu PID/cookie/token. Tên SAPI thực tế là `cgi-fcgi`.

Lượt 2/3 kiểm thêm public home/catalog/CSS trả 200, application/config/writable/tests/.env trả 403, attempt không đăng nhập trả 404 và CSRF sai trả 403. Lượt 1 có kiểm runtime/persistence nhưng chưa có preflight bảo mật bổ sung này. Không chạy lại toàn bộ suite qua Apache; full regression trước đó vẫn là CGI. Không đổi code ứng dụng trong lượt Apache này.

Thử riêng: `python tests/performance_local.py --apache` trên Windows; cần Apache XAMPP (hoặc biến `APACHE_HTTPD` trỏ binary Apache), PHP 8.3–8.5 có php-cgi và extensions cần thiết, MySQL CREATE DATABASE, hai cổng 8090/8091 trống. Runner dừng đúng processes nó tạo khi kết thúc/lỗi; không dừng Apache khác. Test ini/config/logs ở private writable, không commit. Không chạy song song các runner. Môi trường sandbox hiện tại cần cho phép subprocess Apache truy cập workspace; không thay ACL hoặc service hệ thống để vượt giới hạn.

Kết luận: runtime local có ảnh hưởng đáng kể tới kết quả; chưa xác định đóng góp riêng của process startup, SQL locks, CPU hay I/O dưới tải. Ba lượt persistent worker đạt ngưỡng local, nhưng chưa phải staging, không chứng minh production capacity hoặc toàn bộ spec đã đạt. Cần cấu hình và dataset staging được ghi lại trước khi đóng A02.
