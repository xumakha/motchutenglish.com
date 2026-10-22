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


### CMS A03: duyệt nội dung và thành viên bộ từ

- `admin/entity`: tạo/lưu `draft`, chọn `in_review` để gửi snapshot chờ duyệt. Không nhận chuyển trực tiếp từ nội dung mới/draft/archived sang `published` (409; editor không có quyền publish trả 403). Nội dung đang chờ duyệt không cho sửa trực tiếp. Admin xuất bản snapshot qua `admin/entity-workflow` hoặc `admin/article-workflow`.
- Bản sửa nội dung published tiếp tục giữ projection công khai đến lúc duyệt. Với bộ từ, snapshot metadata cũng giữ danh sách thành viên tại thời điểm gửi duyệt.
- `admin/set-items`: kiểm danh sách ID nguyên dương, tồn tại, không trùng, tối đa 1.000. Bộ draft lưu trực tiếp; in_review/archived trả 409; published tạo đề xuất `draft` cho cả editor/admin, trả `{saved:true}`. Gửi duyệt rồi admin xuất bản từ CMS. Publish yêu cầu ít nhất một nghĩa từ published và danh sách gốc vẫn khớp; xung đột trả 409, không ghi đè. Mọi cập nhật nằm trong transaction, audit đi cùng thay đổi.
- Tự gắn từ theo topic cũng tạo đề xuất khi bộ topic đã published; không tự thay membership công khai. Seed được duyệt bằng cờ CLI riêng giữ nguyên hành vi.

### CMS A04: sửa đúng bản nháp và trả về duyệt

- `admin/draft-save`: POST `{type: "entity"|"article", draftId, expected, document}`. `expected` là SHA-256 của chuỗi document đã lưu; thiếu/sai hash trả 409. Chỉ sửa trạng thái draft, giữ nguyên ID, không tạo proposal mới hoặc thay projection công khai. Editor/admin được sửa; learner bị từ chối. `document` là JSON object, validation theo entity; không dùng endpoint này để publish.
- `admin/entity-workflow` và `admin/article-workflow` nhận thêm `action: "return"`, `reason` bắt buộc 1–2.000 ký tự. Chỉ admin trả bản in_review về draft; trạng thái khác trả 409. Lý do/người/thời điểm lưu trong document `reviewFeedback` và audit. Editor sửa rồi gửi duyệt lại bằng action review.
- CMS mở riêng bản nháp qua `?draft={id}`, có JSON editor cho đúng snapshot, hiển thị lý do trả lại; lỗi lưu giữ dữ liệu đã nhập. Đây là editor JSON, chưa phải visual builder. Danh sách gốc membership trong proposal là metadata phía server, không cho client sửa để vượt kiểm tra xung đột A03.
- Không cần migration. Nội dung đang archived không được sửa qua draft-save. Việc sửa nội dung published vẫn tạo proposal trước, sau đó mở đúng proposal để sửa.


### A05: phân trang dữ liệu cá nhân

`/so-tu-vung?q=…&filter=all|review|hidden&page=N` và `/on-tap?manage=1&page=N` dùng 30 mục/trang, hiển thị tổng số mục và liên kết trước/sau. Trang vượt giới hạn được đưa về trang cuối; giá trị sai về trang đầu. Sổ từ giữ q/filter khi chuyển trang, form POST giữ ngữ cảnh trang/bộ lọc. Truy vấn count và list cùng điều kiện owner, search, filter; sắp xếp thêm ID để ổn định khi ngày tạo trùng nhau. Không cần migration.

Chỉ danh sách quản lý được phân trang. Queue ôn đến hạn, giới hạn ôn hằng ngày, ôn thêm và response API `review/queue` giữ nguyên ý nghĩa.


### A06: audio và loại từ trong snapshot ôn

`vocabulary/save` với `review=true` tạo snapshot mới có `partOfSpeech` và `audioId` số hoặc null, cùng IPA/nghĩa/ví dụ/bản dịch. Thẻ đã tồn tại giữ snapshot cũ theo chính sách snapshot, không tự cập nhật từ nguồn. Mặt sau `/on-tap` render POS/audio nếu có; thẻ cũ hoặc concept không có trường này vẫn hợp lệ. Native audio không autoplay, có tốc độ 0.75/1/1.25, báo lỗi và thử tải lại; lỗi audio không chặn rating và không tự thay lịch/điểm. `/media/{id}` tiếp tục kiểm quyền theo snapshot owner kể cả nguồn đã archived. Không cần migration hoặc dịch vụ audio bên ngoài.


### A07: thống kê tuần và lịch sử lượt học

GET `/tien-do?week=N&page=P`: week=0 tuần này, 1 tuần trước, tối đa 520 tuần; sai định dạng về tuần này. Tuần từ thứ Hai 00:00 đến thứ Hai kế tiếp theo timezone tài khoản sau khi áp dụng thay đổi timezone đến hạn; query accuracy đổi hai mốc sang UTC, giữ đúng DST. Lượt bài/ngày hoạt động/lượt ôn và phút dùng ngày đã ghi nhận, không tái viết lịch sử khi đổi timezone. Accuracy chỉ tính điểm khách quan các lượt bài finished, không preview/placement; thiếu điểm hiển thị chưa có dữ liệu.

