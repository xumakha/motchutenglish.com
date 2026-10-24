import { randomBytes } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The Server Action wrapper (src/server/route-action.ts) without a browser: Next's request APIs are
// replaced by an in-memory cookie jar, and redirect() throws like the real one.

const jar = new Map<string, string>();
const calls = { refresh: 0, updateTag: [] as string[] };

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () =>
    new Headers({ "x-forwarded-for": "203.0.113.9", "x-request-id": "0123456789abcdef" }),
}));
vi.mock("next/cache", () => ({
  refresh: () => void calls.refresh++,
  updateTag: (tag: string) => void calls.updateTag.push(tag),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${to}` });
  },
  unstable_rethrow: (error: unknown) => {
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw error;
  },
}));

const { routeAction } = await import("@/server/route-action");
const { pool } = await import("@/db/client");
const { idleState } = await import("@/server/form-state");
const { lessonId } = await import("../e2e/db");
const { publishedLesson } = await import("./fixtures");

afterAll(() => pool().end());
beforeEach(() => {
  jar.clear();
  calls.refresh = 0;
  calls.updateTag = [];
});

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("routeAction", () => {
  it("returns the route's error state with typed values echoed back (secrets dropped)", async () => {
    const state = await routeAction("profile")(
      idleState,
      form({ goal: "foundation", password: "x" }),
    );
    expect(state).toMatchObject({
      status: "error",
      message: "Bạn cần đăng nhập để thực hiện thao tác này.",
    });
    expect(state.values).toEqual({ goal: "foundation" });
  });

  it("validates input with the contract schema", async () => {
    const state = await routeAction("attempts.start")(
      idleState,
      form({ lessonId: "abc", requestKey: "x" }),
    );
    expect(state.status).toBe("error");
    expect(Object.keys(state.fieldErrors ?? {})).toEqual(
      expect.arrayContaining(["lessonId", "requestKey"]),
    );
  });

  it("starts a guest attempt: sets the guest cookie and follows the redirect", async () => {
    let id: number;
    try {
      id = await lessonId("chao-hoi-tung-buoc");
    } catch {
      id = (await publishedLesson()).lessonId;
    }
    const key = randomBytes(16).toString("hex");
    await expect(
      routeAction("attempts.start")(idleState, form({ lessonId: String(id), requestKey: key })),
    ).rejects.toMatchObject({ digest: `NEXT_REDIRECT;/hoc/luot/${key}` });
    expect(jar.get("mce_guest")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("stores guest marketing consent in its cookie and refreshes the page on success", async () => {
    const state = await routeAction("analytics.consent")(idleState, form({ enabled: "no" }));
    expect(state).toEqual({ status: "success", message: "Đã lưu thay đổi.", data: undefined });
    expect(calls.refresh).toBe(1);
    expect(jar.has("mce_marketing")).toBe(false);
  });

  it("rejects malformed JSON documents before they reach the handler", async () => {
    const state = await routeAction("admin.version")(
      idleState,
      form({ title: "x", document: "{oops" }),
    );
    expect(state).toMatchObject({ status: "error", message: "JSON nội dung không hợp lệ." });
  });
});
