import { randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import {
  audit,
  imports,
  jobs,
  media,
  mediaRefs,
  profiles,
  quests,
  rateLimits,
  searchDocuments,
  userVocabulary,
  vocabulary,
} from "@/db/schema";
import { withTx } from "@/db/tx";
import { commitImport, previewImport } from "@/domain/content/imports";
import { lessonWorkflow, saveVersion } from "@/domain/content/lessons";
import { fulltextQuery, searchVersionIds } from "@/domain/content/search";
import { ensureProfile } from "@/domain/identity/profile";
import { canViewMedia, uploadMedia } from "@/domain/media/media";
import { lockProfile } from "@/domain/motivation/profile";
import { ensureQuests } from "@/domain/motivation/rewards";
import { notebook } from "@/domain/review/review";
import { cleanup, run } from "@/worker/jobs";
import { createUser, guest, publishedLesson, templateDocument } from "./fixtures";

// Regression tests for the §1.4 fixes of docs/migration/nextjs-typescript-plan.md that had no
// test yet. Each describe names its fix number; docs/migration/fix-tests.md maps all 24.

afterAll(() => pool().end());

const tag = () => randomBytes(5).toString("hex");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Draft → review → publish a new lesson in a fresh published path; returns the version id. */
async function publishNew(title: string, document = templateDocument()) {
  const { unitId } = await publishedLesson();
  const editor = await createUser("editor");
  const admin = await createUser("admin");
  const versionId = await saveVersion(editor, { title, document, unitId, slug: `fix-${tag()}` });
  await lessonWorkflow(editor, versionId, "review");
  await lessonWorkflow(admin, versionId, "publish");
  return versionId;
}

describe("fix 9: limiter rows expire by window and are purged nightly", () => {
  it("cleanup drops windows older than a day, not after 7 days", async () => {
    const now = new Date(Date.now() + 2 * HOUR);
    const stale = `fix9-stale-${tag()}`.padEnd(64, "0");
    const live = `fix9-live-${tag()}`.padEnd(64, "0");
    await db()
      .insert(rateLimits)
      .values([
        // PHP kept rows for 7 days, so this 2-day-old window would survive the PHP cleanup.
        { key: stale, count: 3, windowStartedAt: new Date(now.getTime() - 2 * DAY) },
        { key: live, count: 3, windowStartedAt: new Date(now.getTime() - 3 * HOUR) },
      ]);
    await cleanup(now);
    const left = await db()
      .select({ key: rateLimits.key })
      .from(rateLimits)
      .where(inArray(rateLimits.key, [stale, live]));
    expect(left.map((r) => r.key)).toEqual([live]);
    await db().delete(rateLimits).where(eq(rateLimits.key, live));
  });
});

describe("fix 10: lesson search uses a FULLTEXT table filled on publish", () => {
  it("publishing stores the version's plain text; drafts are not indexed", async () => {
    const word = `zebra${tag()}`;
    const doc = templateDocument();
    doc.exercises[0]!.payload.prompt = `Which animal is a ${word}?`;
    const versionId = await publishNew(`Bài tìm kiếm ${tag()}`, doc);
    const [row] = await db()
      .select()
      .from(searchDocuments)
      .where(eq(searchDocuments.versionId, versionId));
    expect(row?.body).toContain(`Which animal is a ${word}?`);
    expect(row?.body).not.toContain('"exercises"'); // text, not the JSON document

    const { unitId } = await publishedLesson();
    const draft = await saveVersion(await createUser("editor"), {
      title: `Nháp ${word}`,
      document: templateDocument(),
      unitId,
      slug: `fix-${tag()}`,
    });
    const indexed = await db()
      .select()
      .from(searchDocuments)
      .where(eq(searchDocuments.versionId, draft));
    expect(indexed).toEqual([]);
  });

  it("matches words and prefixes through the index, accent-insensitively", async () => {
    const word = `quokka${tag()}`;
    const doc = templateDocument();
    doc.blocks[0]!.text = `Con ${word} chào bạn`;
    const versionId = await publishNew(`Bài ${tag()}`, doc);
    expect(await searchVersionIds(word)).toContain(versionId);
    expect(await searchVersionIds(word.slice(0, 9))).toContain(versionId); // prefix
    expect(await searchVersionIds(`${word} chao`)).toContain(versionId); // "chào" without accent
    expect(await searchVersionIds(`${word} khongcotu`)).not.toContain(versionId); // all words
  });

  it("`%` and `_` are literal, never wildcards", async () => {
    const percent = await publishNew(`Giảm 100% lo lắng ${tag()}`);
    // The template's fill prompt is "I ___ Linh."; this lesson has no "%" or "_" anywhere.
    const doc = templateDocument();
    doc.exercises = doc.exercises.filter((e) => e.type !== "fill");
    const plain = await publishNew(`Bài thường ${tag()}`, doc);
    for (const q of ["%", "_", "%%", "1_0%"])
      expect(await searchVersionIds(q)).not.toContain(plain);
    expect(await searchVersionIds("100%")).toContain(percent);
    expect(await searchVersionIds("%")).toContain(percent);
  });

  it("the vocabulary notebook search escapes `%` and `_` too", async () => {
    // Its own published word: CI runs these tests before the sample catalog is seeded.
    const t = Math.random().toString(16).slice(2, 10);
    const [inserted] = await db()
      .insert(vocabulary)
      .values({
        slug: `fix10-${t}`,
        lemma: `notebook${t}`,
        partOfSpeech: "noun",
        topic: "test",
        meaning: "từ kiểm thử",
        example: "",
        translation: "",
        status: "published",
      })
      .$returningId();
    const word = { id: inserted!.id, lemma: `notebook${t}` };
    const user = await createUser();
    await db()
      .insert(userVocabulary)
      .values({ userId: user.userId!, senseId: word.id, notes: "", hidden: false });
    expect((await notebook(user, word.lemma, "all")).words).toHaveLength(1);
    for (const q of ["%", "_", "%_"]) expect((await notebook(user, q, "all")).words).toEqual([]);
  });

  it("builds a safe boolean query from index-sized words", () => {
    // Short words and InnoDB stopwords are not in the index; requiring them would match nothing.
    expect(fulltextQuery("My name is Linh")).toBe("+name* +linh*");
    expect(fulltextQuery('-hello +"world" (x) ~y @3 <z>*')).toBe("+hello* +world*");
    expect(fulltextQuery("Xin chào")).toBe("+xin* +chào*");
    expect(fulltextQuery("a an to")).toBe("");
  });
});

describe("fix 11: media_refs is filled when a version is published", () => {
  it("audio in a published lesson becomes public through the lookup table", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64",
    );
    const editor = await createUser("editor");
    const mediaId = await uploadMedia(
      editor,
      { name: "a.png", bytes: png },
      { alt: "Âm thanh", source: "Tự thu", license: "CC0" },
    );
    // Only audio passes the publish check; the file type does not matter for the lookup.
    await db().update(media).set({ mime: "audio/mpeg" }).where(eq(media.id, mediaId));
    expect(await canViewMedia(guest(), mediaId)).toBe(false);

    const doc = templateDocument();
    doc.blocks.push({
      id: "listen",
      type: "audio",
      audioId: mediaId,
      transcript: "Hello!",
      required: false,
    } as never);
    const versionId = await publishNew(`Bài nghe ${tag()}`, doc);
    expect(
      await db()
        .select()
        .from(mediaRefs)
        .where(and(eq(mediaRefs.mediaId, mediaId), eq(mediaRefs.versionId, versionId))),
    ).toHaveLength(1);
    expect(await canViewMedia(guest(), mediaId)).toBe(true);
  });
});

