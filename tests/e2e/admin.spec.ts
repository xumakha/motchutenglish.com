import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "./fixtures";
import { query } from "./db";

// CMS screens (/admin/{section}, views/product/admin.php). Each test registers a fresh account
// and grants its role directly in the database.

test.skip(({ viewport }) => (viewport?.width ?? 0) !== 1440, "flow tests run at desktop width");

const tag = () => `${Date.now()}-${randomBytes(3).toString("hex")}`;

async function register(page: Page, role?: "editor" | "admin") {
  const email = `admin-e2e-${tag()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Tên của bạn").fill("Biên tập E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("mat-khau-an-toan-1");
  await page.getByLabel("Nhập lại mật khẩu").fill("mat-khau-an-toan-1");
  await page.getByRole("button", { name: "Đăng ký" }).click();
  await expect(page).toHaveURL(/\/account$/);
  if (role) {
    const [user] = await query<{ id: number }>("SELECT id FROM users WHERE email = ?", [email]);
    await query("INSERT INTO learning_roles (user_id, role) VALUES (?, ?)", [user!.id, role]);
  }
  return email;
}

test("guests go to login; learners get the 403 page on every admin screen", async ({ page }) => {
  await page.goto("/admin/lessons");
  await expect(page).toHaveURL(/\/login$/);

  await register(page);
  for (const path of ["/admin/lessons", "/admin/users", "/admin", "/admin/preview/1"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Không có quyền");
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  }
});

test("editors use content sections but not admin-only ones; unknown sections 404", async ({
  page,
}) => {
  await register(page, "editor");
  await page.goto("/admin/paths");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Quản trị - paths");
  await expect(page.getByRole("navigation", { name: "Quản trị" }).getByRole("link")).toHaveCount(
    14,
  );
  await page.goto("/admin/operations");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Không có quyền");
  await page.goto("/admin/nope");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Không tìm thấy trang");
});

test("an editor saves a lesson draft, sees it listed and saves it again", async ({ page }) => {
  await register(page, "editor");
  const id = tag();
  await page.goto("/admin/lessons");
  const form = page.locator("form.auth-form").filter({ has: page.locator('[name="document"]') });
  await form.getByLabel("Slug").fill(`e2e-${id}`);
  await form.getByLabel("Tên bài").fill(`Bài nháp E2E ${id}`);
  await form.getByRole("button", { name: "Lưu phiên bản nháp" }).click();
  await expect(form.getByRole("status")).toHaveText("Đã lưu thay đổi.");

  const card = page.locator("article.panel").filter({ hasText: `Bài nháp E2E ${id}` });
  await expect(card).toBeVisible();
  await expect(card.locator(".badge")).toHaveText("draft");

  // Editing an existing draft sends its stale-edit hash, so a second save succeeds.
  await card.getByRole("link", { name: "Sửa nháp" }).click();
  await expect(page).toHaveURL(/\?edit=\d+$/);
  const edit = page.locator("form.auth-form").filter({ has: page.locator('[name="document"]') });
  await expect(edit.locator('input[name="expected"]')).toHaveValue(/^[a-f0-9]{64}$/);
  await edit.getByLabel("Tên bài").fill(`Bài nháp E2E ${id} (sửa)`);
  await edit.getByRole("button", { name: "Lưu phiên bản nháp" }).click();
  await expect(edit.getByRole("status")).toHaveText("Đã lưu thay đổi.");
  await expect(page.locator("article.panel h2", { hasText: `${id} (sửa)` })).toBeVisible();

  // Broken JSON is reported next to the editor and the typed text is kept.
  await edit.getByLabel("Document JSON").fill("{ không phải json");
  await edit.getByRole("button", { name: "Lưu phiên bản nháp" }).click();
  await expect(page.locator("#form-error")).toContainText("JSON");
  await expect(edit.locator(".field-error")).toBeVisible();
  await expect(edit.getByLabel("Document JSON")).toHaveValue("{ không phải json");
});

test("an import preview shows per-field errors and lists the batch", async ({ page }) => {
  await register(page, "editor");
  await page.goto("/admin/imports");
  const form = page.locator("form.auth-form").filter({ has: page.locator('[name="raw"]') });

  await form.getByLabel("Hoặc dán JSON").fill("{ broken");
  await form.getByRole("button", { name: "Dry-run và xem lỗi" }).click();
  await expect(page.locator("#form-error")).toContainText("JSON không hợp lệ.");
  await expect(form.locator(".field-error")).toHaveText("Kiểm tra cú pháp JSON.");

  const bad = {
    schemaVersion: 1,
    namespace: `e2e-${randomBytes(3).toString("hex")}`,
    vocabulary: [{ externalId: "x1", lemma: "", meaning: "" }],
  };
  await form.getByLabel("Hoặc dán JSON").fill(JSON.stringify(bad));
  await form.getByRole("button", { name: "Dry-run và xem lỗi" }).click();
  const result = page.locator("section.panel").filter({ hasText: "Kết quả kiểm tra" });
  await expect(result).toContainText("1 record. Không có nội dung nào được xuất bản.");
  await expect(result.locator("pre")).toContainText('"field"');
  await expect(result.getByRole("button", { name: /Xác nhận nhập/ })).toHaveCount(0);

  // The batch is listed with its status panel and the same errors.
  const box = page.locator("[data-import-id]").first();
  await expect(box.locator("[data-import-status]")).toContainText("Trạng thái: preview");
  await expect(box.locator("[data-import-errors] li").first()).toContainText(
    "Record 1 · vocabulary.0.",
  );
});

test("media upload stores the file and lists it", async ({ page }) => {
  await register(page, "editor");
  await page.goto("/admin/media");
  const alt = `Ảnh E2E ${tag()}`;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );
  await page
    .getByLabel(/Tệp JPG\/PNG/)
    .setInputFiles({ name: "e2e.png", mimeType: "image/png", buffer: png });
  await page.getByLabel("Mô tả thay thế").fill(alt);
  await page.getByLabel("Nguồn").fill("Tự tạo cho kiểm thử");
  await page.getByLabel("Quyền sử dụng").fill("CC0");
  await page.getByRole("button", { name: "Tải lên" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Đã tải lên media #\d+/ })).toBeVisible();
  const item = page.locator("section.panel").filter({ hasText: alt });
  await expect(item.locator("h3")).toHaveText("e2e.png");
  await expect(item.locator("img")).toHaveAttribute("src", /^\/media\/\d+$/);
});

test("admins change roles and see settings, audit and operations", async ({ page }) => {
  const email = await register(page, "admin");
  for (const [path, text] of [
    ["/admin/settings", "SEO trang public"],
    ["/admin/audit", "Thời gian UTC"],
    ["/admin/operations", "Hàng đợi và lỗi"],
  ] as const) {
    await page.goto(path);
    await expect(page.locator("main")).toContainText(text);
  }
  const learner = `role-e2e-${tag()}@example.test`;
  await page.context().clearCookies();
  await page.goto("/register");
  await page.getByLabel("Tên của bạn").fill("Người được đổi vai trò");
  await page.getByLabel("Email").fill(learner);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("mat-khau-an-toan-1");
  await page.getByLabel("Nhập lại mật khẩu").fill("mat-khau-an-toan-1");
  await page.getByRole("button", { name: "Đăng ký" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill("mat-khau-an-toan-1");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/account$/);

  await page.goto("/admin/users");
  const card = page.locator("section.panel").filter({ hasText: learner });
  await card.getByLabel("Vai trò").selectOption("editor");
  await card.getByRole("button", { name: "Đổi vai trò" }).click();
  await expect(card.getByRole("status")).toHaveText("Đã lưu thay đổi.");
  const [row] = await query<{ role: string }>(
    "SELECT r.role FROM learning_roles r JOIN users u ON u.id = r.user_id WHERE u.email = ?",
    [learner],
  );
  expect(row?.role).toBe("editor");
});
