import { sql } from "drizzle-orm";
import { bigint, customType, date, datetime } from "drizzle-orm/mysql-core";

// Column helpers shared by every schema file. All times are stored in UTC (the pool sets the
// session time_zone to +00:00) and local calendar days are kept as 'YYYY-MM-DD' strings so a JS
// Date never shifts them.

/** BIGINT UNSIGNED primary key, auto increment. Better Auth uses the same "serial" ids. */
export const id = (name = "id") =>
  bigint(name, { mode: "number", unsigned: true }).autoincrement().primaryKey();

/** BIGINT UNSIGNED reference column. */
export const ref = (name: string) => bigint(name, { mode: "number", unsigned: true });

/** DATETIME(3) in UTC. */
export const utc = (name: string) => datetime(name, { mode: "date", fsp: 3 });

/** DATETIME(3) defaulting to the insert time. */
export const createdAt = (name = "created_at") =>
  utc(name)
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`);

/** A user's local calendar day, never converted to a Date. */
export const localDate = (name = "local_date") => date(name, { mode: "string" });

/**
 * JSON stored as MariaDB JSON (LONGTEXT + json_valid). mysql2 returns MariaDB JSON as text,
 * so values are parsed here. Unicode is written unescaped, like PHP's JSON_UNESCAPED_UNICODE.
 */
export const json = <T>(name: string) =>
  customType<{ data: T; driverData: string }>({
    dataType: () => "json",
    toDriver: (value) => JSON.stringify(value),
    fromDriver: (value) => (typeof value === "string" ? JSON.parse(value) : value) as T,
  })(name);
