import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { jobs, learningRoles, media, pageSeo, rewardLedger, settings, users } from "@/db/schema";
import { withTx } from "@/db/tx";
import { AppError, conflict, invalid } from "@/server/errors";
import { requireStaff, type Actor } from "../actor";
import { seoText } from "../assessment/validate";
import { audit } from "../content/shared";
import { award, ledgerBalance } from "../motivation/rewards";
import { lockProfile } from "../motivation/profile";
import { field, hexKey, text } from "../php";

// Admin-only site commands from Product::execute and Seo::save: page SEO overrides, settings,
// roles, reward corrections and job retries.

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";

/** Seo::publicPath: a public URL that may carry an SEO override. */
export function isPublicPath(path: string): boolean {
  return (
    path === "/" ||
    /^\/(?:lo-trinh|tu-vung|kien-thuc|courses|listening|toeic|placement|kiem-tra-dau-vao|gioi-thieu|lien-he|dieu-khoan|bao-mat)$/.test(
      path,
    ) ||
    new RegExp(`^/(?:lo-trinh|bai-hoc|kien-thuc|chien-dich|listening|tu-vung)/${SLUG}$`).test(
      path,
    ) ||
    new RegExp(`^/(?:tu-vung/chu-de/${SLUG}|courses/${SLUG}(?:/${SLUG})?)$`).test(path)
  );
}

/** Seo::entityPath: pages whose SEO lives on the content item itself, not in overrides. */
export const isEntityPath = (path: string) =>
  /^\/(?:lo-trinh\/[^/]+|bai-hoc\/[^/]+|kien-thuc\/[^/]+|tu-vung\/(?:chu-de\/[^/]+|(?!chu-de$)[^/]+))$/.test(
    path,
  );

export async function savePageSeo(
  actor: Actor,
  input: { path: unknown; title?: unknown; description?: unknown },
) {
  requireStaff(actor, true);
  const path = input.path;
  if (typeof path !== "string" || path.length > 255 || !isPublicPath(path) || isEntityPath(path))
    throw invalid(
      "Chọn URL public hợp lệ, không có query. Nội dung riêng từng bài/lộ trình/từ cần sửa trong bản nháp của nội dung đó.",
    );
  const title = field("title", () => seoText(input.title ?? "", 160));
  const description = field("description", () => seoText(input.description ?? "", 320));
  await withTx(async (tx) => {
    if (!title && !description) await tx.delete(pageSeo).where(eq(pageSeo.path, path));
    else
      await tx
        .insert(pageSeo)
        .values({ path, title, description })
        .onDuplicateKeyUpdate({ set: { title, description } });
    await audit(tx, actor, "seo_changed", path);
  });
}

const SETTINGS = [
  "site_name",
  "primary",
  "accent",
  "logo_media_id",
  "favicon_media_id",
  "social_url",
  "default_minutes",
  "gamification",
  "contact_email",
  "privacy_text",
  "terms_text",
] as const;

