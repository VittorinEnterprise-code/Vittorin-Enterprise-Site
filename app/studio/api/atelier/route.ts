import { loadAtelierContent, saveAtelierContent } from "@/lib/atelier-store";
import { atelierJson, atelierMutationAllowed, requireAtelierOwner } from "@/lib/atelier-http";
import { siteContentSchema } from "@/lib/site-validation";
import { readBoundedJson } from "@/lib/mercado-pago";

export async function GET() {
  const denied = await requireAtelierOwner(); if (denied) return denied;
  try { return atelierJson({ content: await loadAtelierContent() }); }
  catch { return atelierJson({ error: "Não foi possível carregar o Atelier." }, 503); }
}
export async function PUT(request: Request) {
  const denied = await requireAtelierOwner(); if (denied) return denied;
  if (!atelierMutationAllowed(request)) return atelierJson({ error: "Origem inválida." }, 403);
  try {
    const parsed = siteContentSchema.safeParse(await readBoundedJson(request, 2 * 1024 * 1024));
    if (!parsed.success) return atelierJson({ error: "Revise os campos antes de salvar.", issues: parsed.error.issues }, 400);
    if (parsed.data.products.some((p) => p.fulfillmentMode === "external")) return atelierJson({ error: "No Atelier, escolha download ou entrega manual." }, 400);
    await saveAtelierContent(parsed.data);
    return atelierJson({ content: await loadAtelierContent(), saved: true });
  } catch (error) { return atelierJson({ error: error instanceof Error && error.message === "ATELIER_FILE_REQUIRED" ? "Envie o arquivo dos produtos com entrega digital antes de salvar." : "Não foi possível salvar. Recarregue para conferir estoque, endereços e arquivos antes de tentar novamente." }, 409); }
}
