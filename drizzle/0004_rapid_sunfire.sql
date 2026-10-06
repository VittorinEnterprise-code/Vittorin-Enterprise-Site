CREATE TABLE `payment_inventory_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`order_item_id` text NOT NULL,
	`product_id` text NOT NULL,
	`inventory_mode` text NOT NULL,
	`quantity` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `payment_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_item_id`) REFERENCES `payment_order_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_inventory_order_item` ON `payment_inventory_reservations` (`order_item_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_inventory_product_status` ON `payment_inventory_reservations` (`product_id`,`status`);--> statement-breakpoint
CREATE TABLE `payment_order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`product_slug` text NOT NULL,
	`product_name` text NOT NULL,
	`sku` text NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`quantity` integer NOT NULL,
	`total_cents` integer NOT NULL,
	`fulfillment_mode` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `payment_orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_payment_order_items_order_id` ON `payment_order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `payment_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`public_token_hash` text NOT NULL,
	`buyer_email` text NOT NULL,
	`provider_order_id` text,
	`provider_user_id` text,
	`provider_status` text,
	`provider_status_detail` text,
	`status` text NOT NULL,
	`status_detail` text NOT NULL,
	`currency` text NOT NULL,
	`total_cents` integer NOT NULL,
	`checkout_url` text,
	`failure_reason` text,
	`fulfillment_status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`paid_at` integer,
	`last_verified_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_orders_idempotency_key` ON `payment_orders` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_orders_provider_order_id` ON `payment_orders` (`provider_order_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_orders_status_created_at` ON `payment_orders` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_payment_orders_created_at` ON `payment_orders` (`created_at`);--> statement-breakpoint
CREATE TABLE `payment_webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_order_id` text NOT NULL,
	`action` text NOT NULL,
	`payload_hash` text NOT NULL,
	`signature_variant` text,
	`status` text NOT NULL,
	`failure_reason` text,
	`created_at` integer NOT NULL,
	`processed_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_payment_webhook_provider_order` ON `payment_webhook_events` (`provider_order_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_webhook_created_at` ON `payment_webhook_events` (`created_at`);--> statement-breakpoint
ALTER TABLE `products` ADD `sku` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `price_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `currency` text DEFAULT 'BRL' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `is_sellable` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `inventory_mode` text DEFAULT 'unlimited' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `stock_quantity` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `fulfillment_mode` text DEFAULT 'manual' NOT NULL;