import { notFound } from "next/navigation";
import { getD1Binding } from "@/db";
import { ensureAtelierSchema, loadAtelierContent, readAtelierGrant, visibleAtelierContent } from "@/lib/atelier-store";
import { CheckoutClient } from "@/components/checkout-client";
import { getPublicCheckoutProductBySlug, isProductionCommerceEnabled } from "@/lib/commerce";
export const dynamic = "force-dynamic";
export default async function SharedAtelierProduct({ params }: { params: Promise<{ token: string; slug: string }> }) {
  const { token, slug } = await params;
  await ensureAtelierSchema(); const grant = await readAtelierGrant(getD1Binding(), token); if (!grant) notFound();
  const preview = visibleAtelierContent(await loadAtelierContent(), grant).products.find((p) => p.slug === slug);
  if (!preview) notFound();
  const product = await getPublicCheckoutProductBySlug(slug, token);
  return <CheckoutClient product={product || preview} commerceEnabled={Boolean(product) && isProductionCommerceEnabled()} atelierKey={token} storefrontPath={`/atelier/${token}`} />;
}
