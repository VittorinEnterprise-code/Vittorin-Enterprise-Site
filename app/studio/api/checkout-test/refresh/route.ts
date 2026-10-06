import { z } from "zod";
import {
  hasPaymentTestAccess,
  PaymentTestError,
  readBoundedJson,
  refreshPaymentTestOrder,
} from "@/lib/payment-test";

const refreshSchema = z.object({ id: z.string().uuid() });

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!(await hasPaymentTestAccess())) return json({ error: "Não encontrado." }, 404);
  const origin = request.headers.get("Origin");
  const contentType = request.headers.get("Content-Type") ?? "";
  if (
    origin !== new URL(request.url).origin ||
    request.headers.get("X-Checkout-Test") !== "1" ||
    !contentType.startsWith("application/json")
  ) {
    return json({ error: "Solicitação inválida." }, 403);
  }

  try {
    const input = refreshSchema.safeParse(await readBoundedJson(request, 1024));
    if (!input.success) return json({ error: "Identificador inválido." }, 400);
    const order = await refreshPaymentTestOrder(input.data.id);
    return json({ order });
  } catch (error) {
    if (error instanceof PaymentTestError) return json({ error: error.message }, error.status);
    console.error("payment_test_refresh_failed", error instanceof Error ? error.name : "unknown");
    return json({ error: "Não foi possível atualizar a ordem de teste." }, 503);
  }
}
