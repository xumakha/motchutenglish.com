"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Block } from "@/domain/assessment/types";
import type { PublicAttempt, PublicItem } from "@/domain/study/attempts";
import { api, ApiError } from "./api";
import { ChoiceInput, FillInput, MatchInput, OrderInput, StudyAudio, TextInput } from "./inputs";
import { RichText } from "./rich-text";
import { playerStorage, type QueuedAction } from "./storage";

// The lesson player (port of the #study-player part of assets/js/product.js). State comes from
// the server (/hoc/luot/{id}); every change goes through /api/v1/attempts/{id}/{action} with the
// attempt revision. Drafts are kept on the device until the server confirms them.

const RESOLVED = ["submitted", "skipped", "unavailable"];
const SELF = ["self", "flashcard"];
const isResolved = (item: PublicItem) => RESOLVED.includes(item.state);

interface Status {
  text: string;
  reload?: boolean;
}

export function Player({ initial, account }: { initial: PublicAttempt; account: string }) {
  const [state, setState] = useState(initial);
  const [index, setIndex] = useState(initial.position || 0);
  const [status, setStatus] = useState<Status>({ text: "" });
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<Record<string, unknown>>({});
  const [fieldError, setFieldError] = useState<{ exerciseId: string; message: string } | null>(
    null,
  );
  const storage = useMemo(() => playerStorage(account, initial.id), [account, initial.id]);

  const stateRef = useRef(state);
  const busyRef = useRef(false);
  const queue = useRef<QueuedAction[]>([]);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInteraction = useRef(0);
  const focusAfter = useRef<"exercise" | "feedback" | "result" | null>(null);
  const host = useRef<HTMLDivElement>(null);

  const apply = useCallback((next: PublicAttempt) => {
    stateRef.current = next;
    setState(next);
  }, []);

  /** Send queued actions in order with the current revision; stop when offline. */
  const drain = useCallback(async () => {
    busyRef.current = true;
    setBusy(true);
    try {
      while (queue.current.length) {
        const { action, body } = queue.current[0]!;
        try {
          const next = await api<PublicAttempt>(`attempts/${stateRef.current.id}/${action}`, {
            ...body,
            revision: stateRef.current.revision,
          });
          queue.current.shift();
          storage.dequeue();
          apply(next);
          setStatus({ text: "Máy chủ đã xác nhận lưu." });
          if (action === "submit" || action === "skip") {
            storage.dropDraft(String(body.exerciseId));
            setLocal((l) => {
              const { [String(body.exerciseId)]: _done, ...rest } = l;
              return rest;
            });
          }
          if (action === "finish") storage.clearDrafts();
          if (action === "submit" || action === "skip") focusAfter.current = "feedback";
          // No focus move when the server confirms "navigate": move() already focused the new
          // question, and the learner may have moved on (e.g. into an order exercise) since.
          if (action === "finish") focusAfter.current = "result";
        } catch (error) {
          if (!(error instanceof ApiError) || error.status === 0) {
            setStatus({
              text: navigator.onLine
                ? (error as Error).message
                : "Đang mất mạng. Bản nháp giữ trên thiết bị; máy chủ chưa xác nhận lưu.",
            });
            return; // keep the queue for the next try
          }
          // A client error will not succeed on retry: drop it and show why.
          queue.current.shift();
          storage.dequeue();
          if (error.status === 422)
            setFieldError({
              exerciseId: String(body.exerciseId ?? ""),
              message: error.fields.response ?? error.message,
            });
          if (error.status === 409 && error.current) apply(error.current);
          setStatus({ text: error.message, reload: error.status === 409 });
        }
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [apply, storage]);

  const running = useRef<Promise<void> | null>(null);

  /** Concurrent callers share one run, so `await runQueue()` means "the queue has drained". */
  const runQueue = useCallback((): Promise<void> => {
    running.current ??= drain().finally(() => {
      running.current = null;
    });
    return running.current;
  }, [drain]);

  /** Queue an attempt action; it runs after anything already waiting (fix 3). */
  const send = useCallback(
    (action: string, body: Record<string, unknown> = {}) => {
      setFieldError(null);
      const item = { action, body };
      queue.current.push(item);
      storage.enqueue(item);
      if (busyRef.current)
        setStatus({ text: "Đang lưu thay đổi trước đó. Thao tác này sẽ được gửi ngay sau." });
      void runQueue();
    },
    [runQueue, storage],
  );

  // Load drafts and any unsent actions from the device, then replay them. This must run after
  // hydration: the server has no localStorage, so reading it during render would not match.
  useEffect(() => {
    lastInteraction.current = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- device storage is client-only
    setLocal(storage.drafts());
    queue.current = storage.outbox();
    if (queue.current.length && navigator.onLine) {
      setStatus({ text: "Đang gửi lại thao tác chưa được xác nhận." });
      void runQueue();
    }
  }, [runQueue, storage]);

  useEffect(() => {
    const offline = () => setStatus({ text: "Đang mất mạng. Bản nháp chỉ lưu trên thiết bị." });
    const online = async () => {
      setStatus({ text: "Đã có mạng. Đang gửi lại thao tác chưa được xác nhận." });
      await runQueue();
      for (const [exerciseId, response] of Object.entries(storage.drafts())) {
        const item = stateRef.current.items.find((i) => i.exercise.id === exerciseId);
        if (item && !isResolved(item)) send("draft", { exerciseId, response });
      }
    };
    const touch = () => (lastInteraction.current = Date.now());
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    document.addEventListener("pointerdown", touch, { passive: true });
    document.addEventListener("keydown", touch, { passive: true });
    // Heartbeat: active time is counted only while the learner is actually interacting.
    const timer = setInterval(() => {
      const s = stateRef.current;
      if (
        navigator.onLine &&
        s.status === "active" &&
        document.visibilityState === "visible" &&
        Date.now() - lastInteraction.current < 45_000 &&
        !busyRef.current
      )
        api(`attempts/${s.id}/heartbeat`, { active: true, revision: s.revision }).catch(
          () => undefined,
        );
    }, 30_000);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      document.removeEventListener("pointerdown", touch);
      document.removeEventListener("keydown", touch);
      clearInterval(timer);
    };
  }, [runQueue, send, storage]);

  // Move focus after an action finished rendering (feedback, next question or result).
  useEffect(() => {
    const target = focusAfter.current;
    if (!target || !host.current) return;
    focusAfter.current = null;
    const el =
      target === "result"
        ? host.current.querySelector<HTMLElement>(".panel.green h2")
        : (target === "feedback" &&
            host.current.querySelector<HTMLElement>("[data-feedback-heading]")) ||
          host.current.querySelector<HTMLElement>(".exercise-panel h2");
    if (el) {
      el.tabIndex = -1;
      el.focus();
    }
  }, [state, index]);

  const saveLocal = (exerciseId: string, response: unknown) => {
    setLocal((l) => ({ ...l, [exerciseId]: response }));
    setStatus({
      text: storage.saveDraft(exerciseId, response)
        ? "Bản nháp đang lưu trên thiết bị. Chưa xác nhận lưu máy chủ."
        : "Thiết bị không cho lưu bản nháp. Hãy nộp khi có mạng.",
    });
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      if (navigator.onLine && stateRef.current.status === "active")
        send("draft", { exerciseId, response });
    }, 900);
  };

  const now = (action: string, body: Record<string, unknown> = {}) => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    send(action, body);
  };

  const move = (n: number) => {
    setIndex(n);
    focusAfter.current = "exercise";
    if (state.status === "active") send("navigate", { position: n });
  };

  const done = state.items.filter(isResolved).length;
  const current = state.items.length
    ? state.items[Math.max(0, Math.min(index, state.items.length - 1))]
    : undefined;

  return (
    <>
      <p className="save-status" role="status">
        {status.text}
        {status.reload ? (
          <button type="button" className="button secondary" onClick={() => location.reload()}>
            Tải trạng thái mới
          </button>
        ) : null}
      </p>
      <div id="study-player" ref={host} aria-busy={busy || undefined}>
        <progress
          max={Math.max(1, state.items.length + state.blocks.length)}
          value={done + state.viewed.length}
          aria-label="Tiến độ bài học"
        />
        <p>{state.objectives}</p>
        {state.status === "finished" ? <Result state={state} account={account} /> : null}
        <details open={state.status !== "finished"}>
          <summary>Nội dung bài học</summary>
          {state.blocks.map((b) => (
            <BlockPanel
              key={b.id}
              block={b}
              state={state}
              setStatus={(text) => setStatus({ text })}
              onView={() => now("view", { block: b.id, position: index })}
            />
          ))}
        </details>
        {current ? (
          <>
            <nav className="product-nav" aria-label="Các câu luyện tập">
              {state.items.map((item, i) => (
                <button
                  key={item.exercise.id}
                  type="button"
                  className="button secondary"
                  aria-current={i === index ? "step" : "false"}
                  onClick={() => move(i)}
                >
                  {i + 1}
                  {item.state === "submitted" ? " ✓" : ""}
                </button>
              ))}
            </nav>
            <ExerciseCard
              key={current.exercise.id}
              item={current}
              state={state}
              account={account}
              draft={local[current.exercise.id]}
              fieldError={
                fieldError?.exerciseId === current.exercise.id ? fieldError.message : null
              }
              onChange={(v) => saveLocal(current.exercise.id, v)}
              act={now}
              setStatus={(text) => setStatus({ text })}
            />
            <div className="player-controls">
              {index > 0 ? (
                <button type="button" className="button secondary" onClick={() => move(index - 1)}>
                  Câu trước
                </button>
              ) : null}
              {index < state.items.length - 1 ? (
                <button type="button" className="button secondary" onClick={() => move(index + 1)}>
                  Câu sau
                </button>
              ) : null}
            </div>
          </>
        ) : null}
        {state.status !== "finished" ? (
          <button type="button" className="button" onClick={() => now("finish")}>
            Hoàn thành bài học
          </button>
        ) : null}
        {account !== "guest" ? (
          <ReportForm
            state={state}
            position={current?.exercise.id ?? "lesson"}
            setStatus={(text) => setStatus({ text })}
          />
        ) : null}
      </div>
    </>
  );
}

