import { describe, expect, it } from "vitest";
import { AppError } from "@/server/errors";
import { validateExercise } from "./validate";

// Regression tests for the §1.4 fixes that live in the assessment module.

const trueFalse = (payload: Record<string, unknown>) => ({
  id: "tf",
  type: "true_false",
  schemaVersion: 1,
  contentVersion: 1,
  payload: { prompt: "My name is Linh.", ...payload },
  explanation: "",
  skillTags: [],
  level: "A1",
});

async function errors(payload: Record<string, unknown>) {
  try {
    await validateExercise(trueFalse(payload));
    return null;
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    return error.fieldErrors;
  }
}

describe("fix 18: one true_false check", () => {
  // PHP ran two overlapping checks (Assessment.php:29-30). The first one to fail threw, so the
  // second was dead for a false answer without a correction. These cases pin the single check.
  it("asks for a correction when the statement is false", async () => {
    expect(await errors({ answer: false })).toEqual({
      "exercise.payload.correction": "Cần câu sửa.",
    });
    expect(await errors({ answer: false, correction: "   " })).toEqual({
      "exercise.payload.correction": "Cần câu sửa.",
    });
  });

  it("needs a boolean answer", async () => {
    for (const answer of [undefined, "true", 1, null])
      expect(await errors({ answer, correction: "x" })).toEqual({
        "exercise.payload.answer": "Cần đáp án boolean và câu sửa cho mệnh đề sai.",
      });
  });

  it("accepts true without a correction and false with one", async () => {
    expect(await errors({ answer: true })).toBeNull();
    expect(await errors({ answer: false, correction: "My name is Lan." })).toBeNull();
  });
});
