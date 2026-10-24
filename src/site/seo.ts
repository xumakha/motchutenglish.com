import "server-only";
import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { cacheTag } from "next/cache";
import { connection } from "next/server";
import { db } from "@/db/client";
import { articles, pageSeo, paths, vocabulary, vocabularySets } from "@/db/schema";
import { isPublicPath } from "@/domain/admin/site";
import { env } from "@/env";
import { siteSettings } from "./settings";

// Port of Seo::metadata and the <head> of layouts/header.php: title/description with content
// SEO fields and admin overrides, canonical + Open Graph, noindex for private areas.

const DEFAULT_DESCRIPTION = "Học tiếng Anh từng bước nhỏ, có giải thích và lịch ôn rõ ràng.";
const PRIVATE_ROOTS = new Set([
  "hoc",
  "admin",
  "ket-qua",
  "account",
  "dashboard",
  "bat-dau",
  "tai-khoan",
  "tien-do",
  "on-tap",
  "so-tu-vung",
  "tim-kiem",
  "reward-shop",
  "login",
  "register",
  "quen-mat-khau",
  "dat-lai-mat-khau",
  "xac-minh-email",
  "huy-nhac-hoc",
  "kiem-tra-dau-vao",
]);

async function seoFor(
  path: string,
): Promise<{ title?: string; description?: string; fallbackTitle?: string } | null> {
  "use cache";
  cacheTag("catalog");
  const kinds = [
    ["lo-trinh", paths],
    ["tu-vung/chu-de", vocabularySets],
    ["tu-vung", vocabulary],
    ["kien-thuc", articles],
  ] as const;
  for (const [prefix, table] of kinds) {
    const m = new RegExp(`^/${prefix}/([a-z0-9-]+)$`).exec(path);
    if (!m) continue;
    const [row] = await db()
      .select({
        title: table.seoTitle,
        description: table.seoDescription,
        ...(table === vocabulary ? { fallbackTitle: vocabulary.lemma } : {}),
      })
      .from(table)
      .where(and(eq(table.slug, m[1]!), eq(table.status, "published")));
    if (row) return row;
    break;
  }
  const [override] = await db()
    .select({ title: pageSeo.title, description: pageSeo.description })
    .from(pageSeo)
    .where(eq(pageSeo.path, path));
  return override ?? null;
}

/** Metadata for a page at `path` ("/lo-trinh/abc"); `error` pages are always noindex. */
export async function pageMetadata(
  path: string,
  title: string,
  description?: string,
  { error = false }: { error?: boolean } = {},
): Promise<Metadata> {
  await connection();
  let finalTitle = title;
  let finalDescription = description ?? DEFAULT_DESCRIPTION;
  if (!error && isPublicPath(path)) {
    const row = await seoFor(path);
    if (row?.fallbackTitle) finalTitle = row.fallbackTitle;
    if (row?.title?.trim()) finalTitle = row.title;
    if (row?.description?.trim()) finalDescription = row.description;
  }
  const base = env().APP_URL.replace(/\/$/, "");
  const url = `${base}/${path.replace(/^\/+/, "")}`;
  const site = await siteSettings();
  const root = path.split("/")[1] ?? "";
  return {
    title: finalTitle,
    description: finalDescription,
    alternates: { canonical: url },
    openGraph: {
      title: `${finalTitle} | Một Chút English`,
      description: finalDescription,
      type: "website",
      url,
      images: [base + site.ogImage],
    },
    icons: { icon: [{ url: site.favicon, sizes: "any" }] },
    robots: error || PRIVATE_ROOTS.has(root) ? { index: false, follow: false } : undefined,
  };
}

/** BreadcrumbList JSON-LD for public content pages. */
export function breadcrumbJsonLd(path: string, title: string) {
  const base = env().APP_URL.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Trang chủ", item: `${base}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: title,
        item: `${base}/${path.replace(/^\/+/, "")}`,
      },
    ],
  };
}
