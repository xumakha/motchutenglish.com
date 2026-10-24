"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicExercise } from "@/domain/assessment/grade";

// Answer inputs per exercise type (port of exerciseCard() in assets/js/product.js).

type Payload = PublicExercise["payload"];

export function ChoiceInput({
  exercise,
  value,
  onChange,
}: {
  exercise: PublicExercise;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const p = exercise.payload;
  const trueFalse = exercise.type === "true_false";
  const options = trueFalse
    ? [
        { id: "true", text: "Đúng" },
        { id: "false", text: "Sai" },
      ]
    : (p.choices ?? []);
  return options.map(({ id, text }) => (
    <label key={id} className="answer-label">
      <input
        type="radio"
        name={`response-${exercise.id}`}
        value={id}
        checked={value === (trueFalse ? id === "true" : id)}
        onChange={() => onChange(trueFalse ? id === "true" : id)}
      />
      {text}
    </label>
  ));
}

export function FillInput({
  payload,
  value,
  onChange,
}: {
  payload: Payload;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const answers = (value && typeof value === "object" ? value : {}) as Record<string, string>;
  return (payload.blanks ?? []).map((id, n) => (
    <label key={id}>
      Ô trống {n + 1}
      <input
        value={answers[id] ?? ""}
        autoComplete="off"
        onChange={(e) => onChange({ ...answers, [id]: e.target.value })}
      />
    </label>
  ));
}

export function MatchInput({
  payload,
  value,
  onChange,
}: {
  payload: Payload;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const answers = (value && typeof value === "object" ? value : {}) as Record<string, string>;
  return (payload.left ?? []).map(({ id, text }) => (
    <label key={id}>
      {text}{" "}
      <select
        value={answers[id] ?? ""}
        onChange={(e) => onChange({ ...answers, [id]: e.target.value })}
      >
        <option value="">Chọn nghĩa phù hợp</option>
        {(payload.right ?? []).map((r) => (
          <option key={r.key} value={r.key}>
            {r.text}
          </option>
        ))}
      </select>
    </label>
  ));
}

/** Build the order with buttons; focus follows the moved token and a live region announces it. */
export function OrderInput({
  payload,
  value,
  onChange,
}: {
  payload: Payload;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const order = useMemo(() => (Array.isArray(value) ? (value as string[]) : []), [value]);
  const tokens = new Map((payload.tokens ?? []).map((t) => [t.id, t.text]));
  const [announcement, setAnnouncement] = useState("");
  const [focus, setFocus] = useState<{ id: string; action: string } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focus || !box.current) return;
    const buttons = [...box.current.querySelectorAll<HTMLButtonElement>("[data-order-token]")];
    (
      buttons.find(
        (b) => b.dataset.orderToken === focus.id && b.dataset.orderAction === focus.action,
      ) ?? buttons.find((b) => b.dataset.orderToken === focus.id)
    )?.focus();
  }, [focus, order]);

  const update = (next: string[], id: string, action: string, message: string) => {
    onChange(next);
    setFocus({ id, action });
    setAnnouncement(message);
  };

  return (
    <div ref={box}>
      <p>Chạm hoặc dùng bàn phím chọn từ. Dùng Lên/Xuống để đổi vị trí, Bỏ để chọn lại.</p>
      <div className="token-list">
        {(payload.tokens ?? [])
          .filter((t) => !order.includes(t.id))
          .map((t) => (
            <button
              key={t.id}
              type="button"
              className="button secondary"
              data-order-token={t.id}
              data-order-action="add"
              aria-label={`Thêm ${t.text}`}
              onClick={() =>
                update(
                  [...order, t.id],
                  t.id,
                  "remove",
                  `Đã thêm ${t.text} ở vị trí ${order.length + 1}`,
                )
              }
            >
              {t.text}
            </button>
          ))}
      </div>
      <ol>
        {order.map((id, i) => {
          const text = tokens.get(id) ?? id;
          return (
            <li key={id}>
              <span>{text}</span>
              <button
                type="button"
                className="button secondary"
                data-order-token={id}
                data-order-action="remove"
                onClick={() =>
                  update(
                    order.filter((_, n) => n !== i),
                    id,
                    "add",
                    `Đã bỏ ${text}`,
                  )
                }
              >
                Bỏ {text}
              </button>
              {(
                [
                  ["up", -1, "Lên"],
                  ["down", 1, "Xuống"],
                ] as const
              ).map(([action, delta, label]) =>
                i + delta >= 0 && i + delta < order.length ? (
                  <button
                    key={action}
                    type="button"
                    className="button secondary"
                    data-order-token={id}
                    data-order-action={action}
                    aria-label={`Đưa ${text} đến vị trí ${i + delta + 1}`}
                    onClick={() => {
                      const next = [...order];
                      [next[i], next[i + delta]] = [next[i + delta]!, next[i]!];
                      update(next, id, action, `${text} ở vị trí ${i + delta + 1}`);
                    }}
                  >
                    {label}
                  </button>
                ) : null,
              )}
            </li>
          );
        })}
      </ol>
      <p role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

export function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  return (
    <label>
      {label}
      <textarea
        maxLength={4000}
        rows={3}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** <audio> with speed control, reload on error and an optional transcript. */
export function StudyAudio({
  mediaId,
  transcript,
  onError,
  setStatus,
}: {
  mediaId?: number;
  transcript?: string;
  onError?: () => void;
  setStatus: (message: string) => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [rate, setRate] = useState(1);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate]);
  if (!mediaId)
    return (
      <div className="study-audio">
        <p>Chưa có tệp audio. Hãy thêm tệp có quyền sử dụng trước khi xuất bản.</p>
      </div>
    );
  return (
    <div className="study-audio">
      <audio
        ref={audio}
        controls
        preload="none"
        src={`/media/${Number(mediaId)}`}
        onError={() => {
          setStatus(
            "Không tải được audio. Hãy thử tải lại hoặc báo lỗi; chưa nộp câu nếu chưa nghe được.",
          );
          if (!failed) {
            setFailed(true);
            onError?.();
          }
        }}
      />
      <label>
        Tốc độ{" "}
        <select
          aria-label="Tốc độ phát audio"
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
        >
          {[0.75, 1, 1.25].map((n) => (
            <option key={n} value={n}>
              {n}x
            </option>
          ))}
        </select>
      </label>
      {failed ? (
        <button type="button" className="button secondary" onClick={() => audio.current?.load()}>
          Thử tải lại audio
        </button>
      ) : null}
      {transcript ? (
        <details>
          <summary>Bản chép lời</summary>
          <p>{transcript}</p>
        </details>
      ) : null}
    </div>
  );
}
