import { env } from "cloudflare:workers";

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string[] }> },
) {
  if (!env.BUCKET) return new Response("Mídia indisponível", { status: 503 });

  const { key: segments } = await context.params;
  const key = segments.join("/");
  if (!key.startsWith("uploads/")) return new Response("Mídia inválida", { status: 400 });

  const object = await env.BUCKET.get(key);
  if (!object) return new Response("Mídia não encontrada", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}
