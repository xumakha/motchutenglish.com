import { PageHeading } from "@/components/page-heading";
import { Dashboard } from "@/components/learning";
export const metadata = { title: "Góc học tập" };
export default function Page() {
  return (
    <div className="container page">
      <PageHeading
        eyebrow="GÓC HỌC TẬP"
        title="Mỗi bước nhỏ đều được ghi nhận."
        description="Xem tiến độ và tiếp tục từ nơi bạn đã dừng lại."
      />
      <Dashboard />
    </div>
  );
}
