import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { search, searchQuery } from "@/site/queries/public";
import { pageMetadata } from "@/site/seo";

// Port of the tim-kiem branch of views/product/page.php. Fix 10: `%` and `_` in the query
// match literally (the PHP version passed them into LIKE as wildcards).

type Props = PageProps<"/tim-kiem">;

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/tim-kiem", "Tìm nội dung học");
}

function SearchForm({ query }: { query: string }) {
  return (
    <form method="get" className="search-form">
      <label>
        Tìm bài học, từ hoặc kiến thức
        <input name="q" maxLength={100} defaultValue={query} required />
      </label>
      <button className="button">Tìm kiếm</button>
    </form>
  );
}

async function Results({ searchParams }: Props) {
  const query = searchQuery((await searchParams).q);
  const matches = await search(query);
  return (
    <>
      <SearchForm query={query} />
      {query !== "" && !matches.length ? <p>Chưa tìm thấy nội dung phù hợp.</p> : null}
      <ul>
        {matches.map((m, i) => (
          <li key={i}>
            {m.type}: <Link href={m.url as Route}>{m.title}</Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function Page(props: Props) {
  return (
    <SiteShell page="tim-kiem">
      <PageHeading title="Tìm nội dung học" description="Mỗi bước nhỏ đều được ghi nhận." />
      <Suspense>
        <Results {...props} />
      </Suspense>
    </SiteShell>
  );
}
