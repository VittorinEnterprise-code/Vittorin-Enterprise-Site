import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { ensureDatabaseSchema, getDb } from "@/db";
import { paymentTestOrders } from "@/db/schema";
import { ADMIN_EMAIL, getAuthorizedAdmin } from "@/lib/admin";

// This item exists only in the private validation flow. It is not a storefront product.
export const TEST_PRODUCT = {
  name: "Produto fictício — teste de pagamento",
  amount: "10.00",
  currency: "BRL",
} as const;

type TestOrderRow = typeof paymentTestOrders.$inferSelect;

export class PaymentTestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const accountSchema = z.object({
  id: z.union([z.number().int(), z.string().min(1)]),
  email: z.string().email(),
});

const orderSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  status_detail: z.string().min(1),
  external_reference: z.string().min(1),
  total_amount: z.string().min(1),
  currency: z.string().min(1),
  checkout_url: z.string().url().optional(),
});

export function isPaymentTestConfigured() {
  return isPaymentTestEnvironment() && Boolean(
    env.DB &&
      env.MP_TEST_ACCESS_TOKEN?.trim() &&
      env.MP_TEST_SELLER_USER_ID?.trim(),
  );
}

export function isPaymentTestEnvironment() {
  return env.DEPLOYMENT_ENV === "staging" &&
    env.PAYMENT_TEST_ENABLED === "1" &&
    env.SITES_VALIDATION_AUTH !== "1";
}

export async function hasPaymentTestAccess() {
  if (!isPaymentTestEnvironment()) return false;
  const access = await getAuthorizedAdmin();
  return !access.reason && access.user.email.trim().toLowerCase() === ADMIN_EMAIL;
}

export function toPublicTestOrder(row: TestOrderRow) {
  return {
    id: row.id,
    mpOrderId: row.mpOrderId,
    status: row.status,
    statusDetail: row.statusDetail,
    checkoutUrl: row.checkoutUrl,
    createdAt: row.createdAt.getTime(),
  };
}

export async function listPaymentTestOrders() {
  await ensureDatabaseSchema();
  const rows = await getDb()
    .select()
    .from(paymentTestOrders)
    .orderBy(desc(paymentTestOrders.createdAt))
    .limit(10);
  return rows.map(toPublicTestOrder);
}

export async function createPaymentTestOrder(buyerEmail: string | null) {
  const token = getTestToken();
  await verifyTestSeller(token);
  await ensureDatabaseSchema();

  const id = crypto.randomUUID();
  const now = new Date();
  const db = getDb();
  await db.insert(paymentTestOrders).values({
    id,
    mpOrderId: null,
    buyerEmail,
    productName: TEST_PRODUCT.name,
    amount: TEST_PRODUCT.amount,
    currency: TEST_PRODUCT.currency,
    status: "creating",
    statusDetail: "creating",
    checkoutUrl: null,
    createdAt: now,
    updatedAt: now,
  });

  try {
    const payload = await mercadoPagoJson("https://api.mercadopago.com/v1/orders", token, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": id,
      },
      body: JSON.stringify({
        type: "online",
        processing_mode: "manual",
        total_amount: TEST_PRODUCT.amount,
        external_reference: id,
        ...(buyerEmail ? { payer: { email: buyerEmail } } : {}),
        items: [{
          title: TEST_PRODUCT.name,
          unit_price: TEST_PRODUCT.amount,
          quantity: 1,
          unit_measure: "unit",
          total_amount: TEST_PRODUCT.amount,
        }],
      }),
    });
    const order = orderSchema.parse(payload);
    if (
      order.external_reference !== id ||
      !matchesProduct(order.total_amount, order.currency) ||
      !order.checkout_url ||
      !isMercadoPagoCheckoutUrl(order.checkout_url)
    ) {
      throw new Error("mercado_pago_test_order_mismatch");
    }

    const updatedAt = new Date();
    await db.update(paymentTestOrders).set({
      mpOrderId: order.id,
      status: order.status,
      statusDetail: order.status_detail,
      checkoutUrl: order.checkout_url,
      updatedAt,
    }).where(eq(paymentTestOrders.id, id));

    return toPublicTestOrder({
      id,
      mpOrderId: order.id,
      buyerEmail,
      productName: TEST_PRODUCT.name,
      amount: TEST_PRODUCT.amount,
      currency: TEST_PRODUCT.currency,
      status: order.status,
      statusDetail: order.status_detail,
      checkoutUrl: order.checkout_url,
      createdAt: now,
      updatedAt,
    });
  } catch (error) {
    // An HTTP timeout can leave the remote result uncertain; never retry with a new
    // idempotency key automatically or describe this as a confirmed failure.
    await db.update(paymentTestOrders).set({
      status: "creation_uncertain",
      statusDetail: "check_mercado_pago",
      updatedAt: new Date(),
    }).where(eq(paymentTestOrders.id, id));
    console.error("mercado_pago_test_order_create_failed", error instanceof Error ? error.name : "unknown");
    throw new PaymentTestError(
      502,
      "Não foi possível confirmar a criação da ordem de teste. Confira sua conta Mercado Pago antes de tentar novamente.",
    );
  }
}

