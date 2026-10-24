import { randomBytes } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth } from "@/auth/auth";
import { db, pool } from "@/db/client";
import { authVerifications, reminders, users } from "@/db/schema";
import { withTx } from "@/db/tx";
import type { Actor } from "@/domain/actor";
import {
  consumeEmailToken,
  createEmailToken,
  mintEmailToken,
  releaseEmailToken,
  requestAccountDeletion,
  requestEmailVerification,
  requestPasswordReset,
  resetPassword,
  setReminders,
} from "@/domain/identity/account";
import { ensureProfile } from "@/domain/identity/profile";
import { exportForDownload, requestExport } from "@/domain/exports/exports";
import { env } from "@/env";
import { run, tick } from "@/worker/jobs";
import { createUser } from "./fixtures";

// Port of tests/account_http.py at the domain level: every email goes through the real worker and
// the development mail sink (MAIL_DRIVER=log), and the links in it are used as a learner would.

afterAll(() => pool().end());

const password = "Product-test-123!";
let actor: Actor;
let uid: number;
let email: string;

async function latestMail(to: string, subject: string): Promise<string> {
  const dir = resolve(process.cwd(), env().WRITABLE_DIR, "mail");
  const files = await Promise.all(
    (await readdir(dir)).map(async (name) => ({
      name,
      mtime: (await stat(resolve(dir, name))).mtimeMs,
    })),
  );
  for (const { name } of files.sort((a, b) => b.mtime - a.mtime)) {
    const mail = JSON.parse(await readFile(resolve(dir, name), "utf8"));
    if (mail.recipient === to && mail.subject.includes(subject)) {
      const token = /#token=([A-Za-z0-9_-]+)/.exec(mail.text)?.[1];
      if (!token) throw new Error("Mail has no link token");
      expect(mail.html).toContain(token);
      return token;
    }
  }
  throw new Error(`No mail to ${to} about "${subject}"`);
}

const user = async () => (await db().select().from(users).where(eq(users.id, uid)))[0]!;

beforeAll(async () => {
  process.env.MAIL_DRIVER = "log";
  if (env().MAIL_DRIVER !== "log") throw new Error("Run with MAIL_DRIVER=log");
  email = `worker-${randomBytes(5).toString("hex")}@example.test`;
  const ctx = await auth().$context;
  const created = await ctx.internalAdapter.createUser(
    { email, name: "Worker test" },
    { method: "admin" },
  );
  uid = Number(created.id);
  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: "credential",
    accountId: created.id,
    password: await ctx.password.hash(password),
  });
  await withTx((tx) => ensureProfile(tx, uid));
  actor = { userId: uid, role: "learner", guestKey: null };
});

describe("account emails through the worker", () => {
  it("verification link works once", async () => {
    await requestEmailVerification(actor);
    await run(50);
    const token = await latestMail(email, "Xác minh");
    await consumeEmailToken(token, "verify");
    expect((await user()).emailVerified).toBe(true);
    await expect(consumeEmailToken(token, "verify")).rejects.toMatchObject({ status: 422 });
  });

  it("password reset link works once; unknown emails get the same answer", async () => {
    expect(await requestPasswordReset(email)).toEqual(
      await requestPasswordReset(`missing-${randomBytes(5).toString("hex")}@example.test`),
    );
    await run(50);
    const token = await latestMail(email, "Đặt lại");
    await resetPassword(token, "Reset-password-456!");
    await expect(resetPassword(token, "Reset-password-456!")).rejects.toMatchObject({
      status: 422,
    });
  });

  it("a new email only takes effect after its link is used", async () => {
    const next = `changed-${randomBytes(5).toString("hex")}@example.test`;
    await requestEmailVerification(actor, next);
    expect((await user()).email).toBe(email);
    await run(50);
    await consumeEmailToken(await latestMail(next, "Xác minh"), "verify");
    expect((await user()).email).toBe(next);
    email = next;
  });

  it("reminders are queued once per day and the unsubscribe link turns them off", async () => {
    await setReminders(actor, true, 0);
    await tick();
    await tick();
    const [{ n }] = (
      (await db().execute(
        sql`SELECT COUNT(*) AS n FROM mce_jobs WHERE type = 'reminder' AND event_key LIKE ${`reminder:${uid}:%`}`,
      )) as unknown as [{ n: number }[]]
    )[0] as [{ n: number }];
    expect(Number(n)).toBe(1);
    await run(50);
    await consumeEmailToken(await latestMail(email, "Một chút English hôm nay"), "unsubscribe");
    const [r] = await db().select().from(reminders).where(eq(reminders.userId, uid));
    expect(r!.enabled).toBe(false);
  });

  it("a definite send failure releases the token so the retry mints a working one", async () => {
    const id = await withTx((tx) => createEmailToken(tx, uid, "verify", { minutes: 60 }));
    const first = await mintEmailToken(id);
    await releaseEmailToken(id);
    const second = await mintEmailToken(id);
    expect(second?.token).toBeTruthy();
    expect(second!.token).not.toBe(first!.token);
    await expect(consumeEmailToken(first!.token, "verify")).rejects.toMatchObject({ status: 422 });
    await db().delete(authVerifications).where(eq(authVerifications.id, id));
  });

  it("a personal export is built once and only its owner can download it", async () => {
    const key = randomBytes(16).toString("hex");
    await requestExport(actor, "personal", key);
    await requestExport(actor, "personal", key);
    await run(50);
    const file = await exportForDownload(actor, key);
    const text = await readFile(file.path, "utf8");
    const doc = JSON.parse(text);
    expect(doc.kind).toBe("personal");
    expect(doc.user[0].email).toBe(email);
    expect(text).not.toContain("password");
    await expect(
      exportForDownload({ userId: null, role: "guest", guestKey: "x" }, key),
    ).rejects.toMatchObject({ status: 401 });
    const other = await createUser();
    await expect(exportForDownload(other, key)).rejects.toMatchObject({ status: 404 });
  });

  it("account deletion is erased by the worker", async () => {
    await requestAccountDeletion(actor, "Reset-password-456!");
    await run(50);
    const erased = await user();
    expect(erased.name).toBe("Tài khoản đã xóa");
    expect(erased.email).toMatch(/@invalid\.local$/);
    for (const table of ["mce_reminders", "mce_exports", "auth_sessions", "auth_accounts"]) {
      const [rows] = (await db().execute(
        sql`SELECT COUNT(*) AS n FROM ${sql.raw(table)} WHERE user_id = ${uid}`,
      )) as unknown as [{ n: number }[]];
      expect(Number(rows[0]!.n), table).toBe(0);
    }
  });
});
