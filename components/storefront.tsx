"use client";

import {
  AudioLines,
  ArrowRight,
  ChevronDown,
  ExternalLink,
  Layers3,
  Menu,
  Pause,
  Play,
  Sparkles,
  X,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  STATUS_LABELS,
  type Product,
  type SiteContent,
  type WelcomeElement,
} from "@/lib/site-content";

type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      title?: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
      execute: (input: unknown) => unknown | Promise<unknown>;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

function safeLink(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("#") || trimmed.startsWith("/")) return trimmed;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? trimmed : "";
  } catch {
    return "";
  }
}

function safeMedia(value: string) {
  const link = safeLink(value);
  return link && !link.startsWith("#") ? link : "";
}

function scaled(value: number, scale: number, unit: "rem" | "vw" | "px") {
  return `${Number((value * scale).toFixed(3))}${unit}`;
}

function storefrontStyle(
  accentColor: string,
  interfacePercentage: number,
  fontPercentage: number,
  contrast: number,
  showcaseTransparency: number,
  showcaseBlackFade: boolean,
) {
  const ui = Math.min(1.6, Math.max(0.6, interfacePercentage / 100));
  const font = Math.min(1.4, Math.max(0.85, fontPercentage / 100));
  const showcaseOpacity = Math.min(1, Math.max(0, 1 - showcaseTransparency / 100));

  return {
    "--brand-accent": accentColor,
    "--site-contrast": `${Math.min(140, Math.max(85, contrast))}%`,
    "--showcase-opacity": showcaseOpacity.toFixed(2),
    "--showcase-black-fade": showcaseBlackFade ? "0.26" : "0",
    "--font-eyebrow": scaled(0.73, font, "rem"),
    "--font-brand": scaled(0.84, font, "rem"),
    "--font-nav": scaled(0.88, font, "rem"),
    "--font-chip": scaled(0.78, font, "rem"),
    "--font-hero-min": scaled(2.3, font, "rem"),
    "--font-hero-fluid": scaled(4.4, font, "vw"),
    "--font-hero-max": scaled(4.7, font, "rem"),
    "--font-body": scaled(1, font, "rem"),
    "--font-section-min": scaled(2.35, font, "rem"),
    "--font-section-fluid": scaled(4.8, font, "vw"),
    "--font-section-max": scaled(5.2, font, "rem"),
    "--font-promo-min": scaled(2.2, font, "rem"),
    "--font-promo-fluid": scaled(4, font, "vw"),
    "--font-promo-max": scaled(4.4, font, "rem"),
    "--font-filter": scaled(0.87, font, "rem"),
    "--font-monogram-min": scaled(5, font, "rem"),
    "--font-monogram-fluid": scaled(12, font, "vw"),
    "--font-monogram-max": scaled(10, font, "rem"),
    "--font-status": scaled(0.7, font, "rem"),
    "--font-product-min": scaled(1.55, font, "rem"),
    "--font-product-fluid": scaled(2, font, "vw"),
    "--font-product-max": scaled(2.1, font, "rem"),
    "--font-product-body": scaled(0.92, font, "rem"),
    "--font-link": scaled(0.88, font, "rem"),
    "--font-empty": scaled(1.8, font, "rem"),
    "--font-welcome-min": scaled(1.75, font, "rem"),
    "--font-welcome-fluid": scaled(3, font, "vw"),
    "--font-welcome-max": scaled(3.2, font, "rem"),
    "--font-welcome-body": scaled(0.95, font, "rem"),
    "--font-footer-brand": scaled(0.84, font, "rem"),
    "--font-mobile-hero-min": scaled(2.15, font, "rem"),
    "--font-mobile-hero-fluid": scaled(11, font, "vw"),
    "--font-mobile-hero-max": scaled(3.2, font, "rem"),
    "--font-mobile-section-min": scaled(2.2, font, "rem"),
    "--font-mobile-section-fluid": scaled(11, font, "vw"),
    "--font-mobile-section-max": scaled(3.5, font, "rem"),
    "--ui-header-height": scaled(74, ui, "px"),
    "--ui-header-x": scaled(4.5, ui, "vw"),
    "--ui-hero-top": scaled(9, ui, "rem"),
    "--ui-hero-x": scaled(5, ui, "vw"),
    "--ui-hero-bottom": scaled(5.5, ui, "rem"),
    "--ui-copy-top": scaled(1.7, ui, "rem"),
    "--ui-copy-x": scaled(1.8, ui, "rem"),
    "--ui-copy-bottom": scaled(1.8, ui, "rem"),
    "--ui-copy-radius": scaled(1.35, ui, "rem"),
    "--ui-section-x": scaled(5, ui, "vw"),
    "--ui-card-padding": scaled(1.55, ui, "rem"),
    "--ui-mobile-header-height": scaled(66, ui, "px"),
    "--ui-mobile-x": scaled(1, ui, "rem"),
    "--ui-mobile-hero-top": scaled(7.5, ui, "rem"),
    "--ui-mobile-hero-bottom": scaled(4.8, ui, "rem"),
    "--ui-mobile-copy": scaled(1.25, ui, "rem"),
  } as React.CSSProperties;
}

function getEmbedUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtube.com")) {
      const id = parsed.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : "";
    }
    if (parsed.hostname === "youtu.be") {
      return `https://www.youtube.com/embed/${parsed.pathname.slice(1)}`;
    }
    if (parsed.hostname.includes("vimeo.com")) {
      const id = parsed.pathname.split("/").filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : "";
    }
  } catch {
    return "";
  }
  return "";
}

function PromoMedia({ url, title }: { url: string; title: string }) {
  const embed = getEmbedUrl(url);
  if (embed) {
    return (
      <iframe
        src={embed}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }

  return <video src={url} controls preload="metadata" aria-label={title} />;
}

function BackgroundAudio({ url, volume }: { url: string; volume: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = Math.min(1, Math.max(0, volume / 100));
    void audio.play().catch(() => setPlaying(false));
    return () => audio.pause();
  }, [url, volume]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setPlaying(false);
      }
    } else {
      audio.pause();
    }
  };

  return (
    <div className="background-audio">
      <audio
        ref={audioRef}
        src={url}
        loop
        autoPlay
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <button type="button" onClick={() => void togglePlayback()} aria-label={playing ? "Pausar trilha sonora" : "Ativar trilha sonora"}>
        {playing ? <Pause aria-hidden="true" /> : <AudioLines aria-hidden="true" />}
        <span>{playing ? "Pausar trilha" : "Ativar trilha"}</span>
      </button>
    </div>
  );
}

function WelcomeCard({ element }: { element: WelcomeElement }) {
  const link = safeLink(element.linkUrl);
  const hasLink = Boolean(link && element.linkLabel.trim());

  return (
    <article
      className={`welcome-card welcome-card-${element.type}`}
      style={{ "--welcome-accent": element.accentColor } as React.CSSProperties}
    >
      <div className="welcome-card-number" aria-hidden="true" />
      {element.eyebrow && <p className="eyebrow">{element.eyebrow}</p>}
      <h2>{element.title}</h2>
      {element.body && <p className="welcome-card-body">{element.body}</p>}
      {hasLink && (
        <a href={link} target={link.startsWith("http") ? "_blank" : undefined} rel={link.startsWith("http") ? "noreferrer" : undefined}>
          {element.linkLabel}
          {link.startsWith("http") ? <ExternalLink aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
        </a>
      )}
    </article>
  );
}

function ProductCard({ product }: { product: Product }) {
  const productLink = safeLink(product.productUrl);

  return (
    <article
      className={`product-card group ${product.featured ? "product-card-featured" : ""}`}
      style={{ "--product-accent": product.accentColor } as React.CSSProperties}
    >
      <div className="product-visual">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={`Imagem de ${product.name}`}
            loading="lazy"
            className="product-image"
          />
        ) : (
          <div className="product-monogram" aria-hidden="true">
            <span>{product.name.slice(0, 1)}</span>
            <div />
          </div>
        )}
        <span className="product-status">{STATUS_LABELS[product.status]}</span>
        {product.videoUrl && (
          <span className="product-video-indicator" title="Este produto possui vídeo">
            <Play aria-hidden="true" />
          </span>
        )}
      </div>

      <div className="product-copy">
        <p className="eyebrow">{product.eyebrow}</p>
        <h3>{product.name}</h3>
        <p className="product-subtitle">{product.subtitle}</p>
        <p className="product-description">{product.description}</p>
        {productLink ? (
          <a
            className="product-link"
            href={productLink}
            target={productLink.startsWith("http") ? "_blank" : undefined}
            rel={productLink.startsWith("http") ? "noreferrer" : undefined}
          >
            {product.ctaLabel}
            <ExternalLink aria-hidden="true" />
          </a>
        ) : (
          <span className="product-link product-link-disabled">
            {product.ctaLabel}
            <ArrowRight aria-hidden="true" />
          </span>
        )}
      </div>
    </article>
  );
}

