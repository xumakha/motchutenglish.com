import "server-only";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { articles, lessons, paths, units, versions, vocabulary, vocabularySets } from "@/db/schema";

// Existence checks for public content URLs, run in proxy.ts before the page renders so a missing
// slug gets a real 404 status (a notFound() inside a streamed page can only add noindex). One
// indexed lookup per request; anything the page would still reject later just falls back to the
// in-page notFound().

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const routes: [RegExp, (slug: string) => Promise<boolean>][] = [
  [new RegExp(`^/(?:lo-trinh|chien-dich)/(${SLUG})$`), publishedPath],
  [new RegExp(`^/bai-hoc/(${SLUG})$`), publishedLesson],
  [new RegExp(`^/tu-vung/chu-de/(${SLUG})$`), publishedSet],
  [new RegExp(`^/tu-vung/(?!chu-de$)(${SLUG})$`), publishedWord],
  [new RegExp(`^/kien-thuc/(${SLUG})$`), publishedArticle],
];

async function publishedPath(slug: string) {
  const [row] = await db()
    .select({ id: paths.id })
    .from(paths)
    .where(and(eq(paths.slug, slug), eq(paths.status, "published")))
    .limit(1);
  return !!row;
}

async function publishedLesson(slug: string) {
  const [row] = await db()
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(versions, eq(versions.id, lessons.currentVersion))
    .innerJoin(units, eq(units.id, lessons.unitId))
    .innerJoin(paths, eq(paths.id, units.pathId))
    .where(
      and(
        eq(lessons.slug, slug),
        eq(lessons.archived, false),
        eq(units.archived, false),
        ne(lessons.subtype, "placement"),
        isNotNull(lessons.currentVersion),
        eq(versions.status, "published"),
        eq(paths.status, "published"),
      ),
    )
    .limit(1);
  return !!row;
}

async function publishedWord(slug: string) {
  const [row] = await db()
    .select({ id: vocabulary.id })
    .from(vocabulary)
    .where(and(eq(vocabulary.slug, slug), eq(vocabulary.status, "published")))
    .limit(1);
  return !!row;
}

async function publishedSet(slug: string) {
  const [row] = await db()
    .select({ id: vocabularySets.id })
    .from(vocabularySets)
    .where(and(eq(vocabularySets.slug, slug), eq(vocabularySets.status, "published")))
    .limit(1);
  return !!row;
}

async function publishedArticle(slug: string) {
  const [row] = await db()
    .select({ id: articles.id })
    .from(articles)
    .where(and(eq(articles.slug, slug), eq(articles.status, "published")))
    .limit(1);
  return !!row;
}

/** false when `pathname` is a public content URL whose item does not exist; true otherwise. */
export async function contentExists(pathname: string): Promise<boolean> {
  for (const [pattern, check] of routes) {
    const m = pattern.exec(pathname);
    if (!m) continue;
    try {
      return await check(m[1]!);
    } catch (error) {
      console.error("Content existence check failed", error);
      return true; // never turn a database hiccup into a 404
    }
  }
  return true;
}
