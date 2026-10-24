import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { saveStreakPreferences } from "@/actions/routes";
import { userOrLogin } from "@/auth/session";
import { FlashProvider, LearnerForm } from "@/components/learner/flash";
import { LearnerHeading } from "@/components/learner/product-nav";
import { SiteShell } from "@/components/site/site-shell";
import { progressHistory } from "@/domain/study/progress";
import { currentActor } from "@/server/actor";
import { localTime, progressExtras } from "@/site/queries/learner";
import { pageMetadata } from "@/site/seo";

// Port of the 'tien-do' branch of views/product/page.php and progress-history.php.

const TITLE = "Tiến độ học của bạn";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/tien-do", TITLE);
}

const BADGES: Record<string, string> = {
  first_lesson: "Bài đầu tiên",
  first_unit: "Chương đầu tiên",
  seven_days: "7 ngày thực học",
  review_fifty: "Ôn 50 thẻ",
};
const DAY_STATUS: Record<string, string> = {
  learned: "Đã học",
  protected: "Dùng vé nghỉ",
  missed: "Chưa học",
};

/** PHP round($x, 1) printed as a number ("12.5", "40"). */
const round1 = (x: number) => String(Math.round(x * 10) / 10);

type Query = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Progress({ searchParams }: { searchParams: Promise<Query> }) {
  await userOrLogin();
  const query = await searchParams;
  const actor = await currentActor();
  const [h, extras] = await Promise.all([
    progressHistory(actor, one(query.week) ?? 0, one(query.page) ?? 1),
    progressExtras(actor),
  ]);
  const tz = h.profile.timezone;
  const week = h.weekOffset;
  const paging = h.historyPaging;
  const { accuracy } = extras;
  return (
    <FlashProvider reload="/tien-do">
      <section className="panel">
        <h2>Tuần học của bạn</h2>
        <p>
          {h.weekStart} – {h.weekEnd} · {tz}
        </p>
        <nav className="product-nav" aria-label="Chọn tuần thống kê">
          {week < 520 ? <Link href={`/tien-do?week=${week + 1}`}>Tuần trước</Link> : null}
          {week > 0 ? (
            <>
              <Link href={`/tien-do?week=${week - 1}`}>Tuần sau</Link>
              <Link href="/tien-do">Tuần này</Link>
            </>
          ) : null}
        </nav>
        <div className="stats-grid">
          <p>
            <strong>{h.weekTotals.lessons}</strong> lượt hoàn thành bài
          </p>
          <p>
            <strong>{h.weekTotals.activeDays} / 7</strong> ngày hoạt động
          </p>
          <p>
            <strong>{h.weekTotals.reviews}</strong> lượt ôn
          </p>
          <p>
            Độ chính xác:{" "}
            <strong>
              {h.weekScore.maxScore
                ? `${round1((100 * (h.weekScore.score ?? 0)) / h.weekScore.maxScore)}%`
                : "Chưa có dữ liệu"}
            </strong>
          </p>
          <p>{round1(h.weekSeconds / 60)} phút tương tác ước tính</p>
        </div>
        <p>
          Số bài/ngày hoạt động/lượt ôn theo ngày đã ghi nhận khi học; độ chính xác tính các lượt
          bài khách quan kết thúc trong tuần theo múi giờ hiển thị, không tính kiểm tra gợi ý hoặc
          preview. Bài tự đánh giá không tính thành 0%.
        </p>
        {!h.weekDays.length ? (
          <p>Tuần này chưa có hoạt động được ghi nhận.</p>
        ) : (
          <ul>
            {h.weekDays.map((day) => (
              <li key={day.localDate}>
                {day.localDate}: {day.lessons} bài, {day.reviews} lượt ôn
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel">
        <h2>Lịch sử lượt học đã kết thúc</h2>
        <p>
          Lịch sử tất cả thời gian, mở đúng phiên bản đã học. Không bao gồm lượt xem trước của
          staff.
        </p>
        {!h.history.length ? <p>Bạn chưa có lượt học đã kết thúc.</p> : null}
        {h.history.map((a) => (
          <article key={a.id} className="panel">
            <h3>
              <Link href={`/hoc/luot/${a.id}`}>{a.title}</Link>
            </h3>
            <p>
              {a.finishedAt ? localTime(a.finishedAt, tz) : ""} · Phiên bản #{a.versionId}
              {a.archived ? " · Bài đã lưu trữ" : ""}
              {a.subtype === "placement" ? " · Kiểm tra gợi ý" : ""}
            </p>
            <p>
              {a.maxScore
                ? `${a.score} / ${a.maxScore} (${round1((100 * (a.score ?? 0)) / a.maxScore)}%)`
                : "Tự đánh giá / chưa có điểm khách quan"}
            </p>
          </article>
        ))}
        <nav className="product-nav" aria-label="Phân trang lịch sử">
          <span>
            Trang {paging.page} / {paging.pages} · {paging.total} lượt
          </span>
          {paging.page > 1 ? (
            <Link rel="prev" href={`/tien-do?week=${week}&page=${paging.page - 1}`}>
              Trang trước
            </Link>
          ) : null}
          {paging.page < paging.pages ? (
            <Link rel="next" href={`/tien-do?week=${week}&page=${paging.page + 1}`}>
              Trang sau
            </Link>
          ) : null}
        </nav>
      </section>
      <section className="panel">
        <h2>Thống kê của bạn</h2>
        <p>
          Độ chính xác câu khách quan:{" "}
          {accuracy.maxScore
            ? `${Math.floor((100 * (accuracy.score ?? 0)) / accuracy.maxScore)}%`
            : "Chưa có dữ liệu"}
          . Bài tự đánh giá không nằm trong tỷ lệ này.
        </p>
        <p>
          Thời gian tương tác ước tính: {Math.round(accuracy.seconds / 60)} phút. Không tính thời
          gian mở tab khi không hoạt động.
        </p>
        <h3>Những ngày gần đây</h3>
        <ul>
          {extras.activities.map((a) => (
            <li key={a.localDate}>
              {a.localDate}: {a.lessons} bài, {a.reviews} lượt ôn
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2>Bài đã hoàn thành</h2>
        {extras.progress.map((p) => (
          <p key={p.slug}>
            <Link href={`/bai-hoc/${p.slug}`}>{p.title}</Link> - Lần đầu:{" "}
            {p.firstScore === null ? "Tự đánh giá" : `${p.firstScore}%`} - Tốt nhất:{" "}
            {p.bestScore === null ? "Tự đánh giá" : `${p.bestScore}%`} -{" "}
            {p.passedAt ? "Đã đạt" : "Đã hoàn thành"}
          </p>
        ))}
      </section>
      <section className="panel">
        <h2>Thành tích và lịch học</h2>
        {extras.badges.map((b) => (
          <span key={b.badge} className="badge">
            {BADGES[b.badge] ?? b.badge}
          </span>
        ))}
        <ul>
          {extras.calendar.map((c) => (
            <li key={c.localDate}>
              {c.localDate} - {DAY_STATUS[c.status]}
            </li>
          ))}
        </ul>
        <LearnerForm
          action={saveStreakPreferences}
          fields={{ autoProtect: 1 }}
          label="Bật tự dùng vé nghỉ"
          buttonClass="button secondary"
        />
        <LearnerForm
          action={saveStreakPreferences}
          fields={{ autoProtect: 0 }}
          label="Tắt tự dùng vé nghỉ"
          buttonClass="button secondary"
        />
      </section>
    </FlashProvider>
  );
}

export default function Page(props: PageProps<"/tien-do">) {
  return (
    <SiteShell page="tien-do">
      <LearnerHeading title={TITLE} />
      <Suspense>
        <Progress searchParams={props.searchParams} />
      </Suspense>
    </SiteShell>
  );
}
