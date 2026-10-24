import { Fragment } from "react";

/** **bold** and *italic* only, as text nodes (never HTML), like the PHP player's rich(). */
export function RichText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let end = 0;
  for (const match of text.matchAll(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g)) {
    parts.push(text.slice(end, match.index));
    const bold = match[0].startsWith("**");
    const n = bold ? 2 : 1;
    const inner = match[0].slice(n, -n);
    parts.push(
      bold ? <strong key={match.index}>{inner}</strong> : <em key={match.index}>{inner}</em>,
    );
    end = match.index! + match[0].length;
  }
  parts.push(text.slice(end));
  return parts.map((p, i) => <Fragment key={i}>{p}</Fragment>);
}
