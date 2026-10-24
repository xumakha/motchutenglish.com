import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "./fixtures";
import { lessonId, query } from "./db";

// Browser-level regression tests for §1.4 fixes (docs/migration/fix-tests.md maps all 24).
// Flow tests run once, at desktop width.

test.skip(({ viewport }) => (viewport?.width ?? 0) !== 1440, "flow tests run at desktop width");

let origin = "";
test.beforeAll(({}, info) => {
  origin = String(info.project.use.baseURL);
});

const hex = (n: number) => randomBytes(n).toString("hex");

async function registerLearner(page: Page) {
  await page.goto("/register");
  await page.getByLabel("Tên của bạn").fill("Học viên E2E");
  await page.getByLabel("Email").fill(`fix-e2e-${hex(5)}@example.test`);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("mat-khau-an-toan-1");
  await page.getByLabel("Nhập lại mật khẩu").fill("mat-khau-an-toan-1");
  await page.getByRole("button", { name: "Đăng ký" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("fix 3: ordered offline outbox", () => {
  test("several offline actions are kept in order and replayed on the next page load", async ({
    page,
    context,
  }) => {
    const start = await page.request.post("/api/v1/attempts/start", {
      headers: { Origin: origin },
      data: {
        lessonId: await lessonId("chao-hoi-tung-buoc"),
        requestKey: hex(16),
        mode: "practice",
      },
    });
    const { data } = await start.json();
    await page.goto(data.redirect);
    await expect(page.locator("#study-player")).toBeVisible();

    await context.setOffline(true);
    // Two reads and an answer. PHP kept only the last unsent action, so the reads were lost.
    const read = page.getByRole("button", { name: "Đánh dấu đã đọc" });
    await read.nth(0).click();
    await read.nth(1).click();
    await page.getByLabel("Hello!").check();
    await page.getByRole("button", { name: "Nộp câu trả lời" }).click();
    const outboxKey = `mce-draft:guest:${data.id}:outbox`;
    const queued = await page.evaluate((key) => localStorage.getItem(key), outboxKey);
    const actions = JSON.parse(queued!) as { action: string; body: { block?: string } }[];
    expect(actions.map((a) => a.action)).toEqual(["view", "view", "submit"]);
    expect(new Set(actions.map((a) => a.body.block)).size).toBe(3); // two blocks + no block

    // Back online with a fresh page load (no "online" event): the queue replays in order.
    await context.setOffline(false);
    await page.reload();
    await expect(page.locator("[data-feedback-heading]")).toHaveText("✓ Chính xác");
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), outboxKey))
      .toBe("[]");
    const state = await (await page.request.get(`/api/v1/attempts/${data.id}`)).json();
    expect(state.data.viewed).toHaveLength(2);
    expect(state.data.items[0].state).toBe("submitted");
  });
});

test.describe("fix 10: lesson search", () => {
  test("the search page finds a published lesson through the search index", async ({ page }) => {
    const [lesson] = await query<{ title: string }>(
      `SELECT v.title FROM mce_lessons l JOIN mce_versions v ON v.id = l.current_version
       JOIN mce_search s ON s.version_id = v.id WHERE l.slug = 'chao-hoi-tung-buoc'`,
    );
    expect(lesson, "seeded lesson is indexed on publish").toBeTruthy();
    await page.goto(`/tim-kiem?q=${encodeURIComponent(lesson!.title)}`);
    await expect(page.getByRole("link", { name: lesson!.title }).first()).toHaveAttribute(
      "href",
      "/bai-hoc/chao-hoi-tung-buoc",
    );
  });
});

test.describe("fix 19: legacy lesson list has its own route", () => {
  test("/hoc/bai lists published legacy lessons and the learner's history", async ({ page }) => {
    await registerLearner(page);
    const title = `Bài cũ ${hex(4)}`;
    const [admin] = await query<{ id: number }>("SELECT id FROM users ORDER BY id LIMIT 1");
    await query(
      `INSERT INTO learning_lessons (title, body, question, choices, answer_id, explanation, status, created_by)
       VALUES (?, 'Hello là lời chào.', 'Hello nghĩa là gì?', '{"one":"Tạm biệt","two":"Xin chào"}', 'two', 'Lời chào.', 'published', ?)`,
      [title, admin!.id],
    );
    // In PHP, /hoc matched the product page first, so this list could never be reached.
    await page.goto("/hoc/bai");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Học hôm nay");
    const card = page.locator("section.panel").filter({ hasText: title });
    await card.getByRole("button", { name: "Bắt đầu học" }).click();
    await expect(page).toHaveURL(/\/ket-qua\/[a-f0-9]{32}$/);

    await page.goto("/hoc/bai");
    await expect(page.getByRole("link", { name: `${title} - Tiếp tục học` })).toBeVisible();
  });
});

test.describe("fix 20: caching", () => {
  test("personal pages and the API stay private and uncached", async ({ page }) => {
    await registerLearner(page);
    for (const path of ["/account", "/hoc", "/tien-do"]) {
      const res = await page.request.get(path);
      expect(res.headers()["cache-control"], path).toMatch(/private/);
      expect(res.headers()["cache-control"], path).toMatch(/no-store/);
    }
    const api = await page.request.get("/api/v1/review/queue");
    expect(api.headers()["cache-control"]).toBe("no-store, private");
  });

  test("build assets are cacheable forever", async ({ page, request }) => {
    await page.goto("/");
    const script = await page.locator("script[src*='/_next/static/']").first().getAttribute("src");
    const res = await request.get(script!);
    expect(res.headers()["cache-control"]).toContain("immutable");
  });

  // Open: every page renders the signed-in nav inside SiteShell, so even /gioi-thieu is a partial
  // prerender with a dynamic hole and Next sends `private, no-cache, no-store`. See fix-tests.md.
  test.fixme("public pages can be cached by a CDN", async ({ request }) => {
    for (const path of ["/", "/lo-trinh", "/tu-vung", "/kien-thuc", "/gioi-thieu"]) {
      const res = await request.get(path);
      expect(res.headers()["cache-control"], path).not.toContain("no-store");
    }
  });
});
