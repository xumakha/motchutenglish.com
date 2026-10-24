// Target of proxy.ts rewrites for staff-only pages. Next.js ignores the status a proxy rewrite
// sets when the target is a rendered page, so this is a route handler that answers 403 itself
// with a minimal page (the full-design forbidden view still shows if a page calls forbidden()).

const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Không có quyền | Một Chút English</title>
<link rel="stylesheet" href="/theme.css">
<style>
body{margin:0;background:#fffcf5;font-family:"Be Vietnam Pro",Arial,sans-serif;color:#1f2937}
main{max-width:560px;margin:15vh auto 0;padding:0 16px}
a{display:inline-block;padding:12px 20px;border-radius:8px;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:700}
</style>
</head>
<body>
<main>
<h1>Không có quyền</h1>
<p>Bạn không có quyền thực hiện thao tác này.</p>
<p><a href="/">Về trang chủ</a></p>
</main>
</body>
</html>`;

function forbidden(): Response {
  return new Response(html, {
    status: 403,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

export const GET = forbidden;
export const HEAD = forbidden;
