import { boolean, char, index, int, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { createdAt, id, localDate, ref, utc } from "../columns";
import { users } from "./auth";

// XP/coin ledger, quests, streaks, badges and the reward shop. reward_ledger is the source of
// truth; mce_balances is a projection rebuilt by the worker's reconcile job.

const userRef = () =>
  ref("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

export type Currency = "xp" | "coin";

export const rewardLedger = mysqlTable(
  "reward_ledger",
  {
    id: id(),
    userId: userRef(),
    currency: varchar("currency", { length: 10 }).$type<Currency>().notNull().default("xp"),
    amount: int("amount").notNull(),
    /** Idempotency key, e.g. v2:lesson:{uid}:{lessonId}. */
    eventKey: varchar("event_key", { length: 150 }).notNull().unique(),
    ruleVersion: int("rule_version").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [index("ledger_user_currency").on(t.userId, t.currency, t.createdAt)],
);

export const balances = mysqlTable(
  "mce_balances",
  {
    userId: userRef(),
    currency: varchar("currency", { length: 10 }).$type<Currency>().notNull(),
    amount: int("amount").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.currency] })],
);

export const activities = mysqlTable(
  "mce_activities",
  {
    userId: userRef(),
    localDate: localDate().notNull(),
    timezone: varchar("timezone", { length: 80 }).notNull(),
    lessons: int("lessons").notNull().default(0),
    reviews: int("reviews").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.localDate] })],
);

/** Product events (funnel, analytics). event_key makes each event happen once. */
export const events = mysqlTable(
  "mce_events",
  {
    id: char("id", { length: 32 }).primaryKey(),
    eventKey: varchar("event_key", { length: 200 }).notNull().unique(),
    userId: ref("user_id").references(() => users.id, { onDelete: "set null" }),
    type: varchar("type", { length: 60 }).notNull(),
    resourceId: varchar("resource_id", { length: 80 }).notNull(),
    version: int("version").notNull().default(1),
    occurredAt: utc("occurred_at").notNull(),
  },
  (t) => [
    index("events_user_type_time").on(t.userId, t.type, t.occurredAt),
    index("operational_events").on(t.type, t.occurredAt, t.userId),
  ],
);

export const quests = mysqlTable(
  "mce_quests",
  {
    userId: userRef(),
    localDate: localDate().notNull(),
    template: varchar("template", { length: 30 }).notNull(),
    timezone: varchar("timezone", { length: 80 }).notNull(),
    target: int("target").notNull(),
    progress: int("progress").notNull().default(0),
    rewarded: boolean("rewarded").notNull().default(false),
    ruleVersion: int("rule_version").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.userId, t.localDate, t.template] })],
);

export const questEvents = mysqlTable(
  "mce_quest_events",
  {
    userId: userRef(),
    localDate: localDate().notNull(),
    template: varchar("template", { length: 30 }).notNull(),
    sourceKey: varchar("source_key", { length: 150 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.localDate, t.template, t.sourceKey] })],
);

export const streakState = mysqlTable("mce_streak_state", {
  userId: userRef().primaryKey(),
  currentStreak: int("current_streak").notNull().default(0),
  longestStreak: int("longest_streak").notNull().default(0),
  learnedDays: int("learned_days").notNull().default(0),
  tickets: int("tickets").notNull().default(0),
  autoProtect: boolean("auto_protect").notNull().default(true),
  lastDate: localDate("last_date"),
});

/** Closed days are immutable: learned, protected or missed. */
export const streakCalendar = mysqlTable(
  "mce_streak_calendar",
  {
    userId: userRef(),
    localDate: localDate().notNull(),
    status: varchar("status", { length: 20 }).$type<"learned" | "protected" | "missed">().notNull(),
    timezone: varchar("timezone", { length: 80 }).notNull(),
    evaluatedAt: utc("evaluated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.localDate] })],
);

export const inventoryEvents = mysqlTable("mce_inventory_events", {
  id: id(),
  userId: userRef(),
  eventKey: varchar("event_key", { length: 150 }).notNull().unique(),
  amount: int("amount").notNull(),
  occurredAt: utc("occurred_at").notNull(),
});

export const badges = mysqlTable(
  "mce_badges",
  {
    userId: userRef(),
    badge: varchar("badge", { length: 30 }).notNull(),
    awardedAt: utc("awarded_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.badge] })],
);

export const shop = mysqlTable("mce_shop", {
  id: varchar("id", { length: 30 }).primaryKey(),
  title: varchar("title", { length: 100 }).notNull(),
  price: int("price").notNull(),
  style: varchar("style", { length: 30 }).notNull(),
  active: boolean("active").notNull().default(true),
});

export const inventory = mysqlTable(
  "mce_inventory",
  {
    userId: userRef(),
    itemId: varchar("item_id", { length: 30 })
      .notNull()
      .references(() => shop.id),
    purchasedAt: utc("purchased_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId] })],
);

/** request_key makes a purchase idempotent; reuse with a different item is a 409. */
export const purchases = mysqlTable("mce_purchases", {
  requestKey: char("request_key", { length: 32 }).primaryKey(),
  userId: userRef(),
  itemId: varchar("item_id", { length: 30 }).notNull(),
  price: int("price").notNull(),
  createdAt: utc("created_at").notNull(),
});
