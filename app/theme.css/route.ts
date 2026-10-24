import { connection } from "next/server";
import { allSettings, themeColors } from "@/server/settings";

// Brand colours from site settings as CSS variables (PHP /theme.css).
export async function GET() {
  await connection();
  const { primary, accent } = themeColors(await allSettings());
  return new Response(
    `:root{--primary:${primary};--accent:${accent};--brand-primary:${primary};--brand-accent:${accent};}`,
    {
      headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "no-cache" },
    },
  );
}
