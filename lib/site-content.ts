export type SiteSettings = {
  brandName: string;
  announcement: string;
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  primaryCtaLabel: string;
  primaryCtaUrl: string;
  logoUrl: string;
  heroImageUrl: string;
  accentColor: string;
  gridColumns: number;
  promoTitle: string;
  promoSubtitle: string;
  promoVideoUrl: string;
  showPromoVideo: boolean;
  footerText: string;
};

export type AppearanceSettings = {
  interfaceScale: number;
  fontScale: number;
  boldText: boolean;
  contrast: number;
  customFontUrl: string;
  backgroundAudioUrl: string;
  backgroundAudioEnabled: boolean;
  backgroundAudioVolume: number;
};

export type WelcomeElement = {
  id: string;
  type: "text" | "link" | "highlight";
  eyebrow: string;
  title: string;
  body: string;
  linkLabel: string;
  linkUrl: string;
  accentColor: string;
  isVisible: boolean;
  sortOrder: number;
};

export type ProductCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  isVisible: boolean;
};

export type Product = {
  id: string;
  categoryId: string | null;
  name: string;
  slug: string;
  eyebrow: string;
  subtitle: string;
  description: string;
  imageUrl: string;
  videoUrl: string;
  productUrl: string;
  ctaLabel: string;
  status: "available" | "coming_soon" | "development";
  accentColor: string;
  featured: boolean;
  isVisible: boolean;
  sortOrder: number;
};

export type SiteContent = {
  settings: SiteSettings;
  appearance: AppearanceSettings;
  welcomeElements: WelcomeElement[];
  categories: ProductCategory[];
  products: Product[];
};

export const DEFAULT_CONTENT: SiteContent = {
  settings: {
    brandName: "Vittorin Enterprise",
    announcement: "Novas experiências digitais em desenvolvimento",
    heroEyebrow: "APLICATIVOS · TECNOLOGIA · INOVAÇÃO",
    heroTitle: "Ideias precisas. Experiências que permanecem.",
    heroSubtitle:
      "Uma ponte direta para produtos digitais concebidos com estratégia, identidade e propósito.",
    primaryCtaLabel: "Explorar produtos",
    primaryCtaUrl: "#produtos",
    logoUrl: "/brand/vittorin-logo.webp",
    heroImageUrl: "/brand/vittorin-hero.webp",
    accentColor: "#cbb89d",
    gridColumns: 3,
    promoTitle: "Tecnologia que aproxima conhecimento e experiência",
    promoSubtitle:
      "Conheça os conceitos, lançamentos e demonstrações da Vittorin Enterprise.",
    promoVideoUrl: "",
    showPromoVideo: false,
    footerText: "Disciplina · Estratégia · Evolução",
  },
  appearance: {
    interfaceScale: 100,
    fontScale: 100,
    boldText: false,
    contrast: 100,
    customFontUrl: "",
    backgroundAudioUrl: "",
    backgroundAudioEnabled: false,
    backgroundAudioVolume: 24,
  },
  welcomeElements: [],
  categories: [
    {
      id: "legal-tech",
      name: "Educação jurídica",
      slug: "educacao-juridica",
      description: "Tecnologia aplicada ao aprendizado e à prática do Direito.",
      sortOrder: 0,
      isVisible: true,
    },
  ],
  products: [
    {
      id: "juris-immersive-learn",
      categoryId: "legal-tech",
      name: "Juris Immersive Learn",
      slug: "juris-immersive-learn",
      eyebrow: "APRENDIZADO IMERSIVO",
      subtitle: "O Direito deixa de ser abstrato.",
      description:
        "Uma experiência visual e auditiva para compreender conceitos jurídicos, simular situações e fortalecer a recuperação ativa.",
      imageUrl: "",
      videoUrl: "",
      productUrl: "",
      ctaLabel: "Em breve",
      status: "development",
      accentColor: "#cbb89d",
      featured: true,
      isVisible: true,
      sortOrder: 0,
    },
  ],
};

export const STATUS_LABELS: Record<Product["status"], string> = {
  available: "Disponível",
  coming_soon: "Em breve",
  development: "Em desenvolvimento",
};
