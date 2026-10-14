# Một chút English — PHP

Website PHP 8.x, MySQL, PDO MySQL và mbstring. Không cần Node.js hoặc build.

## Cấu trúc dự án

Áp dụng cách chia thư mục của dự án tham khảo `web-hen-ho`: `application`
chứa mã PHP theo Controller / Model / View; assets tách CSS, JS, ảnh, JSON.
Đây là ứng dụng PHP hiện tại được tổ chức lại, không yêu cầu cài CodeIgniter
hay các thư viện của website tham khảo.

```text
application/
  config/
    config.php          # Đọc cấu hình và biến môi trường
    database.php        # Thông tin database riêng, không đưa lên Git
    routes.php          # Bảng route
  controllers/          # Home, Courses, Listening, Pages, Auth
  core/                 # Bootstrap, router, database, render view
  helpers/              # URL, heading, thẻ khóa học, quiz, audio
  libraries/            # Phiên đăng nhập, CSRF và xử lý xác thực
  models/               # Đọc bài học và truy vấn tài khoản/MySQL
  views/
    layouts/            # Header, footer
    partials/           # Điều hướng tài khoản
    home/
    courses/
    listening/
    pages/              # TOEIC, kiểm tra trình độ, góc học tập
    auth/
    errors/
assets/
  css/style.css
  js/app.js
  images/logo.png
  json/courses.json
config-example/
  database.php          # Mẫu cấu hình để copy
database/              # Schema và script setup MySQL
writable/               # Phiên đăng nhập, log test; không đưa lên Git
legacy/nextjs/          # Mã Next.js cũ để đối chiếu
tests/                 # Kiểm tra HTTP và authentication
index.php               # Điểm vào website, không chứa giao diện
router.php              # Router cho PHP server trên máy
.htaccess               # Route trên Apache/LiteSpeed
```

Các file favicon và `site.webmanifest` ở thư mục gốc theo đường dẫn công khai.

## Chỉnh sửa website

- Route: `application/config/routes.php`.
- Trang chủ: `application/views/home/index.php`.
- Header/logo/menu: `application/views/layouts/header.php`.
- Footer: `application/views/layouts/footer.php`.
- Bài học, bài nghe, câu hỏi: `assets/json/courses.json`.
- Giao diện: `assets/css/style.css`.
- Tương tác, nghe, quiz và tiến độ: `assets/js/app.js`.
- Truy vấn tài khoản: `application/models/User_model.php`.

Các route giữ nguyên: `/courses`, `/courses/beginner/hello`, `/listening`,
`/listening/coffee`, `/toeic`, `/placement`, `/dashboard`, `/login`,
`/register`, `/account`. Đăng xuất là POST `/logout`.
URL cũ `/index.php?page=courses` chuyển hướng 301 sang `/courses`.
Đường dẫn CSS/JS/JSON cũ cũng chuyển hướng sang vị trí mới.

## Cập nhật từ bản PHP trước

1. Upload `application/`, `assets/`, `index.php`, `.htaccess` và favicon.
2. Copy thông tin database cũ sang `application/config/database.php`.
   Mẫu ở `config-example/database.php`. Mã vẫn đọc `config.php` tại gốc
   nếu chưa có file cấu hình mới, để hỗ trợ chuyển đổi.
3. Nếu cấu hình cũ có `session_path`, sửa về thư mục có quyền ghi trên
   hosting. Có thể bỏ trường này để dùng nơi lưu phiên mặc định của PHP.
4. Không cần import lại database; các bảng và tài khoản giữ nguyên.
5. Các thư mục `includes/`, `storage/` và mã Next.js ở gốc không còn được
   ứng dụng sử dụng. Sau khi kiểm tra bản mới, có thể dọn các file cũ trên
   hosting. Không xóa database hoặc thông tin cấu hình chưa chuyển đổi.

## Cài mới trên hosting

1. Trong cPanel/DirectAdmin, tạo database MySQL và user, gán quyền cho user.
2. Dùng phpMyAdmin chọn database và import `database/schema.sql`.
3. Copy `config-example/database.php` thành `application/config/database.php`.
   Điền tên database, user, mật khẩu, host và cổng do hosting cung cấp.
   Dùng đúng tên đầy đủ có tiền tố tài khoản. Giữ `session_secure => true`
   khi hosting đã bật HTTPS.
4. Upload `index.php`, `.htaccess`, `application/`, `assets/`, favicon và
   `site.webmanifest` vào Document Root của tên miền. Không cần upload
   `legacy`, `tests`, `node_modules`, `.next`, hoặc chạy npm.
5. Mở tên miền, thử `/register`, `/account` và đăng xuất.

Database có hai bảng `users`, `auth_attempts`. Mật khẩu lưu bằng hash;
biểu mẫu có CSRF và giới hạn 15 lần gửi xác thực từ một IP trong 15 phút.
Tiến độ học vẫn lưu trên trình duyệt, chưa đồng bộ qua tài khoản.
`application/config/database.php` đã được gitignore; tạo file riêng trên
hosting, không copy tài khoản MySQL root từ máy tính lên hosting.

Apache/LiteSpeed cần mod_rewrite và cho phép `.htaccess`. Các thư mục nội
bộ được chặn truy cập HTTP. Với Nginx, đặt quy tắc chặn trước handler PHP:

```nginx
location ~ ^/(application|config-example|database|tests|writable|legacy|includes|storage|node_modules|\.git)(/|$) { deny all; }
location ~ ^/config(\.example)?\.php$ { deny all; }
location / { try_files $uri $uri/ /index.php?$query_string; }
```

Cấu hình xử lý PHP theo hosting. Website được đặt tại gốc tên miền.

## Chạy tại máy

```powershell
php -S localhost:8080 router.php
```

Mở http://localhost:8080. Database cục bộ đã có cấu hình riêng.
Khi cài ở máy mới, tạo cấu hình database trước rồi chạy:

```powershell
php database/setup-local.php
```

Script setup chỉ chạy CLI và cần quyền CREATE DATABASE/CREATE TABLE.
Nếu dùng `session_path`, tạo thư mục đó và cấp quyền ghi cho PHP. Cấu hình
máy hiện tại dùng `writable/sessions`.

## Kiểm tra và Git

```powershell
python tests/run_auth.py
git add -A
git commit -m "Organize PHP website into application MVC folders"
git push
```

Bài kiểm tra dùng database riêng `mce_auth_test_*` và giữ lại sau khi chạy.
Không chạy bài kiểm tra xác thực bằng database thật.