export async function saveSetting(actor: Actor, name: unknown, valueInput: unknown) {
  requireStaff(actor, true);
  if (!SETTINGS.includes(name as (typeof SETTINGS)[number]))
    throw invalid("Cấu hình không được phép.");
  const key = name as (typeof SETTINGS)[number];
  const value = text(
    valueInput ?? "",
    key === "privacy_text" || key === "terms_text" ? 15000 : 200,
    false,
  );
  if (key === "contact_email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    throw invalid("Email liên hệ không hợp lệ.");
  if ((key === "primary" || key === "accent") && !/^#[a-fA-F0-9]{6}$/.test(value))
    throw invalid("Màu phải ở dạng #RRGGBB.");
  if (key === "social_url" && value) {
    let ok = false;
    try {
      ok = new URL(value).protocol === "https:";
    } catch {}
    if (!ok) throw invalid("Đường dẫn phải dùng HTTPS.");
  }
  if ((key === "logo_media_id" || key === "favicon_media_id") && value) {
    const [m] = await db()
      .select({ mime: media.mime })
      .from(media)
      .where(eq(media.id, Number(value) || 0));
    if (!m?.mime.startsWith("image/")) throw invalid("Logo/favicon cần tệp ảnh đã tải lên.");
  }
  if (key === "default_minutes" && ![5, 10, 15, 20].includes(Number(value)))
    throw invalid("Mục tiêu mặc định cần là 5, 10, 15 hoặc 20 phút.");
  if (key === "gamification" && value !== "0" && value !== "1") throw invalid("Dùng 0 hoặc 1.");
  await withTx(async (tx) => {
    await tx.insert(settings).values({ name: key, value }).onDuplicateKeyUpdate({ set: { value } });
    await audit(tx, actor, "setting_changed", key);
  });
}

export async function setRole(actor: Actor, userId: number, role: unknown) {
  const me = requireStaff(actor, true);
  if (role !== "learner" && role !== "editor" && role !== "admin")
    throw invalid("Vai trò không hợp lệ.");
  if (userId === me) throw invalid("Không tự đổi vai trò của tài khoản đang dùng.");
  const [user] = await db().select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (!user) throw new AppError(404, "Không tìm thấy tài khoản.");
  await withTx(async (tx) => {
    if (role === "learner") await tx.delete(learningRoles).where(eq(learningRoles.userId, userId));
    else
      await tx
        .insert(learningRoles)
        .values({ userId, role })
        .onDuplicateKeyUpdate({ set: { role } });
    await audit(tx, actor, "role_changed", `user:${userId}`, { role });
  });
}

/** A manual XP/coin correction. Same request key with different values is a conflict. */
export async function adjustReward(
  actor: Actor,
  input: {
    userId: number;
    amount: unknown;
    currency: unknown;
    reason: unknown;
    requestKey: unknown;
  },
) {
  requireStaff(actor, true);
  const amount = Number(input.amount);
  const reason = text(input.reason ?? "", 1000);
  const key = hexKey(input.requestKey);
  const [user] = await db().select({ id: users.id }).from(users).where(eq(users.id, input.userId));
  if (
    !Number.isInteger(amount) ||
    amount === 0 ||
    Math.abs(amount) > 10000 ||
    (input.currency !== "xp" && input.currency !== "coin") ||
    !user
  )
    throw invalid("Điều chỉnh không hợp lệ.");
  const currency = input.currency;
  await withTx(async (tx) => {
    await lockProfile(tx, input.userId, { allowDeleted: true });
    const [prior] = await tx
      .select()
      .from(rewardLedger)
      .where(eq(rewardLedger.eventKey, `v2:correction:${key}`));
    if (prior) {
      if (prior.userId !== input.userId || prior.currency !== currency || prior.amount !== amount)
        throw conflict("Mã yêu cầu đã gắn với điều chỉnh khác.");
      return;
    }
    if ((await ledgerBalance(tx, input.userId, currency)) + amount < 0)
      throw invalid("Điều chỉnh không được làm số dư âm.");
    await award(tx, input.userId, currency, amount, `correction:${key}`);
    await audit(tx, actor, "reward_correction", `user:${input.userId}`, {
      amount,
      currency,
      reason,
      eventKey: key,
    });
  });
}

/** Retry a failed job, unless delivery is uncertain (it might already have been sent). */
export async function retryJob(actor: Actor, jobId: number) {
  requireStaff(actor, true);
  const [job] = await db()
    .select({ status: jobs.status, lastError: jobs.lastError })
    .from(jobs)
    .where(eq(jobs.id, jobId));
  if (!job || job.status !== "failed" || (job.lastError ?? "").includes("uncertain"))
    throw invalid(
      "Chỉ retry tác vụ thất bại xác định chưa gửi. Trường hợp chưa rõ cần đối soát trước.",
    );
  await withTx(async (tx) => {
    await tx
      .update(jobs)
      .set({ status: "pending", attempts: 0, availableAt: new Date() })
      .where(and(eq(jobs.id, jobId), eq(jobs.status, "failed")));
    await audit(tx, actor, "job_retried", `job:${jobId}`);
  });
}
