import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Pure request rules used by proxy.ts, kept separate so they can be unit-tested.

export const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_MESSAGE = "Phiên hết hạn. Vui lòng tải lại trang.";

export function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = request.headers.get("sec-fetch-site");
  return site === "same-origin" || site === "none";
}

export function rejectCrossOrigin(request: NextRequest, requestId: string): NextResponse {
  const headers = { "X-Request-ID": requestId, "Cache-Control": "no-store, private" };
  if (request.nextUrl.pathname.startsWith("/api/"))
    return NextResponse.json(
      {
        error: {
          code: "HTTP_403",
          message: CSRF_MESSAGE,
          fieldErrors: {},
          requestId,
          currentAttempt: null,
        },
      },
      { status: 403, headers },
    );
  return new NextResponse(CSRF_MESSAGE, { status: 403, headers });
}

export function legacyRedirect(request: NextRequest): NextResponse | null {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname !== "/" && pathname !== "/index.php") return null;
  const page = searchParams.get("page");
  if (pathname === "/" && page === null) return null;
  const target = request.nextUrl.clone();
  target.pathname = page ? `/${page.replace(/^\/+/, "")}` : "/";
  target.searchParams.delete("page");
  return NextResponse.redirect(target, 301);
}

// Pages that need an account. /hoc/luot/{id} is excluded: guests can play preview lessons.
const PRIVATE_PAGE =
  /^\/(account|hoc|bat-dau|on-tap|so-tu-vung|tien-do|tai-khoan|reward-shop|admin)(\/|$)/;

export function loginRedirect(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (request.method !== "GET" || !PRIVATE_PAGE.test(pathname) || pathname.startsWith("/hoc/luot/"))
    return null;
  if (getSessionCookie(request, { cookiePrefix: "mce" })) return null;
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
