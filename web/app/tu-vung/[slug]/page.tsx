import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumb } from "@/components/public/breadcrumb";
import {
  Pager,
  VOCABULARY_HEADING,
  VocabularySets,
  WordList,
} from "@/components/public/vocabulary";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { pageNumber, wordPage } from "@/site/queries/public";
import { pageMetadata } from "@/site/seo";

// Port of the tu-vung/{slug} branch of views/product/page.php (one published word). The page
// title stays "Từ vựng theo chủ đề"; the SEO title falls back to the lemma (Seo::metadata).

type Props = PageProps<"/tu-vung/[slug]">;

async function load({ params, searchParams }: Props) {
  const { slug } = await params;
  const page = pageNumber((await searchParams).page);
  const result = await wordPage(page, { slug });
  if (!result.words.length) notFound();
  return { slug, page, ...result };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug, words } = await load(props);
  return pageMetadata(`/tu-vung/${slug}`, "Từ vựng theo chủ đề", words[0]!.meaning);
}

async function Content(props: Props) {
  const { slug, page, words, hasNext } = await load(props);
  return (
    <>
      <Breadcrumb path={`/tu-vung/${slug}`} title="Từ vựng theo chủ đề" />
      <VocabularySets />
      <WordList words={words} />
      <Pager path={`/tu-vung/${slug}`} page={page} hasNext={hasNext} />
    </>
  );
}

export default function Page(props: Props) {
  return (
    <SiteShell page="tu-vung">
      <PageHeading title="Từ nào cũng có câu chuyện." {...VOCABULARY_HEADING} />
      <Suspense>
        <Content {...props} />
      </Suspense>
    </SiteShell>
  );
}
