import { getD1Binding } from "@/db";
import { ensureAtelierSchema, readPaidAtelierFiles } from "@/lib/atelier-store";
import { atelierJson } from "@/lib/atelier-http";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureAtelierSchema(); const { id } = await params;
  const token = new URL(request.url).searchParams.get("token") || "";
  const files = await readPaidAtelierFiles(getD1Binding(), id, token);
  return atelierJson({ files: files.map((f) => ({ name: f.name, url: `/api/checkout/orders/${encodeURIComponent(id)}/downloads/${encodeURIComponent(f.itemId)}?token=${encodeURIComponent(token)}` })) });
}
