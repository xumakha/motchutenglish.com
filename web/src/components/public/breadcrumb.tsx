import { breadcrumbJsonLd } from "@/site/seo";

// The BreadcrumbList JSON-LD that layouts/header.php adds for lo-trinh, bai-hoc, tu-vung,
// kien-thuc and gioi-thieu. `title` is the PHP page title (not the SEO override).

const escapeJson = (json: string) =>
  json.replace(/[<>&']/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

export function Breadcrumb({ path, title }: { path: string; title: string }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: escapeJson(JSON.stringify(breadcrumbJsonLd(path, title))),
      }}
    />
  );
}
