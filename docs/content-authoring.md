# Biên soạn

1. Đăng ký tài khoản tại /register. Cấp role bằng CLI: php database/set-role.php EMAIL admin (hoặc editor).
2. Vào /admin, tạo bản nháp với tên, nội dung, câu hỏi, hai lựa chọn, đáp án đúng và giải thích.
3. Dùng Sửa bản nháp để sửa. Xem trước dùng cùng renderer và grading engine với player; nộp preview không lưu attempt, XP hay sự kiện.
4. Admin xuất bản; editor không được publish. Bài published được giữ nguyên.
5. Học viên vào /hoc, mở bài, nộp câu và xem kết quả. Lượt chưa nộp nằm trong lịch sử để tiếp tục.

Có thể chạy php database/seed-learning.php sau khi có admin để tạo một bài mẫu dạng nháp. Chạy lại không ghi đè chỉnh sửa. Chưa hỗ trợ media, import/export, JSON/CSV template hoặc nhiều block/câu trong CMS. Không nhập đáp án qua HTML tùy ý.
