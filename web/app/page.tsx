import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteShell } from "@/components/site/site-shell";
import { publicLessons, publicPaths } from "@/site/catalog";
import { pageMetadata } from "@/site/seo";
import { currentSiteSettings } from "@/site/settings";

// Port of views/home/product.php.

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("/", "Học một chút, tiến bộ mỗi ngày");
}

const LOOP: [string, string, string][] = [
  ["◎", "Chọn mục tiêu", "Nền tảng hay giao tiếp — chọn lộ trình hợp với bạn."],
  ["▤", "Học & thử sức", "Bài ngắn, bài tập có giải thích ngay sau khi làm."],
  ["↻", "Ôn đúng lúc", "Lưu từ cần nhớ và quay lại ôn theo lịch."],
];

async function samples() {
  return (await publicLessons()).filter((l) => l.document.preview).slice(0, 2);
}

async function Hero() {
  const [site, sample] = await Promise.all([currentSiteSettings(), samples()]);
  return (
    <section className="design-hero">
      <div className="design-section-inner">
        <div className="design-hero-copy">
          <span className="design-eyebrow">✦ Cho người Việt mới bắt đầu</span>
          <h1>
            Hôm nay <span className="blue">một chút.</span>
            <br />
            Ngày mai <span className="underline">tự tin hơn.</span>
          </h1>
          <p>
            Bài học ngắn 5–15 phút, bài tập có giải thích tiếng Việt và lịch ôn giúp từ cũ quay lại
            đúng lúc. Không giới hạn lượt sai, không tim, không năng lượng.
          </p>
          <div className="design-actions">
            <Link className="button" href="/lo-trinh">
              Chọn điểm bắt đầu →
            </Link>
            <Link
              className="button secondary"
              href={sample[0] ? `/bai-hoc/${sample[0].slug}` : "/courses/beginner/hello"}
            >
              Học thử, không cần đăng ký
            </Link>
          </div>
        </div>
        <div className="design-mascot">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo may be an uploaded /media file */}
          <img src={site.logo} width={250} height={250} alt="Nhân vật Một Chút English" />
          <div className="design-word-card">
            <span className="eyebrow">WORD CARD</span>
            <h2>
              Little steps.
              <br />
              Every day.
            </h2>
            <p>Từng bước nhỏ. Mỗi ngày.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

async function Paths() {
  const paths = await publicPaths();
  return (
    <>
      <div className="design-path-grid">
        {paths.map((p) => (
          <Link key={p.id} className="design-path-card" href={`/lo-trinh/${p.slug}`}>
            <div className="design-path-top">
              <span>{p.level}</span>
              <h3>{p.title}</h3>
            </div>
            <div className="design-path-body">
              <p>{p.description}</p>
              <div className="design-path-bottom">
                <span>{p.lessonCount} bài đã xuất bản</span>
                <strong>Khám phá →</strong>
              </div>
            </div>
          </Link>
        ))}
      </div>
      {!paths.length ? (
        <p>
          Lộ trình mới đang được biên tập. Bạn có thể{" "}
          <Link href="/courses">học thử nội dung hiện có</Link>.
        </p>
      ) : null}
    </>
  );
}

async function Samples() {
  return (
    <div className="design-samples">
      {(await samples()).map((l) => (
        <Link key={l.id} className="panel design-sample" href={`/bai-hoc/${l.slug}`}>
          <span className="design-sample-time">{l.document.minutes}′</span>
          <div>
            <p>{l.pathTitle}</p>
            <h3>{l.title}</h3>
            <p>
              {l.document.exercises.length} câu · {l.document.objectives}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <SiteShell page="home">
      <Suspense>
        <Hero />
      </Suspense>
      <section className="design-section-inner">
        <h2 className="design-loop-title">Vòng học 3 bước</h2>
        <div className="design-loop-grid">
          {LOOP.map(([icon, name, copy], i) => (
            <article key={name} className="panel">
              <div className="design-step-top">
                <span className="design-step-icon" aria-hidden="true">
                  {icon}
                </span>
                <span className="design-step-num">0{i + 1}</span>
              </div>
              <h3>{name}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="design-path-section">
        <div className="design-section-inner">
          <div className="design-section-heading">
            <h2>Lộ trình đang có</h2>
            <Link className="text-link" href="/lo-trinh">
              Xem tất cả →
            </Link>
          </div>
          <Suspense>
            <Paths />
          </Suspense>
          <p className="small" style={{ marginTop: 24 }}>
            Các lộ trình có nội dung mẫu thật để trải nghiệm, chưa phải khóa học toàn diện.
          </p>
        </div>
      </section>
      <section className="design-section-inner">
        <div className="design-section-heading">
          <div>
            <h2>Thử ngay một bài</h2>
            <p>Không cần tài khoản. Muốn lưu tiến độ thì đăng nhập sau.</p>
          </div>
        </div>
        <Suspense>
          <Samples />
        </Suspense>
      </section>
      <section className="design-section-inner" style={{ paddingTop: 0, paddingBottom: 0 }}>
        <div className="panel design-xp">
          <strong aria-hidden="true">XP</strong>
          <div>
            <h2>Ghi nhận sự chăm chỉ, không phải trình độ</h2>
            <p>
              XP và streak khích lệ bạn quay lại mỗi ngày. Chúng không thay cho chứng chỉ CEFR hay
              điểm TOEIC — và không bao giờ khóa quyền học của bạn.
            </p>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
