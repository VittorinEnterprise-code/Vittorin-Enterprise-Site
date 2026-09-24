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
  themeEnabled: integer("theme_enabled", { mode: "boolean" }).notNull().default(false),
  themePreset: text("theme_preset", { enum: ["juris", "graphite", "custom"] }).notNull().default("juris"),
  themeCustomBackground: text("theme_custom_background").notNull().default("#101820"),
  themeCustomSurface: text("theme_custom_surface").notNull().default("#1A2A36"),
  themeCustomText: text("theme_custom_text").notNull().default("#F2F7FA"),
  themeCustomAccent: text("theme_custom_accent").notNull().default("#63B6D9"),
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

export const socialContactSettings = sqliteTable("social_contact_settings", {
  id: integer("id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  position: text("position", {
    enum: ["bottom-right", "bottom-center", "bottom-left", "right-center", "left-center"],
  }).notNull(),
  buttonLabel: text("button_label").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const socialLinks = sqliteTable(
  "social_links",
  {
    id: text("id").primaryKey(),
    platform: text("platform", {
      enum: [
        "whatsapp",
        "instagram",
        "youtube",
        "facebook",
        "linkedin",
        "tiktok",
        "telegram",
        "email",
        "website",
        "custom",
      ],
    }).notNull(),
    label: text("label").notNull(),
    url: text("url").notNull(),
    accentColor: text("accent_color").notNull(),
    isVisible: integer("is_visible", { mode: "boolean" }).notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [index("idx_social_links_visible_order").on(table.isVisible, table.sortOrder)],
);

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
    sellerBadge: integer("seller_badge", { mode: "boolean" }).notNull().default(false),
    bestSellerBadge: integer("best_seller_badge", { mode: "boolean" }).notNull().default(false),
    promotionBadge: integer("promotion_badge", { mode: "boolean" }).notNull().default(false),
    promotionPercent: integer("promotion_percent").notNull().default(10),
    sku: text("sku").notNull().default(""),
    priceCents: integer("price_cents").notNull().default(0),
    currency: text("currency", { enum: ["BRL"] }).notNull().default("BRL"),
    isSellable: integer("is_sellable", { mode: "boolean" }).notNull().default(false),
    inventoryMode: text("inventory_mode", {
      enum: ["unlimited", "finite"],
    }).notNull().default("unlimited"),
    stockQuantity: integer("stock_quantity").notNull().default(0),
    inventoryRevision: integer("inventory_revision").notNull().default(0),
    fulfillmentMode: text("fulfillment_mode", {
      enum: ["manual", "digital", "external"],
    }).notNull().default("manual"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    isVisible: integer("is_visible", { mode: "boolean" }).notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    uniqueIndex("idx_products_slug").on(table.slug),
    index("idx_products_category_order").on(table.categoryId, table.sortOrder),
    index("idx_products_visible_order").on(table.isVisible, table.sortOrder),
  ],
);

// Used only inside atomic content-save batches. A NOT NULL failure aborts an
// entire stale Studio save before it can overwrite inventory changed by checkout.
export const contentSaveGuards = sqliteTable("content_save_guards", {
  id: text("id").primaryKey(),
  ok: integer("ok").notNull(),
});

// Production commerce is intentionally isolated from the private sandbox harness.
// Every order and item keeps an immutable snapshot so later catalog edits cannot
// change the amount, currency, inventory, or fulfillment decision already sold.
export const paymentOrders = sqliteTable(
  "payment_orders",
  {
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    publicTokenHash: text("public_token_hash").notNull(),
    buyerEmail: text("buyer_email").notNull(),
    providerOrderId: text("provider_order_id"),
    providerUserId: text("provider_user_id"),
    providerStatus: text("provider_status"),
    providerStatusDetail: text("provider_status_detail"),
    status: text("status", {
      enum: ["creating", "pending", "paid", "failed", "review", "cancelled", "refunded"],
    }).notNull(),
    statusDetail: text("status_detail").notNull(),
    currency: text("currency", { enum: ["BRL"] }).notNull(),
    totalCents: integer("total_cents").notNull(),
    checkoutUrl: text("checkout_url"),
    failureReason: text("failure_reason"),
    fulfillmentStatus: text("fulfillment_status", {
      enum: ["pending", "ready", "completed", "cancelled"],
    }).notNull().default("pending"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
    lastVerifiedAt: integer("last_verified_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("idx_payment_orders_idempotency_key").on(table.idempotencyKey),
    uniqueIndex("idx_payment_orders_provider_order_id").on(table.providerOrderId),
    index("idx_payment_orders_status_created_at").on(table.status, table.createdAt),
    index("idx_payment_orders_created_at").on(table.createdAt),
  ],
);

export const paymentOrderItems = sqliteTable(
  "payment_order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull().references(() => paymentOrders.id, {
      onDelete: "cascade",
    }),
    productId: text("product_id").notNull(),
    productSlug: text("product_slug").notNull(),
    productName: text("product_name").notNull(),
    sku: text("sku").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    totalCents: integer("total_cents").notNull(),
    fulfillmentMode: text("fulfillment_mode", {
      enum: ["manual", "digital", "external"],
    }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("idx_payment_order_items_order_id").on(table.orderId)],
);

export const paymentInventoryReservations = sqliteTable(
  "payment_inventory_reservations",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull().references(() => paymentOrders.id, {
      onDelete: "cascade",
    }),
    orderItemId: text("order_item_id").notNull().references(() => paymentOrderItems.id, {
      onDelete: "cascade",
    }),
    productId: text("product_id").notNull(),
    inventoryMode: text("inventory_mode", {
      enum: ["unlimited", "finite"],
    }).notNull(),
    quantity: integer("quantity").notNull(),
    status: text("status", {
      enum: ["reserved", "committed", "released"],
    }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_payment_inventory_order_item").on(table.orderItemId),
    index("idx_payment_inventory_product_status").on(table.productId, table.status),
  ],
);

export const paymentWebhookEvents = sqliteTable(
  "payment_webhook_events",
  {
    id: text("id").primaryKey(),
    providerOrderId: text("provider_order_id").notNull(),
    action: text("action").notNull(),
    payloadHash: text("payload_hash").notNull(),
    signatureVariant: text("signature_variant", { enum: ["raw", "lowercase"] }),
    status: text("status", { enum: ["received", "processed", "rejected"] }).notNull(),
    failureReason: text("failure_reason"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    processedAt: integer("processed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("idx_payment_webhook_provider_order").on(table.providerOrderId),
    index("idx_payment_webhook_created_at").on(table.createdAt),
  ],
);

// Checkout Pro sandbox orders are deliberately separate from the editable storefront.
// The immutable item/amount snapshot remains available even when Studio content changes.
export const paymentTestOrders = sqliteTable(
  "payment_test_orders",
  {
    id: text("id").primaryKey(),
    mpOrderId: text("mp_order_id"),
    buyerEmail: text("buyer_email"),
    productName: text("product_name").notNull(),
    amount: text("amount").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull(),
    statusDetail: text("status_detail").notNull(),
    checkoutUrl: text("checkout_url"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_payment_test_orders_mp_order_id").on(table.mpOrderId),
    index("idx_payment_test_orders_created_at").on(table.createdAt),
  ],
);
