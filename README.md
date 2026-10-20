# Một Chút English

Ứng dụng học tiếng Anh cho người Việt, PHP MVC/PDO và MariaDB. Code hiện hữu và lịch sử cũ được giữ lại; hệ thống học mới dùng các bảng `mce_`. Không cần Node hoặc build frontend để chạy website. Node/Chrome chỉ phục vụ kiểm thử trình duyệt.

## Chạy local Windows/XAMPP

Bật MySQL trong XAMPP. Copy `config-example/database.php` sang `application/config/database.php`, điền database local. Không đưa file này lên Git. PHP hỗ trợ >=8.3 <8.6, cần pdo_mysql, mbstring, intl, fileinfo; `php-local.ps1` bật extension cục bộ nếu DLL có sẵn.

```powershell
.\php-local.ps1 database/setup-local.php
.\php-local.ps1 database/check.php
.\php-local.ps1 database/create-admin.php --local
.\php-local.ps1 database/seed-product.php --publish-reviewed-samples
.\start.ps1
```

Nếu PowerShell chặn script theo policy của máy, chạy từng lệnh bằng `powershell -NoProfile -ExecutionPolicy Bypass -File .\php-local.ps1 ...` hoặc launcher `powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1`; không đổi policy toàn máy.

Mở http://localhost:8080. CLI `create-admin` in vị trí tệp mật khẩu riêng trong `writable/`, không có mật khẩu seed cố định. Trên production dùng chế độ nhập tương tác, không dùng `--local`. Nếu đã có admin, không tạo lại. Mẫu seed mặc định là draft; flag xuất bản chỉ dành cho nội dung mẫu đã được người vận hành xem xét. Bản nháp nghe thiếu file vẫn không được xuất bản.

Trang chính: `/lo-trinh`, `/hoc`, `/on-tap`, `/so-tu-vung`, `/tien-do`, `/tai-khoan`, `/reward-shop`. CMS `/admin/lessons`; có lộ trình, chương, bài, câu hỏi, từ, bộ từ, kiến thức, media, import, báo lỗi, roles, settings, audit, vận hành. Luồng cũ `/courses`, `/listening`, `/dashboard` vẫn được giữ để tương thích.

## Lệnh vận hành

```powershell
.\php-local.ps1 database/migrate.php
.\php-local.ps1 database/worker.php tick
.\php-local.ps1 database/worker.php run 50
.\php-local.ps1 database/worker.php cleanup
.\php-local.ps1 database/worker.php reconcile
```

Email mặc định tắt và UI báo đúng trạng thái. Để thử email, đặt `MAIL_DRIVER=log` trong môi trường development rồi chạy worker; liên kết chỉ nằm trong tệp private. Production bắt buộc SMTP thật. Biến môi trường xem `.env.example`; ứng dụng PHP không tự đọc `.env`.

## Kiểm thử

```powershell
$env:THREADED_TESTS='1'
$env:BROWSER_TESTS='1'
$env:PERFORMANCE_TESTS='1'
$env:RESTORE_TESTS='1'
$env:MYSQLDUMP_BIN='C:\xampp\mysql\bin\mysqldump.exe'
$env:MYSQL_BIN='C:\xampp\mysql\bin\mysql.exe'
python tests/run_auth.py
```

Runner tạo database riêng `mce_auth_test_*`, không reset database ứng dụng. Cần quyền CREATE DATABASE cho local test. Database kiểm thử được giữ để kiểm tra; không chạy suite bằng tài khoản production. Báo cáo và ảnh ở `docs/artifacts/`.

## Tài liệu

- [Kiến trúc](docs/architecture.md), [quyết định](docs/decisions.md), [dữ liệu](docs/data-model.md).
- [Biên tập và import](docs/content-authoring.md), [API](docs/api.md).
- [Deploy, worker, backup, restore](docs/operations.md), [kiểm thử](docs/testing.md).
- [Đối chiếu spec](docs/spec-traceability.md), [tiến độ và điều kiện ra mắt](docs/progress.md).

Dockerfile/Compose và CI là cấu hình chuẩn bị cho staging; chưa có staging/production được triển khai trong phiên làm việc này. Cần domain, hosting, HTTPS, SMTP, lịch backup ngoài máy, media hợp lệ và nội dung pháp lý do chủ dự án duyệt.
