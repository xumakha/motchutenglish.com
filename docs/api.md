# Hợp đồng HTTP giai đoạn 1

- GET /hoc: catalog published, 20 lượt gần nhất của chính user và tổng XP.
- GET/POST /admin: editor/admin tạo hoặc sửa nháp; chỉ admin publish. Query edit=ID tải nháp vào form. action=edit với lesson_id sửa draft; published trả 422.
- GET/POST /admin/preview/{id}: editor/admin, POST chấm thử nhưng không lưu dữ liệu học.
- POST /hoc/bai/{id}: mở bài published, request_key 32 hex. Retry cùng user/lesson/key dùng lại snapshot; dùng key của lượt khác trả 409. GET trả 405.
- GET/POST /ket-qua/{id}: giới hạn chủ sở hữu; không tồn tại/khác chủ trả 404. POST nhận response stable ID, bỏ qua điểm client. Câu chưa nộp không render đáp án hoặc giải thích.
- Mọi POST yêu cầu CSRF; sai trả 403. Response không hợp lệ trả 422. Nộp lại cùng đáp án idempotent; đáp án khác trả 409, hiển thị kết quả cũ.

Form HTML dùng redirect 303 sau ghi thành công. Lỗi DB trả 503, không báo đã lưu. Chưa có JSON public API, revision theo từng câu hay đồng bộ offline.
