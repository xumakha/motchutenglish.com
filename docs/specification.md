# MỘT CHÚT ENGLISH - SPEC WEBSITE HỌC TIẾNG ANH
Phiên bản 1.0 | Ngôn ngữ sản phẩm: tiếng Việt | Múi giờ mặc định: Asia/Ho_Chi_Minh

## 1. Prompt giao việc cho AI coding
Bạn là kỹ sư full-stack chịu trách nhiệm triển khai sản phẩm Một Chút English theo toàn bộ spec này.

Mục tiêu là xây website học tiếng Anh độc lập, có dữ liệu bền vững, quản trị nội dung thật và các luồng học hoạt động end-to-end. Video và mạng xã hội chỉ là kênh marketing. Không thiết kế website như thư viện video hoặc công cụ phát lại quiz từ mạng xã hội.

Trước khi sửa code:
1. Đọc repository, hướng dẫn dự án, schema database và cấu hình triển khai hiện có.
2. Nếu có code đang hoạt động, giữ dữ liệu và tính năng hiện hữu; lập kế hoạch migration có thể phục hồi.
3. Ghi các giả định vào docs/decisions.md. Chỉ hỏi khi thiếu thông tin ảnh hưởng lớn đến kiến trúc hoặc có nguy cơ mất dữ liệu.
4. Lập backlog theo các giai đoạn ở cuối spec, sau đó thực hiện giai đoạn đầu ngay. Không dừng ở bản kế hoạch.
5. Nếu môi trường chưa cấu hình dịch vụ bên ngoài, xây adapter và trạng thái chưa cấu hình rõ ràng; không báo gửi email, thanh toán hoặc đồng bộ thành công giả.
6. Không tự đăng ký dịch vụ trả phí, đưa khóa bí mật lên client hoặc triển khai production khi chưa được chủ dự án yêu cầu.
7. Mỗi giai đoạn phải có code chạy được, migration, kiểm thử quan trọng và hướng dẫn vận hành. Không để nút giả, số liệu giả hoặc TODO trong chức năng được tuyên bố hoàn thành.
8. Báo cáo rõ đã hoàn thành gì, kiểm thử gì, phần nào còn thiếu và lệnh chạy cụ thể. Nếu giới hạn phiên làm việc, cập nhật docs/progress.md rồi tiếp tục từ đó ở phiên sau.
9. Tất cả dấu gạch trong nội dung tiếng Việt dùng dấu "-" thông thường. Chữ tiếng Việt phải đúng dấu.
10. Ưu tiên độ đúng, tính dễ dùng và khả năng bảo trì trước hiệu ứng giao diện.

## 2. Định vị và phạm vi
- Đối tượng chính: người Việt trưởng thành mới bắt đầu hoặc mất gốc; người học A1-A2; người muốn củng cố giao tiếp B1 nhẹ và nền tảng TOEIC.
- Lời hứa: học một chút mỗi ngày, biết nên học gì tiếp theo và ôn lại những gì chưa nhớ.
- Website phải dùng được độc lập dù người học chưa từng xem kênh.
- Tiếng Việt cho điều hướng và giải thích; tiếng Anh cho nội dung học.
- Bài học ngắn khoảng 5-15 phút là mục tiêu biên tập, không phải giới hạn cứng.
- Không coi một bài kiểm tra ngắn là chứng chỉ CEFR hoặc dự đoán điểm TOEIC chính thức.
- Nội dung học phải được kiểm duyệt. Seed chỉ là bộ nội dung mẫu, không quảng cáo là khóa học toàn diện.

### Phạm vi bản phát hành đầu tiên
Bắt buộc: tài khoản, onboarding, lộ trình, lesson player, chấm bài khách quan, bài tự đánh giá có đáp án mẫu, ôn tập cách quãng, sổ từ vựng, tìm kiếm, tiến độ, quản trị, báo lỗi nội dung, SEO, thống kê cơ bản, bảo mật, backup và kiểm thử.

Chưa nằm trong bản đầu: cộng đồng/chat, giáo viên trực tiếp, AI tutor trả phí, chấm phát âm tự động, chấm viết tự do bằng AI, thi thử TOEIC đầy đủ, chứng chỉ, app native và thanh toán thật. Kiến trúc cho phép mở rộng nhưng không làm các màn hình giả cho các tính năng này.

## 3. Kiến trúc mặc định và triển khai
Đây là lựa chọn kiến trúc cho dự án mới, không phải yêu cầu thay toàn bộ stack của repository có sẵn.

### Lựa chọn ưu tiên khi chưa biết hosting
- Modular monolith: Laravel + PostgreSQL hoặc MySQL + frontend Vue/Inertia hoặc server-rendered views với các component tương tác.
- Chọn đúng một database chính trước khi triển khai; CI và môi trường production dùng cùng engine chính. Không hứa hỗ trợ đồng thời mọi database.
- Nếu triển khai shared hosting cPanel: ưu tiên Laravel + MySQL và frontend được build trước; kiểm tra PHP extensions, document root, cron, khả năng chạy queue và dung lượng.
- Nếu dùng VPS/container: có thể dùng PostgreSQL, worker riêng và Redis khi thực sự cần.
- Dùng bản ổn định còn được hỗ trợ, tương thích với hosting; xác minh tài liệu chính thức tại thời điểm code và ghi version đã chọn. Khóa dependency bằng lockfile.
- Không tự dùng Next.js/Node server nếu hosting chỉ hỗ trợ PHP. Nếu repo đã có Next.js, tiếp tục stack đó và ghi rõ yêu cầu runtime.
- Server là nguồn sự thật cho quyền, chấm điểm, tiến độ và lịch ôn.
- Client quản lý trạng thái giao diện và bản nháp ngắn hạn.
- Dùng framework authentication, validation, authorization, migration và job queue có sẵn.
- Tách các module Identity, Catalog, Learning, Assessment, Review, Vocabulary, ContentAdmin, Reporting.
- Không tách microservices ở bản đầu.

### Dịch vụ ngoài
- Email qua SMTP adapter. Development dùng mail sink/log an toàn; production phải cấu hình thật để bật xác minh và reset mật khẩu.
- Media qua storage adapter: local persistent storage hoặc S3-compatible.
- Audio: file được quản trị viên tải lên là nguồn chính. Có thể dùng browser speech synthesis làm tiện ích dự phòng và thông báo giọng đọc phụ thuộc thiết bị.
- Không phụ thuộc API AI để hoàn thành một bài học.
- Redis không bắt buộc nếu hosting không hỗ trợ; phải có cấu hình database queue/cache phù hợp.
- Cung cấp .env.example không chứa bí mật, hướng dẫn cron/worker, SSL, backup và deploy.

