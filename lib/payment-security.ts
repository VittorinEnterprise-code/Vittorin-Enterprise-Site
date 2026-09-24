const encoder = new TextEncoder();

function bytesToHex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(value: string) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

export function timingSafeHexEqual(left: string, right: string) {
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  const validLeft = /^[0-9a-f]{64}$/.test(normalizedLeft);
  const validRight = /^[0-9a-f]{64}$/.test(normalizedRight);
  let difference = Number(!(validLeft && validRight));

  // Keep the loop length fixed even for malformed input. Web Crypto produces the
  // expected value; this comparison avoids returning at the first mismatched byte.
  for (let index = 0; index < 64; index += 1) {
    difference |= (normalizedLeft.charCodeAt(index) || 0) ^
      (normalizedRight.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function buildMercadoPagoManifest(
  input: { dataId: string; requestId: string; timestamp: string },
  normalizeDataId = false,
) {
  const dataId = normalizeDataId ? input.dataId.toLowerCase() : input.dataId;
  return `id:${dataId};request-id:${input.requestId};ts:${input.timestamp};`;
}

export type MercadoPagoSignatureResult = {
  valid: boolean;
  variant: "raw" | "lowercase" | null;
  reason:
    | "valid"
    | "header_missing"
    | "header_malformed"
    | "timestamp_outside_window"
    | "signature_mismatch";
};

export async function verifyMercadoPagoSignature(input: {
  secret: string;
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string;
  nowMs?: number;
  toleranceSeconds?: number;
}): Promise<MercadoPagoSignatureResult> {
  if (!input.signatureHeader || !input.requestId || !input.dataId || !input.secret) {
    return { valid: false, variant: null, reason: "header_missing" };
  }

  const values = new Map<string, string>();
  for (const part of input.signatureHeader.split(",")) {
    const separator = part.indexOf("=");
    if (separator <= 0) {
      return { valid: false, variant: null, reason: "header_malformed" };
    }
    const key = part.slice(0, separator).trim().toLowerCase();
    const value = part.slice(separator + 1).trim();
    if (!key || !value || values.has(key)) {
      return { valid: false, variant: null, reason: "header_malformed" };
    }
    values.set(key, value);
  }

  const timestamp = values.get("ts");
  const providedSignature = values.get("v1")?.toLowerCase();
  if (
    !timestamp ||
    !providedSignature ||
    !/^\d{10,13}$/.test(timestamp) ||
    !/^[0-9a-f]{64}$/.test(providedSignature)
  ) {
    return { valid: false, variant: null, reason: "header_malformed" };
  }

  const timestampNumber = Number(timestamp);
  const timestampMs = timestamp.length === 13 ? timestampNumber : timestampNumber * 1000;
  const toleranceMs = (input.toleranceSeconds ?? 300) * 1000;
  if (
    !Number.isSafeInteger(timestampNumber) ||
    Math.abs((input.nowMs ?? Date.now()) - timestampMs) > toleranceMs
  ) {
    return { valid: false, variant: null, reason: "timestamp_outside_window" };
  }

  const manifestInput = {
    dataId: input.dataId,
    requestId: input.requestId,
    timestamp,
  };
  const rawSignature = await hmacSha256Hex(
    input.secret,
    buildMercadoPagoManifest(manifestInput),
  );
  if (timingSafeHexEqual(rawSignature, providedSignature)) {
    return { valid: true, variant: "raw", reason: "valid" };
  }

  // Mercado Pago's notification documentation historically lower-cased data.id,
  // while ORD identifiers can be case-sensitive. Accept either documented form,
  // but always with the same verified secret and request metadata.
  const lowerSignature = await hmacSha256Hex(
    input.secret,
    buildMercadoPagoManifest(manifestInput, true),
  );
  if (timingSafeHexEqual(lowerSignature, providedSignature)) {
    return { valid: true, variant: "lowercase", reason: "valid" };
  }

  return { valid: false, variant: null, reason: "signature_mismatch" };
}

export type LocalPaymentState =
  | "pending"
  | "paid"
  | "failed"
  | "review"
  | "cancelled"
  | "refunded";

export function mapMercadoPagoOrderState(status?: string | null, statusDetail?: string | null) {
  const normalizedStatus = status?.trim().toLowerCase() || "unknown";
  const normalizedDetail = statusDetail?.trim().toLowerCase() || normalizedStatus;

  if (normalizedStatus === "processed" && normalizedDetail === "accredited") {
    return { status: "paid" as const, detail: normalizedDetail, fulfillmentReady: true };
  }
  if (normalizedStatus === "refunded" || normalizedDetail === "refunded") {
    return { status: "refunded" as const, detail: normalizedDetail, fulfillmentReady: false };
  }
  if (["cancelled", "canceled"].includes(normalizedStatus)) {
    return { status: "cancelled" as const, detail: normalizedDetail, fulfillmentReady: false };
  }
  if (normalizedStatus === "charged_back" || normalizedDetail === "charged_back") {
    return { status: "failed" as const, detail: "charged_back", fulfillmentReady: false };
  }
  if (
    ["failed", "rejected"].includes(normalizedStatus) ||
    ["failed", "rejected"].includes(normalizedDetail)
  ) {
    return { status: "failed" as const, detail: normalizedDetail, fulfillmentReady: false };
  }
  if (["created", "action_required", "processing", "pending", "in_process"].includes(normalizedStatus)) {
    return { status: "pending" as const, detail: normalizedDetail, fulfillmentReady: false };
  }
  return { status: "review" as const, detail: normalizedDetail, fulfillmentReady: false };
}
