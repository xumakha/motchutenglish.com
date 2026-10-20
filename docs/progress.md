# Tiến độ - 20/10/2026

## Trạng thái hiện tại
Đang triển khai và rà soát toàn bộ bản phát hành đầu tiên theo `docs/specification.md`. Không coi việc có màn hình là đã nghiệm thu. Chưa triển khai production hoặc đăng ký dịch vụ ngoài.

## Đã có code và đã chạy các luồng dữ liệu thật
- PHP MVC hiện hữu được giữ lại; MariaDB/PDO, schema bổ sung và migrations có registry. Không xóa tài khoản, catalog hoặc kết quả cũ.
- Lộ trình/chương, lesson ID ổn định, phiên bản bất biến, workflow draft/in_review/published/archived, preview cùng player và grading engine.
- Player nhiều câu: choice, true/false, fill, order, match, correction, closed answer, self assessment, flashcard, listening choice/fill khi có audio hợp lệ. Bài tự đánh giá giữ điểm null.
- Snapshot phiên bản, thứ tự trình bày, draft/resume, revision/409 có trạng thái mới, retry cùng response idempotent, first/best score, thời gian tương tác ước tính, giữ draft khi mất mạng.
- Học thử khách và xác nhận chuyển bài sau đăng ký; server giữ/chấm dữ liệu, không nhập điểm do client khai.
- Onboarding, 20 câu gợi ý cố định chưa hiệu chuẩn, lộ trình không khóa và gợi ý bài tiếp theo.
- Từ vựng theo nghĩa/chủ đề, ghi chú riêng, thẻ ôn đến hạn, bốn ratings, reset/ẩn/lịch sử và thuật toán UTC version 1.
- Domain events, XP/xu ledger, quest snapshot, streak/vé nghỉ, badges, shop trang trí, cân bằng lại ledger; tắt gamification không chặn học.
- Quản trị paths/units/lesson versions/questions/vocabulary/articles, media kiểm MIME, báo lỗi, role, cấu hình an toàn và audit.
- JSON/CSV dry-run, atomic commit, chống trùng, commit lớn đưa vào DB queue, export nội dung không kèm dữ liệu học viên.
- Xác minh/reset/đổi mật khẩu/đổi email, thu hồi session, opt-in reminder/unsubscribe, export cá nhân và job xóa/ẩn danh.
- SEO render server, canonical/noindex, sitemap/robots, breadcrumb; số liệu vận hành/cohort từ DB. Adapter GA4 opt-in, mặc định tắt, chưa xác nhận gửi thật.

## Nội dung mẫu
15 bài học/checkpoint thật thuộc 2 lộ trình x 2 chương, mỗi chương ít nhất 3 bài và có checkpoint cuối chương. Ngoài ra có 1 bài kiểm tra gợi ý 20 câu và 2 bản nháp nghe cần audio. Tổng 90 exercises, tối thiểu 2 ví dụ/type, 40 nghĩa từ trong 4 chủ đề và 3 bài kiến thức gốc. Seed idempotent, không tạo học viên hoặc thành tích giả. Hai lộ trình mở rộng không có bài thì không quảng cáo là sẵn sàng.

## Bằng chứng đã chạy
- Bộ kiểm thử HTTP + database riêng đã chạy qua luồng học, quyền, CSRF, IDOR, idempotency, notes, review, shop đồng thời và import.
- Mail sink local đã kiểm tra xác minh, reset một lần, đổi email, thu hồi session, reminder/unsubscribe và job xóa dữ liệu.
- Chrome đã chạy ở 360/390/768/1440px và kiểm tra khách học/nộp bằng bàn phím, xem kết quả, đăng ký rồi xác nhận import; xem `docs/artifacts/browser-report.json`.
- Bài đo local trước các thay đổi cuối: 50 phiên, p95 739.89 ms, 0/50 lỗi; xem `docs/artifacts/performance.json`. Không phải kết quả staging.
- Dump SQL đã restore vào DB mới và kiểm tra đăng nhập, catalog, progress, attempt history sau khi đổi PHP process: 1.042 giây với dataset test nhỏ; xem `docs/artifacts/restore-report.json`.

## Đang hoàn thiện trước khi báo hoàn tất
- Chạy lại toàn bộ hồi quy sau các bổ sung cuối (media, CSV/queue import, immutable versions, lịch ngày và analytics consent).
- Rà soát yêu cầu theo từng mục/acceptance case, cập nhật tài liệu setup/deploy/retention và báo cáo cuối.
- Cấu hình CI và container MariaDB 10.11/PHP được chuẩn bị; chưa có kết quả chạy CI/staging từ xa.

## Cần chủ dự án cung cấp trước ra mắt
Domain/hosting/HTTPS, runtime MariaDB được hỗ trợ, SMTP thực, media/audio có quyền sử dụng, thông tin đơn vị vận hành và nội dung pháp lý được duyệt. Chưa có các thông tin này thì UI không báo email/audio/analytics ngoài đã hoạt động. XAMPP MariaDB 10.4 hiện chỉ dùng cho local compatibility test.

## Chạy local
Bật MySQL XAMPP, chạy `python tests/dev_server.py 8080` hoặc `./start.ps1`. CLI PHP có thể dùng `./php-local.ps1 database/check.php` để nạp intl/fileinfo cục bộ, không sửa PHP toàn máy.
Tài khoản quản trị local đã tạo bằng mật khẩu ngẫu nhiên; thông tin chỉ ở `writable/local-admin-b9d03e6e.txt` (không đưa lên Git). CMS mới: `/admin/lessons`; bài cũ: `/admin`.
