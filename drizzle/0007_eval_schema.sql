ALTER TABLE `works` ADD `eval_status` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `works` ADD `eval_claimed_at` integer;--> statement-breakpoint
ALTER TABLE `works` ADD `evaluated_at` integer;--> statement-breakpoint
CREATE INDEX `works_eval_status_idx` ON `works` (`eval_status`);--> statement-breakpoint
DROP TABLE `evaluations`;--> statement-breakpoint
DROP TABLE `prediction_items`;--> statement-breakpoint
CREATE TABLE `prediction_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`work_id` integer NOT NULL REFERENCES `works`(`id`) ON DELETE CASCADE,
	`predicted_content` text NOT NULL,
	`prediction_target` text DEFAULT '' NOT NULL,
	`related_symbols` text DEFAULT '[]' NOT NULL,
	`judgment` text NOT NULL,
	`verifiable_after` text,
	`reasoning` text DEFAULT '' NOT NULL,
	`evidence` text DEFAULT '{}' NOT NULL,
	`judged_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `pred_items_work_id_idx` ON `prediction_items` (`work_id`);--> statement-breakpoint
CREATE INDEX `pred_items_judgment_idx` ON `prediction_items` (`judgment`);--> statement-breakpoint
CREATE INDEX `pred_items_verifiable_idx` ON `prediction_items` (`verifiable_after`) WHERE `judgment` = 'not_yet';
