import assert from "node:assert/strict";
import test, { after } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "vite";
const root = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const runtime = { owner: true, DEPLOYMENT_ENV: "production", PAYMENTS_ENABLED: "1", MP_ACCESS_TOKEN: "test-only", MP_SELLER_USER_ID: "123", MP_APPLICATION_ID: "456",
  MP_WEBHOOK_SECRET: "test-only-secret-".repeat(3), PAYMENT_ORDER_TOKEN_SECRET: "test-only-token-".repeat(3), PUBLIC_SITE_URL: "https://store.example.test" };
globalThis.__ATELIER_TEST_RUNTIME__ = runtime;
await build({ configFile: false, root, logLevel: "error", plugins: [{ name: "isolated-owner", enforce: "pre", resolveId(id, importer) { if (id === "./admin" && importer?.replaceAll("\\", "/").endsWith("/lib/atelier-http.ts")) return root + "/tests/atelier-owner.mjs"; } }], resolve: { alias: [{ find: "@/lib/admin", replacement: root + "/tests/atelier-owner.mjs" }, { find: "@", replacement: root }, { find: "cloudflare:workers", replacement: root + "/tests/atelier-runtime.mjs" }] }, ssr: { noExternal: true }, build: { ssr: "tests/atelier-entry.ts", outDir: ".wrangler/atelier-test", rollupOptions: { output: { entryFileNames: "entry.mjs" } } } });
const a = await import(new URL("../.wrangler/atelier-test/entry.mjs", import.meta.url));
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; delete globalThis.__ATELIER_TEST_RUNTIME__; });
function sqliteDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(root + "/drizzle").filter((f) => f.endsWith(".sql")).sort()) sqlite.exec(readFileSync(root + "/drizzle/" + file, "utf8"));
  const db = { prepare(sql) { return { sql, values: [], bind(...values) { this.values = values; return this; },
    async first(column) { const row = sqlite.prepare(sql).get(...this.values); return column ? row?.[column] ?? null : row ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...this.values), success: true }; },
    async raw() { return sqlite.prepare(sql).all(...this.values).map(Object.values); },
    async run() { const s = sqlite.prepare(sql); return s.columns().length ? { results: s.all(...this.values), success: true, meta: {} } : { results: [], success: true, meta: s.run(...this.values) }; },
  }; }, async batch(statements) { sqlite.exec("BEGIN"); try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec("COMMIT"); return results; } catch (error) { sqlite.exec("ROLLBACK"); throw error; } } };
  return { db, sqlite };
}
function request(method, body, origin = runtime.PUBLIC_SITE_URL) {
  return new Request(runtime.PUBLIC_SITE_URL + "/studio/api/atelier/links", { method, headers: { origin, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
const baseProduct = { ...a.DEFAULT_CONTENT.products[0], status: "available", priceCents: 2000, isSellable: true, isVisible: true, fulfillmentMode: "manual" };
const p = (id, extra = {}) => ({ ...baseProduct, id, slug: id, name: id, sku: id, categoryId: "atelier-builds", ...extra });

test("private Atelier preserves company catalog, gates shares and checkout, and delivers only paid order snapshots", async (t) => {
  const { db, sqlite } = sqliteDatabase(); runtime.DB = db;
  const blobs = new Map(); runtime.BUCKET = { async put(key, stream) { blobs.set(key, await new Response(stream).arrayBuffer()); }, async get(key) { const data = blobs.get(key); return data ? { size: data.byteLength, body: new Blob([data]).stream() } : null; } };
  let privateContent, mainContent, portfolioKey, productKey, uploaded;
  await t.test("owner endpoints fail closed and cross-site writes are rejected", async () => {
    runtime.owner = false;
    assert.equal((await a.contentApi.GET()).status, 401);
    assert.equal((await a.linksApi.GET()).status, 401);
    assert.equal((await a.linksApi.POST(request("POST", { productId: null, label: "Probe", days: 0 }))).status, 401);
    assert.equal((await a.uploadApi.POST(request("POST", {}))).status, 401);
    runtime.owner = true;
    assert.equal((await a.linksApi.POST(request("POST", {}, "https://foreign.test"))).status, 403);
    assert.equal((await a.contentApi.PUT(request("PUT", {}, "https://foreign.test"))).status, 403);
  });
  await t.test("empty Atelier starts without products and both catalogs save independently", async () => {
    assert.equal((await a.loadAtelierContent()).products.length, 0);
    mainContent = structuredClone(a.DEFAULT_CONTENT); mainContent.products = [p("main-product", { categoryId: mainContent.categories[0].id })];
    await a.saveSiteContent(mainContent);
    privateContent = a.defaultAtelierContent(); privateContent.products = [p("castle"), p("commission", { inventoryMode: "finite", stockQuantity: 3 }), p("secret-draft", { isVisible: false })];
    await a.saveAtelierContent(privateContent);
    assert.deepEqual((await a.loadSiteContent()).products.map((p) => p.id), ["main-product"]);
    await a.saveSiteContent(await a.loadSiteContent());
    assert.equal((await a.loadAtelierContent()).products.length, 3);
    assert.equal((await a.loadSiteContent()).settings.heroTitle, mainContent.settings.heroTitle);
    assert.equal((await a.loadAtelierContent()).settings.heroTitle, privateContent.settings.heroTitle);
    assert.equal(sqlite.prepare("SELECT category_id FROM products WHERE id='castle'").get().category_id, null);
    assert.equal((await a.loadAtelierContent()).products.find((p) => p.id === "castle").categoryId, "atelier-builds");
  });
  await t.test("cross-catalog IDs, stale stock, and missing downloads roll back the whole save", async () => {
    const oldMain = await a.loadSiteContent(), oldPrivate = await a.loadAtelierContent();
    await assert.rejects(a.saveAtelierContent({ ...oldPrivate, products: [p("main-product")] }));
    await assert.rejects(a.saveSiteContent({ ...oldMain, products: [p("castle")] }));
    assert.equal((await a.loadSiteContent()).products[0].id, "main-product");
    assert.equal((await a.loadAtelierContent()).products.length, 3);
    sqlite.exec("UPDATE products SET inventory_revision=1, stock_quantity=2 WHERE id='commission'");
    await assert.rejects(a.saveAtelierContent(oldPrivate));
    assert.equal(sqlite.prepare("SELECT stock_quantity FROM products WHERE id='commission'").get().stock_quantity, 2);
    await assert.rejects(a.saveAtelierContent({ ...oldPrivate, products: [p("no-file", { fulfillmentMode: "digital" })] }), /ATELIER_FILE_REQUIRED/);
    for (const sql of a.atelierSchemaStatements) sqlite.exec(sql);
  });
  await t.test("share tokens are hashed, scoped, expirable, revocable, and never expose other products", async () => {
    const full = await a.linksApi.POST(request("POST", { productId: null, label: "Collection", days: 0 })); assert.equal(full.status, 201);
    portfolioKey = new URL((await full.json()).url).pathname.split("/").pop();
    const one = await a.linksApi.POST(request("POST", { productId: "castle", label: "Castle only", days: 7 })); assert.equal(one.status, 201);
    productKey = new URL((await one.json()).url).pathname.split("/").pop();
    assert.equal(await a.readAtelierGrant(db, "guess"), null);
    assert.equal(await a.canBuyCatalogItems(db, ["castle"]), false);
    assert.equal(await a.canBuyCatalogItems(db, ["castle"], productKey), true);
    assert.equal(await a.canBuyCatalogItems(db, ["commission"], productKey), false);
    assert.equal(await a.canBuyCatalogItems(db, ["commission"], portfolioKey), true);
    const grant = await a.readAtelierGrant(db, productKey);
    assert.deepEqual(a.visibleAtelierContent(await a.loadAtelierContent(), grant).products.map((p) => p.id), ["castle"]);
    assert.equal(a.visibleAtelierContent(await a.loadAtelierContent(), await a.readAtelierGrant(db, portfolioKey)).products.length, 2);
    assert.equal(await a.readAtelierGrant(db, productKey, Date.now() + 8 * 86400000), null);
    const listed = await (await a.linksApi.GET()).json(); assert.equal(JSON.stringify(listed).includes(portfolioKey), false);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM atelier_links WHERE token_hash=?").get(portfolioKey).n, 0);
    const revoked = await a.linksApi.POST(request("POST", { productId: null, label: "Revoke", days: 0 }));
    const revokedBody = await revoked.json(), raw = new URL(revokedBody.url).pathname.split("/").pop();
    assert.equal((await a.linksApi.DELETE(request("DELETE", { id: revokedBody.id }))).status, 200);
    assert.equal(await a.readAtelierGrant(db, raw), null);
    assert.equal(await a.canBuyCatalogItems(db, ["castle"], raw), false);
    assert.equal((await a.linksApi.POST(request("POST", { productId: "secret-draft", label: "Hidden", days: 0 }))).status, 400);
  });
  await t.test("private uploads are inaccessible from public media; digital files stay out of shared payloads", async () => {
    const form = new FormData(); form.set("file", new File(["test-world-contents"], "Meu mundo.zip", { type: "application/zip" }));
    const response = await a.uploadApi.POST(new Request(runtime.PUBLIC_SITE_URL + "/studio/api/atelier/files", { method: "POST", headers: { origin: runtime.PUBLIC_SITE_URL }, body: form }));
    assert.equal(response.status, 201); uploaded = await response.json(); assert.match(uploaded.key, /^atelier-private\//);
    const media = await a.publicMedia.GET(new Request(runtime.PUBLIC_SITE_URL), { params: Promise.resolve({ key: uploaded.key.split("/") }) });
    assert.notEqual(media.status, 200);
    privateContent = await a.loadAtelierContent(); privateContent.products[0] = { ...privateContent.products[0], fulfillmentMode: "digital", downloadKey: uploaded.key, downloadName: uploaded.name };
    await a.saveAtelierContent(privateContent);
    assert.equal((await a.loadAtelierContent()).products.find((p) => p.id === "castle").downloadKey, uploaded.key);
    assert.equal(JSON.stringify(a.visibleAtelierContent(await a.loadAtelierContent(), await a.readAtelierGrant(db, portfolioKey))).includes(uploaded.key), false);
  });
  await t.test("checkout refuses guessed private IDs and slugs; valid shares use the existing Mercado Pago pipeline", async () => {
    globalThis.fetch = async (url, init) => {
      if (url === "https://api.mercadolibre.com/users/me") return Response.json({ id: 123 });
      if (url === "https://api.mercadopago.com/v1/orders") { const body = JSON.parse(init.body); return Response.json({ id: "ORD" + crypto.randomUUID().replaceAll("-", ""), status: "created", status_detail: "created", external_reference: body.external_reference, total_amount: body.total_amount, currency: "BRL", user_id: "123", integration_data: { application_id: "456" }, live_mode: true, checkout_url: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=test" }); }
      throw new Error("Unexpected network request in isolated test: " + url);
    };
    assert.equal(await a.getPublicCheckoutProductBySlug("castle"), null);
    assert.ok(await a.getPublicCheckoutProductBySlug("castle", productKey));
    const input = { requestId: crypto.randomUUID(), email: "buyer@example.test", items: [{ productId: "castle", quantity: 1 }] };
    await assert.rejects(a.createCommerceOrder(input), (e) => e.code === "product_unavailable");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM payment_orders").get().n, 0);
    const order = await a.createCommerceOrder({ ...input, atelierKey: productKey }); assert.equal(order.totalCents, 2000);
    const again = await a.createCommerceOrder({ ...input, atelierKey: productKey }); assert.equal(again.id, order.id);
    const files = () => a.readPaidAtelierFiles(db, order.id, order.publicToken);
    assert.equal((await files()).length, 0);
    sqlite.prepare("UPDATE payment_orders SET status='paid' WHERE id=?").run(order.id);
    assert.equal((await a.readPaidAtelierFiles(db, order.id, "f".repeat(64))).length, 0);
    assert.equal((await files())[0].key, uploaded.key);
    privateContent = await a.loadAtelierContent(); privateContent.products[0].downloadKey = `atelier-private/${crypto.randomUUID()}.zip`;
    await a.saveAtelierContent(privateContent);
    assert.equal((await files())[0].key, uploaded.key, "orders retain the sold asset after the product changes");
    const itemId = (await files())[0].itemId;
    const url = runtime.PUBLIC_SITE_URL + `/api/checkout/orders/${order.id}/downloads/${itemId}?token=${order.publicToken}`;
    const download = await a.downloadApi.GET(new Request(url), { params: Promise.resolve({ id: order.id, itemId }) });
    assert.equal(download.status, 200); assert.equal(await download.text(), "test-world-contents"); assert.match(download.headers.get("cache-control"), /no-store/);
    sqlite.prepare("UPDATE payment_orders SET status='refunded' WHERE id=?").run(order.id);
    assert.equal((await files()).length, 0);
    assert.equal((await a.downloadApi.GET(new Request(url), { params: Promise.resolve({ id: order.id, itemId }) })).status, 404);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM atelier_orders WHERE order_id=?").get(order.id).n, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM payment_order_items WHERE order_id=?").get(order.id).n, 1);
    const commission = await a.createCommerceOrder({ requestId: crypto.randomUUID(), email: "commission@example.test", items: [{ productId: "commission", quantity: 1 }], atelierKey: portfolioKey });
    assert.equal(sqlite.prepare("SELECT stock_quantity FROM products WHERE id='commission'").get().stock_quantity, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM atelier_order_files WHERE order_id=?").get(commission.id).n, 0);
    const mainOrder = await a.createCommerceOrder({ requestId: crypto.randomUUID(), email: "main@example.test", items: [{ productId: "main-product", quantity: 1 }] });
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM atelier_orders WHERE order_id=?").get(mainOrder.id).n, 0);
    assert.deepEqual(new Set((await a.listCommerceOrdersForAdmin(100, "atelier")).map((o) => o.id)), new Set([order.id, commission.id]));
  });
  sqlite.close();
});
