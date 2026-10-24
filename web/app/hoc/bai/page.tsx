import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { userOrLogin } from "@/auth/session";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { listLegacyLessons } from "@/domain/legacy/lessons";
import { randomHex } from "@/domain/php";
import { currentActor } from "@/server/actor";

// Port of Learning::index('hoc') + the learner branch of views/learning/index.php: published
// legacy single-question lessons and the learner's legacy history. In PHP the /hoc route matched
// the product page first, so this list was unreachable (migration bug fix 19); it lives here now.

export const metadata: Metadata = {
  title: "Học hôm nay",
  robots: { index: false, follow: false },
};

function historyLabel(score: number | null, submittedAt: Date | null) {
  if (submittedAt === null) return "Tiếp tục học";
  return score ? "Đã đạt - 100%" : "Đã hoàn thành - 0%";
}

async function Content() {
  const user = await userOrLogin();
  const { lessons, history, xp } = await listLegacyLessons(await currentActor(), "hoc");
  return (
    <>
      <nav className="audio-player">
        <Link className="button" href="/hoc">
          Học hôm nay
        </Link>
        {user.role === "admin" || user.role === "editor" ? (
          <Link className="button" href="/admin">
            Quản trị nội dung
          </Link>
        ) : null}
      </nav>
      <section className="panel green">
        <h2>
          {xp} XP - Cấp hoạt động {1 + Math.floor(xp / 200)}
        </h2>
        <p>XP ghi nhận hoạt động, không đại diện trình độ tiếng Anh.</p>
      </section>
      <h2>Bài học đã xuất bản</h2>
      {!lessons.length ? (
        <p>
          Chưa có bài học được xuất bản trong hệ thống mới.{" "}
          <Link href="/courses">Xem các bài học thử hiện có</Link>.
        </p>
      ) : null}
      {lessons.map((item) => (
        <section key={item.id} className="panel">
          <h3>{item.title}</h3>
          <form method="post" action={`/hoc/bai/${item.id}`}>
            <input type="hidden" name="request_key" value={randomHex(16)} />
            <button className="button">Bắt đầu học</button>
          </form>
        </section>
      ))}
      <h2>Lịch sử và bài đang học</h2>
      {history.map((a) => (
        <p key={a.id}>
          <Link href={`/ket-qua/${a.id}`}>
            {(a.snapshot as { title?: string } | null)?.title ?? ""} -{" "}
            {historyLabel(a.score, a.submittedAt)}
          </Link>
        </p>
      ))}
    </>
  );
}

export default function Page() {
  return (
    <SiteShell page="hoc">
      <PageHeading
        title="Học hôm nay"
        description="Học một chút mỗi ngày, lưu tiến bộ cùng tài khoản của bạn."
      />
      <Suspense>
        <Content />
      </Suspense>
    </SiteShell>
  );
}
