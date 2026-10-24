import type { Metadata } from "next";
import { CourseCard, LegacyScripts } from "@/components/legacy/markup";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { courses } from "@/site/queries/legacy";
import { pageMetadata } from "@/site/seo";

// Port of views/courses/index.php (Courses::index).

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/courses", "Lộ trình học");
}

const FILTERS: [string, string][] = [
  ["all", "Tất cả"],
  ["beginner", "Người mới"],
  ["work", "Người đi làm"],
  ["toeic", "TOEIC"],
];

export default function Page() {
  return (
    <SiteShell page="courses">
      <PageHeading
        title="Chọn lớp, bắt đầu hành trình."
        description="Từ nền tảng đầu tiên đến giao tiếp công sở và TOEIC. Mỗi bài học là một bước nhỏ."
        eyebrow="HỌC THEO MỤC TIÊU"
      />
      <div data-filter-group="">
        <div className="tabs">
          {FILTERS.map(([id, label]) => (
            <button key={id} data-filter={id} className={id === "all" ? "selected" : ""}>
              {label}
            </button>
          ))}
        </div>
        <div className="courses-grid">
          {courses.map((c) => (
            <CourseCard key={c.id} c={c} />
          ))}
        </div>
      </div>
      <div className="note spaced">
        🌱 Không chắc mình ở đâu? Bắt đầu từ lớp cơ bản và chuyển sang lộ trình khác khi bạn sẵn
        sàng.
      </div>
      <LegacyScripts />
    </SiteShell>
  );
}
