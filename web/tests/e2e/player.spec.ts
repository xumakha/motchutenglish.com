import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { lessonId } from "./db";

// The lesson player (port of the browser checks in tests/browser.mjs). Uses the seeded preview
// lesson "chao-hoi-tung-buoc": blocks heading + context; exercises hello (choice), name
// (true/false), am (fill), order, pairs (match).

let origin = "";
test.beforeAll(({}, info) => {
  origin = String(info.project.use.baseURL);
});

async function startGuestLesson(page: Page): Promise<string> {
  const response = await page.request.post("/api/v1/attempts/start", {
    headers: { Origin: origin },
    data: {
      lessonId: await lessonId("chao-hoi-tung-buoc"),
      requestKey: randomBytes(16).toString("hex"),
      mode: "practice",
    },
  });
  expect(response.status()).toBe(200);
  const { data } = await response.json();
  await page.goto(data.redirect);
  await expect(page.locator("#study-player")).toBeVisible();
  return data.id;
}

const status = (page: Page) => page.locator(".save-status");
const exercise = (page: Page) => page.locator(".exercise-panel");

test.describe("flows", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) !== 1440, "flow tests run at desktop width");

  test("a guest reads, answers every type, gets feedback and finishes", async ({ page }) => {
    await startGuestLesson(page);
    for (const name of ["Đánh dấu đã đọc", "Đánh dấu đã đọc"]) {
      await page.getByRole("button", { name }).first().click();
      await expect(status(page)).toHaveText("Máy chủ đã xác nhận lưu.");
    }

    // choice
    await page.getByLabel("Hello!").check();
    await page.getByRole("button", { name: "Nộp câu trả lời" }).click();
    await expect(page.locator("[data-feedback-heading]")).toHaveText("✓ Chính xác");
    await expect(page.locator("[data-feedback-heading]")).toBeFocused();

    // true/false
    await page.getByRole("button", { name: "Câu sau" }).click();
    await page.getByLabel("Đúng").check();
    await page.getByRole("button", { name: "Nộp câu trả lời" }).click();
    await expect(page.locator("[data-feedback-heading]")).toHaveText("✓ Chính xác");

    // fill (normalised: case, spaces, terminal punctuation)
    await page.getByRole("button", { name: "Câu sau" }).click();
    await page.getByLabel("Ô trống 1").fill("  AM. ");
    await page.getByRole("button", { name: "Nộp câu trả lời" }).click();
    await expect(page.locator("[data-feedback-heading]")).toHaveText("✓ Chính xác");

    // order, with the keyboard only
    await page.getByRole("button", { name: "Câu sau" }).click();
    for (const word of ["My", "name", "is", "Linh."]) {
      await page.getByRole("button", { name: `Thêm ${word}` }).focus();
      await page.keyboard.press("Enter");
    }
    await expect(
      page.getByRole("status").filter({ hasText: "Đã thêm Linh. ở vị trí 4" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Nộp câu trả lời" }).click();
    await expect(page.locator("[data-feedback-heading]")).toHaveText("✓ Chính xác");

    // match (opaque keys in the select values)
    await page.getByRole("button", { name: "Câu sau" }).click();
    await page.getByLabel("Hello").selectOption({ label: "Xin chào" });
    await page.getByLabel("Thank you").selectOption({ label: "Cảm ơn" });
    await page.getByRole("button", { name: "Nộp câu trả lời" }).click();
    await expect(exercise(page)).toContainText("Điểm từng phần: 2/2");

    await page.getByRole("button", { name: "Hoàn thành bài học" }).click();
    await expect(page.locator(".panel.green h2")).toHaveText("Bạn đã hoàn thành bài học");
    await expect(page.locator(".panel.green")).toContainText("Đã đạt");
    await expect(page.getByRole("link", { name: "Đăng ký để lưu bài học" })).toBeVisible();
  });

  test("fix 3: answers made offline are queued and sent when the connection returns", async ({
    page,
    context,
  }) => {
    const id = await startGuestLesson(page);
    await context.setOffline(true);
    await page.getByLabel("Hello!").check();
    await page.getByRole("button", { name: "Nộp câu trả lời" }).click();
    await expect(status(page)).toContainText("mất mạng");
    // Still queued on the device.
    expect(
      await page.evaluate((key) => localStorage.getItem(key), `mce-draft:guest:${id}:outbox`),
    ).toContain('"submit"');

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.locator("[data-feedback-heading]")).toHaveText("✓ Chính xác");
    expect(
      await page.evaluate((key) => localStorage.getItem(key), `mce-draft:guest:${id}:outbox`),
    ).toBe("[]");
  });

  test("a change made in another tab shows the newer state with a reload button", async ({
    page,
  }) => {
    const id = await startGuestLesson(page);
    // Another tab marks a block read: the revision moves on.
    const view = await page.request.post(`/api/v1/attempts/${id}/view`, {
      headers: { Origin: origin },
      data: { revision: 0, block: "heading", position: 0 },
    });
    expect(view.status()).toBe(200);
    await page.getByRole("button", { name: "Câu sau" }).click();
    await expect(status(page)).toContainText("Bài đã thay đổi ở tab khác");
    await expect(page.getByRole("button", { name: "Tải trạng thái mới" })).toBeVisible();
    // The player adopted the server's state: the heading block now shows as read.
    await expect(page.getByRole("button", { name: "✓ Đã đọc" })).toBeVisible();
  });
});

test("the player fits the screen at every width", async ({ page }) => {
  await startGuestLesson(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
