import { z } from "zod";
import type { CommerceConfiguration } from "@/lib/commerce-config";
import { trustedMercadoPagoCheckoutUrl } from "@/lib/mercado-pago-url";

const nonEmptyString = z.string().trim().min(1);
const scalarId = z.union([z.string().trim().min(1), z.number().int()]);

const mercadoPagoOrderSchema = z.object({
  id: nonEmptyString,
  status: nonEmptyString.nullish(),
  status_detail: nonEmptyString.nullish(),
  external_reference: nonEmptyString.nullish(),
  total_amount: z.union([nonEmptyString, z.number().finite()]).nullish(),
  currency: nonEmptyString.nullish(),
  checkout_url: nonEmptyString.nullish(),
  user_id: scalarId.nullish(),
  live_mode: z.boolean().nullish(),
  integration_data: z.object({
    application_id: scalarId.nullish(),
  }).passthrough().nullish(),
}).passthrough();

const mercadoPagoAccountSchema = z.object({
  id: scalarId,
}).passthrough();

const mercadoPagoOrderSearchSchema = z.object({
  data: z.array(mercadoPagoOrderSchema).max(100),
}).passthrough();

const mercadoPagoErrorSchema = z.object({
  errors: z.array(z.object({
    code: z.string().trim().max(100),
  }).passthrough()).min(1).optional(),
  code: z.string().trim().max(100).optional(),
}).passthrough();

export type MercadoPagoOrder = z.infer<typeof mercadoPagoOrderSchema>;

export class MercadoPagoHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly upstreamCode: string | null,
  ) {
    super(`mercado_pago_http_${status}`);
    this.name = "MercadoPagoHttpError";
  }
}

export class MercadoPagoResponseError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "MercadoPagoResponseError";
  }
}

export async function verifyMercadoPagoSeller(configuration: CommerceConfiguration) {
  const payload = await mercadoPagoJson(
    "https://api.mercadolibre.com/users/me",
    configuration.accessToken,
  );
  const account = mercadoPagoAccountSchema.parse(payload);
  if (String(account.id) !== configuration.sellerUserId) {
    throw new MercadoPagoResponseError("seller_account_mismatch");
  }
}

export async function createMercadoPagoOrder(input: {
  configuration: CommerceConfiguration;
  idempotencyKey: string;
  externalReference: string;
  buyerEmail: string;
  totalCents: number;
  returnToken: string;
  items: Array<{ title: string; quantity: number; unitPriceCents: number }>;
}) {
  const returnUrl = new URL("/checkout/retorno", input.configuration.publicSiteUrl);
  returnUrl.searchParams.set("order", input.externalReference);
  returnUrl.searchParams.set("token", input.returnToken);

  const payload = await mercadoPagoJson(
    "https://api.mercadopago.com/v1/orders",
    input.configuration.accessToken,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        type: "online",
        processing_mode: "manual",
        expiration_time: "P1D",
        total_amount: centsToDecimal(input.totalCents),
        external_reference: input.externalReference,
        payer: { email: input.buyerEmail },
        items: input.items.map((item) => ({
          title: item.title,
          quantity: item.quantity,
          unit_price: centsToDecimal(item.unitPriceCents),
        })),
        config: {
          online: {
            success_url: returnUrl.href,
            failure_url: returnUrl.href,
            pending_url: returnUrl.href,
            auto_return: "approved",
          },
        },
      }),
    },
  );
  return mercadoPagoOrderSchema.parse(payload);
}

export async function getMercadoPagoOrder(
  configuration: CommerceConfiguration,
  providerOrderId: string,
) {
  const payload = await mercadoPagoJson(
    `https://api.mercadopago.com/v1/orders/${encodeURIComponent(providerOrderId)}`,
    configuration.accessToken,
  );
  return mercadoPagoOrderSchema.parse(payload);
}

export async function searchMercadoPagoOrdersByExternalReference(
  configuration: CommerceConfiguration,
  externalReference: string,
  localCreatedAt: Date,
) {
  // Search requires an RFC 3339 interval. Keep it fixed around the immutable
  // local creation time so reconciliation still works months later and never
  // turns into an unbounded account-wide search.
  const beginDate = new Date(localCreatedAt.getTime() - 6 * 60 * 60 * 1000);
  const endDate = new Date(localCreatedAt.getTime() + 30 * 60 * 60 * 1000);
  const url = new URL("https://api.mercadopago.com/v1/orders");
  url.searchParams.set("begin_date", beginDate.toISOString());
  url.searchParams.set("end_date", endDate.toISOString());
  url.searchParams.set("external_reference", externalReference);
  url.searchParams.set("limit", "20");

  const payload = await mercadoPagoJson(url.href, configuration.accessToken);
  const result = mercadoPagoOrderSearchSchema.parse(payload);
  return result.data.filter((order) => order.external_reference === externalReference);
}

export async function cancelMercadoPagoOrder(
  configuration: CommerceConfiguration,
  providerOrderId: string,
  idempotencyKey: string,
) {
  const payload = await mercadoPagoJson(
    `https://api.mercadopago.com/v1/orders/${encodeURIComponent(providerOrderId)}/cancel`,
    configuration.accessToken,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
    },
  );
  return mercadoPagoOrderSchema.parse(payload);
}

export async function refundMercadoPagoOrder(
  configuration: CommerceConfiguration,
  providerOrderId: string,
  idempotencyKey: string,
) {
  const payload = await mercadoPagoJson(
    `https://api.mercadopago.com/v1/orders/${encodeURIComponent(providerOrderId)}/refund`,
    configuration.accessToken,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: "{}",
    },
  );
  return mercadoPagoOrderSchema.parse(payload);
}

export function validatedCheckoutUrl(order: MercadoPagoOrder) {
  const checkoutUrl = trustedMercadoPagoCheckoutUrl(order.checkout_url);
  if (!checkoutUrl) {
    throw new MercadoPagoResponseError("checkout_url_invalid");
  }
  return checkoutUrl;
}

export function decimalToCents(value: string | number | null | undefined) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    value = value.toFixed(2);
  }
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value ?? "");
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function centsToDecimal(cents: number) {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new TypeError("invalid_amount_cents");
  }
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

const definitiveCreateErrorCodes = new Set([
  "empty_required_header",
  "invalid_idempotency_key_length",
  "required_properties",
  "invalid_total_amount",
  "maximum_items",
  "unsupported_properties",
  "minimum_properties",
  "property_value",
  "property_type",
  "json_syntax_error",
  "invalid_email_for_sandbox",
]);

export function isDefinitiveMercadoPagoCreateRejection(error: unknown) {
  if (!(error instanceof MercadoPagoHttpError)) return false;
  if ([401, 403, 422].includes(error.status)) return true;
  return error.status === 400 &&
    error.upstreamCode !== null &&
    definitiveCreateErrorCodes.has(error.upstreamCode);
}

async function mercadoPagoJson(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  if (!response.ok) {
    let upstreamCode: string | null = null;
    try {
      const parsed = mercadoPagoErrorSchema.safeParse(await readBoundedJson(response, 64 * 1024));
      if (parsed.success) {
        upstreamCode = parsed.data.errors?.[0]?.code ?? parsed.data.code ?? null;
      }
    } catch {
      // The upstream status remains sufficient for safe diagnostics.
    }
    throw new MercadoPagoHttpError(response.status, upstreamCode);
  }
  return readBoundedJson(response, 128 * 1024);
}

export async function readBoundedJson(source: Request | Response, maxBytes: number) {
  if (!source.body) throw new Error("empty_json_body");
  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("json_body_too_large");
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
