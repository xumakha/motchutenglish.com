import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { staffOrLogin } from "@/auth/session";
import { LegacyLessonForm, LegacyPublishForm } from "@/components/legacy/lesson-form";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { legacyDraft, listLegacyLessons } from "@/domain/legacy/lessons";
import { randomHex } from "@/domain/php";
import { currentActor } from "@/server/actor";

// Port of Learning::index('admin') + views/learning/index.php: the original single-question
// lessons. Drafts are edited here; admins publish; published lessons can be started.

export const metadata: Metadata = {
  title: "Quản trị bài học",
  robots: { index: false, follow: false },
};

async function Content({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  const user = await staffOrLogin();
  const actor = await currentActor();
  const { edit } = await searchParams;
  const { lessons } = await listLegacyLessons(actor, "admin");
  const row = typeof edit === "string" ? await legacyDraft(actor, Number(edit) || 0) : null;
  const draft = row
    ? {
        id: row.id,
        title: row.title,
        body: row.body,
        question: row.question,
        one: row.choices.one ?? "",
        two: row.choices.two ?? "",
        explanation: row.explanation,
        answer: row.answerId,
      }
    : null;
  return (
    <>
      <nav className="audio-player">
        <Link className="button" href="/hoc">
          Học hôm nay
        </Link>
        <Link className="button" href="/admin">
          Quản trị nội dung
        </Link>
      </nav>
      <section className="panel green">
        <h2>Quản trị nội dung đầy đủ</h2>
        <p>
          Mở CMS lộ trình, phiên bản bài học, từ vựng, báo lỗi và nhập/xuất. Biểu mẫu bên dưới được
          giữ để tương thích bài cũ.
        </p>
        <Link className="button" href="/admin/lessons">
          Mở CMS mới
        </Link>
      </section>
      <section className="panel">
        <h2>{draft ? "Sửa bài học nháp" : "Tạo bài học nháp"}</h2>
        <p>
          Bản đầu hỗ trợ nội dung văn bản và một câu trắc nghiệm. Bài đã xuất bản được giữ nguyên;
          tạo bài mới khi cần thay nội dung.
        </p>
        <LegacyLessonForm key={draft?.id ?? 0} draft={draft} />
      </section>
      <h2>Nội dung</h2>
      {!lessons.length ? (
        <p>
          Chưa có bài học được xuất bản trong hệ thống mới.{" "}
          <Link href="/courses">Xem các bài học thử hiện có</Link>.
        </p>
      ) : null}
      {lessons.map((item) => (
        <section key={item.id} className="panel">
          <h3>{item.title}</h3>
          {item.status === "draft" ? (
            <p>
              <Link href={`/admin?edit=${item.id}`}>Sửa bản nháp</Link>
            </p>
          ) : null}
          <p>
            <Link href={`/admin/preview/${item.id}`}>Xem trước</Link>
          </p>
          <p>{item.status === "draft" ? "Bản nháp" : "Đã xuất bản"}</p>
          {item.status === "draft" && user.role === "admin" ? (
            <LegacyPublishForm lessonId={item.id} />
          ) : null}
          {item.status === "published" ? (
            <form method="post" action={`/hoc/bai/${item.id}`}>
              <input type="hidden" name="request_key" value={randomHex(16)} />
              <button className="button">Bắt đầu học</button>
            </form>
          ) : null}
        </section>
      ))}
    </>
  );
}

export default function Page(props: PageProps<"/admin">) {
  return (
    <SiteShell page="admin">
      <PageHeading
        title="Quản trị bài học"
        description="Học một chút mỗi ngày, lưu tiến bộ cùng tài khoản của bạn."
      />
      <Suspense>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </SiteShell>
  );
}
