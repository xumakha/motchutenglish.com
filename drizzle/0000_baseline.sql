CREATE TABLE `auth_accounts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`account_id` varchar(255) NOT NULL,
	`provider_id` varchar(64) NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`password` varchar(255),
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` datetime(3),
	`refresh_token_expires_at` datetime(3),
	`scope` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `auth_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`token` varchar(255) NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`ip_address` varchar(64),
	`user_agent` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `auth_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_sessions_token` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `auth_verifications` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`identifier` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `auth_verifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` varchar(64) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	`window_started_at` datetime(3) NOT NULL,
	CONSTRAINT `rate_limits_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`email` varchar(254) NOT NULL,
	`email_verified` boolean NOT NULL DEFAULT false,
	`image` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `mce_active_time` (
	`user_id` bigint unsigned NOT NULL,
	`local_date` date NOT NULL,
	`seconds` int NOT NULL DEFAULT 0,
	`last_pulse` datetime(3) NOT NULL,
	CONSTRAINT `mce_active_time_user_id_local_date_pk` PRIMARY KEY(`user_id`,`local_date`)
);
--> statement-breakpoint
CREATE TABLE `mce_cohorts` (
	`user_id` bigint unsigned NOT NULL,
	`local_date` date NOT NULL,
	`timezone` varchar(80) NOT NULL,
	CONSTRAINT `mce_cohorts_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `mce_consents` (
	`user_id` bigint unsigned NOT NULL,
	`analytics` boolean NOT NULL DEFAULT false,
	`client_id` varchar(80) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `mce_consents_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `mce_deliveries` (
	`user_id` bigint unsigned NOT NULL,
	`local_date` date NOT NULL,
	`type` varchar(30) NOT NULL,
	`status` varchar(20) NOT NULL,
	CONSTRAINT `mce_deliveries_user_id_local_date_type_pk` PRIMARY KEY(`user_id`,`local_date`,`type`)
);
--> statement-breakpoint
CREATE TABLE `learning_roles` (
	`user_id` bigint unsigned NOT NULL,
	`role` enum('editor','admin') NOT NULL,
	CONSTRAINT `learning_roles_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `mce_profiles` (
	`user_id` bigint unsigned NOT NULL,
	`goal` varchar(30) NOT NULL DEFAULT 'foundation',
	`self_level` varchar(20) NOT NULL DEFAULT 'beginner',
	`minutes` int NOT NULL DEFAULT 10,
	`timezone` varchar(80) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
	`quest_timezone` varchar(80) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
	`timezone_changed_at` datetime(3),
	`review_limit` int NOT NULL DEFAULT 20,
	`path_id` bigint unsigned,
	`onboarding_at` datetime(3),
	`gamification` boolean NOT NULL DEFAULT true,
	`animations` boolean NOT NULL DEFAULT true,
	`avatar_style` varchar(30),
	`deleted_at` datetime(3),
	CONSTRAINT `mce_profiles_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `mce_reminders` (
	`user_id` bigint unsigned NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`hour` int NOT NULL DEFAULT 19,
	`unsubscribe_hash` char(64) NOT NULL,
	CONSTRAINT `mce_reminders_user_id` PRIMARY KEY(`user_id`),
	CONSTRAINT `mce_reminders_unsubscribe_hash_unique` UNIQUE(`unsubscribe_hash`)
);
--> statement-breakpoint
CREATE TABLE `mce_timezone_changes` (
	`user_id` bigint unsigned NOT NULL,
	`timezone` varchar(80) NOT NULL,
	`effective_after` datetime(3) NOT NULL,
	CONSTRAINT `mce_timezone_changes_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `mce_enrollments` (
	`user_id` bigint unsigned NOT NULL,
	`path_id` bigint unsigned NOT NULL,
	`enrolled_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `mce_enrollments_user_id_path_id_pk` PRIMARY KEY(`user_id`,`path_id`)
);
--> statement-breakpoint
CREATE TABLE `mce_entity_drafts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`kind` varchar(30) NOT NULL,
	`entity_id` bigint unsigned NOT NULL,
	`document` json NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'draft',
	`author_id` bigint unsigned NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `mce_entity_drafts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mce_external_refs` (
	`namespace` varchar(50) NOT NULL,
	`external_id` varchar(100) NOT NULL,
	`kind` varchar(30) NOT NULL,
	`entity_id` bigint unsigned NOT NULL,
	CONSTRAINT `mce_external_refs_namespace_external_id_kind_pk` PRIMARY KEY(`namespace`,`external_id`,`kind`)
);
--> statement-breakpoint
CREATE TABLE `mce_lessons` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`unit_id` bigint unsigned NOT NULL,
	`slug` varchar(150) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`required` boolean NOT NULL DEFAULT true,
	`subtype` varchar(20) NOT NULL DEFAULT 'lesson',
	`current_version` bigint unsigned,
	`archived` boolean NOT NULL DEFAULT false,
	`external_key` varchar(200),
	CONSTRAINT `mce_lessons_id` PRIMARY KEY(`id`),
	CONSTRAINT `mce_lessons_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `mce_lessons_external_key_unique` UNIQUE(`external_key`)
);
--> statement-breakpoint
CREATE TABLE `mce_media` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`storage_key` varchar(100) NOT NULL,
	`filename` varchar(200) NOT NULL,
	`mime` varchar(100) NOT NULL,
	`bytes` int NOT NULL,
	`alt_text` varchar(500) NOT NULL,
	`source` text NOT NULL,
	`license_text` varchar(500) NOT NULL,
	`uploader_id` bigint unsigned NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `mce_media_id` PRIMARY KEY(`id`),
	CONSTRAINT `mce_media_storage_key_unique` UNIQUE(`storage_key`)
);
--> statement-breakpoint
CREATE TABLE `mce_page_seo` (
	`path` varchar(255) NOT NULL,
	`title` varchar(160) NOT NULL DEFAULT '',
	`description` varchar(320) NOT NULL DEFAULT '',
	CONSTRAINT `mce_page_seo_path` PRIMARY KEY(`path`)
);
--> statement-breakpoint
CREATE TABLE `mce_paths` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`slug` varchar(150) NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text NOT NULL,
	`level` varchar(20) NOT NULL DEFAULT 'A1',
	`objectives` text NOT NULL,
	`prerequisites` text NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'draft',
	`sort_order` int NOT NULL DEFAULT 0,
	`image_id` bigint unsigned,
	`seo_title` varchar(160) NOT NULL DEFAULT '',
	`seo_description` varchar(320) NOT NULL DEFAULT '',
	CONSTRAINT `mce_paths_id` PRIMARY KEY(`id`),
	CONSTRAINT `mce_paths_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `mce_redirects` (
	`old_path` varchar(200) NOT NULL,
	`new_path` varchar(200) NOT NULL,
	CONSTRAINT `mce_redirects_old_path` PRIMARY KEY(`old_path`)
);
--> statement-breakpoint
CREATE TABLE `mce_settings` (
	`name` varchar(80) NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `mce_settings_name` PRIMARY KEY(`name`)
);
--> statement-breakpoint
CREATE TABLE `mce_units` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`path_id` bigint unsigned NOT NULL,
	`title` varchar(200) NOT NULL,
	`objectives` text NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`archived` boolean NOT NULL DEFAULT false,
	CONSTRAINT `mce_units_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mce_versions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`lesson_id` bigint unsigned NOT NULL,
	`title` varchar(200) NOT NULL,
	`document` json NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'draft',
	`author_id` bigint unsigned NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`published_at` datetime(3),
	CONSTRAINT `mce_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mce_attempts` (
	`id` char(32) NOT NULL,
	`user_id` bigint unsigned,
	`guest_key` char(64),
	`version_id` bigint unsigned NOT NULL,
	`mode` varchar(20) NOT NULL DEFAULT 'practice',
	`revision` int NOT NULL DEFAULT 0,
	`position` int NOT NULL DEFAULT 0,
	`viewed` json NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`score` int,
	`max_score` int,
	`started_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`finished_at` datetime(3),
	`active_seconds` int NOT NULL DEFAULT 0,
	`last_heartbeat` datetime(3),
	CONSTRAINT `mce_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mce_items` (
	`attempt_id` char(32) NOT NULL,
	`exercise_id` varchar(80) NOT NULL,
	`presented_order` json NOT NULL,
	`response` json,
	`first_response` json,
	`grading` json,
	`state` varchar(20) NOT NULL DEFAULT 'unanswered',
	CONSTRAINT `mce_items_attempt_id_exercise_id_pk` PRIMARY KEY(`attempt_id`,`exercise_id`)
);
--> statement-breakpoint
CREATE TABLE `mce_progress` (
	`user_id` bigint unsigned NOT NULL,
	`lesson_id` bigint unsigned NOT NULL,
	`first_score` int,
	`best_score` int,
	`completed_at` datetime(3) NOT NULL,
	`passed_at` datetime(3),
	CONSTRAINT `mce_progress_user_id_lesson_id_pk` PRIMARY KEY(`user_id`,`lesson_id`)
);
--> statement-breakpoint
CREATE TABLE `mce_review_cards` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`target_key` varchar(150) NOT NULL,
	`snapshot` json NOT NULL,
	`interval_days` int NOT NULL DEFAULT 0,
	`due_at` datetime(3) NOT NULL,
	`hidden` tinyint NOT NULL DEFAULT 0,
	`revision` int NOT NULL DEFAULT 0,
	CONSTRAINT `mce_review_cards_id` PRIMARY KEY(`id`),
	CONSTRAINT `review_cards_user_target` UNIQUE(`user_id`,`target_key`)
);
--> statement-breakpoint
CREATE TABLE `mce_review_events` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`card_id` bigint unsigned NOT NULL,
	`request_key` char(32) NOT NULL,
	`rating` varchar(20) NOT NULL,
	`previous_schedule` json NOT NULL,
	`new_schedule` json NOT NULL,
	`algorithm_version` int NOT NULL DEFAULT 1,
	`occurred_at` datetime(3) NOT NULL,
	CONSTRAINT `mce_review_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `mce_review_events_request_key_unique` UNIQUE(`request_key`)
);
--> statement-breakpoint
CREATE TABLE `mce_user_vocabulary` (
	`user_id` bigint unsigned NOT NULL,
	`sense_id` bigint unsigned NOT NULL,
	`notes` text NOT NULL,
	`hidden` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `mce_user_vocabulary_user_id_sense_id_pk` PRIMARY KEY(`user_id`,`sense_id`)
);
--> statement-breakpoint
CREATE TABLE `mce_vocabulary` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`slug` varchar(150) NOT NULL,
	`lemma` varchar(150) NOT NULL,
	`ipa` varchar(150) NOT NULL DEFAULT '',
	`part_of_speech` varchar(60) NOT NULL,
	`topic` varchar(100) NOT NULL,
	`meaning` text NOT NULL,
	`example` text NOT NULL,
	`translation` text NOT NULL,
	`level` varchar(20) NOT NULL DEFAULT 'A1',
	`audio_id` bigint unsigned,
	`status` varchar(20) NOT NULL DEFAULT 'draft',
	`seo_title` varchar(160) NOT NULL DEFAULT '',
	`seo_description` varchar(320) NOT NULL DEFAULT '',
	CONSTRAINT `mce_vocabulary_id` PRIMARY KEY(`id`),
	CONSTRAINT `mce_vocabulary_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `mce_vocabulary_set_items` (
	`set_id` bigint unsigned NOT NULL,
	`sense_id` bigint unsigned NOT NULL,
	CONSTRAINT `mce_vocabulary_set_items_set_id_sense_id_pk` PRIMARY KEY(`set_id`,`sense_id`)
);
--> statement-breakpoint
CREATE TABLE `mce_vocabulary_sets` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`slug` varchar(150) NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'draft',
	`sort_order` int NOT NULL DEFAULT 0,
	`seo_title` varchar(160) NOT NULL DEFAULT '',
	`seo_description` varchar(320) NOT NULL DEFAULT '',
	CONSTRAINT `mce_vocabulary_sets_id` PRIMARY KEY(`id`),
	CONSTRAINT `mce_vocabulary_sets_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `mce_activities` (
	`user_id` bigint unsigned NOT NULL,
	`local_date` date NOT NULL,
	`timezone` varchar(80) NOT NULL,
	`lessons` int NOT NULL DEFAULT 0,
	`reviews` int NOT NULL DEFAULT 0,
	CONSTRAINT `mce_activities_user_id_local_date_pk` PRIMARY KEY(`user_id`,`local_date`)
);
--> statement-breakpoint
CREATE TABLE `mce_badges` (
	`user_id` bigint unsigned NOT NULL,
	`badge` varchar(30) NOT NULL,
	`awarded_at` datetime(3) NOT NULL,
	CONSTRAINT `mce_badges_user_id_badge_pk` PRIMARY KEY(`user_id`,`badge`)
);
--> statement-breakpoint
CREATE TABLE `mce_balances` (
	`user_id` bigint unsigned NOT NULL,
	`currency` varchar(10) NOT NULL,
	`amount` int NOT NULL DEFAULT 0,
	CONSTRAINT `mce_balances_user_id_currency_pk` PRIMARY KEY(`user_id`,`currency`)
);
--> statement-breakpoint
CREATE TABLE `mce_events` (
	`id` char(32) NOT NULL,
	`event_key` varchar(200) NOT NULL,
	`user_id` bigint unsigned,
	`type` varchar(60) NOT NULL,
	`resource_id` varchar(80) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`occurred_at` datetime(3) NOT NULL,
	CONSTRAINT `mce_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `mce_events_event_key_unique` UNIQUE(`event_key`)
);
--> statement-breakpoint
CREATE TABLE `mce_inventory` (
	`user_id` bigint unsigned NOT NULL,
	`item_id` varchar(30) NOT NULL,
	`purchased_at` datetime(3) NOT NULL,
	CONSTRAINT `mce_inventory_user_id_item_id_pk` PRIMARY KEY(`user_id`,`item_id`)
);
--> statement-breakpoint
CREATE TABLE `mce_inventory_events` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`event_key` varchar(150) NOT NULL,
	`amount` int NOT NULL,
	`occurred_at` datetime(3) NOT NULL,
	CONSTRAINT `mce_inventory_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `mce_inventory_events_event_key_unique` UNIQUE(`event_key`)
);
--> statement-breakpoint
CREATE TABLE `mce_purchases` (
	`request_key` char(32) NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`item_id` varchar(30) NOT NULL,
	`price` int NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `mce_purchases_request_key` PRIMARY KEY(`request_key`)
);
--> statement-breakpoint
CREATE TABLE `mce_quest_events` (
	`user_id` bigint unsigned NOT NULL,
	`local_date` date NOT NULL,
	`template` varchar(30) NOT NULL,
	`source_key` varchar(150) NOT NULL,
	CONSTRAINT `mce_quest_events_user_id_local_date_template_source_key_pk` PRIMARY KEY(`user_id`,`local_date`,`template`,`source_key`)
);
--> statement-breakpoint
CREATE TABLE `mce_quests` (
	`user_id` bigint unsigned NOT NULL,
	`local_date` date NOT NULL,
	`template` varchar(30) NOT NULL,
	`timezone` varchar(80) NOT NULL,
	`target` int NOT NULL,
	`progress` int NOT NULL DEFAULT 0,
	`rewarded` boolean NOT NULL DEFAULT false,
	`rule_version` int NOT NULL DEFAULT 1,
	CONSTRAINT `mce_quests_user_id_local_date_template_pk` PRIMARY KEY(`user_id`,`local_date`,`template`)
);
--> statement-breakpoint
CREATE TABLE `reward_ledger` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'xp',
	`amount` int NOT NULL,
	`event_key` varchar(150) NOT NULL,
	`rule_version` int NOT NULL DEFAULT 1,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `reward_ledger_id` PRIMARY KEY(`id`),
	CONSTRAINT `reward_ledger_event_key_unique` UNIQUE(`event_key`)
);
--> statement-breakpoint
CREATE TABLE `mce_shop` (
	`id` varchar(30) NOT NULL,
	`title` varchar(100) NOT NULL,
	`price` int NOT NULL,
	`style` varchar(30) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `mce_shop_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mce_streak_calendar` (
	`user_id` bigint unsigned NOT NULL,
	`local_date` date NOT NULL,
	`status` varchar(20) NOT NULL,
	`timezone` varchar(80) NOT NULL,
	`evaluated_at` datetime(3) NOT NULL,
	CONSTRAINT `mce_streak_calendar_user_id_local_date_pk` PRIMARY KEY(`user_id`,`local_date`)
);
--> statement-breakpoint
CREATE TABLE `mce_streak_state` (
	`user_id` bigint unsigned NOT NULL,
	`current_streak` int NOT NULL DEFAULT 0,
	`longest_streak` int NOT NULL DEFAULT 0,
	`learned_days` int NOT NULL DEFAULT 0,
	`tickets` int NOT NULL DEFAULT 0,
	`auto_protect` boolean NOT NULL DEFAULT true,
	`last_date` date,
	CONSTRAINT `mce_streak_state_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `mce_article_versions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`article_id` bigint unsigned NOT NULL,
	`document` json NOT NULL,
	`actor_id` bigint unsigned NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `mce_article_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mce_articles` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`slug` varchar(150) NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` text NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'draft',
	`revision` int NOT NULL DEFAULT 1,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`seo_title` varchar(160) NOT NULL DEFAULT '',
	`seo_description` varchar(320) NOT NULL DEFAULT '',
	CONSTRAINT `mce_articles_id` PRIMARY KEY(`id`),
	CONSTRAINT `mce_articles_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `mce_audit` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`actor_id` bigint unsigned,
	`action` varchar(80) NOT NULL,
	`target` varchar(150) NOT NULL,
	`details` json NOT NULL,
	`occurred_at` datetime(3) NOT NULL,
	CONSTRAINT `mce_audit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mce_import_progress` (
	`import_id` char(32) NOT NULL,
	`processed` int unsigned NOT NULL DEFAULT 0,
	`total` int unsigned NOT NULL DEFAULT 0,
	`phase` varchar(20) NOT NULL DEFAULT 'preview',
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `mce_import_progress_import_id` PRIMARY KEY(`import_id`)
);
--> statement-breakpoint
CREATE TABLE `mce_imports` (
	`id` char(32) NOT NULL,
	`actor_id` bigint unsigned NOT NULL,
	`document` json NOT NULL,
	`errors` json NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'preview',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `mce_imports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mce_reports` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`version_id` bigint unsigned NOT NULL,
	`position` varchar(80) NOT NULL,
	`category` varchar(30) NOT NULL,
	`description` text NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'open',
	`resolution` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `mce_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mce_exports` (
	`id` char(32) NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`kind` varchar(20) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'queued',
	`file_key` char(37),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`expires_at` datetime(3) NOT NULL,
	CONSTRAINT `mce_exports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mce_jobs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`type` varchar(40) NOT NULL,
	`payload` json NOT NULL,
	`event_key` varchar(200) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`available_at` datetime(3) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`locked_at` datetime(3),
	`last_error` varchar(200),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `mce_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `mce_jobs_event_key_unique` UNIQUE(`event_key`)
);
--> statement-breakpoint
CREATE TABLE `mce_journeys` (
	`id` char(32) NOT NULL,
	`user_id` bigint unsigned,
	`path_slug` varchar(150) NOT NULL,
	`source` varchar(30) NOT NULL,
	`medium` varchar(30) NOT NULL,
	`campaign` varchar(150) NOT NULL,
	`landed_at` datetime(3) NOT NULL,
	`guest_trial_at` datetime(3),
	`signup_at` datetime(3),
	`first_lesson_at` datetime(3),
	`returned_at` datetime(3),
	CONSTRAINT `mce_journeys_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `learning_attempts` (
	`id` char(32) NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`lesson_id` bigint unsigned NOT NULL,
	`snapshot` json NOT NULL,
	`response` varchar(20),
	`score` int,
	`submitted_at` datetime(3),
	CONSTRAINT `learning_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `learning_audit` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`actor_id` bigint unsigned NOT NULL,
	`action` varchar(50) NOT NULL,
	`target_id` bigint unsigned NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `learning_audit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `learning_events` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`event_key` varchar(150) NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`lesson_id` bigint unsigned NOT NULL,
	`attempt_id` char(32) NOT NULL,
	`event_type` varchar(50) NOT NULL,
	`payload` json NOT NULL,
	`occurred_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `learning_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `learning_events_event_key_unique` UNIQUE(`event_key`)
);
--> statement-breakpoint
CREATE TABLE `learning_lessons` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` text NOT NULL,
	`question` text NOT NULL,
	`choices` json NOT NULL,
	`answer_id` varchar(20) NOT NULL,
	`explanation` text NOT NULL,
	`status` enum('draft','published') NOT NULL DEFAULT 'draft',
	`created_by` bigint unsigned NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `learning_lessons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `learning_seed_keys` (
	`seed_key` varchar(100) NOT NULL,
	`lesson_id` bigint unsigned NOT NULL,
	CONSTRAINT `learning_seed_keys_seed_key` PRIMARY KEY(`seed_key`)
);
--> statement-breakpoint
ALTER TABLE `auth_accounts` ADD CONSTRAINT `auth_accounts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_active_time` ADD CONSTRAINT `mce_active_time_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_cohorts` ADD CONSTRAINT `mce_cohorts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_consents` ADD CONSTRAINT `mce_consents_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_deliveries` ADD CONSTRAINT `mce_deliveries_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `learning_roles` ADD CONSTRAINT `learning_roles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_profiles` ADD CONSTRAINT `mce_profiles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_profiles` ADD CONSTRAINT `mce_profiles_path_id_mce_paths_id_fk` FOREIGN KEY (`path_id`) REFERENCES `mce_paths`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_reminders` ADD CONSTRAINT `mce_reminders_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_timezone_changes` ADD CONSTRAINT `mce_timezone_changes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_enrollments` ADD CONSTRAINT `mce_enrollments_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_enrollments` ADD CONSTRAINT `mce_enrollments_path_id_mce_paths_id_fk` FOREIGN KEY (`path_id`) REFERENCES `mce_paths`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_entity_drafts` ADD CONSTRAINT `mce_entity_drafts_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_lessons` ADD CONSTRAINT `mce_lessons_unit_id_mce_units_id_fk` FOREIGN KEY (`unit_id`) REFERENCES `mce_units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_lessons` ADD CONSTRAINT `mce_lessons_current_version_mce_versions_id_fk` FOREIGN KEY (`current_version`) REFERENCES `mce_versions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_media` ADD CONSTRAINT `mce_media_uploader_id_users_id_fk` FOREIGN KEY (`uploader_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_paths` ADD CONSTRAINT `mce_paths_image_id_mce_media_id_fk` FOREIGN KEY (`image_id`) REFERENCES `mce_media`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_units` ADD CONSTRAINT `mce_units_path_id_mce_paths_id_fk` FOREIGN KEY (`path_id`) REFERENCES `mce_paths`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_versions` ADD CONSTRAINT `mce_versions_lesson_id_mce_lessons_id_fk` FOREIGN KEY (`lesson_id`) REFERENCES `mce_lessons`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_versions` ADD CONSTRAINT `mce_versions_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_attempts` ADD CONSTRAINT `mce_attempts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_attempts` ADD CONSTRAINT `mce_attempts_version_id_mce_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `mce_versions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_items` ADD CONSTRAINT `mce_items_attempt_id_mce_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `mce_attempts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_progress` ADD CONSTRAINT `mce_progress_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_progress` ADD CONSTRAINT `mce_progress_lesson_id_mce_lessons_id_fk` FOREIGN KEY (`lesson_id`) REFERENCES `mce_lessons`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_review_cards` ADD CONSTRAINT `mce_review_cards_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_review_events` ADD CONSTRAINT `mce_review_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_review_events` ADD CONSTRAINT `mce_review_events_card_id_mce_review_cards_id_fk` FOREIGN KEY (`card_id`) REFERENCES `mce_review_cards`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_user_vocabulary` ADD CONSTRAINT `mce_user_vocabulary_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_user_vocabulary` ADD CONSTRAINT `mce_user_vocabulary_sense_id_mce_vocabulary_id_fk` FOREIGN KEY (`sense_id`) REFERENCES `mce_vocabulary`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_vocabulary_set_items` ADD CONSTRAINT `mce_vocabulary_set_items_set_id_mce_vocabulary_sets_id_fk` FOREIGN KEY (`set_id`) REFERENCES `mce_vocabulary_sets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_vocabulary_set_items` ADD CONSTRAINT `mce_vocabulary_set_items_sense_id_mce_vocabulary_id_fk` FOREIGN KEY (`sense_id`) REFERENCES `mce_vocabulary`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_activities` ADD CONSTRAINT `mce_activities_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_badges` ADD CONSTRAINT `mce_badges_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_balances` ADD CONSTRAINT `mce_balances_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_events` ADD CONSTRAINT `mce_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_inventory` ADD CONSTRAINT `mce_inventory_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_inventory` ADD CONSTRAINT `mce_inventory_item_id_mce_shop_id_fk` FOREIGN KEY (`item_id`) REFERENCES `mce_shop`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_inventory_events` ADD CONSTRAINT `mce_inventory_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_purchases` ADD CONSTRAINT `mce_purchases_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_quest_events` ADD CONSTRAINT `mce_quest_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_quests` ADD CONSTRAINT `mce_quests_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reward_ledger` ADD CONSTRAINT `reward_ledger_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_streak_calendar` ADD CONSTRAINT `mce_streak_calendar_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_streak_state` ADD CONSTRAINT `mce_streak_state_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_article_versions` ADD CONSTRAINT `mce_article_versions_article_id_mce_articles_id_fk` FOREIGN KEY (`article_id`) REFERENCES `mce_articles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_article_versions` ADD CONSTRAINT `mce_article_versions_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_audit` ADD CONSTRAINT `mce_audit_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_imports` ADD CONSTRAINT `mce_imports_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_reports` ADD CONSTRAINT `mce_reports_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_reports` ADD CONSTRAINT `mce_reports_version_id_mce_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `mce_versions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_exports` ADD CONSTRAINT `mce_exports_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_journeys` ADD CONSTRAINT `mce_journeys_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `learning_attempts` ADD CONSTRAINT `learning_attempts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `learning_attempts` ADD CONSTRAINT `learning_attempts_lesson_id_learning_lessons_id_fk` FOREIGN KEY (`lesson_id`) REFERENCES `learning_lessons`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `learning_audit` ADD CONSTRAINT `learning_audit_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `learning_events` ADD CONSTRAINT `learning_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `learning_lessons` ADD CONSTRAINT `learning_lessons_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `auth_accounts_user` ON `auth_accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_verifications_identifier` ON `auth_verifications` (`identifier`);--> statement-breakpoint
CREATE INDEX `rate_limits_window` ON `rate_limits` (`window_started_at`);--> statement-breakpoint
CREATE INDEX `lesson_unit_order` ON `mce_lessons` (`unit_id`,`archived`,`sort_order`,`id`);--> statement-breakpoint
CREATE INDEX `catalog_status_order` ON `mce_paths` (`status`,`sort_order`,`id`);--> statement-breakpoint
CREATE INDEX `unit_path_order` ON `mce_units` (`path_id`,`sort_order`,`id`);--> statement-breakpoint
CREATE INDEX `versions_status_lesson` ON `mce_versions` (`status`,`lesson_id`);--> statement-breakpoint
CREATE INDEX `attempt_resume` ON `mce_attempts` (`user_id`,`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `attempt_guest` ON `mce_attempts` (`guest_key`);--> statement-breakpoint
CREATE INDEX `review_cards_due` ON `mce_review_cards` (`user_id`,`hidden`,`due_at`);--> statement-breakpoint
CREATE INDEX `review_events_user_time` ON `mce_review_events` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `review_user_target` ON `mce_review_events` (`user_id`,`card_id`);--> statement-breakpoint
CREATE INDEX `events_user_type_time` ON `mce_events` (`user_id`,`type`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `operational_events` ON `mce_events` (`type`,`occurred_at`,`user_id`);--> statement-breakpoint
CREATE INDEX `ledger_user_currency` ON `reward_ledger` (`user_id`,`currency`,`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_ready` ON `mce_jobs` (`status`,`available_at`,`id`);--> statement-breakpoint
CREATE INDEX `journeys_user` ON `mce_journeys` (`user_id`,`landed_at`);--> statement-breakpoint
CREATE INDEX `journeys_landed` ON `mce_journeys` (`landed_at`);