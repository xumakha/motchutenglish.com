import type { Metadata } from "next";
import { LegacyScripts } from "@/components/legacy/markup";
import { Placement } from "@/components/legacy/placement";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { pageMetadata } from "@/site/seo";

// Port of views/pages/placement.php (Pages::placement) and the #placement quiz from app.js.

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/placement", "Tìm lớp phù hợp");
}

export default function Page() {
  return (
    <SiteShell page="placement">
      <PageHeading
        title="Tìm điểm bắt đầu của bạn."
        description="6 câu hỏi nhỏ để gợi ý lộ trình phù hợp."
      />
      <Placement />
      <LegacyScripts />
    </SiteShell>
  );
}