function Result({ state, account }: { state: PublicAttempt; account: string }) {
  const percent = state.maxScore ? Math.floor((100 * (state.score ?? 0)) / state.maxScore) : null;
  return (
    <section className="panel green">
      <h2>Bạn đã hoàn thành bài học</h2>
      <p>Hãy xem lại kiến thức và những câu cần ôn ở bên dưới.</p>
      {percent !== null ? (
        <p>
          Điểm khách quan: {state.score}/{state.maxScore} ({percent}%) -{" "}
          {state.audioUnavailable
            ? "Chưa đánh giá đạt vì có sự cố audio"
            : percent >= state.passThreshold
              ? "Đã đạt"
              : "Cần luyện thêm"}
        </p>
      ) : (
        <p>Bài tự đánh giá không có phần trăm điểm khách quan.</p>
      )}
      {account === "guest" ? (
        <>
          <Link className="button" href="/register">
            Đăng ký để lưu bài học
          </Link>
          <p>Sau đăng ký, vào Hôm nay và xác nhận chuyển bài học thử.</p>
        </>
      ) : (
        <p>
          {state.mode === "preview"
            ? "Kết quả xem trước không lưu tiến độ hoặc cấp thưởng."
            : "Tiến độ đã được ghi trên máy chủ. XP không đại diện trình độ tiếng Anh."}
        </p>
      )}
      {state.suggestion ? (
        <>
          <p>
            Gợi ý từ bộ câu mẫu chưa hiệu chuẩn, không phải xếp hạng CEFR. Câu bỏ qua:{" "}
            {state.skipped}
          </p>
          <Link
            className="button secondary"
            href={`/lo-trinh/${encodeURIComponent(state.suggestion)}`}
          >
            Xem lộ trình được gợi ý
          </Link>
        </>
      ) : null}
      <Link className="button" href="/hoc">
        Bài tiếp theo và ôn tập
      </Link>
    </section>
  );
}

