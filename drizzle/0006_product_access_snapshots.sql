CREATE TABLE `payment_fulfillment_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`order_item_id` text NOT NULL,
	`action` text NOT NULL,
	`payload` text NOT NULL,
	`payload_hash` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`order_id`) REFERENCES `payment_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_item_id`) REFERENCES `payment_order_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_payment_fulfillment_order_status` ON `payment_fulfillment_jobs` (`order_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_payment_fulfillment_retry` ON `payment_fulfillment_jobs` (`status`,`next_attempt_at`);--> statement-breakpoint
ALTER TABLE `payment_order_items` ADD `access_products` text DEFAULT '["learn"]' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `access_products` text DEFAULT '["learn"]' NOT NULL;