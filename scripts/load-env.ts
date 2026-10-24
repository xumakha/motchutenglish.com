// Load .env / .env.local the same way `next dev` does, for scripts run with tsx.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), process.env.APP_ENV !== "production");
