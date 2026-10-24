import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { startLesson } from "@/actions/routes";
import { currentUser } from "@/auth/session";
import { Breadcrumb } from "@/components/public/breadcrumb";
import { RouteForm } from "@/components/route-form";
import { SiteShell } from "@/components/site/site-shell";
import { randomHex } from "@/domain/php";
import { publicLessons } from "@/site/catalog";
import { pageMetadata } from "@/site/seo";

// Port of the bai-hoc branch of views/product/page.php: the lesson intro with the start form.
// Guests may start only lessons whose document has preview=true.

type Props = PageProps<"/bai-hoc/[slug]">;

async function findLesson(slug: string) {
  return (await publicLessons()).find((l) => l.slug === slug) ?? null;
}

/** Product::page title: the document's SEO title when set, else the lesson title. */
function lessonTitle(lesson: NonNullable<Awaited<ReturnType<typeof findLesson>>>) {
  return lesson.document.seo?.title?.trim() ? lesson.document.seo.title : lesson.title;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const lesson = await findLesson(slug);
  if (!lesson) notFound();
  const doc = lesson.document;
  return pageMetadata(
    `/bai-hoc/${slug}`,
    lessonTitle(lesson),
    doc.seo?.description?.trim() ? doc.seo.description : doc.objectives,
  );
}

async function Content({ params }: { params: Props["params"] }) {
  const { slug } = await params;
  const [lesson, user] = await Promise.all([findLesson(slug), currentUser()]);
  if (!lesson) notFound();
  const doc = lesson.document;
  return (
    <>
      <Breadcrumb path={`/bai-hoc/${slug}`} title={lessonTitle(lesson)} />
      <section className="panel design-intro">
        <nav aria-label="Breadcrumb" className="small">
          <Link href={`/lo-trinh/${lesson.pathSlug}`}>{lesson.pathTitle}</Link> / {lesson.unitTitle}
        </nav>
        <p>
          <span className="badge">
            {lesson.subtype === "checkpoint" ? "Checkpoint" : "Bài học"}
          </span>
        </p>
        <h1>{lesson.title}</h1>
        <div className="intro-meta">
          <div>
            <span aria-hidden="true">◷</span>
            <strong>~{doc.minutes} phút</strong>
          </div>
          <div>
            <span aria-hidden="true">☷</span>
            <strong>{doc.exercises.length} câu</strong>
          </div>
          <div>
            <span aria-hidden="true">◎</span>
            <strong>Ngưỡng đạt {doc.passThreshold}%</strong>
          </div>
        </div>
        <h3>Mục tiêu</h3>
        <p>{doc.objectives}</p>
        <div className="design-actions">
          {!user && !doc.preview ? (
            <Link className="button" href="/login">
              Đăng nhập để bắt đầu
            </Link>
          ) : (
            <RouteForm
              action={startLesson}
              fields={{ lessonId: lesson.id, requestKey: randomHex(16) }}
              label={user ? "Bắt đầu bài học" : "Học thử ngay"}
            />
          )}
          <Link className="button secondary" href={`/lo-trinh/${lesson.pathSlug}`}>
            Xem lộ trình
          </Link>
        </div>
        {!user && doc.preview ? (
          <p className="small">
            Học thử không cần tài khoản. Đăng nhập sau và xác nhận chuyển bài học thử để lưu tiến
            độ.
          </p>
        ) : null}
      </section>
    </>
  );
}

export default function Page({ params }: Props) {
  return (
    <SiteShell page="bai-hoc">
      <Suspense>
        <Content params={params} />
      </Suspense>
    </SiteShell>
  );
}
