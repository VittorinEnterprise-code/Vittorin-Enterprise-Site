import { z } from "zod";
import { getAuthorizedAdmin } from "@/lib/admin";
import {
  cancelCommerceOrder,
  CommerceError,
  completeCommerceFulfillment,
  refreshCommerceOrder,
  refundCommerceOrder,
} from "@/lib/commerce";
import { CommerceUnavailableError } from "@/lib/commerce-config";
import { readBoundedJson } from "@/lib/mercado-pago";

const identifierSchema = z.string().uuid();
const actionSchema = z.object({
  action: z.enum(["refresh", "cancel", "refund", "complete"]),
});

function json(body: object, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await getAuthorizedAdmin();
  if (access.reason) return json({ error: "Não autorizado." }, 401);
  if (
    request.headers.get("Origin") !== new URL(request.url).origin ||
    request.headers.get("X-Studio-Request") !== "1" ||
    !(request.headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/json")
  ) {
    return json({ error: "Solicitação inválida." }, 403);
  }

  try {
    const parsedId = identifierSchema.safeParse((await context.params).id);
    const parsedAction = actionSchema.safeParse(await readBoundedJson(request, 1024));
    if (!parsedId.success || !parsedAction.success) {
      return json({ error: "Ação inválida." }, 400);
    }
    const order = await ({
      refresh: refreshCommerceOrder,
      cancel: cancelCommerceOrder,
      refund: refundCommerceOrder,
      complete: completeCommerceFulfillment,
    } as const)[parsedAction.data.action](parsedId.data);
    return json({ order });
  } catch (error) {
    if (error instanceof CommerceUnavailableError) {
      return json({ error: error.message }, error.status);
    }
    if (error instanceof CommerceError) {
      return json({ error: error.message, code: error.code }, error.status);
    }
    console.error(JSON.stringify({
      event: "studio_order_action_failed",
      errorType: error instanceof Error ? error.name : "unknown",
    }));
    return json({ error: "Não foi possível concluir a ação agora." }, 502);
  }
}
