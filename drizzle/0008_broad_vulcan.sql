ALTER TABLE `works` ADD `media_type` integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE `works` ADD `image_urls` text DEFAULT '[]' NOT NULL;