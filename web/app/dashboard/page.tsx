import type { Metadata } from "next";
import Link from "next/link";
import { CourseCard, LegacyScripts } from "@/components/legacy/markup";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { courses } from "@/site/queries/legacy";
import { pageMetadata } from "@/site/seo";

// Port of views/pages/dashboard.php (Pages::dashboard): progress kept in this browser only.

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/dashboard", "Góc học tập");
}

const STATS: [string, string][] = [
  ["lessons", "bài học hoàn thành"],
  ["listening", "bài nghe hoàn thành"],
  ["days", "ngày đã học"],
];

export default function Page() {
  return (
    <SiteShell page="dashboard">
      <PageHeading title="Góc học tập của bạn." description="Mỗi bước nhỏ đều có ý nghĩa." />
      <div className="dashboard-stats">
        {STATS.map(([id, label]) => (
          <div key={id} className="panel">
            <strong data-stat={id}>0</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="section-heading">
        <h2>Lộ trình của bạn</h2>
        <span className="badge">Lưu trên trình duyệt này</span>
      </div>
      <div className="courses-grid">
        {courses.map((c) => (
          <CourseCard key={c.id} c={c} />
        ))}
      </div>
      <div className="panel dashboard-note">
        <div>
          <h3>15 phút hôm nay, thêm một chút tự tin.</h3>
          <p>Tiến độ được lưu cục bộ, chưa đồng bộ giữa các thiết bị.</p>
        </div>
        <Link className="button" href="/listening">
          Luyện nghe hôm nay
        </Link>
      </div>
      <div className="reset-area">
        <button className="text-link muted" id="reset-progress">
          Đặt lại tiến độ
        </button>
        <span role="status" id="storage-error"></span>
      </div>
      <LegacyScripts />
    </SiteShell>
  );
}
