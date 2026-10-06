"use client";

import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCopy,
  FlaskConical,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trustedMercadoPagoCheckoutUrl } from "@/lib/mercado-pago-url";

type TestOrder = {
  id: string;
  mpOrderId: string | null;
  status: string;
  statusDetail: string;
  createdAt: number;
  checkoutUrl: string | null;
};

type CheckoutTestState = {
  configured: boolean;
  product: { name: string; amount: string };
  orders: TestOrder[];
};

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? "Não foi possível concluir esta ação. Tente novamente.";
}

function displayDate(timestamp: number) {
  const milliseconds = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime())
    ? "Data indisponível"
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}

function displayAmount(amount: string | undefined) {
  const value = Number(amount);
  return amount && Number.isFinite(value)
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
    : "Valor indisponível";
}

function statusLabel(status: string, statusDetail: string) {
  if (status.toLowerCase() === "processed") {
    const detail = statusDetail.toLowerCase();
    if (detail === "accredited") return "Aprovado no teste";
    if (detail === "refunded") return "Reembolsado no teste";
    if (detail === "partially_refunded") return "Parcialmente reembolsado no teste";
    return "Situação a confirmar";
  }
  const labels: Record<string, string> = {
    creating: "Criando pedido de teste",
    creation_failed: "Criação recusada",
    creation_uncertain: "Criação não confirmada",
    created: "Pedido criado",
    open: "Aguardando pagamento",
    action_required: "Aguardando pagamento",
    pending: "Aguardando confirmação",
    processing: "Pagamento em processamento",
    rejected: "Recusado no teste",
    failed: "Falhou no teste",
    cancelled: "Cancelado",
    canceled: "Cancelado",
    expired: "Expirado",
    refunded: "Estornado no teste",
  };
  return labels[status.toLowerCase()] ?? status;
}

function statusDetailLabel(statusDetail: string) {
  const labels: Record<string, string> = {
    check_mercado_pago: "Verificação manual necessária",
    mercado_pago_response_schema: "Resposta inesperada do Mercado Pago",
    mercado_pago_timeout: "O Mercado Pago demorou para responder",
    response_amount_mismatch: "O valor retornado não corresponde ao teste",
    response_checkout_url_missing: "O Mercado Pago não retornou o link de pagamento",
    response_checkout_url_untrusted: "O endereço de pagamento retornado não foi reconhecido",
    response_currency_mismatch: "A moeda retornada não corresponde ao teste",
    response_order_id_missing: "O Mercado Pago não retornou o identificador do pedido",
    response_order_id_mismatch: "O identificador retornado não corresponde ao pedido",
    response_reference_mismatch: "A referência retornada não corresponde ao pedido",
    response_status_missing: "O Mercado Pago não retornou a situação do pedido",
    idempotency_key_already_used: "A identificação segura deste pedido já foi utilizada",
    internal_error: "O Mercado Pago apresentou uma falha interna temporária",
    resource_locked: "O Mercado Pago bloqueou temporariamente este pedido",
  };
  if (statusDetail.toLowerCase().startsWith("mercado_pago_http_")) {
    return "O Mercado Pago apresentou uma falha temporária";
  }
  return labels[statusDetail.toLowerCase()] ?? statusDetail;
}

