import {
  boolean,
  char,
  index,
  int,
  mysqlTable,
  primaryKey,
  text,
  tinyint,
  unique,
  varchar,
} from "drizzle-orm/mysql-core";
import { createdAt, id, json, ref, utc } from "../columns";
import { users } from "./auth";
import { lessons, versions } from "./catalog";

// Attempts, items and progress for the lesson player, plus vocabulary and spaced review.

export type AttemptMode = "practice" | "test" | "preview";
export type AttemptStatus = "active" | "finished";
export type ItemState = "unanswered" | "draft" | "submitted" | "skipped" | "unavailable";

export type { Grading, PresentedOrder } from "@/domain/assessment/grade";
import type { Grading, PresentedOrder } from "@/domain/assessment/grade";

export const attempts = mysqlTable(
  "mce_attempts",
  {
    /** The client's start request key doubles as the attempt id (idempotent start). */
    id: char("id", { length: 32 }).primaryKey(),
    userId: ref("user_id").references(() => users.id, { onDelete: "cascade" }),
    /** sha256 of the guest cookie value; null once claimed or for signed-in starts. */
    guestKey: char("guest_key", { length: 64 }),
    versionId: ref("version_id")
      .notNull()
      .references(() => versions.id),
    mode: varchar("mode", { length: 20 }).$type<AttemptMode>().notNull().default("practice"),
    revision: int("revision").notNull().default(0),
    position: int("position").notNull().default(0),
    viewed: json<string[]>("viewed").notNull(),
    status: varchar("status", { length: 20 }).$type<AttemptStatus>().notNull().default("active"),
    score: int("score"),
    maxScore: int("max_score"),
    startedAt: createdAt("started_at"),
    finishedAt: utc("finished_at"),
    activeSeconds: int("active_seconds").notNull().default(0),
    lastHeartbeat: utc("last_heartbeat"),
  },
  (t) => [
    index("attempt_resume").on(t.userId, t.status, t.startedAt),
    index("attempt_guest").on(t.guestKey),
  ],
);

export const items = mysqlTable(
  "mce_items",
  {
    attemptId: char("attempt_id", { length: 32 })
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    exerciseId: varchar("exercise_id", { length: 80 }).notNull(),
    presentedOrder: json<PresentedOrder>("presented_order").notNull(),
    response: json<unknown>("response"),
    firstResponse: json<unknown>("first_response"),
    grading: json<Grading>("grading"),
    state: varchar("state", { length: 20 }).$type<ItemState>().notNull().default("unanswered"),
  },
  (t) => [primaryKey({ columns: [t.attemptId, t.exerciseId] })],
);

export const progress = mysqlTable(
  "mce_progress",
  {
    userId: ref("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: ref("lesson_id")
      .notNull()
      .references(() => lessons.id),
    firstScore: int("first_score"),
    bestScore: int("best_score"),
    completedAt: utc("completed_at").notNull(),
    passedAt: utc("passed_at"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] })],
);

// ---- Vocabulary ----

export const vocabulary = mysqlTable("mce_vocabulary", {
  id: id(),
  slug: varchar("slug", { length: 150 }).notNull().unique(),
  lemma: varchar("lemma", { length: 150 }).notNull(),
  ipa: varchar("ipa", { length: 150 }).notNull().default(""),
  partOfSpeech: varchar("part_of_speech", { length: 60 }).notNull(),
  topic: varchar("topic", { length: 100 }).notNull(),
  meaning: text("meaning").notNull(),
  example: text("example").notNull(),
  translation: text("translation").notNull(),
  level: varchar("level", { length: 20 }).notNull().default("A1"),
  audioId: ref("audio_id"),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  seoTitle: varchar("seo_title", { length: 160 }).notNull().default(""),
  seoDescription: varchar("seo_description", { length: 320 }).notNull().default(""),
});

export const vocabularySets = mysqlTable("mce_vocabulary_sets", {
  id: id(),
  slug: varchar("slug", { length: 150 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  sortOrder: int("sort_order").notNull().default(0),
  seoTitle: varchar("seo_title", { length: 160 }).notNull().default(""),
  seoDescription: varchar("seo_description", { length: 320 }).notNull().default(""),
});

export const vocabularySetItems = mysqlTable(
  "mce_vocabulary_set_items",
  {
    setId: ref("set_id")
      .notNull()
      .references(() => vocabularySets.id),
    senseId: ref("sense_id")
      .notNull()
      .references(() => vocabulary.id),
  },
  (t) => [primaryKey({ columns: [t.setId, t.senseId] })],
);

export const userVocabulary = mysqlTable(
  "mce_user_vocabulary",
  {
    userId: ref("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    senseId: ref("sense_id")
      .notNull()
      .references(() => vocabulary.id),
    notes: text("notes").notNull(),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.senseId] })],
);

// ---- Spaced review ----

export interface CardSnapshot {
  front: string;
  back: string;
  example?: string;
  ipa?: string;
  partOfSpeech?: string;
  translation?: string;
  audioId?: number | null;
}

export interface Schedule {
  intervalDays: number;
  dueAt: string;
  algorithmVersion: number;
}

/** hidden: 0 visible, 1 hidden by the learner, 2 removed. */
export const reviewCards = mysqlTable(
  "mce_review_cards",
  {
    id: id(),
    userId: ref("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetKey: varchar("target_key", { length: 150 }).notNull(),
    snapshot: json<CardSnapshot>("snapshot").notNull(),
    intervalDays: int("interval_days").notNull().default(0),
    dueAt: utc("due_at").notNull(),
    hidden: tinyint("hidden").notNull().default(0),
    revision: int("revision").notNull().default(0),
  },
  (t) => [
    unique("review_cards_user_target").on(t.userId, t.targetKey),
    index("review_cards_due").on(t.userId, t.hidden, t.dueAt),
  ],
);

export const reviewEvents = mysqlTable(
  "mce_review_events",
  {
    id: id(),
    userId: ref("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: ref("card_id")
      .notNull()
      .references(() => reviewCards.id, { onDelete: "cascade" }),
    requestKey: char("request_key", { length: 32 }).notNull().unique(),
    rating: varchar("rating", { length: 20 }).notNull(),
    previousSchedule: json<Schedule>("previous_schedule").notNull(),
    newSchedule: json<Schedule>("new_schedule").notNull(),
    algorithmVersion: int("algorithm_version").notNull().default(1),
    occurredAt: utc("occurred_at").notNull(),
  },
  (t) => [
    index("review_events_user_time").on(t.userId, t.occurredAt),
    index("review_user_target").on(t.userId, t.cardId),
  ],
);
