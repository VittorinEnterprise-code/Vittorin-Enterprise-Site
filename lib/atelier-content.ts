import { DEFAULT_CONTENT, type SiteContent } from "./site-content";

export function defaultAtelierContent(): SiteContent {
  return {
    ...structuredClone(DEFAULT_CONTENT),
    settings: {
      ...DEFAULT_CONTENT.settings, brandName: "Vittorin Atelier",
      announcement: "CRIAÇÕES AUTORAIS · EDIÇÕES DIGITAIS",
      heroEyebrow: "VITTORIN · ATELIER", heroTitle: "Mundos construídos. Detalhes que permanecem.",
      heroSubtitle: "Construções, mapas e criações digitais. Um portfólio de projetos autorais, pensado em cada detalhe.",
      primaryCtaLabel: "Explorar a coleção", primaryCtaUrl: "#produtos", gridColumns: 2,
      catalogTitle: "A coleção", catalogDescription: "Explore os projetos e conheça os detalhes de cada criação.",
      cardStyle: "gallery", accentColor: "#c5bca9", footerText: "Vittorin Atelier · Criação, forma e identidade",
    },
    appearance: { ...DEFAULT_CONTENT.appearance, themeEnabled: true, themePreset: "custom", showcaseTransparency: 100,
      themeCustomBackground: "#101010", themeCustomSurface: "#1b1b1a", themeCustomText: "#f0eee8", themeCustomAccent: "#d0cbc0" },
    socialLinks: [], welcomeElements: [], products: [],
    categories: [
      { id: "atelier-builds", name: "Construções", slug: "construcoes", description: "", sortOrder: 0, isVisible: true },
      { id: "atelier-worlds", name: "Mapas e mundos", slug: "mapas", description: "", sortOrder: 1, isVisible: true },
      { id: "atelier-content", name: "Conteúdos digitais", slug: "conteudos", description: "", sortOrder: 2, isVisible: true },
    ],
  };
}
