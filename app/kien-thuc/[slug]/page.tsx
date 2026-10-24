import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ARTICLE_HEADING, Nl2br } from "@/components/public/articles";
import { Breadcrumb } from "@/components/public/breadcrumb";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { articlePage } from "@/site/queries/public";
import { pageMetadata } from "@/site/seo";

// Port of the kien-thuc/{slug} branch of views/product/page.php (one article).

type Props = PageProps<"/kien-thuc/[slug]">;

async function findArticle(params: Props["params"]) {
  const { slug } = await params;
  const [article] = (await articlePage(1, slug)).articles;
  if (!article) notFound();
  return article;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await findArticle(params);
  return pageMetadata(`/kien-thuc/${a.slug}`, a.title, [...a.body].slice(0, 320).join(""));
}

async function Content({ params }: { params: Props["params"] }) {
  const a = await findArticle(params);
  return (
    <>
      <Breadcrumb path={`/kien-thuc/${a.slug}`} title={a.title} />
      <PageHeading title={a.title} {...ARTICLE_HEADING} />
      <article className="panel design-article-reader">
        <Link className="text-link" href="/kien-thuc">
          ← Tất cả bài viết
        </Link>
        <h2>{a.title}</h2>
        <div className="prose">
          <Nl2br text={a.body} />
        </div>
      </article>
    </>
  );
}

export default function Page({ params }: Props) {
  return (
    <SiteShell page="kien-thuc">
      <Suspense>
        <Content params={params} />
      </Suspense>
    </SiteShell>
  );
}
