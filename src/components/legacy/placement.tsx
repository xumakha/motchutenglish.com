"use client";

import { useState } from "react";
import { learningData as data } from "@/site/queries/legacy";

// The legacy placement quiz from assets/js/app.js (#placement): one question at a time, then a
// course suggestion by score. Rendered by React instead of replaceChildren, same markup.

const url = (p: string) => "/" + p.split("/").map(encodeURIComponent).join("/");

export function Placement() {
  const [answers, setAnswers] = useState<number[]>([]);
  const [choice, setChoice] = useState<number | null>(null);
  const questions = data.placementQuestions;
  const i = answers.length;

  if (i === questions.length) {
    const score = answers.filter((a, n) => a === questions[n]!.answer).length;
    const c = data.courses[score < 3 ? 0 : score < 5 ? 1 : 2]!;
    return (
      <section id="placement" className="panel narrow placement">
        <span className="result-icon">🏆</span>
        <h2>
          Bạn trả lời đúng {score}/{i} câu
        </h2>
        <p>Gợi ý cho bạn: {c.title}</p>
        <div className="note">
          Bài kiểm tra ngắn dùng để gợi ý nội dung học, không đánh giá CEFR hay dự đoán điểm TOEIC.
        </div>
        <a className="button" href={url("courses/" + c.id)}>
          Khám phá lớp phù hợp →
        </a>
        <button
          className="text-link"
          onClick={() => {
            setAnswers([]);
            setChoice(null);
          }}
        >
          Làm lại
        </button>
        <details className="transcript">
          <summary>Xem đáp án và giải thích</summary>
          {questions.map((q, n) => [
            <h4 key={`h${n}`}>{`${n + 1}. ${q.prompt}`}</h4>,
            <p key={`p${n}`}>
              {`${answers[n] === q.answer ? "✓" : "✕"} Đáp án: ${q.choices[q.answer]} — ${q.explanation}`}
            </p>,
          ])}
        </details>
      </section>
    );
  }

  const q = questions[i]!;
  return (
    <section id="placement" className="panel narrow placement">
      <span className="eyebrow">{`KIỂM TRA NHANH · ${i + 1}/${questions.length}`}</span>
      <h2>{q.prompt}</h2>
      <p>Chọn đáp án bạn thấy phù hợp. Không cần áp lực nhé.</p>
      <div className="answers">
        {q.choices.map((text, index) => (
          <button
            key={`${i}-${index}`}
            className={`answer${choice === index ? " chosen" : ""}`}
            onClick={() => setChoice(index)}
          >
            <span>{String.fromCharCode(65 + index)}</span>
            {text}
          </button>
        ))}
      </div>
      <button
        className="button"
        disabled={choice === null}
        onClick={() => {
          if (choice === null) return;
          setAnswers([...answers, choice]);
          setChoice(null);
        }}
      >
        {i === questions.length - 1 ? "Xem kết quả" : "Câu tiếp theo →"}
      </button>
    </section>
  );
}
