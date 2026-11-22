"use client";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
export function OrderDownloads({ orderId, token }: { orderId: string; token: string }) {
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/checkout/orders/${encodeURIComponent(orderId)}/downloads?token=${encodeURIComponent(token)}`, { cache: "no-store", signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<{ files: { name: string; url: string }[] }>; }).then((data) => setFiles(data.files || [])).catch((e) => { if (e.name !== "AbortError") setError("Não foi possível consultar os downloads. Atualize a página para tentar novamente."); });
    return () => controller.abort();
  }, [orderId, token]);
  if (error) return <p className="mt-5" role="alert">{error}</p>;
  if (!files.length) return null;
  return <section className="atelier-order-downloads mt-6"><h2>Seus arquivos</h2><p>Guarde o link deste pedido para acessar seus downloads.</p>{files.map((file) => <Button asChild variant="outline" key={file.url}><a href={file.url} download>{file.name}</a></Button>)}</section>;
}
