"use strict";
(() => {
  window.mceProductReady = true;
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
  let fieldErrorSequence = 0;
  function markFields(scope, fields, summary) {
    scope.querySelectorAll("[data-field-error]").forEach((node) => {
      scope.querySelectorAll("[aria-describedby]").forEach((control) => {
        const ids = control
          .getAttribute("aria-describedby")
          .split(/\s+/)
          .filter((id) => id !== node.id);
        if (ids.length) control.setAttribute("aria-describedby", ids.join(" "));
        else control.removeAttribute("aria-describedby");
      });
      node.remove();
    });
    scope
      .querySelectorAll('[aria-invalid="true"]')
      .forEach((control) => control.removeAttribute("aria-invalid"));
    let first = null;
    Object.entries(fields || {}).forEach(([name, message]) => {
      const controls = [
        ...scope.querySelectorAll("input:not([type=hidden]),select,textarea,fieldset"),
      ].filter((control) => control.name === name || control.dataset.field === name);
      if (!controls.length) return;
      const error = document.createElement("p");
      error.id = "field-error-" + ++fieldErrorSequence;
      error.dataset.fieldError = "";
      error.className = "field-error";
      error.textContent = String(message);
      controls[controls.length - 1].closest("label")?.after(error);
      if (!error.isConnected) controls[controls.length - 1].after(error);
      controls.forEach((control) => {
        control.setAttribute("aria-invalid", "true");
        const ids = new Set(
          (control.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean),
        );
        ids.add(error.id);
        control.setAttribute("aria-describedby", [...ids].join(" "));
      });
      first ??=
        controls.find((control) => !control.disabled && control.tagName !== "FIELDSET") ||
        controls.find((control) => !control.disabled);
      if (first?.tagName === "FIELDSET") first.tabIndex = -1;
    });
    if (first)
      for (let node = first.parentElement; node; node = node.parentElement)
        if (node.tagName === "DETAILS") node.open = true;
    if (summary) {
      summary.tabIndex = -1;
      if (first) {
        if (!first.id) first.id = "invalid-control-" + fieldErrorSequence;
        const link = document.createElement("a");
        link.href = "#" + first.id;
        link.textContent = "Đến ô cần sửa";
        link.onclick = (event) => {
          event.preventDefault();
          first.focus();
        };
        summary.append(document.createTextNode(" "), link);
      }
      summary.focus();
    }
  }
  const serverErrors = document.querySelector("#form-error-state"),
    summary = document.querySelector("#form-error");
  if (serverErrors && summary) {
    const { values = {}, fields = {} } = JSON.parse(serverErrors.textContent);
    const identity = [
      "command",
      "id",
      "senseId",
      "cardId",
      "setId",
      "versionId",
      "draftId",
      "kind",
      "type",
      "action",
    ];
    const form = [...document.forms].find((form) =>
      values._formAction
        ? new URL(form.action).pathname === "/" + values._formAction
        : values.command &&
          identity.every(
            (key) =>
              values[key] === undefined ||
              String(form.elements.namedItem(key)?.value ?? "") === String(values[key]),
          ),
    );
    if (form) {
      [...form.elements].forEach((control) => {
        if (
          control.name in values &&
          !["hidden", "password", "file", "submit", "button"].includes(control.type)
        ) {
          const value = values[control.name];
          if (control.type === "checkbox" || control.type === "radio")
            control.checked = String(value) === String(control.value);
          else
            control.value =
              typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? "");
        }
      });
      [...form.elements]
        .filter((control) => control.type === "checkbox" && !(control.name in values))
        .forEach((control) => (control.checked = false));
      markFields(form, fields, summary);
    } else {
      summary.tabIndex = -1;
      summary.focus();
    }
  }
  const el = (tag, text, cls) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };
  function rich(text) {
    const fragment = document.createDocumentFragment(),
      pattern = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;
    let end = 0;
    for (const match of text.matchAll(pattern)) {
      fragment.append(document.createTextNode(text.slice(end, match.index)));
      const bold = match[0].startsWith("**"),
        n = bold ? 2 : 1;
      fragment.append(el(bold ? "strong" : "em", match[0].slice(n, -n)));
      end = match.index + match[0].length;
    }
    fragment.append(document.createTextNode(text.slice(end)));
    return fragment;
  }
  async function api(route, body) {
    const response = await fetch("/api/v1/" + route, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error?.message || "Chưa thể lưu dữ liệu.");
      error.status = response.status;
      error.current = result.error?.currentAttempt;
      error.fields = result.error?.fieldErrors || {};
      throw error;
    }
    return result.data;
  }
  const fragmentToken = new URLSearchParams(location.hash.slice(1)).get("token");
  if (fragmentToken && /^[a-f0-9]{64}$/.test(fragmentToken)) {
    const input = document.querySelector('input[name="token"]');
    if (input) input.value = fragmentToken;
    history.replaceState(null, "", location.pathname);
    if (["/xac-minh-email", "/huy-nhac-hoc"].includes(location.pathname)) {
      const message = el("p", "Đang kiểm tra liên kết...", "feedback");
      message.setAttribute("role", "status");
      document.querySelector("main .container")?.append(message);
      api("email/consume", {
        token: fragmentToken,
        purpose: location.pathname === "/xac-minh-email" ? "verify" : "unsubscribe",
      })
        .then(() => {
          message.textContent =
            location.pathname === "/xac-minh-email"
              ? "Email đã được xác minh."
              : "Đã tắt nhắc học.";
        })
        .catch((error) => {
          message.textContent = error.message;
        });
    }
  }
  document
    .querySelector("[data-map-toggle]")
    ?.addEventListener("click", () =>
      document.querySelector("#path-list")?.classList.toggle("path-map"),
    );
  document.querySelectorAll("[data-native-rate]").forEach((select) => {
    const box = select.closest(".study-audio"),
      audio = box.querySelector("audio"),
      status = box.querySelector("[data-audio-error]"),
      retry = box.querySelector("[data-native-retry]");
    select.onchange = () => (audio.playbackRate = Number(select.value));
    audio.onerror = () => {
      status.textContent = "Chưa tải được audio. Bạn vẫn có thể ôn thẻ hoặc thử tải lại.";
      if (retry) retry.hidden = false;
    };
    audio.addEventListener("loadeddata", () => {
      status.textContent = "";
      if (retry) retry.hidden = true;
      audio.playbackRate = Number(select.value);
    });
    retry?.addEventListener("click", () => {
      status.textContent = "Đang tải lại audio…";
      retry.hidden = true;
      audio.load();
    });
  });
  document.querySelectorAll('[data-import-id][data-import-poll="1"]').forEach((box) => {
    async function refresh() {
      if (document.hidden) {
        setTimeout(refresh, 3000);
        return;
      }
      try {
        const response = await fetch("/api/v1/admin/import-status/" + box.dataset.importId, {
            credentials: "same-origin",
          }),
          result = await response.json();
        if (!response.ok) throw Error(result.error?.message || "Không đọc được tiến độ.");
        const s = result.data;
        box.querySelector("[data-import-status]").textContent =
          "Trạng thái: " + s.status + " · " + s.phase;
        const progress = box.querySelector("[data-import-progress]");
        progress.max = Math.max(1, s.total);
        progress.value = s.processed;
        box.querySelector("[data-import-count]").textContent =
          "Đã xử lý " +
          s.processed +
          " / " +
          s.total +
          " record. Đã xác nhận lưu: " +
          s.committed +
          ".";
        box.querySelector("[data-import-job]").textContent = s.job
          ? "Worker: " +
            s.job.status +
            " · lần thử " +
            s.job.attempts +
            " · lịch UTC " +
            s.job.available_at
          : "";
        const errors = box.querySelector("[data-import-errors]");
        errors.replaceChildren();
        s.errors.forEach((e) => {
          const li = document.createElement("li");
          li.textContent = "Record " + e.record + " · " + e.field + ": " + e.message;
          errors.append(li);
        });
        if (
          ["queued", "running"].includes(s.status) ||
          ["pending", "running"].includes(s.job?.status)
        )
          setTimeout(refresh, 3000);
      } catch (error) {
        box.querySelector("[data-import-status]").textContent =
          error.message + " Tải lại trang để kiểm tra; chưa xác nhận lưu.";
      }
    }
    setTimeout(refresh, 1000);
  });
  const ratings = document.querySelectorAll("[data-rating]");
  ratings.forEach((button) =>
    button.addEventListener("click", async () => {
      const group = button.closest("[data-card]"),
        card = button.closest(".review-card"),
        status = document.querySelector("#review-status");
      group.querySelectorAll("button").forEach((b) => (b.disabled = true));
      try {
        await api("review/rate", {
          cardId: Number(group.dataset.card),
          revision: Number(group.dataset.revision),
          requestKey: group.dataset.key,
          rating: button.dataset.rating,
          extra: group.dataset.extra === "1",
        });
        status.textContent = "Đã lưu lịch ôn mới.";
        card.hidden = true;
        const next = card.nextElementSibling;
        if (next?.classList.contains("review-card")) {
          next.hidden = false;
          next.querySelector("summary")?.focus();
        } else {
          status.textContent = "Bạn đã hoàn thành lượt ôn này. Lịch mới đã được lưu.";
          const a = el("a", "Về hôm nay", "button");
          a.href = "/hoc";
          status.append(a);
        }
      } catch (error) {
        status.textContent = navigator.onLine
          ? error.message
          : "Đang mất mạng. Lịch ôn chưa được lưu, hãy kết nối rồi thử lại.";
        group.querySelectorAll("button").forEach((b) => (b.disabled = false));
      }
    }),
  );
  const host = document.querySelector("#study-player");
  if (!host) return;
  let state = JSON.parse(document.querySelector("#study-state").textContent),
    busy = false,
    lastInteraction = Date.now();
  const key = "mce-draft:" + host.dataset.account + ":" + state.id;
  let local = {};
  try {
    local = JSON.parse(localStorage.getItem(key) || "{}");
  } catch {}
  let index = state.position || 0,
    draftTimer = null;
  const status = el("p", "", "save-status");
  status.setAttribute("role", "status");
  host.before(status);
  function localSave(id, response) {
    local[id] = response;
    try {
      localStorage.setItem(key, JSON.stringify(local));
      status.textContent = "Bản nháp đang lưu trên thiết bị. Chưa xác nhận lưu máy chủ.";
    } catch {
      status.textContent = "Thiết bị không cho lưu bản nháp. Hãy nộp khi có mạng.";
    }
  }
  async function send(action, body = {}, rerender = true, expectedRevision = null) {
    if (busy) {
      status.textContent = "Đang lưu thay đổi trước đó. Vui lòng đợi một chút rồi thử lại.";
      return false;
    }
    busy = true;
    host.setAttribute("aria-busy", "true");
    try {
      const revision = expectedRevision ?? state.revision;
      if (action !== "heartbeat")
        try {
          localStorage.setItem(key + ":outbox", JSON.stringify({ action, body, revision }));
        } catch {}
      state = await api("attempts/" + state.id + "/" + action, { ...body, revision });
      if (action !== "heartbeat") status.textContent = "Máy chủ đã xác nhận lưu.";
      if (action !== "heartbeat")
        try {
          localStorage.removeItem(key + ":outbox");
        } catch {}
      if (action === "submit" || action === "skip") {
        delete local[body.exerciseId];
        try {
          localStorage.setItem(key, JSON.stringify(local));
        } catch {}
      }
      if (action === "finish")
        try {
          localStorage.removeItem(key);
        } catch {}
      if (rerender) {
        render();
        if (["navigate", "submit", "skip", "finish"].includes(action)) {
          const target =
            action === "finish"
              ? host.querySelector(".panel.green h2")
              : host.querySelector("[data-feedback-heading]") ||
                host.querySelector(".exercise-panel h2");
          if (target) {
            target.tabIndex = -1;
            target.focus();
          }
        }
      }
      return true;
    } catch (error) {
      status.textContent = navigator.onLine
        ? error.message
        : "Đang mất mạng. Bản nháp giữ trên thiết bị; máy chủ chưa xác nhận lưu.";
      if (error.status === 422 && action !== "heartbeat")
        markFields(
          host,
          Object.keys(error.fields || {}).length
            ? error.fields
            : action === "submit"
              ? { response: error.message }
              : {},
          status,
        );
      if (action !== "heartbeat" && error.status && error.status < 500)
        try {
          localStorage.removeItem(key + ":outbox");
        } catch {}
      if (error.status === 409) {
        if (error.current) {
          state = error.current;
          render();
        }
        const reload = el("button", "Tải trạng thái mới", "button secondary");
        reload.onclick = () => location.reload();
        status.append(reload);
      }
      return false;
    } finally {
      busy = false;
      host.removeAttribute("aria-busy");
    }
  }
  const button = (text, fn, secondary = false) => {
    const b = el("button", text, "button" + (secondary ? " secondary" : ""));
    b.type = "button";
    b.onclick = fn;
    return b;
  };
  function audio(id, transcript, onError = null) {
    const box = el("div", undefined, "study-audio"),
      a = el("audio");
    a.controls = true;
    a.preload = "none";
    a.src = "/media/" + Number(id);
    if (!id) {
      box.append(el("p", "Chưa có tệp audio. Hãy thêm tệp có quyền sử dụng trước khi xuất bản."));
      return box;
    }
    const label = el("label", "Tốc độ "),
      select = el("select");
    select.setAttribute("aria-label", "Tốc độ phát audio");
    [0.75, 1, 1.25].forEach((n) => {
      const o = el("option", n + "x");
      o.value = n;
      o.selected = n === 1;
      select.append(o);
    });
    select.onchange = () => (a.playbackRate = Number(select.value));
    label.append(select);
    let failed = false;
    a.onerror = () => {
      status.textContent =
        "Không tải được audio. Hãy thử tải lại hoặc báo lỗi; chưa nộp câu nếu chưa nghe được.";
      if (!failed) {
        failed = true;
        box.append(button("Thử tải lại audio", () => a.load(), true));
        if (onError) onError();
      }
    };
    box.append(a, label);
    if (transcript) {
      const details = el("details"),
        summary = el("summary", "Bản chép lời");
      details.append(summary, el("p", transcript));
      box.append(details);
    }
    return box;
  }
  function renderBlock(b) {
    const box = el("section", undefined, "panel study-block");
    if (b.type === "heading") box.append(el("h2", b.text));
    else if (b.type === "audio") box.append(audio(b.audioId, b.transcript));
    else if (b.type === "table") {
      const scroll = el("div", undefined, "table-scroll"),
        table = el("table");
      b.text.split("\n").forEach((line, i) => {
        const tr = el("tr");
        line.split("|").forEach((cell) => tr.append(el(i === 0 ? "th" : "td", cell.trim())));
        table.append(tr);
      });
      scroll.append(table);
      box.append(scroll);
    } else if (b.type === "dialogue") {
      b.text.split("\n").forEach((line) => {
        const p = el("p"),
          colon = line.indexOf(":");
        if (colon >= 0)
          p.append(
            el("strong", line.slice(0, colon + 1)),
            document.createTextNode(line.slice(colon + 1)),
          );
        else p.textContent = line;
        box.append(p);
      });
    } else {
      if (b.type === "tip") box.append(el("strong", "Một chút lưu ý"));
      const text = el("div", undefined, "prose");
      text.append(rich(b.text));
      box.append(text);
    }
    if (state.status !== "finished") {
      const viewed = state.viewed.includes(b.id);
      const mark = button(
        viewed ? "✓ Đã đọc" : "Đánh dấu đã đọc",
        () => send("view", { block: b.id, position: index }),
        true,
      );
      mark.disabled = viewed;
      box.append(mark);
    }
    return box;
  }
  function exerciseCard(item) {
    const e = item.exercise,
      p = e.payload,
      box = el("section", undefined, "panel exercise-panel"),
      heading = el("h2");
    heading.tabIndex = -1;
    if (e.type === "correction" && p.errorSegment) {
      const chars = Array.from(p.prompt),
        { start, length } = p.errorSegment;
      heading.append(
        document.createTextNode(chars.slice(0, start).join("")),
        el("mark", chars.slice(start, start + length).join("")),
        document.createTextNode(chars.slice(start + length).join("")),
      );
    } else heading.textContent = p.prompt;
    box.append(heading);
    if (p.audioId)
      box.append(
        audio(p.audioId, item.feedback?.transcript, () => {
          if (!["submitted", "skipped", "unavailable"].includes(item.state))
            box.append(
              button(
                "Báo sự cố và bỏ qua nghe",
                () => send("audio_error", { exerciseId: e.id }),
                true,
              ),
            );
        }),
      );
    const submitted = ["submitted", "skipped", "unavailable"].includes(item.state),
      disabled = submitted || state.status === "finished";
    let value = disabled ? item.response : (local[e.id] ?? item.response ?? null);
    const change = (v) => {
      value = v;
      localSave(e.id, v);
      clearTimeout(draftTimer);
      const save = () => {
        if (busy) {
          draftTimer = setTimeout(save, 500);
          return;
        }
        if (navigator.onLine && state.status === "active")
          send("draft", { exerciseId: e.id, response: value }, false);
      };
      draftTimer = setTimeout(save, 900);
    };
    if (e.type === "flashcard") {
      const card = el("div", undefined, "lesson-flashcard"),
        front = el("div", undefined, "lesson-flashcard-face"),
        frontTitle = el("h3", "Mặt trước"),
        back = el("div", undefined, "lesson-flashcard-face");
      card.dataset.lessonFlashcard = "";
      front.dataset.flashcardFront = "";
      back.dataset.flashcardBack = "";
      back.id = "flashcard-back-" + e.id;
      frontTitle.tabIndex = -1;
      front.append(
        frontTitle,
        el(
          "p",
          "Hãy nhớ lại câu trả lời trước khi lật thẻ. Thẻ này được tự đánh giá, không có điểm đúng/sai tự động.",
        ),
      );
      const fields = el("fieldset"),
        label = el("label", "Ghi nhớ của bạn (không bắt buộc)"),
        input = el("textarea");
      fields.disabled = disabled;
      fields.dataset.field = "response";
      fields.append(el("legend", "Tự nhớ lại"));
      input.maxLength = 4000;
      input.rows = 3;
      input.value = typeof value === "string" ? value : "";
      input.oninput = () => change(input.value);
      label.append(input);
      fields.append(label);
      front.append(fields);
      if (!disabled) {
        const reveal = button(
          state.mode === "test"
            ? "Nộp thẻ — xem mặt sau khi hoàn thành bài"
            : "Lật thẻ và tự đánh giá",
          () => {
            clearTimeout(draftTimer);
            send("submit", { exerciseId: e.id, response: value ?? "" });
          },
        );
        reveal.dataset.flashcardReveal = "";
        front.append(
          button(
            "Lưu bản nháp",
            () => {
              clearTimeout(draftTimer);
              send("draft", { exerciseId: e.id, response: value ?? "" }, false);
            },
            true,
          ),
          reveal,
          button(
            "Bỏ qua thẻ",
            () => {
              clearTimeout(draftTimer);
              send("skip", { exerciseId: e.id });
            },
            true,
          ),
        );
      } else
        front.append(
          el("p", item.state === "skipped" ? "Đã bỏ qua thẻ." : "Đã nộp — giữ ghi nhớ lần đầu."),
        );
      card.append(front);
      box.append(card);
      if (item.feedback) {
        const g = item.feedback,
          title = el("h3", "Mặt sau · Tự đánh giá");
        title.tabIndex = -1;
        title.dataset.feedbackHeading = "";
        back.append(
          title,
          el("p", g.acceptedAnswerDisplay, "flashcard-answer"),
          el("p", g.feedback),
        );
        if (g.criteria) {
          back.append(el("p", "Đối chiếu với tiêu chí:"));
          const criteria = el("ul");
          (Array.isArray(g.criteria) ? g.criteria : [g.criteria]).forEach((text) =>
            criteria.append(el("li", text)),
          );
          back.append(criteria);
        }
        back.append(
          el(
            "p",
            "Tự kiểm tra mức nhớ của bạn. Thẻ này không được tính vào độ chính xác khách quan.",
          ),
        );
        front.hidden = true;
        card.append(back);
        const flip = button(
          "Xem mặt trước",
          () => {
            const showBack = back.hidden;
            back.hidden = !showBack;
            front.hidden = showBack;
            flip.textContent = showBack ? "Xem mặt trước" : "Xem mặt sau";
            flip.setAttribute("aria-expanded", String(showBack));
            (showBack ? title : frontTitle).focus();
          },
          true,
        );
        flip.dataset.flashcardFlip = "";
        flip.setAttribute("aria-controls", back.id);
        flip.setAttribute("aria-expanded", "true");
        card.append(flip);
      } else if (disabled)
        card.append(el("p", "Mặt sau sẽ xuất hiện sau khi hoàn thành bài kiểm tra."));
      return box;
    }
    const fields = el("fieldset");
    fields.disabled = disabled;
    fields.append(el("legend", "Câu trả lời của bạn"));
    if (["choice", "listening_choice", "true_false"].includes(e.type)) {
      const choices = e.type === "true_false" ? { true: "Đúng", false: "Sai" } : p.choices;
      Object.entries(choices).forEach(([id, text]) => {
        const label = el("label", undefined, "answer-label"),
          input = el("input");
        input.type = "radio";
        input.name = "response";
        input.value = id;
        input.checked = value === (e.type === "true_false" ? id === "true" : id);
        input.onchange = () => change(e.type === "true_false" ? id === "true" : id);
        label.append(input, document.createTextNode(text));
        fields.append(label);
      });
    } else if (["fill", "listening_fill"].includes(e.type)) {
      if (!value || typeof value !== "object") value = {};
      p.blanks.forEach((id, n) => {
        const label = el("label", "Ô trống " + (n + 1)),
          input = el("input");
        input.value = value[id] ?? "";
        input.autocomplete = "off";
        input.oninput = () => change({ ...value, [id]: input.value });
        label.append(input);
        fields.append(label);
      });
    } else if (e.type === "match") {
      if (!value || typeof value !== "object") value = {};
      Object.entries(p.left).forEach(([id, text]) => {
        const label = el("label", text + " "),
          select = el("select");
        const blank = el("option", "Chọn nghĩa phù hợp");
        blank.value = "";
        select.append(blank);
        Object.entries(p.right).forEach(([rid, right]) => {
          const o = el("option", right);
          o.value = rid;
          o.selected = value[id] === rid;
          select.append(o);
        });
        select.onchange = () => change({ ...value, [id]: select.value });
        label.append(select);
        fields.append(label);
      });
    } else if (e.type === "order") {
      if (!Array.isArray(value)) value = [];
      const available = el("div", undefined, "token-list"),
        selected = el("ol"),
        announcement = el("p");
      announcement.setAttribute("role", "status");
      announcement.setAttribute("aria-live", "polite");
      const draw = (focusId = null, focusAction = "remove") => {
        available.replaceChildren();
        selected.replaceChildren();
        Object.entries(p.tokens).forEach(([id, text]) => {
          if (!value.includes(id)) {
            const add = button(
              text,
              () => {
                change([...value, id]);
                draw(id);
                announcement.textContent = "Đã thêm " + text + " ở vị trí " + value.length;
              },
              true,
            );
            add.dataset.orderToken = id;
            add.dataset.orderAction = "add";
            add.setAttribute("aria-label", "Thêm " + text);
            available.append(add);
          }
        });
        value.forEach((id, i) => {
          const li = el("li"),
            remove = button(
              "Bỏ " + p.tokens[id],
              () => {
                change(value.filter((_, n) => n !== i));
                draw(id, "add");
                announcement.textContent = "Đã bỏ " + p.tokens[id];
              },
              true,
            );
          remove.dataset.orderToken = id;
          remove.dataset.orderAction = "remove";
          li.append(el("span", p.tokens[id]), remove);
          for (const [action, delta, label] of [
            ["up", -1, "Lên"],
            ["down", 1, "Xuống"],
          ])
            if (i + delta >= 0 && i + delta < value.length) {
              const move = button(
                label,
                () => {
                  const next = [...value];
                  [next[i], next[i + delta]] = [next[i + delta], next[i]];
                  change(next);
                  draw(id, action);
                  announcement.textContent = p.tokens[id] + " ở vị trí " + (i + delta + 1);
                },
                true,
              );
              move.dataset.orderToken = id;
              move.dataset.orderAction = action;
              move.setAttribute(
                "aria-label",
                "Đưa " + p.tokens[id] + " đến vị trí " + (i + delta + 1),
              );
              li.append(move);
            }
          selected.append(li);
        });
        if (focusId) {
          const buttons = [...fields.querySelectorAll("[data-order-token]")];
          (
            buttons.find(
              (b) => b.dataset.orderToken === focusId && b.dataset.orderAction === focusAction,
            ) || buttons.find((b) => b.dataset.orderToken === focusId)
          )?.focus();
        }
      };
      fields.append(
        el("p", "Chạm hoặc dùng bàn phím chọn từ. Dùng Lên/Xuống để đổi vị trí, Bỏ để chọn lại."),
        available,
        selected,
        announcement,
      );
      draw();
    } else {
      const label = el(
          "label",
          ["self", "flashcard"].includes(e.type)
            ? "Câu trả lời hoặc ghi nhớ của bạn (tự đánh giá)"
            : "Nhập câu trả lời",
        ),
        input = el("textarea");
      input.maxLength = 4000;
      input.rows = 3;
      input.value = typeof value === "string" ? value : "";
      input.oninput = () => change(input.value);
      label.append(input);
      fields.append(label);
    }
    fields.dataset.field = "response";
    fields.setAttribute("aria-label", "Câu trả lời");
    box.append(fields);
    if (!disabled) {
      box.append(
        button(
          "Lưu bản nháp",
          () => {
            clearTimeout(draftTimer);
            send("draft", { exerciseId: e.id, response: value }, false);
          },
          true,
        ),
        button(
          ["self", "flashcard"].includes(e.type)
            ? "Xem đáp án mẫu và tự đánh giá"
            : "Nộp câu trả lời",
          () => {
            clearTimeout(draftTimer);
            send("submit", { exerciseId: e.id, response: value });
          },
        ),
        button(
          "Bỏ qua câu",
          () => {
            clearTimeout(draftTimer);
            send("skip", { exerciseId: e.id });
          },
          true,
        ),
      );
    } else
      box.append(
        el(
          "p",
          item.state === "unavailable"
            ? "Audio chưa khả dụng - không tính sai"
            : item.state === "skipped"
              ? "Đã bỏ qua"
              : "Đã nộp - giữ kết quả lần đầu.",
        ),
      );
    if (item.feedback) {
      const g = item.feedback,
        feedbackHeading = el(
          "h3",
          g.gradingMode === "unavailable"
            ? "Audio chưa khả dụng"
            : g.gradingMode === "self_assessed"
              ? "Tự đánh giá"
              : g.isCorrect
                ? "✓ Chính xác"
                : "Cần ôn thêm",
        );
      feedbackHeading.dataset.feedbackHeading = "";
      feedbackHeading.tabIndex = -1;
      box.append(
        feedbackHeading,
        el("p", "Đáp án: " + g.acceptedAnswerDisplay),
        el("p", g.feedback),
      );
      if (g.criteria)
        box.append(
          el("p", "Tiêu chí: " + (Array.isArray(g.criteria) ? g.criteria.join("; ") : g.criteria)),
        );
      if (g.maxScore > 1) box.append(el("p", "Điểm từng phần: " + g.score + "/" + g.maxScore));
      if (
        state.mode !== "test" &&
        g.gradingMode !== "unavailable" &&
        !["self", "flashcard"].includes(e.type)
      ) {
        const trial = el("p");
        box.append(
          button(
            "Luyện lại câu này (giữ điểm lần đầu)",
            () => {
              fields.disabled = false;
              status.textContent = "Bạn đang luyện lại. Điểm lần đầu và lịch sử không thay đổi.";
            },
            true,
          ),
        );
        box.append(
          button(
            "Kiểm tra lần luyện lại",
            async () => {
              try {
                const r = await api("attempts/" + state.id + "/retry", {
                  exerciseId: e.id,
                  response: value,
                });
                trial.textContent =
                  (r.feedback.isCorrect ? "✓ Chính xác. " : "Cần ôn thêm. ") +
                  r.feedback.feedback +
                  " Điểm lần đầu được giữ nguyên.";
              } catch (error) {
                trial.textContent = error.message;
              }
            },
            true,
          ),
          trial,
        );
      }
      if (state.canSaveConcepts && host.dataset.account !== "guest" && g.isCorrect === false)
        box.append(
          button(
            "Đưa kiến thức này vào ôn tập",
            async () => {
              try {
                await api("review/concept", { attemptId: state.id, exerciseId: e.id });
                status.textContent = "Đã thêm kiến thức vào lịch ôn.";
              } catch (error) {
                status.textContent = error.message;
              }
            },
            true,
          ),
        );
    }
    return box;
  }
  function report() {
    if (host.dataset.account === "guest") return;
    const details = el("details"),
      summary = el("summary", "Báo lỗi nội dung"),
      form = el("form");
    details.append(summary, form);
    const label = el("label", "Loại lỗi "),
      category = el("select");
    category.name = "category";
    Object.entries({ answer: "Đáp án", typo: "Chính tả", audio: "Audio", other: "Khác" }).forEach(
      ([id, text]) => {
        const o = el("option", text);
        o.value = id;
        category.append(o);
      },
    );
    label.append(category);
    const textLabel = el("label", "Mô tả lỗi "),
      textarea = el("textarea");
    textarea.name = "description";
    textarea.required = true;
    textarea.maxLength = 2000;
    textLabel.append(textarea);
    const submit = el("button", "Gửi báo lỗi", "button secondary");
    submit.type = "submit";
    form.append(label, textLabel, submit);
    form.onsubmit = async (event) => {
      event.preventDefault();
      try {
        await api("reports", {
          versionId: state.versionId,
          position: state.items[index]?.exercise.id ?? "lesson",
          category: category.value,
          description: textarea.value,
        });
        status.textContent = "Đã gửi báo lỗi để biên tập viên kiểm tra.";
        details.open = false;
      } catch (error) {
        status.textContent = error.message;
        if (error.status === 422) markFields(form, error.fields, status);
      }
    };
    return details;
  }
  function render() {
    host.replaceChildren();
    const done = state.items.filter((i) =>
      ["submitted", "skipped", "unavailable"].includes(i.state),
    ).length;
    const progress = el("progress");
    progress.max = Math.max(1, state.items.length + state.blocks.length);
    progress.value = done + state.viewed.length;
    progress.setAttribute("aria-label", "Tiến độ bài học");
    host.append(progress, el("p", state.objectives));
    if (state.status === "finished") {
      const result = el("section", undefined, "panel green");
      result.append(
        el("h2", "Bạn đã hoàn thành bài học"),
        el("p", "Hãy xem lại kiến thức và những câu cần ôn ở bên dưới."),
      );
      if (state.maxScore) {
        const percent = Math.floor((100 * state.score) / state.maxScore);
        result.append(
          el(
            "p",
            "Điểm khách quan: " +
              state.score +
              "/" +
              state.maxScore +
              " (" +
              percent +
              "%) - " +
              (state.audioUnavailable
                ? "Chưa đánh giá đạt vì có sự cố audio"
                : percent >= state.passThreshold
                  ? "Đã đạt"
                  : "Cần luyện thêm"),
          ),
        );
      } else result.append(el("p", "Bài tự đánh giá không có phần trăm điểm khách quan."));
      if (host.dataset.account === "guest") {
        const a = el("a", "Đăng ký để lưu bài học", "button");
        a.href = "/register";
        result.append(a, el("p", "Sau đăng ký, vào Hôm nay và xác nhận chuyển bài học thử."));
      } else
        result.append(
          el(
            "p",
            state.mode === "preview"
              ? "Kết quả xem trước không lưu tiến độ hoặc cấp thưởng."
              : "Tiến độ đã được ghi trên máy chủ. XP không đại diện trình độ tiếng Anh.",
          ),
        );
      if (state.suggestion) {
        const suggestion = el("a", "Xem lộ trình được gợi ý", "button secondary");
        suggestion.href = "/lo-trinh/" + encodeURIComponent(state.suggestion);
        result.append(
          el(
            "p",
            "Gợi ý từ bộ câu mẫu chưa hiệu chuẩn, không phải xếp hạng CEFR. Câu bỏ qua: " +
              state.skipped,
          ),
          suggestion,
        );
      }
      const back = el("a", "Bài tiếp theo và ôn tập", "button");
      back.href = "/hoc";
      result.append(back);
      host.append(result);
    }
    const contents = el("details");
    contents.append(el("summary", "Nội dung bài học"));
    state.blocks.forEach((b) => contents.append(renderBlock(b)));
    contents.open = state.status !== "finished";
    host.append(contents);
    if (state.items.length) {
      index = Math.max(0, Math.min(index, state.items.length - 1));
      const move = async (n) => {
        index = n;
        if (state.status === "active") await send("navigate", { position: n });
        else render();
      };
      const nav = el("nav", undefined, "product-nav");
      nav.setAttribute("aria-label", "Các câu luyện tập");
      state.items.forEach((item, i) => {
        const b = button(
          String(i + 1) + (item.state === "submitted" ? " ✓" : ""),
          () => move(i),
          true,
        );
        b.setAttribute("aria-current", i === index ? "step" : "false");
        nav.append(b);
      });
      host.append(nav, exerciseCard(state.items[index]));
      const controls = el("div", undefined, "player-controls");
      if (index > 0) controls.append(button("Câu trước", () => move(index - 1), true));
      if (index < state.items.length - 1)
        controls.append(button("Câu sau", () => move(index + 1), true));
      host.append(controls);
    }
    if (state.status !== "finished")
      host.append(button("Hoàn thành bài học", () => send("finish")));
    const r = report();
    if (r) host.append(r);
  }
  window.addEventListener(
    "offline",
    () => (status.textContent = "Đang mất mạng. Bản nháp chỉ lưu trên thiết bị."),
  );
  window.addEventListener("online", async () => {
    status.textContent = "Đã có mạng. Đang gửi lại thao tác chưa được xác nhận.";
    try {
      const pending = JSON.parse(localStorage.getItem(key + ":outbox") || "null");
      if (pending && !(await send(pending.action, pending.body, true, pending.revision))) return;
      for (const [exerciseId, response] of Object.entries(local)) {
        const item = state.items.find((i) => i.exercise.id === exerciseId);
        if (item && !["submitted", "skipped", "unavailable"].includes(item.state)) {
          if (!(await send("draft", { exerciseId, response }, false))) return;
        }
      }
      status.textContent = "Đã kết nối và đồng bộ các bản nháp khả dụng.";
    } catch {
      status.textContent = "Đã có mạng. Hãy lưu lại bản nháp khi thuận tiện.";
    }
  });
  ["pointerdown", "keydown"].forEach((name) =>
    document.addEventListener(name, () => (lastInteraction = Date.now()), { passive: true }),
  );
  setInterval(() => {
    if (
      navigator.onLine &&
      state.status === "active" &&
      document.visibilityState === "visible" &&
      Date.now() - lastInteraction < 45000 &&
      !busy
    )
      send("heartbeat", { active: true }, false);
  }, 30000);
  render();
})();
