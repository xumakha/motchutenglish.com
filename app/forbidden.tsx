import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";

export const metadata: Metadata = {
  title: "Không có quyền",
  robots: { index: false, follow: false },
};

export default function Forbidden() {
  return (
    <SiteShell page="admin">
      <PageHeading
        title="Không có quyền"
        description="Bạn không có quyền thực hiện thao tác này."
      />
      <Link className="button" href="/">
        Về trang chủ
      </Link>
    </SiteShell>
  );
}
