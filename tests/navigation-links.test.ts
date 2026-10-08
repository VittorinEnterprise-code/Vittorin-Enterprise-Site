import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("critical cross-page navigation uses full document requests", () => {
  const studio = source("components/studio-client.tsx");
  const orders = source("components/orders-admin-client.tsx");
  const checkout = source("components/checkout-client.tsx");
  const checkoutReturn = source("components/checkout-return-client.tsx");
  const paymentTest = source("components/payment-test-client.tsx");

  for (const component of [studio, orders, checkout, checkoutReturn, paymentTest]) {
    assert.doesNotMatch(component, /from ["']next\/link["']/);
  }

  assert.match(studio, /<a href="\/studio\/pedidos">/);
  assert.match(studio, /<a href="\/" className="studio-back">/);
  assert.match(orders, /<a href="\/studio"/);
  assert.match(checkout, /<a\s+href="\/"/);
  assert.match(checkoutReturn, /<a\s+href="\/"/);
  assert.match(paymentTest, /<a href="\/studio"/);
});
