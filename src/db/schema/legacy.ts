import { char, int, mysqlEnum, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";
import { createdAt, id, json, ref, utc } from "../columns";
import { users } from "./auth";

// The original single-question lesson system (/admin, /hoc/bai/{id}, /ket-qua/{id}), kept per the
// owner's decision to port every legacy flow.

export const learningLessons = mysqlTable("learning_lessons", {
  id: id(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  question: text("question").notNull(),
  choices: json<Record<string, string>>("choices").notNull(),
  answerId: varchar("answer_id", { length: 20 }).notNull(),
  explanation: text("explanation").notNull(),
  status: mysqlEnum("status", ["draft", "published"]).notNull().default("draft"),
  createdBy: ref("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

export const learningAttempts = mysqlTable("learning_attempts", {
  id: char("id", { length: 32 }).primaryKey(),
  userId: ref("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  lessonId: ref("lesson_id")
    .notNull()
    .references(() => learningLessons.id),
  snapshot: json<Record<string, unknown>>("snapshot").notNull(),
  response: varchar("response", { length: 20 }),
  score: int("score"),
  submittedAt: utc("submitted_at"),
});

export const learningAudit = mysqlTable("learning_audit", {
  id: id(),
  actorId: ref("actor_id")
    .notNull()
    .references(() => users.id),
  action: varchar("action", { length: 50 }).notNull(),
  targetId: ref("target_id").notNull(),
  createdAt: createdAt(),
});

export const learningEvents = mysqlTable("learning_events", {
  id: id(),
  eventKey: varchar("event_key", { length: 150 }).notNull().unique(),
  userId: ref("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  lessonId: ref("lesson_id").notNull(),
  attemptId: char("attempt_id", { length: 32 }).notNull(),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  payload: json<Record<string, unknown>>("payload").notNull(),
  occurredAt: createdAt("occurred_at"),
});

export const learningSeedKeys = mysqlTable("learning_seed_keys", {
  seedKey: varchar("seed_key", { length: 100 }).primaryKey(),
  lessonId: ref("lesson_id").notNull(),
});
