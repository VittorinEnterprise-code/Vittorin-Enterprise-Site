import { z } from "zod";
import {
  createPaymentTestOrder,
  hasPaymentTestAccess,
  isPaymentTestConfigured,
  listPaymentTestOrders,
  PaymentTestError,
  readBoundedJson,
  TEST_PRODUCT,
} from "@/lib/payment-test";

const createSchema = z.object({
  buyerEmail: z.string().trim().email().max(254)
    .refine((email) => email.toLowerCase().endsWith("@testuser.com")),
});

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isSameOriginPost(request: Request) {
  const origin = request.headers.get("Origin");
  const contentType = request.headers.get("Content-Type") ?? "";
  return origin === new URL(request.url).origin &&
    request.headers.get("X-Checkout-Test") === "1" &&
    contentType.startsWith("application/json");
}

export async function GET() {
  if (!(await hasPaymentTestAccess())) return json({ error: "Não encontrado." }, 404);
  try {
    return json({
      configured: isPaymentTestConfigured(),
      product: TEST_PRODUCT,
      orders: await listPaymentTestOrders(),
    });
  } catch (error) {
    console.error("payment_test_list_failed", error instanceof Error ? error.name : "unknown");
    return json({ error: "Não foi possível carregar os pedidos de teste." }, 503);
  }
}

export async function POST(request: Request) {
  if (!(await hasPaymentTestAccess())) return json({ error: "Não encontrado." }, 404);
  if (!isSameOriginPost(request)) return json({ error: "Solicitação inválida." }, 403);

  try {
    const input = createSchema.safeParse(await readBoundedJson(request, 1024));
    if (!input.success) {
      return json({ error: "Informe o e-mail da conta compradora de teste, terminado em @testuser.com." }, 400);
    }
    const order = await createPaymentTestOrder(input.data.buyerEmail);
    return json({ order }, 201);
  } catch (error) {
    if (error instanceof PaymentTestError) return json({ error: error.message }, error.status);
    console.error("payment_test_create_failed", error instanceof Error ? error.name : "unknown");
    return json({ error: "Não foi possível iniciar a ordem de teste." }, 503);
  }
}
