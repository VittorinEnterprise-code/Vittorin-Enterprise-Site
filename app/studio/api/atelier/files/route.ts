import { env } from "cloudflare:workers";
import { atelierJson, atelierMutationAllowed, requireAtelierOwner } from "@/lib/atelier-http";
export async function POST(request: Request) {
  const denied = await requireAtelierOwner(); if (denied) return denied;
  if (!atelierMutationAllowed(request)) return atelierJson({ error: "Origem inválida." }, 403);
  if (!env.BUCKET) return atelierJson({ error: "Armazenamento indisponível." }, 503);
  if (Number(request.headers.get("content-length") || 0) > 51 * 1024 * 1024) return atelierJson({ error: "O limite é 50 MB por arquivo." }, 413);
  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || !file.size || file.size > 50 * 1024 * 1024) return atelierJson({ error: "Selecione um arquivo de até 50 MB." }, 400);
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["zip", "mcworld", "mcpack", "schem", "schematic", "litematic", "nbt", "pdf"].includes(extension)) return atelierJson({ error: "Envie ZIP, PDF ou um dos formatos Minecraft indicados." }, 400);
    const key = `atelier-private/${crypto.randomUUID()}.${extension}`;
    await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: "application/octet-stream" } });
    return atelierJson({ key, name: file.name.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 180) }, 201);
  } catch { return atelierJson({ error: "Não foi possível guardar o arquivo." }, 503); }
}
