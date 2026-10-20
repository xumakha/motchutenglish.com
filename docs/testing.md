# Kiểm thử thực tế - 20/10/2026

Môi trường: PHP CLI 8.5.11, XAMPP MariaDB 10.4.32, Python 3.13. Database test riêng với tên mce_auth_test_*; không dùng database học thật. Database test giữ lại để kiểm tra.

    php tests/learning.php
    python tests/run_auth.py
    php database/check.php

Đã đạt:
- Grading stable IDs, đảo thứ tự, snapshot JSON, response không hợp lệ.
- Editor tạo/sửa draft, preview chấm thử, admin publish, editor publish 403, published không sửa.
- Learner không vào admin/preview; user khác đọc/nộp attempt trả 404.
- CSRF, GET start 405, request key dùng lại không tạo thêm lượt; key của user khác trả 409.
- Không render explanation/answer key trước nộp; escape script trong nội dung.
- Source bị thay đổi vẫn chấm theo snapshot cũ.
- Retry cùng response giữ kết quả; response khác 409.
- Hai PHP process với PDO độc lập nộp cùng một lượt: chỉ một completion event; tổng XP vẫn 25 sau nhiều lượt học.
- Seed chạy hai lần giữ một seed key; publish lặp có một audit event.
- Đăng ký/đăng nhập/logout, password hash, session rotation, rate limit, 26 public routes, 8 assets và legacy redirects.

Lần chạy đạt lưu database mce_auth_test_fab19ea4b8c4; lần chạy cuối có thể tạo tên mới. Lint PHP và git diff --check được kiểm tra sau chỉnh sửa.

Chưa có kiểm thử trình duyệt trực quan/keyboard, performance, restart DB, restore backup hoặc staging trên MySQL production. Chưa nghiệm thu các yêu cầu giai đoạn 2/3.
