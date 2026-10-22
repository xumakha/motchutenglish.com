# Kiểm thử và bằng chứng

Bổ sung 21/10/2026: runner hiện chạy `tests/jobs_recovery.php` (ngắt/khởi động lại worker CLI thật) và `tests/timezone.php` + `tests/timezone_http.py`. Bộ múi giờ kiểm clock cố định trước/đúng ranh giới hiệu lực, snapshot bất biến, daily cap/DST 23–25 giờ, cron dùng ngày/giờ mới, suppression reminder ngày cũ và kết quả API/SSR thống nhất. Các phép thử chỉ dùng database riêng và mail sink local; không gửi SMTP thật.

`python tests/run_auth.py` tạo DB riêng mce_auth_test_* và server local8089. Không xóa/seed database ứng dụng. Test fixture CLI từ chối DB không có prefix test. PHP extension ini và logs ở private writable. Các DB thử giữ lại để kiểm tra, không công khai credentials hoặc cookie.

- product_unit.php: schema/type validation, grading/partial/null, Unicode NFC/space/punctuation/apostrophe, stable duplicate-text IDs, answer redaction, fixed-clock UTC review/DST/cap.
- product_http.py: real MariaDB, 4roles, CSRF/IDOR, multiple question lesson, version snapshot, draft/revision409, retry/finish unique, notes XSS/private, review unique, concurrent purchase, import dry-run/atomic/CSV/queue, real WAV upload và reject SVG/PHP, missingaudio, archive/history.
- motivation.php: clock cố định,7ngày thật/ticket, protect đồng thời2process, ngàymissed/backward timezone, quest snapshot, ledger reconciliation.
- account_http.py: local mail sink qua worker, verification/reset once/session revoke, safe emailchange, reminder/unsubscribe, password change, queued export/ownership và queued erase.
- learning_http.py/auth_http.py/auth_hash.php/site_http.py: regression cũ, password/session/CSRF/rate limit và26publicroutes/10assets.
- browser.mjs: Chrome thật qua CDP, viewport360/390/768/1440, không tràn ngang, lesson chọn/nộp bằng bàn phím, guest finish -> đăng ký -> chỉ chuyển attempt khi xác nhận, exception check và screenshots.
- performance.py:55 authenticatedsessions độc lập,5warmup+50concurrent grading requests, p95/error report. Đây là local CGI/PHP/XAMPP, không staging load hoặc đảm bảo SLA production.
- restore.py: dump và restore DB mới, login và progress/score từ process mới; media backup/restore so SHA, không sửa DB gốc.

Bật các biến BROWSER_TESTS/PERFORMANCE_TESTS/RESTORE_TESTS/THREADED_TESTS theo README. Chrome local test profile dùng no-sandbox/disable-gpu để tương thích môi trường kiểm thử, không áp dụng website production hay profile cá nhân. Không cần cài npm package.

Báo cáo thực tế: docs/artifacts/browser-report.json, performance.json, restore-report.json và ảnh; xem thời gian/env trong từng artifact. CI PHP/MariaDB10.11 được chuẩn bị trong .github/workflows/php.yml nhưng chưa có kết quả remote. Staging chưa có host/domain, nên chưa nghiệm thu production, SMTP provider, GA4 ingestion, hạ tầng backup/alert hoặc accessibility với screen reader thật. Kiểm keyboard/responsive tự động không thay thế toàn bộ WCAG audit.


## Cài mới và công cụ vận hành (A12)

`python tests/install_smoke.py` cần Python >=3.12, PHP đủ extensions, MySQL local có CREATE DATABASE và SQL clients (Windows tự tìm XAMPP; Linux dùng mariadb-dump/mariadb hoặc env MYSQLDUMP_BIN/MYSQL_BIN). Tạo database test riêng, thử setup/migrate/check/create-admin qua launcher Windows nếu có, admin stdin/duplicate, seed/worker, SQL backup+restore drill và media backup/restore trong fixture riêng. Không dùng media hoặc mật khẩu của account hiện tại. Lưu `docs/artifacts/a12-install-report.json`, giữ database test để kiểm tra và dọn credential/dump tạm do test tạo.

