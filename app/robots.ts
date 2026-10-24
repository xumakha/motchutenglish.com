import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { env } from "@/env";

// Read APP_URL per request so the build does not need production environment variables.
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  return {
    rules: { userAgent: "*", disallow: ["/admin", "/api/"] },
    sitemap: `${env().APP_URL.replace(/\/$/, "")}/sitemap.xml`,
  };
}
