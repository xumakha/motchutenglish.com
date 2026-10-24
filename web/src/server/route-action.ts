import "server-only";
import { refresh, updateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { auth } from "@/auth/auth";
import type { RouteName } from "@/contracts/routes";
import { safeValues } from "./action";
import { currentActor, saveMarketing } from "./actor";
import { AppError } from "./errors";
import type { FormState } from "./form-state";
import { requestId } from "./request";
import { runRoute } from "./run-route";

// Server Action form of a contract route (port of Product::page's POST branch): the form posts
// the route's fields; success shows the handler's message (or "Đã lưu thay đổi.") or follows its
// redirect, and the page re-renders with fresh data.

const MAX_BATCH = 1024 * 1024;

/** FormData → plain input. Repeated keys become arrays; `document` holds JSON text. */
async function formInput(formData: FormData): Promise<Record<string, unknown>> {
  const input: Record<string, unknown> = {};
  for (const [key, value] of formData) {
    if (key.startsWith("$ACTION")) continue;
    if (typeof value !== "string") {
      // An import batch can be uploaded as a file instead of pasted.
      if (key === "batch" && value.size > 0) {
        if (value.size > MAX_BATCH) throw new AppError(422, "Batch tối đa 1 MB.");
        input.raw = await value.text();
      }
      continue;
    }
    const name = key.endsWith("[]") ? key.slice(0, -2) : key;
    if (key.endsWith("[]")) input[name] = [...((input[name] as unknown[]) ?? []), value];
    else input[name] = value;
  }
  if (typeof input.document === "string") {
    try {
      input.document = JSON.parse(input.document);
    } catch {
      throw new AppError(422, "JSON nội dung không hợp lệ.", {
        document: "Kiểm tra cú pháp JSON.",
      });
    }
  }
  return input;
}

export function routeAction(name: RouteName) {
  return async (_prev: FormState, formData: FormData): Promise<FormState> => {
    const values = safeValues(formData);
    let target: string | undefined;
    try {
      const actor = await currentActor({ createGuest: name === "attempts.start" });
      const result = await runRoute(name, await formInput(formData), {
        actor,
        query: new URLSearchParams(),
      });
      const effects = result.effects ?? {};
      if (effects.marketing) await saveMarketing(effects.marketing);
      if (effects.catalog) updateTag("catalog");
      if (effects.signOut)
        await auth()
          .api.signOut({ headers: await headers() })
          .catch(() => undefined);
      const data = result.data as { redirect?: string; message?: string } | undefined;
      if (data?.redirect) target = data.redirect;
      else {
        refresh();
        return {
          status: "success",
          message: data?.message ?? "Đã lưu thay đổi.",
          data: name === "admin.importPreview" ? data : undefined,
        };
      }
    } catch (error) {
      unstable_rethrow(error);
      if (error instanceof AppError) {
        // Lesson and draft JSON errors are shown next to the document editor.
        const fieldErrors =
          error.status === 422 && (name === "admin.draftSave" || name === "admin.version")
            ? { document: error.message, ...error.fieldErrors }
            : error.fieldErrors;
        return { status: "error", message: error.message, fieldErrors, values };
      }
      const id = await requestId();
      console.error(`Action ${name} failed ${id}`, error);
      return {
        status: "error",
        message: "Chưa thể lưu thay đổi. Vui lòng thử lại.",
        values,
        requestId: id,
      };
    }
    redirect(target as never);
  };
}
