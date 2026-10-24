# Vận hành, deploy và phục hồi

Ứng dụng là Next.js (Node 24) + MariaDB 10.11. Production chạy bằng `compose.yaml`: `db`, `migrate` (chạy một lần), `web` (cổng `127.0.0.1:3000`) và `worker`. Bản PHP cũ nằm ở git tag `php-final`.

## Local

```bash
cp .env.example .env.local      # điền DATABASE_URL, BETTER_AUTH_SECRET (openssl rand -hex 32)
pnpm install
pnpm db:reset                   # tạo lại database local rồi migrate (từ chối khi APP_ENV=production)
pnpm admin create admin@example.test "Quản trị" --local   # mật khẩu ngẫu nhiên ghi vào writable/local-admin-*.txt
pnpm seed --publish-reviewed-samples
pnpm dev                        # http://localhost:3000
pnpm worker run                 # xử lý job (email ghi vào writable/mail khi MAIL_DRIVER=log)
```

`.env.local` và `writable/` không vào Git. Xem `.env.example` cho mọi biến.

## Cài mới production bằng Docker

1. Tạo `.env` cạnh `compose.yaml` (không commit):

   ```bash
   APP_URL=https://ten-mien-that
   MCE_DB_PASSWORD=...           # openssl rand -hex 24
   MCE_DB_ROOT_PASSWORD=...
   BETTER_AUTH_SECRET=...        # openssl rand -hex 32
   MAIL_DRIVER=smtp
   MAIL_FROM=no-reply@ten-mien-that
   SMTP_HOST=...  SMTP_PORT=587  SMTP_ENCRYPTION=starttls  SMTP_USER=...  SMTP_PASSWORD=...
   ```

   Ứng dụng kiểm biến môi trường khi khởi động và dừng nếu sai (APP_URL phải là https, không dùng `MAIL_DRIVER=log`, SMTP cần `MAIL_FROM` và `SMTP_HOST`).

2. Build và chạy. `APP_URL` cũng là build argument vì trang dựng sẵn chứa URL tuyệt đối (canonical, Open Graph); đổi domain thì build lại.

   ```bash
   docker compose up -d --build
   docker compose ps               # migrate: exited (0); web: healthy; worker: running
   docker compose run --rm -T web node dist/admin.mjs check
   ```

3. Tạo quản trị viên. Mật khẩu đi qua stdin, không nằm trong argv hay history:

   ```bash
   read -r -s -p 'Mat khau admin: ' p; printf '\n'
   printf '%s' "$p" | docker compose run --rm -T web node dist/admin.mjs create admin@ten-mien "Quản trị viên"
   unset p
   ```

   Không dùng `--local` trên production. Cấp quyền cho tài khoản đã đăng ký: `node dist/admin.mjs set-role EMAIL admin|editor|learner`.

4. Nội dung mẫu (tuỳ chọn): `docker compose run --rm -T web node dist/seed.mjs --publish-reviewed-samples`.

5. Reverse proxy HTTPS (Caddy, nginx…) trỏ tới `127.0.0.1:3000`. Proxy phải **thêm** địa chỉ client vào `X-Forwarded-For`; giới hạn tần suất tin giá trị cuối cùng của header này.

Container chạy bằng user `node`, không phải root; chỉ `writable/` (volume `writable`: media, export, backup, mail log) ghi được. User MariaDB `mce` có toàn quyền trên database `motchutenglish` (cần cho migrate), không có quyền tạo database khác.

## Cập nhật phiên bản

```bash
docker compose run --rm -T web node dist/worker.mjs backup   # backup SQL trước
git pull && docker compose up -d --build                      # migrate chạy trước web/worker mới
```

Migration chỉ thêm (additive). Kiểm trên bản sao staging trước khi áp dụng production.

## Worker và lịch chạy

Container `worker` chạy `ops/worker-loop.sh`:

| Khi nào | Lệnh |
|---|---|
| Mỗi phút | `node dist/worker.mjs run 50` — email, nhắc học, export, import lớn, xoá tài khoản, analytics |
| Mỗi 5 phút | `node dist/worker.mjs tick` — chốt ngày streak, xếp nhắc học theo giờ địa phương |
| Hằng ngày sau 03:15 UTC | `cleanup`, backup SQL, backup media |

Không có Docker thì đặt các lệnh trên vào cron với cùng biến môi trường (dòng cron mẫu trong `README.md`). `node dist/worker.mjs reconcile` dựng lại số dư thưởng từ ledger khi cần.

Mỗi lúc chỉ một worker chạy (`GET_LOCK('mce_worker')` trên kết nối riêng); worker thứ hai trả `{"busy":true}`. Worker bị ngắt giữa chừng thì lần chạy sau phục hồi:

