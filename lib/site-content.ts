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
  showcaseTransparency: number;
  showcaseBlackFade: boolean;
  customFontUrl: string;
  backgroundAudioUrl: string;
  backgroundAudioEnabled: boolean;
  backgroundAudioVolume: number;
};

export type SocialPlatform =
  | "whatsapp"
  | "instagram"
  | "youtube"
  | "facebook"
  | "linkedin"
  | "tiktok"
  | "telegram"
  | "email"
  | "website"
  | "custom";

export type SocialMenuPosition =
  | "bottom-right"
  | "bottom-center"
  | "bottom-left"
  | "right-center"
  | "left-center";

export type SocialContactSettings = {
  enabled: boolean;
  position: SocialMenuPosition;
  buttonLabel: string;
};

export type SocialLink = {
  id: string;
  platform: SocialPlatform;
  label: string;
  url: string;
  accentColor: string;
  isVisible: boolean;
  sortOrder: number;
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
  socialSettings: SocialContactSettings;
  socialLinks: SocialLink[];
  welcomeElements: WelcomeElement[];
  categories: ProductCategory[];
  products: Product[];
};

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  telegram: "Telegram",
  email: "E-mail",
  website: "Site",
  custom: "Outro contato",
};

export const SOCIAL_PLATFORM_COLORS: Record<SocialPlatform, string> = {
  whatsapp: "#25D366",
  instagram: "#E4405F",
  youtube: "#FF0033",
  facebook: "#1877F2",
  linkedin: "#0A66C2",
  tiktok: "#111111",
  telegram: "#229ED9",
  email: "#6D5DFB",
  website: "#4F7A67",
  custom: "#CBB89D",
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
    showcaseTransparency: 0,
    showcaseBlackFade: false,
    customFontUrl: "",
    backgroundAudioUrl: "",
    backgroundAudioEnabled: false,
    backgroundAudioVolume: 24,
  },
  socialSettings: {
    enabled: false,
    position: "bottom-right",
    buttonLabel: "Contato",
  },
  socialLinks: [
    {
      id: "contato-whatsapp",
      platform: "whatsapp",
      label: "WhatsApp",
      url: "",
      accentColor: "#25D366",
      isVisible: false,
      sortOrder: 0,
    },
    {
      id: "contato-instagram",
      platform: "instagram",
      label: "Instagram",
      url: "",
      accentColor: "#E4405F",
      isVisible: false,
      sortOrder: 1,
    },
    {
      id: "contato-youtube",
      platform: "youtube",
      label: "YouTube",
      url: "",
      accentColor: "#FF0033",
      isVisible: false,
      sortOrder: 2,
    },
  ],
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
