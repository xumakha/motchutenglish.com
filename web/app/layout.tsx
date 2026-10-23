import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthNav } from "@/components/auth-nav";

export const metadata: Metadata = {
  title: { default: "Một chút English", template: "%s | Một chút English" },
  description: "Học tiếng Anh mỗi ngày một chút.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi">
      <body>
        <a className="skip-link" href="#main-content">
          Bỏ qua đến nội dung chính
        </a>
        <header className="site-header">
          <Link href="/" className="brand">
            Một chút English
          </Link>
          <nav aria-label="Tài khoản">
            <Suspense>
              <AuthNav />
            </Suspense>
          </nav>
        </header>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </body>
    </html>
  );
}
