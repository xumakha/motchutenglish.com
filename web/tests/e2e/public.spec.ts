import { createHash, randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { query } from "./db";

// Public and identity screens (Phase 5 port of the public branches of views/product/page.php).
// Seeded slugs are looked up in the database so the suite follows the sample catalog.

const hex = (bytes: number) => randomBytes(bytes).toString("hex");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function one(sql: string): Promise<string> {
  const [row] = await query<{ v: string }>(sql);
  if (!row) throw new Error(`No seed data for: ${sql}`);
  return row.v;
}

const seeds = async () => ({
  path: await one(
    "SELECT p.slug v FROM mce_paths p JOIN mce_units u ON u.path_id = p.id JOIN mce_lessons l ON l.unit_id = u.id WHERE p.status = 'published' AND l.current_version IS NOT NULL ORDER BY p.sort_order, p.id LIMIT 1",
  ),
  previewLesson: await one(
    "SELECT l.slug v FROM mce_lessons l JOIN mce_versions v ON v.id = l.current_version WHERE l.subtype <> 'placement' AND l.archived = 0 AND v.status = 'published' AND JSON_EXTRACT(v.document, '$.preview') = true ORDER BY l.id LIMIT 1",
  ),
  word: await one(
    "SELECT slug v FROM mce_vocabulary WHERE status = 'published' ORDER BY id LIMIT 1",
  ),
  set: await one(
    "SELECT slug v FROM mce_vocabulary_sets WHERE status = 'published' ORDER BY sort_order, id LIMIT 1",
  ),
  article: await one(
    "SELECT slug v FROM mce_articles WHERE status = 'published' ORDER BY id LIMIT 1",
  ),
});

test.describe("every public screen renders", () => {
  const fixed: [string, string][] = [
    ["/lo-trinh", "Bắt đầu từ đâu cũng được."],
    ["/tu-vung", "Từ nào cũng có câu chuyện."],
    ["/kien-thuc", "Đọc một chút, hiểu thêm nhiều."],
    ["/tim-kiem", "Tìm nội dung học"],
    ["/kiem-tra-dau-vao", "20 câu để tìm điểm bắt đầu."],
    ["/gioi-thieu", "Học tiếng Anh không cần nhiều — chỉ cần đều."],
    ["/lien-he", "Gặp lỗi hay cần hỗ trợ?"],
    ["/dieu-khoan", "Điều khoản sử dụng"],
    ["/bao-mat", "Quyền riêng tư"],
    ["/quen-mat-khau", "Bảo mật tài khoản"],
    ["/dat-lai-mat-khau", "Bảo mật tài khoản"],
    ["/xac-minh-email", "Bảo mật tài khoản"],
    ["/huy-nhac-hoc", "Bảo mật tài khoản"],
  ];
  for (const [path, heading] of fixed)
    test(`${path} renders`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.locator(".site-frame")).toHaveCount(1);
    });

  test("content pages render from the catalog", async ({ page }) => {
    const s = await seeds();
    const pages: [string, RegExp | string][] = [
      [`/lo-trinh/${s.path}`, /.+/],
      [`/bai-hoc/${s.previewLesson}`, /.+/],
      [`/tu-vung/${s.word}`, "Từ nào cũng có câu chuyện."],
      [`/tu-vung/chu-de/${s.set}`, /.+/],
      [`/kien-thuc/${s.article}`, /.+/],
      [`/chien-dich/${s.path}`, /.+/],
    ];
    for (const [path, heading] of pages) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.getByRole("heading", { name: "Không tìm thấy trang" })).toHaveCount(0);
    }
    await page.goto(`/lo-trinh/${s.path}`);
    await expect(page.locator("#path-list .lesson-row").first()).toBeVisible();
    await page.goto(`/kien-thuc/${s.article}`);
    await expect(page.locator(".design-article-reader .prose")).not.toBeEmpty();
  });

  test("unknown content shows the not-found page", async ({ page }) => {
    for (const path of [
      "/lo-trinh/khong-co-lo-trinh",
      "/bai-hoc/khong-co-bai",
      "/kien-thuc/khong-co",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Không tìm thấy trang");
    }
  });

  test("breadcrumb JSON-LD on content roots", async ({ page }) => {
    await page.goto("/gioi-thieu");
    const json = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}",
    ) as { itemListElement: { name: string }[] };
    expect(json.itemListElement.map((i) => i.name)).toEqual(["Trang chủ", "Về Một Chút English"]);
  });
});

