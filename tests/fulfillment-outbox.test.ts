import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("external fulfillment is persisted, signed, retried and kept outside the webhook response", () => {
  const fulfillment = source("lib/external-fulfillment.ts");
  const database = source("db/index.ts");
  const worker = source("worker/index.ts");
  const cloudflareConfig = source("scripts/prepare-cloudflare-config.mjs");

  assert.match(database, /CREATE TABLE IF NOT EXISTS payment_fulfillment_jobs/);
  assert.match(fulfillment, /x-vittorin-signature/);
  assert.match(fulfillment, /redirect: "manual"/);
  assert.doesNotMatch(fulfillment, /redirect: "error"/);
  assert.match(fulfillment, /waitUntil\(dispatchExternalFulfillmentForOrder/);
  assert.match(fulfillment, /retryExternalFulfillmentForOrderNow/);
  assert.match(fulfillment, /WHERE order_id = \? AND status IN \('pending', 'failed'\)/);
  assert.match(fulfillment, /status = 'processing' AND updated_at <= \?/);
  assert.match(fulfillment, /product: \{ sku: row\.sku, slug: row\.productSlug, name: row\.productName, quantity: row\.quantity \}/);
  assert.match(worker, /scheduled\(/);
  assert.match(worker, /retryExternalFulfillment\(5\)/);
  assert.match(cloudflareConfig, /crons: \["\*\/5 \* \* \* \*"\]/);
});

test("manual completion cannot bypass an unfinished external delivery", () => {
  const commerce = source("lib/commerce.ts");
  assert.match(commerce, /external_fulfillment_pending/);
  assert.match(commerce, /j\.action = 'grant' AND j\.status = 'sent'/);
});

test("admin can force and await an external fulfillment retry", () => {
  const commerce = source("lib/commerce.ts");
  const admin = source("components/orders-admin-client.tsx");
  const route = source("app/studio/api/orders/[id]/action/route.ts");
  assert.match(commerce, /export async function retryCommerceFulfillment/);
  assert.match(commerce, /await retryExternalFulfillmentForOrderNow\(orderId\)/);
  assert.match(commerce, /externalFulfillmentLastError/);
  assert.match(commerce, /externalFulfillmentEndpoint/);
  assert.match(route, /retry_fulfillment: retryCommerceFulfillment/);
  assert.match(admin, /Tentar liberação agora/);
  assert.match(admin, /Destino usado:/);
  assert.match(admin, /O segredo da loja não coincide com o segredo do Juris/);
  assert.match(admin, /endereço público do Worker juris-immersive-mobile/);
  assert.match(admin, /endpoint não existe neste Worker/);
});

test("mixed fulfillment keeps manual completion available after the external grant", () => {
  const commerce = source("lib/commerce.ts");
  const admin = source("components/orders-admin-client.tsx");
  assert.match(commerce, /hasManualFulfillment/);
  assert.match(commerce, /hasExternalFulfillment/);
  assert.match(commerce, /WHERE action = 'grant' AND order_id IN/);
  assert.match(admin, /order\.hasManualFulfillment/);
  assert.match(admin, /order\.externalFulfillmentStatus === "sent"/);
  assert.match(admin, /order\.externalFulfillmentStatus !== "sent"/);
});
