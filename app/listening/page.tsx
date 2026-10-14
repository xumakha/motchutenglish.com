import { ListeningLibrary } from "@/components/learning";
import { PageHeading } from "@/components/page-heading";
export const metadata = { title: "Luyện nghe" };
export default function Page() {
  return (
    <div className="container page">
      <PageHeading
        eyebrow="THƯ VIỆN LUYỆN NGHE"
        title="Nghe quen, nói tự tin hơn."
        description="Những hội thoại ngắn cho đời sống và công việc. Nghe theo tốc độ của bạn, rồi thử trả lời câu hỏi."
      />
      <ListeningLibrary />
      <div className="note spaced">
        🎧 Bài nghe sử dụng giọng đọc tiếng Anh của trình duyệt. Chất lượng
        giọng đọc có thể khác nhau tùy thiết bị.
      </div>
    </div>
  );
}
