PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bloggers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text DEFAULT '' NOT NULL,
	`douyin_uid` text NOT NULL,
	`nickname` text NOT NULL,
	`avatar_url` text DEFAULT '' NOT NULL,
	`signature` text DEFAULT '' NOT NULL,
	`follower_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);--> statement-breakpoint
INSERT INTO `__new_bloggers`("id", "slug", "douyin_uid", "nickname", "avatar_url", "signature", "follower_count", "created_at", "updated_at") SELECT "id", '', "douyin_uid", "nickname", "avatar_url", "signature", "follower_count", "created_at", "updated_at" FROM `bloggers`;--> statement-breakpoint
DROP TABLE `bloggers`;--> statement-breakpoint
ALTER TABLE `__new_bloggers` RENAME TO `bloggers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `bloggers_douyin_uid_unique` ON `bloggers` (`douyin_uid`);--> statement-breakpoint
CREATE TABLE `__new_prediction_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`evaluation_id` integer NOT NULL,
	`work_id` integer NOT NULL,
	`predicted_content` text NOT NULL,
	`prediction_target` text DEFAULT '' NOT NULL,
	`prediction_detail` text DEFAULT '{}' NOT NULL,
	`judgment` text DEFAULT 'not_applicable' NOT NULL,
	`related_symbols` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`evaluation_id`) REFERENCES `evaluations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`work_id`) REFERENCES `works`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_prediction_items`("id", "evaluation_id", "work_id", "predicted_content", "prediction_target", "prediction_detail", "judgment", "related_symbols") SELECT "id", "evaluation_id", "work_id", "predicted_content", "prediction_target", "prediction_detail", "judgment", "related_symbols" FROM `prediction_items`;--> statement-breakpoint
DROP TABLE `prediction_items`;--> statement-breakpoint
ALTER TABLE `__new_prediction_items` RENAME TO `prediction_items`;
