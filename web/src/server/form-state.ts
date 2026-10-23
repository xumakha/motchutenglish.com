import type { FieldErrors } from "@/contracts/envelope";

/**
 * State returned to `useActionState` forms. `values` echoes what the user typed so the form keeps
 * it after an error; anything that looks secret is dropped (port of mce_form_error_state).
 * Shared by Server Actions and client forms, so it must not import server-only code.
 */
export interface FormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: FieldErrors;
  values?: Record<string, string>;
  requestId?: string;
}

export const idleState: FormState = { status: "idle" };
