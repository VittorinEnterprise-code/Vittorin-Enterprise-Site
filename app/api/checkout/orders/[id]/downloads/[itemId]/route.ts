import { env } from "cloudflare:workers";
import { getD1Binding } from "@/db";
import { ensureAtelierSchema, readPaidAtelierFiles } from "@/lib/atelier-store";
export async function GET(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  await ensureAtelierSchema(); const { id, itemId } = await params;
  const token = new URL(request.url).searchParams.get("token") || "";
  const files = await readPaidAtelierFiles(getD1Binding(), id, token), file = files.find((f) => f.itemId === itemId);
  const headers = new Headers({ "cache-control": "no-store, private", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow" });
  if (!file || !env.BUCKET) return new Response("Arquivo indisponível para este pedido.", { status: 404, headers });
  const object = await env.BUCKET.get(file.key); if (!object) return new Response("Arquivo temporariamente indisponível. Entre em contato com o vendedor.", { status: 404, headers });
  headers.set("content-type", "application/octet-stream");
  headers.set("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g, "%27")}`);
  headers.set("content-length", String(object.size));
  return new Response(object.body, { headers });
}
