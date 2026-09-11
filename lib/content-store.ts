import { asc } from "drizzle-orm";
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
    db.select().from(products).orderBy(asc(products.sortOrder), asc(products.name)),
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
    database
      .prepare(
        `INSERT INTO appearance_settings (
          id, interface_scale, font_scale, bold_text, contrast, custom_font_url,
          background_audio_url, background_audio_enabled, background_audio_volume, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          interface_scale = excluded.interface_scale,
          font_scale = excluded.font_scale,
          bold_text = excluded.bold_text,
          contrast = excluded.contrast,
          custom_font_url = excluded.custom_font_url,
          background_audio_url = excluded.background_audio_url,
          background_audio_enabled = excluded.background_audio_enabled,
          background_audio_volume = excluded.background_audio_volume,
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
