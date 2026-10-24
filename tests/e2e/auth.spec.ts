import { expect, test, type Page } from "./fixtures";

// Auth flows ported from tests/auth_http.py. Each test registers a fresh account, so the suite can
// run against any migrated database without fixtures.

const password = "mat-khau-an-toan-1";
const uniqueEmail = () =>
  `e2e-${Date.now()}-${Math.random().toString(16).slice(2, 8)}@example.test`;

async function register(page: Page, email: string, name = "Học viên E2E") {
  await page.goto("/register");
  await page.getByLabel("Tên của bạn").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByLabel("Nhập lại mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng ký" }).click();
}

test.describe.configure({ mode: "serial" });
// One viewport is enough for flow tests; layout is covered elsewhere.
test.skip(({ viewport }) => (viewport?.width ?? 0) !== 1440, "flow tests run at desktop width");

test("register, see the account page, log out", async ({ page }) => {
  const email = uniqueEmail();
  await register(page, email, "Lan <script>");
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chào Lan <script>!");
  await expect(page.getByText(`Email: ${email}`)).toBeVisible();

  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login$/);
});

test("login with the right and the wrong password", async ({ page, context }) => {
  const email = uniqueEmail();
  await register(page, email);
  await context.clearCookies();

  await page.goto("/login");
  await page.getByLabel("Email").fill(email.toUpperCase());
  await page.getByLabel("Mật khẩu").fill("sai-mat-khau");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.locator("#form-error")).toContainText("Email hoặc mật khẩu chưa đúng.");
  await expect(page.getByLabel("Email")).toHaveValue(email.toUpperCase());
  await expect(page.getByLabel("Mật khẩu")).toHaveValue("");

  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/account$/);
});

test("duplicate email and mismatched confirmation are rejected", async ({ page, context }) => {
  const email = uniqueEmail();
  await register(page, email);
  await context.clearCookies();

  await register(page, email);
  await expect(page.locator("#form-error")).toContainText("Email này đã được đăng ký.");
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Tên của bạn").fill("Ai đó");
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByLabel("Nhập lại mật khẩu").fill(`${password}x`);
  await page.getByRole("button", { name: "Đăng ký" }).click();
  await expect(page.locator("#form-error")).toContainText("Mật khẩu nhập lại chưa khớp.");
});

test("signed-in users skip the login and register pages", async ({ page }) => {
  await register(page, uniqueEmail());
  await expect(page).toHaveURL(/\/account$/);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/account$/);
  await page.goto("/register");
  await expect(page).toHaveURL(/\/account$/);
});

test("15 failed logins lock that email out for 15 minutes; other emails still work", async ({
  page,
  context,
}) => {
  // 17 sign-ins in a row, each hashing a password: allow for a loaded machine.
  test.setTimeout(60_000);
  const email = uniqueEmail();
  await register(page, email);
  await expect(page).toHaveURL(/\/account$/);
  await context.clearCookies();

  await page.goto("/login");
  const submit = async (pw: string) => {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mật khẩu").fill(pw);
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST"),
      page.getByRole("button", { name: "Đăng nhập" }).click(),
    ]);
    // React resets the form when the action's response has finished streaming, which can be
    // well after the response headers under load. Wait for that reset (the password is never
    // echoed back) so it cannot wipe the next fill and leave a required field empty.
    await expect(page.getByLabel("Mật khẩu")).toHaveValue("");
  };
  for (let i = 0; i < 15; i++) {
    await submit(`sai-${i}`);
    await expect(page.locator("#form-error")).toContainText("Email hoặc mật khẩu chưa đúng.");
  }
  // Locked even with the right password.
  await submit(password);
  await expect(page.locator("#form-error")).toContainText("Bạn đã thử quá nhiều lần.");

  // Fix 8: a different account from the same IP is not locked out.
  const other = uniqueEmail();
  await register(page, other);
  await expect(page).toHaveURL(/\/account$/);
});

test("HTTP rules: logout is POST-only, cross-origin posts fail, legacy URLs redirect", async ({
  request,
}) => {
  expect((await request.get("/logout")).status()).toBe(405);

  const crossOrigin = await request.post("/logout", {
    headers: { Origin: "https://evil.example" },
  });
  expect(crossOrigin.status()).toBe(403);

  const legacy = await request.get("/index.php?page=login", { maxRedirects: 0 });
  expect(legacy.status()).toBe(301);
  expect(legacy.headers()["location"]).toMatch(/\/login$/);

  const privatePage = await request.get("/account", { maxRedirects: 0 });
  expect(privatePage.status()).toBe(303);

  const health = await request.get("/health");
  expect(await health.text()).toBe("ok");
  expect(health.headers()["x-content-type-options"]).toBe("nosniff");
  expect(health.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
});
