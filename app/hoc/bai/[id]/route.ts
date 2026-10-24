import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/auth/session";
import { startLegacy } from "@/domain/legacy/lessons";
import { currentActor } from "@/server/actor";
import { AppError } from "@/server/errors";
import { requestId } from "@/server/request";
import { logError } from "@/server/log";

// Port of Learning::start: POST /hoc/bai/{id} with request_key starts (or resumes) an immutable
// snapshot of a published legacy lesson and 303s to /ket-qua/{key}. A plain HTML form posts here
// (no JavaScript needed). GET and failures show the PHP error view (rendered by ./loi) with
// PHP's status code; a missing lesson is a 404.

const PATTERN = /^[0-9]+$/;

/**
 * 303 with a relative Location. request.url carries the server's own host (localhost), which
 * the browser treats as another origin and CSP form-action 'self' would block.
 */
const seeOther = (path: string) =>
  new NextResponse(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });

async function errorPage(request: NextRequest, id: string, status: number) {
  const path = status === 404 ? "/khong-tim-thay" : `/hoc/bai/${id}/loi`;
  const host = request.headers.get("host");
  try {
    if (!host) throw new Error("no host");
    // The error view is a normal page (site shell and all); serve its HTML with our status.
    const page = await fetch(new URL(path, `${request.nextUrl.protocol}//${host}`), {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
      redirect: "manual",
    });
    return new NextResponse(await page.text(), {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    return new NextResponse("Không thể bắt đầu bài học. Hãy quay lại và thử lại.", {
      status,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}

export async function GET(request: NextRequest, ctx: RouteContext<"/hoc/bai/[id]">) {
  const { id } = await ctx.params;
  if (!PATTERN.test(id)) return errorPage(request, id, 404);
  if (!(await currentUser())) return seeOther("/login");
  return errorPage(request, id, 405);
}

export async function POST(request: NextRequest, ctx: RouteContext<"/hoc/bai/[id]">) {
  const { id } = await ctx.params;
  if (!PATTERN.test(id)) return errorPage(request, id, 404);
  if (!(await currentUser())) return seeOther("/login");
  try {
    const form = await request.formData();
    const attemptId = await startLegacy(await currentActor(), Number(id), form.get("request_key"));
    return seeOther(`/ket-qua/${attemptId}`);
  } catch (error) {
    if (error instanceof AppError) return errorPage(request, id, error.status);
    logError(`Start legacy lesson failed ${await requestId()}`, error);
    return errorPage(request, id, 503);
  }
}