## 4. Vai trò và quyền
| Vai trò | Quyền |
| --- | --- |
| Khách | Xem catalog và bài công khai, học thử lesson được bật preview, giữ tiến độ thử trên trình duyệt |
| Học viên | Lưu tiến độ, làm bài, ôn tập, lưu từ, xem lịch sử và sửa tài khoản của mình |
| Biên tập viên | Tạo/sửa draft, quản lý media, xem báo lỗi, gửi nội dung để duyệt |
| Quản trị viên | Duyệt/xuất bản, quản lý users/roles, cấu hình hệ thống, xem audit và thống kê |

- Mọi quyền kiểm tra phía server; ẩn nút trên UI không thay thế authorization.
- Editor không được tự cấp quyền admin, xóa user hoặc xuất dữ liệu cá nhân.
- Admin xem dữ liệu cá nhân tối thiểu cần thiết. Không hỗ trợ impersonation ở bản đầu.
- Ghi audit cho thay đổi role, xuất bản, archive, sửa cấu hình và thao tác dữ liệu nhạy cảm.

## 5. Sitemap và điều hướng
### Công khai
- /: trang chủ, giới thiệu cách học, lộ trình, bài mẫu, CTA bắt đầu.
- /lo-trinh: danh sách lộ trình.
- /lo-trinh/{slug}: mục tiêu, yêu cầu đầu vào, chương và bài học.
- /bai-hoc/{slug}: trang giới thiệu nội dung bài, thời lượng ước tính, CTA học.
- /tu-vung và /tu-vung/{slug}: bộ từ vựng công khai.
- /kien-thuc và /kien-thuc/{slug}: bài hướng dẫn học được biên tập.
- /tim-kiem: tìm bài học, từ vựng và bài viết.
- /gioi-thieu, /lien-he, /dieu-khoan, /bao-mat.
- /dang-nhap, /dang-ky, /quen-mat-khau, /dat-lai-mat-khau.

### Học viên
- /hoc: dashboard hôm nay.
- /bat-dau: onboarding.
- /kiem-tra-dau-vao: kiểm tra gợi ý trình độ.
- /hoc/bai/{lessonId}: lesson player.
- /ket-qua/{attemptId}: kết quả và giải thích.
- /on-tap: hàng đợi ôn tập.
- /so-tu-vung: từ đã lưu.
- /tien-do: thống kê học cá nhân.
- /tai-khoan: hồ sơ, mục tiêu, mật khẩu, quyền riêng tư.

### Quản trị
- /admin: dashboard vận hành.
- /admin/paths, /units, /lessons, /questions, /vocabulary, /articles.
- /admin/media, /imports, /reports, /users, /settings, /audit.

Tên đường dẫn có thể thay đổi theo conventions của repo, nhưng phải có mapping tương ứng và redirect khi đổi slug.

## 6. Các hành trình bắt buộc
### A. Người mới
Trang chủ -> xem lộ trình -> học thử không cần đăng ký -> xem kết quả -> đăng ký để lưu -> nhận gợi ý bài tiếp theo.
- Không bắt onboarding dài trước khi người dùng xem bài mẫu.
- Nếu khách học thử rồi đăng ký, đề nghị chuyển tiến độ thử một lần.
- Không tin điểm do client gửi: tiến độ khách phải được server chấm lại hoặc chỉ nhập dấu đã xem, không nhập thành tích có thể bị giả.
- Không âm thầm gộp dữ liệu của tài khoản khác trên cùng thiết bị.

### B. Học hằng ngày
Đăng nhập -> xem mục tiêu và bài tiếp theo -> học -> luyện tập -> xem giải thích -> hoàn thành -> cập nhật tiến độ -> gợi ý ôn tập.

### C. Ôn tập
Dashboard -> số thẻ đến hạn -> ôn từng thẻ -> xem đáp án -> tự đánh giá mức nhớ -> lưu lịch ôn mới -> kết thúc phiên.

### D. Quản trị
Tạo bài draft -> thêm blocks và câu hỏi -> preview bằng lesson player thật -> kiểm tra lỗi -> gửi duyệt -> publish -> học viên truy cập được -> báo lỗi -> sửa thành version mới.

## 7. Onboarding và gợi ý trình độ
- Thu thập tùy chọn: mục tiêu (mất gốc/giao tiếp/đi làm/nền tảng TOEIC), mức tự đánh giá, phút học/ngày (5/10/15/20), múi giờ.
- Có nút bỏ qua; có thể sửa về sau.
- Kiểm tra đầu vào cố định 20 câu, có blueprint mức độ và chủ điểm; không gọi là adaptive khi chưa triển khai thật.
- Cho phép bỏ qua câu và thoát; lưu bài đang làm nếu đã đăng nhập.
- Không có audio thì không đánh giá listening.
- Điểm khách quan = số câu đúng / số câu hợp lệ trong bài; báo riêng câu bỏ qua.
- Quy tắc gợi ý phải cấu hình theo blueprint được biên tập; nếu chưa có bộ đề được hiệu chuẩn, chỉ trả "gợi ý học", không gán chắc chắn trình độ CEFR.
- Người học tự đổi lộ trình bất cứ lúc nào; không xóa tiến độ cũ.

## 8. Hệ thống khóa học
Cấu trúc: LearningPath -> Unit -> Lesson -> ContentBlock + Exercises.
- Mỗi path: tên, slug, mô tả, level tag, mục tiêu, prerequisites mềm, ảnh, trạng thái, thứ tự.
- Mỗi unit: tiêu đề, kết quả học tập, thứ tự.
- Mỗi lesson: mục tiêu cụ thể, ước tính thời gian, tags, level, các blocks, câu luyện tập, phiên bản.
- Path mẫu: Bắt đầu từ nền tảng; Giao tiếp hằng ngày; Tiếng Anh công việc; Nền tảng TOEIC.
- Chỉ hiển thị path có nội dung thật; path chưa sẵn sàng không được quảng cáo là hoàn chỉnh.
- Không bắt khóa cứng bài theo tuyến ở bản đầu. Hiển thị thứ tự khuyến nghị và cho học lại.
- Bài tiếp theo = bài chưa hoàn thành đầu tiên theo thứ tự path đang chọn; nếu hết thì gợi ý ôn tập.
- Tiến độ path tính theo lesson bắt buộc đã hoàn thành / tổng lesson bắt buộc đang xuất bản.
- Khi thêm bài mới, tỷ lệ có thể thay đổi; không xóa dấu hoàn thành bài cũ.

