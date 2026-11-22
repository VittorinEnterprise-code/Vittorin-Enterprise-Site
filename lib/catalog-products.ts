import type { Product } from "./site-content";

export function productSaveStatement(database: D1Database, product: Product, scope: "main" | "atelier" = "main") {
  return database
        .prepare(
          `INSERT INTO products (
            id, category_id, name, slug, sku, price_cents, currency,
            is_sellable, inventory_mode, stock_quantity, inventory_revision,
            fulfillment_mode, archived,
            eyebrow, subtitle, description, image_url, video_url, product_url,
            cta_label, status, accent_color, featured, seller_badge,
            best_seller_badge, promotion_badge, promotion_percent,
            is_visible, sort_order, catalog_scope
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          )
          ON CONFLICT(id) DO UPDATE SET
            category_id = excluded.category_id,
            name = excluded.name,
            slug = excluded.slug,
            sku = excluded.sku,
            price_cents = excluded.price_cents,
            currency = excluded.currency,
            is_sellable = excluded.is_sellable,
            inventory_mode = excluded.inventory_mode,
            stock_quantity = excluded.stock_quantity,
            inventory_revision = CASE
              WHEN products.inventory_mode <> excluded.inventory_mode
                OR products.stock_quantity <> excluded.stock_quantity
              THEN products.inventory_revision + 1
              ELSE products.inventory_revision
            END,
            fulfillment_mode = excluded.fulfillment_mode,
            archived = 0,
            eyebrow = excluded.eyebrow,
            subtitle = excluded.subtitle,
            description = excluded.description,
            image_url = excluded.image_url,
            video_url = excluded.video_url,
            product_url = excluded.product_url,
            cta_label = excluded.cta_label,
            status = excluded.status,
            accent_color = excluded.accent_color,
            featured = excluded.featured,
            seller_badge = excluded.seller_badge,
            best_seller_badge = excluded.best_seller_badge,
            promotion_badge = excluded.promotion_badge,
            promotion_percent = excluded.promotion_percent,
            is_visible = excluded.is_visible,
            sort_order = excluded.sort_order
          WHERE products.inventory_revision = excluded.inventory_revision AND products.catalog_scope = excluded.catalog_scope`,
        )
        .bind(
          product.id,
          scope === "atelier" ? null : product.categoryId,
          product.name,
          product.slug,
          product.sku,
          product.priceCents,
          product.currency,
          product.isSellable ? 1 : 0,
          product.inventoryMode,
          product.stockQuantity,
          product.inventoryRevision,
          product.fulfillmentMode,
          0,
          product.eyebrow,
          product.subtitle,
          product.description,
          product.imageUrl,
          product.videoUrl,
          product.productUrl,
          product.ctaLabel,
          product.status,
          product.accentColor,
          product.featured ? 1 : 0,
          product.sellerBadge ? 1 : 0,
          product.bestSellerBadge ? 1 : 0,
          product.promotionBadge ? 1 : 0,
          product.promotionPercent,
          product.isVisible ? 1 : 0,
          product.sortOrder,
          scope,
        );
}
