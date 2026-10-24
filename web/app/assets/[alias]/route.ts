// The three old asset URLs from before assets moved into folders (PHP router.php / .htaccess):
// a permanent redirect to the new location. Real files under /assets/* come from public/.

const ALIASES: Record<string, string> = {
  "style.css": "/assets/css/style.css",
  "app.js": "/assets/js/app.js",
  "courses.json": "/assets/json/courses.json",
};

export async function GET(_request: Request, { params }: RouteContext<"/assets/[alias]">) {
  const target = ALIASES[(await params).alias];
  if (!target) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 301, headers: { Location: target } });
}
