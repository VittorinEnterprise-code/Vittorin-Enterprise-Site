import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckoutClient } from "@/components/checkout-client";
import {
  getPublicCheckoutProductBySlug,
  isProductionCommerceEnabled,
} from "@/lib/commerce";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Finalizar compra",
  description: "Finalize sua compra com pagamento seguro.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type CheckoutPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { slug } = await params;
  const [product, commerceEnabled] = await Promise.all([
    getPublicCheckoutProductBySlug(slug),
    isProductionCommerceEnabled(),
  ]);

  if (!product) notFound();

  return <CheckoutClient product={product} commerceEnabled={commerceEnabled} />;
}
