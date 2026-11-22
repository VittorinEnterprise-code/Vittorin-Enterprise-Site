import { and, asc, eq } from "drizzle-orm";
import { ensureDatabaseSchema, getD1Binding, getDb } from "@/db";
import { products } from "@/db/schema";
import { defaultAtelierContent } from "./atelier-content";
import { productSaveStatement } from "./catalog-products";
import { sha256Hex } from "./payment-security";
import { parseAccessProducts } from "./product-offers";
import type { SiteContent } from "./site-content";

export const atelierSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS atelier_content (id integer PRIMARY KEY CHECK(id = 1), content_json text NOT NULL, updated_at integer NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS atelier_links (
    id text PRIMARY KEY, token_hash text NOT NULL UNIQUE, product_id text, label text NOT NULL,
    created_at integer NOT NULL, expires_at integer, revoked_at integer
  )`,
  `CREATE INDEX IF NOT EXISTS idx_atelier_links_product ON atelier_links(product_id)`,
  `CREATE TABLE IF NOT EXISTS atelier_product_files (product_id text PRIMARY KEY, file_key text NOT NULL, file_name text NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS atelier_order_files (item_id text PRIMARY KEY, order_id text NOT NULL, file_key text NOT NULL, file_name text NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_atelier_order_files_order ON atelier_order_files(order_id)`,
  `CREATE TABLE IF NOT EXISTS atelier_orders (order_id text PRIMARY KEY)`,
];
let ready = false;
export async function ensureAtelierSchema() {
  await ensureDatabaseSchema();
  if (ready) return;
  for (const sql of atelierSchemaStatements) await getD1Binding().prepare(sql).run();
  ready = true;
}

export async function loadAtelierContent(): Promise<SiteContent> {
  await ensureAtelierSchema();
  const record = await getD1Binding().prepare("SELECT content_json AS content FROM atelier_content WHERE id = 1").first<{ content: string }>();
  const content: SiteContent = record ? JSON.parse(record.content) : defaultAtelierContent();
  const rows = await getDb().select().from(products).where(and(eq(products.catalogScope, "atelier"), eq(products.archived, false)))
    .orderBy(asc(products.sortOrder), asc(products.name));
  const metadata = new Map(content.products.map((p) => [p.id, p]));
  return { ...content, products: rows.map((p) => ({ ...p, accessProducts: parseAccessProducts(p.accessProducts), categoryId: metadata.get(p.id)?.categoryId ?? null,
    downloadKey: metadata.get(p.id)?.downloadKey, downloadName: metadata.get(p.id)?.downloadName })) };
}

export async function saveAtelierContent(content: SiteContent) {
  await ensureAtelierSchema();
  // This portfolio has its own delivery workflow; Juris access grants stay in the main shop.
  if (content.products.some((p) => p.fulfillmentMode === "external")) throw new Error("ATELIER_EXTERNAL_DELIVERY");
  if (content.products.some((p) => p.fulfillmentMode === "digital" && (!/^atelier-private\/[a-f0-9-]{36}\.[a-z]+$/.test(p.downloadKey || "") || !p.downloadName?.trim()))) throw new Error("ATELIER_FILE_REQUIRED");
  const db = getD1Binding(), guard = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare(`WITH expected AS (SELECT json_extract(value, '$.id') id, json_extract(value, '$.inventoryRevision') revision FROM json_each(?))
        INSERT INTO content_save_guards (id, ok) SELECT ?, CASE WHEN NOT EXISTS (
          SELECT 1 FROM expected e LEFT JOIN products p ON p.id=e.id WHERE
            (p.id IS NULL AND e.revision <> 0) OR (p.id IS NOT NULL AND (p.catalog_scope <> 'atelier' OR p.inventory_revision <> e.revision))
        ) THEN 1 ELSE NULL END`).bind(JSON.stringify(content.products.map((p) => ({ id: p.id, inventoryRevision: p.inventoryRevision }))), guard),
      db.prepare(`UPDATE products SET archived=1, is_visible=0, is_sellable=0, slug='__archived__'||id||'__'||slug WHERE catalog_scope='atelier' AND archived=0`),
      ...content.products.map((p) => productSaveStatement(db, p, "atelier")),
      db.prepare("DELETE FROM atelier_product_files WHERE product_id IN (SELECT id FROM products WHERE catalog_scope='atelier')"),
      ...content.products.filter((p) => p.fulfillmentMode === "digital").map((p) => db.prepare("INSERT INTO atelier_product_files (product_id, file_key, file_name) VALUES (?, ?, ?)").bind(p.id, p.downloadKey!, p.downloadName!)),
      db.prepare(`INSERT INTO atelier_content (id, content_json, updated_at) VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET content_json=excluded.content_json, updated_at=excluded.updated_at`).bind(JSON.stringify(content), Date.now()),
      db.prepare("DELETE FROM content_save_guards WHERE id=?").bind(guard),
    ]);
  } catch { throw new Error("ATELIER_SAVE_CONFLICT"); }
}

export type AtelierGrant = { id: string; productId: string | null };
export async function readAtelierGrant(db: D1Database, token: string, now = Date.now()) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return db.prepare(`SELECT id, product_id AS productId FROM atelier_links
    WHERE token_hash=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?) LIMIT 1`)
    .bind(await sha256Hex(token), now).first<AtelierGrant>();
}

export async function canBuyCatalogItems(db: D1Database, ids: string[], token?: string) {
  const rows = await db.prepare(`SELECT id, catalog_scope AS scope FROM products WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all<{ id: string; scope: string }>();
  const privateRows = rows.results.filter((p) => p.scope !== "main");
  if (!privateRows.length) return true;
  if (!token) return false;
  const grant = await readAtelierGrant(db, token);
  return Boolean(grant && privateRows.every((p) => p.scope === "atelier" && (!grant.productId || grant.productId === p.id)));
}

export function visibleAtelierContent(content: SiteContent, grant: AtelierGrant): SiteContent {
  const visible = content.products.filter((p) => p.isVisible && (!grant.productId || p.id === grant.productId)).map(({ downloadKey: _key, downloadName: _name, ...p }) => p);
  return { ...content, products: visible, categories: content.categories.filter((c) => c.isVisible && (!grant.productId || visible.some((p) => p.categoryId === c.id))) };
}

export async function readPaidAtelierFiles(db: D1Database, orderId: string, token: string) {
  if (!/^[a-f0-9-]{36}$/i.test(orderId) || !/^[a-f0-9]{64}$/i.test(token)) return [];
  return (await db.prepare(`SELECT f.item_id AS itemId, f.file_name AS name, f.file_key AS key
    FROM atelier_order_files f JOIN payment_orders o ON o.id=f.order_id
    WHERE o.id=? AND o.public_token_hash=? AND o.status='paid' ORDER BY f.item_id`)
    .bind(orderId, await sha256Hex(token)).all<{ itemId: string; name: string; key: string }>()).results;
}
