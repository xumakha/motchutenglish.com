import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import type { Actor } from "@/domain/actor";
import { cohortReport, eventCounts, funnelReport, recentJobs } from "@/domain/analytics/marketing";
import { importStatus } from "@/domain/content/imports";

// Data for /admin/{section}: port of Product::adminData() and the queries admin.php ran inline.
// Rows keep the database's snake_case names, like the PHP view read them.

export type Row = Record<string, unknown>;

export const SECTIONS = {
  paths: "Lộ trình",
  units: "Chương",
  lessons: "Bài học",
  questions: "Câu hỏi",
  vocabulary: "Từ vựng",
  "vocabulary-sets": "Bộ từ",
  articles: "Kiến thức",
  media: "Media",
  imports: "Nhập/xuất",
  reports: "Báo lỗi",
  users: "Tài khoản",
  settings: "Cấu hình",
  audit: "Audit",
  operations: "Vận hành",
} as const;
export type Section = keyof typeof SECTIONS;
export const ADMIN_ONLY: Section[] = ["users", "settings", "audit", "operations"];
export const ENTITY_SECTIONS = ["paths", "units", "vocabulary", "articles", "vocabulary-sets"];

export const isSection = (s: string): s is Section => Object.hasOwn(SECTIONS, s);

export async function rows<T = Row>(query: SQL): Promise<T[]> {
  const [result] = (await db().execute(query)) as unknown as [T[]];
  return result;
}

/** mce_decode for JSON columns (MariaDB returns JSON as text). */
export function decode<T = Record<string, unknown>>(value: unknown): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return {} as T;
    }
  }
  return (value ?? {}) as T;
}

const table = (section: string) => sql.raw(`mce_${section.replace(/-/g, "_")}`);

export interface LessonFilters {
  q: string;
  type: string;
  level: string;
  tag: string;
  status: string;
}

/** Product::adminData(): one page (30 rows) of the section's records. */
export async function adminData(
  actor: Actor,
  section: Section,
  pageNo: number,
  filters: LessonFilters,
): Promise<Row[]> {
  const offset = (pageNo - 1) * 30;
  if (ENTITY_SECTIONS.includes(section))
    return rows(sql`SELECT * FROM ${table(section)} ORDER BY id DESC LIMIT 30 OFFSET ${offset}`);
  if (section === "lessons" || section === "questions") {
    const where: SQL[] = [];
    if (filters.q) {
      const like = `%${filters.q}%`;
      where.push(sql`(v.title LIKE ${like} OR v.document LIKE ${like} OR v.status LIKE ${like})`);
    }
    const json: [keyof LessonFilters, string][] = [
      ["type", "$.exercises[*].type"],
      ["level", "$.exercises[*].level"],
      ["tag", "$.exercises[*].skillTags[*]"],
    ];
    for (const [filter, path] of json)
      if (filters[filter])
        where.push(
          sql`JSON_SEARCH(v.document, 'one', ${filters[filter].slice(0, 80)}, NULL, ${path}) IS NOT NULL`,
        );
    if (filters.status) where.push(sql`v.status = ${filters.status}`);
    return rows(sql`SELECT v.*, l.slug, l.unit_id, l.archived
      FROM mce_versions v JOIN mce_lessons l ON l.id = v.lesson_id
      ${where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``}
      ORDER BY v.id DESC LIMIT 30 OFFSET ${offset}`);
  }
  if (section === "media")
    return rows(sql`SELECT * FROM mce_media ORDER BY id DESC LIMIT 30 OFFSET ${offset}`);
  if (section === "reports")
    return rows(sql`SELECT id, version_id, position, category, description, status, resolution
      FROM mce_reports ORDER BY id DESC LIMIT 30 OFFSET ${offset}`);
  if (section === "users")
    return rows(sql`SELECT u.id, u.name, u.email, COALESCE(r.role, 'learner') AS role
      FROM users u LEFT JOIN learning_roles r ON r.user_id = u.id
      ORDER BY u.id DESC LIMIT 30 OFFSET ${offset}`);
  if (section === "audit")
    return rows(sql`SELECT * FROM mce_audit ORDER BY id DESC LIMIT 30 OFFSET ${offset}`);
  if (section === "settings") return rows(sql`SELECT * FROM mce_settings ORDER BY name`);
  if (section === "imports")
    return rows(sql`SELECT id, status, errors, created_at FROM mce_imports
      ${actor.role === "admin" ? sql`` : sql`WHERE actor_id = ${actor.userId}`}
      ORDER BY created_at DESC, id DESC LIMIT 30 OFFSET ${offset}`);
  return [];
}

export async function pathOptions() {
  return rows<{ id: number; title: string }>(sql`SELECT id, title FROM mce_paths ORDER BY id`);
}

export async function unitOptions() {
  return rows<{ id: number; title: string }>(sql`SELECT id, title FROM mce_units ORDER BY id`);
}

/** Article drafts waiting for review (admin.php, section articles). */
export async function articleDrafts(draftId: number) {
  const list = await rows(sql`SELECT * FROM mce_article_versions
    ${draftId ? sql`WHERE id = ${draftId}` : sql``} ORDER BY id DESC LIMIT 30`);
  return list
    .map((r) => ({ row: r, doc: decode(r.document) }))
    .filter(({ doc }) => doc.status === "draft" || doc.status === "in_review");
}

/** Proposed edits of published paths, vocabulary and sets (admin.php). */
export async function entityDrafts(section: string, draftId: number) {
  const kind = section.replace(/-/g, "_");
  const list = await rows(sql`SELECT * FROM mce_entity_drafts
    WHERE kind = ${kind} AND status IN ('draft', 'in_review')
    ${draftId ? sql`AND id = ${draftId}` : sql``} ORDER BY id DESC LIMIT 30`);
  return list.map((r) => ({ row: r, doc: decode(r.document) }));
}

export async function pageSeoRows() {
  return rows<{ path: string; title: string; description: string }>(
    sql`SELECT * FROM mce_page_seo ORDER BY path`,
  );
}

export async function pageSeoFor(path: string) {
  const [row] = await rows<{ path: string; title: string; description: string }>(
    sql`SELECT * FROM mce_page_seo WHERE path = ${path}`,
  );
  return row ?? { path: "/", title: "", description: "" };
}

export async function importStates(actor: Actor, jobs: Row[]) {
  return Promise.all(jobs.map((j) => importStatus(actor, j.id)));
}
export type ImportState = Awaited<ReturnType<typeof importStatus>>;

export async function operations() {
  const [funnel, counts, jobs, cohorts] = await Promise.all([
    funnelReport(),
    eventCounts(),
    recentJobs(),
    cohortReport(),
  ]);
  return { funnel, counts, jobs, cohorts };
}
