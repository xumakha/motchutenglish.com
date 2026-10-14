"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="container page empty-page">
      <h1>Có lỗi khi mở trang.</h1>
      <p>Hãy thử tải lại để tiếp tục học.</p>
      <button className="button" onClick={reset}>
        Thử lại
      </button>
    </div>
  );
}
