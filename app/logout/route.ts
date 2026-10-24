import { auth } from "@/auth/auth";

// Logout is POST-only (port of the PHP /logout handler). Forms post here directly, so it works
// without JavaScript; proxy.ts rejects cross-origin POSTs before they reach this handler.

export async function GET() {
  return new Response("Vui lòng dùng nút Đăng xuất.", {
    status: 405,
    headers: { Allow: "POST", "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  const signedOut = await auth().api.signOut({ headers: request.headers, asResponse: true });
  const response = new Response(null, { status: 303, headers: { Location: "/login" } });
  for (const cookie of signedOut.headers.getSetCookie())
    response.headers.append("Set-Cookie", cookie);
  return response;
}
