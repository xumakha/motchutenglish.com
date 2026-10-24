"use client";

import { useEffect } from "react";
import { learningData as data } from "@/site/queries/legacy";

// Port of assets/js/app.js for the legacy pages (the header part lives in the site shell):
// local progress in localStorage "mce-progress", filters, text-to-speech audio buttons, client
// quizzes and the reset button. It runs after hydration on the server-rendered DOM hooks.

const STORAGE_KEY = "mce-progress";

interface Progress {
  completed: string[];
  activity: string[];
}

const all = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [
  ...r.querySelectorAll<T>(s),
];
const one = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) =>
  r.querySelector<T>(s);
const url = (p: string) => "/" + p.split("/").map(encodeURIComponent).join("/");

export function loadProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (
      p &&
      (["completed", "activity"] as const).every(
        (k) => Array.isArray(p[k]) && p[k].every((v: unknown) => typeof v === "string"),
      )
    )
      return p as Progress;
  } catch {}
  return { completed: [], activity: [] };
}

function sync() {
  const p = loadProgress();
  all("[data-completed]").forEach((e) => {
    if (p.completed.includes(e.dataset.completed!)) {
      e.textContent = "✓";
      e.classList.add("finished");
    }
  });
  all("[data-completion]").forEach(
    (e) => (e.hidden = !p.completed.includes(e.dataset.completion!)),
  );
  for (const c of data.courses) {
    const n = c.lessons.filter((l) => p.completed.includes(c.id + "/" + l.id)).length;
    all("[data-course-progress]")
      .filter((e) => e.dataset.courseProgress === c.id)
      .forEach((e) => (e.style.width = (n / c.lessons.length) * 100 + "%"));
    all("[data-course-count]")
      .filter((e) => e.dataset.courseCount === c.id)
      .forEach((e) => (e.textContent = String(n)));
    all<HTMLAnchorElement>("[data-resume]")
      .filter((e) => e.dataset.resume === c.id)
      .forEach((e) => {
        const l = c.lessons.find((l) => !p.completed.includes(c.id + "/" + l.id)) ?? c.lessons[0]!;
        e.href = url("courses/" + c.id + "/" + l.id);
        e.textContent = n === c.lessons.length ? "Ôn tập →" : "Tiếp tục học →";
      });
  }
  const stats: Record<string, number> = {
    lessons: data.courses.reduce(
      (n, c) => n + c.lessons.filter((l) => p.completed.includes(c.id + "/" + l.id)).length,
      0,
    ),
    listening: data.listening.filter((l) => p.completed.includes("listening/" + l.id)).length,
    days: p.activity.length,
  };
  all("[data-stat]").forEach((e) => (e.textContent = String(stats[e.dataset.stat!])));
}

function mark(id: string) {
  const p = loadProgress();
  const d = new Date();
  const day = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      completed: [...new Set([...p.completed, id])],
      activity: [...new Set([...p.activity, day])],
    }),
  );
  sync();
}

function wire(signal: AbortSignal) {
  const on = (el: EventTarget, type: string, fn: () => void) =>
    el.addEventListener(type, fn, { signal });

  all("[data-filter-group]").forEach((g) =>
    all("[data-filter]", g).forEach((b) =>
      on(b, "click", () => {
        all("[data-filter]", g).forEach((e) => e.classList.toggle("selected", e === b));
        all("[data-filter-item]", g).forEach(
          (e) =>
            (e.hidden = b.dataset.filter !== "all" && e.dataset.filterItem !== b.dataset.filter),
        );
      }),
    ),
  );

  let active: HTMLElement | null = null;
  const stop = () => {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    if (active) {
      active.textContent = "▶ Nghe mẫu";
      active = null;
    }
  };
  all("[data-audio]").forEach((b) =>
    on(b, "click", () => {
      const box = b.closest(".audio-player")!;
      const err = one(".audio-error", box)!;
      err.textContent = "";
      if (!("speechSynthesis" in window)) {
        err.textContent = "Trình duyệt chưa hỗ trợ giọng đọc. Hãy đọc nội dung bài học.";
        return;
      }
      if (active === b) {
        stop();
        return;
      }
      stop();
      const u = new SpeechSynthesisUtterance(b.dataset.audio);
      u.lang = "en-US";
      u.rate = Number(one<HTMLSelectElement>("select", box)!.value);
      const v = speechSynthesis.getVoices().find((v) => v.lang === "en-US");
      if (v) u.voice = v;
      active = b;
      b.textContent = "■ Dừng nghe";
      u.onend = () => {
        if (active === b) {
          b.textContent = "▶ Nghe mẫu";
          active = null;
        }
      };
      u.onerror = (e) => {
        if (active === b) {
          stop();
          if (!["canceled", "interrupted"].includes(e.error))
            err.textContent = "Không phát được giọng đọc. Hãy thử lại hoặc đọc nội dung.";
        }
      };
      speechSynthesis.speak(u);
    }),
  );
  on(window, "pagehide", stop);

  all("[data-quiz]").forEach((q) => {
    let choice: number | null = null;
    const check = one<HTMLButtonElement>("[data-check]", q)!;
    const feedback = one("[data-feedback]", q)!;
    all<HTMLButtonElement>("[data-choice]", q).forEach((b) =>
      on(b, "click", () => {
        choice = Number(b.dataset.choice);
        all("[data-choice]", q).forEach((e) => {
          e.classList.remove("correct", "incorrect");
          e.classList.toggle("chosen", e === b);
        });
        check.disabled = false;
        feedback.textContent = "";
        feedback.className = "";
      }),
    );
    on(check, "click", () => {
      const correct = choice === Number(q.dataset.answer);
      one(`[data-choice="${choice}"]`, q)?.classList.add(correct ? "correct" : "incorrect");
      feedback.className = "feedback " + (correct ? "success" : "retry");
      feedback.textContent = correct
        ? "Chính xác! " + q.dataset.explanation
        : "Chưa đúng, thử lại nhé. Đọc lại nội dung và chọn một đáp án khác.";
      if (correct) {
        check.disabled = true;
        all<HTMLButtonElement>("[data-choice]", q).forEach((b) => (b.disabled = true));
        try {
          mark(q.dataset.id!);
        } catch {
          feedback.textContent +=
            " Trình duyệt không cho phép lưu tiến độ. Bạn vẫn có thể tiếp tục học.";
        }
      }
    });
  });

  const reset = one("#reset-progress");
  if (reset)
    on(reset, "click", () => {
      if (!window.confirm("Xóa toàn bộ tiến độ trên trình duyệt này?")) return;
      try {
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
      } catch {
        one("#storage-error")!.textContent = "Không thể xóa dữ liệu.";
      }
    });
  on(window, "storage", sync);
  sync();
  return stop;
}

export function LegacyBehaviour() {
  useEffect(() => {
    const controller = new AbortController();
    const stop = wire(controller.signal);
    return () => {
      controller.abort();
      stop();
    };
  }, []);
  return null;
}
