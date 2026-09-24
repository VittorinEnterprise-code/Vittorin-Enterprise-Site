import { CommerceError, processMercadoPagoWebhook } from "@/lib/commerce";
import { CommerceUnavailableError } from "@/lib/commerce-config";

const MAX_WEBHOOK_BYTES = 64 * 1024;

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("Content-Type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      return json({ error: "Formato inválido." }, 415);
    }
    const contentLength = Number(request.headers.get("Content-Length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
      return json({ error: "Notificação muito grande." }, 413);
    }
    const dataId = new URL(request.url).searchParams.get("data.id")?.trim() ?? "";
    if (!dataId || dataId.length > 160) {
      return json({ error: "Notificação inválida." }, 400);
    }
    const rawBody = await readBoundedText(request, MAX_WEBHOOK_BYTES);
    const result = await processMercadoPagoWebhook({
      signatureHeader: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId,
      rawBody,
    });
    return json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    if (error instanceof CommerceUnavailableError) {
      return json({ error: "Notificação indisponível." }, error.status);
    }
    if (error instanceof CommerceError) {
      // A valid notification for another order in the same Mercado Pago app does
      // not need retries from the provider.
      if (error.code === "local_order_not_found") {
        return json({ received: true, ignored: true });
      }
      return json({ error: error.message }, error.status);
    }
    console.error(JSON.stringify({
      event: "mercado_pago_webhook_failed",
      errorType: error instanceof Error ? error.name : "unknown",
    }));
    return json({ error: "Falha temporária ao processar a notificação." }, 502);
  }
}

async function readBoundedText(request: Request, maxBytes: number) {
  if (!request.body) throw new CommerceError(400, "Notificação vazia.", "webhook_empty");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new CommerceError(413, "Notificação muito grande.", "webhook_too_large");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}
