import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { ensureDatabaseSchema, getDb } from "@/db";
import { paymentTestOrders } from "@/db/schema";
import { ADMIN_EMAIL, getAuthorizedAdmin } from "@/lib/admin";
import { trustedMercadoPagoCheckoutUrl } from "@/lib/mercado-pago-url";

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
    this.name = "PaymentTestError";
  }
}

class MercadoPagoHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly upstreamCode: string | null,
  ) {
    super("mercado_pago_http_" + status);
    this.name = "MercadoPagoHttpError";
  }
}

class MercadoPagoResponseError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "MercadoPagoResponseError";
  }
}

const accountSchema = z.object({
  id: z.union([z.number().int(), z.string().min(1)]),
  email: z.string().email(),
});

const nonEmptyString = z.string().trim().min(1);

const orderSchema = z.object({
  id: nonEmptyString.nullish(),
  status: nonEmptyString.nullish(),
  status_detail: nonEmptyString.nullish(),
  external_reference: nonEmptyString.nullish(),
  total_amount: nonEmptyString.nullish(),
  currency: nonEmptyString.nullish(),
  checkout_url: nonEmptyString.nullish(),
}).passthrough();

const mercadoPagoErrorSchema = z.object({
  errors: z.array(z.object({
    code: z.string().regex(/^[a-z0-9_]{1,100}$/),
  })).min(1),
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

export async function createPaymentTestOrder(buyerEmail: string) {
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
        payer: { email: buyerEmail },
        items: [{
          title: TEST_PRODUCT.name,
          unit_price: TEST_PRODUCT.amount,
          quantity: 1,
        }],
      }),
    });
    const order = orderSchema.parse(payload);
    if (!order.id) {
      throw new MercadoPagoResponseError("response_order_id_missing");
    }
    if (order.external_reference && order.external_reference !== id) {
      throw new MercadoPagoResponseError("response_reference_mismatch");
    }
    if (
      order.total_amount &&
      decimalCents(order.total_amount) !== BigInt(1000)
    ) {
      throw new MercadoPagoResponseError("response_amount_mismatch");
    }
    if (order.currency && order.currency !== TEST_PRODUCT.currency) {
      throw new MercadoPagoResponseError("response_currency_mismatch");
    }
    const status = order.status ?? "created";
    const statusDetail = order.status_detail ?? status;

    // Preserve the remote ID as soon as the 201 response is tied safely to this
    // request. If the checkout link is absent, the order can still be queried.
    await db.update(paymentTestOrders).set({
      mpOrderId: order.id,
      updatedAt: new Date(),
    }).where(eq(paymentTestOrders.id, id));

    if (!order.checkout_url) {
      throw new MercadoPagoResponseError("response_checkout_url_missing");
    }
    const checkoutUrl = trustedMercadoPagoCheckoutUrl(order.checkout_url);
    if (!checkoutUrl) {
      throw new MercadoPagoResponseError("response_checkout_url_untrusted");
    }

    const updatedAt = new Date();
    await db.update(paymentTestOrders).set({
      mpOrderId: order.id,
      status,
      statusDetail,
      checkoutUrl,
      updatedAt,
    }).where(eq(paymentTestOrders.id, id));

    return toPublicTestOrder({
      id,
      mpOrderId: order.id,
      buyerEmail,
      productName: TEST_PRODUCT.name,
      amount: TEST_PRODUCT.amount,
      currency: TEST_PRODUCT.currency,
      status,
      statusDetail,
      checkoutUrl,
      createdAt: now,
      updatedAt,
    });
  } catch (error) {
    if (isDefinitiveCreateRejection(error)) {
      await db.update(paymentTestOrders).set({
        status: "creation_failed",
        statusDetail: error.upstreamCode ?? "mercado_pago_http_" + error.status,
        updatedAt: new Date(),
      }).where(eq(paymentTestOrders.id, id));
      console.error(JSON.stringify({
        event: "mercado_pago_test_order_rejected",
        upstreamStatus: error.status,
        upstreamCode: error.upstreamCode,
      }));
      throw createRejectionError(error);
    }

    // An HTTP timeout can leave the remote result uncertain; never retry with a new
    // idempotency key automatically or describe this as a confirmed failure.
    const failureReason = uncertainCreateReason(error);
    await db.update(paymentTestOrders).set({
      status: "creation_uncertain",
      statusDetail: failureReason,
      updatedAt: new Date(),
    }).where(eq(paymentTestOrders.id, id));
    console.error(JSON.stringify({
      event: "mercado_pago_test_order_create_failed",
      errorType: error instanceof Error ? error.name : "unknown",
      reason: failureReason,
      ...safeFailureDiagnostics(error),
    }));
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
    if (order.id && order.id !== row.mpOrderId) {
      throw new MercadoPagoResponseError("response_order_id_mismatch");
    }
    if (order.external_reference && order.external_reference !== row.id) {
      throw new MercadoPagoResponseError("response_reference_mismatch");
    }
    if (
      order.total_amount &&
      decimalCents(order.total_amount) !== BigInt(1000)
    ) {
      throw new MercadoPagoResponseError("response_amount_mismatch");
    }
    if (order.currency && order.currency !== TEST_PRODUCT.currency) {
      throw new MercadoPagoResponseError("response_currency_mismatch");
    }
    if (!order.status) {
      throw new MercadoPagoResponseError("response_status_missing");
    }
    const statusDetail = order.status_detail ?? order.status;
    const updatedAt = new Date();
    await db.update(paymentTestOrders).set({
      status: order.status,
      statusDetail,
      updatedAt,
    }).where(eq(paymentTestOrders.id, id));
    return toPublicTestOrder({ ...row, status: order.status, statusDetail, updatedAt });
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
  if (!response.ok) {
    let upstreamCode: string | null = null;
    try {
      const parsed = mercadoPagoErrorSchema.safeParse(await readBoundedJson(response, 64 * 1024));
      if (parsed.success) upstreamCode = parsed.data.errors[0].code;
    } catch {
      // The HTTP status still identifies the upstream failure when its body is absent or malformed.
    }
    throw new MercadoPagoHttpError(response.status, upstreamCode);
  }
  return readBoundedJson(response, 64 * 1024);
}

