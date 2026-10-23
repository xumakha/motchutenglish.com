import "server-only";
import { AppError } from "@/server/errors";
import { db, type Tx } from "./client";

// Port of mce_transaction (application/libraries/ProductSupport.php:24-38): READ COMMITTED,
// up to 3 attempts on lock wait timeout / deadlock, then MySQL errors mapped to user-facing codes.

const LOCK_WAIT_TIMEOUT = 1205;
const DEADLOCK = 1213;
const DUPLICATE_KEY = 1062;
const ROW_IS_REFERENCED = 1451;
const NO_REFERENCED_ROW = 1452;

const MAX_ATTEMPTS = 3;

function mysqlErrno(error: unknown): number | undefined {
  let current: unknown = error;
  // Drizzle wraps driver errors; walk the cause chain to the mysql2 error.
  for (let depth = 0; current && depth < 5; depth++) {
    const errno = (current as { errno?: unknown }).errno;
    if (typeof errno === "number") return errno;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db().transaction(fn, { isolationLevel: "read committed" });
    } catch (error) {
      const errno = mysqlErrno(error);
      const retryable = errno === LOCK_WAIT_TIMEOUT || errno === DEADLOCK;
      if (retryable && attempt < MAX_ATTEMPTS) {
        await sleep(10 + Math.random() * 40);
        continue;
      }
      throw mapDbError(error);
    }
  }
}

export function mapDbError(error: unknown): unknown {
  if (error instanceof AppError) return error;
  const errno = mysqlErrno(error);
  if (errno === DUPLICATE_KEY || errno === LOCK_WAIT_TIMEOUT || errno === DEADLOCK)
    return new AppError(
      409,
      "Dữ liệu đã tồn tại hoặc vừa được cập nhật. Vui lòng tải lại và kiểm tra trước khi thử lại.",
    );
  if (errno === ROW_IS_REFERENCED || errno === NO_REFERENCED_ROW)
    return new AppError(422, "Nội dung liên kết không còn hợp lệ. Vui lòng kiểm tra lại lựa chọn.");
  return error;
}

/** affectedRows of an INSERT IGNORE / UPDATE result: 0 means the row already existed. */
export function affectedRows(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return (header as { affectedRows?: number } | undefined)?.affectedRows ?? 0;
}
