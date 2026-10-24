import type { Metadata, Viewport } from "next";
import "../public/assets/fonts/design-fonts.css";
import "../public/assets/css/style.css";
import "../public/assets/css/product.css";
import "../public/assets/css/redesign.css";
import "./globals.css";

// Styles are the PHP app's stylesheets, loaded in the same order; /theme.css (site colours) comes
// last so it can override the brand variables. Each page renders <SiteShell> for its frame.

export const metadata: Metadata = {
  title: { default: "Một chút English", template: "%s | Một chút English" },
  description: "Học tiếng Anh từng bước nhỏ, có giải thích và lịch ôn rõ ràng.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = { themeColor: "#2864dc" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi">
      <head>
        {/* eslint-disable-next-line @next/next/no-css-tags -- dynamic site colours, not a bundle */}
        <link rel="stylesheet" href="/theme.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
