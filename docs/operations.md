# Vận hành

## Local XAMPP
Bật MySQL. Cấu hình application/config/database.php đã tạo riêng cho local, không được Git theo dõi. Không upload cấu hình root local lên hosting.

    php database/migrate.php
    php database/check.php
    php -S localhost:8080 router.php

Database mới cần tạo trước bằng hosting panel hoặc php database/setup-local.php (chỉ local). Mở http://localhost:8080/register, đăng ký rồi chạy:

    php database/set-role.php EMAIL admin
    php database/seed-learning.php

Vào /admin xem/sửa mẫu, preview, publish. Vào /hoc để học. Không có tài khoản admin mặc định hoặc mật khẩu hardcode.

## Backup và rollback
Trước migration, dùng mysqldump --single-transaction -u USER -p DATABASE > backup.sql. Mật khẩu nhập tương tác. Backup cả assets/media và cấu hình riêng ở nơi bảo mật. Tự động hóa backup, retention và mã hóa phải cấu hình theo hosting.

Restore vào database mới: tạo database trống rồi mysql -u USER -p NEW_DATABASE < backup.sql trong shell hỗ trợ redirect, sau đó kiểm tra users, lesson, snapshot và lịch sử trước đổi cấu hình. Chưa diễn tập restore trong phiên này.

Rollback code giữ nguyên các bảng bổ sung, không drop dữ liệu. Migration không ghi đè bảng hiện có. Production dùng HTTPS, session_secure=true và DB account có quyền tối thiểu. Chặn application/database/tests/docs và dotfiles trong web server; .htaccess dành cho Apache, router.php chỉ dành cho local.

Giai đoạn 1 không cần worker/cron. SMTP, nhắc học, analytics và storage ngoài chưa triển khai. Theo dõi PHP error log, không công khai log hoặc credentials.
