import Link from "next/link";
import { ArrowRight, ArrowUpRight, Headphones } from "lucide-react";
import { CourseCard, AudioPlayer } from "@/components/learning";
import { courses } from "@/lib/courses";
export default function Home() {
  return (
    <div className="container">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="dot" />
            MỘT CHÚT MỖI NGÀY
          </span>
          <h1>
            Tiếng Anh dễ hơn
            <br />
            khi bắt đầu từ
            <br />
            <em>những điều nhỏ.</em>
          </h1>
          <p>
            Không cần giỏi ngay từ đầu. Chỉ cần 15 phút mỗi ngày,
            <br className="desktop" /> bạn sẽ tự tin hơn một chút — cùng chúng
            mình.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/courses">
              Khám phá lộ trình
              <ArrowRight size={17} />
            </Link>
            <Link className="button secondary" href="/placement">
              Kiểm tra trình độ
              <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="hero-proof">
            <div className="avatars">
              <span>👩🏻</span>
              <span>👨🏽</span>
              <span>👩🏼</span>
              <span>👨🏻</span>
            </div>
            <span>Dành cho bạn, dù đang bắt đầu từ đâu.</span>
          </div>
        </div>
        <div className="hero-art">
          <span className="art-star">✳</span>
          <div className="float-label top">🌱 Mỗi ngày, tiến bộ một chút</div>
          <div className="word-card">
            <div className="word-label">
              <span>WORD OF THE DAY</span>
              <span>01 / 30</span>
            </div>
            <h2>little steps</h2>
            <p>/ˈlɪt.əl steps/</p>
            <AudioPlayer compact text="Little steps. Small steps every day." />
            <div className="word-bottom">
              Những bước nhỏ, những thay đổi lớn.
            </div>
          </div>
          <div className="float-label bottom">
            ✨ You can do it! <strong>+1 tự tin</strong>
          </div>
          <span className="art-hello">hello!</span>
        </div>
      </section>
      <div className="home-stats">
        {[
          ["15 phút", "học mỗi ngày"],
          ["3 lộ trình", "cho từng mục tiêu"],
          ["Từ con số 0", "ai cũng bắt đầu được"],
          ["Miễn phí", "toàn bộ bài học hiện có"],
        ].map(([n, l]) => (
          <div key={n}>
            <strong>{n}</strong>
            <span>{l}</span>
          </div>
        ))}
      </div>
      <section className="section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">CHỌN ĐIỂM BẮT ĐẦU CỦA BẠN</span>
            <h2>Một lộ trình phù hợp với bạn.</h2>
            <p>Học đúng điều mình cần, theo nhịp độ của riêng mình.</p>
          </div>
          <Link href="/placement" className="text-link">
            Chưa biết chọn gì?
            <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="courses-grid">
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      </section>
      <section className="home-bottom">
        <div className="panel listening-preview">
          <div className="section-heading">
            <h2>Nghe một chút, quen một chút.</h2>
            <span className="badge">LUYỆN NGHE</span>
          </div>
          <p>Bắt đầu bằng một đoạn hội thoại thật gần gũi.</p>
          <Link className="featured-audio" href="/listening/coffee">
            <span className="audio-emoji">☕</span>
            <div>
              <h3>At the coffee shop</h3>
              <span>A1 · Đời sống · Hội thoại ngắn</span>
            </div>
            <span className="play-bubble">
              <Headphones size={20} />
            </span>
          </Link>
          <Link className="text-link" href="/listening">
            Khám phá thư viện nghe
            <ArrowRight size={15} />
          </Link>
        </div>
        <aside className="panel green daily-tip">
          <span className="eyebrow">💡 MỘT CHÚT NHẮN NHỦ</span>
          <h2>
            Không cần hoàn hảo.
            <br />
            Chỉ cần bắt đầu.
          </h2>
          <p>
            Hôm nay học một từ mới, ngày mai nói một câu ngắn. Mỗi bước nhỏ đều
            có ý nghĩa.
          </p>
          <Link className="text-link" href="/courses/beginner/hello">
            Học bài đầu tiên
            <ArrowRight size={16} />
          </Link>
        </aside>
      </section>
    </div>
  );
}
