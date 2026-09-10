import { z } from "zod";

const id = z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/);
const slug = z.string().min(1).max(90).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const shortText = z.string().max(180);
const longText = z.string().max(1200);
const mediaReference = z.string().max(1200);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

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
