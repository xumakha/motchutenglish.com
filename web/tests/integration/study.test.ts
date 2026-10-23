import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { items, progress } from "@/db/schema";
import type { Actor } from "@/domain/actor";
import {
  claimGuestAttempt,
  mutateAttempt,
  previewAttempt,
  publicAttempt,
  readAttempt,
  retryExercise,
  startAttempt,
  type Action,
  type MutationInput,
} from "@/domain/study/attempts";
import { AppError } from "@/server/errors";
import { createUser, guest, publishedLesson, requestKey, templateDocument } from "./fixtures";

afterAll(() => pool().end());

async function status(fn: () => Promise<unknown>): Promise<number> {
  try {
    await fn();
    return 200;
  } catch (error) {
    if (error instanceof AppError) return error.status;
    throw error;
  }
}

/** Run an action with the attempt's current revision, like the player does. */
async function act(actor: Actor, id: string, action: Action, input: MutationInput = {}) {
  const view = await publicAttempt(await readAttempt(actor, id));
  return mutateAttempt(actor, id, action, { revision: view.revision, ...input });
}

const view = async (actor: Actor, id: string) => publicAttempt(await readAttempt(actor, id));

/** Correct responses for the template, using the attempt's opaque match keys. */
async function solve(actor: Actor, id: string) {
  const v = await view(actor, id);
  const pairs = v.items.find((i) => i.exercise.type === "match")!.exercise.payload;
  const rightKey = (text: string) => pairs.right!.find((r) => r.text === text)!.key;
  return {
    hello: "greeting",
    name: true,
    am: { verb: "am" },
    order: ["my", "name", "is", "linh"],
    pairs: { hello: rightKey("Xin chào"), thanks: rightKey("Cảm ơn") },
    fix: "I am Linh.",
    translate: "Hi",
    introduce: "My name is Lan.",
    flash: "",
  } as Record<string, unknown>;
}

describe("start", () => {
  it("is idempotent per request key and refuses reuse for another lesson or mode", async () => {
    const { lessonId } = await publishedLesson();
    const other = await publishedLesson();
    const user = await createUser();
    const key = requestKey();
    expect(await startAttempt(user, { lessonId, requestKey: key, mode: "practice" })).toBe(key);
    expect(await startAttempt(user, { lessonId, requestKey: key, mode: "practice" })).toBe(key);
    expect(
      await status(() => startAttempt(user, { lessonId, requestKey: key, mode: "test" })),
    ).toBe(409);
    expect(
      await status(() =>
        startAttempt(user, { lessonId: other.lessonId, requestKey: key, mode: "practice" }),
      ),
    ).toBe(409);
  });

  it("lets guests start preview lessons only", async () => {
    const preview = await publishedLesson();
    const doc = templateDocument();
    delete doc.preview;
    const locked = await publishedLesson(doc);
    const g = guest();
    expect(
      await status(() =>
        startAttempt(g, { lessonId: preview.lessonId, requestKey: requestKey(), mode: "practice" }),
      ),
    ).toBe(200);
    expect(
      await status(() =>
        startAttempt(g, { lessonId: locked.lessonId, requestKey: requestKey(), mode: "practice" }),
      ),
    ).toBe(401);
  });

  it("hides attempts from everyone but their owner", async () => {
    const { lessonId } = await publishedLesson();
    const owner = await createUser();
    const id = await startAttempt(owner, { lessonId, requestKey: requestKey(), mode: "practice" });
    expect(await status(async () => readAttempt(await createUser(), id))).toBe(404);
    expect(await status(() => readAttempt(guest(), id))).toBe(404);
  });
});

