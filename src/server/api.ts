import "server-only";
import { revalidateTag } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/auth/auth";
import { ARRAY_FIELDS, MAX_JSON_BODY_BYTES, MAX_JSON_DEPTH } from "@/contracts/envelope";
import { routes, type RouteName } from "@/contracts/routes";
import { publicAttempt, readAttempt } from "@/domain/study/attempts";
import type { Upload } from "@/domain/media/media";
import { currentActor, saveMarketing } from "./actor";
import { AppError, GENERIC_ERROR } from "./errors";
import type { HandlerEffects } from "./handlers";
import { requestId } from "./request";
import { runRoute } from "./run-route";
import { logError } from "@/server/log";

// /api/v1/* (port of Product::api). Same paths, JSON envelope and error codes as the PHP app.
// Every contract route is reachable here; HTML forms use the same handlers via Server Actions.

const HEADERS = { "Cache-Control": "no-store, private" };
const HEX = "([a-f0-9]{32})";

interface Match {
  name: RouteName;
  id?: string;
}

// Contract paths use only [a-z0-9/_-] plus the {id} placeholder, so no other escaping is needed.
const table = (Object.entries(routes) as [RouteName, (typeof routes)[RouteName]][]).map(
  ([name, r]) => ({
    name,
    method: r.method,
    pattern: new RegExp(`^${r.path.replace("{id}", HEX)}$`),
  }),
);

export function matchRoute(method: "GET" | "POST", path: string): Match | null {
  for (const r of table) {
    if (r.method !== method) continue;
    const m = r.pattern.exec(path);
    if (m) return { name: r.name, id: m[1] };
  }
  return null;
}

function depth(value: unknown, level = 0): number {
  if (typeof value !== "object" || value === null) return level;
  let max = level + 1;
  for (const v of Object.values(value)) max = Math.max(max, depth(v, level + 1));
  return max;
}

/** Product::input: a JSON object of scalars, except the fields allowed to hold arrays/objects. */
export function checkJsonBody(text: string): Record<string, unknown> {
  if (Buffer.byteLength(text) > MAX_JSON_BODY_BYTES) throw new AppError(413, "Yêu cầu quá lớn.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AppError(422, "JSON không hợp lệ.");
  }
  if (depth(data) > MAX_JSON_DEPTH) throw new AppError(422, "JSON không hợp lệ.");
  if (typeof data !== "object" || data === null || (Array.isArray(data) && data.length > 0))
    throw new AppError(422, "Yêu cầu phải là JSON object.");
  const body = Array.isArray(data) ? {} : (data as Record<string, unknown>);
  for (const [key, value] of Object.entries(body))
    if (
      typeof value === "object" &&
      value !== null &&
      !ARRAY_FIELDS.includes(key as (typeof ARRAY_FIELDS)[number])
    )
      throw new AppError(422, `Trường ${key} không được là mảng.`, { [key]: "Cần giá trị đơn." });
  return body;
}

async function readBody(
  request: Request,
): Promise<{ body: Record<string, unknown>; file?: Upload }> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return { body: checkJsonBody(await request.text()) };
  if (type.includes("multipart/form-data") || type.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    const body: Record<string, unknown> = {};
    let file: Upload | undefined;
    for (const [key, value] of form) {
      if (typeof value === "string") body[key] = value;
      else if (key === "file")
        file = { name: value.name, bytes: new Uint8Array(await value.arrayBuffer()) };
    }
    return { body, file };
  }
  return { body: {} };
}

const json = (body: unknown, status: number, id: string) =>
  Response.json(body, { status, headers: { ...HEADERS, "X-Request-ID": id } });

export async function applyApiEffects(effects: HandlerEffects | undefined) {
  if (!effects) return;
  if (effects.marketing) await saveMarketing(effects.marketing);
  // Route handlers cannot call updateTag. Expire at once so the next read sees the change, as
  // Server Actions do (and as the PHP API did); "max" would serve the old catalog once more.
  if (effects.catalog) revalidateTag("catalog", { expire: 0 });
  if (effects.signOut)
    await auth()
      .api.signOut({ headers: await headers() })
      .catch(() => undefined);
}

export async function handleApi(request: Request, segments: string[]): Promise<Response> {
  const id = await requestId();
  const path = segments.join("/");
  const method = request.method;
  try {
    if (method !== "GET" && !["POST", "PUT", "PATCH", "DELETE"].includes(method))
      throw new AppError(405, "Phương thức không hợp lệ.");
    const match = matchRoute(method === "GET" ? "GET" : "POST", path);
    if (!match) throw new AppError(404, "Không tìm thấy chức năng.");
    const { body, file } =
      method === "GET" ? { body: {}, file: undefined } : await readBody(request);
    const actor = await currentActor({ createGuest: match.name === "attempts.start" });
    const result = await runRoute(match.name, body, {
      actor,
      id: match.id,
      file,
      query: new URL(request.url).searchParams,
    });
    await applyApiEffects(result.effects);
    return json({ data: result.data, requestId: id }, 200, id);
  } catch (error) {
    const status = error instanceof AppError ? error.status : 503;
    if (!(error instanceof AppError)) logError(`Product request ${id}`, error);
    let currentAttempt: unknown = null;
    const attempt = /^attempts\/([a-f0-9]{32})\//.exec(path);
    if (status === 409 && attempt)
      currentAttempt = await currentActor()
        .then((actor) => readAttempt(actor, attempt[1]))
        .then(publicAttempt)
        .catch(() => null);
    return json(
      {
        error: {
          code: `HTTP_${status}`,
          message: error instanceof AppError ? error.message : GENERIC_ERROR,
          fieldErrors: error instanceof AppError ? error.fieldErrors : {},
          requestId: id,
          currentAttempt,
        },
      },
      status,
      id,
    );
  }
}
