import type { Route } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/site/page-heading";

// The heading and product nav every learner screen of views/product/page.php starts with.

const LINKS: [Route, string][] = [
  ["/hoc", "Hôm nay"],
  ["/lo-trinh", "Lộ trình"],
  ["/on-tap", "Ôn tập"],
  ["/so-tu-vung", "Sổ từ"],
  ["/tien-do", "Tiến độ"],
  ["/tim-kiem", "Tìm kiếm"],
  ["/tai-khoan", "Tài khoản"],
];

export function LearnerHeading({ title }: { title: string }) {
  return (
    <>
      <PageHeading title={title} description="Mỗi bước nhỏ đều được ghi nhận." />
      {/* redesign.css hides this nav unless the element with `redesign` also has a learner
          page-* class. PHP put both on <body>; here they sit on different elements, so the rule
          always matches. The inline display restores `.redesign .product-nav` until the shared
          CSS or shell is fixed. */}
      <nav className="product-nav" aria-label="Học tiếng Anh" style={{ display: "flex" }}>
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}

/** private-pagination.php */
export function PrivatePagination({
  paging,
  href,
}: {
  paging: { page: number; pages: number; total: number };
  href: (page: number) => string;
}) {
  return (
    <nav className="product-nav" aria-label="Phân trang">
      <span>
        Trang {paging.page} / {paging.pages} · {paging.total} mục
      </span>
      {paging.page > 1 ? (
        <Link rel="prev" href={href(paging.page - 1) as Route}>
          Trang trước
        </Link>
      ) : null}
      {paging.page < paging.pages ? (
        <Link rel="next" href={href(paging.page + 1) as Route}>
          Trang sau
        </Link>
      ) : null}
    </nav>
  );
}
