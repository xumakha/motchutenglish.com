import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, Suspense } from "react";
import { claimGuest, startLesson } from "@/actions/routes";
import { userOrLogin } from "@/auth/session";
import { FlashProvider, LearnerForm } from "@/components/learner/flash";
import { LearnerHeading } from "@/components/learner/product-nav";
import { SiteShell } from "@/components/site/site-shell";
import { randomHex } from "@/domain/php";
import { currentActor } from "@/server/actor";
import { today } from "@/site/queries/learner";
import { pageMetadata } from "@/site/seo";

// Port of the 'hoc' branch of views/product/page.php.

const TITLE = "Hôm nay học một chút";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/hoc", TITLE);
}

const QUEST_LABELS: Record<string, string> = {
  lesson: "Hoàn thành bài học",
  practice: "Hoàn thành bài luyện khả dụng",
  review: "Ôn thẻ đến hạn",
  correct: "Trả lời đúng lần đầu các câu khác nhau",
};

async function Today() {
  await userOrLogin();
  const actor = await currentActor();
  const d = await today(actor);
  const { profile, next } = d;
  return (
    <FlashProvider reload="/hoc">
      {!profile.onboardingAt ? (
        <section className="panel">
          <h2>Bạn muốn học theo nhịp nào?</h2>
          <p>Chọn mục tiêu khi thuận tiện, hoặc bắt đầu học ngay.</p>
          <Link href="/bat-dau" className="button secondary">
            Chọn mục tiêu
          </Link>
        </section>
      ) : null}
      <div className="stats-grid">
        <section className="panel">
          <h2>{d.due} thẻ đến hạn</h2>
          <Link className="button" href="/on-tap">
            Ôn tập ngay
          </Link>
        </section>
        <section className="panel">
          <h2>Mục tiêu {profile.minutes} phút/ngày</h2>
          <p>
            Hôm nay: {Math.floor(d.todaySeconds / 60)} phút tương tác ước tính. Học một chút đều
            đặn, không cần vội.
          </p>
        </section>
        {profile.gamification ? (
          <section className="panel">
            <h2>{d.streak?.currentStreak ?? 0} ngày trong chuỗi</h2>
            <p title="Ngày có ít nhất một bài hoàn thành hoặc một lượt ôn đến hạn.">
              Chuỗi tính theo ngày có hoạt động học. Vé nghỉ: {d.streak?.tickets ?? 0}/2.
            </p>
            {d.balances.map((b) => (
              <p key={b.currency}>
                {b.amount} {b.currency === "xp" ? "XP" : "xu học tập"}
                {b.currency === "xp" ? ` - Cấp hoạt động ${1 + Math.floor(b.amount / 200)}` : null}
              </p>
            ))}
            <Link href="/reward-shop">Góc trang trí</Link>
          </section>
        ) : null}
      </div>
      {d.active.length ? (
        <section className="panel">
          <h2>Tiếp tục bài đang học</h2>
          {d.active.map((a) => (
            <p key={a.id}>
              <Link className="button" href={`/hoc/luot/${a.id}`}>
                {a.title}
              </Link>
            </p>
          ))}
        </section>
      ) : null}
      {d.guestImports.length ? (
        <section className="panel">
          <h2>Lưu bài học thử?</h2>
          <p>
            Chỉ chuyển khi bạn xác nhận đây là bài mình vừa học trên thiết bị này. Hệ thống dùng kết
            quả đã chấm trên máy chủ.
          </p>
          {d.guestImports.map((g) => (
            <LearnerForm
              key={g.id}
              action={claimGuest}
              fields={{ attemptId: g.id }}
              label={`Lưu ${g.title}`}
            />
          ))}
        </section>
      ) : null}
      <section className="panel green">
        <h2>Bước tiếp theo của bạn</h2>
        {next ? (
          <>
            <h3>{next.title}</h3>
            <p>{next.document.objectives}</p>
            <LearnerForm
              action={startLesson}
              fields={{ lessonId: next.id, requestKey: randomHex(16) }}
              label="Bắt đầu học"
            />
          </>
        ) : (
          <>
            <p>
              {d.lessonCount
                ? "Bạn đã hoàn thành các bài hiện có. Hãy ôn lại những điều vừa học."
                : "Chưa có bài đã xuất bản trong hệ thống mới."}
            </p>
            <Link className="button" href={d.lessonCount ? "/on-tap" : "/lo-trinh"}>
              {d.lessonCount ? "Ôn tập" : "Xem lộ trình"}
            </Link>
          </>
        )}
      </section>
      {profile.gamification && d.quests.length ? (
        <section className="panel">
          <h2>Nhiệm vụ hôm nay</h2>
          <ul>
            {d.quests.map((q) => (
              <li key={q.template}>
                {QUEST_LABELS[q.template] ?? q.template}: {q.progress}/{q.target}{" "}
                {q.rewarded ? " - Đã nhận 5 xu" : ""}
              </li>
            ))}
          </ul>
          <p>Hoàn thành cả bộ nhận thêm 5 xu. Xu chỉ dùng cho trang trí.</p>
        </section>
      ) : null}
      {d.legacy.length ? (
        <details className="panel">
          <summary>Bài học từ hệ thống trước</summary>
          <p>
            <Link href="/dashboard">Tiến độ học thử cũ trên thiết bị</Link>
          </p>
          {d.legacyHistory.map((h) => (
            <p key={h.id}>
              <Link href={`/ket-qua/${h.id}`}>
                {h.title} - {h.submittedAt === null ? "Tiếp tục học" : "Xem kết quả đã lưu"}
              </Link>
            </p>
          ))}
          <p>Các bài này được giữ lại cùng kết quả cũ.</p>
          {d.legacy.map((old) => (
            // PHP nested the form in a <p>, which browsers split; this keeps the rendered DOM.
            <Fragment key={old.id}>
              <p>{old.title} </p>
              <form method="post" action={`/hoc/bai/${old.id}`}>
                <input type="hidden" name="request_key" value={randomHex(16)} />
                <button className="button secondary">Học bài này</button>
              </form>
              <p></p>
            </Fragment>
          ))}
        </details>
      ) : null}
    </FlashProvider>
  );
}

export default function Page() {
  return (
    <SiteShell page="hoc">
      <LearnerHeading title={TITLE} />
      <Suspense>
        <Today />
      </Suspense>
    </SiteShell>
  );
}
