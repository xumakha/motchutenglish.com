import { redirect } from "next/navigation";
import { currentUser } from "@/auth/session";

/** Signed-in visitors on /login or /register go to /account, like the PHP auth_redirect. */
export async function RedirectIfSignedIn({ children }: { children: React.ReactNode }) {
  if (await currentUser()) redirect("/account");
  return children;
}
