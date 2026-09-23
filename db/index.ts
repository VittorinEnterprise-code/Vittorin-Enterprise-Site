import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let schemaInitialization: Promise<void> | null = null;

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

  if (!schemaInitialization) {
    const database = getD1Binding();
    schemaInitialization = database
      .batch([
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
      ])
      .then(async () => {
        const updates = [
          ["products", "seller_badge", "integer NOT NULL DEFAULT 0"],
          ["products", "best_seller_badge", "integer NOT NULL DEFAULT 0"],
          ["products", "promotion_badge", "integer NOT NULL DEFAULT 0"],
          ["products", "promotion_percent", "integer NOT NULL DEFAULT 10"],
          ["appearance_settings", "theme_enabled", "integer NOT NULL DEFAULT 0"],
          ["appearance_settings", "theme_preset", "text NOT NULL DEFAULT 'juris'"],
          ["appearance_settings", "theme_custom_background", "text NOT NULL DEFAULT '#101820'"],
          ["appearance_settings", "theme_custom_surface", "text NOT NULL DEFAULT '#1A2A36'"],
          ["appearance_settings", "theme_custom_text", "text NOT NULL DEFAULT '#F2F7FA'"],
          ["appearance_settings", "theme_custom_accent", "text NOT NULL DEFAULT '#63B6D9'"],
        ] as const;

        for (const [table, column, definition] of updates) {
          const existing = await database.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
          if (existing.results.some((field) => field.name === column)) continue;
          try {
            await database.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
          } catch (error) {
            const refreshed = await database.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
            if (!refreshed.results.some((field) => field.name === column)) throw error;
          }
        }
      })
      .catch((error) => {
        schemaInitialization = null;
        throw error;
      });
  }

  await schemaInitialization;
}
