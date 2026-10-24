"use client";

import { useActionState } from "react";
import { idleState, type FormState } from "@/server/form-state";
import type { LegacyPreviewResult } from "./actions";

// The body of views/learning/attempt.php: error line, lesson text, and either the answer form or
// the result. Used by /ket-qua/{id} (saved attempt) and /admin/preview/{id} (graded, not saved).

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export interface LegacyAttemptView {
  body: string;
  question: string;
  choices: Record<string, string>;
  /** Present once submitted (never sent to the browser before that). */
  result?: LegacyPreviewResult;
}

export function LegacyAttempt({
  lesson,
  action,
  hidden,
  preview = false,
}: {
  lesson: LegacyAttemptView;
  action: Action;
  hidden: Record<string, string>;
  preview?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const result =
    lesson.result ?? (state.status === "success" ? (state.data as LegacyPreviewResult) : undefined);
  return (
    <>
      {state.status === "error" ? <p role="alert">{state.message}</p> : null}
      <section className="panel">
        <p style={{ whiteSpace: "pre-wrap" }}>{lesson.body}</p>
      </section>
      <section className="panel">
        <h2>{lesson.question}</h2>
        {!result ? (
          <>
            {preview ? <p>Bản xem trước - không lưu kết quả.</p> : null}
            <form action={formAction}>
              {Object.entries(hidden).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <fieldset>
                <legend>Chọn một đáp án</legend>
                {Object.entries(lesson.choices).map(([key, text]) => (
                  <p key={key}>
                    <label>
                      <input
                        type="radio"
                        name="response"
                        value={key}
                        required
                        defaultChecked={state.values?.response === key}
                      />{" "}
                      {text}
                    </label>
                  </p>
                ))}
              </fieldset>
              <p>
                <button className="button" disabled={pending}>
                  {preview ? "Kiểm tra thử" : "Nộp bài và hoàn thành"}
                </button>
              </p>
            </form>
            <p>
              Kết quả chỉ được lưu khi máy chủ xác nhận. Nếu mất mạng, tải lại để kiểm tra trước khi
              nộp lại.
            </p>
          </>
        ) : (
          <>
            <h3>{result.score ? "Đã đạt - 100%" : "Đã hoàn thành - 0%"}</h3>
            <p>Bạn chọn: {lesson.choices[result.response]}</p>
            <p>Đáp án: {result.answer}</p>
            <p>{result.explanation}</p>
            {preview ? (
              <p>Kết quả xem trước không được lưu và không cấp XP.</p>
            ) : (
              <p>
                Hoàn thành lần đầu: 20 XP. Lần đầu đạt: thêm 5 XP. Học lại không nhận lại các thưởng
                này.
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}