describe("playing an attempt", () => {
  it("shuffles per attempt but never leaks answers", async () => {
    const { lessonId } = await publishedLesson();
    const user = await createUser();
    const id = await startAttempt(user, { lessonId, requestKey: requestKey(), mode: "practice" });
    const json = JSON.stringify(await view(user, id));
    for (const secret of [
      "answerId",
      "acceptedAnswers",
      "acceptedOrders",
      "modelAnswer",
      "I am Linh.",
    ])
      expect(json).not.toContain(secret);
  });

  it("keeps the first submit, treats repeats as no-ops and rejects stale revisions", async () => {
    const { lessonId } = await publishedLesson();
    const user = await createUser();
    const id = await startAttempt(user, { lessonId, requestKey: requestKey(), mode: "practice" });
    await act(user, id, "submit", { exerciseId: "hello", response: "greeting" });
    const after = await view(user, id);
    // Same answer again with a stale revision: still fine (no-op).
    expect(
      await mutateAttempt(user, id, "submit", {
        revision: 0,
        exerciseId: "hello",
        response: "greeting",
      }),
    ).toEqual({ saved: true });
    expect(
      await status(() => act(user, id, "submit", { exerciseId: "hello", response: "night" })),
    ).toBe(409);
    expect(
      await status(() =>
        mutateAttempt(user, id, "draft", {
          revision: 0,
          exerciseId: "am",
          response: { verb: "x" },
        }),
      ),
    ).toBe(409);
    expect((await view(user, id)).revision).toBe(after.revision);
    const hello = (await view(user, id)).items.find((i) => i.exercise.id === "hello")!;
    expect(hello.feedback?.isCorrect).toBe(true);
  });

  it("fix 2: heartbeats do not change the revision", async () => {
    const { lessonId } = await publishedLesson();
    const user = await createUser();
    const id = await startAttempt(user, { lessonId, requestKey: requestKey(), mode: "practice" });
    const before = (await view(user, id)).revision;
    await mutateAttempt(user, id, "heartbeat", { active: true, revision: 999 });
    expect((await view(user, id)).revision).toBe(before);
  });

  it("fix 6: view rejects positions outside the lesson", async () => {
    const { lessonId } = await publishedLesson();
    const user = await createUser();
    const id = await startAttempt(user, { lessonId, requestKey: requestKey(), mode: "practice" });
    expect(await status(() => act(user, id, "view", { block: "title", position: 99 }))).toBe(422);
    expect(await status(() => act(user, id, "view", { block: "title", position: 2 }))).toBe(200);
  });

  it("finishes only when required blocks are read and every exercise is resolved", async () => {
    const { lessonId } = await publishedLesson();
    const user = await createUser();
    const id = await startAttempt(user, { lessonId, requestKey: requestKey(), mode: "practice" });
    expect(await status(() => act(user, id, "finish"))).toBe(422);
    await act(user, id, "view", { block: "title", position: 0 });
    await act(user, id, "view", { block: "example", position: 0 });
    expect(await status(() => act(user, id, "finish"))).toBe(422);

    const answers = await solve(user, id);
    for (const [exerciseId, response] of Object.entries(answers))
      await act(user, id, "submit", { exerciseId, response });
    await act(user, id, "finish");

    const done = await view(user, id);
    expect(done.status).toBe("finished");
    // 1 + 1 + 1 (fill) + 1 + 2 (match partial credit) + 1 + 1 = 8 objective points.
    expect(done.maxScore).toBe(8);
    expect(done.score).toBe(8);
    const [row] = await db().select().from(progress).where(eq(progress.userId, user.userId!));
    expect(row?.firstScore).toBe(100);
    expect(row?.passedAt).toBeInstanceOf(Date);
    // Finishing again is a no-op; anything else is refused.
    expect(await act(user, id, "finish")).toEqual({ finished: true });
    expect(await status(() => act(user, id, "navigate", { position: 1 }))).toBe(409);
  });

  it("test mode hides feedback until finish", async () => {
    const { lessonId } = await publishedLesson();
    const user = await createUser();
    const id = await startAttempt(user, { lessonId, requestKey: requestKey(), mode: "test" });
    await act(user, id, "submit", { exerciseId: "hello", response: "greeting" });
    expect((await view(user, id)).items[0]!.feedback).toBeNull();
    expect(await status(() => retryExercise(user, id, "hello", "greeting"))).toBe(403);
  });
});

