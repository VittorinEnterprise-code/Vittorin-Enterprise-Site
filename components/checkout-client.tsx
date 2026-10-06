"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  LockKeyhole,
  Minus,
  Plus,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PublicCheckoutProduct } from "@/lib/commerce";

const MAX_QUANTITY_PER_ORDER = 10;
const CHECKOUT_TIMEOUT_MS = 20_000;
const PENDING_ATTEMPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type CreatedOrder = {
  id: string;
  status: string;
  statusDetail: string;
  checkoutUrl: string;
  publicToken: string;
  createdAt: number;
  totalCents: number;
  currency: string;
};

type CheckoutResponse = {
  order: CreatedOrder;
};

type CheckoutClientProps = {
  product: PublicCheckoutProduct;
  commerceEnabled: boolean;
};

function formatCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function trustedMercadoPagoUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const trustedHostname =
      hostname === "mercadopago.com" ||
      hostname.endsWith(".mercadopago.com") ||
      hostname === "mercadopago.com.br" ||
      hostname.endsWith(".mercadopago.com.br");

    return url.protocol === "https:" && trustedHostname ? url.toString() : null;
  } catch {
    return null;
  }
}

function isCreatedOrder(value: unknown): value is CreatedOrder {
  if (!value || typeof value !== "object") return false;
  const order = value as Record<string, unknown>;

  return (
    typeof order.id === "string" &&
    typeof order.status === "string" &&
    typeof order.statusDetail === "string" &&
    typeof order.checkoutUrl === "string" &&
    typeof order.publicToken === "string" &&
    typeof order.createdAt === "number" &&
    typeof order.totalCents === "number" &&
    typeof order.currency === "string"
  );
}

async function readError(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | { error?: unknown; code?: unknown }
    | null;

  return {
    message: typeof payload?.error === "string" && payload.error
      ? payload.error
      : "Não foi possível iniciar o pagamento. Tente novamente.",
    code: typeof payload?.code === "string" ? payload.code : null,
  };
}

const definitiveOrderErrors = new Set([
  "amount_invalid",
  "idempotency_conflict",
  "insufficient_stock",
  "previous_attempt_failed",
  "product_changed",
  "product_unavailable",
  "provider_rejected",
]);

function removePendingAttempt(storageKey: string) {
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}

