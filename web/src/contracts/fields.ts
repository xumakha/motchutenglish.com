import { z } from "zod";

// Shared field rules ported from ProductSupport.php helpers.

/** mce_key: 32 lowercase hex chars (attempt ids, request keys, import ids). */
export const hexKey = z.string().regex(/^[a-f0-9]{32}$/, "Mã yêu cầu không hợp lệ.");

/** mce_text: trimmed, length counted in code points like mb_strlen. */
export const text = (max: number, { required = true } = {}) =>
  z
    .string()
    .transform((s) => s.trim())
    .refine((s) => !required || s.length > 0, "Không được để trống.")
    .refine((s) => [...s].length <= max, `Tối đa ${max} ký tự.`);

export const positiveId = z.coerce.number().int().positive();

/** Form checkboxes arrive as "1"/"on"/"yes"; JSON sends booleans. PHP used !empty(). */
export const flag = z
  .union([z.boolean(), z.string(), z.number()])
  .optional()
  .transform((v) => (typeof v === "string" ? v !== "" && v !== "0" : Boolean(v)));

export const confirmYes = z.literal("yes", { error: "Hãy xác nhận thao tác." });

export const email = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.email("Email không hợp lệ.").max(254));

/** Passwords: 8+ characters, at most 72 bytes (bcrypt limit kept for policy parity). */
export const newPassword = z
  .string()
  .refine((s) => [...s].length >= 8, "Mật khẩu cần ít nhất 8 ký tự.")
  .refine((s) => new TextEncoder().encode(s).length <= 72, "Mật khẩu tối đa 72 byte.");
