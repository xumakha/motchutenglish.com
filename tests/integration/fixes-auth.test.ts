import { randomBytes, randomInt } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Fix 8 through the real login Server Action. Next's request APIs are replaced by an in-memory
// cookie jar and a fixed client IP per test; redirect() throws like the real one.

const jar = new Map<string, string>();
let ip = "203.0.113.1";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => new Headers({ "x-forwarded-for": ip, "x-request-id": "0123456789abcdef" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${to}` });
  },
  unstable_rethrow: (error: unknown) => {
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw error;
  },
}));

const { login } = await import("@/auth/actions");
const { auth } = await import("@/auth/auth");
const { pool } = await import("@/db/client");
const { idleState } = await import("@/server/form-state");

afterAll(() => pool().end());
beforeEach(() => {
  jar.clear();
  ip = `198.51.${randomInt(256)}.${randomInt(1, 255)}`;
});

const PASSWORD = "mat-khau-an-toan-1";

async function account(): Promise<string> {
  const email = `fix8-${randomBytes(5).toString("hex")}@example.test`;
  await auth().api.signUpEmail({ body: { name: "Fix 8", email, password: PASSWORD } });
  return email;
}

/** Submit the login form; "ok" when it redirects to /account, else the form message. */
async function attempt(email: string, password: string): Promise<string> {
  jar.clear(); // a fresh browser each time, so the signed-in redirect never short-circuits
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  try {
    const state = await login(idleState, form);
    return state.message ?? state.status;
  } catch (error) {
    if ((error as { digest?: string }).digest === "NEXT_REDIRECT;/account") return "ok";
    throw error;
  }
}

describe("fix 8: the login limiter counts failures only, per IP + email", () => {
  it("never locks out repeated successful logins from one IP", async () => {
    // PHP counted every login: the 16th within 15 minutes from shared Wi-Fi was refused.
    const email = await account();
    for (let i = 0; i < 20; i++) expect(await attempt(email, PASSWORD)).toBe("ok");
  }, 60_000);

  it("locks one email after 15 failures; other accounts on the same IP still sign in", async () => {
    const email = await account();
    const other = await account();
    for (let i = 0; i < 15; i++)
      expect(await attempt(email, `sai-${i}`)).toBe("Email hoặc mật khẩu chưa đúng.");
    expect(await attempt(email, PASSWORD)).toContain("Bạn đã thử quá nhiều lần.");
    expect(await attempt(other, PASSWORD)).toBe("ok");
  }, 60_000);

  it("a success clears the failures for that email", async () => {
    const email = await account();
    for (let i = 0; i < 14; i++) await attempt(email, `sai-${i}`);
    expect(await attempt(email, PASSWORD)).toBe("ok");
    for (let i = 0; i < 14; i++)
      expect(await attempt(email, `sai-${i}`)).toBe("Email hoặc mật khẩu chưa đúng.");
    expect(await attempt(email, PASSWORD)).toBe("ok");
  }, 60_000);
});
