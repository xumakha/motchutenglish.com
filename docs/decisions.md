# Quyết định

- Giữ PHP/PDO hiện hữu và dữ liệu cũ; chưa chuyển stack hoặc import tiến độ trình duyệt.
- Local dùng database motchutenglish qua XAMPP. Thông tin kết nối riêng trong application/config/database.php, không đưa lên Git. Root không mật khẩu chỉ dùng cho local.
- Bài mới giới hạn văn bản và một câu trắc nghiệm hai lựa chọn; IDs one/two ổn định. Đúng đạt 100%, sai vẫn ghi hoàn thành.
- Snapshot tại thời điểm bắt đầu; bài xuất bản bất biến qua CMS. Sửa nháp được phép, sửa published bị từ chối. Stable lesson versioning đầy đủ thuộc giai đoạn 2.
- Nộp lại cùng response trả kết quả cũ; response khác trả 409 và giữ kết quả đầu. Resume từ lịch sử /hoc.
- Completion thưởng 20 XP, lần đầu đạt thêm 5; không có thưởng học lại trong giai đoạn này. XP tính từ ledger, chưa dùng cache balance.
- Seed là bài mẫu dạng nháp, admin duyệt rồi xuất bản. Không seed học viên hay thành tích giả.
- Chưa có SMTP/AI/thanh toán. Không công bố các tính năng đó đã hoạt động.