## 9. Lesson player
- Mobile-first, thanh tiến độ, mục lục đơn giản, nút trước/sau, lưu trạng thái tự động.
- Blocks: văn bản, tiêu đề, ví dụ song ngữ, bảng ngắn, audio có transcript, hội thoại, thẻ từ, mẹo/lỗi thường gặp, câu hỏi.
- Văn bản hỗ trợ rich text giới hạn an toàn. Không cho nhúng HTML hoặc script tùy ý.
- Audio có play/pause, tốc độ 0.75x/1x/1.25x, transcript; không tự phát khi mở trang.
- Lesson practice không áp countdown 5 giây từ video. Mặc định không giới hạn thời gian; chế độ thử thách có timer là tùy chọn riêng.
- Mỗi câu có trạng thái chưa làm/đang làm/đã nộp/bỏ qua.
- Sau nộp: hiện đáp án, giải thích và gợi ý ôn kiến thức. Cho thử lại trong practice nhưng giữ điểm lần đầu.
- Bài test: chỉ hiện đáp án khi kết thúc; không gửi đáp án ẩn trong payload trước khi được phép.
- Khi mất mạng: báo trạng thái, giữ bản nháp cục bộ; không giả đã lưu server. Khi kết nối lại, gửi lại idempotently.
- Nếu nội dung bị cập nhật giữa lúc học, attempt tiếp tục dùng snapshot phiên bản đã bắt đầu.
- Hoàn thành khi đã đi qua nội dung bắt buộc và kết thúc các bài tập bắt buộc; "đã hoàn thành" khác với "đạt".
- Mức đạt mặc định 80% cho bài có chấm điểm khách quan, được biên tập viên cấu hình.
- Bài chỉ có thẻ học hoặc tự đánh giá không có điểm % khách quan.

## 10. Các dạng bài tập bản đầu
### 10.1 Một đáp án đúng
- 2-6 lựa chọn, đúng một answer ID.
- Đáp án dùng stable ID, không dựa vào vị trí A/B/C/D.
- Nếu đảo đáp án, lưu thứ tự đã hiển thị trong attempt.

### 10.2 Đúng/sai
- Statement, answer boolean, explanation; câu sai có correction.

### 10.3 Điền từ
- Một hoặc nhiều blank có ID, acceptedAnswers cho từng blank.
- Cấu hình caseSensitive, ignoreTerminalPunctuation và whitespace policy.
- Mặc định trim, Unicode normalize, gộp khoảng trắng, không phân biệt hoa thường.
- Không tự bỏ dấu nháy hoặc ký tự làm đổi nghĩa. "can't" không được chấp nhận như "cant".
- Chỉ chấm bằng đáp án được biên tập viên khai báo; không fuzzy matching tùy tiện.

### 10.4 Sắp xếp từ/cụm từ
- Tokens có ID riêng kể cả chữ giống nhau; acceptedOrders là các hoán vị hợp lệ.
- Tap để chọn và nút di chuyển bằng bàn phím; kéo thả chỉ là tùy chọn.
- Mọi token phải được sử dụng đúng một lần.

### 10.5 Ghép cặp
- Stable pair IDs; hai cột có thể đảo thứ tự.
- Chấm theo cặp đúng. Giải thích điểm từng phần nếu bật partial credit.
- Không dựa vào text để xác định cặp vì có thể trùng chữ.

### 10.6 Sửa lỗi
- Câu sai, một lỗi rõ ràng, các câu sửa được chấp nhận, explanation.
- Highlight bằng segment ID hoặc offsets được kiểm tra trên version, tránh replace substring toàn câu.
- Nếu có nhiều cách sửa hợp lý, khai báo acceptedAnswers hoặc chuyển sang tự đánh giá.

### 10.7 Nghe
- Chỉ publish khi có audio nguồn sử dụng hợp lệ.
- Bài nghe chọn đáp án và nghe điền từ dùng cùng grading engine tương ứng.
- Không hiện transcript/đáp án trước khi nộp trong test.
- Lỗi audio không được tính là trả lời sai; cho retry hoặc báo lỗi.
- Practice cho nghe lại; test có giới hạn replay nếu được cấu hình.

### 10.8 Hội thoại / dịch ngắn / viết ngắn
- Tách chế độ closed-answer và open-answer.
- Closed-answer: chấm bằng các đáp án được biên tập.
- Open-answer: hiện đáp án gợi ý, tiêu chí và tự đánh giá; nhãn "tự đánh giá", không giả chấm chính xác bằng keyword.
- Không cộng điểm tự đánh giá vào điểm khách quan.
- Chấm tự động bằng AI là giai đoạn mở rộng riêng, không âm thầm gọi API.

### 10.9 Từ vựng và thẻ ghi nhớ
- Mặt trước từ/cụm từ hoặc nghĩa; mặt sau IPA, loại từ, nghĩa, ví dụ và audio nếu có.
- Lưu từ cá nhân và đánh giá mức nhớ.
- Flashcard không phải câu trắc nghiệm có đúng/sai mặc định.

### Hợp đồng dữ liệu
Mỗi exercise có id, type, schemaVersion, payload, explanation, skillTags, level, contentVersion.
Payload validation riêng theo discriminated type.
Dữ liệu câu hỏi đưa tới client phải loại answer keys khi chưa được phép xem.
Grading trả score, maxScore, isCorrect khi áp dụng, feedback, acceptedAnswerDisplay và gradingMode.
Với self_assessed: score và isCorrect là null, không ép false.

## 11. Attempt và lưu tiến độ
- Attempt: user/guest, lessonVersion, mode, startedAt, submittedAt, status, score, maxScore, idempotencyKey.
- AttemptItem: exerciseVersion, presentedOrder, response, firstSubmittedResponse, gradingResult.
- Server quyết định score; client không được truyền score làm nguồn sự thật.
- Endpoint nộp câu và hoàn tất attempt có idempotency và transaction.
- Retry request không tạo đôi câu trả lời, điểm, daily activity hoặc review event.
- Resume đúng câu, đúng thứ tự và response đã lưu.
- Tab đồng thời dùng revision/concurrency check; xung đột trả trạng thái mới và thông báo rõ.
- Hiển thị điểm lần đầu và điểm tốt nhất riêng. Làm lại không ghi đè lịch sử.
- Thời gian học đo từ heartbeat khi tab hiển thị và có tương tác gần đây; giới hạn khoảng idle, không tính thời gian mở tab cả đêm.
- Thống kê thời gian là ước tính, không dùng làm bằng chứng học thuật.

## 12. Ôn tập cách quãng
Triển khai thuật toán đơn giản có version, kiểm thử được; không tuyên bố AI cá nhân hóa.
- ReviewCard liên kết vocabulary sense hoặc question concept, thuộc user.
- Một user không có thẻ trùng cho cùng target/version policy.
- Bốn nút sau khi lật thẻ: Chưa nhớ / Khó / Nhớ / Rất dễ.
- Lịch mặc định:
  - Chưa nhớ: sau 10 phút, reset intervalDays=0.
  - Khó: max(1, ceil(previousIntervalDays * 1.2)) ngày.
  - Nhớ: thẻ mới 1 ngày; thẻ cũ max(1, ceil(previousIntervalDays * 2)) ngày.
  - Rất dễ: thẻ mới 3 ngày; thẻ cũ max(3, ceil(previousIntervalDays * 3)) ngày.
  - Giới hạn interval tối đa 180 ngày.
