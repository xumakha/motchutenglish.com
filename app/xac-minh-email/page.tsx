import type { Metadata } from "next";
import { EmailTokenResult } from "@/components/public/client";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { pageMetadata } from "@/site/seo";

// Port of /xac-minh-email: product.js reads `#token=` and posts it to email/consume.

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/xac-minh-email", "Bảo mật tài khoản");
}

export default function Page() {
  return (
    <SiteShell page="xac-minh-email">
      <PageHeading title="Bảo mật tài khoản" description="Mỗi bước nhỏ đều được ghi nhận." />
      <EmailTokenResult purpose="verify" />
    </SiteShell>
  );
}
