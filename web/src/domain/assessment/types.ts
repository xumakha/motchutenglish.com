// Lesson document (schemaVersion 1). Shapes match the PHP app's JSON exactly; validation in
// validate.ts is what guarantees them, so these types describe valid documents.

export const EXERCISE_TYPES = [
  "choice",
  "true_false",
  "fill",
  "order",
  "match",
  "correction",
  "listening_choice",
  "listening_fill",
  "closed",
  "self",
  "flashcard",
] as const;

export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const BLOCK_TYPES = [
  "text",
  "heading",
  "bilingual",
  "table",
  "audio",
  "dialogue",
  "vocabulary",
  "tip",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export interface Block {
  id: string;
  type: BlockType;
  text?: string;
  required?: boolean;
  audioId?: number;
  transcript?: string;
}

export interface Payload {
  prompt: string;
  whitespace?: "preserve" | "trim" | "collapse";
  caseSensitive?: boolean;
  ignoreTerminalPunctuation?: boolean;
  partialCredit?: boolean;
  /** choice, listening_choice: id → text */
  choices?: Record<string, string>;
  answerId?: string;
  /** true_false */
  answer?: boolean;
  correction?: string;
  /** fill, listening_fill: blank id → accepted answers */
  blanks?: Record<string, string[]>;
  /** closed, correction */
  acceptedAnswers?: string[];
  errorSegment?: { start: number; length: number };
  /** order: token id → text */
  tokens?: Record<string, string>;
  acceptedOrders?: string[][];
  /** match: pair id → sides */
  pairs?: Record<string, { left: string; right: string }>;
  /** self, flashcard */
  modelAnswer?: string;
  criteria?: string | string[];
  /** listening_* */
  audioId?: number;
  transcript?: string;
  [key: string]: unknown;
}

export interface Exercise {
  id: string;
  type: ExerciseType;
  payload: Payload;
  explanation: string;
  schemaVersion: 1;
  contentVersion: number;
  skillTags: string[];
  level: string;
}

export interface Blueprint {
  questionIds?: string[];
  questionCount?: number;
  rules?: { minPercent: number; pathSlug: string }[];
}

export interface LessonDocument {
  schemaVersion: 1;
  objectives: string;
  minutes: number;
  passThreshold: number;
  blocks: Block[];
  exercises: Exercise[];
  preview?: boolean;
  blueprint?: Blueprint;
  seo?: { title?: string; description?: string };
  slug?: string;
}

export interface Grading {
  score: number | null;
  maxScore: number | null;
  isCorrect: boolean | null;
  feedback: string;
  acceptedAnswerDisplay: string;
  gradingMode: "objective" | "self_assessed" | "unavailable";
  criteria?: string | string[];
  transcript?: string;
}

/** Checks a media id is a licensed audio file present in storage (needs the database). */
export type AudioCheck = (mediaId: number) => Promise<boolean>;
