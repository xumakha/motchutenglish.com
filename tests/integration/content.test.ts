import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import {
  entityDrafts,
  jobs,
  lessons,
  mediaRefs,
  paths,
  redirects,
  vocabulary,
  vocabularySetItems,
  versions,
} from "@/db/schema";
import { triageReport, fileReport } from "@/domain/content/admin";
import {
  draftHash,
  entityWorkflow,
  saveDraft,
  saveEntity,
  saveSetItems,
} from "@/domain/content/entities";
import { commitImport, importStatus, previewImport } from "@/domain/content/imports";
import { lessonWorkflow, saveVersion, versionHash } from "@/domain/content/lessons";
import { canViewMedia, uploadMedia } from "@/domain/media/media";
import {
  legacyAttempt,
  publishLegacyLesson,
  saveLegacyLesson,
  startLegacy,
  submitLegacy,
  listLegacyLessons,
} from "@/domain/legacy/lessons";
import { learningLessons, rewardLedger } from "@/db/schema";
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
const tag = () => randomBytes(4).toString("hex");

describe("lesson versions and workflow", () => {
  it("drafts, reviews and publishes; only admins publish; slug changes redirect", async () => {
    const { unitId } = await publishedLesson();
    const editor = await createUser("editor");
    const admin = await createUser("admin");
    const slug = `bai-${tag()}`;
    const versionId = await saveVersion(editor, {
      title: "Bài mới",
      document: templateDocument(),
      unitId,
      slug,
    });
    await lessonWorkflow(editor, versionId, "review");
    expect(await status(() => lessonWorkflow(editor, versionId, "publish"))).toBe(403);
    await lessonWorkflow(admin, versionId, "publish");
    const [v] = await db().select().from(versions).where(eq(versions.id, versionId));
    const [lesson] = await db().select().from(lessons).where(eq(lessons.id, v!.lessonId));
    expect(lesson?.currentVersion).toBe(versionId);

    // New draft with a changed exercise and slug: contentVersion bumps only where content changed.
    const doc = templateDocument();
    doc.exercises[0]!.payload.prompt = "Câu hỏi đã sửa";
    const next = await saveVersion(editor, {
      title: "Bài mới",
      document: doc,
      lessonId: lesson!.id,
      slug: `${slug}-moi`,
    });
    const [draft] = await db().select().from(versions).where(eq(versions.id, next));
    expect(draft!.document.exercises[0]!.contentVersion).toBe(2);
    expect(draft!.document.exercises[1]!.contentVersion).toBe(1);
    await lessonWorkflow(editor, next, "review");
    await lessonWorkflow(admin, next, "publish");
    const [redirect] = await db()
      .select()
      .from(redirects)
      .where(eq(redirects.oldPath, `/bai-hoc/${slug}`));
    expect(redirect?.newPath).toBe(`/bai-hoc/${slug}-moi`);
  });

  it("fix 5: saving an existing draft needs the hash of what the editor loaded", async () => {
    const { unitId } = await publishedLesson();
    const editor = await createUser("editor");
    const versionId = await saveVersion(editor, {
      title: "A",
      document: templateDocument(),
      unitId,
      slug: `a-${tag()}`,
    });
    const [v] = await db().select().from(versions).where(eq(versions.id, versionId));
    const input = { title: "B", document: templateDocument(), lessonId: v!.lessonId, versionId };
    expect(await status(() => saveVersion(editor, { ...input, expected: "0".repeat(64) }))).toBe(
      409,
    );
    const hash = await versionHash(versionId);
    await saveVersion(editor, { ...input, expected: hash });
    // The old hash is stale now.
    expect(await status(() => saveVersion(editor, { ...input, expected: hash }))).toBe(409);
  });

  it("checkpoints need a blueprint pointing at real objective exercises", async () => {
    const { unitId } = await publishedLesson();
    const admin = await createUser("admin");
    const doc = templateDocument();
    doc.blueprint = { questionIds: ["missing"] };
    const versionId = await saveVersion(admin, {
      title: "CP",
      document: doc,
      unitId,
      slug: `cp-${tag()}`,
      subtype: "checkpoint",
    });
    await lessonWorkflow(admin, versionId, "review");
    expect(await status(() => lessonWorkflow(admin, versionId, "publish"))).toBe(422);
  });
});

