import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "@/db/client";
import { learningRoles, lessons, paths, units, users, versions } from "@/db/schema";
import type { Actor } from "@/domain/actor";
import type { LessonDocument } from "@/domain/assessment/types";
import { sha256 } from "@/domain/php";

// Test data builders. Each call creates fresh rows with random slugs/emails, so tests can share
// one migrated database and run in any order.

const repoRoot = resolve(__dirname, "../../..");
const tag = () => randomBytes(5).toString("hex");

/** database/templates/all-exercises.json: one exercise of every non-listening type. */
export function templateDocument(): LessonDocument {
  return JSON.parse(
    readFileSync(resolve(repoRoot, "database/templates/all-exercises.json"), "utf8"),
  );
}

export async function createUser(role: "learner" | "editor" | "admin" = "learner"): Promise<Actor> {
  const t = tag();
  const [{ id }] = await db()
    .insert(users)
    .values({ name: `Test ${t}`, email: `t-${t}@example.test` })
    .$returningId();
  if (role !== "learner") await db().insert(learningRoles).values({ userId: id!, role });
  return { userId: id!, role, guestKey: null };
}

export const guest = (): Actor => ({ userId: null, role: "guest", guestKey: sha256(tag()) });

/** A published path → unit → lesson with the given document as its current version. */
export async function publishedLesson(
  document: LessonDocument = templateDocument(),
  subtype: "lesson" | "checkpoint" | "placement" = "lesson",
) {
  const author = await createUser("admin");
  const t = tag();
  const [{ id: pathId }] = await db()
    .insert(paths)
    .values({
      slug: `path-${t}`,
      title: "Path",
      description: "d",
      objectives: "o",
      prerequisites: "",
      status: "published",
    })
    .$returningId();
  const [{ id: unitId }] = await db()
    .insert(units)
    .values({ pathId: pathId!, title: "Unit", objectives: "o" })
    .$returningId();
  const [{ id: lessonId }] = await db()
    .insert(lessons)
    .values({ unitId: unitId!, slug: `lesson-${t}`, subtype })
    .$returningId();
  const [{ id: versionId }] = await db()
    .insert(versions)
    .values({
      lessonId: lessonId!,
      title: "Lesson",
      document,
      status: "published",
      authorId: author.userId!,
      publishedAt: new Date(),
    })
    .$returningId();
  const { eq } = await import("drizzle-orm");
  await db().update(lessons).set({ currentVersion: versionId! }).where(eq(lessons.id, lessonId!));
  return {
    pathId: pathId!,
    unitId: unitId!,
    lessonId: lessonId!,
    versionId: versionId!,
    author,
    slug: `lesson-${t}`,
  };
}

export const requestKey = () => randomBytes(16).toString("hex");
