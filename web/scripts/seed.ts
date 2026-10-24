import "./load-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, pool } from "@/db/client";
import {
  articles,
  learningRoles,
  lessons,
  paths,
  shop,
  units,
  users,
  versions,
  vocabulary,
} from "@/db/schema";
import { withTx } from "@/db/tx";
import type { Actor } from "@/domain/actor";
import type { LessonDocument } from "@/domain/assessment/types";
import { validateDocument } from "@/domain/assessment/validate";
import { addToTopicSet } from "@/domain/content/entities";
import { indexVersion } from "@/domain/content/search";
import { audioOk, audit } from "@/domain/content/shared";

// Sample catalog (port of database/seed-product.php), loaded from database/product-seed.json.
//   pnpm seed                               drafts only, for editors to review
//   pnpm seed --publish-reviewed-samples    publish samples an operator has reviewed
// Listening samples without licensed audio always stay drafts. Safe to run repeatedly.

interface Seed {
  paths: { slug: string; title: string; description: string; level: string }[];
  lessons: {
    slug: string;
    title: string;
    path: number;
    unit?: number;
    subtype?: "lesson" | "checkpoint" | "placement";
    requiresAudio?: boolean;
    document: LessonDocument;
  }[];
  vocabulary: {
    slug: string;
    lemma: string;
    ipa: string;
    part_of_speech: string;
    topic: string;
    meaning: string;
    example: string;
    translation: string;
    level: string;
  }[];
}

const ARTICLES: [string, string, string][] = [
  [
    "hoc-mot-chut-moi-ngay",
    "Học một chút mỗi ngày",
    "Chọn một mục tiêu nhỏ, đọc ví dụ rồi tự đặt câu.\nSau bài học, xem giải thích và ôn lại điều chưa nhớ.\nBắt đầu bằng 5-10 phút mỗi ngày. Đây là gợi ý học, không phải bảo đảm kết quả.",
  ],
  [
    "on-lai-co-lich",
    "Ôn lại có lịch",
    "Sau khi học từ, hãy tự nhớ nghĩa trước khi xem đáp án. Chọn mức nhớ phù hợp với trải nghiệm thật.\nThẻ khó sẽ quay lại sớm hơn. Lịch ôn là gợi ý thực hành, không bảo đảm bạn sẽ nhớ mãi.",
  ],
  [
    "dung-tu-dat-cau",
    "Từ ví dụ đến câu của mình",
    "Đọc một câu mẫu ngắn, xác định phần có thể thay rồi thử nói về chính mình.\nVới My name is Linh, bạn có thể thay Linh bằng tên mình. Khi viết tự do, đối chiếu tiêu chí thay vì coi một đáp án mẫu là cách đúng duy nhất.",
  ],
];

const SHOP: [string, string, number, string][] = [
  ["mint", "Màu avatar xanh bạc hà", 30, "avatar-mint"],
  ["gold", "Khung vàng ấm", 60, "avatar-gold"],
  ["sun", "Huy hiệu nắng nhỏ", 100, "avatar-sun"],
];

