import { char, int, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";
import { createdAt, id, json, ref, utc } from "../columns";
import { users } from "./auth";
import { versions } from "./catalog";

// Articles, learner error reports, content imports and the audit log.

export const articles = mysqlTable("mce_articles", {
  id: id(),
  slug: varchar("slug", { length: 150 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  revision: int("revision").notNull().default(1),
  updatedAt: createdAt("updated_at"),
  seoTitle: varchar("seo_title", { length: 160 }).notNull().default(""),
  seoDescription: varchar("seo_description", { length: 320 }).notNull().default(""),
});

/** Article drafts and the history of replaced published versions. */
export const articleVersions = mysqlTable("mce_article_versions", {
  id: id(),
  articleId: ref("article_id")
    .notNull()
    .references(() => articles.id),
  document: json<Record<string, unknown>>("document").notNull(),
  actorId: ref("actor_id")
    .notNull()
    .references(() => users.id),
  createdAt: utc("created_at").notNull(),
});

export const reports = mysqlTable("mce_reports", {
  id: id(),
  userId: ref("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  versionId: ref("version_id")
    .notNull()
    .references(() => versions.id),
  position: varchar("position", { length: 80 }).notNull(),
  category: varchar("category", { length: 30 }).notNull(),
  description: text("description").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("open"),
  resolution: text("resolution"),
  createdAt: createdAt(),
});

export interface ImportError {
  record: number;
  field: string;
  message: string;
  phase: "preview" | "commit";
}

export const imports = mysqlTable("mce_imports", {
  id: char("id", { length: 32 }).primaryKey(),
  actorId: ref("actor_id")
    .notNull()
    .references(() => users.id),
  document: json<Record<string, unknown>>("document").notNull(),
  errors: json<ImportError[]>("errors").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("preview"),
  createdAt: createdAt(),
});

/** Written through a separate autocommit connection while an import transaction runs. */
export const importProgress = mysqlTable("mce_import_progress", {
  importId: char("import_id", { length: 32 }).primaryKey(),
  processed: int("processed", { unsigned: true }).notNull().default(0),
  total: int("total", { unsigned: true }).notNull().default(0),
  phase: varchar("phase", { length: 20 }).notNull().default("preview"),
  updatedAt: utc("updated_at").notNull(),
});

export const audit = mysqlTable("mce_audit", {
  id: id(),
  actorId: ref("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 80 }).notNull(),
  target: varchar("target", { length: 150 }).notNull(),
  details: json<Record<string, unknown>>("details").notNull(),
  occurredAt: utc("occurred_at").notNull(),
});
