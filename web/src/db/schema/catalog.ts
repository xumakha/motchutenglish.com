import {
  boolean,
  index,
  int,
  mysqlTable,
  primaryKey,
  text,
  varchar,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { createdAt, id, json, ref, utc } from "../columns";
import { users } from "./auth";

// Learning catalog: paths → units → lessons → immutable versions, plus content workflow tables.

export type ContentStatus = "draft" | "in_review" | "published" | "archived";

import type { LessonDocument } from "@/domain/assessment/types";

export type { LessonDocument };

export const media = mysqlTable("mce_media", {
  id: id(),
  storageKey: varchar("storage_key", { length: 100 }).notNull().unique(),
  filename: varchar("filename", { length: 200 }).notNull(),
  mime: varchar("mime", { length: 100 }).notNull(),
  bytes: int("bytes").notNull(),
  altText: varchar("alt_text", { length: 500 }).notNull(),
  source: text("source").notNull(),
  licenseText: varchar("license_text", { length: 500 }).notNull(),
  uploaderId: ref("uploader_id")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

/**
 * Which published lesson versions use which media (fix 11). Filled when a version is published,
 * so /media/{id} checks one indexed table instead of decoding every lesson document.
 */
export const mediaRefs = mysqlTable(
  "mce_media_refs",
  {
    mediaId: ref("media_id")
      .notNull()
      .references(() => media.id),
    versionId: ref("version_id")
      .notNull()
      .references((): AnyMySqlColumn => versions.id),
  },
  (t) => [
    primaryKey({ columns: [t.mediaId, t.versionId] }),
    index("media_refs_version").on(t.versionId),
  ],
);

export const paths = mysqlTable(
  "mce_paths",
  {
    id: id(),
    slug: varchar("slug", { length: 150 }).notNull().unique(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull(),
    level: varchar("level", { length: 20 }).notNull().default("A1"),
    objectives: text("objectives").notNull(),
    prerequisites: text("prerequisites").notNull(),
    status: varchar("status", { length: 20 }).$type<ContentStatus>().notNull().default("draft"),
    sortOrder: int("sort_order").notNull().default(0),
    imageId: ref("image_id").references(() => media.id),
    seoTitle: varchar("seo_title", { length: 160 }).notNull().default(""),
    seoDescription: varchar("seo_description", { length: 320 }).notNull().default(""),
  },
  (t) => [index("catalog_status_order").on(t.status, t.sortOrder, t.id)],
);

export const units = mysqlTable(
  "mce_units",
  {
    id: id(),
    pathId: ref("path_id")
      .notNull()
      .references(() => paths.id),
    title: varchar("title", { length: 200 }).notNull(),
    objectives: text("objectives").notNull(),
    sortOrder: int("sort_order").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [index("unit_path_order").on(t.pathId, t.sortOrder, t.id)],
);

export const lessons = mysqlTable(
  "mce_lessons",
  {
    id: id(),
    unitId: ref("unit_id")
      .notNull()
      .references(() => units.id),
    slug: varchar("slug", { length: 150 }).notNull().unique(),
    sortOrder: int("sort_order").notNull().default(0),
    required: boolean("required").notNull().default(true),
    subtype: varchar("subtype", { length: 20 })
      .$type<"lesson" | "checkpoint" | "placement">()
      .notNull()
      .default("lesson"),
    currentVersion: ref("current_version").references((): AnyMySqlColumn => versions.id),
    archived: boolean("archived").notNull().default(false),
    externalKey: varchar("external_key", { length: 200 }).unique(),
  },
  (t) => [index("lesson_unit_order").on(t.unitId, t.archived, t.sortOrder, t.id)],
);

export const versions = mysqlTable(
  "mce_versions",
  {
    id: id(),
    lessonId: ref("lesson_id")
      .notNull()
      .references((): AnyMySqlColumn => lessons.id),
    title: varchar("title", { length: 200 }).notNull(),
    document: json<LessonDocument>("document").notNull(),
    status: varchar("status", { length: 20 })
      .$type<"draft" | "in_review" | "published">()
      .notNull()
      .default("draft"),
    authorId: ref("author_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    publishedAt: utc("published_at"),
  },
  (t) => [index("versions_status_lesson").on(t.status, t.lessonId)],
);

export const enrollments = mysqlTable(
  "mce_enrollments",
  {
    userId: ref("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pathId: ref("path_id")
      .notNull()
      .references(() => paths.id),
    enrolledAt: createdAt("enrolled_at"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.pathId] })],
);

/** Proposed edits to published paths, vocabulary and vocabulary sets. */
export const entityDrafts = mysqlTable("mce_entity_drafts", {
  id: id(),
  kind: varchar("kind", { length: 30 }).notNull(),
  entityId: ref("entity_id").notNull(),
  document: json<Record<string, unknown>>("document").notNull(),
  status: varchar("status", { length: 20 }).$type<ContentStatus>().notNull().default("draft"),
  authorId: ref("author_id")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

/** Import identity: (namespace, externalId, kind) → entity id. */
export const externalRefs = mysqlTable(
  "mce_external_refs",
  {
    namespace: varchar("namespace", { length: 50 }).notNull(),
    externalId: varchar("external_id", { length: 100 }).notNull(),
    kind: varchar("kind", { length: 30 }).notNull(),
    entityId: ref("entity_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.namespace, t.externalId, t.kind] })],
);

export const redirects = mysqlTable("mce_redirects", {
  oldPath: varchar("old_path", { length: 200 }).primaryKey(),
  newPath: varchar("new_path", { length: 200 }).notNull(),
});

export const pageSeo = mysqlTable("mce_page_seo", {
  path: varchar("path", { length: 255 }).primaryKey(),
  title: varchar("title", { length: 160 }).notNull().default(""),
  description: varchar("description", { length: 320 }).notNull().default(""),
});

export const settings = mysqlTable("mce_settings", {
  name: varchar("name", { length: 80 }).primaryKey(),
  value: text("value").notNull(),
});
