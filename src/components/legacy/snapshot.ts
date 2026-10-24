// A legacy attempt snapshot is the lesson row at start time. Attempts started by the Next app hold
// the Drizzle row (answerId, choices object); attempts migrated from PHP hold the MySQL row
// (answer_id, choices as a JSON string). Read both.

export interface LegacySnapshot {
  title: string;
  body: string;
  question: string;
  choices: Record<string, string>;
  answerId: string;
  explanation: string;
}

export function legacySnapshot(raw: unknown): LegacySnapshot {
  const r = (raw ?? {}) as Record<string, unknown>;
  let choices = r.choices;
  if (typeof choices === "string") {
    try {
      choices = JSON.parse(choices);
    } catch {
      choices = {};
    }
  }
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    title: s(r.title),
    body: s(r.body),
    question: s(r.question),
    choices: (choices && typeof choices === "object" ? choices : {}) as Record<string, string>,
    answerId: s(r.answerId ?? r.answer_id),
    explanation: s(r.explanation),
  };
}