test.describe("flows", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 1440, "flow tests run at desktop width");

  test("a guest starts a preview lesson from its page", async ({ page }) => {
    const { previewLesson } = await seeds();
    await page.goto(`/bai-hoc/${previewLesson}`);
    await expect(page.getByText("Học thử không cần tài khoản.")).toBeVisible();
    await page.getByRole("button", { name: "Học thử ngay" }).click();
    await expect(page).toHaveURL(/\/hoc\/luot\/[a-f0-9]{32}$/);
  });

  test.describe("search", () => {
    const slug = `e2e-phan-tram-${hex(4)}`;
    const title = `Giảm 100% lo lắng ${slug}`;
    test.beforeAll(async () => {
      await query(
        "INSERT INTO mce_articles (slug, title, body, status) VALUES (?, ?, 'Bài kiểm thử.', 'published')",
        [slug, title],
      );
    });
    test.afterAll(async () => {
      await query("DELETE FROM mce_articles WHERE slug = ?", [slug]);
    });

    test("finds lessons, words and articles", async ({ page }) => {
      const [word] = await query<{ lemma: string }>(
        "SELECT lemma FROM mce_vocabulary WHERE status = 'published' ORDER BY id LIMIT 1",
      );
      await page.goto("/tim-kiem");
      await page.getByLabel("Tìm bài học, từ hoặc kiến thức").fill(word!.lemma);
      await page.getByRole("button", { name: "Tìm kiếm" }).click();
      await expect(page).toHaveURL(/\/tim-kiem\?q=/);
      await expect(page.getByRole("link", { name: word!.lemma, exact: true })).toBeVisible();

      await page.goto("/tim-kiem?q=khong-ton-tai-xyz");
      await expect(page.getByText("Chưa tìm thấy nội dung phù hợp.")).toBeVisible();
    });

    test("% and _ match literally (fix 10)", async ({ page }) => {
      await page.goto(`/tim-kiem?q=${encodeURIComponent("100%")}`);
      await expect(page.getByRole("link", { name: title })).toBeVisible();

      // Unescaped, "%" and "_" would be LIKE wildcards and match every word.
      for (const q of ["%", "_", "1_0%"]) {
        await page.goto(`/tim-kiem?q=${encodeURIComponent(q)}`);
        await expect(page.locator("main li", { hasText: /^Từ vựng:/ })).toHaveCount(0);
      }
      await page.goto(`/tim-kiem?q=${encodeURIComponent("%")}`);
      await expect(page.getByRole("link", { name: title })).toBeVisible();
    });
  });

  test("password reset pages post their forms", async ({ page }) => {
    await page.goto("/quen-mat-khau");
    await page.getByLabel("Email").fill(`e2e-${hex(4)}@example.test`);
    await page.getByRole("button", { name: "Tiếp tục" }).click();
    await expect(page.locator(".feedback")).toContainText(
      /Nếu email phù hợp, hướng dẫn sẽ được đưa vào hàng đợi\.|Email chưa được cấu hình/,
    );

    const token = hex(32);
    await page.goto(`/dat-lai-mat-khau#token=${token}`);
    await expect(page.locator('input[name="token"]')).toHaveValue(token);
    expect(page.url()).not.toContain("#");
    await page.getByLabel("Mật khẩu mới").fill("mat-khau-moi-123");
    const post = page.waitForRequest(
      (r) => r.method() === "POST" && new URL(r.url()).pathname === "/dat-lai-mat-khau",
    );
    await page.getByRole("button", { name: "Tiếp tục" }).click();
    expect((await post).postData()).toContain(token);
    await expect(page.locator("#form-error")).toContainText(
      "Liên kết không hợp lệ hoặc đã hết hạn.",
    );
  });

  async function register(page: Page): Promise<string> {
    const email = `e2e-${Date.now()}-${hex(3)}@example.test`;
    await page.goto("/register");
    await page.getByLabel("Tên của bạn").fill("Học viên E2E");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill("mat-khau-an-toan-1");
    await page.getByLabel("Nhập lại mật khẩu").fill("mat-khau-an-toan-1");
    await page.getByRole("button", { name: "Đăng ký" }).click();
    await expect(page).toHaveURL(/\/account$/);
    return email;
  }

  async function consume(page: Page, path: string, token: string) {
    const request = page.waitForRequest((r) => r.url().endsWith("/api/v1/email/consume"));
    await page.goto(`${path}#token=${token}`);
    return JSON.parse((await request).postData() ?? "{}") as { token: string; purpose: string };
  }

  test("email links call email/consume", async ({ page }) => {
    const email = await register(page);
    const [user] = await query<{ id: number }>("SELECT id FROM users WHERE email = ?", [email]);
    const token = hex(32);
    await query(
      "INSERT INTO auth_verifications (identifier, value, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))",
      [
        `mce-verify:${sha256(token)}`,
        JSON.stringify({ userId: user!.id, purpose: "verify", email: null }),
      ],
    );
    expect(await consume(page, "/xac-minh-email", token)).toEqual({ token, purpose: "verify" });
    await expect(
      page.getByRole("status").filter({ hasText: "Email đã được xác minh." }),
    ).toBeVisible();
    expect(page.url()).not.toContain("#");

    const unknown = hex(32);
    expect(await consume(page, "/huy-nhac-hoc", unknown)).toEqual({
      token: unknown,
      purpose: "unsubscribe",
    });
    await expect(
      page.getByRole("status").filter({ hasText: "Liên kết không hợp lệ hoặc đã hết hạn." }),
    ).toBeVisible();
  });

  test("campaign consent can be given and withdrawn", async ({ page }) => {
    const { path } = await seeds();
    await page.goto(`/chien-dich/${path}?utm_source=facebook&utm_medium=social`);
    await expect(page.locator('input[name="utm_source"]')).toHaveValue("facebook");
    await expect(page.getByText("Hiện tại: Chưa đồng ý.")).toBeVisible();
    await page.getByRole("button", { name: "Đồng ý đo lường" }).click();
    await expect(page.getByText("Hiện tại: Đã đồng ý.")).toBeVisible();
    await page.getByRole("button", { name: "Từ chối / rút lại đồng ý" }).click();
    await expect(page.getByText("Hiện tại: Chưa đồng ý.")).toBeVisible();
  });

  test("a signed-in learner can choose the path", async ({ page }) => {
    const { path } = await seeds();
    await register(page);
    await page.goto(`/lo-trinh/${path}`);
    await page.getByRole("button", { name: "Chọn lộ trình này" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Đã lưu thay đổi." })).toBeVisible();
    await expect(page.getByText(/\d+\/\d+ bài bắt buộc hoàn thành/)).toBeVisible();
  });
});
