# Kiến trúc

Ứng dụng là một app Next.js 16 + TypeScript (App Router, Cache Components) chạy trên Node 24, dữ liệu trong MariaDB. Một process web (`pnpm start`, bản standalone) và một process worker riêng (`node dist/worker.mjs`, chạy bằng cron). Bản PHP cũ nằm ở tag `php-final`.

## Đường đi của một request

1. `proxy.ts` chạy trước mọi trang, Server Action và route handler: gắn request ID 16 hex (`X-Request-ID`), từ chối POST/PUT/PATCH/DELETE khác origin, chuyển URL cũ (`?page=`, `/index.php`, slug đã đổi) bằng 301, chuyển trang riêng tư sang `/login` (303) khi không có cookie phiên, trả 404/403 thật trước khi render (`src/server/content-exists.ts`, `src/server/private-access.ts`).
2. Form HTML gọi Server Action (`src/actions/routes.ts`). Player và client JS gọi `/api/v1/*` (`app/api/v1/[...route]` → `src/server/api.ts`). Cả hai đi qua cùng `runRoute` (`src/server/run-route.ts`): kiểm quyền → rate limit → zod input → handler (`src/server/handlers.ts`).
3. Handler gọi module nghiệp vụ trong `src/domain`. `Actor` (`src/server/actor.ts`) lấy từ phiên Better Auth hoặc cookie khách (chỉ lưu sha256).

Hợp đồng của mọi route nằm trong `src/contracts/routes.ts`. Xem [api.md](api.md).

## Module nghiệp vụ (`src/domain`)

- `assessment`: kiểm document, chuẩn hóa, chấm, ẩn đáp án. Golden file từ bản PHP (`tests/golden/assessment.json`) giữ kết quả giống hệt.
- `study`: attempt, snapshot phiên bản, revision lạc quan, guest claim, tiến độ.
- `content`: phiên bản bài, workflow duyệt, đề xuất, bộ từ, import, tìm kiếm (`mce_search` FULLTEXT).
- `review`: thẻ ôn, lịch UTC, giới hạn theo ngày địa phương.
- `motivation`: ledger, quest, streak, huy hiệu, shop.
- `identity`: hồ sơ, đổi timezone có hiệu lực trễ, nhắc học, email, xóa tài khoản.
- `exports`, `analytics`, `media`, `legacy`, `admin`, `jobs` (đưa job vào hàng đợi).

Module không đọc cookie hay header; dữ liệu request được truyền vào qua `Actor`.

## Dữ liệu

- Drizzle ORM + mysql2. Schema ở `src/db/schema`, migration ở `drizzle/`. Xem [data-model.md](data-model.md).
- `src/db/tx.ts`: transaction READ COMMITTED, thử lại tối đa 3 lần khi deadlock hoặc hết thời gian chờ khóa, đổi lỗi MySQL thành 409/422.
- Phiên kết nối dùng UTC. FK, unique key và khóa dòng profile bảo vệ tiến độ, phần thưởng và số dư. Chống lặp bằng `INSERT IGNORE` + kiểm số dòng bị ảnh hưởng.
- Catalog công khai và cài đặt site được cache bằng `"use cache"` + `cacheTag("catalog")`. Server Action gọi `updateTag("catalog")` sau khi sửa nội dung; `/api/v1` hết hạn tag ngay sau response (trễ vài ms). Dữ liệu cá nhân không vào cache.
- Media lưu riêng trong `writable/media` với tên ngẫu nhiên, phục vụ qua `/media/{id}` có kiểm quyền, Range và ETag. `AssetStorage` là adapter để sau này thay bằng object storage.

## Giao diện

- Mỗi màn hình là một trang trong `app/`, bọc trong `SiteShell` (header, nav, footer, skip link). Markup và class giữ như bản PHP; CSS toàn cục và font nằm trong `public/assets`.
- Player (`src/components/player`) là client component: lưu nháp trên server, khi mất mạng xếp thao tác vào outbox cục bộ và gửi lại theo thứ tự với revision hiện tại. 409 trả `currentAttempt` để người học chọn tải lại. Local storage không phải nguồn điểm đáng tin.
- Chuỗi giao diện tiếng Việt viết thẳng trong code, không dùng framework i18n.

## Worker

`src/worker` chạy ngoài request web. Hàng đợi là bảng `mce_jobs`: một worker một lúc (`GET_LOCK` trên kết nối riêng), backoff `min(3600, 30·2^lần thử)`, tối đa 5 lần, phục hồi sau crash. Loại job: mail, reminder, analytics, export, import, delete_account. `tick` chốt streak và xếp nhắc học. Mail lỗi sau khi server SMTP đã bắt đầu nhận nội dung bị đánh dấu "không chắc đã gửi" và không tự gửi lại. Lệnh và cron: [README](../README.md#worker).

## Bảo mật

- Chống CSRF bằng kiểm `Origin` / `Sec-Fetch-Site` trong `proxy.ts`; không có token CSRF trong form. Cookie `HttpOnly`, `SameSite=Lax`, `Secure` khi `APP_URL` là https.
- CSP tĩnh trong `next.config.ts` (cho phép inline script vì nonce không dùng được với Cache Components), SRI cho file script, HSTS ở production.
- Biến môi trường được kiểm bằng zod khi khởi động (`src/env.ts`).
- Better Auth không mở route `/api/auth/*`; Server Action gọi `auth.api` trực tiếp.

Chi tiết và test chứng minh: [migration/security-checklist.md](migration/security-checklist.md).

## Việc còn mở

Trang công khai vẫn trả `private, no-store` vì header render nav đã đăng nhập (fix 20). Cần khi có CDN.

Triển khai: [operations.md](operations.md).
