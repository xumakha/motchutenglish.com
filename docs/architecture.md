# Kiến trúc

Giữ ứng dụng PHP MVC hiện có, PDO với engine MySQL-compatible InnoDB. Không thêm Node/Next.js. Local kiểm thử trên PHP CLI 8.5.11 và XAMPP MariaDB 10.4.32; đây là phiên bản quan sát trên máy, không phải đề xuất phiên bản production. Cần chốt và kiểm thử engine/version production trước staging.

Learning controller xử lý HTTP/auth/CSRF và CMS. Learning library chấm điểm và ghi completion, domain event cùng ledger trong một transaction. Row lock ở attempt bảo vệ nộp đồng thời; unique reward event key chống nhận lại first-completion/pass. Chưa có async worker hay outbox dispatcher.

Session chỉ lưu danh tính, role đọc lại DB mỗi request. Trang riêng no-store và noindex. Nội dung được escape, không nhận HTML tùy ý. Các trang học cũ dùng JSON/client vẫn được giữ nguyên.
