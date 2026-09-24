import { asc, eq } from "drizzle-orm";
import { ensureDatabaseSchema, getD1Binding, getDb } from "@/db";
import {
  appearanceSettings,
  categories,
  products,
  showcaseSettings,
  socialContactSettings,
  socialLinks,
  siteSettings,
  welcomeElements,
} from "@/db/schema";
import { DEFAULT_CONTENT, type SiteContent } from "@/lib/site-content";

export class ContentSaveConflictError extends Error {
  constructor() {
    super("O estoque mudou enquanto o Estúdio estava aberto. Recarregue a página antes de salvar novamente.");
    this.name = "ContentSaveConflictError";
  }
}

export async function loadSiteContent(): Promise<SiteContent> {
  await ensureDatabaseSchema();
  const db = getDb();
  const [
    settingsRows,
    appearanceRows,
    showcaseRows,
    socialSettingsRows,
    socialLinkRows,
    welcomeRows,
    categoryRows,
    productRows,
  ] = await Promise.all([
    db.select().from(siteSettings).limit(1),
    db.select().from(appearanceSettings).limit(1),
    db.select().from(showcaseSettings).limit(1),
    db.select().from(socialContactSettings).limit(1),
    db.select().from(socialLinks).orderBy(asc(socialLinks.sortOrder), asc(socialLinks.label)),
    db.select().from(welcomeElements).orderBy(asc(welcomeElements.sortOrder)),
    db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)),
    db.select().from(products)
      .where(eq(products.archived, false))
      .orderBy(asc(products.sortOrder), asc(products.name)),
  ]);

  const settings = settingsRows[0];
  if (!settings) return structuredClone(DEFAULT_CONTENT);
  const appearance = appearanceRows[0];
  const showcase = showcaseRows[0];
  const social = socialSettingsRows[0];

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
    appearance: appearance
      ? {
          themeEnabled: appearance.themeEnabled,
          themePreset: appearance.themePreset,
          themeCustomBackground: appearance.themeCustomBackground,
          themeCustomSurface: appearance.themeCustomSurface,
          themeCustomText: appearance.themeCustomText,
          themeCustomAccent: appearance.themeCustomAccent,
          interfaceScale: appearance.interfaceScale,
          fontScale: appearance.fontScale,
          boldText: appearance.boldText,
          contrast: appearance.contrast,
          showcaseTransparency: showcase?.transparency ?? DEFAULT_CONTENT.appearance.showcaseTransparency,
          showcaseBlackFade: showcase?.blackFade ?? DEFAULT_CONTENT.appearance.showcaseBlackFade,
          customFontUrl: appearance.customFontUrl,
          backgroundAudioUrl: appearance.backgroundAudioUrl,
          backgroundAudioEnabled: appearance.backgroundAudioEnabled,
          backgroundAudioVolume: appearance.backgroundAudioVolume,
        }
      : structuredClone(DEFAULT_CONTENT.appearance),
    socialSettings: social
      ? {
          enabled: social.enabled,
          position: social.position,
          buttonLabel: social.buttonLabel,
        }
      : structuredClone(DEFAULT_CONTENT.socialSettings),
    socialLinks: social
      ? socialLinkRows
      : structuredClone(DEFAULT_CONTENT.socialLinks),
    welcomeElements: welcomeRows,
    categories: categoryRows,
    products: productRows,
  };
}

