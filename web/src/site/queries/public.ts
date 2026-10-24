import "server-only";
import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db/client";
import {
  articles,
  attempts,
  consents,
  lessons,
  progress,
  versions,
  vocabulary,
  vocabularySetItems,
  vocabularySets,
} from "@/db/schema";
import { publicLessons } from "@/site/catalog";

// Page queries for the public screens (the public branches of Product::page).

const PAGE_SIZE = 30;

/** PHP `max(1,min(10000,(int)($_GET['page']??1)))`. */
export function pageNumber(raw: string | string[] | undefined): number {
  const n = Number.parseInt(typeof raw === "string" ? raw : "1", 10);
  return Math.max(1, Math.min(10000, Number.isNaN(n) ? 1 : n));
}

/** PHP mb_strimwidth($s, 0, $width, '…') for text without wide characters. */
export function strimwidth(s: string, width: number, marker = "…"): string {
  const chars = [...s];
  return chars.length <= width ? s : chars.slice(0, width - 1).join("") + marker;
}

/** Escape LIKE wildcards so `%` and `_` match literally (migration bug fix 10). */
export function likeContains(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// ---- Paths ----

/** The signed-in learner's progress rows and the lessons with an active attempt. */
export async function learnerPathState(userId: number) {
  const [rows, active] = await Promise.all([
    db()
      .select({ lessonId: progress.lessonId, passedAt: progress.passedAt })
      .from(progress)
      .where(eq(progress.userId, userId)),
    db()
      .selectDistinct({ lessonId: versions.lessonId })
      .from(attempts)
      .innerJoin(versions, eq(versions.id, attempts.versionId))
      .where(and(eq(attempts.userId, userId), eq(attempts.status, "active"))),
  ]);
  return {
    done: rows.map((r) => r.lessonId),
    passed: rows.filter((r) => r.passedAt).map((r) => r.lessonId),
    active: active.map((r) => r.lessonId),
  };
}

// ---- Vocabulary ----

/** Published sets with their count of published senses (sets without any are left out). */
export async function vocabularySetList() {
  await connection();
  return db()
    .select({
      id: vocabularySets.id,
      slug: vocabularySets.slug,
      title: vocabularySets.title,
      description: vocabularySets.description,
      senseCount: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(vocabularySets)
    .innerJoin(vocabularySetItems, eq(vocabularySetItems.setId, vocabularySets.id))
    .innerJoin(vocabulary, eq(vocabulary.id, vocabularySetItems.senseId))
    .where(and(eq(vocabularySets.status, "published"), eq(vocabulary.status, "published")))
    .groupBy(vocabularySets.id)
    .orderBy(asc(vocabularySets.sortOrder), asc(vocabularySets.id));
}

export async function vocabularySetBySlug(slug: string) {
  await connection();
  const [set] = await db()
    .select()
    .from(vocabularySets)
    .where(and(eq(vocabularySets.slug, slug), eq(vocabularySets.status, "published")));
  return set ?? null;
}

export type Word = typeof vocabulary.$inferSelect;

/** One page of published words (all, one slug, or one set) and whether a next page exists. */
export async function wordPage(
  page: number,
  { slug, setId }: { slug?: string; setId?: number } = {},
): Promise<{ words: Word[]; hasNext: boolean }> {
  await connection();
  const offset = (page - 1) * PAGE_SIZE;
  const published = eq(vocabulary.status, "published");
  const rows = setId
    ? await db()
        .select({ v: vocabulary })
        .from(vocabulary)
        .innerJoin(vocabularySetItems, eq(vocabularySetItems.senseId, vocabulary.id))
        .where(and(eq(vocabularySetItems.setId, setId), published))
        .orderBy(asc(vocabulary.lemma))
        .limit(PAGE_SIZE + 1)
        .offset(offset)
        .then((r) => r.map((x) => x.v))
    : await db()
        .select()
        .from(vocabulary)
        .where(slug ? and(published, eq(vocabulary.slug, slug)) : published)
        .orderBy(asc(vocabulary.topic), asc(vocabulary.lemma))
        .limit(PAGE_SIZE + 1)
        .offset(offset);
  return { words: rows.slice(0, PAGE_SIZE), hasNext: rows.length > PAGE_SIZE };
}

// ---- Articles ----

export type Article = typeof articles.$inferSelect;

export async function articlePage(
  page: number,
  slug?: string,
): Promise<{ articles: Article[]; hasNext: boolean }> {
  await connection();
  const published = eq(articles.status, "published");
  const rows = await db()
    .select()
    .from(articles)
    .where(slug ? and(published, eq(articles.slug, slug)) : published)
    .orderBy(desc(articles.updatedAt), desc(articles.id))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  return { articles: rows.slice(0, PAGE_SIZE), hasNext: rows.length > PAGE_SIZE };
}

// ---- Search ----

export interface SearchMatch {
  type: "Bài học" | "Từ vựng" | "Kiến thức";
  title: string;
  url: string;
}

/** PHP `mb_substr(trim($_GET['q']),0,100)` for a string query, else "". */
export function searchQuery(raw: string | string[] | undefined): string {
  return typeof raw === "string" ? [...raw.trim()].slice(0, 100).join("") : "";
}

/** Lessons whose title or document contains the text, then words and articles (LIKE, escaped). */
export async function search(q: string): Promise<SearchMatch[]> {
  if (q === "") return [];
  const needle = q.toLowerCase();
  const matches: SearchMatch[] = [];
  for (const l of await publicLessons())
    if (`${l.title} ${JSON.stringify(l.document)}`.toLowerCase().includes(needle))
      matches.push({ type: "Bài học", title: l.title, url: `/bai-hoc/${l.slug}` });
  const pattern = likeContains(q);
  const [words, posts] = await Promise.all([
    db()
      .select({ title: vocabulary.lemma, slug: vocabulary.slug })
      .from(vocabulary)
      .where(
        and(
          eq(vocabulary.status, "published"),
          or(like(vocabulary.lemma, pattern), like(vocabulary.meaning, pattern)),
        ),
      )
      .limit(30),
    db()
      .select({ title: articles.title, slug: articles.slug })
      .from(articles)
      .where(
        and(
          eq(articles.status, "published"),
          or(like(articles.title, pattern), like(articles.body, pattern)),
        ),
      )
      .limit(30),
  ]);
  for (const w of words)
    matches.push({ type: "Từ vựng", title: w.title, url: `/tu-vung/${w.slug}` });
  for (const a of posts)
    matches.push({ type: "Kiến thức", title: a.title, url: `/kien-thuc/${a.slug}` });
  return matches.slice(0, 60);
}

// ---- Placement test ----

export async function placementLesson() {
  await connection();
  const [row] = await db()
    .select({ id: lessons.id, slug: lessons.slug, title: versions.title })
    .from(lessons)
    .innerJoin(versions, eq(versions.id, lessons.currentVersion))
    .where(
      and(
        eq(lessons.subtype, "placement"),
        eq(lessons.archived, false),
        eq(versions.status, "published"),
      ),
    )
    .limit(1);
  return row ?? null;
}

// ---- Campaign consent ----

export async function userAnalyticsConsent(userId: number): Promise<boolean> {
  const [row] = await db()
    .select({ analytics: consents.analytics })
    .from(consents)
    .where(eq(consents.userId, userId));
  return !!row?.analytics;
}
