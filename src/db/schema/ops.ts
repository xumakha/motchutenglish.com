import { char, index, int, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { createdAt, id, json, ref, utc } from "../columns";
import { users } from "./auth";

// Background job queue, personal/content exports and marketing journeys.

export type JobStatus = "pending" | "running" | "done" | "failed" | "expired";
export type JobType = "mail" | "reminder" | "analytics" | "export" | "import" | "delete_account";

export const jobs = mysqlTable(
  "mce_jobs",
  {
    id: id(),
    type: varchar("type", { length: 40 }).$type<JobType>().notNull(),
    payload: json<Record<string, unknown>>("payload").notNull(),
    /** Idempotency key: the same event never queues twice. */
    eventKey: varchar("event_key", { length: 200 }).notNull().unique(),
    attempts: int("attempts").notNull().default(0),
    availableAt: utc("available_at").notNull(),
    status: varchar("status", { length: 20 }).$type<JobStatus>().notNull().default("pending"),
    lockedAt: utc("locked_at"),
    lastError: varchar("last_error", { length: 200 }),
    createdAt: createdAt(),
  },
  (t) => [index("jobs_ready").on(t.status, t.availableAt, t.id)],
);

export const exports = mysqlTable("mce_exports", {
  id: char("id", { length: 32 }).primaryKey(),
  userId: ref("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 20 }).$type<"personal" | "content">().notNull(),
  status: varchar("status", { length: 20 }).notNull().default("queued"),
  fileKey: char("file_key", { length: 37 }),
  createdAt: createdAt(),
  expiresAt: utc("expires_at").notNull(),
});

export const journeys = mysqlTable(
  "mce_journeys",
  {
    id: char("id", { length: 32 }).primaryKey(),
    userId: ref("user_id").references(() => users.id, { onDelete: "cascade" }),
    pathSlug: varchar("path_slug", { length: 150 }).notNull(),
    source: varchar("source", { length: 30 }).notNull(),
    medium: varchar("medium", { length: 30 }).notNull(),
    campaign: varchar("campaign", { length: 150 }).notNull(),
    landedAt: utc("landed_at").notNull(),
    guestTrialAt: utc("guest_trial_at"),
    signupAt: utc("signup_at"),
    firstLessonAt: utc("first_lesson_at"),
    returnedAt: utc("returned_at"),
  },
  (t) => [index("journeys_user").on(t.userId, t.landedAt), index("journeys_landed").on(t.landedAt)],
);
