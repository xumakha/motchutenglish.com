import Link from "next/link";
import { currentUser } from "@/auth/session";

/** Header account links (PHP partials/auth_nav.php). Reads the session, so render it in Suspense. */
export async function AuthNav() {
  const user = await currentUser();
  if (!user)
    return (
      <>
        <Link href="/login">Đăng nhập</Link>
        <Link className="button small" href="/register">
          Đăng ký
        </Link>
      </>
    );
  return (
    <>
      <Link href="/account">{user.name}</Link>
      <form method="post" action="/logout">
        <button type="submit" className="link-button">
          Đăng xuất
        </button>
      </form>
    </>
  );
}
