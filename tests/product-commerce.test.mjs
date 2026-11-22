import assert from "node:assert/strict";
import test, { after } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "vite";
const root = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const runtime = { DEPLOYMENT_ENV: "production", PAYMENTS_ENABLED: "1", MP_ACCESS_TOKEN: "test-only", MP_SELLER_USER_ID: "123", MP_APPLICATION_ID: "456",
  MP_WEBHOOK_SECRET: "test-only-secret-".repeat(3), PAYMENT_ORDER_TOKEN_SECRET: "test-only-token-".repeat(3), PUBLIC_SITE_URL: "https://store.example.test",
  JURIS_FULFILLMENT_URL: "https://accounts.example.test/api/entitlements/commerce", COMMERCE_FULFILLMENT_SECRET: "test-only-fulfillment-".repeat(3) };
globalThis.__STORE_TEST_RUNTIME__ = runtime;
const background = []; globalThis.__STORE_TEST_WAIT__ = (promise) => background.push(promise);
await build({ configFile: false, root, logLevel: "error", resolve: { alias: { "@": root, "cloudflare:workers": root + "/tests/cloudflare-runtime.mjs" } }, ssr: { noExternal: true }, build: { ssr: "tests/product-commerce-entry.ts", outDir: ".wrangler/product-commerce-test", rollupOptions: { output: { entryFileNames: "entry.mjs" } } } });
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; delete globalThis.__STORE_TEST_RUNTIME__; delete globalThis.__STORE_TEST_WAIT__; });
const { offers, DEFAULT_CONTENT, siteContentSchema, saveSiteContent, loadSiteContent, createCommerceOrder, syncExternalFulfillmentForOrder } = await import(new URL("../.wrangler/product-commerce-test/entry.mjs", import.meta.url));

test("new offers are hidden, unpriced drafts; existing Learn values and previously configured offers are preserved", () => {
  const learn = { ...DEFAULT_CONTENT.products[0], priceCents: 10000, isSellable: true };
  const prepared = offers.prepareJurisOfferDrafts([learn]); assert.equal(prepared[0], learn); assert.equal(prepared.length, 3);
  for (const draft of prepared.slice(1)) { assert.equal(draft.priceCents, 0); assert.equal(draft.isSellable, false); assert.equal(draft.isVisible, false); }
  assert.deepEqual(prepared[1].accessProducts, ["processus"]); assert.deepEqual(prepared[2].accessProducts, ["learn", "processus"]);
  assert.deepEqual(offers.prepareJurisOfferDrafts(prepared), prepared);
  assert.equal(offers.parseAccessProducts('["other"]').length, 0);
  const priced = prepared.map((p, i) => ({ ...p, priceCents: [10000, 5000, 12000][i], isSellable: true }));
  assert.equal(offers.bundlePriceError(priced), null);
  assert.ok(offers.bundlePriceError(priced.map((p, i) => i === 2 ? { ...p, priceCents: 15000 } : p)));
  assert.equal(offers.bundlePriceError(prepared), null);
  const content = { ...structuredClone(DEFAULT_CONTENT), products: prepared };
  assert.equal(siteContentSchema.safeParse(content).success, true);
});

test("real checkout SQL snapshots each license, rejects concurrent access changes, and fulfillment uses the order snapshot after catalog edits", async () => {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(root + "/drizzle").filter((f) => f.endsWith(".sql")).sort()) sqlite.exec(readFileSync(root + "/drizzle/" + file, "utf8"));
  let beforeCheckoutBatch = null;
  runtime.DB = { prepare(sql) { return { sql, values: [], bind(...values) { this.values = values; return this; },
    async first(column) { const row = sqlite.prepare(sql).get(...this.values); return column ? row?.[column] ?? null : row ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...this.values), success: true }; },
    async raw() { return sqlite.prepare(sql).all(...this.values).map(Object.values); },
    async run() { const statement = sqlite.prepare(sql); return statement.columns().length ? { results: statement.all(...this.values), success: true, meta: {} } : { results: [], success: true, meta: statement.run(...this.values) }; },
  }; }, async batch(statements) {
    if (beforeCheckoutBatch && statements.some((s) => s.sql.includes("INSERT INTO payment_orders"))) { beforeCheckoutBatch(); beforeCheckoutBatch = null; }
    sqlite.exec("BEGIN"); try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec("COMMIT"); return results; } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  } };
  let content = structuredClone(DEFAULT_CONTENT);
  content.products[0] = { ...content.products[0], sku: "LEARN-TEST", fulfillmentMode: "external", accessProducts: ["learn"], priceCents: 10000, status: "available", isSellable: true, isVisible: true };
  await saveSiteContent(content);
  content = await loadSiteContent(); assert.equal(content.products.length, 3);
  assert.equal(content.products.find((p) => p.slug === "juris-immersive-processus").isVisible, false);
  content.products = content.products.map((p) => p.slug === "juris-immersive-processus" ? { ...p, isSellable: true, isVisible: true, status: "available", priceCents: 5000 } : p);
  await saveSiteContent(content);
  const addon = content.products.find((p) => p.slug === "juris-immersive-processus");
  const delivered = [];
  globalThis.fetch = async (url, init) => {
    if (url === "https://api.mercadolibre.com/users/me") return Response.json({ id: 123 });
    if (url === "https://api.mercadopago.com/v1/orders") { const body = JSON.parse(init.body); return Response.json({ id: "ORD" + crypto.randomUUID().replaceAll("-", ""), status: "created", status_detail: "created", external_reference: body.external_reference, total_amount: body.total_amount, currency: "BRL", user_id: "123", integration_data: { application_id: "456" }, live_mode: true, checkout_url: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=test" }); }
    if (url === runtime.JURIS_FULFILLMENT_URL) { delivered.push(JSON.parse(init.body)); return Response.json({ processed: true }); }
    throw new Error("Unexpected network request in isolated test: " + url);
  };
  const order = await createCommerceOrder({ requestId: crypto.randomUUID(), email: "buyer@example.test", items: [{ productId: addon.id, quantity: 1 }] });
  assert.equal(order.totalCents, 5000);
  assert.equal(sqlite.prepare("SELECT access_products FROM payment_order_items WHERE order_id = ?").get(order.id).access_products, '["processus"]');
  sqlite.prepare("UPDATE products SET access_products = ? WHERE id = ?").run('["learn"]', addon.id);
  sqlite.prepare("UPDATE payment_orders SET status='paid', paid_at=?, updated_at=? WHERE id=?").run(Date.now(), Date.now(), order.id);
  await syncExternalFulfillmentForOrder(order.id); await Promise.all(background.splice(0));
  assert.equal(delivered.length, 1); assert.equal(delivered[0].version, 2); assert.deepEqual(delivered[0].product.accessProducts, ["processus"]);
  sqlite.prepare("UPDATE payment_orders SET status='refunded', updated_at=? WHERE id=?").run(Date.now() + 1, order.id);
  await syncExternalFulfillmentForOrder(order.id); await Promise.all(background.splice(0));
  assert.equal(delivered[1].action, "revoke"); assert.deepEqual(delivered[1].product.accessProducts, ["processus"]);
  beforeCheckoutBatch = () => sqlite.prepare("UPDATE products SET access_products = ? WHERE id = ?").run('["processus"]', addon.id);
  const conflictingId = crypto.randomUUID();
  await assert.rejects(createCommerceOrder({ requestId: conflictingId, email: "buyer@example.test", items: [{ productId: addon.id, quantity: 1 }] }), (error) => error.code === "product_changed");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM payment_orders WHERE id = ?").get(conflictingId).count, 0);
  sqlite.close();
});
