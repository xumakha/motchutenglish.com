import { expect, test } from "@playwright/test";

test("home page renders in Vietnamese", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Một chút English");
});

test("no x-powered-by header", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["x-powered-by"]).toBeUndefined();
});
