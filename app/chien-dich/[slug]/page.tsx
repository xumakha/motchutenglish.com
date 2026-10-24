import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CampaignConsentForm, RecordLanding } from "@/components/public/client";
import { PageHeading } from "@/components/site/page-heading";
import { SiteShell } from "@/components/site/site-shell";
import { labels, noMarketing } from "@/domain/analytics/marketing";
import { currentActor } from "@/server/actor";
import { publicLessons, publicPaths } from "@/site/catalog";
import { userAnalyticsConsent } from "@/site/queries/public";
import { pageMetadata } from "@/site/seo";

// Port of the chien-dich branch of views/product/page.php + campaign-consent.php. The landing
// is recorded only with consent (MarketingAnalytics::landing checks it).

type Props = PageProps<"/chien-dich/[slug]">;

const utmOnly = (query: Record<string, string | string[] | undefined>) =>
  Object.fromEntries(
    Object.entries(query).filter(
      (e): e is [string, string] => e[0].startsWith("utm_") && typeof e[1] === "string",
    ),
  );

async function findCampaign(slug: string) {
  const path = (await publicPaths()).find((p) => p.slug === slug);
  const [first] = path ? await publicLessons(path.id) : [];
  return path && first ? { path, first } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = await findCampaign(slug);
  if (!found) notFound();
  return pageMetadata(`/chien-dich/${slug}`, found.path.title, found.path.description);
}

async function Content({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const found = await findCampaign(slug);
  if (!found) notFound();
  const { path, first } = found;
  const actor = await currentActor();
  const session = actor.marketing ?? noMarketing;
  const tracking =
    actor.userId !== null ? await userAnalyticsConsent(actor.userId) : session.consent;
  return (
    <>
      {/* Pages cannot set cookies; this records the landing (with consent) from a Server Action. */}
      <RecordLanding slug={slug} query={utmOnly(query)} />
      <PageHeading title={path.title} description="Mỗi bước nhỏ đều được ghi nhận." />
      <section className="panel">
        <p>{path.description}</p>
        <p>{path.objectives}</p>
        <Link className="button" href={`/bai-hoc/${first.slug}`}>
          Học bài đầu tiên
        </Link>{" "}
        <Link href={`/lo-trinh/${path.slug}`}>Xem cả lộ trình</Link>
      </section>
      <section className="panel">
        <h2>Đo lường chiến dịch — tùy chọn</h2>
        <p>
          Nếu bạn đồng ý, chúng tôi ghi nhận hành trình từ trang chiến dịch → học thử → đăng ký →
          hoàn thành bài → quay lại học. Khi bạn tạo tài khoản mới trong phiên này, lựa chọn đồng ý
          được lưu cùng tài khoản. Không lưu email, đáp án, ghi chú hoặc UTM tùy ý trong hành trình
          này. Analytics ngoài chỉ gửi khi đã được cấu hình.
        </p>
        <p>
          Bạn vẫn có thể học khi từ chối. Có thể rút lại tại đây hoặc trong Tài khoản.{" "}
          <Link href="/bao-mat">Quyền riêng tư</Link>.
        </p>
        <p>Hiện tại: {tracking ? "Đã đồng ý" : "Chưa đồng ý"}.</p>
        <CampaignConsentForm campaignSlug={path.slug} labels={labels(query, slug)} />
      </section>
    </>
  );
}

export default function Page(props: Props) {
  return (
    <SiteShell page="chien-dich">
      <Suspense>
        <Content {...props} />
      </Suspense>
    </SiteShell>
  );
}
