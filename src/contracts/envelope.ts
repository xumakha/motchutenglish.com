import { z } from "zod";

// Response envelope of /api/v1/*, unchanged from Product::api (application/controllers/Product.php:16-40).

export const requestIdSchema = z.string().regex(/^[a-f0-9]{16}$/);

export const fieldErrorsSchema = z.record(z.string(), z.string());

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().regex(/^HTTP_\d{3}$/),
    message: z.string(),
    fieldErrors: fieldErrorsSchema,
    requestId: requestIdSchema,
    // Only on 409 responses of attempts/{id}/* routes: the current public attempt.
    currentAttempt: z.unknown().nullable(),
  }),
});

export const apiSuccessSchema = <T extends z.ZodType>(data: T) =>
  z.object({ data, requestId: requestIdSchema });

export type FieldErrors = z.infer<typeof fieldErrorsSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;

// Common result shapes returned by execute().
export const savedResult = z.object({ saved: z.literal(true) });
export const messageResult = z.object({ message: z.string() });
export const redirectResult = z.object({ redirect: z.string().startsWith("/") });

// Input limits from Product::input.
export const MAX_JSON_BODY_BYTES = 1_050_000;
export const MAX_JSON_DEPTH = 64;
// Only these keys may carry arrays or objects; every other field must be a scalar.
export const ARRAY_FIELDS = ["document", "response", "ids"] as const;