function BlockPanel({
  block: b,
  state,
  onView,
  setStatus,
}: {
  block: Block;
  state: PublicAttempt;
  onView: () => void;
  setStatus: (text: string) => void;
}) {
  const viewed = state.viewed.includes(b.id);
  const text = b.text ?? "";
  return (
    <section className="panel study-block">
      {b.type === "heading" ? (
        <h2>{text}</h2>
      ) : b.type === "audio" ? (
        <StudyAudio mediaId={b.audioId} transcript={b.transcript} setStatus={setStatus} />
      ) : b.type === "table" ? (
        <div className="table-scroll">
          <table>
            <tbody>
              {text.split("\n").map((line, i) => (
                <tr key={i}>
                  {line
                    .split("|")
                    .map((cell, j) =>
                      i === 0 ? <th key={j}>{cell.trim()}</th> : <td key={j}>{cell.trim()}</td>,
                    )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : b.type === "dialogue" ? (
        text.split("\n").map((line, i) => {
          const colon = line.indexOf(":");
          return (
            <p key={i}>
              {colon >= 0 ? (
                <>
                  <strong>{line.slice(0, colon + 1)}</strong>
                  {line.slice(colon + 1)}
                </>
              ) : (
                line
              )}
            </p>
          );
        })
      ) : (
        <>
          {b.type === "tip" ? <strong>Một chút lưu ý</strong> : null}
          <div className="prose">
            <RichText text={text} />
          </div>
        </>
      )}
      {state.status !== "finished" ? (
        <button type="button" className="button secondary" disabled={viewed} onClick={onView}>
          {viewed ? "✓ Đã đọc" : "Đánh dấu đã đọc"}
        </button>
      ) : null}
    </section>
  );
}

function Prompt({ item }: { item: PublicItem }) {
  const p = item.exercise.payload as {
    prompt: string;
    errorSegment?: { start: number; length: number };
  };
  if (item.exercise.type === "correction" && p.errorSegment) {
    const chars = Array.from(p.prompt);
    const { start, length } = p.errorSegment;
    return (
      <h2 tabIndex={-1}>
        {chars.slice(0, start).join("")}
        <mark>{chars.slice(start, start + length).join("")}</mark>
        {chars.slice(start + length).join("")}
      </h2>
    );
  }
  return <h2 tabIndex={-1}>{p.prompt}</h2>;
}

function ExerciseCard({
  item,
  state,
  account,
  draft,
  fieldError,
  onChange,
  act,
  setStatus,
}: {
  item: PublicItem;
  state: PublicAttempt;
  account: string;
  draft: unknown;
  fieldError: string | null;
  onChange: (v: unknown) => void;
  act: (action: string, body?: Record<string, unknown>) => void;
  setStatus: (text: string) => void;
}) {
  const e = item.exercise;
  const p = e.payload as typeof e.payload & { audioId?: number };
  const resolved = isResolved(item);
  const disabled = resolved || state.status === "finished";
  const [audioFailed, setAudioFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryValue, setRetryValue] = useState<unknown>(item.response);
  const [trial, setTrial] = useState("");
  const value = retrying ? retryValue : disabled ? item.response : (draft ?? item.response ?? null);
  const change = retrying ? setRetryValue : onChange;
  const errorId = `field-error-${e.id}`;

  const audio = p.audioId ? (
    <StudyAudio
      mediaId={p.audioId}
      transcript={item.feedback?.transcript}
      setStatus={setStatus}
      onError={() => setAudioFailed(true)}
    />
  ) : null;
  const reportAudio =
    audioFailed && !resolved ? (
      <button
        type="button"
        className="button secondary"
        onClick={() => act("audio_error", { exerciseId: e.id })}
      >
        Báo sự cố và bỏ qua nghe
      </button>
    ) : null;

  if (e.type === "flashcard")
    return <Flashcard {...{ item, state, value, disabled, onChange, act }} />;

  const input =
    e.type === "choice" || e.type === "listening_choice" || e.type === "true_false" ? (
      <ChoiceInput exercise={e} value={value} onChange={change} />
    ) : e.type === "fill" || e.type === "listening_fill" ? (
      <FillInput payload={e.payload} value={value} onChange={change} />
    ) : e.type === "match" ? (
      <MatchInput payload={e.payload} value={value} onChange={change} />
    ) : e.type === "order" ? (
      <OrderInput payload={e.payload} value={value} onChange={change} />
    ) : (
      <TextInput
        label={
          SELF.includes(e.type)
            ? "Câu trả lời hoặc ghi nhớ của bạn (tự đánh giá)"
            : "Nhập câu trả lời"
        }
        value={value}
        onChange={change}
      />
    );

  const g = item.feedback;
  return (
    <section className="panel exercise-panel">
      <Prompt item={item} />
      {audio}
      {reportAudio}
      <fieldset
        disabled={disabled && !retrying}
        data-field="response"
        aria-label="Câu trả lời"
        aria-invalid={fieldError ? true : undefined}
        aria-describedby={fieldError ? errorId : undefined}
      >
        <legend>Câu trả lời của bạn</legend>
        {input}
      </fieldset>
      {fieldError ? (
        <p id={errorId} className="field-error">
          {fieldError}
        </p>
      ) : null}
      {!disabled ? (
        <>
          <button
            type="button"
            className="button secondary"
            onClick={() => act("draft", { exerciseId: e.id, response: value })}
          >
            Lưu bản nháp
          </button>
          <button
            type="button"
            className="button"
            onClick={() => act("submit", { exerciseId: e.id, response: value })}
          >
            {SELF.includes(e.type) ? "Xem đáp án mẫu và tự đánh giá" : "Nộp câu trả lời"}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => act("skip", { exerciseId: e.id })}
          >
            Bỏ qua câu
          </button>
        </>
      ) : (
        <p>
          {item.state === "unavailable"
            ? "Audio chưa khả dụng - không tính sai"
            : item.state === "skipped"
              ? "Đã bỏ qua"
              : "Đã nộp - giữ kết quả lần đầu."}
        </p>
      )}
      {g ? (
        <>
          <h3 data-feedback-heading="" tabIndex={-1}>
            {g.gradingMode === "unavailable"
              ? "Audio chưa khả dụng"
              : g.gradingMode === "self_assessed"
                ? "Tự đánh giá"
                : g.isCorrect
                  ? "✓ Chính xác"
                  : "Cần ôn thêm"}
          </h3>
          <p>Đáp án: {g.acceptedAnswerDisplay}</p>
          <p>{g.feedback}</p>
          {g.criteria ? (
            <p>Tiêu chí: {Array.isArray(g.criteria) ? g.criteria.join("; ") : g.criteria}</p>
          ) : null}
          {(g.maxScore ?? 0) > 1 ? (
            <p>
              Điểm từng phần: {g.score}/{g.maxScore}
            </p>
          ) : null}
          {state.mode !== "test" &&
          state.status !== "finished" &&
          g.gradingMode !== "unavailable" &&
          !SELF.includes(e.type) ? (
            <>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setRetrying(true);
                  setStatus("Bạn đang luyện lại. Điểm lần đầu và lịch sử không thay đổi.");
                }}
              >
                Luyện lại câu này (giữ điểm lần đầu)
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={async () => {
                  try {
                    const r = await api<{
                      feedback: { isCorrect: boolean | null; feedback: string };
                    }>(`attempts/${state.id}/retry`, { exerciseId: e.id, response: retryValue });
                    setTrial(
                      `${r.feedback.isCorrect ? "✓ Chính xác. " : "Cần ôn thêm. "}${r.feedback.feedback} Điểm lần đầu được giữ nguyên.`,
                    );
                  } catch (error) {
                    setTrial((error as Error).message);
                  }
                }}
              >
                Kiểm tra lần luyện lại
              </button>
              <p>{trial}</p>
            </>
          ) : null}
          {state.canSaveConcepts && account !== "guest" && g.isCorrect === false ? (
            <button
              type="button"
              className="button secondary"
              onClick={async () => {
                try {
                  await api("review/concept", { attemptId: state.id, exerciseId: e.id });
                  setStatus("Đã thêm kiến thức vào lịch ôn.");
                } catch (error) {
                  setStatus((error as Error).message);
                }
              }}
            >
              Đưa kiến thức này vào ôn tập
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function Flashcard({
  item,
  state,
  value,
  disabled,
  onChange,
  act,
}: {
  item: PublicItem;
  state: PublicAttempt;
  value: unknown;
  disabled: boolean;
  onChange: (v: unknown) => void;
  act: (action: string, body?: Record<string, unknown>) => void;
}) {
  const e = item.exercise;
  const g = item.feedback;
  const [showBack, setShowBack] = useState(true);
  const front = useRef<HTMLHeadingElement>(null);
  const back = useRef<HTMLHeadingElement>(null);
  const backId = `flashcard-back-${e.id}`;
  const text = typeof value === "string" ? value : "";
  return (
    <section className="panel exercise-panel">
      <Prompt item={item} />
      <div className="lesson-flashcard" data-lesson-flashcard="">
        <div className="lesson-flashcard-face" data-flashcard-front="" hidden={!!g && showBack}>
          <h3 ref={front} tabIndex={-1}>
            Mặt trước
          </h3>
          <p>
            Hãy nhớ lại câu trả lời trước khi lật thẻ. Thẻ này được tự đánh giá, không có điểm
            đúng/sai tự động.
          </p>
          <fieldset disabled={disabled} data-field="response">
            <legend>Tự nhớ lại</legend>
            <label>
              Ghi nhớ của bạn (không bắt buộc)
              <textarea
                maxLength={4000}
                rows={3}
                value={text}
                onChange={(ev) => onChange(ev.target.value)}
              />
            </label>
          </fieldset>
          {!disabled ? (
            <>
              <button
                type="button"
                className="button secondary"
                onClick={() => act("draft", { exerciseId: e.id, response: text })}
              >
                Lưu bản nháp
              </button>
              <button
                type="button"
                className="button"
                data-flashcard-reveal=""
                onClick={() => act("submit", { exerciseId: e.id, response: text })}
              >
                {state.mode === "test"
                  ? "Nộp thẻ — xem mặt sau khi hoàn thành bài"
                  : "Lật thẻ và tự đánh giá"}
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => act("skip", { exerciseId: e.id })}
              >
                Bỏ qua thẻ
              </button>
            </>
          ) : (
            <p>{item.state === "skipped" ? "Đã bỏ qua thẻ." : "Đã nộp — giữ ghi nhớ lần đầu."}</p>
          )}
        </div>
        {g ? (
          <>
            <div
              className="lesson-flashcard-face"
              data-flashcard-back=""
              id={backId}
              hidden={!showBack}
            >
              <h3 ref={back} tabIndex={-1} data-feedback-heading="">
                Mặt sau · Tự đánh giá
              </h3>
              <p className="flashcard-answer">{g.acceptedAnswerDisplay}</p>
              <p>{g.feedback}</p>
              {g.criteria ? (
                <>
                  <p>Đối chiếu với tiêu chí:</p>
                  <ul>
                    {(Array.isArray(g.criteria) ? g.criteria : [g.criteria]).map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              <p>
                Tự kiểm tra mức nhớ của bạn. Thẻ này không được tính vào độ chính xác khách quan.
              </p>
            </div>
            <button
              type="button"
              className="button secondary"
              data-flashcard-flip=""
              aria-controls={backId}
              aria-expanded={showBack}
              onClick={() => {
                const next = !showBack;
                setShowBack(next);
                requestAnimationFrame(() => (next ? back : front).current?.focus());
              }}
            >
              {showBack ? "Xem mặt trước" : "Xem mặt sau"}
            </button>
          </>
        ) : disabled ? (
          <p>Mặt sau sẽ xuất hiện sau khi hoàn thành bài kiểm tra.</p>
        ) : null}
      </div>
    </section>
  );
}

function ReportForm({
  state,
  position,
  setStatus,
}: {
  state: PublicAttempt;
  position: string;
  setStatus: (t: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Báo lỗi nội dung</summary>
      <form
        onSubmit={async (ev) => {
          ev.preventDefault();
          const form = new FormData(ev.currentTarget);
          try {
            await api("reports", {
              versionId: state.versionId,
              position,
              category: form.get("category"),
              description: form.get("description"),
            });
            setStatus("Đã gửi báo lỗi để biên tập viên kiểm tra.");
            setError(null);
            setOpen(false);
          } catch (e) {
            setStatus((e as Error).message);
            if (e instanceof ApiError && e.status === 422)
              setError(e.fields.description ?? e.message);
          }
        }}
      >
        <label>
          Loại lỗi{" "}
          <select name="category">
            <option value="answer">Đáp án</option>
            <option value="typo">Chính tả</option>
            <option value="audio">Audio</option>
            <option value="other">Khác</option>
          </select>
        </label>
        <label>
          Mô tả lỗi{" "}
          <textarea
            name="description"
            required
            maxLength={2000}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "report-error" : undefined}
          />
        </label>
        {error ? (
          <p id="report-error" className="field-error">
            {error}
          </p>
        ) : null}
        <button type="submit" className="button secondary">
          Gửi báo lỗi
        </button>
      </form>
    </details>
  );
}
