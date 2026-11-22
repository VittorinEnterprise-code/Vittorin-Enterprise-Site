import { JURIS_NEW_OFFERS } from "./product-offers";
let initialized = false;

/** Creates hidden, unpriced drafts alongside an existing Learn offer. Existing rows are untouched. */
export async function ensureJurisOfferDrafts(db: D1Database) {
  if (initialized) return;
  await db.batch(JURIS_NEW_OFFERS.map((offer, index) => db.prepare(`
    INSERT OR IGNORE INTO products (
      id, category_id, name, slug, sku, price_cents, currency, is_sellable, inventory_mode,
      stock_quantity, inventory_revision, fulfillment_mode, access_products, archived,
      eyebrow, subtitle, description, image_url, video_url, product_url, cta_label,
      status, accent_color, featured, seller_badge, best_seller_badge, promotion_badge,
      promotion_percent, is_visible, sort_order
    ) SELECT ?, p.category_id, ?, ?, ?, 0, 'BRL', 0, 'unlimited', 0, 0, 'external', ?, 0,
      'JURIS IMMERSIVE', ?, ?, p.image_url, '', '', 'Conhecer produto',
      'coming_soon', p.accent_color, 0, 0, 0, 0, 10, 0, MIN(9999, p.sort_order + ?)
    FROM products p WHERE p.slug = 'juris-immersive-learn' AND p.archived = 0
      AND NOT EXISTS (SELECT 1 FROM products WHERE slug = ?)
  `).bind(offer.slug, offer.name, offer.slug, offer.sku, JSON.stringify(offer.accessProducts),
    offer.subtitle, offer.description, index + 1, offer.slug)));
  initialized = true;
}
