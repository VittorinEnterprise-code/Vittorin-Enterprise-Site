CREATE TABLE `payment_test_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`mp_order_id` text,
	`buyer_email` text,
	`product_name` text NOT NULL,
	`amount` text NOT NULL,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`status_detail` text NOT NULL,
	`checkout_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_test_orders_mp_order_id` ON `payment_test_orders` (`mp_order_id`);
--> statement-breakpoint
CREATE INDEX `idx_payment_test_orders_created_at` ON `payment_test_orders` (`created_at`);
