import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: {
    default: "Một chút English — Học mỗi ngày",
    template: "%s | Một chút English",
  },
  description:
    "Học tiếng Anh từ cơ bản, tiếng Anh công sở và TOEIC. Luyện nghe và theo dõi tiến độ mỗi ngày.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
