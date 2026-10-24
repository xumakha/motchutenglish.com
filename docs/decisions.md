# Quyết định kỹ thuật

1. Next.js 16 + TypeScript thay PHP MVC (quyết định D1–D6, 23/10/2026, trong [kế hoạch chuyển đổi](migration/nextjs-typescript-plan.md#8-decisions-needed-from-the-owner)). Bản PHP ở tag `php-final`. Giữ nguyên hành vi, URL và giao diện; sửa 24 lỗi đã liệt kê. `legacy/nextjs` là bản Next.js cũ hơn, chỉ để tham chiếu.
2. Node 24, MariaDB 10.11 (CI). Drizzle ORM, Better Auth (phiên trong DB, cookie theo phiên trình duyệt), zod cho mọi input, Luxon cho ngày giờ theo timezone. Thư viện chính (next, react, better-auth, drizzle-orm, zod, mysql2) được ghim phiên bản chính xác.
3. Nội dung blocks/exercises nằm trong JSON document có schemaVersion; version/exercise IDs bất biến trong snapshot. Entries/senses được biểu diễn mỗi row vocabulary là một nghĩa (lemma có thể lặp), bộ từ và quan hệ many-to-many là bảng riêng. Đây là mô hình tương đương, không ép tách bảng khi chưa có nhu cầu độc lập.
4. Published lesson/article không sửa tại chỗ. Sửa tạo draft; editor gửi duyệt, admin xuất bản. Xóa nội dung dùng archive để giữ lịch sử. Published metadata sửa qua entity drafts.
5. Chấm và cộng thưởng trên server; self/flashcard không tạo độ chính xác khách quan. Practice phản hồi sau nộp, test giữ kín tới finish. Placement20 câu mẫu chưa hiệu chuẩn, không suy diễn chứng chỉ/TOEIC.
6. Review dùng UTC elapsed time, 1 ngày lịch ôn bằng24h; ngày quest/streak theo frozen user timezone. Đổi timezone có cooldown và hiệu lực tại ranh giới ngày tiếp theo. Ledger lưu rule_version, không retroactive XP.
7. Hàng đợi trong DB (`mce_jobs`) và Cache Components (`"use cache"` + tag `catalog`) thay Redis. Media lưu local riêng tư qua adapter `AssetStorage`; object storage để sau. S3, AI tutor, payment, speaking scoring, teacher dashboard ngoài scope bản đầu.
8. Import atomic, chỉ tạo draft, từ chối duplicate, không tự cập nhật nội dung. Không có nút explicit-update nên không có thao tác ghi đè published ẩn. Batch>100 chạy worker; tối đa1000/1MB.
9. Analytics ngoài chỉ sau opt-in và cấu hình, whitelist payload không có email/notes/answers. SMTP và audio thiếu thì báo unavailable; không có thành tích, học viên hoặc network success giả.
10. Production deploy là bước độc lập: xem [operations.md](operations.md). Kiểm thử local và CI không thay thế bằng chứng staging.

Nguồn: https://mariadb.org/about/ . GA4 contract: https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference . Không có dữ liệu gửi bên ngoài trong bộ test mặc định.
