import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { staffOrLogin } from "@/auth/session";
import {
  ArticleDrafts,
  AuditSection,
  EntityDrafts,
  EntitySection,
  ImportSection,
  LessonSection,
  MediaSection,
  OperationsForms,
  OperationsSection,
  Pagination,
  ReorderForm,
  ReportSection,
  SetItemsForm,
  SettingsSection,
  UserSection,
  type AdminContext,
} from "@/components/admin/sections";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { currentActor } from "@/server/actor";
import {
  ADMIN_ONLY,
  ENTITY_SECTIONS,
  SECTIONS,
  adminData,
  importStates,
  isSection,
  operations,
} from "@/site/queries/admin";

// Port of /admin/{section}: Product::page (admin branch) + views/product/page.php +
// views/product/admin.php. Editors see content sections; users/settings/audit/operations are
// admin only.

type Props = PageProps<"/admin/[section]">;

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { section } = await props.params;
  return {
    title: isSection(section) ? `Quản trị - ${section}` : "Không tìm thấy trang",
    robots: { index: false, follow: false },
  };
}

const LEARN_LINKS = [
  ["/hoc", "Hôm nay"],
  ["/lo-trinh", "Lộ trình"],
  ["/on-tap", "Ôn tập"],
  ["/so-tu-vung", "Sổ từ"],
  ["/tien-do", "Tiến độ"],
  ["/tim-kiem", "Tìm kiếm"],
  ["/tai-khoan", "Tài khoản"],
] as const;

function query(raw: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") out[k] = v;
  return out;
}

async function Admin({
  section,
  searchParams,
}: {
  section: string;
  searchParams: Props["searchParams"];
}) {
  if (!isSection(section)) notFound();
  const user = await staffOrLogin(ADMIN_ONLY.includes(section));
  const actor = await currentActor();
  const q = query(await searchParams);
  const ctx: AdminContext = { section, user, query: q };
  const pageNo = Math.max(1, Number.parseInt(q.pageNo ?? "1", 10) || 1);

  let body: React.ReactNode;
  let empty: boolean;
  if (section === "operations") {
    body = <OperationsSection data={await operations()} />;
    empty = false;
  } else {
    const data = await adminData(actor, section, pageNo, {
      q: (q.q ?? "").slice(0, 100),
      type: q.type ?? "",
      level: q.level ?? "",
      tag: q.tag ?? "",
      status: q.status ?? "",
    });
    empty = !data.length;
    if (ENTITY_SECTIONS.includes(section)) body = <EntitySection ctx={ctx} data={data} />;
    else if (section === "lessons" || section === "questions")
      body = <LessonSection ctx={ctx} data={data} />;
    else if (section === "media") body = <MediaSection data={data} />;
    else if (section === "imports")
      body = <ImportSection states={await importStates(actor, data)} />;
    else if (section === "reports") body = <ReportSection data={data} />;
    else if (section === "users") body = <UserSection data={data} />;
    else if (section === "settings") body = <SettingsSection ctx={ctx} data={data} />;
    else body = <AuditSection data={data} />;
  }

  return (
    <>
      <nav className="product-nav" aria-label="Quản trị">
        {Object.entries(SECTIONS).map(([key, label]) => (
          <Link key={key} href={`/admin/${key}`}>
            {label}
          </Link>
        ))}
      </nav>
      {body}
      {empty ? <p>Chưa có dữ liệu ở mục này.</p> : null}
      {section !== "operations" && section !== "settings" ? <Pagination ctx={ctx} /> : null}
      {["paths", "units", "lessons"].includes(section) ? <ReorderForm ctx={ctx} /> : null}
      {section === "articles" ? <ArticleDrafts ctx={ctx} /> : null}
      {["paths", "vocabulary", "vocabulary-sets"].includes(section) ? (
        <EntityDrafts ctx={ctx} />
      ) : null}
      {section === "operations" ? <OperationsForms /> : null}
      {section === "vocabulary-sets" ? <SetItemsForm /> : null}
    </>
  );
}

async function Heading({ params }: { params: Props["params"] }) {
  const { section } = await params;
  return (
    <PageHeading title={`Quản trị - ${section}`} description="Mỗi bước nhỏ đều được ghi nhận." />
  );
}

async function Body({ params, searchParams }: Props) {
  const { section } = await params;
  return <Admin section={section} searchParams={searchParams} />;
}

export default function Page(props: Props) {
  return (
    <SiteShell page="admin">
      <Suspense>
        <Heading params={props.params} />
      </Suspense>
      <nav className="product-nav" aria-label="Học tiếng Anh">
        {LEARN_LINKS.map(([href, label]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </nav>
      <Suspense>
        <Body {...props} />
      </Suspense>
    </SiteShell>
  );
}
