import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { catalogLessons, catalogPaths } from "@/domain/content/lessons";

// Cached public catalog reads ("catalog" tag; admin changes call updateTag). connection() keeps
// them out of the build-time static shell, so `next build` never needs a database.

async function cachedPaths() {
  "use cache";
  cacheTag("catalog");
  cacheLife("hours");
  return catalogPaths();
}

async function cachedLessons(pathId?: number) {
  "use cache";
  cacheTag("catalog");
  cacheLife("hours");
  return catalogLessons(pathId);
}

export async function publicPaths() {
  await connection();
  return cachedPaths();
}

export async function publicLessons(pathId?: number) {
  await connection();
  return cachedLessons(pathId);
}
