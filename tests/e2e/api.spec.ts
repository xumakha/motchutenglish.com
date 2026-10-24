import { randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "./fixtures";
import { lessonId, query } from "./db";

// /api/v1 over HTTP (ports of the API parts of tests/product_http.py). Needs the seeded sample
// catalog (pnpm seed --publish-reviewed-samples).

test.skip(({ viewport }) => (viewport?.width ?? 0) !== 1440, "API tests run once");
test.describe.configure({ mode: "serial" });

const key = () => randomBytes(16).toString("hex");
let origin = "";
test.beforeAll(({}, info) => {
  origin = String(info.project.use.baseURL);
});

const post = (request: APIRequestContext, path: string, data: unknown) =>
  request.post(`/api/v1/${path}`, { data, headers: { Origin: origin } });

async function register(page: Page) {
  const email = `api-${Date.now()}-${randomBytes(3).toString("hex")}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Tên của bạn").fill("API test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("mat-khau-an-toan-1");
  await page.getByLabel("Nhập lại mật khẩu").fill("mat-khau-an-toan-1");
  await page.getByRole("button", { name: "Đăng ký" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return email;
}

test("envelope, request id and no-store on every response", async ({ request }) => {
  const res = await request.get("/api/v1/catalog");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.requestId).toMatch(/^[a-f0-9]{16}$/);
  expect(res.headers()["x-request-id"]).toBe(body.requestId);
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(body.data.length).toBeGreaterThan(0);

  const missing = await request.get("/api/v1/nope");
  expect(missing.status()).toBe(404);
  expect((await missing.json()).error).toMatchObject({
    code: "HTTP_404",
    message: "Không tìm thấy chức năng.",
    fieldErrors: {},
  });
});

test("writes need same-origin, JSON objects and scalar fields", async ({ request }) => {
  const noOrigin = await request.post("/api/v1/attempts/start", { data: {} });
  expect(noOrigin.status()).toBe(403);
  const list = await request.post("/api/v1/attempts/start", {
    data: [1],
    headers: { Origin: origin },
  });
  expect((await list.json()).error.message).toBe("Yêu cầu phải là JSON object.");
  const nested = await post(request, "attempts/start", { lessonId: { x: 1 } });
  expect(await nested.json()).toMatchObject({
    error: { code: "HTTP_422", fieldErrors: { lessonId: "Cần giá trị đơn." } },
  });
});

test("a guest plays a preview lesson; stale revisions get 409 with the current attempt", async ({
  request,
}) => {
  const id = await lessonId("chao-hoi-tung-buoc");
  const start = await post(request, "attempts/start", {
    lessonId: id,
    requestKey: key(),
    mode: "practice",
  });
  expect(start.status()).toBe(200);
  const { data } = await start.json();
  expect(data.redirect).toBe(`/hoc/luot/${data.id}`);

  const attempt = (await (await request.get(`/api/v1/attempts/${data.id}`)).json()).data;
  expect(JSON.stringify(attempt)).not.toContain("answerId");
  const viewed = await post(request, `attempts/${data.id}/view`, {
    revision: attempt.revision,
    block: "heading",
    position: 0,
  });
  expect((await viewed.json()).data.revision).toBe(attempt.revision + 1);

  const stale = await post(request, `attempts/${data.id}/navigate`, {
    revision: attempt.revision,
    position: 1,
  });
  expect(stale.status()).toBe(409);
  const conflict = (await stale.json()).error;
  expect(conflict.code).toBe("HTTP_409");
  expect(conflict.currentAttempt.id).toBe(data.id);
  expect(conflict.currentAttempt.revision).toBe(attempt.revision + 1);
});

test("another visitor cannot read a guest's attempt", async ({ request, playwright }) => {
  const id = await lessonId("chao-hoi-tung-buoc");
  const { data } = await (
    await post(request, "attempts/start", { lessonId: id, requestKey: key(), mode: "practice" })
  ).json();
  const stranger = await playwright.request.newContext({ baseURL: origin });
  expect((await stranger.get(`/api/v1/attempts/${data.id}`)).status()).toBe(404);
  await stranger.dispose();
});

test("auth levels: guests get 401 on learner routes, learners 403 on staff routes", async ({
  request,
  page,
}) => {
  expect((await request.get("/api/v1/progress")).status()).toBe(401);
  await register(page);
  expect((await page.request.get("/api/v1/progress")).status()).toBe(200);
  const staff = await page.request.post("/api/v1/admin/reorder", {
    data: { kind: "paths", ids: [1] },
    headers: { Origin: origin },
  });
  expect(staff.status()).toBe(403);
});

test("media: staff upload, Range and ETag; hidden from guests until referenced", async ({
  page,
  request,
}) => {
  const email = await register(page);
  const [user] = await query<{ id: number }>("SELECT id FROM users WHERE email = ?", [email]);
  await query("INSERT INTO learning_roles (user_id, role) VALUES (?, 'editor')", [user!.id]);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );
  const upload = await page.request.post("/api/v1/admin/upload", {
    headers: { Origin: origin },
    multipart: {
      file: { name: "dot.png", mimeType: "image/png", buffer: png },
      alt: "Chấm",
      source: "Tự tạo",
      license: "CC0",
    },
  });
  expect(upload.status()).toBe(200);
  const mediaId = (await upload.json()).data.id;

  const full = await page.request.get(`/media/${mediaId}`);
  expect(full.status()).toBe(200);
  expect(full.headers()["content-type"]).toBe("image/png");
  const etag = full.headers()["etag"]!;
  expect(
    (await page.request.get(`/media/${mediaId}`, { headers: { "If-None-Match": etag } })).status(),
  ).toBe(304);
  const part = await page.request.get(`/media/${mediaId}`, { headers: { Range: "bytes=0-7" } });
  expect(part.status()).toBe(206);
  expect(part.headers()["content-range"]).toBe(`bytes 0-7/${png.length}`);
  expect((await part.body()).equals(png.subarray(0, 8))).toBe(true);
  expect(
    (await page.request.get(`/media/${mediaId}`, { headers: { Range: "bytes=999-" } })).status(),
  ).toBe(416);

  expect((await request.get(`/media/${mediaId}`)).status()).toBe(404);
});

test("public files: theme.css, robots.txt, sitemap.xml; templates need staff", async ({
  request,
}) => {
  expect(await (await request.get("/theme.css")).text()).toMatch(
    /^:root\{--primary:#[0-9a-fA-F]{6};/,
  );
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /admin");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/bai-hoc/chao-hoi-tung-buoc");
  expect((await request.get("/du-lieu/template-lesson")).status()).toBe(403);
});
