import type { Metadata } from "next";
import { Suspense } from "react";
import { startLesson } from "@/actions/routes";
import { RouteForm } from "@/components/route-form";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { randomHex } from "@/domain/php";
import { placementLesson } from "@/site/queries/public";
import { pageMetadata } from "@/site/seo";

// Port of the kiem-tra-dau-vao branch of views/product/page.php: the placement test entry.

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/kiem-tra-dau-vao", "Kiểm tra gợi ý học");
}

async function Start() {
  const placement = await placementLesson();
  return placement ? (
    <RouteForm
      action={startLesson}
      fields={{ lessonId: placement.id, mode: "test", requestKey: randomHex(16) }}
      label="Bắt đầu kiểm tra"
    />
  ) : (
    <p>Bộ câu hỏi chưa được xuất bản.</p>
  );
}

export default function Page() {
  return (
    <SiteShell page="kiem-tra-dau-vao">
      <PageHeading
        eyebrow="KIỂM TRA GỢI Ý"
        title="20 câu để tìm điểm bắt đầu."
        description="Bạn có thể bỏ qua câu khó. Kết quả giúp gợi ý lộ trình để bắt đầu học."
      />
      <div className="courses-grid">
        <section className="panel">
          <h2>Bạn sẽ nhận được</h2>
          <ul>
            <li>Gợi ý lộ trình để bắt đầu học</li>
            <li>Đáp án và giải thích sau khi kết thúc</li>
            <li>Có thể bỏ qua câu khó và tiếp tục bài đang làm</li>
          </ul>
          <Suspense>
            <Start />
          </Suspense>
        </section>
        <section className="panel" style={{ background: "var(--sun-soft)" }}>
          <h2>Lưu ý nhỏ</h2>
          <p>
            Bài cố định 20 câu gợi ý nội dung nên học. Đây là bộ câu mẫu chưa hiệu chuẩn, không phải
            chứng chỉ CEFR và không dự đoán TOEIC hoặc IELTS. Không đánh giá nghe khi không có audio
            hợp lệ.
          </p>
        </section>
      </div>
    </SiteShell>
  );
}
