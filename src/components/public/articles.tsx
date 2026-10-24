import { Fragment } from "react";

/** heading() eyebrow and lead for the kien-thuc pages. */
export const ARTICLE_HEADING = {
  eyebrow: "KIẾN THỨC",
  description: "Bài viết ngắn về ngữ pháp và cách học — đọc xong trong một tách trà.",
};

/** PHP nl2br(h($text)): a <br> before every line break, keeping the break itself. */
export function Nl2br({ text }: { text: string }) {
  const lines = text.split(/(\r\n|\n\r|\n|\r)/);
  return lines.map((part, i) =>
    i % 2 === 1 ? (
      <Fragment key={i}>
        <br />
        {part}
      </Fragment>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
