"use client";

import {
  AudioLines,
  ArrowLeft,
  Bold,
  Boxes,
  Check,
  Contrast,
  Eye,
  Layers3,
  Link2,
  Loader2,
  LogOut,
  Maximize2,
  MessageSquareText,
  MonitorPlay,
  PackagePlus,
  Palette,
  Plus,
  Save,
  Settings2,
  Share2,
  Sparkles,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { SocialPlatformIcon } from "@/components/social-platform-icon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_CONTENT,
  SOCIAL_PLATFORM_COLORS,
  SOCIAL_PLATFORM_LABELS,
  STATUS_LABELS,
  type AppearanceSettings,
  type Product,
  type ProductCategory,
  type SiteContent,
  type SiteSettings,
  type SocialContactSettings,
  type SocialLink,
  type SocialPlatform,
  type WelcomeElement,
} from "@/lib/site-content";

type StudioClientProps = {
  adminName: string;
  adminEmail: string;
  signOutPath: string;
};

type MediaUploadProps = {
  accept: string;
  label: string;
  onUploaded: (url: string) => void;
};

const SOCIAL_PLATFORMS = Object.keys(SOCIAL_PLATFORM_LABELS) as SocialPlatform[];

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
}

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? "Não foi possível concluir esta ação.";
}

function MediaUpload({ accept, label, onUploaded }: MediaUploadProps) {
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/studio/api/media", { method: "POST", body: form });
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as { url: string };
      onUploaded(result.url);
      toast.success("Mídia enviada e pronta para uso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha no envio da mídia.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Label className="media-upload">
      <Input
        type="file"
        accept={accept}
        disabled={uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.currentTarget.value = "";
        }}
      />
      {uploading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
      <span>{uploading ? "Enviando…" : label}</span>
    </Label>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="studio-field">
      <Label>{label}</Label>
      {children}
      {hint && <p>{hint}</p>}
    </div>
  );
}

