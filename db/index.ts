import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let schemaInitialized = false;

export function getD1Binding() {
  if (!env.DB) {
    throw new Error("O banco de dados do Estúdio está temporariamente indisponível.");
  }

  return env.DB;
}

export function getDb() {
  return drizzle(getD1Binding(), { schema });
}

export async function ensureDatabaseSchema() {
  // Sites applies the tracked Drizzle migrations before the Worker starts.
  // The production Cloudflare Worker keeps its legacy idempotent bootstrap.
  if (env.SITES_VALIDATION_AUTH === "1") return;

  if (schemaInitialized) return;

  // Never retain a request-scoped D1 promise in module state. Concurrent cold
  // start requests may each run this idempotent bootstrap; only completion is
  // cached, which is safe across Worker requests.
  const database = getD1Binding();
  await database.batch([
        database.prepare(`CREATE TABLE IF NOT EXISTS categories (
          id text PRIMARY KEY NOT NULL,
          name text NOT NULL,
          slug text NOT NULL,
          description text NOT NULL,
          sort_order integer NOT NULL,
          is_visible integer NOT NULL
        )`),
        database.prepare(
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_slug ON categories (slug)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS products (
          id text PRIMARY KEY NOT NULL,
          category_id text,
          name text NOT NULL,
          slug text NOT NULL,
          eyebrow text NOT NULL,
          subtitle text NOT NULL,
          description text NOT NULL,
          image_url text NOT NULL,
          video_url text NOT NULL,
          product_url text NOT NULL,
          cta_label text NOT NULL,
          status text NOT NULL,
          accent_color text NOT NULL,
          featured integer NOT NULL,
          seller_badge integer NOT NULL DEFAULT 0,
          best_seller_badge integer NOT NULL DEFAULT 0,
          promotion_badge integer NOT NULL DEFAULT 0,
          promotion_percent integer NOT NULL DEFAULT 10,
          sku text NOT NULL DEFAULT '',
          price_cents integer NOT NULL DEFAULT 0,
          currency text NOT NULL DEFAULT 'BRL',
          is_sellable integer NOT NULL DEFAULT 0,
          inventory_mode text NOT NULL DEFAULT 'unlimited',
          stock_quantity integer NOT NULL DEFAULT 0,
          inventory_revision integer NOT NULL DEFAULT 0,
          fulfillment_mode text NOT NULL DEFAULT 'manual',
          archived integer NOT NULL DEFAULT 0,
          is_visible integer NOT NULL,
          sort_order integer NOT NULL,
          FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
        )`),
        database.prepare(
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug ON products (slug)",
        ),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS idx_products_category_order ON products (category_id, sort_order)",
        ),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS idx_products_visible_order ON products (is_visible, sort_order)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS content_save_guards (
          id text PRIMARY KEY NOT NULL,
          ok integer NOT NULL
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS payment_orders (
          id text PRIMARY KEY NOT NULL,
          idempotency_key text NOT NULL,
          request_fingerprint text NOT NULL,
          public_token_hash text NOT NULL,
          buyer_email text NOT NULL,
          provider_order_id text,
          provider_user_id text,
          provider_status text,
          provider_status_detail text,
          status text NOT NULL,
          status_detail text NOT NULL,
          currency text NOT NULL,
          total_cents integer NOT NULL,
          checkout_url text,
          failure_reason text,
          fulfillment_status text NOT NULL DEFAULT 'pending',
          created_at integer NOT NULL,
          updated_at integer NOT NULL,
          paid_at integer,
          last_verified_at integer
        )`),
        database.prepare(
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_orders_idempotency_key ON payment_orders (idempotency_key)",
        ),
        database.prepare(
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_orders_provider_order_id ON payment_orders (provider_order_id)",
        ),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS idx_payment_orders_status_created_at ON payment_orders (status, created_at)",
        ),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS idx_payment_orders_created_at ON payment_orders (created_at)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS payment_order_items (
          id text PRIMARY KEY NOT NULL,
          order_id text NOT NULL,
          product_id text NOT NULL,
          product_slug text NOT NULL,
          product_name text NOT NULL,
          sku text NOT NULL,
          unit_price_cents integer NOT NULL,
          quantity integer NOT NULL,
          total_cents integer NOT NULL,
          fulfillment_mode text NOT NULL,
          created_at integer NOT NULL,
          FOREIGN KEY (order_id) REFERENCES payment_orders(id) ON DELETE CASCADE
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS idx_payment_order_items_order_id ON payment_order_items (order_id)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS payment_inventory_reservations (
          id text PRIMARY KEY NOT NULL,
          order_id text NOT NULL,
          order_item_id text NOT NULL,
          product_id text NOT NULL,
          inventory_mode text NOT NULL,
          quantity integer NOT NULL,
          status text NOT NULL,
          created_at integer NOT NULL,
          updated_at integer NOT NULL,
          FOREIGN KEY (order_id) REFERENCES payment_orders(id) ON DELETE CASCADE,
          FOREIGN KEY (order_item_id) REFERENCES payment_order_items(id) ON DELETE CASCADE
        )`),
        database.prepare(
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_inventory_order_item ON payment_inventory_reservations (order_item_id)",
        ),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS idx_payment_inventory_product_status ON payment_inventory_reservations (product_id, status)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS payment_webhook_events (
          id text PRIMARY KEY NOT NULL,
          provider_order_id text NOT NULL,
          action text NOT NULL,
          payload_hash text NOT NULL,
          signature_variant text,
          status text NOT NULL,
          failure_reason text,
          created_at integer NOT NULL,
          processed_at integer
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS idx_payment_webhook_provider_order ON payment_webhook_events (provider_order_id)",
        ),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS idx_payment_webhook_created_at ON payment_webhook_events (created_at)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS site_settings (
          id integer PRIMARY KEY NOT NULL,
          brand_name text NOT NULL,
          announcement text NOT NULL,
          hero_eyebrow text NOT NULL,
          hero_title text NOT NULL,
          hero_subtitle text NOT NULL,
          primary_cta_label text NOT NULL,
          primary_cta_url text NOT NULL,
          logo_url text NOT NULL,
          hero_image_url text NOT NULL,
          accent_color text NOT NULL,
          grid_columns integer NOT NULL,
          promo_title text NOT NULL,
          promo_subtitle text NOT NULL,
          promo_video_url text NOT NULL,
          show_promo_video integer NOT NULL,
          footer_text text NOT NULL,
          updated_at integer NOT NULL
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS appearance_settings (
          id integer PRIMARY KEY NOT NULL,
          interface_scale integer NOT NULL,
          font_scale integer NOT NULL,
          bold_text integer NOT NULL,
          contrast integer NOT NULL,
          theme_enabled integer NOT NULL DEFAULT 0,
          theme_preset text NOT NULL DEFAULT 'juris',
          theme_custom_background text NOT NULL DEFAULT '#101820',
          theme_custom_surface text NOT NULL DEFAULT '#1A2A36',
          theme_custom_text text NOT NULL DEFAULT '#F2F7FA',
          theme_custom_accent text NOT NULL DEFAULT '#63B6D9',
          custom_font_url text NOT NULL,
          background_audio_url text NOT NULL,
          background_audio_enabled integer NOT NULL,
          background_audio_volume integer NOT NULL,
          updated_at integer NOT NULL
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS showcase_settings (
          id integer PRIMARY KEY NOT NULL,
          transparency integer NOT NULL,
          black_fade integer NOT NULL,
          updated_at integer NOT NULL
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS social_contact_settings (
          id integer PRIMARY KEY NOT NULL,
          enabled integer NOT NULL,
          position text NOT NULL,
          button_label text NOT NULL,
          updated_at integer NOT NULL
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS social_links (
          id text PRIMARY KEY NOT NULL,
          platform text NOT NULL,
          label text NOT NULL,
          url text NOT NULL,
          accent_color text NOT NULL,
          is_visible integer NOT NULL,
          sort_order integer NOT NULL
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS idx_social_links_visible_order ON social_links (is_visible, sort_order)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS welcome_elements (
          id text PRIMARY KEY NOT NULL,
          type text NOT NULL,
          eyebrow text NOT NULL,
          title text NOT NULL,
          body text NOT NULL,
          link_label text NOT NULL,
          link_url text NOT NULL,
          accent_color text NOT NULL,
          is_visible integer NOT NULL,
          sort_order integer NOT NULL
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS idx_welcome_visible_order ON welcome_elements (is_visible, sort_order)",
        ),
        ...(env.DEPLOYMENT_ENV === "staging"
          ? [
              database.prepare(`CREATE TABLE IF NOT EXISTS payment_test_orders (
                id text PRIMARY KEY NOT NULL,
                mp_order_id text,
                buyer_email text,
                product_name text NOT NULL,
                amount text NOT NULL,
                currency text NOT NULL,
                status text NOT NULL,
                status_detail text NOT NULL,
                checkout_url text,
                created_at integer NOT NULL,
                updated_at integer NOT NULL
              )`),
              database.prepare(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_test_orders_mp_order_id ON payment_test_orders (mp_order_id)",
              ),
              database.prepare(
                "CREATE INDEX IF NOT EXISTS idx_payment_test_orders_created_at ON payment_test_orders (created_at)",
              ),
            ]
          : []),
      ]);

  const updates = [
          ["products", "seller_badge", "integer NOT NULL DEFAULT 0"],
          ["products", "best_seller_badge", "integer NOT NULL DEFAULT 0"],
          ["products", "promotion_badge", "integer NOT NULL DEFAULT 0"],
          ["products", "promotion_percent", "integer NOT NULL DEFAULT 10"],
          ["products", "sku", "text NOT NULL DEFAULT ''"],
          ["products", "price_cents", "integer NOT NULL DEFAULT 0"],
          ["products", "currency", "text NOT NULL DEFAULT 'BRL'"],
          ["products", "is_sellable", "integer NOT NULL DEFAULT 0"],
          ["products", "inventory_mode", "text NOT NULL DEFAULT 'unlimited'"],
          ["products", "stock_quantity", "integer NOT NULL DEFAULT 0"],
          ["products", "inventory_revision", "integer NOT NULL DEFAULT 0"],
          ["products", "fulfillment_mode", "text NOT NULL DEFAULT 'manual'"],
          ["products", "archived", "integer NOT NULL DEFAULT 0"],
          ["appearance_settings", "theme_enabled", "integer NOT NULL DEFAULT 0"],
          ["appearance_settings", "theme_preset", "text NOT NULL DEFAULT 'juris'"],
          ["appearance_settings", "theme_custom_background", "text NOT NULL DEFAULT '#101820'"],
          ["appearance_settings", "theme_custom_surface", "text NOT NULL DEFAULT '#1A2A36'"],
          ["appearance_settings", "theme_custom_text", "text NOT NULL DEFAULT '#F2F7FA'"],
          ["appearance_settings", "theme_custom_accent", "text NOT NULL DEFAULT '#63B6D9'"],
  ] as const;

  const readColumns = async () => {
    const [productInfo, appearanceInfo] = await database.batch<{ name: string }>([
      database.prepare("PRAGMA table_info(products)"),
      database.prepare("PRAGMA table_info(appearance_settings)"),
    ]);
    return {
      products: new Set(productInfo.results.map((field) => field.name)),
      appearance_settings: new Set(appearanceInfo.results.map((field) => field.name)),
    };
  };

  const existingColumns = await readColumns();
  const missingUpdates = updates.filter(
    ([table, column]) => !existingColumns[table].has(column),
  );

  if (missingUpdates.length > 0) {
    try {
      await database.batch(missingUpdates.map(([table, column, definition]) =>
        database.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
      ));
    } catch (error) {
      // Another concurrent request or isolate may have completed the same
      // idempotent upgrade. Re-read both tables once before propagating.
      const refreshedColumns = await readColumns();
      const stillMissing = updates.some(
        ([table, column]) => !refreshedColumns[table].has(column),
      );
      if (stillMissing) throw error;
    }
  }

  schemaInitialized = true;
}