export function CheckoutClient({ product, commerceEnabled }: CheckoutClientProps) {
  const finiteStock =
    product.inventoryMode === "finite"
      ? Math.max(0, Math.trunc(product.stockQuantity))
      : null;
  const soldOut = finiteStock === 0;
  const maximumQuantity = Math.max(
    1,
    Math.min(MAX_QUANTITY_PER_ORDER, finiteStock ?? MAX_QUANTITY_PER_ORDER),
  );

  const [email, setEmail] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef<string | null>(null);
  const pendingStorageKey = `vittorin:checkout-pending:${product.id}`;

  const totalCents = product.priceCents * quantity;

  useEffect(() => {
    let restorationTimer: number | null = null;
    try {
      const raw = window.sessionStorage.getItem(pendingStorageKey);
      if (!raw) return;
      const pending = JSON.parse(raw) as Partial<{
        requestId: string;
        email: string;
        quantity: number;
        createdAt: number;
      }>;
      const valid = typeof pending.requestId === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pending.requestId) &&
        typeof pending.email === "string" && pending.email.length <= 254 &&
        Number.isInteger(pending.quantity) && (pending.quantity ?? 0) >= 1 &&
        (pending.quantity ?? 0) <= maximumQuantity &&
        typeof pending.createdAt === "number" &&
        Date.now() - pending.createdAt <= PENDING_ATTEMPT_MAX_AGE_MS;
      if (!valid) {
        removePendingAttempt(pendingStorageKey);
        return;
      }
      restorationTimer = window.setTimeout(() => {
        requestIdRef.current = pending.requestId ?? null;
        setEmail(pending.email ?? "");
        setQuantity(pending.quantity ?? 1);
      }, 0);
    } catch {
      removePendingAttempt(pendingStorageKey);
    }
    return () => {
      if (restorationTimer !== null) window.clearTimeout(restorationTimer);
    };
  }, [maximumQuantity, pendingStorageKey]);

  const invalidateRequest = () => {
    requestIdRef.current = null;
    removePendingAttempt(pendingStorageKey);
    setError("");
  };

  const updateQuantity = (nextQuantity: number) => {
    invalidateRequest();
    setQuantity(Math.min(maximumQuantity, Math.max(1, Math.trunc(nextQuantity) || 1)));
  };

  const createOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!commerceEnabled || soldOut || submitting) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || normalizedEmail.length > 254) {
      setError("Informe um e-mail válido para continuar.");
      return;
    }

    setSubmitting(true);
    setError("");

    const requestId = requestIdRef.current ?? crypto.randomUUID();
    requestIdRef.current = requestId;
    try {
      window.sessionStorage.setItem(pendingStorageKey, JSON.stringify({
        requestId,
        email: normalizedEmail,
        quantity,
        createdAt: Date.now(),
      }));
    } catch {
      // The server-side idempotency key still protects the active request.
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), CHECKOUT_TIMEOUT_MS);

    try {
      const response = await fetch("/api/checkout/orders", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-checkout-request": "1",
        },
        body: JSON.stringify({
          requestId,
          email: normalizedEmail,
          items: [{ productId: product.id, quantity }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const apiError = await readError(response);
        if (apiError.code && definitiveOrderErrors.has(apiError.code)) {
          invalidateRequest();
        }
        throw new Error(apiError.message);
      }

      const payload = (await response.json()) as unknown;
      const responseOrder =
        payload && typeof payload === "object"
          ? (payload as Partial<CheckoutResponse>).order
          : null;
      if (!isCreatedOrder(responseOrder)) {
        throw new Error("O servidor retornou um pedido incompleto. Tente novamente.");
      }

      const checkoutUrl = trustedMercadoPagoUrl(responseOrder.checkoutUrl);
      if (!checkoutUrl) {
        throw new Error("O endereço de pagamento recebido não é confiável.");
      }

      removePendingAttempt(pendingStorageKey);
      window.location.assign(checkoutUrl);
    } catch (caught) {
      const message =
        caught instanceof DOMException && caught.name === "AbortError"
          ? "A criação do pedido demorou mais que o esperado. Tente novamente; o mesmo pedido será recuperado com segurança."
          : caught instanceof Error
            ? caught.message
            : "Não foi possível iniciar o pagamento. Tente novamente.";
      setError(message);
      setSubmitting(false);
    } finally {
      window.clearTimeout(timeout);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar à vitrine
          </Link>
          <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Ambiente protegido
          </span>
        </header>

        <div className="mt-8 grid overflow-hidden rounded-3xl border border-border bg-card shadow-sm lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.78fr)]">
          <section className="border-b border-border p-6 sm:p-9 lg:border-r lg:border-b-0" aria-labelledby="checkout-product-title">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Finalizar compra
            </p>

            {product.imageUrl ? (
              <div className="mt-6 aspect-[16/9] overflow-hidden rounded-2xl border border-border bg-muted">
                {/* The catalog accepts both uploaded and externally hosted product images. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={product.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}

            <h1 id="checkout-product-title" className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
              {product.name}
            </h1>
            {product.subtitle ? (
              <p className="mt-3 text-base leading-7 text-muted-foreground">{product.subtitle}</p>
            ) : null}
            {product.description ? (
              <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
                {product.description}
              </p>
            ) : null}

            <div className="mt-7 flex flex-wrap items-end justify-between gap-4 border-t border-border pt-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Valor unitário</p>
                <p className="mt-1 text-2xl font-semibold">{formatCurrency(product.priceCents, product.currency)}</p>
              </div>
              {finiteStock !== null ? (
                <p className="text-sm text-muted-foreground">
                  {soldOut ? "Produto esgotado" : `${finiteStock} unidade${finiteStock === 1 ? "" : "s"} disponível${finiteStock === 1 ? "" : "is"}`}
                </p>
              ) : null}
            </div>
          </section>

          <section className="p-6 sm:p-9" aria-labelledby="checkout-details-title">
            <h2 id="checkout-details-title" className="text-xl font-semibold">Dados da compra</h2>

            {!commerceEnabled ? (
              <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5" role="status">
                <LockKeyhole className="h-6 w-6 text-amber-700 dark:text-amber-300" aria-hidden="true" />
                <h3 className="mt-4 font-semibold">Compras temporariamente indisponíveis</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Este produto está preparado para venda, mas a cobrança ainda não foi ativada. Nenhum pagamento pode ser iniciado agora.
                </p>
              </div>
            ) : soldOut ? (
              <div className="mt-6 rounded-2xl border border-border bg-muted/60 p-5" role="status">
                <h3 className="font-semibold">Produto esgotado</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Não há unidades disponíveis no momento. Volte em breve para consultar novamente.
                </p>
              </div>
            ) : (
              <form className="mt-6 space-y-6" onSubmit={(event) => void createOrder(event)}>
                <div className="space-y-2">
                  <Label htmlFor="checkout-email">E-mail</Label>
                  <Input
                    id="checkout-email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    maxLength={254}
                    placeholder="voce@exemplo.com"
                    required
                    value={email}
                    disabled={submitting}
                    aria-describedby="checkout-email-help"
                    onChange={(event) => {
                      invalidateRequest();
                      setEmail(event.target.value);
                    }}
                  />
                  <p id="checkout-email-help" className="text-xs leading-5 text-muted-foreground">
                    Usaremos este e-mail para identificar e acompanhar seu pedido.
                  </p>
                </div>

                <fieldset disabled={submitting}>
                  <legend className="text-sm font-medium">Quantidade</legend>
                  <div className="mt-2 inline-flex items-center rounded-lg border border-input bg-background p-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Diminuir quantidade"
                      disabled={quantity <= 1}
                      onClick={() => updateQuantity(quantity - 1)}
                    >
                      <Minus aria-hidden="true" />
                    </Button>
                    <Input
                      className="h-8 w-14 border-0 px-1 text-center shadow-none focus-visible:ring-0"
                      type="number"
                      min={1}
                      max={maximumQuantity}
                      step={1}
                      inputMode="numeric"
                      aria-label="Quantidade do produto"
                      value={quantity}
                      onChange={(event) => updateQuantity(Number(event.target.value))}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Aumentar quantidade"
                      disabled={quantity >= maximumQuantity}
                      onClick={() => updateQuantity(quantity + 1)}
                    >
                      <Plus aria-hidden="true" />
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Até {maximumQuantity} por pedido.</p>
                </fieldset>

                <div className="rounded-2xl bg-muted/70 p-5">
                  <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
                    <span>{quantity} × {product.name}</span>
                    <span>{formatCurrency(totalCents, product.currency)}</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-4 border-t border-border pt-4">
                    <strong>Total</strong>
                    <strong className="text-xl">{formatCurrency(totalCents, product.currency)}</strong>
                  </div>
                </div>

                {error ? (
                  <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm leading-6 text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}

                <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                  {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
                  {submitting ? "Preparando pagamento…" : "Ir para o pagamento"}
                  {!submitting ? <ArrowRight aria-hidden="true" /> : null}
                </Button>
              </form>
            )}

            <ul className="mt-7 space-y-3 border-t border-border pt-6 text-xs leading-5 text-muted-foreground">
              <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> O valor é calculado no servidor com base no catálogo.</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> O pagamento é concluído no ambiente seguro do Mercado Pago.</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> A confirmação será feita pelo servidor, não apenas pelo retorno do navegador.</li>
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
