"use client";

import {
  ArrowRight,
  ChevronDown,
  ExternalLink,
  Layers3,
  Menu,
  Play,
  Sparkles,
  X,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  STATUS_LABELS,
  type Product,
  type SiteContent,
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
  const { settings } = content;
  const visibleCategories = useMemo(
    () => content.categories.filter((category) => category.isVisible),
    [content.categories],
  );
  const visibleProducts = useMemo(
    () => content.products.filter((product) => product.isVisible),
    [content.products],
  );
  const [categoryId, setCategoryId] = useState("all");
  const [menuOpen, setMenuOpen] = useState(false);

  const products = useMemo(
    () =>
      categoryId === "all"
        ? visibleProducts
        : visibleProducts.filter((product) => product.categoryId === categoryId),
    [categoryId, visibleProducts],
  );

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
      className="storefront"
      style={{ "--brand-accent": settings.accentColor } as React.CSSProperties}
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
    </main>
  );
}
