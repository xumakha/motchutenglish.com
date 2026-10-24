"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ActionStatus } from "@/components/route-form";
import { idleState, type FormState } from "@/server/form-state";

// The upload form of admin.php (section media). Files up to 10 MB go to the multipart route
// handler POST /api/v1/admin/upload (not a Server Action); the list refreshes afterwards.

export function MediaUpload() {
  const router = useRouter();
  const [state, setState] = useState<FormState>(idleState);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setPending(true);
    try {
      const response = await fetch("/api/v1/admin/upload", {
        method: "POST",
        body: new FormData(form),
        credentials: "same-origin",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        setState({
          status: "error",
          message: result.error?.message ?? "Chưa thể tải tệp lên. Vui lòng thử lại.",
          fieldErrors: result.error?.fieldErrors,
          requestId: result.error?.requestId,
        });
      else {
        setState({ status: "success", message: `Đã tải lên media #${result.data.id}.` });
        form.reset();
        router.refresh();
      }
    } catch {
      setState({ status: "error", message: "Chưa thể tải tệp lên. Kiểm tra kết nối và thử lại." });
    } finally {
      setPending(false);
    }
  }

  const error = (name: string) =>
    state.status === "error" && state.fieldErrors?.[name] ? (
      <span className="field-error">{state.fieldErrors[name]}</span>
    ) : null;

  return (
    <form
      method="post"
      encType="multipart/form-data"
      className="auth-form"
      onSubmit={submit}
      aria-busy={pending || undefined}
    >
      <ActionStatus state={state} />
      <label>
        Tệp JPG/PNG/WebP/MP3/OGG/WAV, tối đa 10 MB
        <input
          type="file"
          name="file"
          accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/ogg,audio/wav"
          required
        />
      </label>
      {error("file")}
      <label>
        Mô tả thay thế
        <input name="alt" required maxLength={500} />
      </label>
      {error("alt")}
      <label>
        Nguồn
        <input name="source" required maxLength={2000} />
      </label>
      {error("source")}
      <label>
        Quyền sử dụng
        <input name="license" required maxLength={500} />
      </label>
      {error("license")}
      <button className="button" disabled={pending}>
        Tải lên
      </button>
    </form>
  );
}
