import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { isSameOrigin, legacyRedirect, loginRedirect, newRequestId } from "./proxy-rules";

const req = (url: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(new URL(url, "http://site.test"), {
    method: init.method ?? "GET",
    headers: { host: "site.test", ...init.headers },
  });

describe("newRequestId", () => {
  it("is 16 hex chars like the PHP request id", () => {
    expect(newRequestId()).toMatch(/^[a-f0-9]{16}$/);
  });
});

describe("isSameOrigin", () => {
  it("accepts a matching Origin", () => {
    expect(
      isSameOrigin(req("/x", { method: "POST", headers: { origin: "http://site.test" } })),
    ).toBe(true);
  });
  it("rejects another origin", () => {
    expect(
      isSameOrigin(req("/x", { method: "POST", headers: { origin: "https://evil.test" } })),
    ).toBe(false);
  });
  it("uses x-forwarded-host behind a proxy", () => {
    const r = req("/x", {
      method: "POST",
      headers: {
        origin: "https://motchut.vn",
        host: "localhost:3000",
        "x-forwarded-host": "motchut.vn",
      },
    });
    expect(isSameOrigin(r)).toBe(true);
  });
  it("without Origin, trusts only same-origin fetch metadata", () => {
    expect(isSameOrigin(req("/x", { method: "POST" }))).toBe(false);
    expect(
      isSameOrigin(req("/x", { method: "POST", headers: { "sec-fetch-site": "same-origin" } })),
    ).toBe(true);
    expect(
      isSameOrigin(req("/x", { method: "POST", headers: { "sec-fetch-site": "cross-site" } })),
    ).toBe(false);
  });
  it("rejects a malformed Origin", () => {
    expect(isSameOrigin(req("/x", { method: "POST", headers: { origin: "null" } }))).toBe(false);
  });
});

describe("legacyRedirect", () => {
  it("maps ?page= and /index.php to clean URLs with 301", () => {
    const a = legacyRedirect(req("/?page=lo-trinh"));
    expect(a?.status).toBe(301);
    expect(a?.headers.get("location")).toBe("http://site.test/lo-trinh");
    expect(legacyRedirect(req("/index.php"))?.headers.get("location")).toBe("http://site.test/");
    expect(legacyRedirect(req("/index.php?page=login&x=1"))?.headers.get("location")).toBe(
      "http://site.test/login?x=1",
    );
  });
  it("leaves normal URLs alone", () => {
    expect(legacyRedirect(req("/"))).toBeNull();
    expect(legacyRedirect(req("/lo-trinh?page=2"))).toBeNull();
  });
});

describe("loginRedirect", () => {
  it("sends signed-out visitors of private pages to /login with 303", () => {
    for (const path of ["/account", "/hoc", "/on-tap", "/tai-khoan", "/admin/lessons"]) {
      const r = loginRedirect(req(path));
      expect(r?.status, path).toBe(303);
      expect(r?.headers.get("location")).toBe("http://site.test/login");
    }
  });
  it("lets guests play lessons and see public pages", () => {
    expect(loginRedirect(req("/hoc/luot/0123456789abcdef0123456789abcdef"))).toBeNull();
    expect(loginRedirect(req("/lo-trinh"))).toBeNull();
    expect(loginRedirect(req("/hocx"))).toBeNull();
  });
  it("skips the check when a session cookie is present", () => {
    expect(
      loginRedirect(req("/account", { headers: { cookie: "mce.session_token=abc" } })),
    ).toBeNull();
  });
});
