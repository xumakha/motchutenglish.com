import { PageHeading } from "@/components/page-heading";
import { PlacementTest } from "@/components/learning";
export const metadata = { title: "Tìm lớp phù hợp" };
export default function Page() {
  return (
    <div className="container page">
      <PageHeading
        eyebrow="TÌM ĐIỂM BẮT ĐẦU"
        title="Bạn đang ở đâu?"
        description="6 câu hỏi nhỏ để gợi ý một lộ trình phù hợp. Không giới hạn thời gian, không cần đăng nhập."
      />
      <PlacementTest />
    </div>
  );
}
