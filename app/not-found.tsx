import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";

// views/errors/404.php
export const metadata: Metadata = {
  title: "Không tìm thấy trang",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <SiteShell page="404">
      <PageHeading title="Không tìm thấy trang" description="Đường dẫn này không tồn tại." />
      <Link className="button" href="/">
        Về trang chủ
      </Link>
    </SiteShell>
  );
}
