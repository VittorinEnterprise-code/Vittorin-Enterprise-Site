"use client";

import { ArrowLeft, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type AdminOrder = {
  id: string;
  buyerEmail: string;
  providerOrderId: string | null;
  status: string;
  statusDetail: string;
  totalCents: number;
  currency: string;
  fulfillmentStatus: string;
  createdAt: number;
  updatedAt: number;
};

function currency(cents: number, code: string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: code }).format(cents / 100);
}

function date(timestamp: number) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function statusLabel(status: string) {
  return ({
    creating: "Criando",
    pending: "Aguardando pagamento",
    paid: "Pago",
    failed: "Falhou",
    review: "Revisão necessária",
    cancelled: "Cancelado",
    refunded: "Reembolsado",
  } as Record<string, string>)[status] ?? status;
}

export function OrdersAdminClient({
  initialOrders,
  loadError,
}: {
  initialOrders: AdminOrder[];
  loadError: string;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState(loadError);

  const runAction = async (
    id: string,
    action: "refresh" | "cancel" | "refund" | "complete",
  ) => {
    if (
      action === "cancel" &&
      !window.confirm("Cancelar este pedido no Mercado Pago? Esta ação não pode ser desfeita.")
    ) return;
    if (
      action === "refund" &&
      !window.confirm("Reembolsar integralmente este pedido no Mercado Pago? Confirme somente se tiver certeza.")
    ) return;
    setUpdatingId(id);
    setError("");
    try {
      const response = await fetch(`/studio/api/orders/${encodeURIComponent(id)}/action`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Studio-Request": "1",
        },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json().catch(() => null)) as {
        order?: Partial<AdminOrder>;
        error?: string;
      } | null;
      if (!response.ok || !payload?.order) {
        throw new Error(payload?.error || "Não foi possível atualizar o pedido.");
      }
      if (action === "refresh" && !orders.find((order) => order.id === id)?.providerOrderId) {
        window.location.reload();
        return;
      }
      setOrders((current) => current.map((order) =>
        order.id === id
          ? {
              ...order,
              status: payload.order?.status ?? order.status,
              statusDetail: payload.order?.statusDetail ?? order.statusDetail,
              fulfillmentStatus: payload.order?.fulfillmentStatus ?? order.fulfillmentStatus,
              updatedAt: payload.order?.updatedAt ?? Date.now(),
            }
          : order
      ));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível atualizar o pedido.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/studio" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar ao Estúdio
            </Link>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Pedidos</h1>
            <p className="mt-2 text-sm text-muted-foreground">A confirmação exibida vem diretamente do Mercado Pago.</p>
          </div>
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Área administrativa
          </span>
        </header>

        {error ? (
          <p className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">{error}</p>
        ) : null}

        <section className="mt-8 space-y-4" aria-label="Lista de pedidos">
          {orders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
              Nenhum pedido real foi criado.
            </div>
          ) : orders.map((order) => (
            <article key={order.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">{date(order.createdAt)} · {order.id}</p>
                  <h2 className="mt-2 text-lg font-semibold">{statusLabel(order.status)}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{order.statusDetail}</p>
                </div>
                <strong className="text-lg">{currency(order.totalCents, order.currency)}</strong>
              </div>
              <dl className="mt-5 grid gap-3 border-t border-border pt-5 text-sm sm:grid-cols-3">
                <div><dt className="text-muted-foreground">Comprador</dt><dd className="mt-1 break-all">{order.buyerEmail}</dd></div>
                <div><dt className="text-muted-foreground">Referência Mercado Pago</dt><dd className="mt-1 break-all">{order.providerOrderId ?? "Ainda não recebida"}</dd></div>
                <div><dt className="text-muted-foreground">Entrega</dt><dd className="mt-1">{order.fulfillmentStatus}</dd></div>
              </dl>
              <div className="mt-5 flex justify-end">
                <div className="flex flex-wrap justify-end gap-2">
                  {order.status === "paid" && order.fulfillmentStatus === "ready" ? (
                    <Button type="button" variant="outline" onClick={() => void runAction(order.id, "complete")} disabled={updatingId === order.id}>
                      Concluir entrega
                    </Button>
                  ) : null}
                  {["pending", "review"].includes(order.status) && order.providerOrderId ? (
                    <Button type="button" variant="destructive" onClick={() => void runAction(order.id, "cancel")} disabled={updatingId === order.id}>
                      Cancelar pedido
                    </Button>
                  ) : null}
                  {order.status === "paid" && order.providerOrderId ? (
                    <Button type="button" variant="destructive" onClick={() => void runAction(order.id, "refund")} disabled={updatingId === order.id}>
                      Reembolsar
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void runAction(order.id, "refresh")}
                    disabled={updatingId === order.id}
                  >
                    {updatingId === order.id ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                    {order.providerOrderId ? "Atualizar no Mercado Pago" : "Conciliar no Mercado Pago"}
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
