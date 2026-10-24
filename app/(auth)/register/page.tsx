import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "../auth-form";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { RedirectIfSignedIn } from "../redirect-if-signed-in";

export const metadata: Metadata = {
  title: "Đăng ký",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <SiteShell page="register">
      <PageHeading
        eyebrow="ĐĂNG KÝ"
        title="Tạo tài khoản của bạn."
        description="Học nhẹ nhàng, tiến bộ mỗi ngày."
      />
      <Suspense>
        <RedirectIfSignedIn>
          <AuthForm mode="register" />
        </RedirectIfSignedIn>
      </Suspense>
    </SiteShell>
  );
}
