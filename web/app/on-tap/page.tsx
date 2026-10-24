import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { manageReviewCard } from "@/actions/routes";
import { userOrLogin } from "@/auth/session";
import { FlashProvider, LearnerForm } from "@/components/learner/flash";
import { LearnerHeading, PrivatePagination } from "@/components/learner/product-nav";
import { ReviewCards } from "@/components/learner/review-cards";
import { SiteShell } from "@/components/site/site-shell";
import { randomHex } from "@/domain/php";
import { reviewQueue } from "@/domain/review/review";
import { currentActor } from "@/server/actor";
import { pageMetadata } from "@/site/seo";

// Port of the 'on-tap' branch of views/product/page.php: the due queue (or "Ôn thêm" with
// ?more) and the paged manage view (?manage). Forms keep the query, so PHP's redirect back to
// on-tap?manage&more&page happens by staying on the same URL.

const TITLE = "Ôn lại một chút";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/on-tap", TITLE);
}

type Query = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Review({ searchParams }: { searchParams: Promise<Query> }) {
  await userOrLogin();
  const query = await searchParams;
  const manage = query.manage !== undefined;
  const extra = query.more !== undefined;
  const queue = await reviewQueue(await currentActor(), {
    manage,
    extra,
    page: one(query.page) ?? 1,
  });
  const reload = `/on-tap${manage ? "?manage=1" : extra ? "?more=1" : ""}` as const;
  return (
    <FlashProvider reload={reload as "/on-tap"}>
      <p>
        <Link href="/on-tap">Ôn đến hạn</Link> -{" "}
        <Link href="/on-tap?manage=1">Quản lý tất cả thẻ</Link>
      </p>
      {manage ? (
        <>
          {queue.cards.map((c) => {
            const hidden = "hidden" in c ? c.hidden : 0;
            return (
              <article key={c.id} className="panel">
                <h2>{c.snapshot.front}</h2>
                <p>
                  {hidden === 2 ? "Đã bỏ khỏi lịch ôn" : hidden ? "Tạm ẩn" : "Đang ôn"} - Khoảng ôn{" "}
                  {"intervalDays" in c ? c.intervalDays : 0} ngày
                </p>
                <LearnerForm
                  action={manageReviewCard}
                  fields={{ cardId: c.id, action: hidden ? "show" : "hide" }}
                  label={hidden ? "Hiện lại thẻ" : "Tạm ẩn"}
                  buttonClass="button secondary"
                />
                <details>
                  <summary>Đặt lại lịch hoặc bỏ thẻ</summary>
                  <p>
                    Đặt lại lịch đưa thẻ về hiện tại. Bỏ thẻ chỉ đưa khỏi hàng đợi; không xóa từ gốc
                    hoặc lịch sử.
                  </p>
                  <LearnerForm
                    action={manageReviewCard}
                    fields={{ cardId: c.id, action: "reset", confirm: "yes" }}
                    label="Xác nhận đặt lại lịch"
                    buttonClass="button secondary"
                  />
                  <LearnerForm
                    action={manageReviewCard}
                    fields={{ cardId: c.id, action: "remove", confirm: "yes" }}
                    label="Xác nhận bỏ khỏi lịch ôn"
                    buttonClass="button secondary"
                  />
                </details>
              </article>
            );
          })}
          {queue.paging ? (
            <PrivatePagination paging={queue.paging} href={(n) => `/on-tap?manage=1&page=${n}`} />
          ) : null}
        </>
      ) : (
        <>
          <p>
            Đã ôn {queue.used}/{queue.profile.reviewLimit} lượt hôm nay. Thẻ dùng nội dung tại thời
            điểm thêm vào ôn.
          </p>
          <p>
            Ôn các thẻ đến hạn, ưu tiên thẻ quá hạn trước. Mỗi lịch ngày tương ứng 24 giờ từ thời
            điểm đánh giá.
          </p>
          <ReviewCards
            extra={extra}
            cards={queue.cards.map((c) => ({
              id: c.id,
              revision: c.revision,
              requestKey: randomHex(16),
              front: c.snapshot.front,
              back: c.snapshot.back,
              ipa: c.snapshot.ipa ?? "",
              partOfSpeech: c.snapshot.partOfSpeech ?? "",
              audioId:
                Number.isInteger(c.snapshot.audioId) && Number(c.snapshot.audioId) >= 1
                  ? Number(c.snapshot.audioId)
                  : null,
              example: c.snapshot.example ?? "",
              translation: c.snapshot.translation ?? "",
            }))}
          >
            {!queue.cards.length ? (
              <section className="panel green">
                <h2>
                  {queue.used >= queue.profile.reviewLimit
                    ? "Bạn đã đạt mục tiêu ôn hôm nay"
                    : "Đã hết thẻ đến hạn trong lượt này"}
                </h2>
                <p>Bạn có thể học bài mới hoặc quay lại khi đến lịch ôn.</p>
                <Link className="button" href="/hoc">
                  Về hôm nay
                </Link>
              </section>
            ) : null}
          </ReviewCards>
          <p>
            <Link href="/on-tap?more=1">Tự nguyện ôn thêm thẻ đến hạn</Link>
          </p>
        </>
      )}
    </FlashProvider>
  );
}

export default function Page(props: PageProps<"/on-tap">) {
  return (
    <SiteShell page="on-tap">
      <LearnerHeading title={TITLE} />
      <Suspense>
        <Review searchParams={props.searchParams} />
      </Suspense>
    </SiteShell>
  );
}
