import "server-only";
import { routes, type RouteName } from "@/contracts/routes";
import { AppError } from "./errors";
import { handlers, type HandlerContext, type HandlerResult } from "./handlers";
import { limit } from "./rate-limit";
import { clientIp } from "./request";
import { zodFieldErrors } from "./action";

// The common path for every route, whichever transport carries it (port of the checks
// Product::api/execute did around each command): auth level → rate limit → input → handler.

export async function runRoute(
  name: RouteName,
  raw: unknown,
  ctx: HandlerContext,
): Promise<HandlerResult> {
  const contract = routes[name];
  const { actor } = ctx;
  if (contract.auth === "user" && actor.userId === null)
    throw new AppError(401, "Bạn cần đăng nhập để thực hiện thao tác này.");
  if (contract.auth === "staff" || contract.auth === "admin") {
    // Like mce_staff(): guests get 403 too, not 401.
    const allowed =
      actor.role === "admin" || (contract.auth === "staff" && actor.role === "editor");
    if (!allowed) throw new AppError(403, "Bạn không có quyền thực hiện thao tác này.");
  }

  if ("rateLimit" in contract && contract.rateLimit) {
    const { scope, max, windowSeconds } = contract.rateLimit;
    await limit(scope, `${await clientIp()}:${actor.userId ?? "guest"}`, { max, windowSeconds });
  }

  const parsed = contract.input.safeParse(raw ?? {});
  if (!parsed.success) {
    const fieldErrors = zodFieldErrors(parsed.error);
    throw new AppError(422, Object.values(fieldErrors)[0] ?? "Dữ liệu chưa hợp lệ.", fieldErrors);
  }
  const handler = handlers[name] as (input: unknown, ctx: HandlerContext) => Promise<HandlerResult>;
  return handler(parsed.data, ctx);
}
