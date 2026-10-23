import { z } from "zod";

// Environment is validated once, on first use, so a bad deploy fails at boot instead of on a
// request (fix 21). Values come from the process environment; Next.js and scripts/load-env.ts load
// .env.local in development.

const schema = z
  .object({
    APP_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url(),
    DATABASE_URL: z.url().refine((u) => u.startsWith("mysql://"), "DATABASE_URL must be mysql://"),
    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET needs at least 32 characters"),
    WRITABLE_DIR: z.string().default("writable"),
    MAIL_DRIVER: z.enum(["disabled", "log", "smtp"]).default("disabled"),
    MAIL_FROM: z.string().default(""),
    SMTP_HOST: z.string().default(""),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_ENCRYPTION: z.enum(["starttls", "tls"]).default("starttls"),
    SMTP_USER: z.string().default(""),
    SMTP_PASSWORD: z.string().default(""),
    GA4_MEASUREMENT_ID: z.string().default(""),
    GA4_API_SECRET: z.string().default(""),
    MYSQLDUMP_BIN: z.string().default("mariadb-dump"),
    MYSQL_BIN: z.string().default("mariadb"),
  })
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (env.APP_ENV === "production") {
      if (!env.APP_URL.startsWith("https://")) issue("APP_URL", "must be https in production");
      if (env.MAIL_DRIVER === "log") issue("MAIL_DRIVER", "log driver is development/test only");
    }
    if (env.MAIL_DRIVER === "smtp") {
      if (!env.MAIL_FROM) issue("MAIL_FROM", "required when MAIL_DRIVER=smtp");
      if (!env.SMTP_HOST) issue("SMTP_HOST", "required when MAIL_DRIVER=smtp");
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment:\n  ${problems.join("\n  ")}`);
  }
  cached = parsed.data;
  return cached;
}

/** Mail is configured when a real or log transport can deliver. */
export const mailConfigured = () => env().MAIL_DRIVER !== "disabled";

/** Secure cookies everywhere except plain-http local development. */
export const secureCookies = () => env().APP_URL.startsWith("https://");