export function PaymentTestClient() {
  const [state, setState] = useState<CheckoutTestState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("test@testuser.com");
  const [creating, setCreating] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<boolean> => {
    setLoadError("");
    try {
      const response = await fetch("/studio/api/checkout-test", { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as CheckoutTestState;
      setState({
        configured: result.configured === true,
        product: result.product,
        orders: Array.isArray(result.orders) ? result.orders : [],
      });
      return true;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar os testes.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const createOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!state?.configured || creating) return;
    setCreating(true);
    setActionError("");
    try {
      const response = await fetch("/studio/api/checkout-test", {
        method: "POST",
        headers: { "content-type": "application/json", "X-Checkout-Test": "1" },
        body: JSON.stringify({ buyerEmail: buyerEmail.trim().toLowerCase() }),
      });
      if (!response.ok) throw new Error(await readError(response));
      if (await load()) {
        toast.success("Pedido de teste criado. Abra o checkout em uma janela privativa.");
      } else {
        toast.warning("Pedido criado, mas a lista não atualizou. Recarregue antes de tentar novamente.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível criar o pedido.";
      setActionError(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const refreshOrder = async (id: string) => {
    if (refreshingId) return;
    setRefreshingId(id);
    setActionError("");
    try {
      const response = await fetch("/studio/api/checkout-test/refresh", {
        method: "POST",
        headers: { "content-type": "application/json", "X-Checkout-Test": "1" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error(await readError(response));
      if (await load()) {
        toast.success("Situação atualizada pelo Mercado Pago.");
      } else {
        toast.warning("A consulta terminou, mas a lista não atualizou. Tente recarregar.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível consultar o pedido.";
      setActionError(message);
      toast.error(message);
    } finally {
      setRefreshingId(null);
    }
  };

  const copyCheckoutUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado. Cole-o em uma janela privativa.");
    } catch {
      toast.error("Não foi possível copiar. Abra o link e copie o endereço no navegador.");
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link href="/studio" className="flex items-center gap-3" aria-label="Voltar ao Estúdio Vittorin">
            <Image src="/brand/vittorin-mark.webp" alt="" width={40} height={40} className="h-10 w-10 rounded-lg object-cover" />
            <span className="flex flex-col text-sm leading-tight"><strong className="tracking-[0.14em]">VITTORIN</strong><span className="text-muted-foreground">Estúdio</span></span>
          </Link>
          <Button asChild variant="outline" size="sm">
            <Link href="/studio"><ArrowLeft aria-hidden="true" /> Voltar ao Estúdio</Link>
          </Button>
        </header>

        <section className="overflow-hidden rounded-3xl border border-sky-300/20 bg-[linear-gradient(135deg,#071324,#0d2443_60%,#143963)] p-6 text-white shadow-lg sm:p-9">
          <span className="inline-flex items-center gap-2 rounded-full border border-sky-200/30 bg-sky-200/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-sky-100">
            <FlaskConical className="h-4 w-4" aria-hidden="true" /> Ambiente de teste
          </span>
          <h1 className="mt-5 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Teste do checkout Mercado Pago</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-sky-100/85 sm:text-base">
            Produto fictício, apenas para validar a experiência de compra. Use exclusivamente credenciais e comprador de teste — sem dinheiro real, sem cartão verdadeiro e sem publicar na vitrine.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-sky-100">
            <span className="rounded-full bg-white/10 px-3 py-1.5">Acesso restrito ao administrador</span>
            <span className="rounded-full bg-white/10 px-3 py-1.5">Cópia de validação</span>
            <span className="rounded-full bg-white/10 px-3 py-1.5">Checkout Pro</span>
          </div>
        </section>

        {loading ? (
          <div className="mt-8 flex items-center gap-3 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Preparando o ambiente de teste…
          </div>
        ) : loadError ? (
          <div role="alert" className="mt-8 rounded-2xl border border-destructive/30 bg-card p-6">
            <h2 className="font-semibold">Não foi possível abrir o teste.</h2>
            <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
            <Button className="mt-4" variant="outline" onClick={() => void load()}>Tentar novamente</Button>
          </div>
        ) : state ? (
          <>
            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <section className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-7" aria-labelledby="test-product-title">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Produto fictício</p>
                    <h2 id="test-product-title" className="mt-2 text-xl font-semibold">{state.product?.name ?? "Produto de teste"}</h2>
                  </div>
                  <span className="rounded-full border border-sky-300/40 bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-700 dark:text-sky-200">TESTE</span>
                </div>
                <p className="mt-4 text-3xl font-semibold tracking-tight">{displayAmount(state.product?.amount)}</p>
                <p className="mt-1 text-sm text-muted-foreground">Valor simulado. Este item não aparece na loja pública.</p>

                {!state.configured ? (
                  <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6">
                    O teste ainda não está conectado às credenciais de teste. Nenhuma compra pode ser iniciada nesta tela. Não é necessário ativar credenciais de produção.
                  </div>
                ) : (
                  <form onSubmit={(event) => void createOrder(event)} className="mt-6 space-y-4 border-t border-border pt-6">
                    <div className="space-y-2">
                      <Label htmlFor="test-buyer-email">E-mail de teste do pagador</Label>
                      <Input
                        id="test-buyer-email"
                        type="email"
                        autoComplete="off"
                        maxLength={254}
                        placeholder="comprador@testuser.com"
                        required
                        value={buyerEmail}
                        onChange={(event) => setBuyerEmail(event.target.value)}
                      />
                      <p className="text-xs leading-5 text-muted-foreground">
                        Para esta ordem de sandbox, <strong>test@testuser.com</strong> é aceito pelo Mercado Pago. O campo <strong>Usuário</strong> que começa com USER é apenas o login usado depois no checkout. Nunca digite a senha ou o código de verificação aqui.
                      </p>
                    </div>
                    <Button type="submit" disabled={creating} className="w-full sm:w-auto">
                      {creating ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FlaskConical aria-hidden="true" />}
                      {creating ? "Criando pedido…" : "Criar pedido fictício"}
                    </Button>
                  </form>
                )}
              </section>

              <aside className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-7" aria-label="Como testar">
                <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-sky-600 dark:text-sky-300" aria-hidden="true" /><h2 className="text-lg font-semibold">Como testar com segurança</h2></div>
                <ol className="mt-5 space-y-5 text-sm leading-6">
                  <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">1</span><span>Use uma <strong>conta de teste do tipo Comprador</strong>, diferente da conta vendedora.</span></li>
                  <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">2</span><span>Crie o pedido e abra o link em uma <strong>janela privativa</strong>. Entre com o <strong>Usuário USER…</strong> e a senha da conta compradora de teste.</span></li>
                  <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">3</span><span>Conclua somente com os meios de pagamento fictícios indicados pelo Mercado Pago. Depois, volte e atualize a situação do pedido.</span></li>
                </ol>
                <p className="mt-6 rounded-xl bg-muted p-4 text-xs leading-5 text-muted-foreground">O retorno do navegador não confirma o pagamento. A situação deve ser consultada novamente no Mercado Pago.</p>
              </aside>
            </div>

            <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-7" aria-labelledby="test-orders-title">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Acompanhamento</p><h2 id="test-orders-title" className="mt-1 text-xl font-semibold">Pedidos fictícios</h2></div>
                <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw aria-hidden="true" /> Recarregar lista</Button>
              </div>

              {actionError && <p role="alert" className="mt-4 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{actionError}</p>}

              {state.orders.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhum pedido de teste ainda. Crie o primeiro acima quando o ambiente estiver pronto.</div>
              ) : (
                <div className="mt-5 space-y-4">
                  {state.orders.map((order) => {
                    const checkoutUrl = trustedMercadoPagoCheckoutUrl(order.checkoutUrl);
                    return (
                      <article key={order.id} className="rounded-xl border border-border bg-background/70 p-4 sm:p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-muted-foreground">Pedido {order.id.slice(0, 12)} · {displayDate(order.createdAt)}</p>
                            <h3 className="mt-1 font-semibold">{statusLabel(order.status, order.statusDetail)}</h3>
                            {order.statusDetail && <p className="mt-1 text-sm text-muted-foreground">{statusDetailLabel(order.statusDetail)}</p>}
                            {order.mpOrderId && <p className="mt-1 text-xs text-muted-foreground">Referência Mercado Pago: {order.mpOrderId}</p>}
                          </div>
                          <Button variant="outline" size="sm" disabled={refreshingId === order.id || !state.configured || !order.mpOrderId} onClick={() => void refreshOrder(order.id)}>
                            {refreshingId === order.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
                            Atualizar situação
                          </Button>
                        </div>
                        {checkoutUrl && state.configured && (
                          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                            <Button variant="outline" size="sm" onClick={() => void copyCheckoutUrl(checkoutUrl)}><ClipboardCopy aria-hidden="true" /> Copiar link para janela privativa</Button>
                            <Button asChild variant="ghost" size="sm"><a href={checkoutUrl} target="_blank" rel="noopener noreferrer"><ArrowUpRight aria-hidden="true" /> Abrir checkout de teste</a></Button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <p className="mt-6 flex items-center gap-2 text-xs leading-5 text-muted-foreground"><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> Este espaço é só para validação; a vitrine pública e as credenciais de produção permanecem separadas.</p>
          </>
        ) : null}
      </div>
    </main>
  );
}
