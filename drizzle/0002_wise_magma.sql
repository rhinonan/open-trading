PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bloggers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`douyin_uid` text NOT NULL,
	`nickname` text NOT NULL,
	`avatar_url` text DEFAULT '' NOT NULL,
	`signature` text DEFAULT '' NOT NULL,
	`follower_count` integer DEFAULT 0 NOT NULL,
	`category` text DEFAULT 'predictor' NOT NULL,
	`classified_at` integer,
	`classification_note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_bloggers`("id", "douyin_uid", "nickname", "avatar_url", "signature", "follower_count", "category", "classified_at", "classification_note", "created_at", "updated_at") SELECT "id", "douyin_uid", "nickname", "avatar_url", "signature", "follower_count", "category", "classified_at", "classification_note", "created_at", "updated_at" FROM `bloggers`;--> statement-breakpoint
DROP TABLE `bloggers`;--> statement-breakpoint
ALTER TABLE `__new_bloggers` RENAME TO `bloggers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `bloggers_douyin_uid_unique` ON `bloggers` (`douyin_uid`);--> statement-breakpoint
ALTER TABLE `works` ADD `opinion_summary` text DEFAULT '' NOT NULL;