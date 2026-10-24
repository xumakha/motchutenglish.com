"use client";

import { useEffect, useState, type ReactNode } from "react";
import { commitImportAction, previewImportAction } from "@/actions/routes";
import { ActionStatus, RouteForm } from "@/components/route-form";
import type { FormState } from "@/server/form-state";
import { useActionForm } from "./action-form";

// The imports section of admin.php: the dry-run form with its result, and one status panel per
// batch (views/product/import-status.php) that polls /api/v1/admin/import-status/{id} every 3 s
// while the batch or its worker is still running (assets/js/product.js).

interface ImportIssue {
  record: number;
  field: string;
  message: string;
}
interface PreviewData {
  id: string;
  count: number;
  errors: ImportIssue[];
}
export interface ImportStateView {
  id: string;
  status: string;
  phase: string;
  processed: number;
  total: number;
  committed: number;
  canCommit: boolean;
  errors: ImportIssue[];
  job: { status: string; attempts: number; availableAt: string | Date | null } | null;
}

function PreviewResult({ state }: { state: FormState }) {
  if (state.status !== "success" || !state.data) return null;
  const preview = state.data as PreviewData;
  return (
    <section className="panel">
      <h2>Kết quả kiểm tra</h2>
      <p>{preview.count} record. Không có nội dung nào được xuất bản.</p>
      {preview.errors.length ? (
        <pre data-import-preview-errors="">{JSON.stringify(preview.errors, null, 4)}</pre>
      ) : (
        <RouteForm
          action={commitImportAction}
          fields={{ importId: preview.id }}
          label="Xác nhận nhập tất cả dưới dạng nháp"
        />
      )}
    </section>
  );
}

/** The import panel (intro passed as children) and, as the next panel, the dry-run result. */
export function ImportPreviewPanel({
  template,
  children,
}: {
  template: string;
  children: ReactNode;
}) {
  const { state, props } = useActionForm(previewImportAction);
  return (
    <>
      <section className="panel">
        {children}
        <form {...props} encType="multipart/form-data" className="auth-form">
          <ActionStatus state={state} />
          <label>
            Chọn tệp JSON hoặc CSV
            <input type="file" name="batch" accept="application/json,text/csv,.json,.csv" />
          </label>
          <label>
            Hoặc dán JSON
            <textarea name="raw" rows={12} defaultValue={template} />
          </label>
          <button className="button">Dry-run và xem lỗi</button>
        </form>
      </section>
      <PreviewResult state={state} />
    </>
  );
}

const polling = (s: ImportStateView) =>
  ["queued", "running"].includes(s.status) || ["pending", "running"].includes(s.job?.status ?? "");

const utc = (v: string | Date | null) =>
  v === null ? "" : (typeof v === "string" ? v : v.toISOString()).replace("T", " ").slice(0, 19);

export function ImportStatus({ initial }: { initial: ImportStateView }) {
  const [s, setState] = useState(initial);
  const [failure, setFailure] = useState("");
  const poll = polling(initial);

  useEffect(() => {
    if (!poll) return;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    async function refresh() {
      if (stopped) return;
      if (document.hidden) {
        timer = setTimeout(refresh, 3000);
        return;
      }
      try {
        const response = await fetch(`/api/v1/admin/import-status/${initial.id}`, {
          credentials: "same-origin",
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error?.message || "Không đọc được tiến độ.");
        const next = result.data as ImportStateView;
        setState(next);
        setFailure("");
        if (polling(next)) timer = setTimeout(refresh, 3000);
      } catch (error) {
        setFailure(
          `${error instanceof Error ? error.message : ""} Tải lại trang để kiểm tra; chưa xác nhận lưu.`,
        );
      }
    }
    timer = setTimeout(refresh, 1000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [poll, initial.id]);

  return (
    <section className="panel" data-import-id={s.id} data-import-poll={poll ? "1" : "0"}>
      <h2>Batch {s.id}</h2>
      <p data-import-status="" role="status">
        {failure || `Trạng thái: ${s.status} · ${s.phase}`}
      </p>
      <progress
        data-import-progress=""
        aria-label="Số record đã xử lý, chưa phải số đã lưu"
        value={s.processed}
        max={Math.max(1, s.total)}
      />
      <p data-import-count="">
        Đã xử lý {s.processed} / {s.total} record. Đã xác nhận lưu: {s.committed}.
      </p>
      <p>
        Tiến độ là số record đã xử lý trong giao dịch hiện tại. Chỉ “committed” xác nhận lưu tất cả;
        lỗi hoặc worker bị ngắt sẽ không lưu một phần. Retry bắt đầu lại từ 0.
      </p>
      <p data-import-job="">
        {s.job
          ? `Worker: ${s.job.status} · lần thử ${s.job.attempts} · lịch UTC ${utc(s.job.availableAt)}`
          : null}
      </p>
      <ul data-import-errors="">
        {s.errors.map((issue, i) => (
          <li key={i}>
            Record {issue.record} · {issue.field}: {issue.message}
          </li>
        ))}
      </ul>
      {s.canCommit ? (
        <RouteForm
          action={commitImportAction}
          fields={{ importId: s.id }}
          label="Xác nhận commit"
        />
      ) : null}
    </section>
  );
}
