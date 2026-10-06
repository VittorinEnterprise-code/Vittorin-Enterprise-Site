import type { Metadata } from "next";
import { CheckoutReturnClient } from "@/components/checkout-return-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Situação do pedido",
  description: "Acompanhe a confirmação segura do seu pagamento.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type CheckoutReturnPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? null : null;
}

export default async function CheckoutReturnPage({ searchParams }: CheckoutReturnPageProps) {
  const params = await searchParams;
  const orderId = firstSearchParam(params.order);
  const token = firstSearchParam(params.token);

  return <CheckoutReturnClient orderId={orderId} token={token} />;
}