describe("fix 14: the correct-answers quest counts the learner's own path", () => {
  it("targets the objective exercises of the enrolled path, not of every lesson", async () => {
    const doc = templateDocument();
    // Two objective exercises (choice + true/false) and a flashcard, which never counts.
    doc.exercises = doc.exercises.filter((e) => ["hello", "name", "flash"].includes(e.id));
    const mine = await publishedLesson(doc);
    await publishedLesson(); // another path with 8 objective exercises
    const user = await createUser();
    await withTx((tx) => ensureProfile(tx, user.userId!));
    await db()
      .update(profiles)
      .set({ pathId: mine.pathId })
      .where(eq(profiles.userId, user.userId!));
    await withTx(async (tx) => ensureQuests(tx, user.userId!, await lockProfile(tx, user.userId!)));
    const [quest] = await db()
      .select()
      .from(quests)
      .where(and(eq(quests.userId, user.userId!), eq(quests.template, "correct")));
    // PHP counted every published lesson: min(5, all objective exercises) = 5.
    expect(quest?.target).toBe(2);
  });
});

describe("fix 16: cleanup expires failed jobs only and reports late pending ones", () => {
  it("keeps week-old pending jobs, expires week-old failed jobs, counts late pending work", async () => {
    // Run cleanup two hours "ahead" so the pending job is late for cleanup but not yet due for
    // a real worker sharing this database.
    const now = new Date(Date.now() + 2 * HOUR);
    const created = new Date(now.getTime() - 8 * DAY);
    const t = tag();
    await db()
      .insert(jobs)
      .values([
        {
          type: "mail",
          payload: { probe: t },
          eventKey: `fix16-pending-${t}`,
          availableAt: new Date(Date.now() + 30 * 60_000),
          createdAt: created,
        },
        {
          type: "mail",
          payload: { probe: t },
          eventKey: `fix16-failed-${t}`,
          status: "failed",
          availableAt: created,
          createdAt: created,
        },
      ]);
    const { stalePending } = await cleanup(now);
    const rows = await db()
      .select({ key: jobs.eventKey, status: jobs.status, payload: jobs.payload })
      .from(jobs)
      .where(inArray(jobs.eventKey, [`fix16-pending-${t}`, `fix16-failed-${t}`]));
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    // PHP expired pending jobs older than 7 days, silently dropping the email.
    expect(byKey[`fix16-pending-${t}`]).toMatchObject({ status: "pending", payload: { probe: t } });
    expect(byKey[`fix16-failed-${t}`]).toMatchObject({ status: "expired", payload: {} });
    expect(stalePending).toBeGreaterThanOrEqual(1);
    await db()
      .update(jobs)
      .set({ status: "expired" })
      .where(eq(jobs.eventKey, `fix16-pending-${t}`));
  });
});

