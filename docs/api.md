# Hợp đồng HTTP

Prefix JSON `/api/v1/`. Cookie session + CSRF (`X-CSRF-Token` hoặc form `csrf`) cho mọi mutation. GET không ghi nghiệp vụ. Thành công `{data,requestId}`, lỗi `{error:{code,message,fieldErrors,requestId,currentAttempt}}`; HTTP401 chưa đăng nhập,403 quyền/CSRF,404 không tồn tại hoặc khác chủ,409 revision/idempotency conflict,422 dữ liệu,429 rate limit,503 dịch vụ thiếu/lỗi. Error không trả stack/credentials. Header X-Request-ID để đối chiếu log.

| Method | Route sau prefix | Dữ liệu/chính sách |
|---|---|---|
| GET | catalog | Paths published có bài khả dụng |
| GET | attempts/{32hex} | Owner hoặc guest session đúng; public document đã redaction |
| POST | attempts/start | lessonId, requestKey32hex, mode practice/test; server ép placement test |
| POST | attempts/{id}/view | revision, blockId; ghi dấu xem block |
| POST | attempts/{id}/draft | revision, exerciseId, response theo type |
| POST | attempts/{id}/submit | revision, exerciseId, response; server grader, không nhận score |
| POST | attempts/{id}/skip | revision, exerciseId |
| POST | attempts/{id}/navigate | revision, position |
| POST | attempts/{id}/heartbeat | revision; chỉ ước tính thời gian tương tác, không thưởng |
| POST | attempts/{id}/audio_error | revision, exerciseId; exclude unavailable khỏi maxscore, không accuracy bonus |
| POST | attempts/{id}/finish | revision; kiểm required blocks/items, progress + reward cùng transaction |
| POST | attempts/{id}/retry | exerciseId,response; chỉ practice, không đổi first score |
| POST | guest/claim | attemptId; phải xác nhận, không gộp ngầm hoặc nhận điểm client |
| POST/PATCH | profile | goal,selfLevel,minutes,timezone,reviewLimit,gamification,animations |
| POST | enrollments | pathId; không xóa tiến độ cũ |
| GET | progress | Chỉ progress chủ session |
| POST | vocabulary/save | senseId,notes(max2000),review; published sense |
| POST | vocabulary/remove | senseId; xóa note riêng, ẩn thẻ |
| GET | review/queue | Due owner cards trong daily limit; ?more=1 explicit extra |
| POST | review/rate | cardId,revision,rating(again/hard/good/easy),requestKey,extra optional |
| POST | review/manage | cardId,action(reset/hide/show/remove),confirm=yes khi reset/remove |
| POST | review/concept | attemptId,exerciseId; bài đã finish mới lưu concept |
| GET | me/rewards, me/quests, me/streak | Ledger totals, frozen tasks, calendar state |
| POST | shop/purchase | itemId,requestKey; lock balance/unique ownership, không âm |
| POST | avatar | itemId đã sở hữu |
| POST | streak/preferences | autoProtect |
| POST | reminders | enabled,hour0..23; cần mailconfigured nếu bật |
| POST | consent | analytics opt-in; không gửi private text |
| POST | password/reset-request | email; generic message nếu mailconfigured |
| POST | password/reset | token,password; singleuse/expiry/revokesessions |
| POST | password/change | current,password; revokesessions |
| POST | email/verify | optional email mới, chỉ đổi sau consume |
| POST | email/consume | token,purpose verify/unsubscribe |
| POST | account/delete | password; queue erase, revokesession ngay |
| POST | exports/request | kind personal/content,requestKey; content staff only |

SSR `/du-lieu/export-file/{requestKey}` tải ready file của owner,24h expiry; content còn yêu cầu staff. `/du-lieu/export` giữ tương thích export nhỏ, `/du-lieu/content-export` staff catalog. Ưu tiên queue trong UI.

Admin mutations luôn staff; publish/role/settings/operations/rewardcorrection chỉ admin:
`admin/version` (lessonId/versionId hoặc unitId/slug/title/document), `admin/workflow` (versionId/action review,publish,archive,restore,return), `admin/entity` (kind+fields), `admin/entity-workflow` (draftId/action), `admin/article-workflow` (versionId/action), `admin/set-items` (setId/ids), `admin/unit-state` (unitId/archived), `admin/upload` (multipart file/alt/source/license), `admin/import-preview` (raw), `admin/import-commit` (importId), `admin/reorder` (kind/ids), `admin/report` (reportId/status/resolution), `admin/role` (userId/role), `admin/settings` (name/value allowlist), `admin/reward-adjust` (userId/currency/amount/reason/requestKey), `admin/job-retry` (jobId chưa gửi xác định).

Idempotency: start/request/job keys cùng owner+resource dùng lại, không nhận key của chủ khác; submit cùng first_response trả state hiện có, dữ liệu khác409. Mọi write attempt kiểm revision,409 kèm currentAttempt. UI giữ local draft/outbox khi offline, không báo server saved đến khi HTTP xác nhận. Test mode không có answer keys/transcript/grading trước finish; export không là lối vượt kiểm tra.

Response shapes theo exercise: choice string stableID; true_false bool; fill object blankID->string; order array tokenIDs; match object leftID->opaque rightID; correction/closed string; self/flashcard object theo template. `Assessment::publicExercise` và mẫu `all-exercises.json` là nguồn schema cụ thể. Không suy ra ID từ chữ hiển thị.

Routes SSR cũ `/courses`, `/listening`, `/dashboard`, `/hoc/bai/{id}`, `/ket-qua/{id}`, `/admin` giữ tương thích. Catalog public mới `/lo-trinh`, `/bai-hoc/{slug}`, `/tu-vung[/chu-de/{slug}]`, `/kien-thuc`; `/chien-dich/{pathSlug}?utm_source=...` CTA tới bài/lộ trình published. UTM không được đưa raw vào analytics hoặc canonical. Pagination vocabulary/article page=1..., CMS pageNo=1...; search/private không index.
