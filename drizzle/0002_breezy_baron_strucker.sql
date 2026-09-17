ALTER TABLE `appearance_settings` ADD `theme_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `appearance_settings` ADD `theme_preset` text DEFAULT 'juris' NOT NULL;--> statement-breakpoint
ALTER TABLE `appearance_settings` ADD `theme_custom_background` text DEFAULT '#101820' NOT NULL;--> statement-breakpoint
ALTER TABLE `appearance_settings` ADD `theme_custom_surface` text DEFAULT '#1A2A36' NOT NULL;--> statement-breakpoint
ALTER TABLE `appearance_settings` ADD `theme_custom_text` text DEFAULT '#F2F7FA' NOT NULL;--> statement-breakpoint
ALTER TABLE `appearance_settings` ADD `theme_custom_accent` text DEFAULT '#63B6D9' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `seller_badge` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `best_seller_badge` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `promotion_badge` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `promotion_percent` integer DEFAULT 10 NOT NULL;