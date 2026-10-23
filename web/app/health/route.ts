import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db/client";

// Liveness + database check for the load balancer (PHP /health): "ok" or 503 "unavailable".
export async function GET() {
  await connection();
  const headers = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };
  try {
    await db().execute(sql`SELECT 1`);
    return new Response("ok", { headers });
  } catch {
    return new Response("unavailable", { status: 503, headers });
  }
}
