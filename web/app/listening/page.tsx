import type { Metadata } from "next";
import Link from "next/link";
import { LegacyScripts } from "@/components/legacy/markup";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { listening } from "@/site/queries/legacy";
import { pageMetadata } from "@/site/seo";

// Port of views/listening/index.php (Listening::index).

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/listening", "Luyện nghe");
}

const FILTERS = ["all", "Đời sống", "Công sở", "Du lịch"];

export default function Page() {
  return (
    <SiteShell page="listening">
      <PageHeading
        title="Nghe một chút, quen một chút."
        description="Hội thoại ngắn, gần gũi với cuộc sống mỗi ngày."
        eyebrow="THƯ VIỆN LUYỆN NGHE"
      />
      <div data-filter-group="">
        <div className="tabs">
          {FILTERS.map((id) => (
            <button key={id} data-filter={id} className={id === "all" ? "selected" : ""}>
              {id === "all" ? "Tất cả" : id}
            </button>
          ))}
        </div>
        <div className="courses-grid">
          {listening.map((l) => (
            <Link
              key={l.id}
              className="listening-card panel"
              data-filter-item={l.topic}
              href={`/listening/${encodeURIComponent(l.id)}`}
            >
              <div className="listening-art">
                <span>{l.icon}</span>
                <span className="play-bubble">▶</span>
              </div>
              <span className="badge">{`${l.level} · ${l.topic}`}</span>
              <h3>{l.title}</h3>
              <p>Hội thoại ngắn · Giọng đọc tự động</p>
              <span className="text-link">Bắt đầu nghe →</span>
            </Link>
          ))}
        </div>
      </div>
      <LegacyScripts />
    </SiteShell>
  );
}
