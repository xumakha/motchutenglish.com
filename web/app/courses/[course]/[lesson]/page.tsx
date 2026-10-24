import type { Metadata } from "next";
import { SiteShell } from "@/components/site/site-shell";

// Placeholder: replaced by the Phase 5 port of this screen.
export const metadata: Metadata = { title: "Đang chuyển", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <SiteShell page="courses">
      <p>Trang này đang được chuyển sang phiên bản mới.</p>
    </SiteShell>
  );
}
