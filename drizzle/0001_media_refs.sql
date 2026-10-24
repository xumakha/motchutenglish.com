CREATE TABLE `mce_media_refs` (
	`media_id` bigint unsigned NOT NULL,
	`version_id` bigint unsigned NOT NULL,
	CONSTRAINT `mce_media_refs_media_id_version_id_pk` PRIMARY KEY(`media_id`,`version_id`)
);
--> statement-breakpoint
ALTER TABLE `mce_media_refs` ADD CONSTRAINT `mce_media_refs_media_id_mce_media_id_fk` FOREIGN KEY (`media_id`) REFERENCES `mce_media`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mce_media_refs` ADD CONSTRAINT `mce_media_refs_version_id_mce_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `mce_versions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `media_refs_version` ON `mce_media_refs` (`version_id`);