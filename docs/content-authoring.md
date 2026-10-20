# Biên tập nội dung

Đăng nhập editor/admin, vào `/admin/paths`, tạo lộ trình và chương; `/admin/lessons` tạo bài với document theo `database/templates/lesson.json`. `/admin/questions` lọc keyword/type/level/tag/status; sửa trong draft document. IDs là định danh, không dùng chữ đáp án như `correct` cho lựa chọn placement.

Document có schemaVersion, objectives, estimatedMinutes, level, blocks và exercises. Mẫu đầy đủ các dạng ở `all-exercises.json`. Nội dung text được escape; player hỗ trợ bold/italic bằng text nodes, không chèn HTML từ editor. Exercise type: choice, true_false, fill, order, match, correction, listening_choice, listening_fill, closed, self, flashcard. Token/pair/option IDs độc lập chữ hiển thị. Fill ghi rõ caseSensitive/ignorePunctuation/acceptedAnswers; apostrophe được giữ phân biệt can't/cant. Self/flashcard điểm null.

Preview tại CMS dùng cùng player/grader, mode preview không tạo tiến độ/rewards. Lưu draft -> gửi review (editor) -> publish (admin). Published lesson sửa sẽ tạo version mới; học viên đang học vẫn dùng bản cũ. Archive chỉ ẩn catalog. Slug đổi khi publish tạo301, tránh vòng redirect. Checkpoint cần blueprint questionIds, placement đúng20 câu và rules trỏ đường dẫn đã có nội dung.

Media tải qua `/admin/media`: JPG/PNG/WebP/MP3/OGG/WAV <=10MB, kiểm MIME+extension; không SVG/script. Bắt buộc alt, nguồn, quyền sử dụng. File nằm private trong writable/media, download có kiểm quyền tham chiếu. Listening publish cần audio hợp lệ, transcript và quyền. Không dùng TTS để giả file đã có bản quyền. Từ vựng có thể gắn audio từ media; bộ từ chỉnh membership bằng sense IDs. Hãy tạo bộ nháp, thêm nghĩa published, rồi publish bộ.

Import `/admin/imports`: JSON schemaVersion1 theo template lesson/import/paths/units/articles/vocabulary_sets; CSV dành từ vựng theo vocabulary.csv. Mỗi batch chỉ một loại. Record tham chiếu path_id/unitId đã tồn tại; dùng IDs từ CMS. namespace+externalId hoặc slug chống trùng. Upload/dán -> dry-run lỗi record/field -> kiểm preview -> commit. Dry-run chỉ lưu hồ sơ preview, không tạo nội dung. Tối đa1MB/1000records; <=100 atomic trực tiếp, lớn hơn queued atomic bởi worker. Lỗi bất kỳ rollback toàn batch. Retry commit không tạo duplicate. Nhập mặc định draft, không có cập nhật ghi đè tự động. Nếu cần sửa, mở CMS tạo draft mới và xem bản cũ trước publish.

Xuất catalog qua yêu cầu queue ở CMS, tệp riêng24h. Content export có metadata/versions/media references, không gồm users/password/token/notes. Đây không thay thế SQL+media backup. Report lưu version và vị trí; editor/admin xử lý open/in_progress/resolved/rejected kèm lý do và audit.

Seed: `seed-product.php` idempotent, 2 lộ trình khả dụng x2chương, mỗi chương ít nhất3bài;15bài gồm4checkpoint, thêm placement20 và2 bản nháp nghe;90exercises,40senses/4sets,3bài kiến thức gốc. Không seed người học/thành tích. Mẫu nghe giữ draft đến khi chủ dự án tải audio hợp lệ và duyệt nội dung. Không quảng cáo hai lộ trình mở rộng chưa có bài.