export async function saveSiteContent(content: SiteContent) {
  await ensureDatabaseSchema();
  const database = getD1Binding();
  const settings = content.settings;
  const appearance = content.appearance;
  const social = content.socialSettings;
  const inventoryGuardId = crypto.randomUUID();
  const inventoryGuard = content.products.length
    ? database.prepare(`WITH expected(id, revision) AS (
        SELECT
          json_extract(value, '$.id'),
          CAST(json_extract(value, '$.revision') AS INTEGER)
        FROM json_each(?)
      )
      INSERT INTO content_save_guards (id, ok)
      SELECT ?, CASE WHEN NOT EXISTS (
        SELECT 1
        FROM expected
        LEFT JOIN products ON products.id = expected.id
        WHERE
          (products.id IS NULL AND expected.revision <> 0)
          OR (
            products.id IS NOT NULL
            AND products.inventory_revision <> expected.revision
          )
      ) THEN 1 ELSE NULL END`)
      .bind(
        JSON.stringify(content.products.map((product) => ({
          id: product.id,
          revision: product.inventoryRevision,
        }))),
        inventoryGuardId,
      )
    : null;
  const statements = [
    ...(inventoryGuard ? [inventoryGuard] : []),
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
    database
      .prepare(
        `INSERT INTO appearance_settings (
          id, interface_scale, font_scale, bold_text, contrast, custom_font_url,
          background_audio_url, background_audio_enabled, background_audio_volume,
          theme_enabled, theme_preset, theme_custom_background, theme_custom_surface,
          theme_custom_text, theme_custom_accent, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          interface_scale = excluded.interface_scale,
          font_scale = excluded.font_scale,
          bold_text = excluded.bold_text,
          contrast = excluded.contrast,
          custom_font_url = excluded.custom_font_url,
          background_audio_url = excluded.background_audio_url,
          background_audio_enabled = excluded.background_audio_enabled,
          background_audio_volume = excluded.background_audio_volume,
          theme_enabled = excluded.theme_enabled,
          theme_preset = excluded.theme_preset,
          theme_custom_background = excluded.theme_custom_background,
          theme_custom_surface = excluded.theme_custom_surface,
          theme_custom_text = excluded.theme_custom_text,
          theme_custom_accent = excluded.theme_custom_accent,
          updated_at = excluded.updated_at`,
      )
      .bind(
        1,
        appearance.interfaceScale,
        appearance.fontScale,
        appearance.boldText ? 1 : 0,
        appearance.contrast,
        appearance.customFontUrl,
        appearance.backgroundAudioUrl,
        appearance.backgroundAudioEnabled ? 1 : 0,
        appearance.backgroundAudioVolume,
        appearance.themeEnabled ? 1 : 0,
        appearance.themePreset,
        appearance.themeCustomBackground,
        appearance.themeCustomSurface,
        appearance.themeCustomText,
        appearance.themeCustomAccent,
        Date.now(),
      ),
    database
      .prepare(
        `INSERT INTO showcase_settings (
          id, transparency, black_fade, updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          transparency = excluded.transparency,
          black_fade = excluded.black_fade,
          updated_at = excluded.updated_at`,
      )
      .bind(
        1,
        appearance.showcaseTransparency,
        appearance.showcaseBlackFade ? 1 : 0,
        Date.now(),
      ),
    database
      .prepare(
        `INSERT INTO social_contact_settings (
          id, enabled, position, button_label, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          enabled = excluded.enabled,
          position = excluded.position,
          button_label = excluded.button_label,
          updated_at = excluded.updated_at`,
      )
      .bind(
        1,
        social.enabled ? 1 : 0,
        social.position,
        social.buttonLabel,
        Date.now(),
      ),
    database.prepare("DELETE FROM social_links"),
    database.prepare("DELETE FROM welcome_elements"),
    // Products are archived rather than deleted so pending inventory
    // reservations can still be released safely after a catalog edit.
    database.prepare(`UPDATE products
      SET archived = 1,
          is_visible = 0,
          is_sellable = 0,
          slug = '__archived__' || id || '__' || slug
      WHERE archived = 0`),
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
    ...content.welcomeElements.map((element) =>
      database
        .prepare(
          `INSERT INTO welcome_elements (
            id, type, eyebrow, title, body, link_label, link_url,
            accent_color, is_visible, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          element.id,
          element.type,
          element.eyebrow,
          element.title,
          element.body,
          element.linkLabel,
          element.linkUrl,
          element.accentColor,
          element.isVisible ? 1 : 0,
          element.sortOrder,
        ),
    ),
    ...content.socialLinks.map((link) =>
      database
        .prepare(
          `INSERT INTO social_links (
            id, platform, label, url, accent_color, is_visible, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          link.id,
          link.platform,
          link.label,
          link.url,
          link.accentColor,
          link.isVisible ? 1 : 0,
          link.sortOrder,
        ),
    ),
    ...content.products.map((product) =>
      database
        .prepare(
          `INSERT INTO products (
            id, category_id, name, slug, sku, price_cents, currency,
            is_sellable, inventory_mode, stock_quantity, inventory_revision,
            fulfillment_mode, archived,
            eyebrow, subtitle, description, image_url, video_url, product_url,
            cta_label, status, accent_color, featured, seller_badge,
            best_seller_badge, promotion_badge, promotion_percent,
            is_visible, sort_order
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
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
          WHERE products.inventory_revision = excluded.inventory_revision`,
        )
        .bind(
          product.id,
          product.categoryId,
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
        ),
    ),
    ...(inventoryGuard
      ? [database.prepare("DELETE FROM content_save_guards WHERE id = ?").bind(inventoryGuardId)]
      : []),
  ];

  try {
    await database.batch(statements);
  } catch (error) {
    const currentProducts = await getDb().select({
      id: products.id,
      inventoryRevision: products.inventoryRevision,
    }).from(products);
    const revisions = new Map(currentProducts.map((product) => [
      product.id,
      product.inventoryRevision,
    ]));
    const staleInventory = content.products.some((product) => {
      const currentRevision = revisions.get(product.id);
      return currentRevision !== undefined && currentRevision !== product.inventoryRevision;
    });
    if (staleInventory) throw new ContentSaveConflictError();
    throw error;
  }
}
