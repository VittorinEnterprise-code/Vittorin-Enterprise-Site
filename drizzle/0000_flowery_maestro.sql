CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text NOT NULL,
	`sort_order` integer NOT NULL,
	`is_visible` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_categories_slug` ON `categories` (`slug`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`eyebrow` text NOT NULL,
	`subtitle` text NOT NULL,
	`description` text NOT NULL,
	`image_url` text NOT NULL,
	`video_url` text NOT NULL,
	`product_url` text NOT NULL,
	`cta_label` text NOT NULL,
	`status` text NOT NULL,
	`accent_color` text NOT NULL,
	`featured` integer NOT NULL,
	`is_visible` integer NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_products_slug` ON `products` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_products_category_order` ON `products` (`category_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_products_visible_order` ON `products` (`is_visible`,`sort_order`);--> statement-breakpoint
CREATE TABLE `site_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`brand_name` text NOT NULL,
	`announcement` text NOT NULL,
	`hero_eyebrow` text NOT NULL,
	`hero_title` text NOT NULL,
	`hero_subtitle` text NOT NULL,
	`primary_cta_label` text NOT NULL,
	`primary_cta_url` text NOT NULL,
	`logo_url` text NOT NULL,
	`hero_image_url` text NOT NULL,
	`accent_color` text NOT NULL,
	`grid_columns` integer NOT NULL,
	`promo_title` text NOT NULL,
	`promo_subtitle` text NOT NULL,
	`promo_video_url` text NOT NULL,
	`show_promo_video` integer NOT NULL,
	`footer_text` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
PRAGMA optimize;
