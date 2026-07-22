CREATE TABLE `job_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` text NOT NULL,
	`trigger` text DEFAULT 'manual' NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text DEFAULT 'running' NOT NULL,
	`summary` text DEFAULT '',
	`error` text DEFAULT ''
);
--> statement-breakpoint
CREATE INDEX `job_runs_job_id_idx` ON `job_runs` (`job_id`);--> statement-breakpoint
CREATE INDEX `job_runs_started_at_idx` ON `job_runs` (`started_at`);--> statement-breakpoint
ALTER TABLE `works` ADD `last_error` text DEFAULT '';