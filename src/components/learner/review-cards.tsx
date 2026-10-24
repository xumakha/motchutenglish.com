"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NativeAudio } from "./native-audio";

// Port of the review card loop in assets/js/product.js: one card visible at a time; a rating
// posts /api/v1/review/rate with the card's request key, then the next card opens.

export interface ReviewCardView {
  id: number;
  revision: number;
  requestKey: string;
  front: string;
  back: string;
  ipa: string;
  partOfSpeech: string;
  audioId: number | null;
  example: string;
  translation: string;
}

const RATINGS = [
  ["again", "Chưa nhớ"],
  ["hard", "Khó"],
  ["good", "Nhớ"],
  ["easy", "Rất dễ"],
] as const;

export function ReviewCards({
  cards,
  extra,
  children,
}: {
  cards: ReviewCardView[];
  extra: boolean;
  children?: ReactNode;
}) {
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [done, setDone] = useState(false);
  const moved = useRef(false);

  useEffect(() => {
    if (!moved.current) return;
    document
      .querySelectorAll<HTMLElement>(".review-card")
      [current]?.querySelector("summary")
      ?.focus();
  }, [current]);

  async function rate(card: ReviewCardView, rating: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/v1/review/rate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: card.id,
          revision: card.revision,
          requestKey: card.requestKey,
          rating,
          extra,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(result.error?.message || "Chưa thể lưu dữ liệu.");
      moved.current = true;
      if (current + 1 < cards.length) {
        setStatus("Đã lưu lịch ôn mới.");
        setCurrent(current + 1);
      } else {
        setStatus("Bạn đã hoàn thành lượt ôn này. Lịch mới đã được lưu.");
        setDone(true);
        setCurrent(cards.length);
      }
    } catch (error) {
      setStatus(
        navigator.onLine
          ? (error as Error).message
          : "Đang mất mạng. Lịch ôn chưa được lưu, hãy kết nối rồi thử lại.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p id="review-status" role="status">
        {status}
        {done ? (
          <Link className="button" href="/hoc">
            Về hôm nay
          </Link>
        ) : null}
      </p>
      {children}
      {cards.map((c, i) => (
        <article key={c.id} className="panel review-card" hidden={i !== current}>
          <span className="eyebrow">
            THẺ {i + 1}/{cards.length}
          </span>
          <h2>{c.front}</h2>
          <details data-review-reveal="">
            <summary className="button secondary">Xem đáp án</summary>
            <h3>{c.back}</h3>
            <p>
              {c.ipa}
              {c.partOfSpeech ? ` · ${c.partOfSpeech}` : null}
            </p>
            {c.audioId ? <NativeAudio id={c.audioId} review /> : null}
            <p>{c.example}</p>
            <p>{c.translation}</p>
            <div
              className="review-ratings"
              data-extra={extra ? "1" : "0"}
              data-card={c.id}
              data-revision={c.revision}
            >
              {RATINGS.map(([rating, label]) => (
                <button
                  key={rating}
                  className="button secondary"
                  type="button"
                  data-rating={rating}
                  disabled={busy}
                  onClick={() => rate(c, rating)}
                >
                  {label}
                </button>
              ))}
            </div>
          </details>
        </article>
      ))}
    </>
  );
}