function isDefinitiveCreateRejection(error: unknown): error is MercadoPagoHttpError {
  return error instanceof MercadoPagoHttpError &&
    (error.status === 400 || error.status === 401 || error.status === 403 || error.status === 422);
}

function createRejectionError(error: MercadoPagoHttpError) {
  if (error.upstreamCode === "invalid_email_for_sandbox") {
    return new PaymentTestError(
      400,
      "Use um e-mail de sandbox terminado em @testuser.com, como test@testuser.com.",
    );
  }
  if (error.status === 401 || error.status === 403) {
    return new PaymentTestError(
      503,
      "O Mercado Pago recusou a credencial de teste. Nenhuma cobrança foi iniciada.",
    );
  }
  return new PaymentTestError(
    502,
    "O Mercado Pago recusou os dados da ordem de teste. Nenhuma cobrança foi iniciada.",
  );
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

function decimalCents(amount: string) {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) return null;
  return BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"));
}

function uncertainCreateReason(error: unknown) {
  if (error instanceof MercadoPagoResponseError) return error.reason;
  if (error instanceof MercadoPagoHttpError) {
    return error.upstreamCode ?? "mercado_pago_http_" + error.status;
  }
  if (error instanceof z.ZodError) return "mercado_pago_response_schema";
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return "mercado_pago_timeout";
  }
  return "check_mercado_pago";
}

function safeFailureDiagnostics(error: unknown) {
  if (error instanceof MercadoPagoHttpError) {
    return {
      upstreamStatus: error.status,
      upstreamCode: error.upstreamCode,
    };
  }
  if (error instanceof z.ZodError) {
    return {
      schemaIssues: error.issues.slice(0, 10).map((issue) => ({
        path: issue.path.slice(0, 8).map((part) =>
          typeof part === "number" ? part : part.slice(0, 64)
        ),
        code: issue.code,
        expected: issue.code === z.ZodIssueCode.invalid_type ? issue.expected : null,
        received: issue.code === z.ZodIssueCode.invalid_type ? issue.received : null,
      })),
    };
  }
  return {};
}
