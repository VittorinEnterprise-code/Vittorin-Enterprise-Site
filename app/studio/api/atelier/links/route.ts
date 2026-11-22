import { z } from "zod";
import { getD1Binding } from "@/db";
import { ensureAtelierSchema } from "@/lib/atelier-store";
import { atelierJson, atelierMutationAllowed, requireAtelierOwner } from "@/lib/atelier-http";
import { sha256Hex } from "@/lib/payment-security";
import { readBoundedJson } from "@/lib/mercado-pago";

export async function GET() {
  const denied = await requireAtelierOwner(); if (denied) return denied;
  await ensureAtelierSchema();
  const links = await getD1Binding().prepare(`SELECT l.id, l.product_id AS productId, l.label, l.created_at AS createdAt,
    l.expires_at AS expiresAt, l.revoked_at AS revokedAt, p.name AS productName FROM atelier_links l LEFT JOIN products p ON p.id=l.product_id ORDER BY l.created_at DESC LIMIT 200`).all();
  return atelierJson({ links: links.results });
}
const schema = z.object({ productId: z.string().max(80).nullable(), label: z.string().trim().min(1).max(120), days: z.union([z.literal(0), z.literal(1), z.literal(7), z.literal(30)]) });
export async function POST(request: Request) {
  const denied = await requireAtelierOwner(); if (denied) return denied;
  if (!atelierMutationAllowed(request)) return atelierJson({ error: "Origem inválida." }, 403);
  const parsed = schema.safeParse(await readBoundedJson(request, 4096).catch(() => null));
  if (!parsed.success) return atelierJson({ error: "Revise o produto, nome e validade do link." }, 400);
  await ensureAtelierSchema(); const db = getD1Binding(), data = parsed.data;
  if (data.productId && !await db.prepare("SELECT id FROM products WHERE id=? AND catalog_scope='atelier' AND archived=0 AND is_visible=1").bind(data.productId).first()) return atelierJson({ error: "Salve e torne o produto visível no Atelier antes de compartilhar." }, 400);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) => v.toString(16).padStart(2, "0")).join("");
  const id = crypto.randomUUID(), now = Date.now();
  await db.prepare("INSERT INTO atelier_links (id, token_hash, product_id, label, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, await sha256Hex(token), data.productId, data.label, now, data.days ? now + data.days * 86400000 : null).run();
  return atelierJson({ id, url: `${new URL(request.url).origin}/atelier/${token}` }, 201);
}
export async function DELETE(request: Request) {
  const denied = await requireAtelierOwner(); if (denied) return denied;
  if (!atelierMutationAllowed(request)) return atelierJson({ error: "Origem inválida." }, 403);
  const input = z.object({ id: z.string().uuid() }).safeParse(await readBoundedJson(request, 4096).catch(() => null));
  if (!input.success) return atelierJson({ error: "Link inválido." }, 400);
  await ensureAtelierSchema(); await getD1Binding().prepare("UPDATE atelier_links SET revoked_at=? WHERE id=? AND revoked_at IS NULL").bind(Date.now(), input.data.id).run();
  return atelierJson({ revoked: true });
}
