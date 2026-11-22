import { notFound } from "next/navigation";
import { getAuthorizedAdmin } from "@/lib/admin";
import { loadAtelierContent } from "@/lib/atelier-store";
import { Storefront } from "@/components/storefront";
export const dynamic = "force-dynamic";
export const metadata = { title: "Atelier · Prévia", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function AtelierPreview() {
  if ((await getAuthorizedAdmin()).reason) notFound();
  return <><aside className="atelier-preview-bar"><span>Prévia do proprietário · alterações salvas</span><a href="/studio/atelier">Voltar ao Estúdio</a></aside><Storefront content={await loadAtelierContent()} atelierPath="/studio/atelier/vitrine" /></>;
}
