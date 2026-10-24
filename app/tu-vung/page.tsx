import type { Metadata } from "next";
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

// Port of the tu-vung branch of views/product/page.php (all published words, 30 per page).

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/tu-vung", "Từ vựng theo chủ đề");
}

async function Words({ searchParams }: { searchParams: PageProps<"/tu-vung">["searchParams"] }) {
  const page = pageNumber((await searchParams).page);
  const { words, hasNext } = await wordPage(page);
  return (
    <>
      <WordList words={words} />
      <Pager path="/tu-vung" page={page} hasNext={hasNext} />
    </>
  );
}

export default function Page({ searchParams }: PageProps<"/tu-vung">) {
  return (
    <SiteShell page="tu-vung">
      <Breadcrumb path="/tu-vung" title="Từ vựng theo chủ đề" />
      <PageHeading title="Từ nào cũng có câu chuyện." {...VOCABULARY_HEADING} />
      <Suspense>
        <VocabularySets />
        <Words searchParams={searchParams} />
      </Suspense>
    </SiteShell>
  );
}
