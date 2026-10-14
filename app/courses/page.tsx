import { PageHeading } from "@/components/page-heading";
import { CourseList } from "@/components/learning";
export const metadata = { title: "Lộ trình học" };
export default function Page() {
  return (
    <div className="container page">
      <PageHeading
        eyebrow="HỌC THEO MỤC TIÊU"
        title="Chọn lớp, bắt đầu hành trình."
        description="Từ nền tảng đầu tiên đến giao tiếp công sở và TOEIC. Mỗi bài học là một bước nhỏ."
      />
      <CourseList />
      <div className="note spaced">
        🌱 Không chắc mình ở đâu? Bắt đầu từ lớp cơ bản và chuyển sang lộ trình
        khác khi bạn sẵn sàng.
      </div>
    </div>
  );
}
