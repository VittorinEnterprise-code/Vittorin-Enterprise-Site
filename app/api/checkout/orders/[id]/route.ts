import { z } from "zod";
import { CommerceError, getPublicCommerceOrder } from "@/lib/commerce";
import { CommerceUnavailableError } from "@/lib/commerce-config";

const identifierSchema = z.string().uuid();
const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/i);

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const parsedId = identifierSchema.safeParse(id);
    const parsedToken = tokenSchema.safeParse(token);
    if (!parsedId.success || !parsedToken.success) {
      return json({ error: "Pedido não encontrado." }, 404);
    }
    const order = await getPublicCommerceOrder(parsedId.data, parsedToken.data);
    return json({ order });
  } catch (error) {
    if (error instanceof CommerceUnavailableError) {
      return json({ error: error.message }, error.status);
    }
    if (error instanceof CommerceError) {
      return json({ error: error.message }, error.status);
    }
    console.error(JSON.stringify({
      event: "commerce_order_status_route_failed",
      errorType: error instanceof Error ? error.name : "unknown",
    }));
    return json({ error: "Não foi possível consultar o pedido agora." }, 503);
  }
}
