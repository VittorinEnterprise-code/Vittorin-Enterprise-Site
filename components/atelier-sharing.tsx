"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Link2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { Product } from "@/lib/site-content";
type ShareLink = { id: string; productName: string | null; label: string; createdAt: number; expiresAt: number | null; revokedAt: number | null };
const endpoint = "/studio/api/atelier/links";
export function AtelierSharing({ products }: { products: Product[] }) {
  const [links, setLinks] = useState<ShareLink[]>([]), [error, setError] = useState("");
  const [label, setLabel] = useState(""), [product, setProduct] = useState(""), [days, setDays] = useState(0);
  const [working, setWorking] = useState(false), [freshLink, setFreshLink] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { const response = await fetch(endpoint, { cache: "no-store" }); const data = await response.json() as { links: ShareLink[]; error?: string }; if (!response.ok) throw new Error(data.error || "Não foi possível carregar os links."); setLinks(data.links); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Falha na consulta dos links."); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  async function create(event: React.FormEvent) {
    event.preventDefault(); setWorking(true); setFreshLink("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label, productId: product || null, days }) });
      const data = await response.json() as { url: string; error?: string }; if (!response.ok) throw new Error(data.error);
      setFreshLink(data.url); await load(); toast.success("Link criado. Copie e compartilhe com quem desejar.");
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Não foi possível criar o link."); }
    finally { setWorking(false); }
  }
  async function revoke(id: string) {
    setWorking(true);
    try { const response = await fetch(endpoint, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }); if (!response.ok) throw new Error("Não foi possível encerrar o link."); setRevoking(null); setFreshLink(""); await load(); toast.success("Acesso por este link encerrado."); }
    catch (caught) { toast.error(caught instanceof Error ? caught.message : "Falha ao encerrar o link."); }
    finally { setWorking(false); }
  }
  return <section className="atelier-sharing">
    <div className="studio-section-heading"><div><p className="eyebrow">ACESSO RESERVADO</p><h2>Compartilhe o que escolher.</h2></div></div>
    <p>A vitrine não aparece na loja principal. Quem recebe um link pode abri-lo e encaminhá-lo. Você pode encerrar cada link quando quiser; compras já realizadas continuam registradas.</p>
    <form className="atelier-share-form" onSubmit={create}>
      <label>Nome para identificar o link<Input required maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Coleção para um cliente" /></label>
      <label>O que compartilhar<select className="atelier-native-select" value={product} onChange={(e) => setProduct(e.target.value)}><option value="">Atelier inteiro</option>{products.filter((p) => p.isVisible).map((p) => <option key={p.id} value={p.id}>Somente: {p.name}</option>)}</select></label>
      <label>Validade<select className="atelier-native-select" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={0}>Até eu encerrar</option><option value={1}>1 dia</option><option value={7}>7 dias</option><option value={30}>30 dias</option></select></label>
      <Button type="submit" disabled={working}>{working ? <Loader2 className="animate-spin" /> : <Link2 />}Criar link</Button>
    </form>
    <p className="atelier-help">Salve os produtos antes de criar seus links. Fotos, preços e textos exibidos serão os da última versão salva.</p>
    {freshLink && <div className="atelier-fresh-link"><label>Seu novo link<Input value={freshLink} readOnly onFocus={(e) => e.target.select()} /></label><Button type="button" onClick={async () => { try { await navigator.clipboard.writeText(freshLink); toast.success("Link copiado."); } catch { toast.error("Selecione o endereço e copie manualmente."); } }}><Copy />Copiar link</Button><p>O endereço completo é mostrado somente agora. Guarde-o antes de sair desta tela.</p></div>}
    {error && <p role="alert">{error}</p>}
    <div className="atelier-link-list">{links.map((link) => {
      const closed = Boolean(link.revokedAt || (link.expiresAt && link.expiresAt <= Date.now()));
      return <article key={link.id}><ShieldCheck /><div><strong>{link.label}</strong><p>{link.productName || "Atelier inteiro"}</p><small>{closed ? "Encerrado" : link.expiresAt ? `Válido até ${new Date(link.expiresAt).toLocaleDateString("pt-BR")}` : "Ativo · sem vencimento"}</small></div>
        {!closed && (revoking === link.id ? <div className="atelier-revoke-confirm"><span>Encerrar o acesso por este link?</span><Button type="button" variant="outline" disabled={working} onClick={() => setRevoking(null)}>Cancelar</Button><Button type="button" variant="destructive" disabled={working} onClick={() => void revoke(link.id)}>Encerrar link</Button></div> : <Button variant="outline" onClick={() => setRevoking(link.id)}>Encerrar acesso</Button>)}</article>;
    })}{!links.length && !error && <p>Nenhum link criado. O Atelier continua reservado ao proprietário.</p>}</div>
  </section>;
}
