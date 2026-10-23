import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { userOrLogin } from "@/auth/session";
import { PageHeading } from "../heading";

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
        lead="Chào mừng bạn đến với Một chút English."
      />
      <section className="panel narrow">
        <h2>Thông tin tài khoản</h2>
        <p>Tên: {user.name}</p>
        <p>Email: {user.email}</p>
        <p className="muted">
          Bài học mới được đồng bộ cùng tài khoản. Các bài học thử cũ vẫn lưu trên trình duyệt.
        </p>
        <a href="/hoc">Đến trang học →</a>
      </section>
      <p>
        <a href="/quen-mat-khau">Quên mật khẩu?</a> -{" "}
        <a href="/tai-khoan">Cài đặt và quyền riêng tư</a>
      </p>
      <p>
        <Link href="/login">Đăng nhập tài khoản khác</Link>
      </p>
    </>
  );
}

export default function AccountPage() {
  return (
    <Suspense>
      <AccountDetails />
    </Suspense>
  );
}
