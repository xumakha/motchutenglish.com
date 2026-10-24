"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  requestPasswordResetAction,
  resetPasswordAction,
  saveCampaignConsent,
  saveVocabulary,
} from "@/actions/routes";
import { ActionStatus } from "@/components/route-form";
import { idleState, type FormState } from "@/server/form-state";

// Client parts of the public screens: what assets/js/product.js did on these pages, plus the
// forms that keep their state across a submit.

/** [data-map-toggle]: switches #path-list between the list and the map layout. */
export function MapToggle() {
  return (
    <button
      type="button"
      className="button secondary"
      data-map-toggle=""
      onClick={() => document.querySelector("#path-list")?.classList.toggle("path-map")}
    >
      Đổi giữa bản đồ và danh sách
    </button>
  );
}

/** .study-audio with the native playback-rate select and the load-error line. */
export function WordAudio({ src }: { src: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [rate, setRate] = useState("1");
  const [error, setError] = useState("");
  return (
    <div className="study-audio">
      <audio
        ref={audio}
        controls
        preload="none"
        src={src}
        onError={() => setError("Chưa tải được audio. Bạn vẫn có thể ôn thẻ hoặc thử tải lại.")}
        onLoadedData={(e) => {
          setError("");
          e.currentTarget.playbackRate = Number(rate);
        }}
      />
      <label>
        Tốc độ{" "}
        <select
          data-native-rate=""
          value={rate}
          onChange={(e) => {
            setRate(e.target.value);
            if (audio.current) audio.current.playbackRate = Number(e.target.value);
          }}
        >
          <option value="0.75">0.75x</option>
          <option value="1">1x</option>
          <option value="1.25">1.25x</option>
        </select>
      </label>
      <p data-audio-error="" role="status">
        {error}
      </p>
    </div>
  );
}

/** Field error under a wrapped label, like markFields() in product.js. */
function FieldError({ state, name }: { state: FormState; name: string }) {
  const message = state.fieldErrors?.[name];
  return message ? (
    <p className="field-error" id={`field-error-${name}`}>
      {message}
    </p>
  ) : null;
}

const invalid = (state: FormState, name: string) =>
  state.fieldErrors?.[name]
    ? { "aria-invalid": true as const, "aria-describedby": `field-error-${name}` }
    : {};

/** The vocabulary/save form under each public word for signed-in learners. */
export function SaveWordForm({ senseId }: { senseId: number }) {
  const [state, action, pending] = useActionState(saveVocabulary, idleState);
  return (
    <form action={action} className="auth-form">
      <ActionStatus state={state} />
      <input type="hidden" name="senseId" value={senseId} />
      <label>
        Ghi chú riêng
        <textarea
          name="notes"
          maxLength={2000}
          defaultValue={state.values?.notes ?? ""}
          {...invalid(state, "notes")}
        />
      </label>
      <FieldError state={state} name="notes" />
      <label>
        <input type="checkbox" name="review" value="1" /> Thêm vào lịch ôn
      </label>
      <button className="button" disabled={pending}>
        Lưu từ
      </button>
    </form>
  );
}

/** campaign-consent.php form: two submit buttons send enabled=yes|no. */
export function CampaignConsentForm({
  campaignSlug,
  labels,
}: {
  campaignSlug: string;
  labels: { source: string; medium: string; campaign: string };
}) {
  const [state, action, pending] = useActionState(saveCampaignConsent, idleState);
  return (
    <form action={action} className="auth-form">
      <ActionStatus state={state} />
      <input type="hidden" name="campaignSlug" value={campaignSlug} />
      <input type="hidden" name="utm_source" value={labels.source} />
      <input type="hidden" name="utm_medium" value={labels.medium} />
      <input type="hidden" name="utm_campaign" value={labels.campaign} />
      <button className="button secondary" name="enabled" value="yes" disabled={pending}>
        Đồng ý đo lường
      </button>
      <button className="button secondary" name="enabled" value="no" disabled={pending}>
        Từ chối / rút lại đồng ý
      </button>
    </form>
  );
}

/** A `#token=` fragment (64 hex), removed from the address bar once read (product.js). */
function useFragmentToken(): string | null {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const value = new URLSearchParams(location.hash.slice(1)).get("token");
    if (value && /^[a-f0-9]{64}$/.test(value)) {
      history.replaceState(null, "", location.pathname);
      // Reading the fragment is only possible after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToken(value);
    }
  }, []);
  return token;
}

/**
 * The quen-mat-khau / dat-lai-mat-khau panel. The reset token arrives in the URL fragment, which
 * never reaches the server, so it is copied into the hidden field here.
 */
export function PasswordResetPanel({
  mode,
  mailConfigured,
}: {
  mode: "request" | "reset";
  mailConfigured: boolean;
}) {
  const [state, action, pending] = useActionState(
    mode === "request" ? requestPasswordResetAction : resetPasswordAction,
    idleState,
  );
  const token = useFragmentToken();
  return (
    <>
      <ActionStatus state={state} />
      <section className="panel narrow">
        <p>
          {mailConfigured
            ? "Liên kết có hạn dùng và chỉ sử dụng một lần."
            : "Email chưa được cấu hình. Chưa thể gửi liên kết đặt lại mật khẩu."}
        </p>
        <form action={action} className="auth-form">
          {mode === "request" ? (
            <>
              <label>
                Email
                <input
                  type="email"
                  name="email"
                  required
                  defaultValue={state.values?.email ?? ""}
                  {...invalid(state, "email")}
                />
              </label>
              <FieldError state={state} name="email" />
            </>
          ) : (
            <>
              <input type="hidden" name="token" value={token ?? ""} />
              <label>
                Mật khẩu mới
                <input
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  {...invalid(state, "password")}
                />
              </label>
              <FieldError state={state} name="password" />
            </>
          )}
          <button className="button" disabled={pending}>
            Tiếp tục
          </button>
        </form>
      </section>
    </>
  );
}

/** xac-minh-email / huy-nhac-hoc: posts the fragment token to email/consume and shows the result. */
export function EmailTokenResult({ purpose }: { purpose: "verify" | "unsubscribe" }) {
  const token = useFragmentToken();
  const [message, setMessage] = useState("Đang kiểm tra liên kết...");
  useEffect(() => {
    if (!token) return;
    let live = true;
    fetch("/api/v1/email/consume", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, purpose }),
    })
      .then(async (response) => {
        const result = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        if (!response.ok) throw new Error(result.error?.message || "Chưa thể lưu dữ liệu.");
      })
      .then(
        () =>
          live && setMessage(purpose === "verify" ? "Email đã được xác minh." : "Đã tắt nhắc học."),
        (error: Error) => live && setMessage(error.message),
      );
    return () => {
      live = false;
    };
  }, [token, purpose]);
  if (!token) return null;
  return (
    <p className="feedback" role="status">
      {message}
    </p>
  );
}
