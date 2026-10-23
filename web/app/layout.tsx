import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Một chút English",
  description: "Học tiếng Anh mỗi ngày một chút.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
