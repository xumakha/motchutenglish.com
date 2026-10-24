import { expect, test, type Page } from "./fixtures";

// Ports of the automated A10 checks (tests/browser.mjs) and the responsive redesign checks
// (tests/redesign_browser.mjs): every public screen fits the viewport with a heading, loads only
// local assets and fonts, throws no script errors; the mobile menu, skip link and sticky header
// keep keyboard focus usable. The manual screen-reader audit in docs/accessibility-a10.md stays open.

function watch(page: Page, origin: string) {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`exception: ${error.message}`));
  page.on("request", (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && !url.startsWith(origin)) problems.push(`external: ${url}`);
  });
  return problems;
}

test("public screens fit the viewport, have a heading and load only local assets", async ({
  page,
  baseURL,
}) => {
  const problems = watch(page, baseURL!);
  await page.goto("/");
  const intro = await page.locator(".design-sample").first().getAttribute("href");
  const path = await page.locator(".design-path-card").first().getAttribute("href");
  const routes = ["/", "/lo-trinh", path!, intro!, "/tu-vung", "/kien-thuc"];
  routes.push("/kiem-tra-dau-vao", "/gioi-thieu", "/lien-he", "/login", "/register");
  for (const route of routes) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      h1: document.querySelector("h1")?.textContent?.trim(),
    }));
    expect(layout.overflow, route).toBeLessThanOrEqual(1);
    expect(layout.h1, route).toBeTruthy();
  }
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family);
  });
  expect(fonts.some((f) => f.includes("Baloo"))).toBe(true);
  expect(fonts.some((f) => f.includes("Be Vietnam"))).toBe(true);
  expect(problems).toEqual([]);
});

test("skip link moves focus to the main landmark", async ({ page }) => {
  await page.goto("/lo-trinh");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Đến nội dung chính" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main-content")).toBeFocused();
  await expect(page.getByRole("main")).toHaveCount(1);
});

test.describe("mobile menu", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 600, "mobile widths only");

  test("Enter opens with focus inside, Escape closes and returns focus", async ({ page }) => {
    await page.goto("/");
    const menu = page.locator("button.menu");
    await menu.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#navigation")).toHaveClass(/open/);
    expect(await page.evaluate(() => !!document.activeElement?.closest("#navigation"))).toBe(true);
    const signIn = page.locator("#navigation .mobile-auth a[href$='login']");
    expect((await signIn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toBeFocused();
  });
});

test("keyboard focus is never hidden under the sticky header", async ({ page }) => {
  await page.goto("/lo-trinh");
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    const hidden = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      const header = document.querySelector(".site-header");
      if (!el || !header || header.contains(el) || el.classList.contains("skip-link")) return null;
      const box = el.getBoundingClientRect();
      const bottom = header.getBoundingClientRect().bottom;
      return box.bottom <= bottom ? `${el.tagName} ${el.textContent?.trim().slice(0, 40)}` : null;
    });
    expect(hidden).toBeNull();
  }
});

test("form fields and images are labelled", async ({ page }) => {
  for (const route of ["/login", "/register", "/lien-he", "/"]) {
    await page.goto(route);
    const unlabelled = await page.evaluate(() =>
      [...document.querySelectorAll("input:not([type=hidden]), select, textarea")]
        .filter((el) => {
          const input = el as HTMLInputElement;
          return !(
            input.labels?.length ||
            input.getAttribute("aria-label") ||
            input.getAttribute("aria-labelledby")
          );
        })
        .map((el) => el.outerHTML.slice(0, 80)),
    );
    expect(unlabelled, route).toEqual([]);
    const noAlt = await page.evaluate(() =>
      [...document.querySelectorAll("img:not([alt])")].map((img) => img.outerHTML.slice(0, 80)),
    );
    expect(noAlt, route).toEqual([]);
  }
});
