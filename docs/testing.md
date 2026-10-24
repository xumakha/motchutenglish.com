# Kiểm thử

Chạy mọi lệnh từ thư mục gốc repo. CI (`.github/workflows/ci.yml`) chạy tất cả các bước dưới đây trên MariaDB 10.11 cho mỗi push và pull request.

| Lớp           | Lệnh                             | Nằm ở                                     | Cần gì                                   |
| ------------- | -------------------------------- | ----------------------------------------- | ---------------------------------------- |
| Unit          | `pnpm test` (cũng trong `pnpm check`) | `src/**/*.test.ts`                   | Không cần DB                             |
| Database      | `pnpm test:db`                   | `tests/integration/*.test.ts`             | `DATABASE_URL` trỏ tới DB đã migrate     |
| Trình duyệt   | `pnpm test:e2e`                  | `tests/e2e/*.spec.ts`                     | Đã `pnpm build`, DB đã seed, Chromium    |
| HTTP hộp đen  | `python3 tests/http/run_next.py` | `tests/http/*_http.py`                    | Python 3, user DB có quyền CREATE DATABASE |
| Hiệu năng     | `pnpm benchmark [BASE_URL]`      | `scripts/benchmark.ts`                    | Bản build đang chạy, DB đã seed          |

## Chuẩn bị lần đầu

```sh
pnpm db:reset                          # xóa và tạo lại DB trong DATABASE_URL, chạy migration
pnpm seed --publish-reviewed-samples   # catalog mẫu mà e2e và benchmark cần
pnpm build
pnpm exec playwright install chromium
```

`pnpm db:reset` từ chối chạy khi `APP_ENV=production`. Không trỏ `DATABASE_URL` vào DB thật khi chạy test.

## Unit

- Chấm điểm: `src/domain/assessment/golden.test.ts` chạy lại `tests/golden/assessment.json` (kết quả của bản PHP). Mọi khác biệt với bộ chấm PHP đều làm test lỗi.
- Hợp đồng route: `src/contracts/routes.test.ts` so với danh sách route của bản PHP (`tests/golden/php-routes.json`). `src/contracts/api-docs.test.ts` báo lỗi khi `docs/api-v1.md` cũ hơn code; sửa bằng `pnpm docs:api`.
- Ngoài ra: quy tắc proxy, log không lộ dữ liệu, biến môi trường, timezone.

## Database

Mỗi test tạo dữ liệu riêng (email, slug ngẫu nhiên) trong cùng một DB đã migrate, nên chạy theo thứ tự nào cũng được. Các file chạy tuần tự. Bao gồm: attempt và guest claim, nội dung và import, phần thưởng, streak và timezone, rate limit, worker (phục hồi sau khi giết process giữa chừng), mail qua server SMTP giả, backup và restore drill (cần `mariadb-dump`/`mariadb`), đăng ký đồng thời.

`.env.local` được nạp tự động; CI truyền biến môi trường trực tiếp.

## Trình duyệt (Playwright)

- Chạy ở 4 độ rộng: 360, 390, 768, 1440 px. Các test luồng dài chỉ chạy ở 1440.
- Playwright tự chạy `pnpm start`, nên cần build trước. Đặt `E2E_BASE_URL` để chạy với server khác.
- Mỗi test gửi một IP giả riêng qua `X-Forwarded-For`, nên rate limit theo IP không cộng dồn giữa các test. `global-setup.ts` xóa bảng `rate_limits` trước mỗi lượt và từ chối chạy khi `APP_ENV=production`.
- `a11y.spec.ts`: bàn phím, skip link, menu, focus. Không thay cho kiểm tra thủ công bằng screen reader.
- `fixes.spec.ts`, `player.spec.ts`: outbox khi mất mạng, tìm kiếm, cache header…

Đã biết: `public.spec.ts` › finds lessons, words and articles có thể lỗi trên DB dev dùng lâu (nhiều bài test chứa "Hello" chiếm hết 60 kết quả). Chạy `pnpm db:reset` và seed lại.

## HTTP hộp đen

`python3 tests/http/run_next.py` tạo DB riêng `mce_next_http_*` trên server trong `DATABASE_URL`, migrate, seed, build, chạy app ở cổng 3201 (`NEXT_HTTP_PORT`) và chạy 6 bộ: `site`, `auth`, `product`, `account`, `learning`, `timezone`. Fixture dùng CLI `scripts/fixture.ts`. Kết quả ghi vào `docs/artifacts/next-http-report.json`. DB bị xóa khi tất cả qua, giữ lại khi lỗi (`KEEP_TEST_DB=1` luôn giữ). `NEXT_HTTP_SKIP_BUILD=1` dùng lại bản build có sẵn.

## Hiệu năng (A02)

`pnpm benchmark` tạo 55 user, 5 request làm nóng, rồi 50 user đã đăng nhập cùng nộp một câu trả lời. Mục tiêu p95 dưới 800 ms và dưới 1% lỗi. Kết quả local: `docs/artifacts/a02-next-local.json`. Đây là số đo máy local, không phải cam kết năng lực staging.

## Hồi quy cho các bug đã sửa

Mỗi bug sửa trong lúc chuyển sang Next.js có một test tên `fix N: …`, viết để lỗi với hành vi cũ. Bảng đầy đủ: [migration/fix-tests.md](migration/fix-tests.md). Tìm nhanh: `grep -rn "fix 12" src tests`.

## Chưa có

- Kiểm thủ công bằng NVDA/VoiceOver.
- Số đo trên staging, SMTP thật, GA4 thật.
- Fix 20 (trang công khai cache được qua CDN): test đang để `test.fixme`.
