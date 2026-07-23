ALTER TABLE `works` ADD `pipeline_stage` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `works` ADD `pipeline_progress` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `works` ADD `pipeline_stage_label` text DEFAULT '' NOT NULL;
