# Kiểm thử và bằng chứng

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
