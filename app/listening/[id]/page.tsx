import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Audio, LegacyScripts, Quiz } from "@/components/legacy/markup";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { findListening, listening } from "@/site/queries/legacy";
import { pageMetadata } from "@/site/seo";

// Port of views/listening/show.php (Listening::show).

export function generateStaticParams() {
  return listening.map((l) => ({ id: l.id }));
}

export async function generateMetadata(props: PageProps<"/listening/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const item = findListening(id);
  if (!item)
    return pageMetadata(`/listening/${id}`, "Không tìm thấy trang", undefined, { error: true });
  return pageMetadata(`/listening/${item.id}`, item.title);
}

export default async function Page(props: PageProps<"/listening/[id]">) {
  const { id } = await props.params;
  const item = findListening(id);
  if (!item) notFound();
  return (
    <SiteShell page="listening">
      <PageHeading title={item.title} description={`${item.level} · ${item.topic}`} />
      <article className="panel narrow">
        <span className="eyebrow">NGHE &amp; THỰC HÀNH</span>
        <h2>Nghe một lần, hiểu một chút.</h2>
        <p>Nghe đoạn hội thoại và trả lời câu hỏi. Có thể giảm tốc độ hoặc xem nội dung nếu cần.</p>
        <Audio text={item.text} />
        <Quiz q={item.question} id={`listening/${item.id}`} />
        <details className="transcript">
          <summary>Xem hội thoại và nghĩa</summary>
          <p>{item.text}</p>
          <p>{item.translation}</p>
        </details>
        <p className="muted small">
          Âm thanh dùng giọng đọc của trình duyệt, không phải bản thu người thật.
        </p>
      </article>
      <LegacyScripts />
    </SiteShell>
  );
}
