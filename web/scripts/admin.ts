import "./load-env";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/auth/auth";
import { db, pool } from "@/db/client";
import { audit, learningRoles, users } from "@/db/schema";
import { withTx } from "@/db/tx";
import { ensureProfile } from "@/domain/identity/profile";
import { env } from "@/env";

// Operator CLI (ports of database/create-admin.php, set-role.php and check.php).
//   pnpm admin create EMAIL "NAME" [--local]   password on stdin, or --local to generate one
//   pnpm admin set-role EMAIL admin|editor|learner
//   pnpm admin check

const usage = `Usage:
  pnpm admin create EMAIL "NAME" [--local]
  pnpm admin set-role EMAIL admin|editor|learner
  pnpm admin check`;

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks)
    .toString("utf8")
    .replace(/\r?\n$/, "");
}

async function createAdmin(emailArg: string, name: string, local: boolean) {
  const email = emailArg.trim().toLowerCase();
  if (!isEmail(email)) throw new Error(usage);
  const { APP_ENV, DATABASE_URL } = env();
  const host = new URL(DATABASE_URL).hostname;
  if (local && (APP_ENV === "production" || !["127.0.0.1", "localhost"].includes(host)))
    throw new Error("Local credentials are only allowed on local databases");

  const password = local ? randomBytes(12).toString("hex") : await readStdin();
  const bytes = Buffer.byteLength(password);
  if ([...password].length < 8 || bytes > 72)
    throw new Error("Password needs at least 8 characters and at most 72 bytes");

  const ctx = await auth().$context;
  if (await ctx.internalAdapter.findUserByEmail(email))
    throw new Error(
      "Account exists. Use set-role to grant access; passwords are never overwritten.",
    );
  const user = await ctx.internalAdapter.createUser(
    { email, name: name.slice(0, 100) },
    { method: "admin" },
  );
  const userId = Number(user.id);
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(password),
  });
  await withTx(async (tx) => {
    await tx.insert(learningRoles).values({ userId, role: "admin" });
    await ensureProfile(tx, userId);
    await tx.insert(audit).values({
      actorId: userId,
      action: "cli_admin_created",
      target: `user:${userId}`,
      details: {},
      occurredAt: new Date(),
    });
  });

  if (!local) return console.log("Administrator created.");
  const dir = join(process.cwd(), env().WRITABLE_DIR);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, `local-admin-${randomBytes(4).toString("hex")}.txt`);
  await writeFile(
    file,
    `Local development account only\nEmail: ${email}\nPassword: ${password}\n`,
    { mode: 0o600, flag: "wx" },
  );
  console.log(`Local credentials saved privately: ${file}`);
}

async function setRole(emailArg: string, role: string) {
  const email = emailArg.trim().toLowerCase();
  if (!isEmail(email) || !["admin", "editor", "learner"].includes(role)) throw new Error(usage);
  const [user] = await db().select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) throw new Error("Register the account first.");
  await withTx(async (tx) => {
    if (role === "learner") await tx.delete(learningRoles).where(eq(learningRoles.userId, user.id));
    else
      await tx
        .insert(learningRoles)
        .values({ userId: user.id, role: role as "admin" | "editor" })
        .onDuplicateKeyUpdate({ set: { role: role as "admin" | "editor" } });
    await tx.insert(audit).values({
      actorId: null,
      action: "cli_role_changed",
      target: `user:${user.id}`,
      details: { role },
      occurredAt: new Date(),
    });
  });
  console.log("Role updated.");
}

/** Read-only health check: config, connection, timezone, collation and migrated tables. */
async function check() {
  const results: [boolean, string][] = [];
  const pass = (ok: boolean, message: string) => results.push([ok, message]);
  try {
    env();
    pass(true, "environment is valid");
  } catch (error) {
    pass(false, (error as Error).message);
  }
  const [[row]] = (await db().execute(
    sql`SELECT @@session.time_zone AS tz, @@collation_database AS collation, VERSION() AS version`,
  )) as unknown as [{ tz: string; collation: string; version: string }[]];
  pass(true, `connected to ${row!.version}`);
  pass(row!.tz === "+00:00", `session time zone is UTC (${row!.tz})`);
  pass(row!.collation === "utf8mb4_unicode_ci", `database collation (${row!.collation})`);
  const [tables] = (await db().execute(
    sql`SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`,
  )) as unknown as [{ n: number }[]];
  pass(Number(tables[0]!.n) >= 61, `${tables[0]!.n} tables present (expected 61 incl. migrations)`);
  for (const [ok, message] of results) console.log(`${ok ? "PASS" : "FAIL"}: ${message}`);
  if (results.some(([ok]) => !ok)) process.exitCode = 1;
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "create")
    await createAdmin(args[0] ?? "", args[1] ?? "Quản trị viên", args.includes("--local"));
  else if (command === "set-role") await setRole(args[0] ?? "", args[1] ?? "");
  else if (command === "check") await check();
  else {
    console.error(usage);
    process.exitCode = 2;
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  pool().end();
}
