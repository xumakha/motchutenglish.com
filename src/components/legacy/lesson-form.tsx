"use client";

import { useActionState } from "react";
import { idleState } from "@/server/form-state";
import { saveLegacyLessonAction } from "./actions";

// The draft form of views/learning/index.php (section admin): text, one question, two choices.

const FIELDS: [string, string, number][] = [
  ["title", "Tên bài học", 200],
  ["body", "Nội dung bài học", 30000],
  ["question", "Câu hỏi", 5000],
  ["one", "Lựa chọn thứ nhất", 2000],
  ["two", "Lựa chọn thứ hai", 2000],
  ["explanation", "Giải thích đáp án", 5000],
];

export interface LegacyDraftValues {
  id: number;
  title: string;
  body: string;
  question: string;
  one: string;
  two: string;
  explanation: string;
  answer: string;
}

export function LegacyLessonForm({ draft }: { draft: LegacyDraftValues | null }) {
  const [state, formAction, pending] = useActionState(saveLegacyLessonAction, idleState);
  const value = (key: string) =>
    state.values?.[key] ?? (draft ? String(draft[key as keyof LegacyDraftValues]) : "");
  return (
    <form action={formAction}>
      {state.status === "error" ? <p role="alert">{state.message}</p> : null}
      {draft ? (
        <>
          <input type="hidden" name="action" value="edit" />
          <input type="hidden" name="lesson_id" value={draft.id} />
        </>
      ) : null}
      {FIELDS.map(([key, label, max]) => (
        <p key={key}>
          <label>
            {label}
            <textarea name={key} required maxLength={max} defaultValue={value(key)} />
          </label>
        </p>
      ))}
      <label>
        Đáp án đúng{" "}
        <select name="answer" defaultValue={value("answer") === "two" ? "two" : "one"}>
          <option value="one">Lựa chọn thứ nhất</option>
          <option value="two">Lựa chọn thứ hai</option>
        </select>
      </label>
      <p>
        <button className="button" disabled={pending}>
          Lưu bản nháp
        </button>
      </p>
    </form>
  );
}

export function LegacyPublishForm({ lessonId }: { lessonId: number }) {
  const [state, formAction, pending] = useActionState(saveLegacyLessonAction, idleState);
  return (
    <form action={formAction}>
      {state.status === "error" ? <p role="alert">{state.message}</p> : null}
      <input type="hidden" name="action" value="publish" />
      <input type="hidden" name="lesson_id" value={lessonId} />
      <button className="button" disabled={pending}>
        Xuất bản
      </button>
    </form>
  );
}
