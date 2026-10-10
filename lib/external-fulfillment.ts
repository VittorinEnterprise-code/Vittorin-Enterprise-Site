import { env, waitUntil } from "cloudflare:workers";

import { ensureDatabaseSchema, getD1Binding } from "@/db";
import { getExternalFulfillmentConfiguration } from "@/lib/commerce-config";
import { sha256Hex } from "@/lib/payment-security";

type ExternalItemRow = {
  orderId: string;
  providerOrderId: string | null;
  buyerEmail: string;
  orderStatus: string;
  statusDetail: string;
  paidAt: number | null;
  updatedAt: number;
  itemId: string;
  productSlug: string;
  productName: string;
  sku: string;
  quantity: number;
};

type FulfillmentJobRow = {
  id: string;
  orderId: string;
  action: "grant" | "revoke";
  payload: string;
  attempts: number;
};

function actionFor(row: ExternalItemRow): "grant" | "revoke" | null {
  if (row.orderStatus === "paid") return "grant";
  if (row.orderStatus === "refunded" || row.statusDetail === "charged_back") return "revoke";
  return null;
}

function retryDelay(attempts: number) {
  return Math.min(6 * 60 * 60 * 1000, 15_000 * (2 ** Math.min(10, Math.max(0, attempts - 1))));
}

function safeFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 180) || "unknown";
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sign(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function externalItems(orderId: string) {
  const result = await getD1Binding().prepare(`
    SELECT o.id AS orderId, o.provider_order_id AS providerOrderId,
      o.buyer_email AS buyerEmail, o.status AS orderStatus,
      o.status_detail AS statusDetail, o.paid_at AS paidAt,
      o.updated_at AS updatedAt, i.id AS itemId,
      i.product_slug AS productSlug, i.product_name AS productName, i.sku,
      i.quantity
    FROM payment_orders o
    JOIN payment_order_items i ON i.order_id = o.id
    WHERE o.id = ? AND i.fulfillment_mode = 'external'
  `).bind(orderId).all<ExternalItemRow>();
  return result.results ?? [];
}

async function enqueue(orderId: string) {
  const rows = await externalItems(orderId);
  const now = Date.now();
  for (const row of rows) {
    const action = actionFor(row);
    if (!action || !row.providerOrderId || !row.sku) continue;
    const occurredAt = action === "grant" ? (row.paidAt ?? row.updatedAt) : row.updatedAt;
    const eventId = `commerce:${row.orderId}:${row.itemId}:${action}`;
    const payload = JSON.stringify({
      version: 1,
      eventId,
      action,
      orderId: row.orderId,
      providerOrderId: row.providerOrderId,
      email: row.buyerEmail,
      product: { sku: row.sku, slug: row.productSlug, name: row.productName, quantity: row.quantity },
      paidAt: row.paidAt ?? 0,
      occurredAt,
    });
    await getD1Binding().prepare(`
      INSERT OR IGNORE INTO payment_fulfillment_jobs (
        id, order_id, order_item_id, action, payload, payload_hash,
        status, attempts, next_attempt_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
    `).bind(eventId, row.orderId, row.itemId, action, payload, await sha256Hex(payload), now, now, now).run();
  }
}

async function dispatchJob(id: string) {
  const database = getD1Binding();
  const now = Date.now();
  await database.prepare(`
    UPDATE payment_fulfillment_jobs SET status = 'failed', next_attempt_at = ?,
      last_error = 'processing_timeout', updated_at = ?
    WHERE id = ? AND status = 'processing' AND updated_at <= ?
  `).bind(now, now, id, now - 5 * 60 * 1000).run();

  const claimed = await database.prepare(`
    UPDATE payment_fulfillment_jobs
    SET status = 'processing', attempts = attempts + 1, updated_at = ?
    WHERE id = ? AND status IN ('pending', 'failed') AND next_attempt_at <= ?
    RETURNING id, order_id AS orderId, action, payload, attempts
  `).bind(now, id, now).first<FulfillmentJobRow>();
  if (!claimed) return false;

  try {
    if (claimed.action === "grant") {
      const current = await database.prepare("SELECT status FROM payment_orders WHERE id = ? LIMIT 1")
        .bind(claimed.orderId).first<{ status: string }>();
      if (current?.status !== "paid") {
        await database.prepare(`
          UPDATE payment_fulfillment_jobs SET status = 'sent', last_error = 'superseded', sent_at = ?, updated_at = ? WHERE id = ?
        `).bind(now, now, claimed.id).run();
        return true;
      }
    }

    const configuration = getExternalFulfillmentConfiguration();
    if (!configuration) throw new Error("fulfillment_not_configured");
    const timestamp = Math.floor(Date.now() / 1000);
    const response = await fetch(configuration.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-vittorin-timestamp": String(timestamp),
        "x-vittorin-signature": await sign(configuration.secret, `${timestamp}.${claimed.payload}`),
      },
      body: claimed.payload,
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`fulfillment_http_${response.status}`);
    const responseBody = await response.text();
    if (responseBody.length > 10_000) throw new Error("fulfillment_response_too_large");
    const result = JSON.parse(responseBody) as { processed?: unknown };
    if (result.processed !== true) throw new Error("fulfillment_response_invalid");
    await database.prepare(`
      UPDATE payment_fulfillment_jobs
      SET status = 'sent', sent_at = ?, last_error = NULL, updated_at = ? WHERE id = ?
    `).bind(now, now, claimed.id).run();
    if (claimed.action === "grant") {
      await database.prepare(`
        UPDATE payment_orders SET fulfillment_status = 'completed', updated_at = ?
        WHERE id = ? AND status = 'paid' AND fulfillment_status = 'ready'
          AND NOT EXISTS (
            SELECT 1 FROM payment_fulfillment_jobs
            WHERE order_id = ? AND action = 'grant' AND status <> 'sent'
          )
          AND NOT EXISTS (
            SELECT 1 FROM payment_order_items
            WHERE order_id = ? AND fulfillment_mode <> 'external'
          )
      `).bind(now, claimed.orderId, claimed.orderId, claimed.orderId).run();
    }
    return true;
  } catch (error) {
    const retryAt = now + retryDelay(claimed.attempts);
    await database.prepare(`
      UPDATE payment_fulfillment_jobs
      SET status = 'failed', next_attempt_at = ?, last_error = ?, updated_at = ? WHERE id = ?
    `).bind(retryAt, safeFailure(error), now, claimed.id).run();
    console.warn(JSON.stringify({ event: "external_fulfillment_failed", jobId: claimed.id, reason: safeFailure(error) }));
    return false;
  }
}

