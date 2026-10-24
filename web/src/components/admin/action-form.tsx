"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { ActionStatus } from "@/components/route-form";
import type { FieldErrors } from "@/contracts/envelope";
import { idleState, type FormState } from "@/server/form-state";

// A CMS form whose fields are server-rendered children (admin.php writes them inline). It posts
// a contract-route Server Action, shows the flash/error line, keeps what the editor typed (no
// automatic reset) and marks field errors next to their controls like product.js markFields().

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

let sequence = 0;

function markFields(scope: HTMLFormElement, fields: FieldErrors = {}) {
  scope.querySelectorAll("[data-field-error]").forEach((node) => {
    scope.querySelectorAll("[aria-describedby]").forEach((control) => {
      const ids = control
        .getAttribute("aria-describedby")!
        .split(/\s+/)
        .filter((id) => id !== node.id);
      if (ids.length) control.setAttribute("aria-describedby", ids.join(" "));
      else control.removeAttribute("aria-describedby");
    });
    node.remove();
  });
  scope
    .querySelectorAll('[aria-invalid="true"]')
    .forEach((control) => control.removeAttribute("aria-invalid"));
  for (const [name, message] of Object.entries(fields)) {
    const controls = [
      ...scope.querySelectorAll<HTMLInputElement>(
        "input:not([type=hidden]),select,textarea,fieldset",
      ),
    ].filter((c) => c.name === name || c.dataset.field === name);
    const last = controls.at(-1);
    if (!last) continue;
    const error = document.createElement("p");
    error.id = `field-error-${++sequence}`;
    error.dataset.fieldError = "";
    error.className = "field-error";
    error.textContent = String(message);
    const label = last.closest("label");
    if (label) label.after(error);
    else last.after(error);
    for (const c of controls) {
      c.setAttribute("aria-invalid", "true");
      const ids = new Set((c.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
      ids.add(error.id);
      c.setAttribute("aria-describedby", [...ids].join(" "));
    }
    for (let node = last.parentElement; node; node = node.parentElement)
      if (node instanceof HTMLDetailsElement) node.open = true;
  }
}

/** The state and <form> props behind <ActionForm>, for forms that also show the result elsewhere. */
export function useActionForm(action: Action, resetOnSuccess = false) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    markFields(ref.current, state.status === "error" ? state.fieldErrors : {});
    if (state.status === "success" && resetOnSuccess) ref.current.reset();
  }, [state, resetOnSuccess]);

  const props = {
    ref,
    method: "post",
    "aria-busy": pending || undefined,
    onSubmit: (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      // <input data-split=","> sends "1,2,3" as a list (name[] entries).
      e.currentTarget.querySelectorAll<HTMLInputElement>("[data-split]").forEach((input) => {
        data.delete(input.name);
        for (const part of input.value.split(input.dataset.split!))
          if (part.trim()) data.append(`${input.name}[]`, part.trim());
      });
      startTransition(() => formAction(data));
    },
  };
  return { state, props };
}

export function ActionForm({
  action,
  className,
  children,
  resetOnSuccess = false,
}: {
  action: Action;
  className?: string;
  children: ReactNode;
  /** Clear the fields after a successful save (forms that create a new record). */
  resetOnSuccess?: boolean;
}) {
  const { state, props } = useActionForm(action, resetOnSuccess);
  return (
    <form {...props} className={className}>
      <ActionStatus state={state} />
      {children}
    </form>
  );
}
