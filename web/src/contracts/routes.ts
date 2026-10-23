import { z } from "zod";
import { savedResult, messageResult, redirectResult } from "./envelope";
import { confirmYes, email, flag, hexKey, newPassword, positiveId, text } from "./fields";

/**
 * Contract for every operation Product::api / Product::execute accepts today
 * (application/controllers/Product.php:16-181). Phase 4 implements each entry either as a
 * /api/v1 route handler ("api", used by client JS) or as a Server Action ("action", HTML forms).
 *
 * Inputs are validated here; domain rules (ownership, workflow state, idempotency) stay in
 * src/domain and are covered by the review notes in docs/migration/nextjs-typescript-plan.md.
 */

export type Auth =
  | "public" // anyone
  | "guest-or-owner" // attempt owner, or the guest whose cookie created it
  | "user" // signed in
  | "staff" // editor or admin
  | "admin";

export type Transport = "api" | "action";

export interface RateLimit {
  scope: string;
  max: number;
  windowSeconds: number;
}

export interface RouteContract {
  /** Path after /api/v1/; `{id}` marks a 32-hex attempt or import id. */
  path: string;
  method: "GET" | "POST";
  auth: Auth;
  transport: Transport;
  input: z.ZodType;
  output: z.ZodType;
  rateLimit?: RateLimit;
  /** Bug-fix numbers from the plan (§1.4) that change this route's behaviour. */
  fixes?: number[];
}

const limit = (scope: string, max: number, windowSeconds = 900): RateLimit => ({
  scope,
  max,
  windowSeconds,
});

const none = z.object({});
const anyData = z.unknown();
const revision = z.number().int().nonnegative();
const exerciseId = z.string().min(1).max(80);
const response = z.unknown(); // shape depends on exercise type; checked by the assessment module

const studyMutation = (extra: z.ZodRawShape) => z.object({ revision, ...extra });

