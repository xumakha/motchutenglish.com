import type { Metadata } from "next";
import { LegacyScripts, Overview } from "@/components/legacy/markup";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { courses } from "@/site/queries/legacy";
import { pageMetadata } from "@/site/seo";

// Port of views/pages/toeic.php (Pages::toeic).

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/toeic", "TOEIC cơ bản");
}

const FEATURES: [string, string][] = [
  ["Listening", "Làm quen câu hỏi và đáp ở Part 2."],
  ["Grammar", "Luyện động từ và giới từ ở Part 5."],
  ["Reading", "Đọc thông báo ngắn ở Part 7."],
];

export default function Page() {
  return (
    <SiteShell page="toeic">
      <PageHeading
        title="Bắt đầu TOEIC, từng chút một."
        description="Làm quen với dạng câu hỏi trước khi luyện đề. Tập trung vào từ vựng công sở, ngữ pháp và đọc hiểu."
        eyebrow="TOEIC · XÂY NỀN TẢNG"
      />
      <div className="toeic-features">
        {FEATURES.map(([label, desc]) => (
          <div key={label} className="panel">
            <h3>{label}</h3>
            <p>{desc}</p>
          </div>
        ))}
      </div>
      <Overview c={courses[2]!} />
      <div className="note spaced">
        Nội dung luyện tập tự biên soạn, không phải đề TOEIC chính thức. Mục tiêu điểm số là định
        hướng học, không phải cam kết kết quả.
      </div>
      <LegacyScripts />
    </SiteShell>
  );
}
