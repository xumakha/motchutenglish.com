import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PasswordResetPanel } from "@/components/public/client";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { mailConfigured } from "@/env";
import { pageMetadata } from "@/site/seo";

// Port of the quen-mat-khau branch of views/product/page.php (reset link request).

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/quen-mat-khau", "Bảo mật tài khoản");
}

async function Panel() {
  await connection();
  return <PasswordResetPanel mode="request" mailConfigured={mailConfigured()} />;
}

export default function Page() {
  return (
    <SiteShell page="quen-mat-khau">
      <PageHeading title="Bảo mật tài khoản" description="Mỗi bước nhỏ đều được ghi nhận." />
      <Suspense>
        <Panel />
      </Suspense>
    </SiteShell>
  );
}
