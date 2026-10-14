"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock,
  Headphones,
  Play,
  RotateCcw,
  Square,
  BookOpen,
  Trophy,
} from "lucide-react";
import {
  courses,
  listening,
  placementQuestions,
  type Course,
  type Question,
} from "@/lib/courses";
type Progress = { completed: string[]; activity: string[] };
const empty: Progress = { completed: [], activity: [] };
function load(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem("mce-progress") || "null");
    return p &&
      Array.isArray(p.completed) &&
      p.completed.every((v: unknown) => typeof v === "string") &&
      Array.isArray(p.activity) &&
      p.activity.every((v: unknown) => typeof v === "string")
      ? p
      : empty;
  } catch {
    return empty;
  }
}
function mark(id: string) {
  const p = load();
  const day = new Date().toLocaleDateString("en-CA");
  localStorage.setItem(
    "mce-progress",
    JSON.stringify({
      completed: [...new Set([...p.completed, id])],
      activity: [...new Set([...p.activity, day])],
    }),
  );
  window.dispatchEvent(new Event("learning-progress"));
}
function useProgress() {
  const [p, setP] = useState<Progress>(empty);
  useEffect(() => {
    const sync = () => setP(load());
    sync();
    window.addEventListener("learning-progress", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("learning-progress", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return p;
}
export function AudioPlayer({
  text,
  compact = false,
}: {
  text: string;
  compact?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [rate, setRate] = useState(0.8);
  useEffect(
    () => () => {
      if ("speechSynthesis" in window) speechSynthesis.cancel();
    },
    [],
  );
  function play() {
    if (!("speechSynthesis" in window)) {
      setError(
        "Trình duyệt chưa hỗ trợ giọng đọc. Hãy xem bản hội thoại bên dưới.",
      );
      return;
    }
    if (playing) {
      speechSynthesis.cancel();
      setPlaying(false);
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = rate;
    const voice = speechSynthesis.getVoices().find((v) => v.lang === "en-US");
    if (voice) u.voice = voice;
    u.onend = () => setPlaying(false);
    u.onerror = () => {
      setPlaying(false);
      setError(
        "Không phát được giọng đọc. Hãy thử lại hoặc đọc bản hội thoại.",
      );
    };
    setError("");
    setPlaying(true);
    speechSynthesis.speak(u);
  }
  return (
    <div className={compact ? "audio-player compact" : "audio-player"}>
      <button
        className="button"
        onClick={play}
        aria-label={playing ? "Dừng nghe" : "Phát giọng đọc"}
      >
        {playing ? <Square size={16} /> : <Play size={16} />}{" "}
        {!compact && (playing ? "Dừng nghe" : "Nghe mẫu")}
      </button>
      {!compact && (
        <>
          <div className={`wave ${playing ? "playing" : ""}`}>
            {Array.from({ length: 25 }, (_, i) => (
              <i key={i} style={{ height: 8 + ((i * 13) % 30) }} />
            ))}
          </div>
          <label className="speed">
            Tốc độ{" "}
            <select
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
            >
              <option value={0.65}>Chậm</option>
              <option value={0.8}>Vừa</option>
              <option value={1}>Bình thường</option>
            </select>
          </label>
        </>
      )}
      <span role="status" className="audio-error">
        {error}
      </span>
    </div>
  );
}
export function CourseCard({ course }: { course: Course }) {
  const p = useProgress();
  const done = course.lessons.filter((l) =>
    p.completed.includes(`${course.id}/${l.id}`),
  ).length;
  return (
    <article className={`course-card ${course.id}`}>
      <div className="card-top">
        <span className="course-icon">{course.icon}</span>
        <span className="badge">{course.level}</span>
      </div>
      <h3>{course.title}</h3>
      <p>{course.description}</p>
      <div className="course-meta">
        <span>
          <Clock size={13} />
          10–15 phút / bài
        </span>
        <span>
          <BookOpen size={13} />
          {course.lessons.length} bài học
        </span>
      </div>
      {done > 0 && (
        <div className="progress">
          <span style={{ width: `${(done / course.lessons.length) * 100}%` }} />
        </div>
      )}
      <Link className="card-link" href={`/courses/${course.id}`}>
        {done ? "Tiếp tục học" : "Khám phá lộ trình"}
        <ArrowRight size={16} />
      </Link>
    </article>
  );
}
export function CourseList() {
  const [filter, setFilter] = useState("all");
  return (
    <>
      <div className="tabs">
        {[
          ["all", "Tất cả"],
          ["beginner", "Người mới"],
          ["work", "Người đi làm"],
          ["toeic", "TOEIC"],
        ].map(([id, label]) => (
          <button
            className={filter === id ? "selected" : ""}
            onClick={() => setFilter(id)}
            key={id}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="courses-grid">
        {courses
          .filter((c) => filter === "all" || c.id === filter)
          .map((c) => (
            <CourseCard course={c} key={c.id} />
          ))}
      </div>
    </>
  );
}
export function CourseOverview({ course }: { course: Course }) {
  const p = useProgress();
  const done = course.lessons.filter((l) =>
    p.completed.includes(`${course.id}/${l.id}`),
  ).length;
  return (
    <div className="learning-layout">
      <div>
        <div className="lesson-list">
          {course.lessons.map((l, i) => {
            const finished = p.completed.includes(`${course.id}/${l.id}`);
            return (
              <Link
                className="lesson-row"
                href={`/courses/${course.id}/${l.id}`}
                key={l.id}
              >
                <span
                  className={
                    finished ? "lesson-number finished" : "lesson-number"
                  }
                >
                  {finished ? (
                    <Check size={20} />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                <div>
                  <h3>{l.title}</h3>
                  <span>Đọc mẫu câu · Luyện nghe · Thực hành</span>
                </div>
                <span className="lesson-time">10–15 phút</span>
                <ArrowRight size={19} />
              </Link>
            );
          })}
        </div>
      </div>
      <aside className="panel green">
        <span className="eyebrow">LỘ TRÌNH CỦA BẠN</span>
        <h2>
          {done}/{course.lessons.length} bài hoàn thành
        </h2>
        <div className="progress">
          <span style={{ width: `${(done / course.lessons.length) * 100}%` }} />
        </div>
        <p>
          Mỗi bài học là một bước nhỏ. Hãy học theo thứ tự hoặc chọn chủ đề bạn
          cần.
        </p>
        <Link
          className="button"
          href={`/courses/${course.id}/${course.lessons.find((l) => !p.completed.includes(`${course.id}/${l.id}`))?.id || course.lessons[0].id}`}
        >
          {done === course.lessons.length ? "Ôn tập" : "Tiếp tục học"}
          <ArrowRight size={16} />
        </Link>
      </aside>
    </div>
  );
}
export function Quiz({
  question,
  onComplete,
}: {
  question: Question;
  onComplete?: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const correct = selected === question.answer;
  return (
    <div className="quiz">
      <h3>{question.prompt}</h3>
      <div className="answers">
        {question.choices.map((c, i) => (
          <button
            key={c}
            disabled={submitted && correct}
            className={`answer ${selected === i ? "chosen" : ""} ${submitted && selected === i ? (correct ? "correct" : "incorrect") : ""}`}
            onClick={() => {
              setSelected(i);
              setSubmitted(false);
            }}
          >
            <span>{String.fromCharCode(65 + i)}</span>
            {c}
            {submitted && correct && selected === i && <Check size={18} />}
          </button>
        ))}
      </div>
      <button
        className="button"
        disabled={selected === null || (submitted && correct)}
        onClick={() => {
          setSubmitted(true);
          if (correct) onComplete?.();
        }}
      >
        Kiểm tra đáp án
      </button>
      {submitted && (
        <div
          role="status"
          className={`feedback ${correct ? "success" : "retry"}`}
        >
          <strong>
            {correct ? "Chính xác! Làm tốt lắm." : "Chưa đúng, thử lại nhé."}
          </strong>
          <p>
            {correct
              ? question.explanation
              : "Đọc lại nội dung và chọn một đáp án khác."}
          </p>
        </div>
      )}
    </div>
  );
}
export function LessonView({
  course,
  lessonId,
}: {
  course: Course;
  lessonId: string;
}) {
  const index = course.lessons.findIndex((l) => l.id === lessonId);
  const lesson = course.lessons[index];
  const p = useProgress();
  const [storageError, setStorageError] = useState("");
  const completed = p.completed.includes(`${course.id}/${lesson.id}`);
  return (
    <div className="learning-layout">
      <article className="panel lesson-content">
        <span className="eyebrow">BƯỚC 1 · LÀM QUEN</span>
        <h2>Mẫu câu hôm nay</h2>
        <div className="sample">
          <p>{lesson.text}</p>
          <span>{lesson.translation}</span>
        </div>
        <AudioPlayer text={lesson.text} />
        <h3>Từ vựng cần nhớ</h3>
        <div className="vocab">
          {lesson.vocabulary.map((v) => (
            <div key={v}>{v}</div>
          ))}
        </div>
        <div className="divider" />
        <span className="eyebrow">BƯỚC 2 · THỬ SỨC</span>
        <Quiz
          question={lesson.question}
          onComplete={() => {
            try {
              mark(`${course.id}/${lesson.id}`);
            } catch {
              setStorageError(
                "Trình duyệt không cho phép lưu tiến độ. Bạn vẫn có thể tiếp tục học.",
              );
            }
          }}
        />
        <p role="status">{storageError}</p>
        {completed && (
          <div className="completion">
            <Check size={20} />
            <span>Bài học đã hoàn thành</span>
            <Link
              className="button"
              href={
                index + 1 < course.lessons.length
                  ? `/courses/${course.id}/${course.lessons[index + 1].id}`
                  : `/courses/${course.id}`
              }
            >
              {index + 1 < course.lessons.length
                ? "Bài tiếp theo"
                : "Về lộ trình"}
              <ArrowRight size={16} />
            </Link>
          </div>
        )}
      </article>
      <aside className="panel">
        <span className="eyebrow">{course.title}</span>
        <h3>Nội dung lộ trình</h3>
        <div className="side-lessons">
          {course.lessons.map((l, i) => (
            <Link
              href={`/courses/${course.id}/${l.id}`}
              className={l.id === lessonId ? "current" : ""}
              key={l.id}
            >
              <span>
                {p.completed.includes(`${course.id}/${l.id}`) ? "✓" : i + 1}
              </span>
              {l.title}
            </Link>
          ))}
        </div>
        <div className="note">
          💡 Đọc to mẫu câu, nghe lại và thử nói mà không nhìn nội dung.
        </div>
      </aside>
    </div>
  );
}
export function ListeningLibrary() {
  const [filter, setFilter] = useState("Tất cả");
  return (
    <>
      <div className="tabs">
        {["Tất cả", "Đời sống", "Công sở", "Du lịch"].map((t) => (
          <button
            key={t}
            className={filter === t ? "selected" : ""}
            onClick={() => setFilter(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="courses-grid">
        {listening
          .filter((l) => filter === "Tất cả" || l.topic === filter)
          .map((l) => (
            <Link
              href={`/listening/${l.id}`}
              className="listening-card panel"
              key={l.id}
            >
              <div className="listening-art">
                <span>{l.icon}</span>
                <span className="play-bubble">
                  <Play size={22} />
                </span>
              </div>
              <span className="badge">
                {l.level} · {l.topic}
              </span>
              <h3>{l.title}</h3>
              <p>Hội thoại ngắn · Giọng đọc tự động</p>
              <span className="text-link">
                Bắt đầu nghe <ArrowRight size={15} />
              </span>
            </Link>
          ))}
      </div>
    </>
  );
}
export function ListeningExercise({ id }: { id: string }) {
  const item = listening.find((l) => l.id === id)!;
  const [error, setError] = useState("");
  return (
    <article className="panel narrow">
      <span className="eyebrow">NGHE & THỰC HÀNH</span>
      <h2>Nghe một lần, hiểu một chút.</h2>
      <p>
        Nghe đoạn hội thoại và trả lời câu hỏi. Có thể giảm tốc độ hoặc xem nội
        dung nếu cần.
      </p>
      <AudioPlayer text={item.text} />
      <Quiz
        question={item.question}
        onComplete={() => {
          try {
            mark(`listening/${id}`);
          } catch {
            setError("Không thể lưu tiến độ trên trình duyệt này.");
          }
        }}
      />
      <p role="status">{error}</p>
      <details className="transcript">
        <summary>Xem hội thoại và nghĩa</summary>
        <p>{item.text}</p>
        <p>{item.translation}</p>
      </details>
      <p className="muted small">
        Âm thanh dùng giọng đọc của trình duyệt, không phải bản thu người thật.
      </p>
    </article>
  );
}
export function PlacementTest() {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [choice, setChoice] = useState<number | null>(null);
  const done = index === placementQuestions.length;
  const score = answers.filter(
    (a, i) => a === placementQuestions[i].answer,
  ).length;
  const recommended =
    score < 3 ? courses[0] : score < 5 ? courses[1] : courses[2];
  function reset() {
    setIndex(0);
    setAnswers([]);
    setChoice(null);
  }
  return (
    <section className="panel narrow placement">
      {done ? (
        <>
          <span className="result-icon">
            <Trophy size={34} />
          </span>
          <span className="eyebrow">ĐIỂM BẮT ĐẦU CỦA BẠN</span>
          <h2>
            Bạn trả lời đúng {score}/{placementQuestions.length} câu
          </h2>
          <p>
            Gợi ý cho bạn: <strong>{recommended.title}</strong>. Bạn có thể chọn
            lộ trình khác theo mục tiêu của mình.
          </p>
          <div className="note">
            Bài kiểm tra ngắn dùng để gợi ý nội dung học, không đánh giá CEFR
            hay dự đoán điểm TOEIC.
          </div>
          <Link className="button" href={`/courses/${recommended.id}`}>
            Khám phá lớp phù hợp
            <ArrowRight size={16} />
          </Link>
          <button className="text-link" onClick={reset}>
            <RotateCcw size={15} /> Làm lại
          </button>
          <details className="transcript">
            <summary>Xem đáp án và giải thích</summary>
            {placementQuestions.map((q, i) => (
              <div key={q.prompt}>
                <h4>
                  {i + 1}. {q.prompt}
                </h4>
                <p>
                  {answers[i] === q.answer ? "✓" : "✕"} Đáp án:{" "}
                  {q.choices[q.answer]} — {q.explanation}
                </p>
              </div>
            ))}
          </details>
        </>
      ) : (
        <>
          <span className="eyebrow">
            KIỂM TRA NHANH · {index + 1}/{placementQuestions.length}
          </span>
          <div className="progress">
            <span
              style={{ width: `${(index / placementQuestions.length) * 100}%` }}
            />
          </div>
          <h2>{placementQuestions[index].prompt}</h2>
          <p>Chọn đáp án bạn thấy phù hợp. Không cần áp lực nhé.</p>
          <div className="answers">
            {placementQuestions[index].choices.map((c, i) => (
              <button
                className={`answer ${choice === i ? "chosen" : ""}`}
                onClick={() => setChoice(i)}
                key={c}
              >
                <span>{String.fromCharCode(65 + i)}</span>
                {c}
              </button>
            ))}
          </div>
          <button
            className="button"
            disabled={choice === null}
            onClick={() => {
              if (choice === null) return;
              setAnswers([...answers, choice]);
              setIndex(index + 1);
              setChoice(null);
            }}
          >
            {index === placementQuestions.length - 1
              ? "Xem kết quả"
              : "Câu tiếp theo"}
            <ArrowRight size={16} />
          </button>
        </>
      )}
    </section>
  );
}
export function Dashboard() {
  const p = useProgress();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const count = courses.reduce(
    (s, c) =>
      s +
      c.lessons.filter((l) => p.completed.includes(`${c.id}/${l.id}`)).length,
    0,
  );
  return (
    <>
      <div className="dashboard-stats">
        {[
          [count, "bài học hoàn thành"],
          [
            p.completed.filter((id) => id.startsWith("listening/")).length,
            "bài nghe hoàn thành",
          ],
          [p.activity.length, "ngày đã học"],
        ].map(([n, label]) => (
          <div className="panel" key={label}>
            <strong>{n}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="section-heading">
        <div>
          <span className="eyebrow">TIẾP TỤC HÀNH TRÌNH</span>
          <h2>Lộ trình của bạn</h2>
        </div>
        <span className="badge">Lưu trên trình duyệt này</span>
      </div>
      <div className="courses-grid">
        {courses.map((c) => (
          <CourseCard key={c.id} course={c} />
        ))}
      </div>
      <div className="panel dashboard-note">
        <div>
          <h3>15 phút hôm nay, thêm một chút tự tin.</h3>
          <p>Tiến độ được lưu cục bộ, chưa đồng bộ giữa các thiết bị.</p>
        </div>
        <Link className="button" href="/listening">
          <Headphones size={16} /> Luyện nghe hôm nay
        </Link>
      </div>
      <div className="reset-area">
        {confirm ? (
          <>
            <span>Xóa toàn bộ tiến độ trên trình duyệt này?</span>
            <button
              className="button danger"
              onClick={() => {
                try {
                  localStorage.removeItem("mce-progress");
                  window.dispatchEvent(new Event("learning-progress"));
                  setConfirm(false);
                } catch {
                  setError("Không thể xóa dữ liệu.");
                }
              }}
            >
              Xóa tiến độ
            </button>
            <button className="text-link" onClick={() => setConfirm(false)}>
              Hủy
            </button>
          </>
        ) : (
          <button className="text-link muted" onClick={() => setConfirm(true)}>
            Đặt lại tiến độ
          </button>
        )}
        <span role="status">{error}</span>
      </div>
    </>
  );
}
