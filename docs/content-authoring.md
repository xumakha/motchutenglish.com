# Biên tập nội dung

Đăng nhập editor/admin, vào `/admin/paths`, tạo lộ trình và chương; `/admin/lessons` tạo bài với document theo `templates/lesson.json` (tải trong CMS qua `/du-lieu/template-lesson`). `/admin/questions` lọc keyword/type/level/tag/status; sửa trong draft document. IDs là định danh, không dùng chữ đáp án như `correct` cho lựa chọn placement.

Document có schemaVersion, objectives, estimatedMinutes, level, blocks và exercises. Mẫu đầy đủ các dạng ở `templates/all-exercises.json`. Nội dung text được escape; player hỗ trợ bold/italic bằng text nodes, không chèn HTML từ editor. Exercise type: choice, true_false, fill, order, match, correction, listening_choice, listening_fill, closed, self, flashcard. Token/pair/option IDs độc lập chữ hiển thị. Fill ghi rõ `caseSensitive`/`ignoreTerminalPunctuation` (chỉ bỏ dấu câu ở cuối)/`acceptedAnswers`; apostrophe được giữ phân biệt can't/cant. Self/flashcard điểm null.

Preview tại CMS dùng cùng player/grader, mode preview không tạo tiến độ/rewards. Lưu draft -> gửi review (editor) -> publish (admin). Published lesson sửa sẽ tạo version mới; học viên đang học vẫn dùng bản cũ. Archive chỉ ẩn catalog. Slug đổi khi publish tạo301, tránh vòng redirect. Checkpoint cần blueprint questionIds, placement đúng20 câu và rules trỏ đường dẫn đã có nội dung.

Media tải qua `/admin/media`: JPG/PNG/WebP/MP3/OGG/WAV <=10MB, kiểm MIME+extension; không SVG/script. Bắt buộc alt, nguồn, quyền sử dụng. File nằm private trong writable/media, download có kiểm quyền tham chiếu. Listening publish cần audio hợp lệ, transcript và quyền. Không dùng TTS để giả file đã có bản quyền. Từ vựng có thể gắn audio từ media; bộ từ chỉnh membership bằng sense IDs. Hãy tạo bộ nháp, thêm nghĩa published, rồi publish bộ.

Import `/admin/imports`: JSON schemaVersion1 theo template lesson/import/paths/units/articles/vocabulary_sets; CSV dành từ vựng theo vocabulary.csv. Mỗi batch chỉ một loại. Record tham chiếu path_id/unitId đã tồn tại; dùng IDs từ CMS. namespace+externalId hoặc slug chống trùng. Upload/dán -> dry-run lỗi record/field -> kiểm preview -> commit. Dry-run chỉ lưu hồ sơ preview, không tạo nội dung. Tối đa1MB/1000records; <=100 atomic trực tiếp, lớn hơn queued atomic bởi worker. Lỗi bất kỳ rollback toàn batch. Retry commit không tạo duplicate. Nhập mặc định draft, không có cập nhật ghi đè tự động. Nếu cần sửa, mở CMS tạo draft mới và xem bản cũ trước publish.

Xuất catalog qua yêu cầu queue ở CMS, tệp riêng24h. Content export có metadata/versions/media references, không gồm users/password/token/notes. Đây không thay thế SQL+media backup. Report lưu version và vị trí; editor/admin xử lý open/in_progress/resolved/rejected kèm lý do và audit.

Seed: `pnpm seed` (nội dung từ `seed/product-seed.json`) chạy lại không ghi đè; mặc định tạo bản nháp, `--publish-reviewed-samples` xuất bản các mẫu đã duyệt. Nội dung mẫu: 2 lộ trình khả dụng x2chương, mỗi chương ít nhất3bài;15bài gồm4checkpoint, thêm placement20 và2 bản nháp nghe;90exercises,40senses/4sets,3bài kiến thức gốc. Không seed người học/thành tích. Mẫu nghe giữ draft đến khi chủ dự án tải audio hợp lệ và duyệt nội dung. Không quảng cáo hai lộ trình mở rộng chưa có bài.


## Flashcard trong lesson — cập nhật 22/10/2026

Dùng `type: "flashcard"` với `payload.prompt` làm mặt trước, `payload.modelAnswer` làm đáp án mẫu mặt sau, `payload.criteria` dạng chuỗi/danh sách làm tiêu chí, và `explanation` làm hướng dẫn đối chiếu. Ghi nhớ cá nhân là text tùy chọn trong response cũ; không đổi schema hoặc chuyển thành objective answer.

Practice/preview: người học tự nhớ, tùy chọn ghi chú rồi “Lật thẻ và tự đánh giá”; mặt sau chỉ được dựng từ feedback máy chủ sau khi nộp thành công. Test: nộp thẻ nhưng không hiện đáp án/tiêu chí trước finish. Sau khi có feedback, nút xem mặt trước/sau chỉ đổi giao diện, không nộp lại hoặc thay điểm. Skip giữ nhãn đã bỏ qua. Refresh giữ ghi nhớ đã nộp; mất mạng không lật giả thành công, outbox có thể gửi lại khi kết nối.

`score`, `maxScore`, `isCorrect` vẫn null với thẻ tự đánh giá; không cộng vào objective accuracy. Đây không phải phiên `/on-tap` và không lưu bốn ratings/đặt lịch ôn từ thao tác lật. Payload hiện chưa có bộ field mặt sau IPA/POS/ví dụ riêng; có thể biên soạn chúng trong modelAnswer dạng text, không chèn HTML hoặc coi là dictionary widget mới.