export const routes = {
  // ---- Reads (GET) ----
  "attempts.read": {
    path: "attempts/{id}",
    method: "GET",
    auth: "guest-or-owner",
    transport: "api",
    input: none,
    output: anyData,
  },
  "admin.importStatus": {
    path: "admin/import-status/{id}",
    method: "GET",
    auth: "staff",
    transport: "api",
    input: none,
    output: anyData,
  },
  "review.queue": {
    path: "review/queue",
    method: "GET",
    auth: "user",
    transport: "api",
    input: z.object({ more: z.string().optional() }),
    output: anyData,
  },
  catalog: {
    path: "catalog",
    method: "GET",
    auth: "public",
    transport: "api",
    input: none,
    output: anyData,
  },
  progress: {
    path: "progress",
    method: "GET",
    auth: "user",
    transport: "api",
    input: none,
    output: anyData,
  },
  "me.rewards": {
    path: "me/rewards",
    method: "GET",
    auth: "user",
    transport: "api",
    input: none,
    output: anyData,
  },
  "me.quests": {
    path: "me/quests",
    method: "GET",
    auth: "user",
    transport: "api",
    input: none,
    output: anyData,
  },
  "me.streak": {
    path: "me/streak",
    method: "GET",
    auth: "user",
    transport: "api",
    input: none,
    output: anyData,
  },

  // ---- Study (client lesson player) ----
  "attempts.start": {
    path: "attempts/start",
    method: "POST",
    auth: "public", // guests may start lessons whose document has preview=true
    transport: "action",
    input: z.object({
      lessonId: positiveId,
      requestKey: hexKey,
      mode: z.enum(["practice", "test"]).default("practice"),
    }),
    output: z.object({ redirect: z.string(), id: hexKey }),
    rateLimit: limit("start", 60),
  },
  "attempts.view": {
    path: "attempts/{id}/view",
    method: "POST",
    auth: "guest-or-owner",
    transport: "api",
    input: studyMutation({ block: z.string().min(1).max(80), position: z.number().int().min(0) }),
    output: anyData,
    rateLimit: limit("study", 500, 60),
    fixes: [6],
  },
  "attempts.draft": {
    path: "attempts/{id}/draft",
    method: "POST",
    auth: "guest-or-owner",
    transport: "api",
    input: studyMutation({ exerciseId, response }),
    output: anyData,
    rateLimit: limit("study", 500, 60),
  },
  "attempts.submit": {
    path: "attempts/{id}/submit",
    method: "POST",
    auth: "guest-or-owner",
    transport: "api",
    input: studyMutation({ exerciseId, response }),
    output: anyData,
    rateLimit: limit("study", 500, 60),
  },
  "attempts.skip": {
    path: "attempts/{id}/skip",
    method: "POST",
    auth: "guest-or-owner",
    transport: "api",
    input: studyMutation({ exerciseId }),
    output: anyData,
    rateLimit: limit("study", 500, 60),
  },
  "attempts.navigate": {
    path: "attempts/{id}/navigate",
    method: "POST",
    auth: "guest-or-owner",
    transport: "api",
    input: studyMutation({ position: z.number().int().min(0) }),
    output: anyData,
    rateLimit: limit("study", 500, 60),
  },
  "attempts.heartbeat": {
    path: "attempts/{id}/heartbeat",
    method: "POST",
    auth: "guest-or-owner",
    transport: "api",
    input: studyMutation({ active: z.boolean() }),
    output: anyData,
    rateLimit: limit("study", 500, 60),
    fixes: [2],
  },
  "attempts.finish": {
    path: "attempts/{id}/finish",
    method: "POST",
    auth: "guest-or-owner",
    transport: "api",
    input: studyMutation({}),
    output: anyData,
    rateLimit: limit("study", 500, 60),
  },
  "attempts.audioError": {
    path: "attempts/{id}/audio_error",
    method: "POST",
    auth: "guest-or-owner",
    transport: "api",
    input: studyMutation({ exerciseId }),
    output: anyData,
    rateLimit: limit("study", 500, 60),
  },
  "attempts.retry": {
    path: "attempts/{id}/retry",
    method: "POST",
    auth: "guest-or-owner",
    transport: "api",
    input: z.object({ exerciseId, response }),
    output: z.object({ feedback: anyData, firstScorePreserved: z.literal(true) }),
    fixes: [4],
  },
  "guest.claim": {
    path: "guest/claim",
    method: "POST",
    auth: "user",
    transport: "action",
    input: z.object({ attemptId: hexKey }),
    output: redirectResult,
    fixes: [7],
  },

  // ---- Learner settings ----
  profile: {
    path: "profile",
    method: "POST",
    auth: "user",
    transport: "action",
    input: z.object({
      goal: z.enum(["foundation", "communication", "work", "toeic"]).default("foundation"),
      selfLevel: z.enum(["beginner", "A1", "A2", "B1"]).default("beginner"),
      minutes: z.coerce
        .number()
        .int()
        .refine((m) => [5, 10, 15, 20].includes(m))
        .default(10),
      timezone: z
        .string()
        .refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz))
        .default("Asia/Ho_Chi_Minh"),
      reviewLimit: z.coerce.number().int().min(1).max(100).default(20),
      gamification: flag,
      animations: flag,
    }),
    output: savedResult,
  },
  enrollments: {
    path: "enrollments",
    method: "POST",
    auth: "user",
    transport: "action",
    input: z.object({ pathId: positiveId }),
    output: savedResult,
  },
  "vocabulary.save": {
    path: "vocabulary/save",
    method: "POST",
    auth: "user",
    transport: "action",
    input: z.object({
      senseId: positiveId,
      notes: text(2000, { required: false }).optional(),
      review: flag,
    }),
    output: savedResult,
    fixes: [15],
  },
  "vocabulary.remove": {
    path: "vocabulary/remove",
    method: "POST",
    auth: "user",
    transport: "action",
    input: z.object({ senseId: positiveId }),
    output: savedResult,
  },
  "review.rate": {
    path: "review/rate",
    method: "POST",
    auth: "user",
    transport: "api",
    input: z.object({
      cardId: positiveId,
      rating: z.enum(["again", "hard", "good", "easy"]),
      requestKey: hexKey,
      revision,
      extra: flag,
    }),
    output: anyData,
    rateLimit: limit("review", 120, 60),
  },
  "review.manage": {
    path: "review/manage",
    method: "POST",
    auth: "user",
    transport: "action",
    input: z.discriminatedUnion("action", [
      z.object({ action: z.literal("reset"), cardId: positiveId, confirm: confirmYes }),
      z.object({ action: z.literal("remove"), cardId: positiveId, confirm: confirmYes }),
      z.object({ action: z.enum(["hide", "show"]), cardId: positiveId }),
    ]),
    output: savedResult,
  },
  "review.concept": {
    path: "review/concept",
    method: "POST",
    auth: "user",
    transport: "api",
    input: z.object({ attemptId: hexKey, exerciseId }),
    output: savedResult,
  },
  "shop.purchase": {
    path: "shop/purchase",
    method: "POST",
    auth: "user",
    transport: "action",
    input: z.object({ itemId: z.string().min(1).max(40), requestKey: hexKey }),
    output: savedResult,
  },
  avatar: {
    path: "avatar",
    method: "POST",
    auth: "user",
    transport: "action",
    input: z.object({ itemId: z.string().min(1).max(40) }),
    output: savedResult,
  },
  reports: {
    path: "reports",
    method: "POST",
    auth: "user",
    transport: "api",
    input: z.object({
      versionId: positiveId,
      position: text(80).default("lesson"),
      category: z.enum(["answer", "typo", "audio", "other"]),
      description: text(2000),
    }),
    output: savedResult,
    rateLimit: limit("reports", 10),
  },
  reminders: {
    path: "reminders",
    method: "POST",
    auth: "user",
    transport: "action",
    input: z.object({ enabled: flag, hour: z.coerce.number().int().min(0).max(23).default(19) }),
    output: savedResult,
  },
  "streak.preferences": {
    path: "streak/preferences",
    method: "POST",
    auth: "user",
    transport: "action",
    input: z.object({ autoProtect: flag }),
    output: savedResult,
  },
  consent: {
    path: "consent",
    method: "POST",
    auth: "user",
    transport: "action",
    input: z.object({ analytics: flag }),
    output: savedResult,
  },
  "analytics.consent": {
    path: "analytics/consent",
    method: "POST",
    auth: "public",
    transport: "action",
    input: z.object({
      enabled: z.enum(["yes", "no"]).optional(),
      campaignSlug: z.string().max(200).optional(),
      utm_source: z.string().max(100).optional(),
      utm_medium: z.string().max(100).optional(),
      utm_campaign: z.string().max(200).optional(),
    }),
    output: savedResult,
    rateLimit: limit("marketing-consent", 30),
  },

  // ---- Identity (most of this moves into Better Auth flows) ----
  "password.resetRequest": {
    path: "password/reset-request",
    method: "POST",
    auth: "public",
    transport: "action",
    input: z.object({ email }),
    output: messageResult,
    rateLimit: limit("reset", 5),
  },
  "password.reset": {
    path: "password/reset",
    method: "POST",
    auth: "public",
    transport: "action",
    input: z.object({ token: z.string().min(1).max(200), password: newPassword }),
    output: messageResult,
  },
  "password.change": {
    path: "password/change",
    method: "POST",
    auth: "user",
    transport: "action",
    input: z.object({ current: z.string().min(1).max(200), password: newPassword }),
    output: redirectResult,
    rateLimit: limit("password", 10),
  },
  "email.verify": {
    path: "email/verify",
    method: "POST",
    auth: "user",
    transport: "action",
    input: z.object({ email: email.optional() }),
    output: messageResult,
    rateLimit: limit("verify", 5),
  },
  "email.consume": {
    path: "email/consume",
    method: "POST",
    auth: "public",
    transport: "api", // token lives in the URL fragment, so client JS posts it
    input: z.object({
      token: z.string().min(1).max(200),
      purpose: z.enum(["verify", "unsubscribe"]),
    }),
    output: savedResult,
    rateLimit: limit("consume-token", 20),
  },
  "account.delete": {
    path: "account/delete",
    method: "POST",
    auth: "user",
    transport: "action",
    input: z.object({ password: z.string().min(1).max(200) }),
    output: redirectResult,
  },
  "exports.request": {
    path: "exports/request",
    method: "POST",
    auth: "user", // kind=content additionally requires staff
    transport: "action",
    input: z.object({
      kind: z.enum(["personal", "content"]).default("personal"),
      requestKey: hexKey,
    }),
    output: messageResult,
    rateLimit: limit("export", 5, 3600),
  },

  // ---- Admin / CMS ----
  "admin.version": {
    path: "admin/version",
    method: "POST",
    auth: "staff",
    transport: "action",
    input: z.object({
      title: text(200),
      document: z.record(z.string(), z.unknown()),
      lessonId: positiveId.optional(),
      versionId: positiveId.optional(),
      unitId: positiveId.optional(),
      subtype: z.enum(["lesson", "checkpoint", "placement"]).default("lesson"),
      slug: z.string().max(120).optional(),
      sortOrder: z.coerce.number().int().default(0),
      externalKey: z.string().max(120).optional(),
      expected: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(), // fix 5: stale-edit hash
    }),
    output: z.object({ versionId: positiveId }),
    fixes: [5],
  },
  "admin.workflow": {
    path: "admin/workflow",
    method: "POST",
    auth: "staff", // publish/return/archive/restore require admin
    transport: "action",
    input: z.object({
      versionId: positiveId,
      action: z.enum(["review", "publish", "return", "archive", "restore"]),
    }),
    output: savedResult,
  },
  "admin.unitState": {
    path: "admin/unit-state",
    method: "POST",
    auth: "admin",
    transport: "action",
    input: z.object({ unitId: positiveId, archived: flag }),
    output: savedResult,
  },
  "admin.entity": {
    path: "admin/entity",
    method: "POST",
    auth: "staff", // status published/archived requires admin
    transport: "action",
    input: z
      .object({
        kind: z.enum(["paths", "units", "vocabulary", "vocabulary_sets", "articles"]),
        id: positiveId.optional(),
        status: z.enum(["draft", "in_review", "published", "archived"]).optional(),
        seo_title: z.string().max(160).optional(),
        seo_description: z.string().max(320).optional(),
      })
      .loose(), // per-kind fields are validated by the content module (Content::entityRow)
    output: z.object({ id: positiveId }),
  },
  "admin.setItems": {
    path: "admin/set-items",
    method: "POST",
    auth: "staff",
    transport: "action",
    input: z.object({ setId: positiveId, ids: z.array(positiveId).max(500) }),
    output: savedResult,
  },
  "admin.draftSave": {
    path: "admin/draft-save",
    method: "POST",
    auth: "staff",
    transport: "action",
    input: z.object({
      type: z.enum(["entity", "article"]),
      draftId: positiveId,
      expected: z.string().regex(/^[a-f0-9]{64}$/),
      document: z.record(z.string(), z.unknown()),
    }),
    output: savedResult,
  },
  "admin.articleWorkflow": {
    path: "admin/article-workflow",
    method: "POST",
    auth: "staff",
    transport: "action",
    input: z.object({
      versionId: positiveId,
      action: z.enum(["review", "publish", "return"]), // publish/return require admin
      reason: z.string().max(2000).default(""),
    }),
    output: savedResult,
  },
  "admin.entityWorkflow": {
    path: "admin/entity-workflow",
    method: "POST",
    auth: "staff",
    transport: "action",
    input: z.object({
      draftId: positiveId,
      action: z.enum(["review", "publish", "return"]), // publish/return require admin
      reason: z.string().max(2000).default(""),
    }),
    output: savedResult,
  },
  "admin.upload": {
    path: "admin/upload",
    method: "POST",
    auth: "staff",
    transport: "api", // multipart, up to 10 MB: route handler, not a Server Action
    input: z.object({ alt: text(500), source: text(2000), license: text(500) }),
    output: z.object({ id: positiveId }),
    rateLimit: limit("upload", 30),
  },
  "admin.importPreview": {
    path: "admin/import-preview",
    method: "POST",
    auth: "staff",
    transport: "action",
    input: z.object({
      raw: z.string().max(1_048_576),
      namespace: z
        .string()
        .regex(/^[a-z0-9-]{1,50}$/)
        .optional(), // fix 13: CSV namespace
    }),
    output: anyData,
    rateLimit: limit("import", 10),
    fixes: [13],
  },
  "admin.importCommit": {
    path: "admin/import-commit",
    method: "POST",
    auth: "staff",
    transport: "action",
    input: z.object({ importId: hexKey }),
    output: savedResult,
    fixes: [23],
  },
  "admin.reorder": {
    path: "admin/reorder",
    method: "POST",
    auth: "staff",
    transport: "action",
    input: z.object({
      kind: z.enum(["paths", "units", "lessons"]),
      // Forms send "3,1,2"; JSON sends [3, 1, 2].
      ids: z.preprocess(
        (v) => (typeof v === "string" ? v.split(",") : v),
        z
          .array(positiveId)
          .max(300)
          .refine((ids) => new Set(ids).size === ids.length, "Danh sách sắp xếp không hợp lệ."),
      ),
    }),
    output: savedResult,
  },
  "admin.report": {
    path: "admin/report",
    method: "POST",
    auth: "staff",
    transport: "action",
    input: z.object({
      id: positiveId,
      status: z.enum(["open", "in_progress", "resolved", "rejected"]),
      resolution: text(2000, { required: false }).default(""),
    }),
    output: savedResult,
  },
  "admin.role": {
    path: "admin/role",
    method: "POST",
    auth: "admin",
    transport: "action",
    input: z.object({ userId: positiveId, role: z.enum(["learner", "editor", "admin"]) }),
    output: savedResult,
  },
  "admin.seo": {
    path: "admin/seo",
    method: "POST",
    auth: "admin",
    transport: "action",
    input: z.object({
      path: z.string().max(255),
      title: z.string().max(160).default(""),
      description: z.string().max(320).default(""),
    }),
    output: savedResult,
  },
  "admin.settings": {
    path: "admin/settings",
    method: "POST",
    auth: "admin",
    transport: "action",
    input: z.object({
      name: z.enum([
        "site_name",
        "primary",
        "accent",
        "logo_media_id",
        "favicon_media_id",
        "social_url",
        "default_minutes",
        "gamification",
        "contact_email",
        "privacy_text",
        "terms_text",
      ]),
      value: z.string().max(15000).default(""),
    }),
    output: savedResult,
  },
  "admin.rewardAdjust": {
    path: "admin/reward-adjust",
    method: "POST",
    auth: "admin",
    transport: "action",
    input: z.object({
      userId: positiveId,
      amount: z.coerce
        .number()
        .int()
        .refine((n) => n !== 0 && Math.abs(n) <= 10000),
      currency: z.enum(["xp", "coin"]),
      reason: text(1000),
      requestKey: hexKey,
    }),
    output: savedResult,
  },
  "admin.jobRetry": {
    path: "admin/job-retry",
    method: "POST",
    auth: "admin",
    transport: "action",
    input: z.object({ jobId: positiveId }),
    output: savedResult,
  },
} satisfies Record<string, RouteContract>;

export type RouteName = keyof typeof routes;
export type RouteInput<N extends RouteName> = z.input<(typeof routes)[N]["input"]>;
export type RouteParsed<N extends RouteName> = z.output<(typeof routes)[N]["input"]>;
