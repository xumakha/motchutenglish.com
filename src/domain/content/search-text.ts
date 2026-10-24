import type { LessonDocument } from "../assessment/types";

// Pure helpers for lesson search (fix 10), shared by the app and scripts/db.ts (which indexes
// versions published before the search table existed).

/** InnoDB's default FULLTEXT stopwords; the index never matches them, so queries drop them. */
const STOPWORDS = new Set(
  (
    "a about an are as at be by com de en for from how i in is it la of on or that the this to " +
    "was what when where who will with und www"
  ).split(" "),
);
/** innodb_ft_min_token_size default: shorter words are not in the index. */
const MIN_TOKEN = 3;
const MAX_TERMS = 10;

/** Escape LIKE wildcards so `%` and `_` match literally, wrapped for a "contains" match. */
export function likeContains(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Keys whose values are identifiers or settings, not text a learner reads. */
const NOT_TEXT = new Set(["id", "type", "audioId", "answerId", "whitespace", "level", "skillTags"]);

/** Every readable string in the document (text, prompts, choices, answers), one per line. */
export function searchText(doc: LessonDocument): string {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object")
      for (const [key, value] of Object.entries(v)) if (!NOT_TEXT.has(key)) walk(value);
  };
  walk(doc);
  return out.join("\n");
}

/**
 * Index words of the query as a boolean-mode FULLTEXT query: every word required, prefix match.
 * Only letters and digits survive, so the user cannot inject boolean operators. Returns "" when
 * no word is long enough to be in the index (or every word is a stopword).
 */
export function fulltextQuery(q: string): string {
  const words = q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => [...w].length >= MIN_TOKEN && !STOPWORDS.has(w));
  return [...new Set(words)]
    .slice(0, MAX_TERMS)
    .map((w) => `+${w}*`)
    .join(" ");
}