- Ghi ReviewEvent bất biến: previous/new schedule, rating, algorithmVersion, occurredAt, request key.
- dueAt lưu UTC; dùng múi giờ user để hiển thị hôm nay. Khoảng ngày trong thuật toán phải có quy ước rõ và test.
- Ưu tiên quá hạn trước, có daily limit do user chọn; học vượt limit tự nguyện.
- Từ đã lưu có thể chọn thêm vào ôn tập. Câu làm sai gợi ý đưa vào ôn, không tạo vô hạn thẻ cùng kiến thức.
- Tạm ẩn/xóa thẻ cá nhân không xóa từ hoặc câu hỏi gốc.
- Nội dung bị archive: không làm hỏng lịch sử; đánh dấu thẻ không còn khả dụng hoặc dùng snapshot đã được phép giữ.
- Học viên có thể reset lịch ôn cho một thẻ sau xác nhận.

## 13. Sổ từ vựng
- Tìm, lọc đã lưu/đang ôn/đã tạm ẩn; bộ từ theo topic.
- VocabularyEntry: lemma, IPA, part of speech, audio.
- VocabularySense: nghĩa riêng, ví dụ, bản dịch, level. Một từ nhiều nghĩa không gom thành một đáp án mơ hồ.
- UserVocabulary lưu sense ID, ghi chú cá nhân plain text và trạng thái ôn.
- Notes chỉ chủ tài khoản xem được; giới hạn độ dài và chống XSS.
- Không thu thập trái phép từ điển hoặc audio bên thứ ba.

## 14. Dashboard, mục tiêu và động lực
- Dashboard: tiếp tục bài dở, bài khuyến nghị, số thẻ đến hạn, mục tiêu hôm nay, tiến độ path.
- Streak tính theo ngày địa phương có ít nhất một lesson hoàn thành hoặc một review hợp lệ; định nghĩa này hiển thị trong tooltip.
- Không tính streak chỉ vì đăng nhập hoặc refresh.
- Đổi timezone không sửa ngược lịch sử; lưu localActivityDate và timezone tại thời điểm ghi.
- Badge đơn giản: hoàn thành bài đầu, 7 ngày học, 50 thẻ đã ôn. Mỗi badge có quy tắc và chỉ cấp một lần.
- Không leaderboard ở bản đầu để tránh điểm ảo và học chạy thành tích.
- Thống kê tuần: bài hoàn thành, ngày hoạt động, số lượt ôn, độ chính xác câu khách quan.
- Không gọi thẻ "đã thuộc vĩnh viễn"; hiển thị mức nhớ theo lịch ôn.

## 15. Tài khoản
- Email/password, xác minh email, đăng xuất, reset password, đổi password.
- Rate limit login/reset/register; thông báo reset không tiết lộ email tồn tại.
- Password hash theo framework; session cookie HttpOnly/Secure/SameSite phù hợp.
- Reset token một lần, có hạn dùng; thu hồi session khi đổi/reset password theo policy.
- Thay email phải xác minh email mới; không mất tài khoản hiện tại nếu xác minh thất bại.
- Có xuất dữ liệu cá nhân và yêu cầu xóa tài khoản qua job có kiểm soát.
- Xóa phải xử lý progress, notes, review, tokens và dữ liệu định danh; audit giữ tối thiểu, pseudonymize nếu cần.
- OAuth Google là tùy chọn sau, không hiển thị nút hoạt động giả khi thiếu cấu hình.
- Tài khoản admin đầu tiên tạo bằng CLI an toàn, không mật khẩu seed cố định trên production.

## 16. CMS quản trị
- CRUD path, unit, lesson, exercise, bộ từ, từ/sense và bài viết.
- Workflow: draft -> in_review -> published -> archived.
- Draft sửa tự do; bản đã publish là immutable version. Edit tạo draft version mới.
- Preview dùng cùng renderer với học viên, nhưng chỉ user được cấp quyền xem draft.
- Publish kiểm tra đủ metadata, bài tập hợp lệ, references, audio và đáp án.
- Bulk reorder có transaction, stable IDs; không làm hỏng attempt đang học.
- Tìm câu hỏi bằng tag, level, type, status, từ khóa.
- Media library: loại file, kích thước, người tải, alt text, nguồn và quyền sử dụng.
- Báo lỗi: học viên chọn sai đáp án/lỗi chính tả/audio/vấn đề khác, gửi mô tả; lưu content version và vị trí.
- Admin đánh dấu open/in_progress/resolved/rejected, ghi lý do và audit.
- Cấu hình logo, favicon, màu theme, tên website, links mạng xã hội, mục tiêu mặc định.
- Không cho cấu hình tùy ý JavaScript trong CMS.

### Import/export
- JSON/CSV nội bộ có schema version; tải template mẫu theo từng loại dữ liệu.
- Import là tiện ích quản trị, không phụ thuộc JSON video.
- Quy trình: upload -> parse -> dry-run -> báo lỗi từng dòng/field -> preview -> xác nhận commit.
- Giới hạn dung lượng, số records; chỉ định rõ reject toàn batch hay partial mode. Mặc định atomic khi batch nhỏ.
- Duplicate detection bằng externalId + namespace hoặc slug; không tự ghi đè published content.
- Import mặc định tạo draft. Chỉ cập nhật khi admin chọn explicit update và thấy diff.
- Batch lớn chạy queue, hiển thị tiến độ/lỗi và có retry idempotent.
- Export phục vụ backup nội dung không chứa mật khẩu, token hoặc dữ liệu user ngoài phạm vi.
- Adapter nhập JSON video cũ là tùy chọn riêng; không bắt buộc ở bản đầu.

## 17. Mô hình dữ liệu tối thiểu
- users, user_profiles, roles/user_roles hoặc cơ chế role đơn giản tương đương.
- learning_paths, units, lessons, lesson_versions, content_blocks.
- exercises, exercise_versions, lesson_exercises.
- enrollments, lesson_progress, attempts, attempt_items.
- vocabulary_entries, vocabulary_senses, vocabulary_sets, vocabulary_set_items, user_vocabulary.
- review_cards, review_events.
- daily_activities, badges, user_badges.
- articles, article_versions, media_assets.
- content_reports, import_jobs, import_errors, audit_logs, site_settings.
- auth/session/token tables theo framework.

