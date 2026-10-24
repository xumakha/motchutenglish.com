import type { Route } from "next";
import Link from "next/link";
import { currentUser } from "@/auth/session";
import { vocabularySetList, type Word } from "@/site/queries/public";
import { SaveWordForm, WordAudio } from "./client";

// The tu-vung branch of views/product/page.php: the set grid, the word cards and the pager.

/** heading() eyebrow and lead for every tu-vung page. */
export const VOCABULARY_HEADING = {
  eyebrow: "TỪ VỰNG",
  description: "Mỗi từ có phiên âm, ví dụ và bản dịch. Đăng nhập để lưu từ vào lịch ôn.",
};

const TOPICS: Record<string, string> = {
  greetings: "Chào hỏi",
  daily: "Đời sống",
  work: "Công việc",
  time: "Thời gian",
};

export async function VocabularySets() {
  const sets = await vocabularySetList();
  if (!sets.length) return null;
  return (
    <div className="courses-grid">
      {sets.map((set) => (
        <article key={set.id} className="panel">
          <h2>
            <Link href={`/tu-vung/chu-de/${set.slug}`}>{set.title}</Link>
          </h2>
          <p>{set.description}</p>
          <p>{set.senseCount} nghĩa từ</p>
        </article>
      ))}
    </div>
  );
}

export async function WordList({ words }: { words: Word[] }) {
  const signedIn = !!(await currentUser());
  return (
    <>
      {!words.length ? (
        <p>
          Chưa có từ phù hợp. <Link href="/tu-vung">Khám phá từ vựng công khai</Link>.
        </p>
      ) : null}
      <div className="courses-grid">
        {words.map((v) => (
          <article key={v.id} className="panel">
            <span className="badge">
              <Link href={`/tu-vung/chu-de/${v.topic}`}>{TOPICS[v.topic] ?? v.topic}</Link> -{" "}
              {v.level}
            </span>
            <div className="word-heading">
              <h2>
                <Link href={`/tu-vung/${v.slug}`}>{v.lemma}</Link>
              </h2>
              <span className="badge">{v.level}</span>
            </div>
            <p>
              {v.ipa} - {v.partOfSpeech}
            </p>
            <p>{v.meaning}</p>
            <div className="word-example">
              <p lang="en">“{v.example}”</p>
              <p>{v.translation}</p>
            </div>
            {v.audioId ? <WordAudio src={`/media/${v.audioId}`} /> : null}
            {signedIn ? (
              <SaveWordForm senseId={v.id} />
            ) : (
              <Link href="/login">Đăng nhập để lưu từ</Link>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

/** The "?page=" pager under tu-vung and kien-thuc lists. */
export function Pager({ path, page, hasNext }: { path: string; page: number; hasNext: boolean }) {
  if (page <= 1 && !hasNext) return null;
  const href = (n: number) => `${path}?page=${n}` as Route;
  return (
    <nav className="product-nav" aria-label="Phân trang">
      {page > 1 ? <Link href={href(page - 1)}>Trang trước</Link> : null}
      <span>Trang {page}</span>
      {hasNext ? <Link href={href(page + 1)}>Trang tiếp</Link> : null}
    </nav>
  );
}