Bài này không build Docker. Job `container` trong `.github/workflows/php.yml` build image và thử chạy media backup bằng www-data. Chỉ coi container pass sau khi có kết quả CI/Docker thật; ở audit local 22/10/2026 chưa có Docker để chạy.


## Benchmark độc lập A02

`python tests/performance_local.py` tạo fresh DB riêng và chạy CGI local cổng 8089, 5 warmup + 50 phiên nộp đầu tiên. Không chạy đồng thời với suite dùng cùng cổng. Lưu runtime/CPU/timestamp và p95/error trong `artifacts/performance.json`; assert không có request lỗi, không đồng nghĩa mục tiêu 800 ms đã đạt. Xem [báo cáo A02](performance-a02.md) để so trước/sau và giới hạn. `tests/performance_profile.php` nhận một session fixture qua stdin, chỉ chạy CLI/DB test, dùng MariaDB session profiling và chỉ xuất timings/counts; không ghi SQL hoặc session vào report.


`python tests/performance_local.py --apache` thêm lựa chọn Windows/Apache riêng (mặc định C:/xampp/apache/bin/httpd.exe, có thể đặt APACHE_HTTPD), PHP FastCGI 8.3–8.5 từ PATH, private config/ini, cổng localhost 8090/8091. Không sửa XAMPP đang chạy hoặc config database ứng dụng. Kiểm runtime/persistence thật, smoke public/private paths và CSRF/attempt denial trước tải; dừng processes riêng sau chạy. Không chạy song song runner CGI/Apache. Kết quả performance.json được ghi đè bởi lượt mới nhất, nên giữ bản có tên riêng khi so sánh runtime. Apache local không thay staging hoặc full regression qua Apache.


Chrome flashcard lesson: fixture một bài chỉ có thẻ tự đánh giá trong DB test, kiểm Enter/Space, first response sau reload, offline không giả flip thành công, reconnect outbox, test-mode HTML/API không lộ modelAnswer trước finish, và score/max/isCorrect null sau finish. Snapshot screenshot ở `artifacts/lesson-flashcard-360.png`; không phải nội dung khóa học thật. Hồi quy flashcard không chạy lại benchmark hoặc restore.


A10 bổ sung Chrome/CDP: menu Enter/Escape + focus, skip link/main landmark, tên textbox ghi nhớ, mặt thẻ ẩn vắng trong accessibility tree, focus heading dưới sticky header và status static. Xem [accessibility-a10.md](accessibility-a10.md) cho kết quả/phạm vi/checklist thủ công. CDP không phát âm và không thay NVDA/VoiceOver; không suy diễn flags này thành WCAG pass toàn website.


## Container runtime A12 — bổ sung 22/10/2026

`tests/container_smoke.py IMAGE` dùng Docker tạo network/MariaDB/web riêng và kiểm image đóng gói: runtime, migrations, admin stdin/hash/role, seed, HTTP public/Secure cookie/private path denial, worker/SQL backup và media restore hash không rỗng. Không phải login HTTPS hoặc full SQL restore trong container. Chỉ xóa tài nguyên nó tạo; report không chứa credentials. Workflow build image rồi chạy script và upload JSON; xóa report cũ trước test để tránh evidence stale. [Phạm vi, lệnh và giới hạn](container-a12.md).

Local chưa có Docker nên chỉ qua Python syntax, PHP snippets lint, composer validate và kiểm đường lỗi thiếu Docker. Chưa có kết quả container hoặc CI từ xa, không thay report hồi quy local bằng kết quả giả.


Bổ sung review isolation: product_http hoàn thành preview bằng skip rồi gọi trực tiếp review/concept, xác nhận 422 và số thẻ không đổi; đăng ký trong guest session chưa claim vẫn 422/queue rỗng; sau claim + finish thì thêm được, retry không trùng, account khác 404. Chrome hoàn thành preview có câu sai và kiểm không hiện nút thêm vào ôn; report có previewReviewIsolation. Không sửa/xóa các thẻ lịch sử trong database ứng dụng.