Lịch sử finished tất cả thời gian (độc lập tuần đang chọn), 30 lượt/trang, thứ tự finished_at DESC rồi id DESC; gồm placement, loại preview. Link `/hoc/luot/{id}` đọc đúng version đã lưu, kể cả lesson archived; kiểm owner giữ nguyên, owner khác nhận 404. Score null giữ ý nghĩa tự đánh giá/chưa có điểm. API `progress` hiện có không thay response; số liệu tuần/lịch sử mới được render SSR. Không cần migration.


### A08: hành trình chiến dịch có đồng ý

POST `/api/v1/analytics/consent` (hoặc form cùng command), CSRF bắt buộc: `enabled=yes|no`, `campaignSlug` và ba trường UTM tùy chọn. Guest được dùng endpoint này; bật cần campaign có nội dung khả dụng, giới hạn 30 yêu cầu/15 phút. Guest chỉ được gắn hành trình vào tài khoản mới khi đăng ký trong phiên đã đồng ý; đăng nhập tài khoản có sẵn không tự gắn hành trình guest. Lựa chọn của account lưu trong `mce_consents`; endpoint `consent` hiện có cũng rút lại và xóa hành trình của account.

`mce_journeys` là bảng mới qua migration `20261022_marketing_journeys`. Không tạo journey trước opt-in. Nguồn đầu tiên giữ 30 ngày, refresh không tăng count. `utm_source`: direct/google/facebook/instagram/youtube/tiktok/newsletter/partner; `utm_medium`: none/organic/cpc/social/email/referral; `utm_campaign` chỉ nhận đúng slug path đang xem. Giá trị khác bị bỏ/fallback, không lưu raw query, term/content/referrer/IP/email/đáp án/ghi chú. Guest ID là mã ngẫu nhiên riêng, không dùng session ID để lưu báo cáo.

Các mốc: landing sau đồng ý → guest lesson_started (không placement) → đăng ký mới → lesson_completed đầu → lesson_started/completed sau ít nhất 24 giờ. Chỉ sự kiện phát sinh sau consent, không dựng lại lịch sử trước đó. `/admin/operations` chỉ admin xem nhóm path/source/medium/campaign của cohort landing 30 ngày, tối đa 100 nhóm nhiều journey nhất; các cột sau yêu cầu có các mốc trước, không coi là tỷ lệ của tất cả khách truy cập.

Rút lại: xóa journey account/current anonymous và hủy analytics jobs đang chờ; không thể thu hồi request đã gửi trước đó. Export cá nhân có journeys, xóa account xóa journeys; `jobs tick` dọn journey quá 90 ngày. GA4 vẫn tùy chọn cấu hình riêng, không cần bật để dùng báo cáo local hoặc học.

Analytics job giữ `occurredAt` từ `mce_events`, chuyển thành `timestamp_micros` khi gửi. Job cũ thiếu trường đọc lại event gốc; không còn event/time thì lỗi, không dùng thời điểm worker làm thay thế. Sự kiện quá 72 giờ từ chối gửi thay vì bị đổi thời điểm; xem lỗi ở operations, không retry để giả thời điểm mới. Tham chiếu [GA4 Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference). Chưa kiểm ingestion GA4 thật.


### A09: SEO override cho trang public

Migration `20261022_public_seo` thêm `seo_title` (160 ký tự), `seo_description` (320 ký tự) vào paths/vocabulary/vocabulary_sets/articles và bảng `mce_page_seo`. Trường là plain text một dòng, không nhận HTML/control characters; để trống dùng fallback. API entity/import thiếu trường SEO giữ tương thích; bản sửa published vẫn đi qua proposal/version và chỉ đổi metadata public khi admin publish. Draft JSON A04 cũng có thể sửa các trường SEO. Lesson dùng `document.seo.title/description` với cùng giới hạn/validation; chuỗi rỗng dùng title/objectives hiện có.

POST `admin/seo`: `{path,title,description}` chỉ admin. Dùng cho `/`, catalog, thông tin, campaign và public legacy; path tuyệt đối nội bộ không có query/fragment/domain, không nhận auth/private/admin hoặc route entity động. Entity phải sửa SEO trong form nội dung để giữ workflow, lesson trong document phiên bản. Trống cả hai xóa override. Form và danh sách chỉnh sửa tại `/admin/settings?seoPath=…`.

Header SSR dùng title/description override cho `<title>`, description và OG; không thay heading/nội dung bài, canonical tự sinh hoặc robots/noindex hiện có. Tên thương hiệu vẫn nối sau title theo giao diện hiện tại. Fallback: giá trị entity hiện có/title/objectives/meaning/body, cuối cùng description mặc định. Error/draft/private không lấy SEO override. Không cho nhập arbitrary HTML, OG image hoặc canonical URL trong đợt này.


### A10: lỗi từng trường và bàn phím

