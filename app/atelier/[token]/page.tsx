import { notFound } from "next/navigation";
import { getD1Binding } from "@/db";
import { ensureAtelierSchema, loadAtelierContent, readAtelierGrant, visibleAtelierContent } from "@/lib/atelier-store";
import { Storefront } from "@/components/storefront";
import { isProductionCommerceEnabled } from "@/lib/commerce-config";
export const dynamic = "force-dynamic";
export default async function SharedAtelier({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await ensureAtelierSchema();
  const grant = await readAtelierGrant(getD1Binding(), token); if (!grant) notFound();
  return <Storefront content={visibleAtelierContent(await loadAtelierContent(), grant)} commerceEnabled={isProductionCommerceEnabled()} atelierPath={`/atelier/${token}`} />;
}
