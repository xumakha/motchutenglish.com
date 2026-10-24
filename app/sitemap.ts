import { and, eq } from "drizzle-orm";
import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { db } from "@/db/client";
import { articles, vocabulary, vocabularySetItems, vocabularySets } from "@/db/schema";
import { catalogLessons, catalogPaths } from "@/domain/content/lessons";
import { env } from "@/env";

// Public pages, published paths, lessons, articles, words and non-empty word sets (PHP sitemap.xml).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const base = env().APP_URL.replace(/\/$/, "");
  const urls = ["/", "/lo-trinh", "/tu-vung", "/kien-thuc", "/gioi-thieu"];
  for (const p of await catalogPaths()) urls.push(`/lo-trinh/${p.slug}`);
  for (const l of await catalogLessons()) urls.push(`/bai-hoc/${l.slug}`);
  for (const a of await db()
    .select({ slug: articles.slug })
    .from(articles)
    .where(eq(articles.status, "published")))
    urls.push(`/kien-thuc/${a.slug}`);
  for (const w of await db()
    .select({ slug: vocabulary.slug })
    .from(vocabulary)
    .where(eq(vocabulary.status, "published")))
    urls.push(`/tu-vung/${w.slug}`);
  const sets = await db()
    .selectDistinct({ slug: vocabularySets.slug })
    .from(vocabularySets)
    .innerJoin(vocabularySetItems, eq(vocabularySetItems.setId, vocabularySets.id))
    .innerJoin(vocabulary, eq(vocabulary.id, vocabularySetItems.senseId))
    .where(and(eq(vocabularySets.status, "published"), eq(vocabulary.status, "published")));
  for (const s of sets) urls.push(`/tu-vung/chu-de/${s.slug}`);
  return [...new Set(urls)].map((u) => ({ url: base + u }));
}
