"use client";

import { useActionState, type ReactNode } from "react";
import { idleState, type FormState } from "@/server/form-state";
import { FormErrorSummary } from "./form-fields";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/** Success/error line after a form action (PHP's flash message and error box). */
export function ActionStatus({ state }: { state: FormState }) {
  if (state.status === "success" && state.message)
    return (
      <p className="feedback success" role="status">
        {state.message}
      </p>
    );
  return <FormErrorSummary state={state} />;
}

/**
 * Port of product_form(): a small form that posts one route with hidden fields and a single button.
 * Pass `children` for visible fields; they are rendered before the button.
 */
export function RouteForm({
  action,
  fields = {},
  label,
  buttonClass = "button",
  className = "inline-form",
  children,
}: {
  action: Action;
  fields?: Record<string, string | number>;
  label: string;
  buttonClass?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, idleState);
  return (
    <form action={formAction} className={className}>
      <ActionStatus state={state} />
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <button className={buttonClass} type="submit" disabled={pending}>
        {label}
      </button>
    </form>
  );
}
