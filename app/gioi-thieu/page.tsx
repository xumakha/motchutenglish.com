import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@/components/public/breadcrumb";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { pageMetadata } from "@/site/seo";

// Port of the gioi-thieu branch of views/product/page.php.

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/gioi-thieu", "Về Một Chút English");
}

const FEATURES = ["Bài 5–15 phút", "Giải thích tiếng Việt", "Không khóa vì sai"];

export default function Page() {
  return (
    <SiteShell page="gioi-thieu">
      <Breadcrumb path="/gioi-thieu" title="Về Một Chút English" />
      <PageHeading
        eyebrow="GIỚI THIỆU"
        title="Học tiếng Anh không cần nhiều — chỉ cần đều."
        description="Một Chút English dành cho người mới bắt đầu hoặc muốn củng cố nền tảng. Tiếng Việt để hiểu, tiếng Anh để luyện."
      />
      <div className="design-about">
        <div className="design-loop-grid">
          {FEATURES.map((feature) => (
            <section key={feature} className="panel">
              <h2>{feature}</h2>
            </section>
          ))}
        </div>
        <p>
          Một Chút English giúp bạn xây nền tảng tiếng Anh bằng những bài học ngắn, có giải thích và
          lịch ôn rõ ràng. Bắt đầu từ bài mẫu, chọn lộ trình và học theo nhịp của mình.
        </p>
        <Link className="button" href="/lo-trinh">
          Xem lộ trình →
        </Link>
      </div>
    </SiteShell>
  );
}
