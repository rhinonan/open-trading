CREATE TABLE `bloggers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`douyin_uid` text NOT NULL,
	`nickname` text NOT NULL,
	`avatar_url` text DEFAULT '' NOT NULL,
	`signature` text DEFAULT '' NOT NULL,
	`follower_count` integer DEFAULT 0 NOT NULL,
	`category` text DEFAULT 'pending' NOT NULL,
	`classified_at` integer,
	`classification_note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bloggers_douyin_uid_unique` ON `bloggers` (`douyin_uid`);--> statement-breakpoint
CREATE TABLE `evaluations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`blogger_id` integer NOT NULL,
	`eval_date` text NOT NULL,
	`works_count` integer DEFAULT 0 NOT NULL,
	`prediction_summary` text DEFAULT '' NOT NULL,
	`accuracy_score` integer DEFAULT 0 NOT NULL,
	`eval_detail` text DEFAULT '{}' NOT NULL,
	`market_snapshot` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`blogger_id`) REFERENCES `bloggers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `prediction_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`evaluation_id` integer NOT NULL,
	`work_id` integer NOT NULL,
	`predicted_content` text NOT NULL,
	`prediction_type` text NOT NULL,
	`prediction_target` text DEFAULT '' NOT NULL,
	`prediction_detail` text DEFAULT '{}' NOT NULL,
	`is_correct` integer,
	`judgment` text DEFAULT '' NOT NULL,
	`related_symbols` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`evaluation_id`) REFERENCES `evaluations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`work_id`) REFERENCES `works`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `works` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`aweme_id` text NOT NULL,
	`blogger_id` integer NOT NULL,
	`desc` text DEFAULT '' NOT NULL,
	`transcript` text,
	`transcript_status` text DEFAULT 'pending' NOT NULL,
	`duration` integer DEFAULT 0 NOT NULL,
	`cover_url` text DEFAULT '' NOT NULL,
	`share_url` text DEFAULT '' NOT NULL,
	`statistics` text DEFAULT '{}' NOT NULL,
	`published_at` integer NOT NULL,
	`scanned_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`blogger_id`) REFERENCES `bloggers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `works_aweme_id_unique` ON `works` (`aweme_id`);