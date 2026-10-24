import { expect, test, type Page } from "./fixtures";
import { query } from "./db";

// Signed-in learner screens (views/product/page.php learner branches). Each test registers a
// fresh account; db.ts only sets up data the UI under test cannot create itself.

const password = "mat-khau-an-toan-1";
const uniqueEmail = () =>
  `e2e-learner-${Date.now()}-${Math.random().toString(16).slice(2, 8)}@example.test`;

async function register(page: Page): Promise<string> {
  const email = uniqueEmail();
  await page.goto("/register");
  await page.getByLabel("Tên của bạn").fill("Học viên E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByLabel("Nhập lại mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng ký" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return email;
}

async function userId(email: string): Promise<number> {
  const [row] = await query<{ id: number }>("SELECT id FROM users WHERE email = ?", [email]);
  return row!.id;
}

const SCREENS: [string, string][] = [
  ["/hoc", "Hôm nay học một chút"],
  ["/bat-dau", "Chọn nhịp học của bạn"],
  ["/tai-khoan", "Tài khoản và quyền riêng tư"],
  ["/on-tap", "Ôn lại một chút"],
  ["/so-tu-vung", "Sổ từ vựng của bạn"],
  ["/tien-do", "Tiến độ học của bạn"],
  ["/reward-shop", "Góc trang trí"],
];

test.describe("flows", () => {
  // Registering many accounts at once makes sign-up flaky ("Failed to create user"); run in turn.
  test.describe.configure({ mode: "serial" });
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 1440, "flow tests run at desktop width");

  test("signed out, every learner screen redirects to /login", async ({ page }) => {
    for (const [path] of SCREENS) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test("signed in, every learner screen renders", async ({ page }) => {
    await register(page);
    for (const [path, title] of SCREENS) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.getByRole("navigation", { name: "Học tiếng Anh" })).toBeVisible();
    }
    await page.goto("/hoc");
    await expect(page.getByRole("heading", { name: "Bước tiếp theo của bạn" })).toBeVisible();
    await page.goto("/on-tap?manage=1");
    await expect(page.getByRole("navigation", { name: "Phân trang" })).toContainText("Trang 1 / 1");
    await page.goto("/tien-do");
    await expect(page.getByText("Bạn chưa có lượt học đã kết thúc.")).toBeVisible();
  });

  test("profile save shows the success message", async ({ page }) => {
    await register(page);
    await page.goto("/bat-dau");
    await page.getByLabel("Mục tiêu").selectOption("work");
    await page.getByLabel("Phút học mỗi ngày").selectOption("15");
    // A timezone this runtime's ICU knows (see the hand-back note on Asia/Ho_Chi_Minh).
    await page.getByLabel("Múi giờ").selectOption("Asia/Bangkok");
    await page.getByRole("button", { name: "Lưu mục tiêu" }).click();
    await expect(page.locator("p.feedback.success")).toHaveText("Đã lưu thay đổi.");
    await page.reload();
    await expect(page.getByLabel("Mục tiêu")).toHaveValue("work");
    await expect(page.getByLabel("Phút học mỗi ngày")).toHaveValue("15");
    await page.goto("/hoc");
    await expect(page.getByRole("heading", { name: "Mục tiêu 15 phút/ngày" })).toBeVisible();
  });

  test("a word saved from the notebook is rated through the review queue", async ({ page }) => {
    const email = await register(page);
    // The public word pages belong to another screen group; put one word in the notebook.
    const [sense] = await query<{ id: number; lemma: string }>(
      "SELECT id, lemma FROM mce_vocabulary WHERE status = 'published' ORDER BY id LIMIT 1",
    );
    await query("INSERT INTO mce_user_vocabulary (user_id, sense_id, notes) VALUES (?, ?, '')", [
      await userId(email),
      sense!.id,
    ]);

    await page.goto("/so-tu-vung?q=&filter=all");
    const card = page.locator("article.panel").filter({ hasText: sense!.lemma });
    await card.getByLabel("Ghi chú riêng").fill("Ghi chú E2E");
    await card.getByLabel("Thêm vào lịch ôn").check();
    await card.getByRole("button", { name: "Lưu ghi chú" }).click();
    await expect(page.locator("p.feedback.success")).toHaveText("Đã lưu thay đổi.");
    await expect(page).toHaveURL(/\/so-tu-vung\?q=&filter=all$/);
    await expect(card.getByText(/^Lịch ôn: .* - Khoảng ôn 0 ngày$/)).toBeVisible();
    await expect(card.getByLabel("Ghi chú riêng")).toHaveValue("Ghi chú E2E");

    await page.goto("/so-tu-vung?filter=review");
    await expect(page.getByRole("heading", { name: sense!.lemma })).toBeVisible();

    await page.goto("/on-tap");
    const review = page.locator("article.review-card");
    await expect(review).toHaveCount(1);
    await review.getByText("Xem đáp án").click();
    await review.getByRole("button", { name: "Nhớ", exact: true }).click();
    await expect(page.locator("#review-status")).toContainText(
      "Bạn đã hoàn thành lượt ôn này. Lịch mới đã được lưu.",
    );
    await expect(review).toBeHidden();
    await page.reload();
    await expect(page.getByText("Đã ôn 1/20 lượt hôm nay.", { exact: false })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Đã hết thẻ đến hạn trong lượt này" }),
    ).toBeVisible();

    await page.goto("/so-tu-vung");
    await expect(page.getByText(/Khoảng ôn 1 ngày$/)).toBeVisible();
  });

  test("buying without enough coins shows the shop error", async ({ page }) => {
    await register(page);
    await page.goto("/reward-shop");
    await expect(page.getByText("Bạn có 0 xu học tập.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Mua vật phẩm" }).first().click();
    await expect(page.locator("#form-error")).toHaveText(
      "Bạn chưa đủ xu học tập. Hãy tiếp tục học và hoàn thành nhiệm vụ.",
    );
    await expect(page.locator("#form-error")).toBeFocused();
    await expect(page.getByRole("link", { name: "Tải lại trang" })).toHaveAttribute(
      "href",
      "/reward-shop",
    );
  });
});

test("learner screens fit the viewport without sideways scrolling", async ({ page }) => {
  await register(page);
  for (const [path] of SCREENS) {
    await page.goto(path);
    await expect(page.getByRole("navigation", { name: "Học tiếng Anh" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
