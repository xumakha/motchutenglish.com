import type { Metadata } from "next";
import { Suspense } from "react";
import { userOrLogin } from "@/auth/session";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";

export const metadata: Metadata = {
  title: "Tài khoản",
  robots: { index: false, follow: false },
};

async function AccountDetails() {
  const user = await userOrLogin();
  return (
    <>
      <PageHeading
        eyebrow="TÀI KHOẢN CỦA BẠN"
        title={`Chào ${user.name}!`}
        description="Chào mừng bạn đến với Một chút English."
      />
      <section className="panel narrow">
        <h2>Thông tin tài khoản</h2>
        <p>Tên: {user.name}</p>
        <p>Email: {user.email}</p>
        <p className="muted">
          Bài học mới được đồng bộ cùng tài khoản. Các bài học thử cũ vẫn lưu trên trình duyệt.
        </p>
        <a className="button" href="/hoc">
          Đến trang học →
        </a>
      </section>
      <p>
        <a href="/quen-mat-khau">Quên mật khẩu?</a> -{" "}
        <a href="/tai-khoan">Cài đặt và quyền riêng tư</a>
      </p>
    </>
  );
}

export default function AccountPage() {
  return (
    <SiteShell page="account">
      <Suspense>
        <AccountDetails />
      </Suspense>
    </SiteShell>
  );
}
