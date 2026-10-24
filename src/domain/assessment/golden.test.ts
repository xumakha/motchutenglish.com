import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AppError } from "@/server/errors";
import { grade, normalize, publicExercise, solution } from "./grade";
import type { Exercise, Payload } from "./types";
import { validateDocument } from "./validate";

// Replays tests/golden/assessment.json, produced by running the PHP Assessment class
// (tests/golden/assessment.php). Any difference from the PHP grader fails here.

type Outcome =
  { ok: unknown } | { error: { status: number; message: string; fields: Record<string, string> } };

interface Golden {
  grades: {
    exercise: Exercise;
    cases: { response: unknown; result: Outcome }[];
    public: { id: string; type: string; payload: Record<string, unknown> };
  }[];
  normalize: { input: string; policy: Partial<Payload>; output: string }[];
  documents: { name: string; document: Record<string, unknown>; result: Outcome }[];
}

const golden: Golden = JSON.parse(
  readFileSync(resolve(__dirname, "../../../tests/golden/assessment.json"), "utf8"),
);

async function outcome(fn: () => unknown): Promise<Outcome> {
  try {
    return { ok: await fn() };
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    return { error: { status: error.status, message: error.message, fields: error.fieldErrors } };
  }
}

describe("normalize matches PHP", () => {
  it.each(golden.normalize.map((c) => [JSON.stringify(c.input), JSON.stringify(c.policy), c]))(
    "%s with %s",
    (_input, _policy, c) => {
      expect(normalize(c.input, c.policy)).toBe(c.output);
    },
  );
});

describe("grade matches PHP for every sample exercise", () => {
  for (const [i, g] of golden.grades.entries()) {
    it(`${i}: ${g.exercise.type} ${g.exercise.id}`, async () => {
      for (const c of g.cases) {
        const result =
          c.response === "__solution__"
            ? await outcome(() => solution(g.exercise))
            : await outcome(() => grade(g.exercise, c.response));
        expect(result, JSON.stringify(c.response)).toEqual(c.result);
      }
    });
  }
});

describe("publicExercise hides the same fields as PHP", () => {
  for (const [i, g] of golden.grades.entries()) {
    it(`${i}: ${g.exercise.type}`, () => {
      const ours = publicExercise(g.exercise);
      const php = g.public.payload;
      // Same visible keys (arrays replace PHP's key-ordered objects, so compare contents).
      const phpKeys = Object.keys(php).sort();
      expect(Object.keys(ours.payload).sort()).toEqual(phpKeys);
      if (php.choices)
        expect(ours.payload.choices).toEqual(
          Object.entries(php.choices).map(([id, text]) => ({ id, text })),
        );
      if (php.tokens)
        expect(ours.payload.tokens).toEqual(
          Object.entries(php.tokens).map(([id, text]) => ({ id, text })),
        );
      if (php.blanks) expect(ours.payload.blanks).toEqual(php.blanks);
      if (php.left)
        expect(ours.payload.left).toEqual(
          Object.entries(php.left).map(([id, text]) => ({ id, text })),
        );
      const serialized = JSON.stringify(ours);
      for (const secret of [
        "answerId",
        "acceptedAnswers",
        "acceptedOrders",
        "modelAnswer",
        "criteria",
      ])
        expect(serialized).not.toContain(`"${secret}"`);
    });
  }
});

describe("document validation matches PHP", () => {
  it.each(golden.documents.map((d) => [d.name, d]))("%s", async (_name, d) => {
    const result = await outcome(async () => {
      await validateDocument(d.document);
      return true;
    });
    expect(result).toEqual(d.result);
  });
});
