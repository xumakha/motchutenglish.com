import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import type { FieldErrors } from "@/contracts/envelope";
import { AppError, GENERIC_ERROR } from "./errors";
import type { FormState } from "./form-state";
import { requestId } from "./request";
import { logError } from "@/server/log";

export type { FormState } from "./form-state";

const SECRET_FIELD = /password|token|csrf|current|secret/i;

export function safeValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) {
    if (typeof value === "string" && !SECRET_FIELD.test(key) && !key.startsWith("$ACTION"))
      values[key] = value;
  }
  return values;
}

/** First zod message per field, keyed by the top-level field name. */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    fields[field] ??= issue.message;
  }
  return fields;
}

export const formObject = (formData: FormData) =>
  Object.fromEntries([...formData].filter(([k]) => !k.startsWith("$ACTION")));

/**
 * Wrap a form handler: parse FormData with the schema, run the handler, and turn failures into a
 * FormState. redirect()/notFound() from the handler pass through untouched.
 */
export function formAction<S extends z.ZodType>(
  schema: S,
  handler: (input: z.output<S>, formData: FormData) => Promise<FormState | void>,
) {
  return async (_prev: FormState, formData: FormData): Promise<FormState> => {
    const values = safeValues(formData);
    const parsed = schema.safeParse(formObject(formData));
    if (!parsed.success) {
      const fieldErrors = zodFieldErrors(parsed.error);
      return {
        status: "error",
        message: Object.values(fieldErrors)[0] ?? "Dữ liệu chưa hợp lệ.",
        fieldErrors,
        values,
      };
    }
    try {
      return (await handler(parsed.data, formData)) ?? { status: "success" };
    } catch (error) {
      unstable_rethrow(error);
      if (error instanceof AppError)
        return { status: "error", message: error.message, fieldErrors: error.fieldErrors, values };
      const id = await requestId();
      logError(`Action failed ${id}`, error);
      return { status: "error", message: GENERIC_ERROR, values, requestId: id };
    }
  };
}
