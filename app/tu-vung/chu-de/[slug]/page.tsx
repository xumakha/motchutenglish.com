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
import { pageNumber, vocabularySetBySlug, wordPage } from "@/site/queries/public";
import { pageMetadata } from "@/site/seo";

// Port of the tu-vung/chu-de/{slug} branch of views/product/page.php (words of one set).

type Props = PageProps<"/tu-vung/chu-de/[slug]">;

async function findSet(params: Props["params"]) {
  const { slug } = await params;
  const set = await vocabularySetBySlug(slug);
  if (!set) notFound();
  return set;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const set = await findSet(params);
  return pageMetadata(`/tu-vung/chu-de/${set.slug}`, set.title, set.description);
}

async function Content({ params, searchParams }: Props) {
  const set = await findSet(params);
  const page = pageNumber((await searchParams).page);
  const { words, hasNext } = await wordPage(page, { setId: set.id });
  const path = `/tu-vung/chu-de/${set.slug}`;
  return (
    <>
      <Breadcrumb path={path} title={set.title} />
      <PageHeading title={set.title} {...VOCABULARY_HEADING} />
      <VocabularySets />
      <WordList words={words} />
      <Pager path={path} page={page} hasNext={hasNext} />
    </>
  );
}

export default function Page(props: Props) {
  return (
    <SiteShell page="tu-vung">
      <Suspense>
        <Content {...props} />
      </Suspense>
    </SiteShell>
  );
}
