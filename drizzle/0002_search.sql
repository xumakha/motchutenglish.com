CREATE TABLE `mce_search` (
	`version_id` bigint unsigned NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` mediumtext NOT NULL,
	CONSTRAINT `mce_search_version_id` PRIMARY KEY(`version_id`)
);
--> statement-breakpoint
ALTER TABLE `mce_search` ADD CONSTRAINT `mce_search_version_id_mce_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `mce_versions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Hand-written: Drizzle has no FULLTEXT builder (see searchDocuments in src/db/schema/catalog.ts).
-- Versions published before this table existed are indexed by `pnpm db:migrate` (scripts/db.ts).
CREATE FULLTEXT INDEX `search_text` ON `mce_search` (`title`, `body`);
