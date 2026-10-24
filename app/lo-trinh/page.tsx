import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Breadcrumb } from "@/components/public/breadcrumb";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { publicPaths } from "@/site/catalog";
import { pageMetadata } from "@/site/seo";

// Port of the lo-trinh branch of views/product/page.php (path catalog).

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/lo-trinh", "Lộ trình học");
}

async function Catalog() {
  const paths = await publicPaths();
  return (
    <>
      <div className="design-path-catalog">
        {paths.map((p) => (
          <Link key={p.id} className="design-path-card" href={`/lo-trinh/${p.slug}`}>
            <div className="design-path-top">
              <span>{p.level}</span>
              <strong>
                {p.lessonCount}
                <small style={{ fontSize: 24 }}> bài</small>
              </strong>
            </div>
            <div className="design-path-body">
              <h2>{p.title}</h2>
              <p>{p.description}</p>
              <span className="badge">✓ {p.objectives}</span>
              <p style={{ margin: "18px 0 0" }}>
                <strong className="text-link">Khám phá lộ trình →</strong>
              </p>
            </div>
          </Link>
        ))}
      </div>
      {!paths.length ? (
        <section className="panel">
          <p>
            Chưa có lộ trình đã xuất bản. Bạn có thể <Link href="/courses">học thử các bài cũ</Link>
            .
          </p>
        </section>
      ) : null}
    </>
  );
}

export default function Page() {
  return (
    <SiteShell page="lo-trinh">
      <Breadcrumb path="/lo-trinh" title="Lộ trình học" />
      <PageHeading
        eyebrow="LỘ TRÌNH"
        title="Bắt đầu từ đâu cũng được."
        description="Thứ tự bài chỉ là gợi ý — bạn có thể đổi lộ trình bất cứ lúc nào mà không mất tiến độ cũ."
      />
      <Suspense>
        <Catalog />
      </Suspense>
    </SiteShell>
  );
}
