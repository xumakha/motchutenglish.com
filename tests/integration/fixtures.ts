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

const repoRoot = resolve(__dirname, "../..");
const tag = () => randomBytes(5).toString("hex");

/** templates/all-exercises.json: one exercise of every non-listening type. */
export function templateDocument(): LessonDocument {
  return JSON.parse(readFileSync(resolve(repoRoot, "templates/all-exercises.json"), "utf8"));
}

export async function createUser(role: "learner" | "editor" | "admin" = "learner"): Promise<Actor> {
  const t = tag();
  const id = await insertedId(
    db()
      .insert(users)
      .values({ name: `Test ${t}`, email: `t-${t}@example.test` })
      .$returningId(),
  );
  if (role !== "learner") await db().insert(learningRoles).values({ userId: id, role });
  return { userId: id, role, guestKey: null };
}

export const guest = (): Actor => ({ userId: null, role: "guest", guestKey: sha256(tag()) });

/** A published path → unit → lesson with the given document as its current version. */
export async function publishedLesson(
  document: LessonDocument = templateDocument(),
  subtype: "lesson" | "checkpoint" | "placement" = "lesson",
) {
  const author = await createUser("admin");
  const t = tag();
  const pathId = await insertedId(
    db()
      .insert(paths)
      .values({
        slug: `path-${t}`,
        title: "Path",
        description: "d",
        objectives: "o",
        prerequisites: "",
        status: "published",
      })
      .$returningId(),
  );
  const unitId = await insertedId(
    db().insert(units).values({ pathId: pathId, title: "Unit", objectives: "o" }).$returningId(),
  );
  const lessonId = await insertedId(
    db()
      .insert(lessons)
      .values({ unitId: unitId, slug: `lesson-${t}`, subtype })
      .$returningId(),
  );
  const versionId = await insertedId(
    db()
      .insert(versions)
      .values({
        lessonId: lessonId,
        title: "Lesson",
        document,
        status: "published",
        authorId: author.userId!,
        publishedAt: new Date(),
      })
      .$returningId(),
  );
  const { eq } = await import("drizzle-orm");
  await db().update(lessons).set({ currentVersion: versionId }).where(eq(lessons.id, lessonId));
  return {
    pathId: pathId,
    unitId: unitId,
    lessonId: lessonId,
    versionId: versionId,
    author,
    slug: `lesson-${t}`,
  };
}

/** First id from a drizzle $returningId() result. */
async function insertedId(rows: Promise<{ id: number }[]>): Promise<number> {
  const [row] = await rows;
  if (!row) throw new Error("insert returned no id");
  return row.id;
}

export const requestKey = () => randomBytes(16).toString("hex");
