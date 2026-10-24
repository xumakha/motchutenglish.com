"use server";

import { routeAction } from "@/server/route-action";

// Server Actions for every contract route that HTML forms use (transport "action"). Each one is
// the shared route handler behind a form; see src/server/route-action.ts.
// src/actions/routes.test.ts fails if a form route has no action here.

// Study
export const startLesson = routeAction("attempts.start");
export const claimGuest = routeAction("guest.claim");

// Learner settings
export const saveProfile = routeAction("profile");
export const enrollPath = routeAction("enrollments");
export const saveVocabulary = routeAction("vocabulary.save");
export const removeVocabulary = routeAction("vocabulary.remove");
export const manageReviewCard = routeAction("review.manage");
export const buyItem = routeAction("shop.purchase");
export const chooseAvatar = routeAction("avatar");
export const saveReminders = routeAction("reminders");
export const saveStreakPreferences = routeAction("streak.preferences");
export const saveConsent = routeAction("consent");
export const saveCampaignConsent = routeAction("analytics.consent");

// Identity
export const requestPasswordResetAction = routeAction("password.resetRequest");
export const resetPasswordAction = routeAction("password.reset");
export const changePasswordAction = routeAction("password.change");
export const requestEmailVerificationAction = routeAction("email.verify");
export const deleteAccountAction = routeAction("account.delete");
export const requestDataExport = routeAction("exports.request");

// Admin
export const saveLessonVersion = routeAction("admin.version");
export const lessonWorkflowAction = routeAction("admin.workflow");
export const setUnitState = routeAction("admin.unitState");
export const saveContentEntity = routeAction("admin.entity");
export const saveVocabularySetItems = routeAction("admin.setItems");
export const saveContentDraft = routeAction("admin.draftSave");
export const articleWorkflowAction = routeAction("admin.articleWorkflow");
export const entityWorkflowAction = routeAction("admin.entityWorkflow");
export const previewImportAction = routeAction("admin.importPreview");
export const commitImportAction = routeAction("admin.importCommit");
export const reorderContent = routeAction("admin.reorder");
export const triageReportAction = routeAction("admin.report");
export const setUserRole = routeAction("admin.role");
export const savePageSeoAction = routeAction("admin.seo");
export const saveSiteSetting = routeAction("admin.settings");
export const adjustRewardAction = routeAction("admin.rewardAdjust");
export const retryJobAction = routeAction("admin.jobRetry");
