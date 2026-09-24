CREATE TABLE `content_save_guards` (
	`id` text PRIMARY KEY NOT NULL,
	`ok` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `products` ADD `inventory_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `archived` integer DEFAULT false NOT NULL;