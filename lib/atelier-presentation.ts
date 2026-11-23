/** The three type families already used by the company site. */
export const COMPANY_FONT_KEYS = ["classic", "modern", "mono"] as const;
export type CompanyFont = typeof COMPANY_FONT_KEYS[number];
export const COMPANY_FONTS: Record<CompanyFont, { label: string; family: string }> = {
  classic: { label: "Clássica · Georgia", family: 'Georgia, "Times New Roman", serif' },
  modern: { label: "Moderna · Avenir Next", family: '"Avenir Next", "Segoe UI", Helvetica, Arial, sans-serif' },
  mono: { label: "Monoespaçada · Consolas", family: '"SFMono-Regular", Consolas, "Liberation Mono", monospace' },
};
export type AtelierPresentation = {
  enabled?: boolean;
  transparency?: number;
  titleScale?: number;
  subtitleScale?: number;
  titleFont?: CompanyFont;
  subtitleFont?: CompanyFont;
};
function bounded(value: number | undefined, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
export function readAtelierPresentation(value?: AtelierPresentation) {
  return {
    enabled: value?.enabled !== false,
    transparency: bounded(value?.transparency, 0, 0, 100),
    titleScale: bounded(value?.titleScale, 100, 50, 200),
    subtitleScale: bounded(value?.subtitleScale, 100, 50, 200),
    titleFont: value?.titleFont && COMPANY_FONT_KEYS.includes(value.titleFont) ? value.titleFont : undefined,
    subtitleFont: value?.subtitleFont && COMPANY_FONT_KEYS.includes(value.subtitleFont) ? value.subtitleFont : undefined,
  };
}
export function atelierPresentationStyle(value?: AtelierPresentation, panelTransparency = 100, blackFade = false) {
  const p = readAtelierPresentation(value), cover = 1 - p.transparency / 100;
  const panel = .92 * (1 - bounded(panelTransparency, 100, 0, 100) / 100) * cover;
  return {
    "--atelier-hero-image-opacity": .23 + .77 * p.transparency / 100,
    "--atelier-hero-cover-opacity": cover,
    "--atelier-hero-panel-alpha": panel,
    "--atelier-hero-panel-end-alpha": blackFade ? panel * .35 : panel,
    "--atelier-title-scale": p.titleScale / 100,
    "--atelier-subtitle-scale": p.subtitleScale / 100,
    ...(p.titleFont ? { "--atelier-title-font": COMPANY_FONTS[p.titleFont].family } : {}),
    ...(p.subtitleFont ? { "--atelier-subtitle-font": COMPANY_FONTS[p.subtitleFont].family } : {}),
  };
}
