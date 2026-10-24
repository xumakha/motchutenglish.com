import Link from "next/link";
import type { LegacyCourse, LegacyQuestion } from "@/site/queries/legacy";
import { LegacyBehaviour } from "./behaviour";

// The markup helpers of application/helpers/site_helper.php (audio, quiz, card, overview). The
// DOM hooks (data-audio, data-quiz, data-completed, …) are the ones assets/js/app.js used;
// <LegacyBehaviour> wires them up after hydration.

const pad = (n: number) => String(n).padStart(2, "0");

/** audio(): text-to-speech player. */
export function Audio({ text }: { text: string }) {
  return (
    <div className="audio-player">
      <button className="button" data-audio={text}>
        ▶ Nghe mẫu
      </button>
      <label className="speed">
        Tốc độ{" "}
        <select defaultValue="0.8">
          <option value="0.65">Chậm</option>
          <option value="0.8">Vừa</option>
          <option value="1">Bình thường</option>
        </select>
      </label>
      <span role="status" className="audio-error"></span>
      <small>Giọng đọc dự phòng phụ thuộc thiết bị.</small>
    </div>
  );
}

/** quiz(): one client-graded multiple-choice question that marks local progress. */
export function Quiz({ q, id }: { q: LegacyQuestion; id: string }) {
  return (
    <section
      className="quiz"
      data-quiz=""
      data-id={id}
      data-answer={q.answer}
      data-explanation={q.explanation}
    >
      <h3>{q.prompt}</h3>
      <div className="answers">
        {q.choices.map((choice, i) => (
          <button key={i} className="answer" data-choice={i}>
            <span>{String.fromCharCode(65 + i)}</span>
            {choice}
          </button>
        ))}
      </div>
      <button className="button" data-check="" disabled>
        Kiểm tra đáp án
      </button>
      <div role="status" data-feedback=""></div>
    </section>
  );
}

/** card(): a course card with local progress. */
export function CourseCard({ c }: { c: LegacyCourse }) {
  return (
    <article className={`course-card ${c.id}`} data-filter-item={c.id}>
      <div className="card-top">
        <span className="course-icon">{c.icon}</span>
        <span className="badge">{c.level}</span>
      </div>
      <h3>{c.title}</h3>
      <p>{c.description}</p>
      <div className="course-meta">
        <span>10–15 phút / bài</span>
        <span>{c.lessons.length} bài học</span>
      </div>
      <div className="progress">
        <span data-course-progress={c.id}></span>
      </div>
      <Link className="card-link" href={`/courses/${encodeURIComponent(c.id)}`}>
        Khám phá lộ trình →
      </Link>
    </article>
  );
}

/** overview(): the lesson list of a course and its progress panel. */
export function Overview({ c }: { c: LegacyCourse }) {
  const first = c.lessons[0]!;
  return (
    <div className="learning-layout">
      <div className="lesson-list">
        {c.lessons.map((l, i) => (
          <Link
            key={l.id}
            className="lesson-row"
            href={`/courses/${encodeURIComponent(c.id)}/${encodeURIComponent(l.id)}`}
          >
            <span className="lesson-number" data-completed={`${c.id}/${l.id}`}>
              {pad(i + 1)}
            </span>
            <div>
              <h3>{l.title}</h3>
              <span>Đọc mẫu câu · Luyện nghe · Thực hành</span>
            </div>
            <span className="lesson-time">10–15 phút</span>→
          </Link>
        ))}
      </div>
      <aside className="panel green">
        <span className="eyebrow">LỘ TRÌNH CỦA BẠN</span>
        <h2>
          <span data-course-count={c.id}>0</span>/{c.lessons.length} bài hoàn thành
        </h2>
        <div className="progress">
          <span data-course-progress={c.id}></span>
        </div>
        <p>Mỗi bài học là một bước nhỏ. Hãy học theo thứ tự hoặc chọn chủ đề bạn cần.</p>
        {/* A plain link: the behaviour script points it at the next unfinished lesson. */}
        <a
          className="button"
          data-resume={c.id}
          href={`/courses/${encodeURIComponent(c.id)}/${encodeURIComponent(first.id)}`}
        >
          Tiếp tục học →
        </a>
      </aside>
    </div>
  );
}

/** Every legacy page ends with the app.js behaviour (the PHP footer loaded it on all pages). */
export function LegacyScripts() {
  return <LegacyBehaviour />;
}
