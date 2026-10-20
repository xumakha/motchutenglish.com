# Kiến trúc

PHP MVC hiện hữu được mở rộng, không chuyển framework. `index.php` khởi tạo session, request ID, error boundary và router. `Product` phục vụ trang SSR và `/api/v1/*`; cùng service xử lý form POST và JSON. `Learning` giữ tương thích luồng cũ.

`Assessment` chịu trách nhiệm schema, normalize, grading và redaction. `Content` quản lý phiên bản, workflow, import, media; `Study` quản lý attempts, snapshots, optimistic revision và thời gian tương tác. `Review` quản lý thẻ và lịch UTC. `Motivation` quản lý events, ledger, quest, streak, shop. `Identity` quản lý token/email/ẩn danh, `Exports` tạo tệp riêng qua queue. Các adapter `MailTransport`, `AssetStorage`, `MarketingAnalytics` cô lập dịch vụ ngoài.

MariaDB/PDO là nguồn sự thật. Transaction, FK, unique key và profile row lock bảo vệ tiến độ/phần thưởng/số dư. Isolation READ COMMITTED tránh đọc số dư cũ sau khi chờ lock. Deadlock có retry giới hạn. Catalog công khai dùng cache file TTL300 giây với generation invalidation; dữ liệu cá nhân không nằm trong cache công khai.

Lesson document chứa versioned blocks và exercises có type discriminator. Stable lesson ID liên kết nhiều immutable published versions. Attempt trỏ version, giữ presented order, responses và revision. Đổi bản xuất bản không làm đổi phiên đang học. Test mode chỉ trả đáp án sau finish, kể cả khi export cá nhân.

Frontend dùng HTML/CSS/native JavaScript, không phụ thuộc API AI. Player sinh DOM an toàn, lưu draft trên server và local outbox khi offline; reconnect gửi từng mutation với revision. Xung đột trả409 kèm attempt mới để người học quyết định tiếp tục. Local storage không được xem là điểm số đáng tin cậy.

Queue DB có worker CLI, khóa chạy, backoff/dead-letter, event key chống lặp. Cron tick đánh giá streak/nhắc học; worker xử lý SMTP/import/export/xóa/analytics. Không coi việc enqueue là email đã gửi. Mail giao dịch không rõ trạng thái sau transport failure không tự gửi lại để tránh lặp.

Local dùng XAMPP MySQL và launcher CGI nhiều request. Production dùng Apache/PHP-FPM tương đương, storage persistent private và cron. Dev server không phải production server. Source, DB, media, secret config là các thành phần rollback/restore riêng.
