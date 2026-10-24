import type { Metadata } from "next";
import { EmailTokenResult } from "@/components/public/client";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { pageMetadata } from "@/site/seo";

// Port of /huy-nhac-hoc: product.js reads `#token=` and posts it to email/consume.

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/huy-nhac-hoc", "Bảo mật tài khoản");
}

export default function Page() {
  return (
    <SiteShell page="huy-nhac-hoc">
      <PageHeading title="Bảo mật tài khoản" description="Mỗi bước nhỏ đều được ghi nhận." />
      <EmailTokenResult purpose="unsubscribe" />
    </SiteShell>
  );
}