describe("entities", () => {
  it("edits of a published path become a proposal an admin publishes", async () => {
    const editor = await createUser("editor");
    const admin = await createUser("admin");
    const slug = `lo-trinh-${tag()}`;
    const base = {
      title: "Lộ trình",
      description: "d",
      level: "A1",
      objectives: "o",
      prerequisites: "",
    };
    expect(
      await status(() => saveEntity(editor, "paths", { ...base, slug, status: "published" })),
    ).toBe(403);
    const id = await saveEntity(editor, "paths", { ...base, slug, status: "draft" });
    await saveEntity(admin, "paths", { ...base, id, slug, status: "in_review" });
    // Publishing a draft directly is refused; it goes through review.
    const [proposal] = await db()
      .select()
      .from(entityDrafts)
      .where(and(eq(entityDrafts.entityId, id), eq(entityDrafts.kind, "paths")));
    await entityWorkflow(admin, proposal!.id, "publish");
    const [published] = await db().select().from(paths).where(eq(paths.id, id));
    expect(published?.status).toBe("published");

    await saveEntity(editor, "paths", {
      ...base,
      id,
      slug: `${slug}-2`,
      title: "Tên mới",
      status: "draft",
    });
    const [unchanged] = await db().select().from(paths).where(eq(paths.id, id));
    expect(unchanged?.title).toBe("Lộ trình");
    const drafts = await db()
      .select()
      .from(entityDrafts)
      .where(and(eq(entityDrafts.entityId, id), eq(entityDrafts.status, "draft")));
    const draft = drafts.at(-1)!;
    expect(
      await status(() =>
        saveDraft(editor, "entity", draft.id, {
          expected: "x",
          document: { ...base, slug: `${slug}-3` },
        }),
      ),
    ).toBe(409);
    await saveDraft(editor, "entity", draft.id, {
      expected: await draftHash("entity", draft.id),
      document: { ...base, slug: `${slug}-2`, title: "Tên mới" },
    });
    await entityWorkflow(editor, draft.id, "review");
    await entityWorkflow(admin, draft.id, "publish");
    const [renamed] = await db().select().from(paths).where(eq(paths.id, id));
    expect(renamed?.title).toBe("Tên mới");
    const [redirect] = await db()
      .select()
      .from(redirects)
      .where(eq(redirects.oldPath, `/lo-trinh/${slug}`));
    expect(redirect?.newPath).toBe(`/lo-trinh/${slug}-2`);
  });

  it("vocabulary lands in its topic set; membership edits of a published set are proposals", async () => {
    const admin = await createUser("admin");
    const topic = `chu-de-${tag()}`;
    const word = (lemma: string) => ({
      slug: `${lemma}-${tag()}`,
      lemma,
      ipa: "",
      part_of_speech: "n",
      topic,
      meaning: "nghĩa",
      example: "ví dụ",
      translation: "dịch",
      level: "A1",
      status: "draft",
    });
    const a = await saveEntity(admin, "vocabulary", word("apple"));
    const b = await saveEntity(admin, "vocabulary", word("banana"));
    const items = await db()
      .select()
      .from(vocabularySetItems)
      .where(eq(vocabularySetItems.senseId, a));
    expect(items).toHaveLength(1);
    const setId = items[0]!.setId;
    await saveSetItems(admin, setId, [b, a]);
    const members = await db()
      .select()
      .from(vocabularySetItems)
      .where(eq(vocabularySetItems.setId, setId));
    expect(members.map((m) => m.senseId).sort()).toEqual([a, b].sort());
    expect(await status(() => saveSetItems(admin, setId, [a, a]))).toBe(422);
  });
});

describe("imports", () => {
  const vocabBatch = (namespace: string, n: number) => ({
    schemaVersion: 1,
    namespace,
    vocabulary: Array.from({ length: n }, (_, i) => ({
      externalId: `w${i}`,
      slug: `w-${namespace}-${i}`,
      lemma: `word${i}`,
      ipa: "",
      part_of_speech: "n",
      topic: `topic-${namespace}`,
      meaning: "m",
      example: "e",
      translation: "t",
      level: "A1",
    })),
  });

  it("previews with per-field errors and commits nothing while errors remain", async () => {
    const editor = await createUser("editor");
    const ns = `ns-${tag()}`;
    const batch = vocabBatch(ns, 3);
    batch.vocabulary[2]!.slug = batch.vocabulary[0]!.slug;
    const preview = await previewImport(editor, JSON.stringify(batch));
    expect(preview.errors).toEqual([
      {
        record: 3,
        field: "vocabulary.2.slug",
        message: "Slug trùng trong batch.",
        phase: "preview",
      },
    ]);
    expect(await status(() => commitImport(editor, preview.id))).toBe(422);
  });

  it("commits a clean batch atomically, only for the actor who previewed it", async () => {
    const editor = await createUser("editor");
    const ns = `ns-${tag()}`;
    const preview = await previewImport(editor, JSON.stringify(vocabBatch(ns, 3)));
    expect(preview.errors).toEqual([]);
    expect(await status(async () => commitImport(await createUser("admin"), preview.id))).toBe(404);
    await commitImport(editor, preview.id);
    const words = await db()
      .select()
      .from(vocabulary)
      .where(eq(vocabulary.topic, `topic-${ns}`));
    expect(words).toHaveLength(3);
    const s = await importStatus(editor, preview.id);
    expect(s).toMatchObject({ status: "committed", processed: 3, total: 3, committed: 3 });
    await commitImport(editor, preview.id); // committing twice is a no-op
  });

  it("fix 13: CSV batches use the namespace the editor chose", async () => {
    const editor = await createUser("editor");
    const ns = `csv-${tag()}`;
    const csv =
      "externalId,slug,lemma,ipa,part_of_speech,topic,meaning,example,translation,level\n" +
      `a,${ns}-a,apple,,n,${ns},"quả táo, đỏ",An apple.,Một quả táo.,A1\n`;
    expect(await status(() => previewImport(editor, csv))).toBe(422);
    const preview = await previewImport(editor, csv, ns);
    expect(preview.errors).toEqual([]);
    await commitImport(editor, preview.id);
    const [w] = await db()
      .select()
      .from(vocabulary)
      .where(eq(vocabulary.slug, `${ns}-a`));
    expect(w?.meaning).toBe("quả táo, đỏ");
  });

  it("queues batches over 100 records for the worker", async () => {
    const editor = await createUser("editor");
    const preview = await previewImport(editor, JSON.stringify(vocabBatch(`big-${tag()}`, 101)));
    await commitImport(editor, preview.id);
    expect((await importStatus(editor, preview.id)).status).toBe("queued");
    const [job] = await db()
      .select()
      .from(jobs)
      .where(eq(jobs.eventKey, `import:${preview.id}`));
    expect(job?.payload).toEqual({ actorId: editor.userId, importId: preview.id });
  });
});