- Import/export đã `committed`/`ready`, nhắc học đã `sent`/`skipped`: đánh dấu xong, không làm lại.
- Import, export, xoá tài khoản bị ngắt: thử lại có backoff (tối đa 5 lần).
- Email, nhắc học, analytics chưa rõ đã gửi hay chưa: `failed` với lỗi "Delivery uncertain", **không tự gửi lại**. Đối chiếu với nhà cung cấp SMTP trước khi xử lý tay. Nút retry trong `/admin/operations` từ chối các job này.

Kiểm thử: `tests/integration/jobs-recovery.test.ts` (giết worker thật giữa job rồi chạy lại).

## Email và analytics

- `MAIL_DRIVER=disabled` (mặc định): giao diện báo email chưa bật.
- `log`: chỉ development/test, mỗi email là một tệp JSON riêng tư trong `writable/mail`, xoá sau 7 ngày.
- `smtp`: chỉ STARTTLS hoặc TLS, kiểm chứng chỉ, timeout 15 giây. Nếu kết nối hỏng sau khi máy chủ đã bắt đầu nhận nội dung thư, job là "delivery uncertain".

Link trong email (xác minh, đặt lại mật khẩu, huỷ nhắc học) chứa token được tạo lúc gửi; job chỉ lưu id. GA4 chỉ gửi khi có cả `GA4_MEASUREMENT_ID`, `GA4_API_SECRET` và người học đồng ý; sự kiện quá 72 giờ bị bỏ, không gửi lại.

## Backup, restore và retention

```bash
docker compose run --rm -T web node dist/worker.mjs backup                 # in {"file": ".../backup-*.sql"}
docker compose run --rm -T web python3 ops/media-backup.py backup           # in {"file": ".../media-*.tar.gz"}
# Restore drill: dựng vào database mới mce_restore_test_*, so số dòng, không đụng database đang chạy.
# Cần quyền CREATE DATABASE, nên chạy bằng tài khoản root của MariaDB:
docker compose run --rm -T -e DATABASE_URL="mysql://root:$MCE_DB_ROOT_PASSWORD@db:3306/motchutenglish" web node dist/worker.mjs restore-drill /app/writable/backups/backup-....sql
docker compose run --rm -T web python3 ops/media-backup.py restore /app/writable/backups/media-....tar.gz   # bung vào thư mục mới
```

Mật khẩu database đi qua biến `MYSQL_PWD`, không nằm trong argv. Tệp backup có quyền 0600 và nằm trong volume `writable`, nên **phải sao chép ra ngoài máy** (mã hoá, kiểm hash, cảnh báo khi thất bại). `cleanup` xoá backup cũ hơn 30 ngày. Mục tiêu đề xuất: RPO 24 giờ, RTO 4 giờ, chỉ xác nhận sau drill trên staging với dữ liệu thật.

Retention do `cleanup`: export 24 giờ; lượt học của khách 30 ngày; mail log 7 ngày; job xong 30 ngày; job lỗi quá 7 ngày bị xoá payload (job đang chờ không bao giờ bị xoá, chỉ cảnh báo khi trễ quá 1 giờ); token và phiên hết hạn quá 7 ngày; bộ đếm giới hạn tần suất quá 1 ngày. Xoá tài khoản: phiên bị thu hồi ngay, worker xoá dữ liệu riêng và ẩn danh hoá hàng `users`.

## Rollback

Chưa có người dùng thật và schema đã đổi, nên rollback về PHP nghĩa là deploy lại tag `php-final` với database dựng mới từ seed PHP. Rollback giữa các phiên bản Next.js: chạy lại image trước đó; migration chỉ thêm nên image cũ vẫn chạy. Nếu dữ liệu hỏng: restore backup vào database mới, kiểm đăng nhập/lịch sử/hàng đợi, rồi mới đổi `DATABASE_URL`. Dừng worker cũ trước khi chuyển.

## Giám sát

- `/health` trả 200 khi web chạy (không chứa thông tin nhạy cảm); Docker dùng nó làm healthcheck.
- Log đi ra stdout/stderr (`docker compose logs web worker`). Lỗi được ghi kèm request id và không chứa SQL, tham số hay giá trị người dùng (`src/server/log.ts`).
- Nên cảnh báo khi: HTTP 5xx, database không kết nối được, `cleanup` báo job chờ trễ quá 1 giờ, job lỗi, ổ đĩa đầy, backup cũ hơn 26 giờ, SMTP lỗi.
- `/admin/operations`: số liệu hàng đợi, job lỗi, báo cáo chiến dịch.

## Kiểm thử vận hành

`bash tests/ops/container_smoke.sh` (cần Docker): cài mới compose trên database trống, kiểm trang, CLI admin và seed, worker, backup SQL + restore drill, backup media, user không phải root. CI chạy script này trong job `container`.

## Còn cần từ chủ dự án

Domain, hosting có Docker, HTTPS và reverse proxy, nơi lưu backup ngoài máy, SMTP, nơi nhận cảnh báo, nội dung pháp lý đã duyệt, nguồn/giấy phép audio, GA4 nếu bật. Chưa có staging/production nào được triển khai.
