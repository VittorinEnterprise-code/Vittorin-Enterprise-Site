ALTER TABLE products ADD COLUMN catalog_scope text NOT NULL DEFAULT 'main';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS atelier_content (id integer PRIMARY KEY CHECK(id = 1), content_json text NOT NULL, updated_at integer NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS atelier_links (id text PRIMARY KEY, token_hash text NOT NULL UNIQUE, product_id text, label text NOT NULL, created_at integer NOT NULL, expires_at integer, revoked_at integer);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_atelier_links_product ON atelier_links(product_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS atelier_product_files (product_id text PRIMARY KEY, file_key text NOT NULL, file_name text NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS atelier_order_files (item_id text PRIMARY KEY, order_id text NOT NULL, file_key text NOT NULL, file_name text NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_atelier_order_files_order ON atelier_order_files(order_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS atelier_orders (order_id text PRIMARY KEY);
