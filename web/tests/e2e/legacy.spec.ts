import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { query } from "./db";

// Legacy screens: the static courses.json pages with browser-only progress (assets/js/app.js) and
// the original single-question lessons (/admin, /hoc/bai/{id}, /ket-qua/{id}).

const tag = () => `${Date.now()}-${randomBytes(3).toString("hex")}`;

test("course pages render at every width", async ({ page }) => {
  await page.goto("/courses");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chọn lớp, bắt đầu hành trình.");
  await expect(page.locator(".course-card")).toHaveCount(3);
  await page.goto("/courses/beginner");
  await expect(page.locator(".lesson-row")).toHaveCount(4);
  await page.goto("/courses/beginner/hello");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chào hỏi và giới thiệu");
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test.describe("flows", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 1440, "flow tests run at desktop width");

  test("a legacy quiz marks local progress shown on the course and dashboard", async ({ page }) => {
    await page.goto("/courses/beginner/hello");
    const quiz = page.locator("[data-quiz]");
    const check = quiz.getByRole("button", { name: "Kiểm tra đáp án" });
    await expect(check).toBeDisabled();

    await quiz.locator('[data-choice="1"]').click();
    await check.click();
    await expect(quiz.locator("[data-feedback]")).toHaveText(/^Chưa đúng, thử lại nhé\./);
    await expect(quiz.locator('[data-choice="1"]')).toHaveClass(/incorrect/);

    await quiz.locator('[data-choice="0"]').click();
    await check.click();
    await expect(quiz.locator("[data-feedback]")).toHaveText(/^Chính xác! /);
    await expect(page.locator('[data-completion="beginner/hello"]')).toBeVisible();
    await expect(page.locator('.side-lessons [data-completed="beginner/hello"]')).toHaveText("✓");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("mce-progress")!));
    expect(stored.completed).toContain("beginner/hello");

    await page.getByRole("link", { name: "Bài tiếp theo →" }).click();
    await expect(page).toHaveURL(/\/courses\/beginner\/objects$/);

    await page.goto("/courses/beginner");
    await expect(page.locator("[data-course-count]")).toHaveText("1");
    await expect(page.locator("[data-resume]")).toHaveAttribute(
      "href",
      "/courses/beginner/objects",
    );

    await page.goto("/dashboard");
    await expect(page.locator('[data-stat="lessons"]')).toHaveText("1");
    await expect(page.locator('[data-stat="days"]')).toHaveText("1");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Đặt lại tiến độ" }).click();
    await expect(page.locator('[data-stat="lessons"]')).toHaveText("0");
  });

  test("filters, listening quiz and the placement quiz", async ({ page }) => {
    await page.goto("/listening");
    await page.getByRole("button", { name: "Công sở" }).click();
    await expect(page.locator(".listening-card:visible")).toHaveCount(1);
    await page.getByRole("button", { name: "Tất cả" }).click();
    await expect(page.locator(".listening-card:visible")).toHaveCount(3);

    await page.goto("/listening/coffee");
    await page.locator('[data-choice="1"]').click();
    await page.getByRole("button", { name: "Kiểm tra đáp án" }).click();
    await expect(page.locator("[data-feedback]")).toHaveClass(/success/);

    await page.goto("/placement");
    for (let i = 0; i < 6; i++) {
      await page.locator("#placement .answer").first().click();
      await page.locator("#placement .button").click();
    }
    await expect(page.locator("#placement h2")).toHaveText(/^Bạn trả lời đúng \d\/6 câu$/);
    await expect(page.getByRole("link", { name: "Khám phá lớp phù hợp →" })).toBeVisible();
    await page.getByRole("button", { name: "Làm lại" }).click();
    await expect(page.locator("#placement .eyebrow")).toHaveText("KIỂM TRA NHANH · 1/6");
  });

  async function registerAdmin(page: Page) {
    const email = `legacy-e2e-${tag()}@example.test`;
    await page.goto("/register");
    await page.getByLabel("Tên của bạn").fill("Quản trị E2E");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill("mat-khau-an-toan-1");
    await page.getByLabel("Nhập lại mật khẩu").fill("mat-khau-an-toan-1");
    await page.getByRole("button", { name: "Đăng ký" }).click();
    await expect(page).toHaveURL(/\/account$/);
    const [user] = await query<{ id: number }>("SELECT id FROM users WHERE email = ?", [email]);
    await query("INSERT INTO learning_roles (user_id, role) VALUES (?, 'admin')", [user!.id]);
  }

  test("legacy lesson: draft, preview, publish, start, submit once", async ({ page }) => {
    await registerAdmin(page);
    const title = `Bài cũ E2E ${tag()}`;
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Quản trị bài học");
    await page.getByLabel("Tên bài học").fill(title);
    await page.getByLabel("Nội dung bài học").fill("Hello means xin chào.");
    await page.getByLabel("Câu hỏi").fill("Hello nghĩa là gì?");
    await page.getByRole("textbox", { name: "Lựa chọn thứ nhất" }).fill("Tạm biệt");
    await page.getByRole("textbox", { name: "Lựa chọn thứ hai" }).fill("Xin chào");
    await page.getByLabel("Giải thích đáp án").fill("Hello là lời chào.");
    await page.getByLabel("Đáp án đúng").selectOption("two");
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();

    const card = page.locator("section.panel").filter({ hasText: title });
    await expect(card).toContainText("Bản nháp");

    // Preview grades without saving.
    await card.getByRole("link", { name: "Xem trước" }).click();
    await expect(page.getByText("Bản xem trước - không lưu kết quả.")).toBeVisible();
    await page.getByLabel("Tạm biệt").check();
    await page.getByRole("button", { name: "Kiểm tra thử" }).click();
    await expect(page.getByRole("heading", { level: 3 })).toHaveText("Đã hoàn thành - 0%");
    await expect(page.getByText("Kết quả xem trước không được lưu và không cấp XP.")).toBeVisible();

    await page.goto("/admin");
    await card.getByRole("button", { name: "Xuất bản" }).click();
    await expect(card).toContainText("Đã xuất bản");

    // A plain HTML form posts to /hoc/bai/{id}; the route 303s to the result page.
    await card.getByRole("button", { name: "Bắt đầu học" }).click();
    await expect(page).toHaveURL(/\/ket-qua\/[a-f0-9]{32}$/);
    const resultUrl = page.url();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await page.getByLabel("Xin chào").check();
    await page.getByRole("button", { name: "Nộp bài và hoàn thành" }).click();
    await expect(page.getByRole("heading", { level: 3 })).toHaveText("Đã đạt - 100%");
    await expect(page.getByText("Bạn chọn: Xin chào")).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(resultUrl);
    await expect(page.getByRole("heading", { level: 3 })).toHaveText("Đã đạt - 100%");

    // GET on the start URL is not allowed.
    const [lesson] = await query<{ id: number }>(
      "SELECT id FROM learning_lessons WHERE title = ?",
      [title],
    );
    const get = await page.request.get(`/hoc/bai/${lesson!.id}`, { maxRedirects: 0 });
    expect(get.status()).toBe(405);
    expect(await get.text()).toContain("Không thể bắt đầu bài học. Hãy quay lại và thử lại.");
  });
});
