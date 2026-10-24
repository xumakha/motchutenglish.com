"use server";

import { notFound, redirect, unstable_rethrow } from "next/navigation";
import {
  previewLegacy,
  publishLegacyLesson,
  saveLegacyLesson,
  submitLegacy,
} from "@/domain/legacy/lessons";
import { safeValues } from "@/server/action";
import { currentActor } from "@/server/actor";
import { AppError } from "@/server/errors";
import type { FormState } from "@/server/form-state";
import { requestId } from "@/server/request";
import { logError } from "@/server/log";

// Server Actions for the original single-question lessons (application/controllers/Learning.php).
// They are not contract routes, so they live here rather than in src/actions/routes.ts.

const str = (formData: FormData, key: string) => {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
};

async function run(
  formData: FormData,
  fallback: string,
  body: () => Promise<FormState | void>,
): Promise<FormState> {
  try {
    return (await body()) ?? { status: "success" };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AppError) {
      if (error.status === 404) notFound();
      return { status: "error", message: error.message, values: safeValues(formData) };
    }
    logError(`Legacy action failed ${await requestId()}`, error);
    return { status: "error", message: fallback, values: safeValues(formData) };
  }
}

const DB_ERROR = "Chưa kết nối được dữ liệu học. Vui lòng kiểm tra cấu hình và chạy migration.";

/** POST /admin: create or edit a draft, or publish (admin only). Then back to /admin. */
export async function saveLegacyLessonAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const state = await run(formData, DB_ERROR, async () => {
    const actor = await currentActor();
    const action = str(formData, "action");
    const lessonId = Number(str(formData, "lesson_id")) || 0;
    if (action === "publish") {
      if (actor.role !== "admin") throw new AppError(403, "Chỉ quản trị viên được xuất bản.");
      await publishLegacyLesson(actor, lessonId);
    } else
      await saveLegacyLesson(actor, {
        action: action === "edit" ? "edit" : "create",
        lessonId,
        title: str(formData, "title"),
        body: str(formData, "body"),
        question: str(formData, "question"),
        explanation: str(formData, "explanation"),
        one: str(formData, "one"),
        two: str(formData, "two"),
        answer: str(formData, "answer"),
      });
  });
  if (state.status === "error") return state;
  redirect("/admin");
}

export interface LegacyPreviewResult {
  response: string;
  score: 0 | 1;
  answer: string;
  explanation: string;
}

/** POST /admin/preview/{id}: grade without saving anything. */
export async function previewLegacyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(formData, "Chưa thể kết nối dữ liệu.", async () => {
    const response = str(formData, "response");
    const { lesson, score } = await previewLegacy(
      await currentActor(),
      Number(str(formData, "lesson_id")) || 0,
      response,
    );
    const data: LegacyPreviewResult = {
      response,
      score: score ?? 0,
      answer: lesson.choices[lesson.answerId] ?? "",
      explanation: lesson.explanation,
    };
    return { status: "success", data };
  });
}

/** POST /ket-qua/{id}: submit once, then show the saved result. */
export async function submitLegacyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = str(formData, "attempt_id");
  const state = await run(
    formData,
    "Chưa thể đọc hoặc lưu kết quả. Vui lòng tải lại và thử lại.",
    async () => {
      if (!/^[a-f0-9]{32}$/.test(id)) notFound();
      await submitLegacy(await currentActor(), id, str(formData, "response"));
    },
  );
  if (state.status === "error") return state;
  redirect(`/ket-qua/${id}`);
}
