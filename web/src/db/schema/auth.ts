import { boolean, index, int, text, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { mysqlTable } from "drizzle-orm/mysql-core";
import { createdAt, id, ref, utc } from "../columns";

// Better Auth models (user, session, account, verification, rateLimit). Field names are the ones
// Better Auth expects; column names follow the rest of the schema. Ids are serial integers
// (advanced.database.generateId = "serial") so every user_id column stays BIGINT.

export const users = mysqlTable(
  "users",
  {
    id: id(),
    name: varchar("name", { length: 100 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: createdAt(),
    updatedAt: createdAt("updated_at"),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const authSessions = mysqlTable(
  "auth_sessions",
  {
    id: id(),
    token: varchar("token", { length: 255 }).notNull(),
    userId: ref("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: utc("expires_at").notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: createdAt("updated_at"),
  },
  (t) => [uniqueIndex("auth_sessions_token").on(t.token), index("auth_sessions_user").on(t.userId)],
);

export const authAccounts = mysqlTable(
  "auth_accounts",
  {
    id: id(),
    accountId: varchar("account_id", { length: 255 }).notNull(),
    providerId: varchar("provider_id", { length: 64 }).notNull(),
    userId: ref("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    password: varchar("password", { length: 255 }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: utc("access_token_expires_at"),
    refreshTokenExpiresAt: utc("refresh_token_expires_at"),
    scope: text("scope"),
    createdAt: createdAt(),
    updatedAt: createdAt("updated_at"),
  },
  (t) => [index("auth_accounts_user").on(t.userId)],
);

export const authVerifications = mysqlTable(
  "auth_verifications",
  {
    id: id(),
    identifier: varchar("identifier", { length: 255 }).notNull(),
    value: text("value").notNull(),
    expiresAt: utc("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: createdAt("updated_at"),
  },
  (t) => [index("auth_verifications_identifier").on(t.identifier)],
);

/**
 * One fixed-window limiter for Better Auth (via rateLimit.customStorage) and app scopes
 * (start, study, review, reports, …). Keys are sha256 hashes of scope + subject.
 * Fix 9: an expired window is reset in place, and the worker purges stale rows nightly.
 */
export const rateLimits = mysqlTable(
  "rate_limits",
  {
    key: varchar("key", { length: 64 }).primaryKey(),
    count: int("count").notNull().default(0),
    windowStartedAt: utc("window_started_at").notNull(),
  },
  (t) => [index("rate_limits_window").on(t.windowStartedAt)],
);