export async function syncExternalFulfillmentForOrder(orderId: string) {
  if (env.SITES_VALIDATION_AUTH === "1") return;
  await ensureDatabaseSchema();
  await enqueue(orderId);
  waitUntil(dispatchExternalFulfillmentForOrder(orderId).catch((error) => {
    console.warn(JSON.stringify({
      event: "external_fulfillment_background_failed",
      orderId,
      reason: safeFailure(error),
    }));
  }));
}

export async function retryExternalFulfillmentForOrderNow(orderId: string) {
  if (env.SITES_VALIDATION_AUTH === "1") return;
  await ensureDatabaseSchema();
  await enqueue(orderId);
  const now = Date.now();
  const jobs = await getD1Binding().prepare(`
    UPDATE payment_fulfillment_jobs
    SET next_attempt_at = ?, updated_at = ?
    WHERE order_id = ? AND status IN ('pending', 'failed')
    RETURNING id
  `).bind(now, now, orderId).all<{ id: string }>();
  for (const job of jobs.results ?? []) await dispatchJob(job.id);
  const staleJobs = await getD1Binding().prepare(`
    SELECT id FROM payment_fulfillment_jobs
    WHERE order_id = ? AND status = 'processing' AND updated_at <= ?
  `).bind(orderId, now - 5 * 60 * 1000).all<{ id: string }>();
  for (const job of staleJobs.results ?? []) await dispatchJob(job.id);
}

async function dispatchExternalFulfillmentForOrder(orderId: string) {
  const jobs = await getD1Binding().prepare(`
    SELECT id FROM payment_fulfillment_jobs
    WHERE order_id = ? AND status IN ('pending', 'failed', 'processing')
    ORDER BY created_at LIMIT 3
  `).bind(orderId).all<{ id: string }>();
  for (const job of jobs.results ?? []) await dispatchJob(job.id);
}

export async function retryExternalFulfillment(limit = 3) {
  if (env.SITES_VALIDATION_AUTH === "1") return;
  await ensureDatabaseSchema();
  const now = Date.now();
  const jobs = await getD1Binding().prepare(`
    SELECT id FROM payment_fulfillment_jobs
    WHERE (status IN ('pending', 'failed') AND next_attempt_at <= ?)
      OR (status = 'processing' AND updated_at <= ?)
    ORDER BY next_attempt_at, created_at LIMIT ?
  `).bind(now, now - 5 * 60 * 1000, Math.max(1, Math.min(10, Math.trunc(limit)))).all<{ id: string }>();
  for (const job of jobs.results ?? []) await dispatchJob(job.id);
}

export function scheduleExternalFulfillmentRetry(limit = 3) {
  waitUntil(retryExternalFulfillment(limit).catch((error) => {
    console.warn(JSON.stringify({
      event: "external_fulfillment_retry_failed",
      reason: safeFailure(error),
    }));
  }));
}

