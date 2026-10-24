import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { manageReviewCard, removeVocabulary } from "@/actions/routes";
import { userOrLogin } from "@/auth/session";
import { FlashProvider, LearnerForm } from "@/components/learner/flash";
import { NativeAudio } from "@/components/learner/native-audio";
import { LearnerHeading, PrivatePagination } from "@/components/learner/product-nav";
import { WordForm } from "@/components/learner/word-form";
import { SiteShell } from "@/components/site/site-shell";
import { notebook } from "@/domain/review/review";
import { currentActor } from "@/server/actor";
import { learnerProfile, localTime } from "@/site/queries/learner";
import { pageMetadata } from "@/site/seo";

// Port of the 'so-tu-vung' branch of views/product/page.php (shared with tu-vung there).
// Forms keep the URL, so q, filter and page survive a save like PHP's redirect kept them.

const TITLE = "Sổ từ vựng của bạn";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/so-tu-vung", TITLE);
}

const TOPICS: Record<string, string> = {
  greetings: "Chào hỏi",
  daily: "Đời sống",
  work: "Công việc",
  time: "Thời gian",
};
const FILTERS = ["all", "review", "hidden"] as const;
type Filter = (typeof FILTERS)[number];

type Query = Record<string, string | string[] | undefined>;

async function Notebook({ searchParams }: { searchParams: Promise<Query> }) {
  await userOrLogin();
  const query = await searchParams;
  const q = typeof query.q === "string" ? [...query.q].slice(0, 100).join("") : "";
  const filter: Filter = FILTERS.includes(query.filter as Filter)
    ? (query.filter as Filter)
    : "all";
  const actor = await currentActor();
  const [{ words, paging }, profile] = await Promise.all([
    notebook(actor, q, filter, query.page ?? 1),
    learnerProfile(actor),
  ]);
  return (
    <FlashProvider reload="/so-tu-vung">
      <form method="get" className="search-form">
        <label>
          Tìm từ đã lưu
          <input name="q" defaultValue={typeof query.q === "string" ? query.q : ""} />
        </label>
        <label>
          Lọc
          <select name="filter" defaultValue={filter}>
            <option value="all">Tất cả đã lưu</option>
            <option value="review">Đang ôn</option>
            <option value="hidden">Thẻ đã tạm ẩn</option>
          </select>
        </label>
        <button className="button">Tìm</button>
      </form>
      {!words.length ? (
        <p>
          Chưa có từ phù hợp. <Link href="/tu-vung">Khám phá từ vựng công khai</Link>.
        </p>
      ) : null}
      <div className="courses-grid">
        {words.map((v) => (
          <article key={v.id} className="panel">
            <span className="badge">
              <Link href={`/tu-vung/chu-de/${v.topic}`}>{TOPICS[v.topic] ?? v.topic}</Link> -{" "}
              {v.level}
            </span>
            <div className="word-heading">
              <h2>
                <Link href={`/tu-vung/${v.slug}`}>{v.lemma}</Link>
              </h2>
              <span className="badge">{v.level}</span>
            </div>
            <p>
              {v.ipa} - {v.partOfSpeech}
            </p>
            <p>{v.meaning}</p>
            <div className="word-example">
              <p lang="en">“{v.example}”</p>
              <p>{v.translation}</p>
            </div>
            {v.audioId ? <NativeAudio id={v.audioId} /> : null}
            <WordForm
              senseId={v.id}
              notes={v.notes ?? ""}
              review={!!v.card && !v.card.hidden}
              label="Lưu ghi chú"
            />
            <LearnerForm
              action={removeVocabulary}
              fields={{ senseId: v.id }}
              label="Bỏ lưu từ"
              buttonClass="button secondary"
            />
            {v.card ? (
              <>
                <p>
                  Lịch ôn: {localTime(v.card.dueAt, profile.timezone)} - Khoảng ôn{" "}
                  {v.card.intervalDays} ngày
                </p>
                <LearnerForm
                  action={manageReviewCard}
                  fields={{ cardId: v.card.id, action: v.card.hidden ? "show" : "hide" }}
                  label={v.card.hidden ? "Hiện lại thẻ" : "Tạm ẩn thẻ"}
                  buttonClass="button secondary"
                />
                <details>
                  <summary>Đặt lại lịch ôn</summary>
                  <p>Lịch của thẻ này sẽ trở về hiện tại.</p>
                  <LearnerForm
                    action={manageReviewCard}
                    fields={{ cardId: v.card.id, action: "reset", confirm: "yes" }}
                    label="Xác nhận đặt lại"
                    buttonClass="button secondary"
                  />
                </details>
              </>
            ) : null}
          </article>
        ))}
      </div>
      <PrivatePagination
        paging={paging}
        href={(n) => `/so-tu-vung?${new URLSearchParams({ q, filter, page: String(n) })}`}
      />
    </FlashProvider>
  );
}

export default function Page(props: PageProps<"/so-tu-vung">) {
  return (
    <SiteShell page="so-tu-vung">
      <LearnerHeading title={TITLE} />
      <Suspense>
        <Notebook searchParams={props.searchParams} />
      </Suspense>
    </SiteShell>
  );
}
