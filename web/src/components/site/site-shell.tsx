import { Suspense, type ReactNode } from "react";
import { currentUser } from "@/auth/session";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { currentSiteSettings, type SiteSettings } from "@/site/settings";
import { eq } from "drizzle-orm";
import { HeaderOffset, MenuButton, NoMotion, SkipLink } from "./header-behaviour";

// The page frame from layouts/header.php + footer.php. Each page passes its root segment so the
// wrapper carries the same `page-<root>` class the PHP <body> had (the CSS keys off it).

const GUEST_LINKS: [string, string][] = [
  ["lo-trinh", "Lộ trình"],
  ["tu-vung", "Từ vựng"],
  ["kien-thuc", "Kiến thức"],
  ["kiem-tra-dau-vao", "Kiểm tra gợi ý"],
];
const USER_LINKS: [string, string][] = [
  ["hoc", "Hôm nay"],
  ["lo-trinh", "Lộ trình"],
  ["on-tap", "Ôn tập"],
  ["tai-khoan", "Tài khoản"],
];

function BrandMark({ site }: { site?: SiteSettings }) {
  return (
    <a className="brand" href="/">
      {/* eslint-disable-next-line @next/next/no-img-element -- the logo may be an uploaded /media file */}
      <img
        className="brand-logo"
        src={site?.logo ?? "/assets/images/logo.png"}
        width={44}
        height={44}
        alt=""
      />
      <span className="brand-name">
        {site?.siteName ? (
          site.siteName
        ) : (
          <>
            Một Chút <span>English</span>
          </>
        )}
      </span>
    </a>
  );
}

async function Brand() {
  return <BrandMark site={await currentSiteSettings()} />;
}

function Links({ links, page }: { links: [string, string][]; page: string }) {
  return links.map(([path, label]) => (
    <a key={path} className={page === path ? "active" : ""} href={`/${path}`}>
      {label}
    </a>
  ));
}

function LogoutForm({ className }: { className?: string }) {
  return (
    <form method="post" action="/logout">
      <button className={className} type="submit">
        Đăng xuất
      </button>
    </form>
  );
}

function GuestNav({ page }: { page: string }) {
  return (
    <>
      <nav className="nav" id="navigation" aria-label="Điều hướng chính">
        <Links links={GUEST_LINKS} page={page} />
        <div className="mobile-auth">
          <a href="/login">Đăng nhập</a>
          <a href="/register">Tạo tài khoản</a>
        </div>
      </nav>
      <div className="auth-nav">
        <a className="text-link" href="/login">
          Đăng nhập
        </a>
        <a className="button header-cta" href="/lo-trinh">
          Học thử
        </a>
      </div>
    </>
  );
}

async function Nav({ page }: { page: string }) {
  const user = await currentUser();
  if (!user) return <GuestNav page={page} />;
  const staff = user.role === "editor" || user.role === "admin";
  return (
    <>
      <nav className="nav" id="navigation" aria-label="Điều hướng chính">
        <Links links={USER_LINKS} page={page} />
        <div className="mobile-auth">
          {staff ? <a href="/admin/lessons">Quản trị</a> : null}
          <LogoutForm />
        </div>
      </nav>
      <div className="auth-nav">
        <a className="text-link" href="/account">
          Tài khoản
        </a>
        <LogoutForm className="text-link" />
      </div>
      {staff ? (
        <a className="text-link" href="/admin/lessons">
          Quản trị
        </a>
      ) : null}
    </>
  );
}

/** Learners who turned animations off get `mce-no-motion` on the page frame. */
async function MotionPreference() {
  const user = await currentUser();
  if (!user) return null;
  const [p] = await db()
    .select({ animations: profiles.animations })
    .from(profiles)
    .where(eq(profiles.userId, user.id));
  return p && !p.animations ? <NoMotion /> : null;
}

function FooterBody({ site }: { site?: SiteSettings }) {
  const links: [string, string][] = [
    ["lo-trinh", "Lộ trình"],
    ["tu-vung", "Từ vựng"],
    ["kien-thuc", "Kiến thức"],
    ["gioi-thieu", "Giới thiệu"],
    ["lien-he", "Liên hệ"],
    ["courses", "Bài học cũ"],
    ["dieu-khoan", "Điều khoản"],
    ["bao-mat", "Quyền riêng tư"],
  ];
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-message">
          {/* eslint-disable-next-line @next/next/no-img-element -- may be an uploaded /media file */}
          <img
            src={site?.logo ?? "/assets/images/logo.png"}
            width={64}
            height={64}
            alt="Một Chút English"
            loading="lazy"
          />
          <div>
            <p>Hôm nay một chút.</p>
            <p>Ngày mai tự tin hơn.</p>
          </div>
        </div>
        <nav aria-label="Chân trang">
          {links.map(([path, label]) => (
            <a key={path} href={`/${path}`}>
              {label}
            </a>
          ))}
        </nav>
        {site?.socialUrl ? (
          <a className="footer-social" href={site.socialUrl} rel="noopener noreferrer">
            Kênh của Một Chút English ↗
          </a>
        ) : null}
      </div>
      <small>© 2026 Một Chút English · Học nhẹ nhàng, tiến bộ mỗi ngày.</small>
    </footer>
  );
}

async function Footer() {
  return <FooterBody site={await currentSiteSettings()} />;
}

export function SiteShell({
  page,
  lessonMode = false,
  children,
}: {
  /** Root path segment ("home" for /). */
  page: string;
  lessonMode?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`site-frame page-${page}${lessonMode ? " lesson-mode" : ""}`}>
      <SkipLink />
      <header className="site-header">
        <div className="site-header-inner">
          <Suspense fallback={<BrandMark />}>
            <Brand />
          </Suspense>
          <Suspense fallback={<GuestNav page={page} />}>
            <Nav page={page} />
          </Suspense>
          <MenuButton />
        </div>
      </header>
      <HeaderOffset />
      <Suspense fallback={null}>
        <MotionPreference />
      </Suspense>
      <main id="main-content" tabIndex={-1}>
        <div className="container page">{children}</div>
      </main>
      <Suspense fallback={<FooterBody />}>
        <Footer />
      </Suspense>
    </div>
  );
}