### Ràng buộc
- Unique email theo policy canonicalization; unique slug theo loại tài nguyên.
- FK đầy đủ; không cascade-delete lịch sử học từ thao tác xóa nội dung.
- Unique lesson_progress(userId, lessonId).
- Unique answer submission theo attemptItem và idempotency policy.
- Unique review target cho mỗi user; unique user_badge.
- Index: published catalog filters, user attempts/time, review_cards(userId,dueAt), daily_activities(userId,localDate).
- Lưu timestamps UTC. Không dùng float cho điểm cần chính xác; dùng integer units hoặc decimal.
- JSON dùng cho payload theo type; fields cần lọc thường xuyên có column/index riêng.
- Nội dung có version/snapshot giúp đọc lại lịch sử sau khi cập nhật.
- Migration phải có hướng dẫn phục hồi. Không tự chạy destructive migration trên production.

## 18. API / server actions
Có thể dùng REST hoặc framework actions nhưng giữ contracts tương đương:
- GET catalog paths/lessons/search.
- POST enrollments.
- POST attempts: tạo hoặc resume attempt hợp lệ.
- GET attempts/{id}: trạng thái thuộc user.
- PUT attempts/{id}/items/{itemId}: lưu response draft.
- POST attempts/{id}/items/{itemId}/submit: chấm idempotent.
- POST attempts/{id}/finish: tổng kết idempotent.
- GET review/queue; POST review/{cardId}/rate.
- GET/POST/DELETE user vocabulary; PATCH notes.
- GET progress/dashboard.
- POST content-reports.
- Admin actions cho draft, review, publish, import dry-run/commit.

Validation server, pagination, ownership checks và giới hạn request bắt buộc.
Error format ổn định: code, message tiếng Việt, fieldErrors, requestId.
Dùng 401/403/404/409/422/429 theo ngữ nghĩa; không trả stack trace production.
Không cache chung response chứa dữ liệu học viên. Public content cache invalidated khi publish.

## 19. UI và nhận diện
- Thiết kế sạch, thoáng, ưu tiên nội dung học. Nền trắng/kem nhạt, xanh cho CTA, vàng làm điểm nhấn thương hiệu.
- Không dùng nền vàng rực cho toàn bộ lesson dài.
- Logo Một Chút English do chủ dự án cung cấp; nếu chưa có, dùng wordmark tạm có ghi chú, không tự nhận là logo chính thức.
- Font hỗ trợ đầy đủ tiếng Việt, body dễ đọc, cỡ cơ bản khoảng 16px.
- Thiết kế bằng tokens: primary, accent, surface, text, border, radius, spacing, shadow, typography.
- Tách primitives Button/Input/Card/Dialog/Tabs/Toast/Progress và feature components.
- Thay theme không cần sửa logic bài học.
- Desktop sidebar hoặc header; mobile navigation gọn: Hôm nay, Lộ trình, Ôn tập, Tài khoản.
- Lesson player hạn chế điều hướng gây phân tâm.
- Mọi màn hình có loading, empty, success, error, unauthorized, offline khi liên quan.
- Không pop-up xin đăng ký trước khi người dùng xem được nội dung.
- Chibi chỉ trang trí nhẹ, không che bài hoặc giảm diện tích đọc.
- Không đưa jargon kỹ thuật, internal IDs hoặc stack names vào UI người học.

## 20. Accessibility và responsive
- Điều hướng bàn phím, focus rõ, labels cho form, error liên kết field.
- Không dùng màu làm tín hiệu duy nhất cho đúng/sai.
- Audio có transcript; transcript ẩn tạm trong bài kiểm tra nhưng có sau khi nộp.
- Hỗ trợ reduced motion, không nhấp nháy, nút chạm đủ lớn.
- Không bắt buộc drag/drop; mọi thao tác có tap/keyboard alternative.
- Kiểm tra 360px, 390px, tablet và desktop; không cuộn ngang ngoài chủ ý.
- Timer nếu có phải được thông báo rõ, hỗ trợ tắt ở practice.
- Mục tiêu WCAG 2.2 AA cho luồng chính; không tuyên bố đạt chứng nhận nếu chưa audit.

## 21. SEO và marketing
- Public landing, catalog, lesson intro và bài viết render HTML có nội dung thật để crawl.
- Title/meta/canonical tự sinh và override được; mỗi trang public có heading hợp lý.
- Sitemap chỉ URL canonical published có ích; loại draft, tài khoản, kết quả cá nhân và tổ hợp filter mỏng.
- Auth/admin/progress/results và search/filter không cần index: dùng meta/header noindex và access control phù hợp.
- Robots.txt không phải biện pháp bảo vệ dữ liệu và không thay thế noindex.
- Đổi slug có redirect 301; nội dung mất vĩnh viễn trả status phù hợp.
- Open Graph, favicon, breadcrumb.
- Structured data đúng nội dung thực; không bịa rating, review, tác giả hay số học viên.
- Trang landing cho chiến dịch mạng xã hội có UTM; CTA đưa vào bài/lộ trình liên quan.
- Không tạo hàng nghìn trang từ khóa tự động chất lượng thấp.

## 22. Analytics
- Operational dashboard từ database, marketing analytics qua adapter GA4/GTM tùy cấu hình.
- Event contract: signup_completed, onboarding_completed, placement_completed, lesson_started, lesson_completed, exercise_submitted, review_completed, vocabulary_saved.
- Mỗi event có eventId, version, resource ID, timestamp; không gửi email, tên, câu viết riêng tư hay raw notes lên analytics.
- Tránh double firing giữa frontend/backend và khi retry.
- Theo dõi funnel: landing -> học thử -> đăng ký -> bài đầu -> quay lại học.
- Báo cáo cohort D1/D7 cần định nghĩa: user có hoạt động học hợp lệ ở ngày địa phương +1/+7 tính từ ngày đăng ký; không đánh đồng login.
- Tách số liệu vận hành với event analytics vì ad blocker có thể làm thiếu dữ liệu.
- Cấu hình consent phù hợp khu vực triển khai; các yêu cầu pháp lý cụ thể cần được chủ dự án rà soát.

## 23. Bảo mật và dữ liệu
- CSRF cho cookie-auth mutations; chống XSS qua sanitization allowlist; query parametrized.
- Kiểm tra IDOR ở attempts, notes, review, progress và admin resources.
- Rate limit auth, import, reports và các endpoint có chi phí.
- Upload kiểm MIME thực, extension allowlist, dung lượng; không thực thi file tải lên.
- Nội dung SVG chỉ được cho phép nếu có sanitizer đáng tin hoặc chỉ admin cấu hình asset được kiểm duyệt.
- Signed/private media URLs khi dữ liệu cần riêng tư; không expose storage secrets.
- Security headers và CSP phù hợp, HTTPS production.
- Không log password, token, cookies, private notes hoặc câu trả lời chứa PII.
- Audit log không cho editor sửa/xóa.
- Quy định retention cho logs, guest attempts, deleted accounts và backups trong README vận hành.
- Backup có retention rõ và bảo vệ truy cập. Việc xóa dữ liệu trong backup tuân theo vòng đời đã công bố.
- Không dùng dữ liệu người học để huấn luyện hoặc chia sẻ cho bên ngoài mặc định.