export async function refreshPaymentTestOrder(id: string) {
  const token = getTestToken();
  await ensureDatabaseSchema();
  const db = getDb();
  const row = await db.select().from(paymentTestOrders)
    .where(eq(paymentTestOrders.id, id)).get();
  if (!row) throw new PaymentTestError(404, "Ordem de teste não encontrada.");
  if (!row.mpOrderId) {
    throw new PaymentTestError(409, "Esta ordem ainda não pode ser consultada automaticamente.");
  }

  try {
    const payload = await mercadoPagoJson(
      "https://api.mercadopago.com/v1/orders/" + encodeURIComponent(row.mpOrderId),
      token,
    );
    const order = orderSchema.parse(payload);
    if (
      order.id !== row.mpOrderId ||
      order.external_reference !== row.id ||
      !matchesProduct(order.total_amount, order.currency)
    ) {
      throw new Error("mercado_pago_test_status_mismatch");
    }
    const updatedAt = new Date();
    await db.update(paymentTestOrders).set({
      status: order.status,
      statusDetail: order.status_detail,
      updatedAt,
    }).where(eq(paymentTestOrders.id, id));
    return toPublicTestOrder({ ...row, status: order.status, statusDetail: order.status_detail, updatedAt });
  } catch (error) {
    console.error("mercado_pago_test_status_failed", error instanceof Error ? error.name : "unknown");
    throw new PaymentTestError(502, "Não foi possível confirmar o estado da ordem no Mercado Pago.");
  }
}

function getTestToken() {
  if (!isPaymentTestConfigured()) {
    throw new PaymentTestError(503, "O ambiente de pagamento de teste ainda não foi configurado.");
  }
  return env.MP_TEST_ACCESS_TOKEN!.trim();
}

async function verifyTestSeller(token: string) {
  try {
    // Both test and production tokens may start with APP_USR. Compare the actual
    // authenticated account before any POST that could accidentally charge money.
    const payload = await mercadoPagoJson("https://api.mercadolibre.com/users/me", token);
    const account = accountSchema.parse(payload);
    if (
      String(account.id) !== env.MP_TEST_SELLER_USER_ID?.trim() ||
      !account.email.toLowerCase().endsWith("@testuser.com")
    ) {
      throw new Error("unexpected_mercado_pago_seller");
    }
  } catch (error) {
    console.error("mercado_pago_test_seller_verification_failed", error instanceof Error ? error.name : "unknown");
    throw new PaymentTestError(
      503,
      "Não foi possível confirmar que a chave pertence ao vendedor de teste. Nenhuma cobrança foi iniciada.",
    );
  }
}

async function mercadoPagoJson(url: string, token: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: "Bearer " + token,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("mercado_pago_http_" + response.status);
  return readBoundedJson(response, 64 * 1024);
}

export async function readBoundedJson(response: Request | Response, maxBytes: number): Promise<unknown> {
  if (!response.body) throw new Error("empty_mercado_pago_response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("oversized_mercado_pago_response");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

function matchesProduct(amount: string, currency: string) {
  return currency === TEST_PRODUCT.currency && decimalCents(amount) === BigInt(1000);
}

function decimalCents(amount: string) {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) return null;
  return BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"));
}

function isMercadoPagoCheckoutUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "mercadopago.com.br" || url.hostname.endsWith(".mercadopago.com.br"));
  } catch {
    return false;
  }
}
