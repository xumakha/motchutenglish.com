import "server-only";
import { sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { searchDocuments } from "@/db/schema";
import type { LessonDocument } from "../assessment/types";
import { fulltextQuery, likeContains, searchText } from "./search-text";

export { fulltextQuery, likeContains, searchText };

// Lesson search (fix 10). PHP decoded every published lesson document on each search and matched
// with an unescaped LIKE. Now each published version's text is stored once, at publish time, in
// mce_search with a FULLTEXT index, and the page asks the index which versions match.

/** Store (or refresh) the search text of a version that is being published. */
export async function indexVersion(
  tx: Tx,
  versionId: number,
  title: string,
  doc: LessonDocument,
): Promise<void> {
  const body = searchText(doc);
  await tx
    .insert(searchDocuments)
    .values({ versionId, title, body })
    .onDuplicateKeyUpdate({ set: { title, body } });
}

/**
 * Published version ids whose title or text matches the query. Uses the FULLTEXT index; a query
 * made only of short words or stopwords falls back to an escaped LIKE over the same table.
 */
export async function searchVersionIds(q: string): Promise<Set<number>> {
  const query = fulltextQuery(q);
  const where = query
    ? sql`MATCH(title, body) AGAINST (${query} IN BOOLEAN MODE)`
    : sql`(title LIKE ${likeContains(q)} OR body LIKE ${likeContains(q)})`;
  const [rows] = (await db().execute(
    sql`SELECT version_id AS id FROM mce_search WHERE ${where} LIMIT 500`,
  )) as unknown as [{ id: number }[]];
  return new Set(rows.map((r) => Number(r.id)));
}