## 24. Độ ổn định và hiệu năng
- Pagination cho danh sách, eager loading để tránh N+1, index theo query thực.
- Cache catalog public; dữ liệu tài khoản không dùng cache public.
- Queue cho email/import/export; retry exponential backoff và dead-letter/failed-job view.
- Shared hosting không có daemon: cấu hình cron worker chạy có giới hạn, không overlap; ghi rõ độ trễ dự kiến.
- Không block việc học vì analytics hoặc gửi email thất bại.
- Health endpoint tối giản; diagnostics chi tiết chỉ admin.
- Logs có requestId; ghi nhận exception và failed jobs.
- Không báo "đã lưu" trước khi server xác nhận; thông báo draft local riêng.
- Backup database hằng ngày và media theo lịch phù hợp; mục tiêu ban đầu RPO 24h, RTO 4h, phải kiểm chứng bằng diễn tập phục hồi.
- Mục tiêu kiểm thử: p95 API lưu/chấm câu dưới 800ms và lỗi dưới 1% với 50 phiên đồng thời trên cấu hình staging được ghi lại. Đây là mục tiêu nghiệm thu, không phải cam kết chưa đo.
- Đặt performance budget cho trang đầu: tối ưu ảnh/font, lazy load audio, không tải toàn bộ ngân hàng câu hỏi.
- Nếu không đạt mục tiêu, báo số đo và nút thắt; không che bằng mock.

## 25. Nội dung seed và chất lượng
- Ít nhất 2 path mẫu, mỗi path 2 unit, mỗi unit 3 lesson: tổng 12 lesson có nội dung thật, ngắn và được rà soát.
- 60 exercise trải đều các dạng bản đầu; cung cấp ít nhất 2 ví dụ hợp lệ cho mỗi type renderer.
- 40 vocabulary senses trong 4 bộ từ, có câu ví dụ và bản dịch.
- 3 bài kiến thức ngắn nguyên bản.
- Nếu chưa có audio được cấp quyền, không seed bài nghe ở trạng thái published. Chuẩn bị draft và hướng dẫn thêm media.
- Nội dung mẫu không trùng câu một cách máy móc; không đưa dữ liệu giả vào thống kê thật.
- Seed có external IDs và chạy lại không tạo bản ghi trùng.
- Development có fixtures user/admin cho test; production seed không tạo mật khẩu công khai.
- Trước publish: đúng ngữ pháp, câu hỏi không mơ hồ, distractors hợp lý, đáp án không lộ ở subject/title, explanation dễ hiểu, nguồn media hợp lệ.
- Những bài dịch/open-ended cần chấp nhận nhiều cách diễn đạt và ghi rõ tự đánh giá.

## 26. Acceptance tests bắt buộc
1. Khách vào trang chủ trên điện thoại, mở bài mẫu, học và thấy kết quả không cần đăng nhập.
2. Đăng ký/xác minh/login/logout/reset thực sự hoạt động với môi trường email test.
3. User A không truy cập attempt/notes/progress của user B bằng cách thay ID.
4. Editor không publish nếu workflow yêu cầu admin và không chỉnh role.
5. Admin tạo lesson đủ loại block, preview, publish; user thấy bản mới.
6. Câu hỏi chưa nộp không lộ answer keys qua API hoặc HTML source ở test mode.
7. Điền từ normalize đúng cấu hình; không chấm sai sự khác nhau có nghĩa như can't/cant.
8. Đảo lựa chọn vẫn chấm đúng bằng IDs; token trùng chữ vẫn sắp xếp được.
9. Nộp hai lần, refresh hoặc retry mạng không cộng điểm/hoàn thành hai lần.
10. Mở hai tab và nộp xung đột có phản hồi rõ, không ghi đè im lặng.
11. Thoát giữa bài, đăng nhập lại và resume đúng vị trí.
12. Publish version mới không làm thay đổi đáp án/lịch sử attempt cũ.
13. Review ratings tạo lịch đúng, có test clock cố định, timezone và ranh giới ngày.
14. Review target trùng không tạo duplicate; due queue đúng quyền.
15. Bài tự đánh giá không bị tính vào objective accuracy.
16. Nội dung archive không làm crash dashboard hoặc kết quả cũ.
17. Import JSON lỗi hiển thị field cụ thể, dry-run không ghi DB, commit retry không duplicate.
18. Không có SMTP/audio thì UI thông báo đúng, không giả thành công.
19. Restore backup vào database mới và kiểm tra đăng nhập, lesson và progress.
20. Kiểm tra XSS, CSRF, rate limit và upload file không hợp lệ.
21. Lesson player thao tác bằng bàn phím, mobile không tràn khung.
22. Sitemap/canonical/noindex đúng theo public/private status.
23. Đo performance với dữ liệu và cấu hình được mô tả; lưu report.
24. Bản build production không còn credentials, debug toolbar hoặc mock network responses.

## 27. Giai đoạn triển khai và điều kiện hoàn tất
### Giai đoạn 1: Nền móng + một luồng học hoàn chỉnh
Repo, môi trường, database, auth, roles, theme tokens; CMS tối thiểu tạo/publish lesson; learner mở lesson, làm multiple choice, lưu attempt và xem kết quả.
Hoàn tất khi luồng từ admin tạo đến user học chạy với DB thật và có test quyền/idempotency.

### Giai đoạn 2: Sản phẩm học
Paths/units, toàn bộ exercise types, onboarding, placement gợi ý, progress, vocabulary, review, guest migration, resume, versioning.
Hoàn tất khi tests học và ôn chạy qua, dữ liệu tồn tại sau restart.

### Giai đoạn 3: Quản trị và ra mắt
Workflow biên tập, import/export, reports, SEO, analytics, seed, accessibility, performance, backup/restore, deploy docs.
Hoàn tất khi staging đáp ứng acceptance tests và không còn chức năng giả trong scope bản đầu.

### Giai đoạn sau
Premium/payment, AI tutor, speaking assessment, teacher dashboards hoặc app chỉ thêm sau khi xác định nhu cầu. Không xây sẵn hệ thống phức tạp chưa dùng.