async function main() {
  const publish = process.argv.includes("--publish-reviewed-samples");
  const [owner] = await db()
    .select({ id: users.id })
    .from(users)
    .innerJoin(learningRoles, eq(learningRoles.userId, users.id))
    .where(eq(learningRoles.role, "admin"))
    .orderBy(asc(users.id))
    .limit(1);
  if (!owner) throw new Error("Create an admin first: pnpm admin create EMAIL NAME --local");
  const actor: Actor = { userId: owner.id, role: "admin", guestKey: null };
  const seed: Seed = JSON.parse(
    readFileSync(resolve(process.cwd(), "../database/product-seed.json"), "utf8"),
  );

  // Validate before touching the database, so a bad seed changes nothing.
  for (const l of seed.lessons) {
    const ready = publish && !l.requiresAudio;
    await validateDocument(l.document as never, { publishing: ready, audioOk });
  }

  await withTx(async (tx) => {
    const [[lock]] = (await tx.execute(
      sql`SELECT GET_LOCK('mce_seed_product', 5) AS got`,
    )) as unknown as [{ got: number }[]];
    if (!lock?.got) throw new Error("Seed already running");
    try {
      const unitIds: number[][] = [];
      for (const [i, p] of seed.paths.entries()) {
        await tx
          .insert(paths)
          .ignore()
          .values({
            slug: p.slug,
            title: p.title,
            description: `${p.description} Bộ nội dung mẫu, chưa phải khóa học đầy đủ.`,
            level: p.level,
            objectives: p.description,
            prerequisites: "Không bắt buộc kiến thức trước.",
            status: publish && i < 2 ? "published" : "draft",
            sortOrder: i,
          });
        const [path] = await tx.select({ id: paths.id }).from(paths).where(eq(paths.slug, p.slug));
        unitIds[i] = [];
        for (let n = 0; n < 2; n++) {
          const [existing] = await tx
            .select({ id: units.id })
            .from(units)
            .where(and(eq(units.pathId, path!.id), eq(units.sortOrder, n)))
            .orderBy(asc(units.id))
            .limit(1);
          const unitId =
            existing?.id ??
            (
              await tx
                .insert(units)
                .values({
                  pathId: path!.id,
                  title: n === 0 ? "Chương 1: Bước đầu" : "Chương 2: Luyện tập tiếp nối",
                  objectives: p.description,
                  sortOrder: n,
                })
                .$returningId()
            )[0]!.id;
          unitIds[i]![n] = unitId;
        }
      }

      for (const [i, l] of seed.lessons.entries()) {
        const externalKey = `project-sample:${l.slug}`;
        const [exists] = await tx
          .select({ id: lessons.id })
          .from(lessons)
          .where(eq(lessons.externalKey, externalKey));
        if (exists) continue;
        const ready = publish && !l.requiresAudio;
        const subtype = l.subtype ?? "lesson";
        const [lesson] = await tx
          .insert(lessons)
          .values({
            unitId: unitIds[l.path]![l.unit ?? 0]!,
            slug: l.slug,
            externalKey,
            subtype,
            sortOrder: i,
            required: subtype !== "placement",
          })
          .$returningId();
        const [version] = await tx
          .insert(versions)
          .values({
            lessonId: lesson!.id,
            title: l.title,
            document: l.document,
            status: ready ? "published" : "draft",
            authorId: owner.id,
            publishedAt: ready ? new Date() : null,
          })
          .$returningId();
        if (ready) {
          await tx
            .update(lessons)
            .set({ currentVersion: version!.id })
            .where(eq(lessons.id, lesson!.id));
          await indexVersion(tx, version!.id, l.title, l.document);
        }
      }

      for (const v of seed.vocabulary) {
        await tx
          .insert(vocabulary)
          .ignore()
          .values({
            slug: v.slug,
            lemma: v.lemma,
            ipa: v.ipa,
            partOfSpeech: v.part_of_speech,
            topic: v.topic,
            meaning: v.meaning,
            example: v.example,
            translation: v.translation,
            level: v.level,
            status: publish ? "published" : "draft",
          });
        const [sense] = await tx
          .select({ id: vocabulary.id })
          .from(vocabulary)
          .where(eq(vocabulary.slug, v.slug));
        await addToTopicSet(tx, actor, sense!.id, v.topic, publish);
      }

      for (const [id, title, price, style] of SHOP)
        await tx.insert(shop).ignore().values({ id, title, price, style });
      for (const [slug, title, body] of ARTICLES)
        await tx
          .insert(articles)
          .ignore()
          .values({ slug, title, body, status: publish ? "published" : "draft" });
      await audit(tx, actor, "seed_samples", "catalog", { published: publish });
    } finally {
      await tx.execute(sql`SELECT RELEASE_LOCK('mce_seed_product')`);
    }
  });
  console.log(
    `Sample catalog ready. ${publish ? "Samples published with explicit review flag." : "Review drafts in /admin/lessons before publication."}`,
  );
}

try {
  await main();
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  pool().end();
}
