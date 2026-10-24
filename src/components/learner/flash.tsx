"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useActionState,
  type ReactNode,
} from "react";
import { idleState, type FormState } from "@/server/form-state";

// The learner pages show the result of a form where views/product/page.php printed it: right
// under the product nav, a success line or the #form-error box with a "Tải lại trang" link.
// LearnerForm reports its result here instead of rendering it inside the form, so a form whose
// item disappears after saving (removing a word, hiding a card) still shows its message.

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type Report = (state: FormState) => void;

const FlashContext = createContext<Report | null>(null);

export function FlashProvider({ reload, children }: { reload: Route; children: ReactNode }) {
  const [flash, setFlash] = useState<FormState>(idleState);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (flash.status === "error") errorRef.current?.focus();
  }, [flash]);
  return (
    <FlashContext.Provider value={setFlash}>
      {flash.status === "error" ? (
        <>
          <div ref={errorRef} className="feedback retry" role="alert" id="form-error" tabIndex={-1}>
            {flash.message}
            {flash.requestId ? ` Mã yêu cầu: ${flash.requestId}` : null}
          </div>
          <p>
            <Link href={reload}>Tải lại trang</Link>
          </p>
        </>
      ) : null}
      {flash.status === "success" && flash.message ? (
        <p className="feedback success" role="status">
          {flash.message}
        </p>
      ) : null}
      {children}
    </FlashContext.Provider>
  );
}

/** useActionState whose result also goes to the page flash. */
export function useLearnerAction(action: Action) {
  const report = useContext(FlashContext);
  return useActionState(async (prev: FormState, formData: FormData) => {
    const result = await action(prev, formData);
    report?.(result);
    return result;
  }, idleState);
}

/** product_form(): hidden fields and one button; the result shows in the page flash. */
export function LearnerForm({
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
  const [, formAction, pending] = useLearnerAction(action);
  return (
    <form action={formAction} className={className}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <button className={buttonClass} disabled={pending}>
        {label}
      </button>
    </form>
  );
}

/** The field error product.js placed after the label of an invalid control. */
export function FieldError({ state, name }: { state: FormState; name: string }) {
  const error = state.status === "error" ? state.fieldErrors?.[name] : undefined;
  return error ? (
    <p className="field-error" id={`field-error-${name}`}>
      {error}
    </p>
  ) : null;
}

/** aria props for a control named `name` (product.js markFields). */
export function invalid(state: FormState, name: string) {
  const error = state.status === "error" ? state.fieldErrors?.[name] : undefined;
  return error ? { "aria-invalid": true as const, "aria-describedby": `field-error-${name}` } : {};
}

/** The value the learner typed before a failed submit (PHP restored it from form-error-state). */
export function typed(state: FormState, name: string): string | undefined {
  return state.status === "error" ? state.values?.[name] : undefined;
}
