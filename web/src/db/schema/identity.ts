import {
  boolean,
  char,
  int,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  varchar,
} from "drizzle-orm/mysql-core";
import { localDate, ref, utc } from "../columns";
import { users } from "./auth";
import { paths } from "./catalog";

const userRef = () =>
  ref("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

/** No row = learner. Legacy table name kept; the old legacy flows read it too. */
export const learningRoles = mysqlTable("learning_roles", {
  userId: userRef().primaryKey(),
  role: mysqlEnum("role", ["editor", "admin"]).notNull(),
});

/**
 * App profile, 1:1 with users. Email verification now lives on users.email_verified and session
 * revocation in Better Auth, so verified_at and session_version are gone.
 */
export const profiles = mysqlTable("mce_profiles", {
  userId: userRef().primaryKey(),
  goal: varchar("goal", { length: 30 }).notNull().default("foundation"),
  selfLevel: varchar("self_level", { length: 20 }).notNull().default("beginner"),
  minutes: int("minutes").notNull().default(10),
  timezone: varchar("timezone", { length: 80 }).notNull().default("Asia/Ho_Chi_Minh"),
  /** Timezone that defines "today" for quests, streaks and the review cap. */
  questTimezone: varchar("quest_timezone", { length: 80 }).notNull().default("Asia/Ho_Chi_Minh"),
  timezoneChangedAt: utc("timezone_changed_at"),
  reviewLimit: int("review_limit").notNull().default(20),
  pathId: ref("path_id").references(() => paths.id),
  onboardingAt: utc("onboarding_at"),
  gamification: boolean("gamification").notNull().default(true),
  animations: boolean("animations").notNull().default(true),
  avatarStyle: varchar("avatar_style", { length: 30 }),
  deletedAt: utc("deleted_at"),
});

/** A quest-timezone change that applies at the next local midnight. */
export const timezoneChanges = mysqlTable("mce_timezone_changes", {
  userId: userRef().primaryKey(),
  timezone: varchar("timezone", { length: 80 }).notNull(),
  effectiveAfter: utc("effective_after").notNull(),
});

export const consents = mysqlTable("mce_consents", {
  userId: userRef().primaryKey(),
  analytics: boolean("analytics").notNull().default(false),
  clientId: varchar("client_id", { length: 80 }).notNull(),
  updatedAt: utc("updated_at").notNull(),
});

export const cohorts = mysqlTable("mce_cohorts", {
  userId: userRef().primaryKey(),
  localDate: localDate().notNull(),
  timezone: varchar("timezone", { length: 80 }).notNull(),
});

export const reminders = mysqlTable("mce_reminders", {
  userId: userRef().primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  hour: int("hour").notNull().default(19),
  unsubscribeHash: char("unsubscribe_hash", { length: 64 }).notNull().unique(),
});

export const deliveries = mysqlTable(
  "mce_deliveries",
  {
    userId: userRef(),
    localDate: localDate().notNull(),
    type: varchar("type", { length: 30 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.localDate, t.type] })],
);

export const activeTime = mysqlTable(
  "mce_active_time",
  {
    userId: userRef(),
    localDate: localDate().notNull(),
    seconds: int("seconds").notNull().default(0),
    lastPulse: utc("last_pulse").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.localDate] })],
);
