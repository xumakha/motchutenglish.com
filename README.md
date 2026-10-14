# Một chút English

Website học tiếng Anh sử dụng **Next.js App Router, TypeScript, React**.

## Chạy tại máy

Cài Node.js 20.9 trở lên, sau đó chạy tại thư mục dự án:

```bash
npm install
npm run dev
```

Mở http://localhost:3000.

Trong workspace hiện tại đã có Node portable và dependencies. Có thể chạy trực tiếp trong PowerShell:

```powershell
.\dev.cmd
```

```bash
npm run typecheck
npm run build
npm start
```

## Các trang

- `/`: trang chủ
- `/courses`: phân lớp và lọc lộ trình
- `/courses/[courseId]`: danh sách bài và tiến độ
- `/courses/[courseId]/[lessonId]`: mẫu câu, từ vựng, nghe và câu hỏi
- `/listening`: thư viện hội thoại
- `/listening/[id]`: luyện nghe và trả lời câu hỏi
- `/toeic`: nền tảng TOEIC
- `/placement`: 6 câu kiểm tra để gợi ý lớp
- `/dashboard`: tiến độ và tiếp tục học

Nội dung nằm trong `lib/courses.ts`: 12 bài học, 3 bài nghe. Tiến độ lưu bằng localStorage, chưa có tài khoản, cơ sở dữ liệu hay đồng bộ thiết bị. Âm thanh dùng Web Speech API của trình duyệt. Bài kiểm tra chỉ gợi ý lộ trình; nội dung TOEIC là bài tự biên soạn.

## Triển khai

Có thể triển khai như dự án Next.js thông thường trên Vercel hoặc máy chủ Node.js. Không cần biến môi trường.