describe("fix 23: worker imports run as the actor named in the job", () => {
  it("a queued import is committed by the worker under the editor who previewed it", async () => {
    const editor = await createUser("editor");
    const ns = `fix23-${tag()}`;
    const batch = {
      schemaVersion: 1,
      namespace: ns,
      vocabulary: Array.from({ length: 101 }, (_, i) => ({
        externalId: `w${i}`,
        slug: `w-${ns}-${i}`,
        lemma: `word${i}`,
        ipa: "",
        part_of_speech: "n",
        topic: `topic-${ns}`,
        meaning: "m",
        example: "e",
        translation: "t",
        level: "A1",
      })),
    };
    const preview = await previewImport(editor, JSON.stringify(batch));
    await commitImport(editor, preview.id);
    const [job] = await db()
      .select()
      .from(jobs)
      .where(eq(jobs.eventKey, `import:${preview.id}`));
    // No session in the payload: just the actor id and the import.
    expect(job?.payload).toEqual({ actorId: editor.userId, importId: preview.id });

    for (let i = 0; i < 40; i++) {
      const [state] = await db()
        .select({ status: jobs.status })
        .from(jobs)
        .where(eq(jobs.id, job!.id));
      if (state?.status !== "pending" && state?.status !== "running") break;
      if ((await run(20)).busy) await new Promise((r) => setTimeout(r, 250));
    }
    const [done] = await db().select().from(jobs).where(eq(jobs.id, job!.id));
    expect(done?.status).toBe("done");
    const [imp] = await db().select().from(imports).where(eq(imports.id, preview.id));
    expect(imp?.status).toBe("committed");
    const words = await db()
      .select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(vocabulary)
      .where(eq(vocabulary.topic, `topic-${ns}`));
    expect(words[0]?.n).toBe(101);
    const [entry] = await db()
      .select({ actorId: audit.actorId })
      .from(audit)
      .where(and(eq(audit.action, "import_committed"), eq(audit.target, preview.id)));
    expect(entry?.actorId).toBe(editor.userId);
  }, 60_000);
});
