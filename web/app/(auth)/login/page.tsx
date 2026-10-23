import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "../auth-form";
import { PageHeading } from "../heading";
import { RedirectIfSignedIn } from "../redirect-if-signed-in";

export const metadata: Metadata = {
  title: "Đăng nhập",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <>
      <PageHeading
        eyebrow="ĐĂNG NHẬP"
        title="Chào mừng bạn trở lại."
        lead="Học nhẹ nhàng, tiến bộ mỗi ngày."
      />
      <Suspense>
        <RedirectIfSignedIn>
          <AuthForm mode="login" />
        </RedirectIfSignedIn>
      </Suspense>
      <p>
        <a href="/quen-mat-khau">Quên mật khẩu?</a> -{" "}
        <a href="/tai-khoan">Cài đặt và quyền riêng tư</a>
      </p>
    </>
  );
}
