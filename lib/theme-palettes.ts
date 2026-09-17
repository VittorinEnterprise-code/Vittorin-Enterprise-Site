import type { AppearanceSettings } from "@/lib/site-content";

export type StorefrontPalette = {
  background: string;
  surface: string;
  text: string;
  accent: string;
};

export const THEME_PRESETS = {
  juris: {
    label: "Azul imersivo",
    description: "Azul-marinho e reflexos frios, inspirado nos rascunhos do Juris Immersive.",
    background: "#090D17",
    surface: "#162C4B",
    text: "#E6F2FF",
    accent: "#77B4F4",
  },
  graphite: {
    label: "Grafite",
    description: "Cinzas profundos com contraste limpo e detalhes prateados.",
    background: "#101316",
    surface: "#252B30",
    text: "#F1F3F4",
    accent: "#AFC3D1",
  },
  custom: {
    label: "Personalizado",
    description: "Defina as cores principais da vitrine.",
  },
} as const;

export function getStorefrontPalette(appearance: AppearanceSettings): StorefrontPalette | null {
  if (!appearance.themeEnabled) return null;
  if (appearance.themePreset === "custom") {
    return {
      background: appearance.themeCustomBackground,
      surface: appearance.themeCustomSurface,
      text: appearance.themeCustomText,
      accent: appearance.themeCustomAccent,
    };
  }
  const preset = THEME_PRESETS[appearance.themePreset];
  return {
    background: preset.background,
    surface: preset.surface,
    text: preset.text,
    accent: preset.accent,
  };
}

export function hexRgbTriplet(hex: string) {
  const matched = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!matched) return "7, 7, 7";
  const value = matched[1];
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16)).join(", ");
}

export function darkInkFor(hex: string) {
  const matched = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!matched) return "#101316";
  const channels = [0, 2, 4].map((offset) => parseInt(matched[1].slice(offset, offset + 2), 16) / 255);
  const luminance = channels
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  return luminance > 0.24 ? "#101316" : "#FFFFFF";
}
