# Một chút English — PHP

Website học tiếng Anh chạy trực tiếp trên PHP 7.3 trở lên (khuyến nghị PHP 8.x).
Không cần npm, Node.js, build hoặc cơ sở dữ liệu trên hosting.

## Đưa lên hosting

Đặt các file sau vào thư mục gốc website (Document Root) của tên miền:

- `index.php`
- `.htaccess` (cần bật hiển thị file ẩn trong File Manager)
- thư mục `assets/` và toàn bộ nội dung bên trong

Ví dụ nếu Document Root là `domains/motchutenglish.com/public_html`, đặt
`index.php` trực tiếp trong `public_html`. Nếu Document Root là
`domains/motchutenglish.com`, đặt file tại đó.

Trang chủ chạy bằng `index.php`; nếu còn `index.html` của bản cũ, đổi tên
file đó để tránh hosting hiển thị nhầm trang cũ. Bật PHP cho tên miền trong
bảng quản trị hosting. Không upload `node_modules` hoặc `.next`.

Routes: `/courses`, `/courses/beginner/hello`, `/listening/coffee`,
`/placement`, `/toeic`, `/dashboard`. Deploy at the domain Document Root.
Apache/LiteSpeed requires mod_rewrite and .htaccess overrides enabled.
Upload `.htaccess` with `index.php` and `assets/`.
Legacy `/index.php?page=courses` redirects permanently to `/courses`.
Nginx: use `try_files $uri $uri/ /index.php?$query_string;` in location `/`
with the hosting PHP handler.

## Chạy thử tại máy

Nếu máy đã cài PHP:

```powershell
php -S localhost:8080 router.php
```

Mở http://localhost:8080. Không cần chạy `npm run build`.

## Nội dung và chức năng

- Chỉnh bài học, bài nghe, câu hỏi trong `assets/courses.json`.
- Giao diện trong `assets/style.css`.
- Nghe bằng giọng đọc trình duyệt, kiểm tra đáp án, lọc lớp/bài nghe,
  kiểm tra trình độ 6 câu và lưu tiến độ trong `assets/app.js`.
- Tiến độ dùng cùng khóa localStorage `mce-progress` của phiên bản cũ;
  được giữ khi dùng cùng trình duyệt và cùng origin (giao thức, tên miền, cổng).
- Không có tài khoản hoặc đồng bộ giữa các thiết bị. JavaScript cần bật
  để dùng các chức năng tương tác. Giọng đọc tùy trình duyệt/thiết bị.

Mã nguồn Next.js cũ (`app`, `components`, `lib`, các file cấu hình npm) được
để lại để đối chiếu. Bản PHP hoạt động độc lập với các file đó. Chỉnh nội dung
bản PHP tại JSON; sửa `lib/courses.ts` không tự cập nhật bản PHP.

## Đẩy lên Git

```powershell
git add index.php router.php .htaccess assets README.md
git commit -m "Add PHP version for shared hosting"
git push
```

Nếu hosting tự kéo Git vào đúng Document Root và đã bật PHP, bản này chạy
trực tiếp sau khi cập nhật. Nếu chưa thiết lập tự triển khai, upload các file
PHP, .htaccess và assets như hướng dẫn trên.
