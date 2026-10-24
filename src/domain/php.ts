import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "@/server/errors";

// Small PHP-compatibility helpers. The PHP app's validation messages and edge cases are the spec,
// so these mirror PHP semantics where they differ from JavaScript's.

/** PHP trim(): strips only " \t\n\r\0\x0B", unlike String.prototype.trim. */
export const phpTrim = (s: string) => s.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "");

/** mb_strlen: length in code points. */
export const mbLen = (s: string) => [...s].length;

/** PHP empty(): "", "0", 0, false, null, undefined and [] are empty. */
export const phpEmpty = (v: unknown) =>
  v === undefined ||
  v === null ||
  v === false ||
  v === 0 ||
  v === "" ||
  v === "0" ||
  (Array.isArray(v) && v.length === 0);

/**
 * True for keys PHP turns into integers ("0", "12", "-3"). Such keys fail PHP's string id checks,
 * and JavaScript would reorder them ahead of other object keys, so they are rejected as ids.
 */
export const isIntegerKey = (k: string) =>
  /^(0|-?[1-9][0-9]*)$/.test(k) && Number.isSafeInteger(Number(k));

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** PHP is_array(): objects and lists. */
export const isArrayLike = (v: unknown): v is Record<string, unknown> | unknown[] =>
  typeof v === "object" && v !== null;

/** PHP is_int on decoded JSON. */
export const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** mce_text: string, at most `max` code points, not blank when required; returns PHP-trimmed. */
export function text(value: unknown, max = 5000, required = true): string {
  if (typeof value !== "string" || mbLen(value) > max || (required && phpTrim(value) === ""))
    throw new AppError(422, "Nội dung trống hoặc quá dài.");
  return phpTrim(value);
}

/** mce_field: attach the field name to an error that has no field errors yet. */
export function field<T>(name: string, read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof AppError && Object.keys(error.fieldErrors).length === 0)
      throw new AppError(error.status, error.message, { [name]: error.message });
    throw error;
  }
}

/** Async variant of field(). */
export async function fieldAsync<T>(name: string, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof AppError && Object.keys(error.fieldErrors).length === 0)
      throw new AppError(error.status, error.message, { [name]: error.message });
    throw error;
  }
}

/** mce_key: 32 lowercase hex chars. */
export function hexKey(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{32}$/.test(value))
    throw new AppError(422, "Mã yêu cầu không hợp lệ.");
  return value;
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomHex = (bytes: number) => randomBytes(bytes).toString("hex");

/** hash_equals for hex strings. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** PHP shuffle(): uniform Fisher-Yates with a CSPRNG. */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomBytes(4).readUInt32BE() % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** JSON like mce_json: Unicode stays unescaped (JSON.stringify never escapes it). */
export const json = (value: unknown) => JSON.stringify(value);

/**
 * mce_equal_response: compare two responses ignoring object key order (lists keep order).
 */
export function canonicalJson(value: unknown): string {
  const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical);
    if (isObject(v))
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, canonical(v[k])]),
      );
    return v;
  };
  return JSON.stringify(canonical(value));
}
