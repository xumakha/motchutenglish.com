import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site/site-shell";

// views/learning/error.php as Learning::start renders it. Served by ../route.ts with the real
// status code (405 for GET, 409/422/503 for failed starts).

export const metadata: Metadata = {
  title: "Chưa thể mở bài",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <SiteShell page="hoc">
      <p role="alert">Không thể bắt đầu bài học. Hãy quay lại và thử lại.</p>
      <Link className="button" href="/hoc">
        Về trang học
      </Link>
    </SiteShell>
  );
}