describe("retry (fix 4)", () => {
  it("grades another answer without touching the first, and stops after finish", async () => {
    const { lessonId } = await publishedLesson();
    const user = await createUser();
    const id = await startAttempt(user, { lessonId, requestKey: requestKey(), mode: "practice" });
    expect(await status(() => retryExercise(user, id, "hello", "greeting"))).toBe(422);
    await act(user, id, "submit", { exerciseId: "hello", response: "night" });
    const retry = await retryExercise(user, id, "hello", "greeting");
    expect(retry.feedback.isCorrect).toBe(true);
    const hello = (await db().select().from(items).where(eq(items.attemptId, id))).find(
      (i) => i.exerciseId === "hello",
    );
    expect(hello?.firstResponse).toBe("night");
    expect(hello?.grading?.isCorrect).toBe(false);

    await act(user, id, "view", { block: "title", position: 0 });
    await act(user, id, "view", { block: "example", position: 0 });
    for (const exerciseId of [
      "name",
      "am",
      "order",
      "pairs",
      "fix",
      "translate",
      "introduce",
      "flash",
    ])
      await act(user, id, "skip", { exerciseId });
    await act(user, id, "finish");
    expect(await status(() => retryExercise(user, id, "hello", "greeting"))).toBe(409);
  });
});

describe("preview (fix 1)", () => {
  it("is staff-only and reuses the open preview attempt", async () => {
    const { versionId } = await publishedLesson();
    const editor = await createUser("editor");
    expect(await status(async () => previewAttempt(await createUser(), versionId))).toBe(403);
    const first = await previewAttempt(editor, versionId);
    expect(await previewAttempt(editor, versionId)).toBe(first);
    const match = (await view(editor, first)).items.find((i) => i.exercise.type === "match")!;
    // Opaque keys, never the pair ids themselves.
    expect(match.exercise.payload.right!.map((r) => r.key)).not.toContain("hello");
  });
});

describe("guest claim (fix 7)", () => {
  it("keeps a finished guest attempt finished and records progress for the new owner", async () => {
    const { lessonId } = await publishedLesson();
    const g = guest();
    const id = await startAttempt(g, { lessonId, requestKey: requestKey(), mode: "practice" });
    await act(g, id, "view", { block: "title", position: 0 });
    await act(g, id, "view", { block: "example", position: 0 });
    for (const [exerciseId, response] of Object.entries(await solve(g, id)))
      await act(g, id, "submit", { exerciseId, response });
    await act(g, id, "finish");

    const user = await createUser();
    await claimGuestAttempt({ ...user, guestKey: g.guestKey }, id);
    const claimed = await view(user, id);
    expect(claimed.status).toBe("finished");
    expect(claimed.score).toBe(8);
    const [row] = await db().select().from(progress).where(eq(progress.userId, user.userId!));
    expect(row?.firstScore).toBe(100);
    expect(await status(async () => claimGuestAttempt(await createUser(), id))).toBe(409);
  });
});

describe("placement suggestion (fix 12)", () => {
  it("picks the highest threshold reached, whatever the rule order", async () => {
    const doc = templateDocument();
    doc.blueprint = {
      rules: [
        { minPercent: 50, pathSlug: "trung-cap" },
        { minPercent: 0, pathSlug: "nen-tang" },
      ],
    };
    const { lessonId } = await publishedLesson(doc);
    const user = await createUser();
    const id = await startAttempt(user, { lessonId, requestKey: requestKey(), mode: "practice" });
    await act(user, id, "view", { block: "title", position: 0 });
    await act(user, id, "view", { block: "example", position: 0 });
    for (const [exerciseId, response] of Object.entries(await solve(user, id)))
      await act(user, id, "submit", { exerciseId, response });
    await act(user, id, "finish");
    expect((await view(user, id)).suggestion).toBe("trung-cap");
  });
});
