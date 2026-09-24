import { z } from "zod";
import {
  CommerceError,
  createCommerceOrder,
} from "@/lib/commerce";
import {
  CommerceUnavailableError,
  requireNewOrderConfiguration,
} from "@/lib/commerce-config";
import { readBoundedJson } from "@/lib/mercado-pago";

const createOrderSchema = z.object({
  requestId: z.string().uuid(),
  email: z.string().trim().email().max(254),
  items: z.array(z.object({
    productId: z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/),
    quantity: z.number().int().min(1).max(10),
  })).min(1).max(10),
}).superRefine((input, context) => {
  const ids = new Set<string>();
  input.items.forEach((item, index) => {
    if (ids.has(item.productId)) {
      context.addIssue({
        code: "custom",
        path: ["items", index, "productId"],
        message: "Cada produto deve aparecer apenas uma vez.",
      });
    }
    ids.add(item.productId);
  });
});

function json(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  try {
    const configuration = requireNewOrderConfiguration();
    const contentType = request.headers.get("Content-Type") ?? "";
    if (
      request.headers.get("Origin") !== configuration.publicSiteUrl ||
      request.headers.get("X-Checkout-Request") !== "1" ||
      !contentType.toLowerCase().startsWith("application/json")
    ) {
      return json({ error: "Solicitação inválida." }, 403);
    }

    const parsed = createOrderSchema.safeParse(await readBoundedJson(request, 8 * 1024));
    if (!parsed.success) {
      return json({ error: "Revise o e-mail, o produto e a quantidade." }, 400);
    }

    const order = await createCommerceOrder(parsed.data);
    return json({ order }, 201);
  } catch (error) {
    if (error instanceof CommerceUnavailableError) {
      return json({ error: error.message }, error.status);
    }
    if (error instanceof CommerceError) {
      return json({ error: error.message, code: error.code }, error.status);
    }
    console.error(JSON.stringify({
      event: "commerce_checkout_route_failed",
      errorType: error instanceof Error ? error.name : "unknown",
    }));
    return json({ error: "Não foi possível iniciar o pagamento agora." }, 503);
  }
}
