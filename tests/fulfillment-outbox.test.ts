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
  assert.match(fulfillment, /waitUntil\(dispatchExternalFulfillmentForOrder/);
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
