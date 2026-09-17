CREATE TABLE `appearance_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`interface_scale` integer NOT NULL,
	`font_scale` integer NOT NULL,
	`bold_text` integer NOT NULL,
	`contrast` integer NOT NULL,
	`custom_font_url` text NOT NULL,
	`background_audio_url` text NOT NULL,
	`background_audio_enabled` integer NOT NULL,
	`background_audio_volume` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `showcase_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`transparency` integer NOT NULL,
	`black_fade` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `social_contact_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`enabled` integer NOT NULL,
	`position` text NOT NULL,
	`button_label` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `social_links` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`accent_color` text NOT NULL,
	`is_visible` integer NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_social_links_visible_order` ON `social_links` (`is_visible`,`sort_order`);--> statement-breakpoint
CREATE TABLE `welcome_elements` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`eyebrow` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`link_label` text NOT NULL,
	`link_url` text NOT NULL,
	`accent_color` text NOT NULL,
	`is_visible` integer NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_welcome_visible_order` ON `welcome_elements` (`is_visible`,`sort_order`);