import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, Suspense } from "react";
import { enrollPath } from "@/actions/routes";
import { currentUser } from "@/auth/session";
import { Breadcrumb } from "@/components/public/breadcrumb";
import { MapToggle } from "@/components/public/client";
import { RouteForm } from "@/components/route-form";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { publicLessons, publicPaths } from "@/site/catalog";
import { learnerPathState } from "@/site/queries/public";
import { pageMetadata } from "@/site/seo";

// Port of the lo-trinh/{slug} branch of views/product/page.php: path intro, progress and the
// lesson list with the signed-in learner's done/passed/active markers.

type Props = PageProps<"/lo-trinh/[slug]">;

/** A published path that has playable lessons (PHP 404s otherwise). */
async function findPath(slug: string) {
  const path = (await publicPaths()).find((p) => p.slug === slug);
  if (!path) return null;
  const lessons = await publicLessons(path.id);
  return lessons.length ? { path, lessons } : null;
}

type Lessons = NonNullable<Awaited<ReturnType<typeof findPath>>>["lessons"];
type LearnerState = { done: number[]; passed: number[]; active: number[] };
const NO_PROGRESS: LearnerState = { done: [], passed: [], active: [] };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = await findPath(slug);
  if (!found) notFound();
  return pageMetadata(`/lo-trinh/${slug}`, found.path.title, found.path.description);
}

function LessonList({ lessons, state }: { lessons: Lessons; state: LearnerState }) {
  const { done, passed, active } = state;
  const required = lessons.filter((l) => l.required);
  const n = required.filter((l) => done.includes(l.id)).length;
  return (
    <>
      <p>
        {n}/{required.length} bài bắt buộc hoàn thành
      </p>
      <progress max={Math.max(1, required.length)} value={n} aria-label="Tiến độ lộ trình" />
      <div className="path-list" id="path-list">
        {lessons.map((l, i) => {
          // A unit heading before the first lesson of each unit.
          const heading = lessons[i - 1]?.unitId !== l.unitId ? <h2>{l.unitTitle}</h2> : null;
          const status = passed.includes(l.id)
            ? "Đã đạt"
            : done.includes(l.id)
              ? "Đã hoàn thành"
              : active.includes(l.id)
                ? "Đang học"
                : "Chưa học";
          return (
            <Fragment key={l.id}>
              {heading}
              <Link className="lesson-row" href={`/bai-hoc/${l.slug}`}>
                <span className="lesson-number">{done.includes(l.id) ? "✓" : "○"}</span>
                <span>
                  <strong>{l.title}</strong>
                  <br />
                  {l.document.minutes} phút -{" "}
                  {l.subtype === "checkpoint" ? "Checkpoint - thử sức" : "Bài học"} - {status}
                </span>
                <span>→</span>
              </Link>
            </Fragment>
          );
        })}
        <Link className="lesson-row" href="/on-tap">
          <span className="lesson-number">↻</span>
          <span>
            <strong>Ôn tập những gì đã học</strong>
            <br />
            Thẻ đến hạn theo lịch ôn của bạn
          </span>
        </Link>
      </div>
    </>
  );
}

async function LearnerLessonList({ lessons }: { lessons: Lessons }) {
  const user = await currentUser();
  return (
    <LessonList lessons={lessons} state={user ? await learnerPathState(user.id) : NO_PROGRESS} />
  );
}

async function Enroll({ pathId }: { pathId: number }) {
  if (!(await currentUser())) return null;
  return <RouteForm action={enrollPath} fields={{ pathId }} label="Chọn lộ trình này" />;
}

async function Content({ params }: { params: Props["params"] }) {
  const { slug } = await params;
  const found = await findPath(slug);
  if (!found) notFound();
  const { path, lessons } = found;
  return (
    <>
      <Breadcrumb path={`/lo-trinh/${slug}`} title={path.title} />
      <PageHeading eyebrow="LỘ TRÌNH" title={path.title} description={path.description} />
      <section className="panel">
        {path.imageId ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded /media file
          <img
            className="path-image"
            loading="lazy"
            src={`/media/${path.imageId}`}
            alt={path.title}
          />
        ) : null}
        <p>{path.description}</p>
        <h2>Bạn sẽ học được</h2>
        <p>{path.objectives}</p>
        <p>Gợi ý trước khi học: {path.prerequisites || "Không yêu cầu kiến thức trước."}</p>
        <Suspense>
          <Enroll pathId={path.id} />
        </Suspense>
        <p>
          <MapToggle />
        </p>
      </section>
      <Suspense fallback={<LessonList lessons={lessons} state={NO_PROGRESS} />}>
        <LearnerLessonList lessons={lessons} />
      </Suspense>
    </>
  );
}

export default function Page({ params }: Props) {
  return (
    <SiteShell page="lo-trinh">
      <Suspense>
        <Content params={params} />
      </Suspense>
    </SiteShell>
  );
}