export function Storefront({ content }: { content: SiteContent }) {
  const { settings, appearance } = content;
  const visibleCategories = useMemo(
    () => content.categories.filter((category) => category.isVisible),
    [content.categories],
  );
  const visibleProducts = useMemo(
    () => content.products.filter((product) => product.isVisible),
    [content.products],
  );
  const visibleWelcomeElements = useMemo(
    () => [...content.welcomeElements]
      .filter((element) => element.isVisible)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    [content.welcomeElements],
  );
  const [categoryId, setCategoryId] = useState("all");
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadedFontUrl, setLoadedFontUrl] = useState("");

  const customFontUrl = safeMedia(appearance.customFontUrl);
  const backgroundAudioUrl = safeMedia(appearance.backgroundAudioUrl);
  const visualStyle = storefrontStyle(
    settings.accentColor,
    appearance.interfaceScale,
    appearance.fontScale,
    appearance.contrast,
    appearance.showcaseTransparency,
    appearance.showcaseBlackFade,
  );

  const products = useMemo(
    () =>
      categoryId === "all"
        ? visibleProducts
        : visibleProducts.filter((product) => product.categoryId === categoryId),
    [categoryId, visibleProducts],
  );

  useEffect(() => {
    if (!customFontUrl || typeof FontFace === "undefined") return;

    let active = true;
    const customFont = new FontFace("VittorinCustom", `url(${JSON.stringify(customFontUrl)})`);
    void customFont
      .load()
      .then((loadedFont) => {
        if (!active) return;
        document.fonts.add(loadedFont);
        setLoadedFontUrl(customFontUrl);
      })
      .catch(() => undefined);

    return () => {
      active = false;
      document.fonts.delete(customFont);
    };
  }, [customFontUrl]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    const register = async () => {
      await context.registerTool(
        {
          name: "list_vittorin_products",
          title: "Listar produtos Vittorin",
          description: "Lista os produtos atualmente visíveis na vitrine Vittorin Enterprise.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute: () => ({
            products: visibleProducts.map(({ id, name, subtitle, status, productUrl }) => ({
              id,
              name,
              subtitle,
              status,
              productUrl,
            })),
          }),
        },
        { signal: lifecycle.signal },
      );
      await context.registerTool(
        {
          name: "filter_vittorin_products",
          title: "Filtrar produtos Vittorin",
          description: "Filtra a vitrine por uma categoria visível.",
          inputSchema: {
            type: "object",
            properties: { categoryId: { type: "string" } },
            required: ["categoryId"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: (input) => {
            const requested =
              typeof input === "object" && input && "categoryId" in input
                ? String(input.categoryId)
                : "";
            if (
              requested !== "all" &&
              !visibleCategories.some((category) => category.id === requested)
            ) {
              throw new Error("Categoria inválida.");
            }
            setCategoryId(requested);
            document.getElementById("produtos")?.scrollIntoView({ behavior: "smooth" });
            return {
              categoryId: requested,
              visibleProducts:
                requested === "all"
                  ? visibleProducts.length
                  : visibleProducts.filter((product) => product.categoryId === requested).length,
            };
          },
        },
        { signal: lifecycle.signal },
      );
    };

    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, [visibleCategories, visibleProducts]);

  return (
    <main
      className={`storefront ${appearance.boldText ? "storefront-bold" : ""} ${customFontUrl && loadedFontUrl === customFontUrl ? "storefront-custom-font" : ""}`}
      style={visualStyle}
    >
      <header className="site-header">
        <a className="header-brand" href="#inicio" aria-label="Vittorin Enterprise — início">
          <Image src="/brand/vittorin-mark.webp" alt="" width={38} height={38} priority />
          <span>VITTORIN</span>
        </a>

        <nav
          className={`header-nav ${menuOpen ? "header-nav-open" : ""}`}
          aria-label="Navegação principal"
        >
          <a href="#produtos" onClick={() => setMenuOpen(false)}>Produtos</a>
          {settings.showPromoVideo && settings.promoVideoUrl && (
            <a href="#visao" onClick={() => setMenuOpen(false)}>Visão</a>
          )}
          <a href="#empresa" onClick={() => setMenuOpen(false)}>Empresa</a>
        </nav>

        <div className="header-actions">
          <ThemeToggle compact />
          <Button asChild className="header-cta">
            <a href="#produtos">Ver produtos <ArrowRight aria-hidden="true" /></a>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="mobile-menu-button"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </header>

      <section className="hero" id="inicio" aria-labelledby="hero-title">
        <div className="hero-media" aria-hidden="true">
          <picture>
            <source
              media="(max-width: 640px)"
              srcSet={settings.logoUrl || "/brand/vittorin-logo.webp"}
            />
            <img src={settings.heroImageUrl || "/brand/vittorin-hero.webp"} alt="" />
          </picture>
          <div className="hero-vignette" />
        </div>

        <div className="hero-topline">
          <span><Sparkles aria-hidden="true" /> {settings.announcement}</span>
        </div>

        <div className="hero-copy">
          <p className="eyebrow">{settings.heroEyebrow}</p>
          <h1 id="hero-title">{settings.heroTitle}</h1>
          <p>{settings.heroSubtitle}</p>
          <Button asChild size="lg" className="hero-button">
            <a href={safeLink(settings.primaryCtaUrl) || "#produtos"}>
              {settings.primaryCtaLabel}
              <ArrowRight aria-hidden="true" />
            </a>
          </Button>
        </div>

        <a className="scroll-cue" href="#produtos" aria-label="Ir para os produtos">
          <span>Descobrir</span>
          <ChevronDown aria-hidden="true" />
        </a>
      </section>

      {visibleWelcomeElements.length > 0 && (
        <section className="welcome-section" aria-label="Boas-vindas">
          <div className="welcome-grid">
            {visibleWelcomeElements.map((element) => <WelcomeCard key={element.id} element={element} />)}
          </div>
        </section>
      )}

      <section className="catalog-section" id="produtos" aria-labelledby="catalog-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PORTFÓLIO DIGITAL</p>
            <h2 id="catalog-title">Produtos concebidos para avançar ideias.</h2>
          </div>
          <p>
            Explore aplicativos e experiências em desenvolvimento pela Vittorin Enterprise.
          </p>
        </div>

        {visibleCategories.length > 0 && (
          <div className="category-filter" role="group" aria-label="Filtrar por categoria">
            <button
              type="button"
              className={categoryId === "all" ? "active" : ""}
              onClick={() => setCategoryId("all")}
            >
              Todos
            </button>
            {visibleCategories.map((category) => (
              <button
                type="button"
                key={category.id}
                className={categoryId === category.id ? "active" : ""}
                onClick={() => setCategoryId(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>
        )}

        {products.length > 0 ? (
          <div
            className="product-grid"
            style={{
              "--grid-columns": Math.min(4, Math.max(1, settings.gridColumns)),
            } as React.CSSProperties}
          >
            {products.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        ) : (
          <div className="empty-catalog">
            <Layers3 aria-hidden="true" />
            <h3>Novidades a caminho</h3>
            <p>Esta categoria está sendo preparada para os próximos lançamentos.</p>
          </div>
        )}
      </section>

      {settings.showPromoVideo && settings.promoVideoUrl && (
        <section className="promo-section" id="visao" aria-labelledby="promo-title">
          <div className="promo-copy">
            <p className="eyebrow">EM MOVIMENTO</p>
            <h2 id="promo-title">{settings.promoTitle}</h2>
            <p>{settings.promoSubtitle}</p>
          </div>
          <div className="promo-frame">
            <PromoMedia url={settings.promoVideoUrl} title={settings.promoTitle} />
          </div>
        </section>
      )}

      <section
        className="manifesto-section"
        id="empresa"
        aria-label="Sobre a Vittorin Enterprise"
      >
        <img
          src={settings.logoUrl || "/brand/vittorin-logo.webp"}
          alt="Vittorin Enterprise"
          loading="lazy"
        />
        <div>
          <p className="eyebrow">VITTORIN ENTERPRISE</p>
          <h2>Disciplina transforma conceitos em produtos.</h2>
          <p>
            A Vittorin Enterprise nasce para conectar estratégia, design e tecnologia em
            experiências digitais claras, memoráveis e úteis.
          </p>
        </div>
      </section>

      <footer className="site-footer">
        <div className="footer-brand">
          <Image src="/brand/vittorin-mark.webp" alt="" width={42} height={42} />
          <div><strong>VITTORIN</strong><span>Enterprise</span></div>
        </div>
        <p>{settings.footerText}</p>
        <p>© {new Date().getFullYear()} Vittorin Enterprise</p>
      </footer>

      {appearance.backgroundAudioEnabled && backgroundAudioUrl && (
        <BackgroundAudio url={backgroundAudioUrl} volume={appearance.backgroundAudioVolume} />
      )}
    </main>
  );
}
