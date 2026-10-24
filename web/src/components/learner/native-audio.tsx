"use client";

import { useRef, useState } from "react";

// The `.study-audio` box with a speed select (assets/js/product.js, [data-native-rate]).
// `review` adds the label, live region and retry button the review card had.

export function NativeAudio({ id, review = false }: { id: number; review?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [rate, setRate] = useState("1");
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  return (
    <div className="study-audio">
      <audio
        ref={audio}
        aria-label={review ? "Phát âm từ trên thẻ ôn" : undefined}
        controls
        preload="none"
        src={`/media/${id}`}
        onError={() => {
          setStatus("Chưa tải được audio. Bạn vẫn có thể ôn thẻ hoặc thử tải lại.");
          setFailed(true);
        }}
        onLoadedData={() => {
          setStatus("");
          setFailed(false);
          if (audio.current) audio.current.playbackRate = Number(rate);
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
      <p data-audio-error="" role="status" aria-live={review ? "polite" : undefined}>
        {status}
      </p>
      {review ? (
        <button
          type="button"
          className="button secondary"
          data-native-retry=""
          hidden={!failed}
          onClick={() => {
            setStatus("Đang tải lại audio…");
            setFailed(false);
            audio.current?.load();
          }}
        >
          Thử tải lại audio
        </button>
      ) : null}
    </div>
  );
}
