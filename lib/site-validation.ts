import { z } from "zod";

const id = z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/);
const slug = z.string().min(1).max(90).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const shortText = z.string().max(180);
const longText = z.string().max(1200);
const mediaReference = z.string().max(1200);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

function isSafeContactReference(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("#") || trimmed.startsWith("/")) return true;
  try {
    const parsed = new URL(trimmed);
    return ["https:", "http:", "mailto:", "tel:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export const siteContentSchema = z
  .object({
    settings: z.object({
      brandName: z.string().min(1).max(80),
      announcement: shortText,
      heroEyebrow: shortText,
      heroTitle: z.string().min(1).max(180),
      heroSubtitle: longText,
      primaryCtaLabel: z.string().min(1).max(60),
      primaryCtaUrl: mediaReference,
      logoUrl: mediaReference,
      heroImageUrl: mediaReference,
      accentColor: color,
      gridColumns: z.number().int().min(1).max(4),
      promoTitle: z.string().max(180),
      promoSubtitle: longText,
      promoVideoUrl: mediaReference,
      showPromoVideo: z.boolean(),
      footerText: shortText,
    }),
    appearance: z.object({
      interfaceScale: z.number().int().min(60).max(160),
      fontScale: z.number().int().min(85).max(140),
      boldText: z.boolean(),
      contrast: z.number().int().min(85).max(140),
      showcaseTransparency: z.number().int().min(0).max(100),
      showcaseBlackFade: z.boolean(),
      customFontUrl: mediaReference,
      backgroundAudioUrl: mediaReference,
      backgroundAudioEnabled: z.boolean(),
      backgroundAudioVolume: z.number().int().min(0).max(100),
    }),
    socialSettings: z.object({
      enabled: z.boolean(),
      position: z.enum([
        "bottom-right",
        "bottom-center",
        "bottom-left",
        "right-center",
        "left-center",
      ]),
      buttonLabel: z.string().min(1).max(40),
    }),
    socialLinks: z
      .array(
        z.object({
          id,
          platform: z.enum([
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
          ]),
          label: z.string().min(1).max(60),
          url: mediaReference,
          accentColor: color,
          isVisible: z.boolean(),
          sortOrder: z.number().int().min(0).max(9999),
        }),
      )
      .max(20),
    welcomeElements: z
      .array(
        z.object({
          id,
          type: z.enum(["text", "link", "highlight"]),
          eyebrow: shortText,
          title: z.string().min(1).max(180),
          body: longText,
          linkLabel: z.string().max(60),
          linkUrl: mediaReference,
          accentColor: color,
          isVisible: z.boolean(),
          sortOrder: z.number().int().min(0).max(9999),
        }),
      )
      .max(20),
    categories: z
      .array(
        z.object({
          id,
          name: z.string().min(1).max(80),
          slug,
          description: longText,
          sortOrder: z.number().int().min(0).max(9999),
          isVisible: z.boolean(),
        }),
      )
      .max(30),
    products: z
      .array(
        z.object({
          id,
          categoryId: id.nullable(),
          name: z.string().min(1).max(120),
          slug,
          eyebrow: shortText,
          subtitle: shortText,
          description: longText,
          imageUrl: mediaReference,
          videoUrl: mediaReference,
          productUrl: mediaReference,
          ctaLabel: z.string().min(1).max(60),
          status: z.enum(["available", "coming_soon", "development"]),
          accentColor: color,
          featured: z.boolean(),
          isVisible: z.boolean(),
          sortOrder: z.number().int().min(0).max(9999),
        }),
      )
      .max(100),
  })
  .superRefine((content, context) => {
    const categoryIds = new Set(content.categories.map((category) => category.id));
    const categorySlugs = new Set<string>();
    const productIds = new Set<string>();
    const productSlugs = new Set<string>();
    const welcomeIds = new Set<string>();
    const socialIds = new Set<string>();

    content.socialLinks.forEach((link, index) => {
      if (socialIds.has(link.id)) {
        context.addIssue({
          code: "custom",
          path: ["socialLinks", index, "id"],
          message: "Identificador de rede social duplicado.",
        });
      }
      if (link.url.trim() && !isSafeContactReference(link.url)) {
        context.addIssue({
          code: "custom",
          path: ["socialLinks", index, "url"],
          message: "Use um link HTTPS, HTTP, mailto:, tel:, /página ou #seção.",
        });
      }
      if (link.isVisible && !link.url.trim()) {
        context.addIssue({
          code: "custom",
          path: ["socialLinks", index, "url"],
          message: "Informe o link antes de tornar este contato visível.",
        });
      }
      socialIds.add(link.id);
    });

    content.welcomeElements.forEach((element, index) => {
      if (welcomeIds.has(element.id)) {
        context.addIssue({
          code: "custom",
          path: ["welcomeElements", index, "id"],
          message: "Identificador de elemento de recepção duplicado.",
        });
      }
      if (element.type === "link" && (!element.linkLabel.trim() || !element.linkUrl.trim())) {
        context.addIssue({
          code: "custom",
          path: ["welcomeElements", index, "linkUrl"],
          message: "Elementos do tipo link precisam de texto e endereço.",
        });
      }
      welcomeIds.add(element.id);
    });

    content.categories.forEach((category, index) => {
      if (categorySlugs.has(category.slug)) {
        context.addIssue({
          code: "custom",
          path: ["categories", index, "slug"],
          message: "Use um endereço diferente para cada categoria.",
        });
      }
      categorySlugs.add(category.slug);
    });

    content.products.forEach((product, index) => {
      if (productIds.has(product.id)) {
        context.addIssue({
          code: "custom",
          path: ["products", index, "id"],
          message: "Identificador de produto duplicado.",
        });
      }
      if (productSlugs.has(product.slug)) {
        context.addIssue({
          code: "custom",
          path: ["products", index, "slug"],
          message: "Use um endereço diferente para cada produto.",
        });
      }
      if (product.categoryId && !categoryIds.has(product.categoryId)) {
        context.addIssue({
          code: "custom",
          path: ["products", index, "categoryId"],
          message: "A categoria selecionada não existe.",
        });
      }
      productIds.add(product.id);
      productSlugs.add(product.slug);
    });
  });