`ProductError.fields` tiếp tục ra API dưới `error.fieldErrors`, key là tên control khi xác định được (profile goal/selfLevel/minutes/timezone/reviewLimit; notes; entity fields/slug/SEO; password/email; document cho JSON editor). Lỗi quyền/trạng thái/mạng vẫn là lỗi chung, không đánh dấu mọi control sai. Helper `mce_field` giữ lỗi validation theo trường. Import lỗi sâu theo field path vẫn thuộc A11.

SSR lỗi có `#form-error-state` JSON an toàn: chỉ form có command + định danh resource/action phù hợp được khôi phục dữ liệu và gắn lỗi. Không serialize password/current/token/csrf/secret. JS đặt aria-invalid, nối aria-describedby vào hint cũ thay vì thay thế, chèn nội dung lỗi bằng textContent. Summary nhận focus và có link tới ô cần sửa; mở details chứa ô lỗi. Auth áp dụng email/name/password/confirm, vẫn giữ password hint. Khi JS tắt, error summary và native validation vẫn còn; inline enhancement cần JS.

Player nhận fieldErrors từ AJAX; lỗi submit 422 không có field cụ thể gắn vào nhóm response. Điều hướng/nộp/hoàn thành đưa focus tới câu/feedback/kết quả; token order giữ focus sau thêm/bỏ/lên/xuống và thông báo vị trí bằng status. Match dùng select native có label; review reveal/rating giữ native keyboard flow. CSS focus-visible/invalid không chỉ dựa vào màu. Báo cáo lỗi nội dung có tên trường để ánh xạ validation.

Chrome kiểm bàn phím order/match, lỗi đăng ký giữ hint, focus summary, form CMS có nhiều form không bị đánh dấu nhầm và dữ liệu không nhạy cảm được giữ. Đây không thay thế kiểm thủ công bằng NVDA/VoiceOver hoặc chứng nhận WCAG 2.2 AA.


### A11: chẩn đoán và tiến độ import

Dry-run giữ response `{id,errors,count,status}`. Mỗi issue có `record` (1-based), `field` (dot path, index array 0-based), `message`, `phase=preview|commit`. Ví dụ `lessons.0.document.exercises.2.payload.answerId`, `lessons.0.document.blocks.0.text`, `vocabulary.0.lemma`, `paths.0.title`. Validation báo lỗi đầu tiên gặp trong từng record (vẫn kiểm các record khác); sửa rồi dry-run lại. CSV dùng vocabulary index và tên cột, không coi index là số dòng vật lý khi CSV có xuống dòng trong ô.

GET `/api/v1/admin/import-status/{id}`: staff, editor chỉ batch của mình (404 khi owner khác), admin xem mọi batch. Trả `status,phase,processed,total,committed,errors,updatedAt,job,canCommit` và id; không trả document/actor identity. List imports của editor cũng chỉ batch mình. Form commit chỉ hiện khi đúng owner và preview không lỗi.

Migration `20261022_import_progress` thêm bảng telemetry riêng không FK tới hàng import bị khóa. Một kết nối PDO autocommit phụ ghi tiến độ mỗi 10 record/cuối batch để request đọc khác thấy tiến độ ngay khi giao dịch nội dung còn mở. `processed` là record đã xử lý trong lần thử hiện tại, KHÔNG phải đã lưu; `committed=0` cho tới khi transaction chính commit toàn bộ. Nếu telemetry lỗi, nội dung vẫn atomic; trạng thái committed chính là nguồn xác nhận cuối. Khi lỗi, toàn bộ writes rollback, issue phase commit được lưu sau rollback; không đưa raw SQL/lỗi DB riêng vào UI. Sau khi xử lý nguyên nhân có thể retry, không đổi thành partial import/overwrite.

Batch trên 100 vào queue như cũ. Job lỗi có pending/backoff thể hiện ở job; lỗi commit cũ không chặn worker retry. Retry/recovery bắt đầu progress từ 0. CMS hiển thị progress/count/phase/error paths, poll 3 giây khi queued/running/job pending; tab ẩn tạm hoãn, lỗi đọc yêu cầu tải lại và không báo success. Batch cũ chưa có telemetry suy total từ document; committed vẫn xác nhận toàn bộ. Worker/cron vẫn cần chạy theo operations.


## Quyền thêm concept vào ôn — bổ sung 22/10/2026

Public attempt thêm boolean `canSaveConcepts`: true chỉ khi attempt thuộc tài khoản (không còn là guest), đã finished và không phải preview. Player dùng cờ này để hiện CTA ở feedback câu sai. Đây là gợi ý hiển thị, không thay authorization server.

`POST review/concept` cần attemptId/exerciseId hợp lệ và session owner. Preview trả 422, dù editor/admin sở hữu preview; guest attempt chưa claim trả 422 kể cả người dùng đã đăng nhập trong cùng session. Attempt khác chủ vẫn 404. Sau khi xác nhận guest/claim và hoàn thành lượt đã chuyển, owner có thể thêm concept; target ổn định giữ chống trùng khi retry. Không tự động claim hoặc gộp bài khi gọi review/concept.
