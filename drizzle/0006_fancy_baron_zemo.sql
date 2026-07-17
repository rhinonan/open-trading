ALTER TABLE `works` ADD `claimed_at` integer;--> statement-breakpoint
CREATE INDEX `works_blogger_id_idx` ON `works` (`blogger_id`);--> statement-breakpoint
CREATE INDEX `works_transcript_status_idx` ON `works` (`transcript_status`);