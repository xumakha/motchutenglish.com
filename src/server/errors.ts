import type { FieldErrors } from "@/contracts/envelope";

/**
 * An error whose message is safe to show the learner (ProductError in the PHP app). Anything else
 * becomes a generic 503 with only the request id exposed.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors: FieldErrors = {},
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const GENERIC_ERROR = "Dịch vụ tạm thời gián đoạn. Vui lòng thử lại.";

export const notFound = (message = "Không tìm thấy nội dung.") => new AppError(404, message);
export const conflict = (message: string) => new AppError(409, message);
export const invalid = (message: string, fieldErrors: FieldErrors = {}) =>
  new AppError(422, message, fieldErrors);
export const forbidden = (message = "Bạn không có quyền thực hiện thao tác này.") =>
  new AppError(403, message);
export const unauthorized = (message = "Bạn cần đăng nhập để tiếp tục.") =>
  new AppError(401, message);
