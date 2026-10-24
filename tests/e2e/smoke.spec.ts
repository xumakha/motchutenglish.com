import { expect, test } from "./fixtures";

test("home page renders in Vietnamese", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hôm nay một chút.");
});

test("no x-powered-by header", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["x-powered-by"]).toBeUndefined();
});

test("security headers: CSP, framing, permissions", async ({ request }) => {
  const headers = (await request.get("/")).headers();
  const csp = headers["content-security-policy"] ?? "";
  for (const rule of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'"])
    expect(csp).toContain(rule);
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
});

test("pages load with SRI-hashed scripts and no CSP violations", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|integrity/i.test(message.text())) violations.push(message.text());
  });
  for (const path of ["/", "/lo-trinh", "/tu-vung", "/login"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  const scripts = await page
    .locator("script[src^='/_next/']")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("integrity")));
  // Experimental SRI hashes the framework chunks; some per-page chunks still come without one.
  expect(scripts.some((value) => value?.startsWith("sha256-"))).toBe(true);
  expect(violations).toEqual([]);
});
