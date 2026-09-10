import { asc } from "drizzle-orm";
import { ensureDatabaseSchema, getD1Binding, getDb } from "@/db";
import { categories, products, siteSettings } from "@/db/schema";
import { DEFAULT_CONTENT, type SiteContent } from "@/lib/site-content";

export async function loadSiteContent(): Promise<SiteContent> {
  await ensureDatabaseSchema();
  const db = getDb();
  const [settingsRows, categoryRows, productRows] = await Promise.all([
    db.select().from(siteSettings).limit(1),
    db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)),
    db.select().from(products).orderBy(asc(products.sortOrder), asc(products.name)),
  ]);

  const settings = settingsRows[0];
  if (!settings) return structuredClone(DEFAULT_CONTENT);

  return {
    settings: {
      brandName: settings.brandName,
      announcement: settings.announcement,
      heroEyebrow: settings.heroEyebrow,
      heroTitle: settings.heroTitle,
      heroSubtitle: settings.heroSubtitle,
      primaryCtaLabel: settings.primaryCtaLabel,
      primaryCtaUrl: settings.primaryCtaUrl,
      logoUrl: settings.logoUrl,
      heroImageUrl: settings.heroImageUrl,
      accentColor: settings.accentColor,
      gridColumns: settings.gridColumns,
      promoTitle: settings.promoTitle,
      promoSubtitle: settings.promoSubtitle,
      promoVideoUrl: settings.promoVideoUrl,
      showPromoVideo: settings.showPromoVideo,
      footerText: settings.footerText,
    },
    categories: categoryRows,
    products: productRows,
  };
}

export async function saveSiteContent(content: SiteContent) {
  await ensureDatabaseSchema();
  const database = getD1Binding();
  const settings = content.settings;
  const statements = [
    database
      .prepare(
        `INSERT INTO site_settings (
          id, brand_name, announcement, hero_eyebrow, hero_title, hero_subtitle,
          primary_cta_label, primary_cta_url, logo_url, hero_image_url,
          accent_color, grid_columns, promo_title, promo_subtitle,
          promo_video_url, show_promo_video, footer_text, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          brand_name = excluded.brand_name,
          announcement = excluded.announcement,
          hero_eyebrow = excluded.hero_eyebrow,
          hero_title = excluded.hero_title,
          hero_subtitle = excluded.hero_subtitle,
          primary_cta_label = excluded.primary_cta_label,
          primary_cta_url = excluded.primary_cta_url,
          logo_url = excluded.logo_url,
          hero_image_url = excluded.hero_image_url,
          accent_color = excluded.accent_color,
          grid_columns = excluded.grid_columns,
          promo_title = excluded.promo_title,
          promo_subtitle = excluded.promo_subtitle,
          promo_video_url = excluded.promo_video_url,
          show_promo_video = excluded.show_promo_video,
          footer_text = excluded.footer_text,
          updated_at = excluded.updated_at`,
      )
      .bind(
        1,
        settings.brandName,
        settings.announcement,
        settings.heroEyebrow,
        settings.heroTitle,
        settings.heroSubtitle,
        settings.primaryCtaLabel,
        settings.primaryCtaUrl,
        settings.logoUrl,
        settings.heroImageUrl,
        settings.accentColor,
        settings.gridColumns,
        settings.promoTitle,
        settings.promoSubtitle,
        settings.promoVideoUrl,
        settings.showPromoVideo ? 1 : 0,
        settings.footerText,
        Date.now(),
      ),
    database.prepare("DELETE FROM products"),
    database.prepare("DELETE FROM categories"),
    ...content.categories.map((category) =>
      database
        .prepare(
          `INSERT INTO categories
            (id, name, slug, description, sort_order, is_visible)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          category.id,
          category.name,
          category.slug,
          category.description,
          category.sortOrder,
          category.isVisible ? 1 : 0,
        ),
    ),
    ...content.products.map((product) =>
      database
        .prepare(
          `INSERT INTO products (
            id, category_id, name, slug, eyebrow, subtitle, description,
            image_url, video_url, product_url, cta_label, status,
            accent_color, featured, is_visible, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          product.id,
          product.categoryId,
          product.name,
          product.slug,
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
          product.isVisible ? 1 : 0,
          product.sortOrder,
        ),
    ),
  ];

  await database.batch(statements);
}