## 28. Deliverables bắt buộc
- Source code có cấu trúc rõ và lockfiles.
- Database migrations và seed idempotent.
- .env.example và README setup local/staging/production.
- docs/architecture.md, docs/decisions.md, docs/data-model.md.
- docs/content-authoring.md và JSON/CSV templates.
- docs/api.md hoặc contracts tương đương.
- docs/operations.md: deploy, cron/queue, email, backup, restore, rollback, monitoring.
- docs/testing.md và kết quả tests/performance thực tế.
- docs/progress.md: checklist đã làm/chưa làm và blockers.
- Bộ test tự động cho luồng học, grading, review scheduling, quyền và request lặp.
- Tài khoản quản trị tạo bằng lệnh an toàn và hướng dẫn sử dụng.
- Danh sách cấu hình chủ dự án cần cung cấp trước khi ra mắt: domain, hosting, SMTP, storage, logo, analytics, nội dung pháp lý và media.

## 29. Definition of Done
Một chức năng chỉ được đánh dấu xong nếu:
- Có giao diện hoạt động và xử lý trạng thái lỗi.
- Có dữ liệu bền vững hoặc hợp đồng rõ cho dữ liệu tạm.
- Có validation và authorization server.
- Có kiểm thử quan trọng đúng với rủi ro của chức năng.
- Không dựa vào dữ liệu giả hoặc success message giả.
- Có thể sử dụng qua luồng thật, không cần sửa DB thủ công.
- Hướng dẫn vận hành đủ để người khác chạy và khôi phục.
- Không có lỗi nghiêm trọng hoặc blocker còn mở trong luồng cốt lõi.

Bắt đầu thực hiện từ Giai đoạn 1. Sau mỗi giai đoạn báo cáo bằng chứng chạy thật, không chỉ ảnh chụp giao diện.

## 30. Gamification - đặc tả tích hợp
Phần này bổ sung và cụ thể hóa mục 14, thuộc scope phát hành đầu tiên trừ các mục ghi "giai đoạn sau". Các con số bên dưới là cấu hình khởi đầu do dự án đề xuất, không phải công thức của Duolingo hay bảo đảm hiệu quả.

### 30.1 Nguyên tắc trải nghiệm
- Học theo vòng lặp: mục tiêu nhỏ -> bài học -> phản hồi -> ghi nhận tiến bộ -> ôn lại -> bài tiếp theo.
- Có bản đồ lộ trình theo unit với các node lesson, ôn tập và checkpoint. Có chế độ danh sách tương đương để dễ dùng và truy cập bằng bàn phím.
- Node thể hiện chưa học/đang học/hoàn thành/đạt; không khóa bài mới chỉ vì hết tiền ảo hoặc hết lượt sai.
- Một lesson có thể chia thành các chặng 3-5 phút; chặng là các block của lesson, không tạo bản ghi lesson giả để kiếm XP.
- Phản hồi đúng/sai ngắn, giải thích có ích, hiệu ứng nhẹ có thể tắt.
- Không mất quyền học khi trả lời sai. Không triển khai hearts/energy giới hạn việc học ở bản đầu.
- XP thể hiện mức tham gia, không đại diện trình độ CEFR hoặc năng lực tiếng Anh.
- Giữ thương hiệu vàng - xanh và nhân vật riêng. Không sao chép logo, mascot, nội dung, âm thanh hoặc bố cục pixel của Duolingo.

### 30.2 XP và cấp độ hoạt động
| Sự kiện | XP mặc định | Giới hạn |
| --- | --- | --- |
| Hoàn thành lesson lần đầu | 20 | Một lần cho user + lesson ổn định |
| Lần đầu đạt lesson có chấm khách quan | 5 | Một lần cho user + lesson, có thể ở lần học sau |
| Học lại lesson đã hoàn thành | 5 | Tối đa 2 lesson khác nhau/ngày; không cộng nếu vừa nhận first completion cùng ngày |
| Ôn một thẻ đã đến hạn | 2 | Tối đa 10 thẻ khác nhau/ngày; rating không đổi số XP |
| Hoàn thành checkpoint lần đầu | 30 | Một lần cho user + checkpoint; không cộng thêm lesson XP cho cùng checkpoint |

- Không có XP cho đăng nhập, refresh, lưu từ hoặc chỉ lật thẻ.
- Bài tự đánh giá có thể nhận completion XP nhưng không nhận accuracy bonus.
- Phiên bản nội dung mới không reset first-completion reward.
- Level hoạt động: level = 1 + floor(totalXP / 200); tách hoàn toàn khỏi level học A1/A2/B1.
- Tổng XP là tổng ledger, cache balance có job reconciliation. Không cho client set totalXP.
- Rewards có ruleVersion và unique event key. Transaction hoặc transactional outbox đảm bảo hoàn thành bài và phát thưởng không lệch nhau.
- Retry, nhiều tab hoặc job chạy lại không cấp thưởng hai lần.
- Điều chỉnh admin dùng compensating ledger entry có lý do/audit, không sửa lịch sử âm thầm.
- Khi tắt gamification, chức năng học và progress vẫn hoạt động.

### 30.3 Nhiệm vụ hằng ngày
Tối đa 3 nhiệm vụ phù hợp nội dung user có thể học:
1. Hoàn thành 1 lesson.
2. Ôn min(5, số thẻ đến hạn tại lúc tạo nhiệm vụ) thẻ khác nhau.
3. Trả lời đúng lần đầu 5 câu khách quan khác nhau.

- Nếu không có thẻ đến hạn, thay nhiệm vụ ôn bằng hoàn thành 1 bài luyện khả dụng; không tạo nhiệm vụ bất khả thi.
- Nếu không có đủ câu khách quan, giảm target hoặc bỏ nhiệm vụ thứ ba.
- Snapshot nhiệm vụ và targets khi người dùng mở ngày học lần đầu; không đổi target giữa ngày.
- Reset theo timezone ngày đã chốt. Thay timezone có hiệu lực cho chu kỳ nhiệm vụ tiếp theo và có cooldown 7 ngày để tránh lặp thưởng; vẫn cho đổi hiển thị giờ ngay.
- Một hoạt động có thể tiến triển nhiều nhiệm vụ nhưng mỗi task chỉ được nhận thưởng một lần.
- Progress đến từ events server; không nhận progress counter do client khai báo.
- Không có nhiệm vụ ép mời bạn, chia sẻ mạng xã hội hoặc bật thông báo.
- Mỗi nhiệm vụ thưởng 5 xu học tập; hoàn thành cả bộ thưởng thêm 5 xu. Xu không phải tiền thật.

