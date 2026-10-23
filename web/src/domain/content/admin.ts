import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { reports, units, versions } from "@/db/schema";
import { withTx } from "@/db/tx";
import { AppError, invalid } from "@/server/errors";
import { requireStaff, requireUserId, type Actor } from "../actor";
import { field, text } from "../php";
import { audit } from "./shared";

// Small admin commands from Product::execute: reorder, unit archive state, report triage, and the
// learner-facing error report.

const ORDERABLE = ["paths", "units", "lessons"] as const;

export async function reorder(actor: Actor, kind: unknown, ids: unknown) {
  requireStaff(actor);
  let list = ids;
  if (typeof list === "string") list = list.split(",").map((v) => Number.parseInt(v, 10));
  if (
    !ORDERABLE.includes(kind as (typeof ORDERABLE)[number]) ||
    !Array.isArray(list) ||
    list.length > 300 ||
    new Set(list).size !== list.length
  )
    throw invalid("Danh sách sắp xếp không hợp lệ.");
  const table = sql.raw(`mce_${kind as string}`);
  await withTx(async (tx) => {
    for (const [i, raw] of list.entries()) {
      const id = Number(raw) || 0;
      const [rows] = (await tx.execute(
        sql`SELECT id FROM ${table} WHERE id = ${id}`,
      )) as unknown as [unknown[]];
      if (!rows.length) throw invalid("Nội dung không tồn tại.");
      await tx.execute(sql`UPDATE ${table} SET sort_order = ${i} WHERE id = ${id}`);
    }
    await audit(tx, actor, "reorder", kind as string);
  });
}

export async function setUnitArchived(actor: Actor, unitId: number, archived: boolean) {
  requireStaff(actor, true);
  await withTx(async (tx) => {
    const [unit] = await tx.select({ id: units.id }).from(units).where(eq(units.id, unitId));
    if (!unit) throw new AppError(404, "Không tìm thấy chương.");
    await tx.update(units).set({ archived }).where(eq(units.id, unitId));
    await audit(tx, actor, "unit_state_changed", `unit:${unitId}`);
  });
}

const REPORT_STATUSES = ["open", "in_progress", "resolved", "rejected"] as const;

export async function triageReport(
  actor: Actor,
  reportId: number,
  status: unknown,
  resolution: unknown = "",
) {
  requireStaff(actor);
  if (!REPORT_STATUSES.includes(status as (typeof REPORT_STATUSES)[number]))
    throw invalid("Trạng thái không hợp lệ.");
  const reason = text(resolution ?? "", 2000);
  await withTx(async (tx) => {
    await tx
      .update(reports)
      .set({ status: status as string, resolution: reason })
      .where(eq(reports.id, reportId));
    await audit(tx, actor, `report_${String(status)}`, `report:${reportId}`);
  });
}

const CATEGORIES = ["answer", "typo", "audio", "other"] as const;

/** A learner reports a problem in published content (rate limit applied by the caller). */
export async function fileReport(
  actor: Actor,
  input: { versionId: number; position?: unknown; category: unknown; description: unknown },
) {
  const uid = requireUserId(actor);
  const [v] = await db()
    .select({ id: versions.id })
    .from(versions)
    .where(and(eq(versions.id, input.versionId), eq(versions.status, "published")));
  if (!v) throw new AppError(404, "Không tìm thấy nội dung.");
  if (!CATEGORIES.includes(input.category as (typeof CATEGORIES)[number]))
    throw invalid("Chọn loại báo lỗi.");
  const description = field("description", () => text(input.description ?? "", 2000));
  await db()
    .insert(reports)
    .values({
      userId: uid,
      versionId: input.versionId,
      position: text(input.position ?? "lesson", 80),
      category: input.category as string,
      description,
    });
}
