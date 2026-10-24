import { NextResponse, type NextRequest } from "next/server";
import {
  isSameOrigin,
  legacyRedirect,
  loginRedirect,
  newRequestId,
  rejectCrossOrigin,
  UNSAFE_METHODS,
} from "@/server/proxy-rules";
import { contentExists } from "@/server/content-exists";
import { redirectFor } from "@/server/redirects";

// Runs before every page, action and route handler:
// - request id (16 hex chars, PHP format) on the request and the response;
// - legacy ?page=x and /index.php URLs and slug-change redirects → 301 (port of core/Router.php);
// - missing public content (unknown slugs) → real 404 status;
// - optimistic sign-in check: private pages without a session cookie get a real 303 to /login
//   (the page still verifies the session itself);
// - same-origin check for state-changing requests. Next.js lets Server Actions without an Origin
//   header through with a warning; we reject them unless the browser marks them same-origin.

async function slugRedirect(request: NextRequest): Promise<NextResponse | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const target = await redirectFor(request.nextUrl.pathname);
  if (!target) return null;
  const url = request.nextUrl.clone();
  url.pathname = target;
  return NextResponse.redirect(url, 301);
}

export async function proxy(request: NextRequest) {
  const requestId = newRequestId();

  if (UNSAFE_METHODS.has(request.method) && !isSameOrigin(request))
    return rejectCrossOrigin(request, requestId);

  const redirect =
    legacyRedirect(request) ?? (await slugRedirect(request)) ?? loginRedirect(request);
  if (redirect) {
    redirect.headers.set("X-Request-ID", requestId);
    return redirect;
  }

  // Missing public content gets a real 404 before streaming starts (no route matches this path).
  if (
    (request.method === "GET" || request.method === "HEAD") &&
    !(await contentExists(request.nextUrl.pathname))
  ) {
    const response = NextResponse.rewrite(new URL("/_khong-tim-thay", request.url), {
      status: 404,
    });
    response.headers.set("X-Request-ID", requestId);
    return response;
  }

  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("X-Request-ID", requestId);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|assets/|favicon|android-chrome|apple-touch-icon|site.webmanifest|health).*)",
  ],
};
