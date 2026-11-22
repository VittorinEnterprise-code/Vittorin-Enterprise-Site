import { notFound } from "next/navigation";
import { getAuthorizedAdmin } from "@/lib/admin";
import { loadAtelierContent } from "@/lib/atelier-store";
import { CheckoutClient } from "@/components/checkout-client";
export const dynamic = "force-dynamic";
export const metadata = { title: "Atelier · Prévia do produto", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function AtelierProductPreview({ params }: { params: Promise<{ slug: string }> }) {
  if ((await getAuthorizedAdmin()).reason) notFound();
  const { slug } = await params;
  const selected = (await loadAtelierContent()).products.find((p) => p.slug === slug);
  if (!selected) notFound();
  return <><aside className="atelier-preview-bar">Prévia do proprietário · use um link compartilhado para abrir a venda.</aside><CheckoutClient product={selected} commerceEnabled={false} storefrontPath="/studio/atelier/vitrine" /></>;
}