describe("media", () => {
  // Smallest valid PNG (1×1, transparent).
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );
  const meta = { alt: "Ảnh", source: "Tự vẽ", license: "CC0" };

  it("accepts real images and rejects SVG or a mismatched extension", async () => {
    const editor = await createUser("editor");
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(await status(() => uploadMedia(editor, { name: "x.svg", bytes: svg }, meta))).toBe(422);
    expect(await status(() => uploadMedia(editor, { name: "x.jpg", bytes: png }, meta))).toBe(422);
    expect(
      await status(() =>
        uploadMedia(editor, { name: "x.png", bytes: png }, { ...meta, license: "" }),
      ),
    ).toBe(422);
    expect(
      await status(async () =>
        uploadMedia(await createUser(), { name: "x.png", bytes: png }, meta),
      ),
    ).toBe(403);
    const id = await uploadMedia(editor, { name: "x.png", bytes: png }, meta);
    // Unreferenced media is staff-only.
    expect(await canViewMedia(guest(), id)).toBe(false);
    expect(await canViewMedia(editor, id)).toBe(true);
  });

  it("fix 11: media referenced by a current published lesson is public", async () => {
    const editor = await createUser("editor");
    const id = await uploadMedia(editor, { name: "y.png", bytes: png }, meta);
    const { versionId } = await publishedLesson();
    await db().insert(mediaRefs).values({ mediaId: id, versionId });
    expect(await canViewMedia(guest(), id)).toBe(true);
  });
});

describe("reports", () => {
  it("learners report problems in published content; staff triage them", async () => {
    const { versionId } = await publishedLesson();
    const learner = await createUser();
    expect(
      await status(() => fileReport(learner, { versionId, category: "typo", description: " " })),
    ).toBe(422);
    await fileReport(learner, { versionId, category: "typo", description: "Sai chính tả" });
    expect(await status(() => triageReport(learner, 1, "resolved"))).toBe(403);
  });
});

describe("legacy lessons", () => {
  it("editors draft, admins publish, learners submit once and earn +20/+5 XP", async () => {
    const editor = await createUser("editor");
    const admin = await createUser("admin");
    const learner = await createUser();
    const input = {
      action: "create" as const,
      title: `Cũ ${tag()}`,
      body: "Nội dung",
      question: "Hello nghĩa là?",
      explanation: "Hello = xin chào",
      one: "xin chào",
      two: "tạm biệt",
      answer: "one",
    };
    expect(await status(() => saveLegacyLesson(editor, { ...input, answer: "three" }))).toBe(422);
    await saveLegacyLesson(editor, input);
    const [lesson] = await db()
      .select()
      .from(learningLessons)
      .where(eq(learningLessons.title, input.title));
    expect(await status(() => publishLegacyLesson(editor, lesson!.id))).toBe(403);
    await publishLegacyLesson(admin, lesson!.id);
    expect((await listLegacyLessons(learner, "hoc")).lessons.some((l) => l.id === lesson!.id)).toBe(
      true,
    );

    const key = requestKey();
    const id = await startLegacy(learner, lesson!.id, key);
    expect(await startLegacy(learner, lesson!.id, key)).toBe(id);
    await submitLegacy(learner, id, "one");
    await submitLegacy(learner, id, "one");
    expect(await status(() => submitLegacy(learner, id, "two"))).toBe(409);
    expect((await legacyAttempt(learner, id)).attempt.score).toBe(1);
    const xp = await db()
      .select()
      .from(rewardLedger)
      .where(eq(rewardLedger.userId, learner.userId!));
    expect(xp.map((r) => r.amount).sort((a, b) => a - b)).toEqual([5, 20]);
  });
});
