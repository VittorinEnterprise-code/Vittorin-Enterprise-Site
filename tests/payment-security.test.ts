import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMercadoPagoManifest,
  hmacSha256Hex,
  mapMercadoPagoOrderState,
  sha256Hex,
  timingSafeHexEqual,
  verifyMercadoPagoSignature,
} from "../lib/payment-security.ts";

test("hashes values with Web Crypto", async () => {
  assert.equal(
    await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(
    await hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog"),
    "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
  );
});

test("compares only valid SHA-256 hex values", () => {
  const value = "ab".repeat(32);
  assert.equal(timingSafeHexEqual(value, value.toUpperCase()), true);
  assert.equal(timingSafeHexEqual(value, "ac".repeat(32)), false);
  assert.equal(timingSafeHexEqual("", ""), false);
});

test("accepts the raw Mercado Pago signature", async () => {
  const nowMs = 1_800_000_000_000;
  const timestamp = String(nowMs / 1000);
  const manifest = buildMercadoPagoManifest({
    dataId: "ORD01AbC",
    requestId: "request-123",
    timestamp,
  });
  const signature = await hmacSha256Hex("webhook-secret", manifest);
  const result = await verifyMercadoPagoSignature({
    secret: "webhook-secret",
    signatureHeader: `ts=${timestamp},v1=${signature}`,
    requestId: "request-123",
    dataId: "ORD01AbC",
    nowMs,
  });
  assert.deepEqual(result, { valid: true, variant: "raw", reason: "valid" });
});

test("supports the documented lower-case data id variant", async () => {
  const nowMs = 1_800_000_000_000;
  const timestamp = String(nowMs / 1000);
  const manifest = buildMercadoPagoManifest({
    dataId: "ORD01AbC",
    requestId: "request-123",
    timestamp,
  }, true);
  const signature = await hmacSha256Hex("webhook-secret", manifest);
  const result = await verifyMercadoPagoSignature({
    secret: "webhook-secret",
    signatureHeader: `ts=${timestamp},v1=${signature}`,
    requestId: "request-123",
    dataId: "ORD01AbC",
    nowMs,
  });
  assert.deepEqual(result, { valid: true, variant: "lowercase", reason: "valid" });
});

test("rejects stale and malformed Mercado Pago signatures", async () => {
  const stale = await verifyMercadoPagoSignature({
    secret: "webhook-secret",
    signatureHeader: `ts=1700000000,v1=${"ab".repeat(32)}`,
    requestId: "request-123",
    dataId: "ORD01AbC",
    nowMs: 1_800_000_000_000,
  });
  assert.equal(stale.reason, "timestamp_outside_window");

  const duplicate = await verifyMercadoPagoSignature({
    secret: "webhook-secret",
    signatureHeader: `ts=1800000000,ts=1800000000,v1=${"ab".repeat(32)}`,
    requestId: "request-123",
    dataId: "ORD01AbC",
    nowMs: 1_800_000_000_000,
  });
  assert.equal(duplicate.reason, "header_malformed");
});

test("maps only processed/accredited to a paid order", () => {
  assert.deepEqual(mapMercadoPagoOrderState("processed", "accredited"), {
    status: "paid",
    detail: "accredited",
    fulfillmentReady: true,
  });
  assert.equal(mapMercadoPagoOrderState("processed", "pending_review").status, "review");
  assert.equal(mapMercadoPagoOrderState("processed", "partially_refunded").status, "review");
  assert.equal(mapMercadoPagoOrderState("created", "created").status, "pending");
  assert.equal(mapMercadoPagoOrderState("refunded", "refunded").status, "refunded");
  assert.deepEqual(mapMercadoPagoOrderState("charged_back", "settled"), {
    status: "failed",
    detail: "charged_back",
    fulfillmentReady: false,
  });
});
