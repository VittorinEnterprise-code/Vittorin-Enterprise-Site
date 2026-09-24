import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrdersAdminClient } from "@/components/orders-admin-client";
import { getAuthorizedAdmin } from "@/lib/admin";
import { listCommerceOrdersForAdmin } from "@/lib/commerce";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pedidos · Estúdio Vittorin",
  robots: { index: false, follow: false },
};

export default async function OrdersPage() {
  const access = await getAuthorizedAdmin();
  if (access.reason) notFound();

  let orders: Awaited<ReturnType<typeof listCommerceOrdersForAdmin>> = [];
  let loadError = "";
  try {
    orders = await listCommerceOrdersForAdmin();
  } catch (error) {
    console.error(JSON.stringify({
      event: "studio_orders_load_failed",
      errorType: error instanceof Error ? error.name : "unknown",
    }));
    loadError = "Não foi possível carregar os pedidos agora.";
  }

  return (
    <OrdersAdminClient
      initialOrders={orders.map((order) => ({
        ...order,
        createdAt: order.createdAt.getTime(),
        updatedAt: order.updatedAt.getTime(),
      }))}
      loadError={loadError}
    />
  );
}
