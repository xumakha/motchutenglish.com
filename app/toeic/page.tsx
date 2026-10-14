import { Headphones, BookOpen, PenLine } from "lucide-react";
import { CourseOverview } from "@/components/learning";
import { PageHeading } from "@/components/page-heading";
import { courses } from "@/lib/courses";
export const metadata = { title: "TOEIC cơ bản" };
export default function Page() {
  return (
    <div className="container page">
      <PageHeading
        eyebrow="TOEIC · XÂY NỀN TẢNG"
        title="Bắt đầu TOEIC, từng chút một."
        description="Làm quen với dạng câu hỏi trước khi luyện đề. Tập trung vào từ vựng công sở, ngữ pháp và đọc hiểu."
      />
      <div className="toeic-features">
        {[
          [Headphones, "Listening", "Làm quen câu hỏi và đáp ở Part 2."],
          [PenLine, "Grammar", "Luyện động từ và giới từ ở Part 5."],
          [BookOpen, "Reading", "Đọc thông báo ngắn ở Part 7."],
        ].map(([Icon, title, desc]) => {
          const I = Icon as typeof Headphones;
          return (
            <div className="panel" key={String(title)}>
              <I size={24} />
              <h3>{String(title)}</h3>
              <p>{String(desc)}</p>
            </div>
          );
        })}
      </div>
      <CourseOverview course={courses[2]} />
      <div className="note spaced">
        Nội dung luyện tập tự biên soạn, không phải đề TOEIC chính thức. Mục
        tiêu điểm số là định hướng học, không phải cam kết kết quả.
      </div>
    </div>
  );
}
