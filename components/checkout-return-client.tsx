"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

const REQUEST_TIMEOUT_MS = 12_000;
const PENDING_REFRESH_MS = 5_000;

type PublicOrder = {
  id: string;
  status: string;
  statusDetail: string;
  checkoutUrl?: string | null;
  publicToken?: string;
  createdAt: number;
  totalCents: number;
  currency: string;
};

type CheckoutReturnClientProps = {
  orderId: string | null;
  token: string | null;
};

type ResultKind = "approved" | "pending" | "failed" | "refunded";

function isPublicOrder(value: unknown): value is PublicOrder {
  if (!value || typeof value !== "object") return false;
  const order = value as Record<string, unknown>;

  return (
    typeof order.id === "string" &&
    typeof order.status === "string" &&
    typeof order.statusDetail === "string" &&
    typeof order.createdAt === "number" &&
    typeof order.totalCents === "number" &&
    typeof order.currency === "string"
  );
}

function resultKind(order: PublicOrder): ResultKind {
  const status = order.status.toLowerCase();
  const detail = order.statusDetail.toLowerCase();

  if (
    status === "approved" ||
    status === "paid" ||
    (status === "processed" && detail === "accredited")
  ) {
    return "approved";
  }

  if (["refunded", "partially_refunded"].includes(status) || ["refunded", "partially_refunded"].includes(detail)) {
    return "refunded";
  }

  if (["rejected", "failed", "cancelled", "canceled", "expired"].includes(status)) {
    return "failed";
  }

  return "pending";
}

function formatCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function formatDate(timestamp: number) {
  const milliseconds = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  const date = new Date(milliseconds);

  return Number.isNaN(date.getTime())
    ? "Data indisponível"
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}

async function readError(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | { error?: unknown }
    | null;

  return typeof payload?.error === "string" && payload.error
    ? payload.error
    : "Não foi possível consultar o pedido agora.";
}

function statusCopy(kind: ResultKind) {
  if (kind === "approved") {
    return {
      title: "Pagamento confirmado",
      description: "Recebemos a confirmação segura do pagamento.",
      icon: CheckCircle2,
      color: "text-emerald-600 dark:text-emerald-400",
      surface: "border-emerald-500/30 bg-emerald-500/10",
    };
  }

  if (kind === "failed") {
    return {
      title: "Pagamento não concluído",
      description: "O pagamento foi recusado, cancelado ou expirou. Nenhuma confirmação de cobrança foi registrada.",
      icon: XCircle,
      color: "text-destructive",
      surface: "border-destructive/30 bg-destructive/5",
    };
  }

  if (kind === "refunded") {
    return {
      title: "Pagamento reembolsado",
      description: "O servidor registrou um reembolso total ou parcial para este pedido.",
      icon: RefreshCw,
      color: "text-amber-700 dark:text-amber-300",
      surface: "border-amber-500/30 bg-amber-500/10",
    };
  }

  return {
    title: "Aguardando confirmação",
    description: "O retorno do navegador não confirma o pagamento. Estamos aguardando a atualização segura do servidor.",
    icon: Clock3,
    color: "text-sky-700 dark:text-sky-300",
    surface: "border-sky-500/30 bg-sky-500/10",
  };
}

export function CheckoutReturnClient({ orderId, token }: CheckoutReturnClientProps) {
  const hasCredentials = Boolean(orderId && token);
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [loading, setLoading] = useState(hasCredentials);
  const [error, setError] = useState("");

  const loadOrder = useCallback(async () => {
    if (!orderId || !token) return;

    setLoading(true);
    setError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(
        `/api/checkout/orders/${encodeURIComponent(orderId)}?token=${encodeURIComponent(token)}`,
        {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: { accept: "application/json" },
          signal: controller.signal,
        },
      );

      if (!response.ok) throw new Error(await readError(response));

      const payload = (await response.json()) as unknown;
      const responseOrder =
        payload && typeof payload === "object"
          ? (payload as { order?: unknown }).order
          : null;
      if (!isPublicOrder(responseOrder) || responseOrder.id !== orderId) {
        throw new Error("O servidor retornou uma resposta inesperada para este pedido.");
      }

      setOrder(responseOrder);
    } catch (caught) {
      setError(
        caught instanceof DOMException && caught.name === "AbortError"
          ? "A consulta demorou mais que o esperado. Tente atualizar novamente."
          : caught instanceof Error
            ? caught.message
            : "Não foi possível consultar o pedido agora.",
      );
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }, [orderId, token]);

  const kind = useMemo(() => (order ? resultKind(order) : "pending"), [order]);
  const copy = statusCopy(kind);
  const StatusIcon = copy.icon;

  useEffect(() => {
    if (!hasCredentials) return;
    const timeout = window.setTimeout(() => void loadOrder(), 0);
    return () => window.clearTimeout(timeout);
  }, [hasCredentials, loadOrder]);

  useEffect(() => {
    if (!order || kind !== "pending" || loading) return;
    const timeout = window.setTimeout(() => void loadOrder(), PENDING_REFRESH_MS);
    return () => window.clearTimeout(timeout);
  }, [kind, loadOrder, loading, order]);

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:py-12">
      <div className="mx-auto max-w-2xl">
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
            Consulta segura
          </span>
        </header>

        <section className="mt-8 rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-9" aria-labelledby="return-title" aria-live="polite">
          {!hasCredentials ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5" role="alert">
              <XCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
              <h1 id="return-title" className="mt-5 text-2xl font-semibold tracking-tight">Não foi possível identificar o pedido</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                O link de retorno está incompleto. Volte à vitrine ou use o link original enviado para acompanhar sua compra.
              </p>
            </div>
          ) : loading && !order ? (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <Loader2 className="h-9 w-9 animate-spin text-muted-foreground" aria-hidden="true" />
              <h1 id="return-title" className="mt-5 text-2xl font-semibold">Consultando seu pedido…</h1>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Estamos buscando a situação confirmada pelo servidor.
              </p>
            </div>
          ) : (
            <>
              <div className={`rounded-2xl border p-5 ${copy.surface}`}>
                <StatusIcon className={`h-9 w-9 ${copy.color} ${loading ? "animate-pulse" : ""}`} aria-hidden="true" />
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Situação do pedido</p>
                <h1 id="return-title" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{copy.title}</h1>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy.description}</p>
              </div>

              {order ? (
                <dl className="mt-6 divide-y divide-border rounded-2xl border border-border bg-background/60 px-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 py-4">
                    <dt className="text-sm text-muted-foreground">Pedido</dt>
                    <dd className="font-mono text-xs">{order.id}</dd>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 py-4">
                    <dt className="text-sm text-muted-foreground">Valor</dt>
                    <dd className="font-semibold">{formatCurrency(order.totalCents, order.currency)}</dd>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 py-4">
                    <dt className="text-sm text-muted-foreground">Criado em</dt>
                    <dd className="text-sm">{formatDate(order.createdAt)}</dd>
                  </div>
                </dl>
              ) : null}

              {error ? (
                <p className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm leading-6 text-destructive" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <Button asChild variant="outline">
                  <Link href="/"><ArrowLeft aria-hidden="true" /> Voltar à vitrine</Link>
                </Button>
                <Button type="button" onClick={() => void loadOrder()} disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
                  {loading ? "Consultando…" : "Atualizar situação"}
                </Button>
              </div>
            </>
          )}
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
          Esta tela nunca considera o retorno do navegador como prova de pagamento. A situação exibida vem da consulta protegida ao servidor.
        </p>
      </div>
    </main>
  );
}
