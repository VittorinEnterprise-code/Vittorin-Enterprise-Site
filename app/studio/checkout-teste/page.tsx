import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PaymentTestClient } from "@/components/payment-test-client";
import { hasPaymentTestAccess } from "@/lib/payment-test";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout de teste · Estúdio",
  robots: { index: false, follow: false },
};

export default async function CheckoutTestPage() {
  if (!(await hasPaymentTestAccess())) {
    notFound();
  }

  return <PaymentTestClient />;
}
