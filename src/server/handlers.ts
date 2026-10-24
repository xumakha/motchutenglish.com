import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { RouteName, RouteParsed } from "@/contracts/routes";
import { db } from "@/db/client";
import { progress, quests, rewardLedger, streakState } from "@/db/schema";
import { withTx } from "@/db/tx";
import type { Actor, MarketingSession } from "@/domain/actor";
import { requireUserId } from "@/domain/actor";
import { adjustReward, retryJob, savePageSeo, saveSetting, setRole } from "@/domain/admin/site";
import { landing, noMarketing, setConsent } from "@/domain/analytics/marketing";
import { fileReport, reorder, setUnitArchived, triageReport } from "@/domain/content/admin";
import {
  articleWorkflow,
  entityWorkflow,
  saveDraft,
  saveEntity,
  saveSetItems,
} from "@/domain/content/entities";
import { commitImport, importStatus, previewImport } from "@/domain/content/imports";
import { catalogPaths, lessonWorkflow, saveVersion } from "@/domain/content/lessons";
import { requestExport } from "@/domain/exports/exports";
import {
  changePassword,
  consumeEmailToken,
  enroll,
  requestAccountDeletion,
  requestEmailVerification,
  requestPasswordReset,
  resetPassword,
  setReminders,
  setStreakPreferences,
  updateProfile,
} from "@/domain/identity/account";
import type { Upload } from "@/domain/media/media";
import { uploadMedia } from "@/domain/media/media";
import { localDay, lockProfile } from "@/domain/motivation/profile";
import { ensureQuests, purchase, setAvatar } from "@/domain/motivation/rewards";
import {
  manageCard,
  rateCard,
  removeWord,
  reviewQueue,
  saveConcept,
  saveWord,
} from "@/domain/review/review";
import {
  claimGuestAttempt,
  mutateAttempt,
  publicAttempt,
  readAttempt,
  retryExercise,
  startAttempt,
  type Action,
} from "@/domain/study/attempts";
import { AppError, invalid } from "./errors";

// One handler per contract route (src/contracts/routes.ts). Both the /api/v1 route handler and
// the Server Actions run these, so the two transports cannot drift apart. The `satisfies` clause
// makes a missing route a type error.

export interface HandlerContext {
  actor: Actor;
  /** 32-hex id from the path (attempts/{id}, admin/import-status/{id}). */
  id?: string;
  file?: Upload;
  query: URLSearchParams;
}

/** Side effects the transport applies after a handler succeeds. */
export interface HandlerEffects {
  /** Public catalog changed: actions call updateTag('catalog'). */
  catalog?: boolean;
  /** New guest marketing state to store in the cookie. */
  marketing?: MarketingSession;
  /** Credentials changed: clear this browser's session cookie. */
  signOut?: boolean;
}

export type HandlerResult = { data: unknown; effects?: HandlerEffects };
type Handler<N extends RouteName> = (
  input: RouteParsed<N>,
  ctx: HandlerContext,
) => Promise<HandlerResult>;

const data = (value: unknown, effects?: HandlerEffects): HandlerResult => ({
  data: value,
  effects,
});
const saved = (effects?: HandlerEffects) => data({ saved: true }, effects);
const catalog = { catalog: true };

const attemptAction =
  (action: Action) =>
  async (input: Record<string, unknown>, { actor, id }: HandlerContext) => {
    await mutateAttempt(actor, id, action, input);
    return data(await publicAttempt(await readAttempt(actor, id)));
  };

