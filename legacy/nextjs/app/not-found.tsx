import Link from "next/link";
export default function NotFound() {
  return (
    <div className="container page empty-page">
      <span className="eyebrow">404 · LẠC ĐƯỜNG MỘT CHÚT</span>
      <h1>Trang này chưa có.</h1>
      <p>Quay về trang chủ để tiếp tục học nhé.</p>
      <Link className="button" href="/">
        Về trang chủ →
      </Link>
    </div>
  );
}
