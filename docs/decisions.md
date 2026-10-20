# Quyết định kỹ thuật

1. Giữ PHP MVC/PDO vì ứng dụng và dữ liệu hiện hữu đang dùng stack này. `legacy/nextjs` chỉ là tham chiếu; không dùng Next.js cho bản phát hành này.
2. Chọn PHP >=8.3 <8.6; Docker PHP8.5 và MariaDB10.11. XAMPP local10.4 là môi trường tương thích để phát triển, không là khuyến nghị production. CI MariaDB10.11 cần chạy trên remote trước ra mắt.
3. Nội dung blocks/exercises nằm trong JSON document có schemaVersion; version/exercise IDs bất biến trong snapshot. Entries/senses được biểu diễn mỗi row vocabulary là một nghĩa (lemma có thể lặp), bộ từ và quan hệ many-to-many là bảng riêng. Đây là mô hình tương đương, không ép tách bảng khi chưa có nhu cầu độc lập.
4. Published lesson/article không sửa tại chỗ. Sửa tạo draft; editor gửi duyệt, admin xuất bản. Xóa nội dung dùng archive để giữ lịch sử. Published metadata sửa qua entity drafts.
5. Chấm và cộng thưởng trên server; self/flashcard không tạo độ chính xác khách quan. Practice phản hồi sau nộp, test giữ kín tới finish. Placement20 câu mẫu chưa hiệu chuẩn, không suy diễn chứng chỉ/TOEIC.
6. Review dùng UTC elapsed time, 1 ngày lịch ôn bằng24h; ngày quest/streak theo frozen user timezone. Đổi timezone có cooldown và hiệu lực tại ranh giới ngày tiếp theo. Ledger lưu rule_version, không retroactive XP.
7. DB queue và file catalog cache thay Redis; local persistent storage là adapter được hỗ trợ. Driver ngoài local bị từ chối rõ thay vì giả thành công. S3, AI tutor, payment, speaking scoring, teacher dashboard ngoài scope bản đầu.
8. Import atomic, chỉ tạo draft, từ chối duplicate, không tự cập nhật nội dung. Không có nút explicit-update nên không có thao tác ghi đè published ẩn. Batch>100 chạy worker; tối đa1000/1MB.
9. Analytics ngoài chỉ sau opt-in và cấu hình, whitelist payload không có email/notes/answers. SMTP và audio thiếu thì báo unavailable; không có thành tích, học viên hoặc network success giả.
10. Production deploy là bước độc lập: chưa có domain/hosting/SMTP/media pháp lý để nghiệm thu staging. Cấu hình deploy và kiểm thử local không thay thế bằng chứng staging.

Nguồn xác định nền tảng: https://www.php.net/supported-versions.php ; https://mariadb.org/about/ . GA4 contract: https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference . Không có dữ liệu gửi bên ngoài trong suite mặc định.
