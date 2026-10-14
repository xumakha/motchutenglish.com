"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BookOpen, Menu, X, ArrowUpRight, Sprout } from "lucide-react";
const links = [
  ["/courses", "Lộ trình học"],
  ["/listening", "Luyện nghe"],
  ["/toeic", "TOEIC"],
  ["/dashboard", "Góc học tập"],
];
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="site-header">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <BookOpen size={23} />
          </span>
          một chút english<span className="brand-dot">.</span>
        </Link>
        <nav
          className={open ? "nav open" : "nav"}
          aria-label="Điều hướng chính"
        >
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={pathname.startsWith(href) ? "active" : ""}
              onClick={() => setOpen(false)}
            >
              {label}
            </Link>
          ))}
        </nav>
        <Link href="/placement" className="button header-cta">
          Tìm lớp phù hợp <ArrowUpRight size={15} />
        </Link>
        <button
          className="menu"
          aria-label={open ? "Đóng menu" : "Mở menu"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </header>
      <main>{children}</main>
      <footer className="site-footer">
        <div className="brand">
          <Sprout size={20} /> một chút english.
        </div>
        <p>Học nhẹ nhàng, tiến bộ mỗi ngày.</p>
        <div>
          <Link href="/courses">Lộ trình</Link>
          <Link href="/listening">Luyện nghe</Link>
          <Link href="/dashboard">Tiến độ</Link>
        </div>
        <small>© 2026 Một chút English</small>
      </footer>
    </>
  );
}
