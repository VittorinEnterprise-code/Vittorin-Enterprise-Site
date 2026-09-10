import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const siteSettings = sqliteTable("site_settings", {
  id: integer("id").primaryKey(),
  brandName: text("brand_name").notNull(),
  announcement: text("announcement").notNull(),
  heroEyebrow: text("hero_eyebrow").notNull(),
  heroTitle: text("hero_title").notNull(),
  heroSubtitle: text("hero_subtitle").notNull(),
  primaryCtaLabel: text("primary_cta_label").notNull(),
  primaryCtaUrl: text("primary_cta_url").notNull(),
  logoUrl: text("logo_url").notNull(),
  heroImageUrl: text("hero_image_url").notNull(),
  accentColor: text("accent_color").notNull(),
  gridColumns: integer("grid_columns").notNull(),
  promoTitle: text("promo_title").notNull(),
  promoSubtitle: text("promo_subtitle").notNull(),
  promoVideoUrl: text("promo_video_url").notNull(),
  showPromoVideo: integer("show_promo_video", { mode: "boolean" }).notNull(),
  footerText: text("footer_text").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const appearanceSettings = sqliteTable("appearance_settings", {
  id: integer("id").primaryKey(),
  interfaceScale: integer("interface_scale").notNull(),
  fontScale: integer("font_scale").notNull(),
  boldText: integer("bold_text", { mode: "boolean" }).notNull(),
  contrast: integer("contrast").notNull(),
  customFontUrl: text("custom_font_url").notNull(),
  backgroundAudioUrl: text("background_audio_url").notNull(),
  backgroundAudioEnabled: integer("background_audio_enabled", {
    mode: "boolean",
  }).notNull(),
  backgroundAudioVolume: integer("background_audio_volume").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const showcaseSettings = sqliteTable("showcase_settings", {
  id: integer("id").primaryKey(),
  transparency: integer("transparency").notNull(),
  blackFade: integer("black_fade", { mode: "boolean" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const welcomeElements = sqliteTable(
  "welcome_elements",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: ["text", "link", "highlight"] }).notNull(),
    eyebrow: text("eyebrow").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    linkLabel: text("link_label").notNull(),
    linkUrl: text("link_url").notNull(),
    accentColor: text("accent_color").notNull(),
    isVisible: integer("is_visible", { mode: "boolean" }).notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [index("idx_welcome_visible_order").on(table.isVisible, table.sortOrder)],
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull(),
    sortOrder: integer("sort_order").notNull(),
    isVisible: integer("is_visible", { mode: "boolean" }).notNull(),
  },
  (table) => [uniqueIndex("idx_categories_slug").on(table.slug)],
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    eyebrow: text("eyebrow").notNull(),
    subtitle: text("subtitle").notNull(),
    description: text("description").notNull(),
    imageUrl: text("image_url").notNull(),
    videoUrl: text("video_url").notNull(),
    productUrl: text("product_url").notNull(),
    ctaLabel: text("cta_label").notNull(),
    status: text("status", {
      enum: ["available", "coming_soon", "development"],
    }).notNull(),
    accentColor: text("accent_color").notNull(),
    featured: integer("featured", { mode: "boolean" }).notNull(),
    isVisible: integer("is_visible", { mode: "boolean" }).notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    uniqueIndex("idx_products_slug").on(table.slug),
    index("idx_products_category_order").on(table.categoryId, table.sortOrder),
    index("idx_products_visible_order").on(table.isVisible, table.sortOrder),
  ],
);
