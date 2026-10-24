# API `/api/v1`

Danh sách route, input, quyền và rate limit nằm ở [api-v1.md](api-v1.md). Tệp đó sinh từ code (`src/contracts/routes.ts`) bằng `pnpm docs:api`; không sửa tay. Một unit test báo lỗi khi tệp cũ hơn code. Trang này giải thích các quy tắc chung.

Code là nguồn sự thật: `src/server/api.ts` (transport), `src/server/run-route.ts` (kiểm tra chung), `src/server/handlers.ts` (mỗi route một handler).

## Cách gọi

- Mọi route là `/api/v1/<path>`. GET chỉ đọc. Lệnh ghi dùng POST; PUT/PATCH/DELETE được xử lý như POST.
- Body: JSON object, `multipart/form-data` (upload) hoặc `application/x-www-form-urlencoded`.
- JSON tối đa ~1 MB (quá thì 413) và sâu tối đa 64 tầng. Chỉ `document`, `response`, `ids` được là mảng/object; trường khác phải là giá trị đơn, nếu không trả 422.
- `{id}` trong path là mã 32 ký tự hex (attempt hoặc import).
- Mọi response có `Cache-Control: no-store, private` và header `X-Request-ID`.

Form HTML trên site dùng Server Action với cùng handler và cùng kiểm tra; cột Transport trong api-v1.md ghi `action` cho các route đó. Route vẫn gọi được qua `/api/v1`.

## Envelope

Thành công, HTTP 200:

```json
{ "data": {}, "requestId": "0123456789abcdef" }
```

Lỗi:

```json
{
  "error": {
    "code": "HTTP_422",
    "message": "Thông báo tiếng Việt, an toàn để hiển thị",
    "fieldErrors": { "email": "..." },
    "requestId": "0123456789abcdef",
    "currentAttempt": null
  }
}
```

`code` luôn là `HTTP_<status>`. `fieldErrors` dùng tên trường của input. Lỗi không lường trước trả 503 với thông báo chung; chi tiết chỉ nằm trong log, tra bằng `requestId`.

## Mã lỗi

| HTTP | Khi nào                                                                     |
| ---- | --------------------------------------------------------------------------- |
| 401  | Route cần đăng nhập mà chưa đăng nhập                                       |
| 403  | Không đủ quyền, hoặc request khác origin                                    |
| 404  | Không có route, không có dữ liệu, hoặc dữ liệu của người khác               |
| 405  | Method không phải GET/POST/PUT/PATCH/DELETE                                 |
| 409  | Revision cũ, trạng thái workflow không cho phép, hoặc request key đã dùng   |
| 413  | Body JSON quá lớn                                                           |
| 422  | Input sai (zod hoặc quy tắc nghiệp vụ)                                      |
| 429  | Vượt rate limit                                                             |
| 503  | Lỗi không lường trước hoặc dịch vụ ngoài (mail…) không khả dụng             |

## Mức quyền

Cột Auth trong api-v1.md:

- `public`: ai cũng gọi được. `attempts/start` cho khách bắt đầu bài có `preview`; lần đầu sẽ tạo cookie khách.
- `guest-or-owner`: chủ attempt, hoặc khách có cookie đã tạo attempt đó. Người khác nhận 404, không phải 403.
- `user`: đã đăng nhập, nếu không 401.
- `staff`: editor hoặc admin. Khách và learner nhận 403 (không phải 401).
- `admin`: chỉ admin.

Một số route kiểm thêm trong handler, ví dụ `exports/request` với `kind=content` cần staff.

## Same-origin

`proxy.ts` từ chối mọi POST/PUT/PATCH/DELETE có `Origin` khác host của site. Không có `Origin` thì chỉ cho qua khi `Sec-Fetch-Site` là `same-origin` hoặc `none`. Bị từ chối: 403 với envelope lỗi ở trên. Không có token CSRF; API chỉ dành cho trang của chính site, dùng cookie phiên.

## Rate limit

Route có limit ghi `scope: số lần/giây` trong cột Rate limit, ví dụ `study: 500/60s`. Cửa sổ cố định, đếm theo IP + user (khách đếm chung là `guest`), lưu trong bảng `rate_limits`. Vượt thì 429. IP lấy từ phần tử cuối của `X-Forwarded-For`, nên reverse proxy phải nối thêm IP client vào header này.

Đăng nhập có bộ đếm riêng: chỉ đếm lần sai, theo IP + email.

## Revision và `currentAttempt`

Mọi lệnh ghi lên attempt (`attempts/{id}/*`, trừ `heartbeat`) gửi `revision` mà client đang có. Revision khác bản trên server thì trả 409, và `error.currentAttempt` chứa attempt hiện tại (dạng công khai, đã ẩn đáp án như khi đọc `attempts/{id}`). Client dùng nó để hiện bản mới và cho người học tải lại, không ghi đè.

`currentAttempt` chỉ có giá trị ở 409 của `attempts/{id}/*`; mọi chỗ khác là `null`. `review/rate` cũng kiểm `revision` của thẻ nhưng không trả `currentAttempt`.

Gửi lại đúng thao tác đã ghi thì không lỗi: `submit` cùng câu trả lời đầu tiên, `draft` cùng nội dung, `skip` câu đã bỏ qua đều trả kết quả như cũ.

## Request key (idempotency)

`attempts/start`, `review/rate`, `shop/purchase`, `exports/request`, `admin/reward-adjust` cần `requestKey`: 32 ký tự hex ngẫu nhiên do client tạo cho mỗi thao tác.

- Gửi lại cùng key với cùng dữ liệu: không làm lại, trả kết quả lần đầu. Dùng khi mất mạng giữa chừng.
- Cùng key nhưng dữ liệu khác (bài khác, thẻ/rating khác, vật phẩm khác…): 409.
- Key của người khác: 409, hoặc 404 với attempt.
- Với `attempts/start`, key chính là id của attempt mới.

Tạo key mới cho mỗi thao tác mới; chỉ dùng lại key khi gửi lại đúng thao tác đó.

## File và trang không thuộc `/api/v1`

`/media/{id}` (Range, ETag, kiểm quyền), `/du-lieu/*` (mẫu import và export), `/du-lieu/export-file/{id}` (tệp export của chủ, hết hạn sau 24 giờ), `/theme.css`, `/health`. Code ở `app/`.
