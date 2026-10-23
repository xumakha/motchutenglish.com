import { afterEach, describe, expect, it, vi } from "vitest";

const base = {
  APP_URL: "https://motchut.vn",
  DATABASE_URL: "mysql://u:p@127.0.0.1:3306/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
};

async function loadEnv(vars: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
  return (await import("./env")).env;
}

afterEach(() => vi.unstubAllEnvs());

describe("env (fix 21: fail at boot, not per request)", () => {
  it("accepts a valid production config", async () => {
    const env = await loadEnv({ ...base, APP_ENV: "production" });
    expect(env().APP_ENV).toBe("production");
  });
  it("requires https APP_URL in production", async () => {
    const env = await loadEnv({ ...base, APP_ENV: "production", APP_URL: "http://motchut.vn" });
    expect(() => env()).toThrow(/APP_URL: must be https/);
  });
  it("forbids the log mail driver in production", async () => {
    const env = await loadEnv({ ...base, APP_ENV: "production", MAIL_DRIVER: "log" });
    expect(() => env()).toThrow(/MAIL_DRIVER/);
  });
  it("requires SMTP settings when MAIL_DRIVER=smtp", async () => {
    const env = await loadEnv({ ...base, MAIL_DRIVER: "smtp" });
    expect(() => env()).toThrow(/MAIL_FROM.*\n.*SMTP_HOST/s);
  });
  it("rejects a short auth secret", async () => {
    const env = await loadEnv({ ...base, BETTER_AUTH_SECRET: "short" });
    expect(() => env()).toThrow(/BETTER_AUTH_SECRET/);
  });
});
