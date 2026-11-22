"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "./ui/input";
export function AtelierFileUpload({ name, onUploaded }: { name: string; onUploaded: (file: { key: string; name: string }) => void }) {
  const [busy, setBusy] = useState(false);
  return <label className="atelier-file-upload">Arquivo entregue ao comprador
    <p>{name || "Nenhum arquivo enviado. Envie o arquivo antes de ativar a venda."}</p>
    <Input type="file" disabled={busy} accept=".zip,.mcworld,.mcpack,.schem,.schematic,.litematic,.nbt,.pdf" onChange={async (event) => {
      const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
      setBusy(true); try { const form = new FormData(); form.set("file", file); const response = await fetch("/studio/api/atelier/files", { method: "POST", body: form }); const data = await response.json() as { key: string; name: string; error?: string }; if (!response.ok) throw new Error(data.error); onUploaded(data); toast.success("Arquivo guardado para entrega protegida."); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Falha no envio."); } finally { setBusy(false); }
    }} />
    <small>{busy ? "Enviando…" : "Até 50 MB · ZIP, formatos Minecraft ou PDF. Inclua instruções e termos de uso dentro do pacote."}</small>
  </label>;
}
