import type { Product } from "./site-content";
export type AccessProduct = "learn" | "processus";

export function parseAccessProducts(value: unknown): AccessProduct[] {
  try {
    const items: unknown = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(items) || !items.length || items.some((item) => item !== "learn" && item !== "processus")) return [];
    return (["learn", "processus"] as const).filter((item) => items.includes(item));
  } catch { return []; }
}

export const JURIS_NEW_OFFERS = [
  { slug: "juris-immersive-processus", sku: "JIP-ADDON", name: "Juris Immersive Processus", accessProducts: ["processus"] as AccessProduct[],
    subtitle: "Addon avulso · modelos e construção guiada", description: "Biblioteca de modelos jurídicos e construção guiada de peças. Inclui somente o Processus; o Learn possui uma licença independente." },
  { slug: "juris-immersive-learn-processus", sku: "JIL-PROCESSUS", name: "Juris Immersive Learn + Processus", accessProducts: ["learn", "processus"] as AccessProduct[],
    subtitle: "Pacote · aprendizagem e construção de peças", description: "Juris Immersive Learn e Addon Processus na mesma conta, com uma condição de pacote. Os acessos aos dois produtos são liberados após a confirmação da compra." },
];

/** Never changes an existing offer or invents a price. */
export function prepareJurisOfferDrafts(products: Product[]): Product[] {
  const learn = products.find((product) => product.slug === "juris-immersive-learn");
  if (!learn) return products;
  const missing = JURIS_NEW_OFFERS.filter((offer) => !products.some((product) => product.slug === offer.slug));
  return [...products, ...missing.map((offer, index): Product => ({
    ...learn, ...offer, id: offer.slug, priceCents: 0, currency: "BRL", fulfillmentMode: "external",
    isSellable: false, isVisible: false, status: "coming_soon", featured: false,
    sellerBadge: false, bestSellerBadge: false, promotionBadge: false, productUrl: "",
    ctaLabel: "Conhecer produto", inventoryMode: "unlimited", stockQuantity: 0, inventoryRevision: 0,
    sortOrder: Math.min(9999, Math.max(0, ...products.map((product) => product.sortOrder)) + index + 1),
  }))];
}

export function bundlePriceError(products: Pick<Product, "slug" | "isSellable" | "priceCents">[]) {
  const learn = products.find((p) => p.slug === "juris-immersive-learn");
  const addon = products.find((p) => p.slug === "juris-immersive-processus");
  const bundle = products.find((p) => p.slug === "juris-immersive-learn-processus");
  if (!bundle?.isSellable || !learn?.priceCents || !addon?.priceCents || !bundle.priceCents) return null;
  if (bundle.priceCents <= learn.priceCents || bundle.priceCents >= learn.priceCents + addon.priceCents) {
    return "O pacote deve custar mais que o Learn e menos que a soma do Learn com o Processus avulso.";
  }
  return null;
}
