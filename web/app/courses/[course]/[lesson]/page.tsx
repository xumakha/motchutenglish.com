import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Audio, LegacyScripts, Quiz } from "@/components/legacy/markup";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { courses, findCourse, findLesson } from "@/site/queries/legacy";
import { pageMetadata } from "@/site/seo";

// Port of views/courses/lesson.php (Courses::lesson).

type Props = PageProps<"/courses/[course]/[lesson]">;

export function generateStaticParams() {
  return courses.flatMap((c) => c.lessons.map((l) => ({ course: c.id, lesson: l.id })));
}

async function find(props: Props) {
  const { course, lesson } = await props.params;
  const c = findCourse(course);
  const l = c ? findLesson(c, lesson) : null;
  return { c, l, path: `/courses/${course}/${lesson}` };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { l, path } = await find(props);
  if (!l) return pageMetadata(path, "Không tìm thấy trang", undefined, { error: true });
  return pageMetadata(path, l.title);
}

const href = (course: string, lesson?: string) =>
  `/courses/${encodeURIComponent(course)}${lesson ? `/${encodeURIComponent(lesson)}` : ""}` as const;

export default async function Page(props: Props) {
  const { c, l } = await find(props);
  if (!c || !l) notFound();
  const index = c.lessons.findIndex((x) => x.id === l.id);
  const next = c.lessons[index + 1];
  return (
    <SiteShell page="courses">
      <Link className="breadcrumb" href={href(c.id)}>
        {"← " + c.title}
      </Link>
      <PageHeading title={l.title} description="Đọc mẫu câu · Luyện nghe · Thực hành" />
      <div className="learning-layout">
        <article className="panel lesson-content">
          <span className="eyebrow">BƯỚC 1 · LÀM QUEN</span>
          <h2>Mẫu câu hôm nay</h2>
          <div className="sample">
            <p>{l.text}</p>
            <span>{l.translation}</span>
          </div>
          <Audio text={l.text} />
          <h3>Từ vựng cần nhớ</h3>
          <div className="vocab">
            {l.vocabulary.map((v) => (
              <div key={v}>{v}</div>
            ))}
          </div>
          <div className="divider"></div>
          <span className="eyebrow">BƯỚC 2 · THỬ SỨC</span>
          <Quiz q={l.question} id={`${c.id}/${l.id}`} />
          <div className="completion" data-completion={`${c.id}/${l.id}`} hidden>
            <span>✓ Bài học đã hoàn thành</span>
            <Link className="button" href={href(c.id, next?.id)}>
              {next ? "Bài tiếp theo →" : "Về lộ trình →"}
            </Link>
          </div>
        </article>
        <aside className="panel">
          <span className="eyebrow">{c.title}</span>
          <h3>Nội dung lộ trình</h3>
          <div className="side-lessons">
            {c.lessons.map((x, i) => (
              <Link key={x.id} className={x.id === l.id ? "current" : ""} href={href(c.id, x.id)}>
                <span data-completed={`${c.id}/${x.id}`}>{i + 1}</span>
                {x.title}
              </Link>
            ))}
          </div>
          <div className="note">💡 Đọc to mẫu câu, nghe lại và thử nói mà không nhìn nội dung.</div>
        </aside>
      </div>
      <LegacyScripts />
    </SiteShell>
  );
}
