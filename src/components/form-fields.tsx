"use client";

import { useEffect, useRef, type InputHTMLAttributes } from "react";
import type { FormState } from "@/server/form-state";

/** Error summary that takes focus when a submit fails (role=alert, like the PHP #form-error). */
export function FormErrorSummary({ state }: { state: FormState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === "error") ref.current?.focus();
  }, [state]);
  if (state.status !== "error") return null;
  return (
    <div ref={ref} className="feedback retry" role="alert" id="form-error" tabIndex={-1}>
      <p>{state.message}</p>
      {state.requestId ? <p className="muted small">Mã yêu cầu: {state.requestId}</p> : null}
    </div>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  name: string;
  label: string;
  hint?: string;
  state: FormState;
}

/** Labelled input wired to the field error: aria-invalid + aria-describedby. */
export function Field({ name, label, hint, state, id = name, ...input }: FieldProps) {
  const error = state.fieldErrors?.[name];
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        defaultValue={input.type === "password" ? undefined : state.values?.[name]}
        {...input}
      />
      {hint ? (
        <span id={hintId} className="muted small">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className="field-error">
          {error}
        </span>
      ) : null}
    </>
  );
}
