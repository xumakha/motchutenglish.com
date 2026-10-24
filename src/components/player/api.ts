import type { PublicAttempt } from "@/domain/study/attempts";

// JSON calls to /api/v1 from the player (same envelope as the PHP app).

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: Record<string, string> = {},
    readonly current: PublicAttempt | null = null,
  ) {
    super(message);
  }
}

export async function api<T>(route: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/${route}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Đang mất mạng. Bản nháp giữ trên thiết bị; máy chủ chưa xác nhận lưu.", 0);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      result.error?.message || "Chưa thể lưu dữ liệu.",
      response.status,
      result.error?.fieldErrors ?? {},
      result.error?.currentAttempt ?? null,
    );
  return result.data as T;
}