export const handlers = {
  // ---- Reads ----
  "attempts.read": async (_i, { actor, id }) =>
    data(await publicAttempt(await readAttempt(actor, id))),
  "admin.importStatus": async (_i, { actor, id }) => data(await importStatus(actor, id)),
  "review.queue": async (_i, { actor, query }) =>
    data((await reviewQueue(actor, { extra: query.has("more") })).cards),
  catalog: async () => data(await catalogPaths()),
  progress: async (_i, { actor }) =>
    data(
      await db()
        .select()
        .from(progress)
        .where(eq(progress.userId, requireUserId(actor))),
    ),
  "me.rewards": async (_i, { actor }) => {
    const userId = requireUserId(actor);
    return data(
      await db()
        .select({
          currency: rewardLedger.currency,
          amount: sql<number>`SUM(${rewardLedger.amount})`.mapWith(Number),
        })
        .from(rewardLedger)
        .where(eq(rewardLedger.userId, userId))
        .groupBy(rewardLedger.currency),
    );
  },
  "me.quests": async (_i, { actor }) => {
    const userId = requireUserId(actor);
    const day = await withTx(async (tx) => {
      const p = await lockProfile(tx, userId);
      await ensureQuests(tx, userId, p);
      return localDay(p);
    });
    return data(
      await db()
        .select()
        .from(quests)
        .where(and(eq(quests.userId, userId), eq(quests.localDate, day))),
    );
  },
  "me.streak": async (_i, { actor }) => {
    const userId = requireUserId(actor);
    await withTx(async (tx) => lockProfile(tx, userId));
    const [s] = await db().select().from(streakState).where(eq(streakState.userId, userId));
    return data(s ?? null);
  },

  // ---- Study ----
  "attempts.start": async (input, { actor }) => {
    const id = await startAttempt(actor, input);
    return data({ redirect: `/hoc/luot/${id}`, id });
  },
  "attempts.view": attemptAction("view"),
  "attempts.draft": attemptAction("draft"),
  "attempts.submit": attemptAction("submit"),
  "attempts.skip": attemptAction("skip"),
  "attempts.navigate": attemptAction("navigate"),
  "attempts.heartbeat": attemptAction("heartbeat"),
  "attempts.finish": attemptAction("finish"),
  "attempts.audioError": attemptAction("audio_error"),
  "attempts.retry": async (input, { actor, id }) =>
    data(await retryExercise(actor, id, input.exerciseId, input.response)),
  "guest.claim": async (input, { actor }) => {
    await claimGuestAttempt(actor, input.attemptId);
    return data({ redirect: `/hoc/luot/${input.attemptId}` });
  },

  // ---- Learner settings ----
  profile: async (input, { actor }) => {
    await updateProfile(actor, input);
    return saved();
  },
  enrollments: async (input, { actor }) => {
    await enroll(actor, input.pathId);
    return saved();
  },
  "vocabulary.save": async (input, { actor }) => {
    await saveWord(actor, input.senseId, input.notes ?? "", input.review);
    return saved();
  },
  "vocabulary.remove": async (input, { actor }) => {
    await removeWord(actor, input.senseId);
    return saved();
  },
  "review.rate": async (input, { actor }) => data(await rateCard(actor, input)),
  "review.manage": async (input, { actor }) => {
    await manageCard(
      actor,
      input.cardId,
      input.action,
      "confirm" in input ? input.confirm : undefined,
    );
    return saved();
  },
  "review.concept": async (input, { actor }) => {
    await saveConcept(actor, input.attemptId, input.exerciseId);
    return saved();
  },
  "shop.purchase": async (input, { actor }) => {
    await purchase(actor, input.itemId, input.requestKey);
    return saved();
  },
  avatar: async (input, { actor }) => {
    await setAvatar(actor, input.itemId);
    return saved();
  },
  reports: async (input, { actor }) => {
    await fileReport(actor, input);
    return saved();
  },
  reminders: async (input, { actor }) => {
    await setReminders(actor, input.enabled, input.hour);
    return saved();
  },
  "streak.preferences": async (input, { actor }) => {
    await setStreakPreferences(actor, input.autoProtect);
    return saved();
  },
  consent: async (input, { actor }) => {
    await setConsent(requireUserId(actor), input.analytics, noMarketing);
    return saved();
  },
  "analytics.consent": async (input, { actor }) => {
    const enabled = input.enabled === "yes";
    const slug = input.campaignSlug ?? "";
    if (enabled && !(await catalogPaths()).some((p) => p.slug === slug))
      throw new AppError(404, "Không tìm thấy chiến dịch khả dụng.");
    let session = await setConsent(actor.userId, enabled, actor.marketing ?? noMarketing);
    if (enabled) session = await landing(actor.userId, slug, input, session);
    return saved({ marketing: session });
  },

  // ---- Identity ----
  "password.resetRequest": async (input) => {
    await requestPasswordReset(input.email);
    return data({ message: "Nếu email phù hợp, hướng dẫn sẽ được đưa vào hàng đợi." });
  },
  "password.reset": async (input) => {
    await resetPassword(input.token, input.password);
    return data({ message: "Mật khẩu đã thay đổi. Hãy đăng nhập lại." });
  },
  "password.change": async (input, { actor }) => {
    await changePassword(actor, input.current, input.password);
    return data({ redirect: "/login" }, { signOut: true });
  },
  "email.verify": async (input, { actor }) => {
    await requestEmailVerification(actor, input.email);
    return data({ message: "Hướng dẫn xác minh đã được đưa vào hàng đợi." });
  },
  "email.consume": async (input) => {
    await consumeEmailToken(input.token, input.purpose);
    return saved();
  },
  "account.delete": async (input, { actor }) => {
    await requestAccountDeletion(actor, input.password);
    return data({ redirect: "/login" }, { signOut: true });
  },
  "exports.request": async (input, { actor }) => {
    await requestExport(actor, input.kind, input.requestKey);
    return data({
      message: "Đã đưa yêu cầu xuất dữ liệu vào hàng đợi. Tệp xuất có thời hạn 24 giờ.",
    });
  },

  // ---- Admin ----
  "admin.version": async (input, { actor }) =>
    data({ versionId: await saveVersion(actor, input) }, catalog),
  "admin.workflow": async (input, { actor }) => {
    await lessonWorkflow(actor, input.versionId, input.action);
    return saved(catalog);
  },
  "admin.unitState": async (input, { actor }) => {
    await setUnitArchived(actor, input.unitId, input.archived);
    return saved(catalog);
  },
  "admin.entity": async (input, { actor }) =>
    data({ id: await saveEntity(actor, input.kind, input) }, catalog),
  "admin.setItems": async (input, { actor }) => {
    await saveSetItems(actor, input.setId, input.ids);
    return saved(catalog);
  },
  "admin.draftSave": async (input, { actor }) => {
    await saveDraft(actor, input.type, input.draftId, input);
    return saved();
  },
  "admin.articleWorkflow": async (input, { actor }) => {
    await articleWorkflow(actor, input.versionId, input.action, input.reason);
    return saved(catalog);
  },
  "admin.entityWorkflow": async (input, { actor }) => {
    await entityWorkflow(actor, input.draftId, input.action, input.reason);
    return saved(catalog);
  },
  "admin.upload": async (input, { actor, file }) => {
    if (!file) throw invalid("Tệp không hợp lệ hoặc vượt quá 10 MB.");
    return data({ id: await uploadMedia(actor, file, input) });
  },
  "admin.importPreview": async (input, { actor }) =>
    data(await previewImport(actor, input.raw, input.namespace)),
  "admin.importCommit": async (input, { actor }) => {
    await commitImport(actor, input.importId);
    return saved(catalog);
  },
  "admin.reorder": async (input, { actor }) => {
    await reorder(actor, input.kind, input.ids);
    return saved(catalog);
  },
  "admin.report": async (input, { actor }) => {
    await triageReport(actor, input.id, input.status, input.resolution);
    return saved();
  },
  "admin.role": async (input, { actor }) => {
    await setRole(actor, input.userId, input.role);
    return saved();
  },
  "admin.seo": async (input, { actor }) => {
    await savePageSeo(actor, input);
    return saved(catalog);
  },
  "admin.settings": async (input, { actor }) => {
    await saveSetting(actor, input.name, input.value);
    return saved({ catalog: true });
  },
  "admin.rewardAdjust": async (input, { actor }) => {
    await adjustReward(actor, input);
    return saved();
  },
  "admin.jobRetry": async (input, { actor }) => {
    await retryJob(actor, input.jobId);
    return saved();
  },
} satisfies { [N in RouteName]: Handler<N> };