### 30.4 Streak và ngày nghỉ
- Định nghĩa hoạt động hợp lệ theo mục 14; một ngày chỉ tăng streak tối đa 1.
- Lưu currentStreak, longestStreak và streak_calendar: learned/protected/missed.
- Đề xuất "vé nghỉ": sau mỗi 7 ngày thực sự học tích lũy, cấp 1 vé, tồn kho tối đa 2. Ngày protected không được tính vào 7 ngày này.
- Cuối ngày không học: tự dùng vé có sẵn trước khi ngày đó kết thúc nếu user bật auto-protect.
- Ngày protected giữ chuỗi nhưng không cộng thêm một ngày đã học; lịch hiển thị khác màu và có nhãn.
- Không có vé thì reset currentStreak khi chuỗi bị gián đoạn; giữ longestStreak và toàn bộ tiến độ.
- Job hằng ngày và xử lý lazy khi login đều gọi cùng một hàm idempotent, khóa theo user + localDate.
- Không cho dùng vé kiếm được hôm sau để bảo vệ ngược ngày trước.
- Thay timezone không sửa lịch đã chốt hoặc tạo trùng ngày học.
- Copy khi đứt chuỗi: khuyến khích bắt đầu lại; không đe dọa hoặc làm người học xấu hổ.

### 30.5 Xu và phần thưởng
- Bản đầu chỉ dùng xu mua vật phẩm trang trí: màu avatar, khung hồ sơ, huy hiệu trang trí.
- Không bán xu bằng tiền thật, không chuyển giữa users, không đổi tiền, không loot box.
- Xu không mở khóa đáp án, không mua điểm kiểm tra, không giới hạn quyền học.
- Catalog mẫu 3 vật phẩm với giá 30/60/100 xu, ảnh hoặc CSS thật hoạt động.
- Purchase có transaction + lock balance, idempotency và unique ownership; không cho số dư âm.
- Vật phẩm đã mua vẫn được sở hữu khi catalog bị ẩn; có fallback hiển thị.
- XP và xu là hai ledger/balance khác nhau; không đổi XP lấy xu tùy ý.

### 30.6 Checkpoint, thành tích và mức độ ghi nhớ
- Cuối unit có checkpoint ngắn, lấy câu từ blueprint, ưu tiên biến thể mới thay vì lặp nguyên bài ngay trước.
- Checkpoint có threshold 80% mặc định; chưa đạt thì gợi ý ôn và được thử lại.
- Không làm checkpoint trở thành rào cản bắt buộc ở bản đầu.
- Badge gắn với hoạt động có ý nghĩa: bài đầu, unit đầu, 7 ngày thực học, ôn 50 thẻ khác nhau.
- Mức ghi nhớ từ/cấu trúc dựa vào review history, không dựa vào XP.
- Tránh dùng nhãn "thành thạo" chỉ vì vừa làm đúng một lần.

### 30.7 Nhắc học và màn hình
- Dashboard có XP/level nhỏ, streak, tasks và bài tiếp theo; CTA chính luôn là học hoặc ôn.
- Màn kết quả hiển thị kiến thức vừa học, lỗi cần ôn trước; thưởng XP/xu đứng sau.
- Nhắc học là opt-in, user chọn giờ và tắt bất cứ lúc nào.
- Email tối đa 1 lời nhắc học/ngày; không gửi nếu đã có hoạt động hợp lệ trước lúc gửi.
- Queue kiểm lại trạng thái ngay trước gửi, retry không gửi trùng; unsubscribe có hiệu lực ngay.
- Browser push và social quests để giai đoạn sau, không hiển thị nút giả.
- Bảng xếp hạng/league chỉ làm sau khi có người học thật, opt-in và quy tắc chống gian lận. Không seed người dùng giả để tạo cạnh tranh.

### 30.8 Dữ liệu và APIs bổ sung
Tables:
- reward_ledger(userId, currency, amount, sourceType, sourceId, eventKey UNIQUE, ruleVersion, createdAt).
- user_reward_balances(userId, currency UNIQUE together, amount).
- daily_quest_instances(userId, localDate, templateId, targetSnapshot, progress, status, ruleVersion), quest_events với unique source event.
- streak_calendar(userId, localDate UNIQUE together, status, timezone, evaluatedAt).
- streak_inventory_events, user_streak_state.
- reward_catalog, user_inventory(userId,itemId UNIQUE together), reward_purchases.
- reminder_preferences, reminder_delivery_logs với unique user + localDate + reminderType.
- checkpoints và checkpoint blueprint hoặc lesson subtype có exclusion rule rõ.

Endpoints:
- GET /me/rewards, /me/quests, /me/streak, /reward-shop.
- POST /reward-shop/{itemId}/purchase.
- PATCH /me/avatar-style và /me/reminders.
- Không có endpoint public "cộng XP". Award chỉ xuất phát từ validated domain events server.
- Quest claim nếu có UI nhận thưởng phải idempotent; mặc định tự cấp sau completion.

### 30.9 Kiểm thử và triển khai
Bổ sung acceptance tests:
- Completion đồng thời/retry chỉ cộng XP/xu một lần.
- Học lại/publish version mới không farm first-completion XP.
- Hai purchase đồng thời không làm âm balance hoặc mua trùng.
- Quest hết ngày, đổi timezone và server restart không reset sai.
- Streak job/lazy evaluation đồng thời chỉ tiêu vé một lần.
- Ngày protected giữ chuỗi nhưng không cấp XP, không tăng số ngày thực học.
- Reminder không gửi cho user đã học, đã unsubscribe hoặc đã được gửi cùng ngày.
- Tắt animation/gamification không chặn lesson hoặc mất progress.
- Rebuild balances từ ledger khớp cache; correction entries có audit.

Giai đoạn 1 thêm domain event và reward ledger tối thiểu.
Giai đoạn 2 thêm path map, XP, tasks, streak protection, badges, shop trang trí.
Giai đoạn 3 thêm reminder email, analytics và tests gamification.
Analytics bổ sung: quest_completed, reward_awarded, reward_purchased, streak_protected.
Đo tỉ lệ hoàn thành bài, retention, kết quả ôn sau 7 ngày và feedback; không tối ưu riêng XP hoặc thời gian mở app.

## 31. Tài liệu tham khảo thiết kế gamification
Đã tham khảo ngày 20/10/2026. Đây là nguồn cảm hứng cho nguyên tắc, không phải yêu cầu sao chép sản phẩm.
- Duolingo, How to Use Duolingo for Language Learning: https://blog.duolingo.com/duolingo-101-how-to-learn-a-language-on-duolingo/
- Duolingo, The Duolingo Streak Uses Habit Research to Keep You Motivated: https://blog.duolingo.com/how-duolingo-streak-builds-habit/
- Duolingo, Time Spent Learning Well: https://blog.duolingo.com/time-spent-learning-well/
Các quy tắc XP, vé nghỉ, nhiệm vụ, xu và mức giá trong spec này là đề xuất riêng cho Một Chút English, cần đo và điều chỉnh sau thử nghiệm.