export function StudioClient({ adminName, adminEmail, signOutPath }: StudioClientProps) {
  const [content, setContent] = useState<SiteContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [productDraft, setProductDraft] = useState<Product | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/studio/api/content", { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as { content: SiteContent };
      setContent(result.content);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar o Estúdio.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const saveContent = useCallback(async () => {
    if (!content) throw new Error("O conteúdo ainda não foi carregado.");
    setSaving(true);
    try {
      const response = await fetch("/studio/api/content", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(content),
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as { content: SiteContent };
      setContent(result.content);
      toast.success("Alterações publicadas na vitrine.");
      return { saved: true, products: result.content.products.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível salvar.";
      toast.error(message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  }, [content]);

  useEffect(() => {
    if (!content) return;
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    const register = async () => {
      await context.registerTool(
        {
          name: "read_vittorin_studio_draft",
          title: "Ler rascunho do Estúdio",
          description: "Lê um resumo do conteúdo atualmente aberto no Estúdio Vittorin.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute: () => ({
            settings: content.settings,
            appearance: content.appearance,
            socialMenu: {
              enabled: content.socialSettings.enabled,
              links: content.socialLinks.length,
            },
            welcomeElements: content.welcomeElements.length,
            categories: content.categories.length,
            products: content.products.length,
          }),
        },
        { signal: lifecycle.signal },
      );
      await context.registerTool(
        {
          name: "stage_vittorin_headline",
          title: "Preparar título da vitrine",
          description: "Altera o título e o subtítulo no rascunho aberto, sem publicar.",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string" },
              subtitle: { type: "string" },
            },
            required: ["title", "subtitle"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: (input) => {
            if (!input || typeof input !== "object" || !("title" in input) || !("subtitle" in input)) {
              throw new Error("Título e subtítulo são obrigatórios.");
            }
            const title = String(input.title).trim();
            const subtitle = String(input.subtitle).trim();
            if (!title || title.length > 180 || subtitle.length > 1200) {
              throw new Error("O texto informado está vazio ou excede o limite permitido.");
            }
            setContent((current) =>
              current
                ? {
                    ...current,
                    settings: { ...current.settings, heroTitle: title, heroSubtitle: subtitle },
                  }
                : current,
            );
            return { staged: true, title, subtitle };
          },
        },
        { signal: lifecycle.signal },
      );
      await context.registerTool(
        {
          name: "save_vittorin_storefront",
          title: "Salvar vitrine Vittorin",
          description: "Publica no site as alterações atualmente preparadas no Estúdio.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: saveContent,
        },
        { signal: lifecycle.signal },
      );
    };

    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, [content, saveContent]);

  const updateSettings = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => {
    setContent((current) =>
      current ? { ...current, settings: { ...current.settings, [key]: value } } : current,
    );
  };

  const updateAppearance = <K extends keyof AppearanceSettings>(
    key: K,
    value: AppearanceSettings[K],
  ) => {
    setContent((current) =>
      current
        ? { ...current, appearance: { ...current.appearance, [key]: value } }
        : current,
    );
  };

  const updateSocialSettings = <K extends keyof SocialContactSettings>(
    key: K,
    value: SocialContactSettings[K],
  ) => {
    setContent((current) =>
      current
        ? { ...current, socialSettings: { ...current.socialSettings, [key]: value } }
        : current,
    );
  };

  const updateSocialLink = (id: string, patch: Partial<SocialLink>) => {
    setContent((current) =>
      current
        ? {
            ...current,
            socialLinks: current.socialLinks.map((link) =>
              link.id === id ? { ...link, ...patch } : link,
            ),
          }
        : current,
    );
  };

  const changeSocialPlatform = (id: string, platform: SocialPlatform) => {
    updateSocialLink(id, {
      platform,
      label: SOCIAL_PLATFORM_LABELS[platform],
      accentColor: SOCIAL_PLATFORM_COLORS[platform],
    });
  };

  const removeSocialLink = (id: string) => {
    setContent((current) =>
      current
        ? { ...current, socialLinks: current.socialLinks.filter((link) => link.id !== id) }
        : current,
    );
  };

  const addSocialLink = () => {
    setContent((current) =>
      current
        ? {
            ...current,
            socialLinks: [
              ...current.socialLinks,
              newSocialLink(current.socialLinks.length, current.settings.accentColor),
            ],
          }
        : current,
    );
  };

  const updateWelcomeElement = (id: string, patch: Partial<WelcomeElement>) => {
    setContent((current) =>
      current
        ? {
            ...current,
            welcomeElements: current.welcomeElements.map((element) =>
              element.id === id ? { ...element, ...patch } : element,
            ),
          }
        : current,
    );
  };

  const removeWelcomeElement = (id: string) => {
    setContent((current) =>
      current
        ? {
            ...current,
            welcomeElements: current.welcomeElements.filter((element) => element.id !== id),
          }
        : current,
    );
  };

  const addWelcomeElement = () => {
    setContent((current) =>
      current
        ? {
            ...current,
            welcomeElements: [
              ...current.welcomeElements,
              newWelcomeElement(current.welcomeElements.length, current.settings.accentColor),
            ],
          }
        : current,
    );
  };

  const upsertProduct = (product: Product) => {
    setContent((current) => {
      if (!current) return current;
      const exists = current.products.some((item) => item.id === product.id);
      return {
        ...current,
        products: exists
          ? current.products.map((item) => (item.id === product.id ? product : item))
          : [...current.products, product],
      };
    });
    setProductDraft(null);
  };

  const removeProduct = (id: string) => {
    setContent((current) =>
      current
        ? { ...current, products: current.products.filter((product) => product.id !== id) }
        : current,
    );
  };

  const updateCategory = (id: string, patch: Partial<ProductCategory>) => {
    setContent((current) =>
      current
        ? {
            ...current,
            categories: current.categories.map((category) =>
              category.id === id ? { ...category, ...patch } : category,
            ),
          }
        : current,
    );
  };

  const removeCategory = (id: string) => {
    setContent((current) =>
      current
        ? {
            ...current,
            categories: current.categories.filter((category) => category.id !== id),
            products: current.products.map((product) =>
              product.categoryId === id ? { ...product, categoryId: null } : product,
            ),
          }
        : current,
    );
  };

  const visibleProductCount = useMemo(
    () => content?.products.filter((product) => product.isVisible).length ?? 0,
    [content],
  );

  if (loading) {
    return (
      <main className="studio-loading">
        <Loader2 className="animate-spin" aria-hidden="true" />
        <p>Abrindo o Estúdio Vittorin…</p>
      </main>
    );
  }

  if (loadError || !content) {
    return (
      <main className="studio-loading">
        <div className="studio-error-icon"><Settings2 aria-hidden="true" /></div>
        <h1>O Estúdio não pôde ser aberto.</h1>
        <p>{loadError}</p>
        <Button onClick={() => void load()}>Tentar novamente</Button>
      </main>
    );
  }

  return (
    <main className="studio-shell">
      <aside className="studio-sidebar">
        <Link href="/" className="studio-brand" aria-label="Voltar para a vitrine">
          <img src="/brand/vittorin-mark.webp" alt="" />
          <div><strong>VITTORIN</strong><span>Estúdio</span></div>
        </Link>

        <div className="studio-sidebar-copy">
          <p className="eyebrow">CENTRAL DE EDIÇÃO</p>
          <h1>Sua vitrine, sob seu controle.</h1>
          <p>Edite a identidade, organize os produtos e publique quando estiver pronto.</p>
        </div>

        <div className="studio-account">
          <span>{adminName.slice(0, 1).toUpperCase()}</span>
          <div><strong>{adminName}</strong><small>{adminEmail}</small></div>
        </div>
        <div className="studio-sidebar-actions">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <a href={signOutPath} target="_top"><LogOut aria-hidden="true" /> Sair</a>
          </Button>
        </div>
      </aside>

      <section className="studio-workspace">
        <header className="studio-toolbar">
          <div>
            <Link href="/" className="studio-back"><ArrowLeft aria-hidden="true" /> Ver vitrine</Link>
            <p>Personalização</p>
          </div>
          <Button className="studio-save" onClick={() => void saveContent()} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </header>

        <div className="studio-content">
          <div className="studio-overview">
            <div><span><Boxes /></span><p>Produtos</p><strong>{content.products.length}</strong></div>
            <div><span><Eye /></span><p>Visíveis</p><strong>{visibleProductCount}</strong></div>
            <div><span><Layers3 /></span><p>Categorias</p><strong>{content.categories.length}</strong></div>
          </div>

          <Tabs defaultValue="identity" className="studio-tabs">
            <TabsList className="studio-tabs-list">
              <TabsTrigger value="identity"><Palette /> Identidade</TabsTrigger>
              <TabsTrigger value="contact"><Share2 /> Contato & redes</TabsTrigger>
              <TabsTrigger value="products"><Boxes /> Produtos</TabsTrigger>
              <TabsTrigger value="categories"><Layers3 /> Categorias</TabsTrigger>
              <TabsTrigger value="media"><MonitorPlay /> Mídia & layout</TabsTrigger>
            </TabsList>

            <TabsContent value="identity" className="studio-tab-content">
              <div className="studio-section-heading">
                <div><p className="eyebrow">IDENTIDADE</p><h2>Mensagem principal</h2></div>
                <p>Textos, links e elementos que recebem o visitante.</p>
              </div>

              <div className="studio-form-grid">
                <Field label="Aviso superior">
                  <Input value={content.settings.announcement} onChange={(e) => updateSettings("announcement", e.target.value)} />
                </Field>
                <Field label="Assinatura acima do título">
                  <Input value={content.settings.heroEyebrow} onChange={(e) => updateSettings("heroEyebrow", e.target.value)} />
                </Field>
                <Field label="Título principal">
                  <Input value={content.settings.heroTitle} onChange={(e) => updateSettings("heroTitle", e.target.value)} />
                </Field>
                <Field label="Subtítulo">
                  <Textarea value={content.settings.heroSubtitle} onChange={(e) => updateSettings("heroSubtitle", e.target.value)} />
                </Field>
                <Field label="Texto do botão">
                  <Input value={content.settings.primaryCtaLabel} onChange={(e) => updateSettings("primaryCtaLabel", e.target.value)} />
                </Field>
                <Field label="Link do botão" hint="Use uma URL completa, /página ou #seção.">
                  <Input value={content.settings.primaryCtaUrl} onChange={(e) => updateSettings("primaryCtaUrl", e.target.value)} />
                </Field>
                <Field label="Frase do rodapé">
                  <Input value={content.settings.footerText} onChange={(e) => updateSettings("footerText", e.target.value)} />
                </Field>
                <Field label="Cor de destaque">
                  <div className="color-field">
                    <Input type="color" value={content.settings.accentColor} onChange={(e) => updateSettings("accentColor", e.target.value)} />
                    <Input value={content.settings.accentColor} onChange={(e) => updateSettings("accentColor", e.target.value)} />
                  </div>
                </Field>
              </div>

              <div className="studio-preview" style={{ "--preview-accent": content.settings.accentColor } as React.CSSProperties}>
                <img src={content.settings.heroImageUrl || "/brand/vittorin-hero.webp"} alt="" />
                <div><p>{content.settings.heroEyebrow}</p><h3>{content.settings.heroTitle}</h3><span>{content.settings.primaryCtaLabel}</span></div>
              </div>

              <div className="studio-media-grid">
                <Field label="Logo central">
                  <Input value={content.settings.logoUrl} onChange={(e) => updateSettings("logoUrl", e.target.value)} />
                  <MediaUpload accept="image/jpeg,image/png,image/webp,image/gif" label="Enviar nova logo" onUploaded={(url) => updateSettings("logoUrl", url)} />
                </Field>
                <Field label="Imagem principal (desktop)">
                  <Input value={content.settings.heroImageUrl} onChange={(e) => updateSettings("heroImageUrl", e.target.value)} />
                  <MediaUpload accept="image/jpeg,image/png,image/webp,image/gif" label="Enviar imagem principal" onUploaded={(url) => updateSettings("heroImageUrl", url)} />
                </Field>
              </div>

              <div className="studio-subsection">
                <div className="studio-section-heading studio-section-heading-compact">
                  <div><p className="eyebrow">APARÊNCIA</p><h2>Escala e tipografia</h2></div>
                  <p>Estes ajustes afetam apenas a vitrine pública. O Estúdio mantém seu tamanho normal.</p>
                </div>

                <div className="appearance-grid">
                  <div className="control-card">
                    <div className="control-card-heading"><span><Maximize2 /></span><div><strong>Escala da interface</strong><p>Espaços, cartões e componentes.</p></div></div>
                    <div className="slider-row"><Slider value={[content.appearance.interfaceScale]} min={60} max={160} step={1} onValueChange={([value]) => updateAppearance("interfaceScale", value)} /><output>{content.appearance.interfaceScale}%</output></div>
                    <div className="scale-presets" aria-label="Escalas rápidas">
                      {[60, 80, 100, 120, 140, 160].map((scale) => <Button key={scale} type="button" size="sm" variant={content.appearance.interfaceScale === scale ? "default" : "outline"} onClick={() => updateAppearance("interfaceScale", scale)}>{scale}%</Button>)}
                    </div>
                  </div>
                  <div className="control-card">
                    <div className="control-card-heading"><span><Type /></span><div><strong>Tamanho das letras</strong><p>Ajuste independente da interface.</p></div></div>
                    <div className="slider-row"><Slider value={[content.appearance.fontScale]} min={85} max={140} step={1} onValueChange={([value]) => updateAppearance("fontScale", value)} /><output>{content.appearance.fontScale}%</output></div>
                  </div>
                  <div className="control-card">
                    <div className="control-card-heading"><span><Contrast /></span><div><strong>Contraste</strong><p>Realça textos, imagens e superfícies.</p></div></div>
                    <div className="slider-row"><Slider value={[content.appearance.contrast]} min={85} max={140} step={1} onValueChange={([value]) => updateAppearance("contrast", value)} /><output>{content.appearance.contrast}%</output></div>
                  </div>
                  <div className="control-card control-card-switch">
                    <div className="control-card-heading"><span><Bold /></span><div><strong>Texto em negrito</strong><p>Reforça todos os textos da vitrine.</p></div></div>
                    <Switch checked={content.appearance.boldText} onCheckedChange={(checked) => updateAppearance("boldText", checked)} aria-label="Ativar texto em negrito" />
                  </div>
                  <div className="control-card">
                    <div className="control-card-heading"><span><Eye /></span><div><strong>Transparência do card inicial</strong><p>0% mantém o fundo sólido; 100% revela totalmente a logotipo.</p></div></div>
                    <div className="slider-row"><Slider value={[content.appearance.showcaseTransparency]} min={0} max={100} step={1} onValueChange={([value]) => updateAppearance("showcaseTransparency", value)} /><output>{content.appearance.showcaseTransparency}%</output></div>
                  </div>
                  <div className="control-card control-card-switch">
                    <div className="control-card-heading"><span><Contrast /></span><div><strong>Fade preto discreto</strong><p>Suaviza o lado do card que fica sobre a logotipo, sem desfoque.</p></div></div>
                    <Switch checked={content.appearance.showcaseBlackFade} onCheckedChange={(checked) => updateAppearance("showcaseBlackFade", checked)} aria-label="Ativar fade preto no card inicial" />
                  </div>
                </div>

                <div className="studio-font-card">
                  <Field label="Fonte personalizada" hint="Envie WOFF2, WOFF, TTF ou OTF. Fontes por URL externa podem exigir permissão CORS.">
                    <Input value={content.appearance.customFontUrl} onChange={(e) => updateAppearance("customFontUrl", e.target.value)} placeholder="/media/uploads/minha-fonte.woff2" />
                    <div className="inline-upload-actions">
                      <MediaUpload accept="font/woff2,font/woff,font/ttf,font/otf,.woff2,.woff,.ttf,.otf" label="Enviar arquivo de fonte" onUploaded={(url) => updateAppearance("customFontUrl", url)} />
                      {content.appearance.customFontUrl && <Button type="button" variant="ghost" size="sm" onClick={() => updateAppearance("customFontUrl", "")}>Usar fonte original</Button>}
                    </div>
                  </Field>
                </div>
              </div>

              <div className="studio-subsection">
                <div className="studio-section-heading studio-section-heading-compact">
                  <div><p className="eyebrow">RECEPÇÃO</p><h2>Textos, links e destaques</h2></div>
                  <Button type="button" onClick={addWelcomeElement} disabled={content.welcomeElements.length >= 20}><Plus /> Novo elemento</Button>
                </div>

                <div className="welcome-editor-list">
                  {content.welcomeElements.map((element, index) => (
                    <article className="welcome-editor" key={element.id}>
                      <div className="welcome-editor-heading">
                        <div className="welcome-editor-title">
                          <span>{element.type === "link" ? <Link2 /> : element.type === "highlight" ? <Sparkles /> : <MessageSquareText />}</span>
                          <div><strong>{element.title || `Elemento ${index + 1}`}</strong><small>Ordem {element.sortOrder}</small></div>
                        </div>
                        <div className="welcome-editor-actions">
                          <div className="switch-row"><Label>Visível</Label><Switch checked={element.isVisible} onCheckedChange={(checked) => updateWelcomeElement(element.id, { isVisible: checked })} /></div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={`Excluir ${element.title || "elemento"}`}><Trash2 /></Button></AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader><AlertDialogTitle>Excluir este elemento?</AlertDialogTitle><AlertDialogDescription>Ele sairá do rascunho e será removido da vitrine depois que você salvar.</AlertDialogDescription></AlertDialogHeader>
                              <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => removeWelcomeElement(element.id)}>Excluir elemento</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>

                      <div className="welcome-editor-grid">
                        <Field label="Tipo">
                          <Select value={element.type} onValueChange={(value) => updateWelcomeElement(element.id, { type: value as WelcomeElement["type"] })}>
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="text">Caixa de texto</SelectItem><SelectItem value="link">Link de recepção</SelectItem><SelectItem value="highlight">Destaque visual</SelectItem></SelectContent>
                          </Select>
                        </Field>
                        <Field label="Ordem"><Input type="number" min={0} max={9999} value={element.sortOrder} onChange={(e) => updateWelcomeElement(element.id, { sortOrder: Number(e.target.value) || 0 })} /></Field>
                        <Field label="Assinatura"><Input value={element.eyebrow} onChange={(e) => updateWelcomeElement(element.id, { eyebrow: e.target.value })} placeholder="BOAS-VINDAS" /></Field>
                        <Field label="Título"><Input value={element.title} onChange={(e) => updateWelcomeElement(element.id, { title: e.target.value })} /></Field>
                      </div>
                      <Field label="Texto"><Textarea rows={4} value={element.body} onChange={(e) => updateWelcomeElement(element.id, { body: e.target.value })} /></Field>
                      <div className="welcome-editor-grid welcome-link-grid">
                        <Field label="Texto do link" hint={element.type === "link" ? "Obrigatório neste tipo." : "Opcional: deixe vazio para não exibir botão."}><Input value={element.linkLabel} onChange={(e) => updateWelcomeElement(element.id, { linkLabel: e.target.value })} placeholder="Conhecer agora" /></Field>
                        <Field label="Destino do link"><Input value={element.linkUrl} onChange={(e) => updateWelcomeElement(element.id, { linkUrl: e.target.value })} placeholder="https://... ou #produtos" /></Field>
                        <Field label="Cor de destaque"><div className="color-field"><Input type="color" value={element.accentColor} onChange={(e) => updateWelcomeElement(element.id, { accentColor: e.target.value })} /><Input value={element.accentColor} onChange={(e) => updateWelcomeElement(element.id, { accentColor: e.target.value })} /></div></Field>
                      </div>
                    </article>
                  ))}

                  {content.welcomeElements.length === 0 && (
                    <div className="studio-empty welcome-editor-empty"><MessageSquareText /><h3>Nenhum elemento adicional</h3><p>Adicione textos, links ou destaques entre a abertura e os produtos.</p><Button type="button" variant="outline" onClick={addWelcomeElement}><Plus /> Criar primeiro elemento</Button></div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="contact" className="studio-tab-content">
              <div className="studio-section-heading">
                <div><p className="eyebrow">CONTATO</p><h2>Redes sociais</h2></div>
                <p>Crie um menu flutuante elegante para reunir WhatsApp, Instagram, YouTube e outros canais.</p>
              </div>

              <div className="social-settings-card">
                <div className="social-settings-heading">
                  <div className="social-settings-title">
                    <span><Share2 /></span>
                    <div>
                      <strong>Botão flutuante de contato</strong>
                      <small>O menu só aparece quando estiver ativo e tiver ao menos um link visível.</small>
                    </div>
                  </div>
                  <div className="switch-row">
                    <Label>Ativar</Label>
                    <Switch
                      checked={content.socialSettings.enabled}
                      onCheckedChange={(checked) => updateSocialSettings("enabled", checked)}
                      aria-label="Ativar botão flutuante de contato"
                    />
                  </div>
                </div>

                <div className="studio-form-grid social-settings-grid">
                  <Field label="Texto do botão" hint="Exemplo: Contato, Fale conosco ou Redes.">
                    <Input
                      value={content.socialSettings.buttonLabel}
                      onChange={(event) => updateSocialSettings("buttonLabel", event.target.value)}
                      maxLength={40}
                    />
                  </Field>
                  <Field label="Posição na tela">
                    <Select
                      value={content.socialSettings.position}
                      onValueChange={(value) =>
                        updateSocialSettings(
                          "position",
                          value as SocialContactSettings["position"],
                        )
                      }
                    >
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bottom-right">Embaixo à direita</SelectItem>
                        <SelectItem value="bottom-center">Embaixo no centro</SelectItem>
                        <SelectItem value="bottom-left">Embaixo à esquerda</SelectItem>
                        <SelectItem value="right-center">Lateral direita</SelectItem>
                        <SelectItem value="left-center">Lateral esquerda</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>

              <div className="studio-subsection">
                <div className="studio-section-heading studio-section-heading-compact">
                  <div><p className="eyebrow">CANAIS</p><h2>Links de contato</h2></div>
                  <Button
                    type="button"
                    onClick={addSocialLink}
                    disabled={content.socialLinks.length >= 20}
                  >
                    <Plus /> Adicionar rede
                  </Button>
                </div>

                <div className="social-editor-list">
                  {content.socialLinks.map((link, index) => (
                    <article className="social-editor" key={link.id}>
                      <div className="social-editor-heading">
                        <div className="social-editor-title">
                          <span style={{ "--social-preview-color": link.accentColor } as React.CSSProperties}>
                            <SocialPlatformIcon platform={link.platform} />
                          </span>
                          <div>
                            <strong>{link.label || "Contato " + (index + 1)}</strong>
                            <small>{SOCIAL_PLATFORM_LABELS[link.platform]} · Ordem {link.sortOrder}</small>
                          </div>
                        </div>
                        <div className="social-editor-actions">
                          <div className="switch-row">
                            <Label>Visível</Label>
                            <Switch
                              checked={link.isVisible}
                              onCheckedChange={(checked) => {
                                if (checked && !link.url.trim()) {
                                  toast.error("Informe o link deste contato antes de torná-lo visível.");
                                  return;
                                }
                                updateSocialLink(link.id, { isVisible: checked });
                              }}
                              aria-label={"Exibir " + link.label}
                            />
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button type="button" variant="ghost" size="icon-sm" aria-label={"Excluir " + link.label}>
                                <Trash2 />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir “{link.label}”?</AlertDialogTitle>
                                <AlertDialogDescription>Este canal sairá do rascunho e será removido do menu depois que você salvar.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => removeSocialLink(link.id)}>Excluir contato</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>

                      <div className="social-editor-grid">
                        <Field label="Rede ou canal">
                          <Select
                            value={link.platform}
                            onValueChange={(value) => changeSocialPlatform(link.id, value as SocialPlatform)}
                          >
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {SOCIAL_PLATFORMS.map((platform) => (
                                <SelectItem key={platform} value={platform}>
                                  {SOCIAL_PLATFORM_LABELS[platform]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Nome exibido">
                          <Input
                            value={link.label}
                            onChange={(event) => updateSocialLink(link.id, { label: event.target.value })}
                            maxLength={60}
                          />
                        </Field>
                        <Field label="Ordem">
                          <Input
                            type="number"
                            min={0}
                            max={9999}
                            value={link.sortOrder}
                            onChange={(event) =>
                              updateSocialLink(link.id, { sortOrder: Number(event.target.value) || 0 })
                            }
                          />
                        </Field>
                      </div>
                      <div className="social-editor-grid social-link-grid">
                        <Field
                          label="Link de destino"
                          hint={link.platform === "whatsapp"
                            ? "Use https://wa.me/ seguido do número com DDI e DDD."
                            : link.platform === "email"
                              ? "Use mailto:voce@dominio.com."
                              : "Use o link completo do seu perfil ou canal."}
                        >
                          <Input
                            value={link.url}
                            onChange={(event) => updateSocialLink(link.id, { url: event.target.value })}
                            placeholder={link.platform === "whatsapp" ? "https://wa.me/55..." : "https://..."}
                          />
                        </Field>
                        <Field label="Cor do botão">
                          <div className="color-field">
                            <Input
                              type="color"
                              value={link.accentColor}
                              onChange={(event) => updateSocialLink(link.id, { accentColor: event.target.value })}
                            />
                            <Input
                              value={link.accentColor}
                              onChange={(event) => updateSocialLink(link.id, { accentColor: event.target.value })}
                            />
                          </div>
                        </Field>
                      </div>
                    </article>
                  ))}

                  {content.socialLinks.length === 0 && (
                    <div className="studio-empty social-editor-empty">
                      <Share2 />
                      <h3>Nenhum contato configurado</h3>
                      <p>Adicione WhatsApp, Instagram, YouTube ou qualquer outro canal.</p>
                      <Button type="button" variant="outline" onClick={addSocialLink}>
                        <Plus /> Adicionar primeiro contato
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="products" className="studio-tab-content">
              <div className="studio-section-heading">
                <div><p className="eyebrow">VITRINES</p><h2>Produtos</h2></div>
                <Button onClick={() => setProductDraft(newProduct(content.products.length))}>
                  <PackagePlus /> Novo produto
                </Button>
              </div>

              <div className="studio-product-list">
                {content.products.map((product) => (
                  <article className="studio-product-row" key={product.id}>
                    <div className="studio-product-thumb" style={{ "--thumb-accent": product.accentColor } as React.CSSProperties}>
                      {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span>{product.name.slice(0, 1)}</span>}
                    </div>
                    <div className="studio-product-main">
                      <div><strong>{product.name}</strong><span>{product.subtitle || "Sem subtítulo"}</span></div>
                      <small>{STATUS_LABELS[product.status]} · Ordem {product.sortOrder}</small>
                    </div>
                    <span className={product.isVisible ? "visibility-live" : "visibility-hidden"}>{product.isVisible ? "Visível" : "Oculto"}</span>
                    <Button variant="outline" size="sm" onClick={() => setProductDraft({ ...product })}>Editar</Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Excluir ${product.name}`}><Trash2 /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir “{product.name}”?</AlertDialogTitle>
                          <AlertDialogDescription>O produto sairá do rascunho. A exclusão só chega ao site depois de salvar.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeProduct(product.id)}>Excluir produto</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </article>
                ))}

                {content.products.length === 0 && (
                  <div className="studio-empty"><PackagePlus /><h3>Nenhum produto ainda</h3><p>Crie a primeira vitrine para começar.</p></div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="categories" className="studio-tab-content">
              <div className="studio-section-heading">
                <div><p className="eyebrow">ORGANIZAÇÃO</p><h2>Categorias</h2></div>
                <Button onClick={() => {
                  const next: ProductCategory = { id: createId("categoria"), name: "Nova categoria", slug: `categoria-${Date.now().toString(36)}`, description: "", sortOrder: content.categories.length, isVisible: true };
                  setContent({ ...content, categories: [...content.categories, next] });
                }}><Plus /> Nova categoria</Button>
              </div>

              <div className="category-editor-list">
                {content.categories.map((category) => (
                  <article className="category-editor" key={category.id}>
                    <div className="category-editor-top">
                      <div><strong>{category.name}</strong><small>{content.products.filter((product) => product.categoryId === category.id).length} produto(s)</small></div>
                      <div className="switch-row"><Label>Visível</Label><Switch checked={category.isVisible} onCheckedChange={(checked) => updateCategory(category.id, { isVisible: checked })} /></div>
                    </div>
                    <div className="category-editor-grid">
                      <Field label="Nome"><Input value={category.name} onChange={(e) => updateCategory(category.id, { name: e.target.value })} onBlur={() => !category.slug && updateCategory(category.id, { slug: slugify(category.name) })} /></Field>
                      <Field label="Endereço"><Input value={category.slug} onChange={(e) => updateCategory(category.id, { slug: slugify(e.target.value) })} /></Field>
                      <Field label="Ordem"><Input type="number" min={0} value={category.sortOrder} onChange={(e) => updateCategory(category.id, { sortOrder: Number(e.target.value) || 0 })} /></Field>
                    </div>
                    <Field label="Descrição"><Textarea value={category.description} onChange={(e) => updateCategory(category.id, { description: e.target.value })} /></Field>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="category-delete"><Trash2 /> Excluir categoria</Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Excluir “{category.name}”?</AlertDialogTitle><AlertDialogDescription>Os produtos serão mantidos, mas ficarão sem categoria.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => removeCategory(category.id)}>Excluir categoria</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </article>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="media" className="studio-tab-content">
              <div className="studio-section-heading">
                <div><p className="eyebrow">APRESENTAÇÃO</p><h2>Mídia & layout</h2></div>
                <p>Defina a densidade da vitrine e destaque um vídeo promocional.</p>
              </div>

              <div className="studio-layout-card">
                <div><span><Settings2 /></span><div><strong>Colunas da vitrine</strong><p>Escolha quantos produtos aparecem lado a lado no desktop.</p></div></div>
                <Select value={String(content.settings.gridColumns)} onValueChange={(value) => updateSettings("gridColumns", Number(value))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 coluna</SelectItem><SelectItem value="2">2 colunas</SelectItem><SelectItem value="3">3 colunas</SelectItem><SelectItem value="4">4 colunas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="studio-video-card">
                <div className="category-editor-top">
                  <div><strong>Vídeo promocional</strong><small>MP4, WebM, YouTube ou Vimeo</small></div>
                  <div className="switch-row"><Label>Exibir</Label><Switch checked={content.settings.showPromoVideo} onCheckedChange={(checked) => updateSettings("showPromoVideo", checked)} /></div>
                </div>
                <div className="studio-form-grid">
                  <Field label="Título"><Input value={content.settings.promoTitle} onChange={(e) => updateSettings("promoTitle", e.target.value)} /></Field>
                  <Field label="Subtítulo"><Textarea value={content.settings.promoSubtitle} onChange={(e) => updateSettings("promoSubtitle", e.target.value)} /></Field>
                </div>
                <Field label="URL ou arquivo enviado">
                  <Input value={content.settings.promoVideoUrl} onChange={(e) => updateSettings("promoVideoUrl", e.target.value)} placeholder="https://youtube.com/... ou /media/uploads/..." />
                  <MediaUpload accept="video/mp4,video/webm" label="Enviar vídeo (até 50 MB)" onUploaded={(url) => updateSettings("promoVideoUrl", url)} />
                </Field>
              </div>

              <div className="studio-video-card studio-audio-card">
                <div className="category-editor-top">
                  <div className="audio-card-title"><span><AudioLines /></span><div><strong>Trilha sonora de fundo</strong><small>MP3 em repetição contínua</small></div></div>
                  <div className="switch-row"><Label>Ativar</Label><Switch checked={content.appearance.backgroundAudioEnabled} onCheckedChange={(checked) => updateAppearance("backgroundAudioEnabled", checked)} /></div>
                </div>
                <Field label="Arquivo MP3" hint="O navegador pode exigir que o visitante clique em “Ativar trilha” antes de reproduzir som.">
                  <Input value={content.appearance.backgroundAudioUrl} onChange={(e) => updateAppearance("backgroundAudioUrl", e.target.value)} placeholder="/media/uploads/trilha.mp3" />
                  <MediaUpload accept="audio/mpeg,audio/mp3,.mp3" label="Enviar MP3 (até 50 MB)" onUploaded={(url) => updateAppearance("backgroundAudioUrl", url)} />
                </Field>
                <div className="control-card audio-volume-card">
                  <div className="control-card-heading"><span><AudioLines /></span><div><strong>Volume inicial</strong><p>O visitante também poderá pausar a trilha.</p></div></div>
                  <div className="slider-row"><Slider value={[content.appearance.backgroundAudioVolume]} min={0} max={100} step={1} onValueChange={([value]) => updateAppearance("backgroundAudioVolume", value)} /><output>{content.appearance.backgroundAudioVolume}%</output></div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      <Sheet open={Boolean(productDraft)} onOpenChange={(open) => !open && setProductDraft(null)}>
        <SheetContent className="product-sheet" side="right">
          <SheetHeader><SheetTitle>{productDraft && content.products.some((product) => product.id === productDraft.id) ? "Editar produto" : "Novo produto"}</SheetTitle><SheetDescription>Configure a vitrine, a mídia e o destino deste produto.</SheetDescription></SheetHeader>
          {productDraft && (
            <div className="product-sheet-body">
              <div className="studio-form-grid product-form-grid">
                <Field label="Nome"><Input value={productDraft.name} onChange={(e) => setProductDraft({ ...productDraft, name: e.target.value })} onBlur={() => !productDraft.slug && setProductDraft({ ...productDraft, slug: slugify(productDraft.name) })} /></Field>
                <Field label="Endereço"><Input value={productDraft.slug} onChange={(e) => setProductDraft({ ...productDraft, slug: slugify(e.target.value) })} /></Field>
                <Field label="Assinatura"><Input value={productDraft.eyebrow} onChange={(e) => setProductDraft({ ...productDraft, eyebrow: e.target.value })} /></Field>
                <Field label="Subtítulo"><Input value={productDraft.subtitle} onChange={(e) => setProductDraft({ ...productDraft, subtitle: e.target.value })} /></Field>
              </div>
              <Field label="Descrição"><Textarea rows={5} value={productDraft.description} onChange={(e) => setProductDraft({ ...productDraft, description: e.target.value })} /></Field>
              <div className="studio-form-grid product-form-grid">
                <Field label="Categoria">
                  <Select value={productDraft.categoryId ?? "none"} onValueChange={(value) => setProductDraft({ ...productDraft, categoryId: value === "none" ? null : value })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem categoria</SelectItem>{content.categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Status">
                  <Select value={productDraft.status} onValueChange={(value) => setProductDraft({ ...productDraft, status: value as Product["status"] })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="development">Em desenvolvimento</SelectItem><SelectItem value="coming_soon">Em breve</SelectItem><SelectItem value="available">Disponível</SelectItem></SelectContent>
                  </Select>
                </Field>
                <Field label="Ordem"><Input type="number" min={0} value={productDraft.sortOrder} onChange={(e) => setProductDraft({ ...productDraft, sortOrder: Number(e.target.value) || 0 })} /></Field>
                <Field label="Cor"><div className="color-field"><Input type="color" value={productDraft.accentColor} onChange={(e) => setProductDraft({ ...productDraft, accentColor: e.target.value })} /><Input value={productDraft.accentColor} onChange={(e) => setProductDraft({ ...productDraft, accentColor: e.target.value })} /></div></Field>
              </div>
              <Field label="Imagem do produto"><Input value={productDraft.imageUrl} onChange={(e) => setProductDraft({ ...productDraft, imageUrl: e.target.value })} /><MediaUpload accept="image/jpeg,image/png,image/webp,image/gif" label="Enviar imagem do produto" onUploaded={(url) => setProductDraft((draft) => draft ? { ...draft, imageUrl: url } : draft)} /></Field>
              <Field label="Vídeo do produto (opcional)"><Input value={productDraft.videoUrl} onChange={(e) => setProductDraft({ ...productDraft, videoUrl: e.target.value })} /></Field>
              <div className="studio-form-grid product-form-grid">
                <Field label="Link do produto"><Input value={productDraft.productUrl} onChange={(e) => setProductDraft({ ...productDraft, productUrl: e.target.value })} /></Field>
                <Field label="Texto do botão"><Input value={productDraft.ctaLabel} onChange={(e) => setProductDraft({ ...productDraft, ctaLabel: e.target.value })} /></Field>
              </div>
              <div className="product-switches">
                <div><Label>Visível na vitrine</Label><Switch checked={productDraft.isVisible} onCheckedChange={(checked) => setProductDraft({ ...productDraft, isVisible: checked })} /></div>
                <div><Label>Produto em destaque</Label><Switch checked={productDraft.featured} onCheckedChange={(checked) => setProductDraft({ ...productDraft, featured: checked })} /></div>
              </div>
            </div>
          )}
          <SheetFooter className="product-sheet-footer"><Button variant="outline" onClick={() => setProductDraft(null)}>Cancelar</Button><Button onClick={() => { if (!productDraft?.name.trim() || !productDraft.slug.trim()) { toast.error("Informe o nome e o endereço do produto."); return; } upsertProduct(productDraft); }}><Check /> Aplicar ao rascunho</Button></SheetFooter>
        </SheetContent>
      </Sheet>
    </main>
  );
}

function newProduct(order: number): Product {
  const suffix = Date.now().toString(36);
  return {
    id: createId("produto"), categoryId: null, name: "", slug: `produto-${suffix}`,
    eyebrow: "NOVA EXPERIÊNCIA", subtitle: "", description: "", imageUrl: "",
    videoUrl: "", productUrl: "", ctaLabel: "Conhecer produto", status: "coming_soon",
    accentColor: DEFAULT_CONTENT.settings.accentColor, featured: false, isVisible: true,
    sortOrder: order,
  };
}

function newWelcomeElement(order: number, accentColor: string): WelcomeElement {
  return {
    id: createId("recepcao"),
    type: "text",
    eyebrow: "BOAS-VINDAS",
    title: "Uma nova ideia começa aqui.",
    body: "Apresente uma mensagem, um convite ou uma informação importante para quem visita sua vitrine.",
    linkLabel: "",
    linkUrl: "",
    accentColor,
    isVisible: true,
    sortOrder: order,
  };
}

function newSocialLink(order: number, accentColor: string): SocialLink {
  return {
    id: createId("contato"),
    platform: "custom",
    label: "Novo contato",
    url: "",
    accentColor,
    isVisible: false,
    sortOrder: order,
  };
}
