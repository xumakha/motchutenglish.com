import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PasswordResetPanel } from "@/components/public/client";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { mailConfigured } from "@/env";
import { pageMetadata } from "@/site/seo";

// Port of the dat-lai-mat-khau branch of views/product/page.php. The token arrives as
// `#token=…`; PasswordResetPanel copies it into the form on the client.

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/dat-lai-mat-khau", "Bảo mật tài khoản");
}

async function Panel() {
  await connection();
  return <PasswordResetPanel mode="reset" mailConfigured={mailConfigured()} />;
}

export default function Page() {
  return (
    <SiteShell page="dat-lai-mat-khau">
      <PageHeading title="Bảo mật tài khoản" description="Mỗi bước nhỏ đều được ghi nhận." />
      <Suspense>
        <Panel />
      </Suspense>
    </SiteShell>
  );
}
