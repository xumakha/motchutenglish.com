# A12 — bổ sung kiểm container/CI, 22/10/2026

> Ghi chú 24/10/2026: tài liệu này mô tả bản PHP (tag `php-final`), không phải app Next.js hiện tại. Triển khai hiện nay: [operations.md](operations.md).

Đã chuẩn bị smoke test cho image đóng gói và bổ sung workflow. **Chưa build hoặc chạy container tại local, chưa chạy CI từ xa**: máy hiện không có Docker CLI trong PATH hoặc các vị trí Docker Desktop đã kiểm tra. A12 vẫn mở ở bước xác minh runtime container.

## Khoảng trống đã sửa trong pipeline

Job container trước đây chỉ build image và backup thư mục media rỗng. Nay job build image, chạy `docker compose config --quiet` với giá trị test, rồi gọi `python3 tests/container_smoke.py mce-runtime-check`.

Smoke script tạo network riêng, MariaDB 10.11 riêng và container web từ image đã build, cổng HTTP ngẫu nhiên chỉ bind 127.0.0.1. Mật khẩu test sinh ngẫu nhiên, chuyển bằng environment/stdin, không nằm trong argv hoặc report. Chạy CLI bằng www-data. Khi kết thúc/lỗi, chỉ xóa exact container/network IDs do lượt đó tạo; không dùng prune hoặc xóa volume Compose có sẵn.

| Nhóm | Kiểm tra đã viết, còn chờ chạy với Docker |
|---|---|
| Runtime đóng gói | PHP hỗ trợ, Python, extensions, production Secure cookie/display_errors, quyền writable; không có config riêng/.env/tests/docs trong image |
| Schema | Migration mới, migration lặp, database/check.php bằng www-data |
| Admin/seed | Password stdin, không ghi đè admin trùng, kiểm hash/role qua CLI, seed mẫu được duyệt |
| HTTP production | Health, home/catalog/login/CSS; cookie Secure/HttpOnly/SameSite=Lax; chặn application/database/writable/tests/.env |
| Worker/SQL | Tick/run và SQL backup bằng user dịch vụ |
| Media | Fixture không rỗng, backup/restore vào thư mục mới, so SHA-256, giữ media nguồn |
| Cleanup/evidence | Cleanup tài nguyên riêng, report passed/failed/check labels/runtime không chứa credentials |

HTTP smoke giữ SESSION_SECURE=1 như image production; chưa có proxy TLS nên không thử login qua HTTP. Admin được xác minh bằng CLI, không coi đó là kiểm login HTTPS. SQL trong container mới kiểm backup, chưa restore SQL đầy đủ. Workflow integration riêng vẫn chạy restore tests; native install A12 trước đó đã có drill SQL local. Không coi các môi trường là tương đương.

Dockerfile kiểm thêm extension openssl theo composer contract. Workflow có bước xóa report cũ trước khi chạy và upload report sau chạy bằng [actions/upload-artifact](https://github.com/actions/upload-artifact), tránh nhầm evidence đã commit từ local với kết quả CI mới. Chỉ chọn JSON reports; không upload writable hoặc dumps.

## Cách chạy trên máy có Docker

Tại repo root, trên môi trường có Docker daemon và Python:

```bash
docker build -t mce-runtime-check .
python3 tests/container_smoke.py mce-runtime-check
```

Windows dùng `python` nếu không có lệnh python3. Script sẽ kéo mariadb:10.11 nếu chưa có; cần mạng/disk/quyền Docker tương ứng. Không đưa Docker socket vào web container. Script không build image, push image hoặc deploy ứng dụng; lệnh build ở trên và CI thực hiện riêng.

Khi thực sự chạy, report được ghi tại `docs/artifacts/container-smoke-report.json`; failedCheck chỉ tên bước, không in output có thể chứa dữ liệu nhạy cảm. Nếu cleanup lỗi, runner báo thất bại để kiểm tra tài nguyên của lượt đó. Khi không có Docker CLI, runner thoát lỗi trước khi tạo report, không sinh kết quả pass giả.

## Kiểm tra đã chạy tại local

- Python AST/syntax của runner hợp lệ.
- Ba PHP snippets nhúng trong runner đã qua php -l.
- composer validate --no-check-publish đạt.
- git diff --check cho Dockerfile/workflow đạt.
- Chạy smoke runner tại local đã xác nhận thông báo Docker CLI required và exit khác 0; không có container test nào được chạy.

Chưa parse Compose bằng Docker tại local hoặc nghiệm thu build, HTTP container, rights/volumes, MariaDB 10.11 hay CI mới. Không chạy lại hồi quy ứng dụng/performance/restore trong lượt này vì không sửa logic ứng dụng. Kết quả hồi quy local trước đó vẫn có ngày riêng trong progress.
