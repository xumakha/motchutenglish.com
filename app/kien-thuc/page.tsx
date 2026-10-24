import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Breadcrumb } from "@/components/public/breadcrumb";
import { ARTICLE_HEADING } from "@/components/public/articles";
import { Pager } from "@/components/public/vocabulary";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { articlePage, pageNumber, strimwidth } from "@/site/queries/public";
import { pageMetadata } from "@/site/seo";

// Port of the kien-thuc branch of views/product/page.php (article cards, 30 per page).

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/kien-thuc", "Một chút kiến thức");
}

async function Articles({
  searchParams,
}: {
  searchParams: PageProps<"/kien-thuc">["searchParams"];
}) {
  const page = pageNumber((await searchParams).page);
  const { articles, hasNext } = await articlePage(page);
  return (
    <>
      {!articles.length ? (
        <section className="panel">
          <p>Chưa có bài viết được xuất bản.</p>
        </section>
      ) : null}
      <div className="design-article-grid">
        {articles.map((a) => (
          <article key={a.id} className="panel design-article-card">
            <div className="design-article-cover" aria-hidden="true">
              “
            </div>
            <div className="design-article-content">
              <span className="eyebrow">GÓC KIẾN THỨC</span>
              <h2>
                <Link href={`/kien-thuc/${a.slug}`}>{a.title}</Link>
              </h2>
              <p>{strimwidth(a.body, 180)}</p>
              <Link className="text-link" href={`/kien-thuc/${a.slug}`}>
                Đọc một chút →
              </Link>
            </div>
          </article>
        ))}
      </div>
      <Pager path="/kien-thuc" page={page} hasNext={hasNext} />
    </>
  );
}

export default function Page({ searchParams }: PageProps<"/kien-thuc">) {
  return (
    <SiteShell page="kien-thuc">
      <Breadcrumb path="/kien-thuc" title="Một chút kiến thức" />
      <PageHeading title="Đọc một chút, hiểu thêm nhiều." {...ARTICLE_HEADING} />
      <Suspense>
        <Articles searchParams={searchParams} />
      </Suspense>
    </SiteShell>
  );
}
