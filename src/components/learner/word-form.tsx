"use client";

import { saveVocabulary } from "@/actions/routes";
import { FieldError, invalid, useLearnerAction } from "./flash";

/** The "vocabulary/save" form on a notebook word card. */
export function WordForm({
  senseId,
  notes,
  review,
  label,
}: {
  senseId: number;
  notes: string;
  review: boolean;
  label: string;
}) {
  const [state, action, pending] = useLearnerAction(saveVocabulary);
  const retyped = state.status === "error" ? state.values : undefined;
  return (
    <form action={action} className="auth-form" key={JSON.stringify([notes, review, state])}>
      <input type="hidden" name="senseId" value={senseId} />
      <label>
        Ghi chú riêng
        <textarea
          name="notes"
          maxLength={2000}
          defaultValue={retyped?.notes ?? notes}
          {...invalid(state, "notes")}
        />
      </label>
      <FieldError state={state} name="notes" />
      <label>
        <input
          type="checkbox"
          name="review"
          value="1"
          defaultChecked={retyped ? retyped.review === "1" : review}
        />{" "}
        Thêm vào lịch ôn
      </label>
      <button className="button" disabled={pending}>
        {label}
      </button>
    </form>
  );
}
