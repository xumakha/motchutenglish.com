import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "../auth-form";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { RedirectIfSignedIn } from "../redirect-if-signed-in";

export const metadata: Metadata = {
  title: "Đăng nhập",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <SiteShell page="login">
      <PageHeading
        eyebrow="ĐĂNG NHẬP"
        title="Chào mừng bạn trở lại."
        description="Học nhẹ nhàng, tiến bộ mỗi ngày."
      />
      <Suspense>
        <RedirectIfSignedIn>
          <AuthForm mode="login" />
        </RedirectIfSignedIn>
      </Suspense>
      <p>
        <Link href="/quen-mat-khau">Quên mật khẩu?</Link> -{" "}
        <Link href="/tai-khoan">Cài đặt và quyền riêng tư</Link>
      </p>
    </SiteShell>
  );
}
