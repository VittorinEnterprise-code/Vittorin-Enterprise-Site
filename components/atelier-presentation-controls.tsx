"use client";

import { COMPANY_FONTS, COMPANY_FONT_KEYS, readAtelierPresentation, type AtelierPresentation, type CompanyFont } from "@/lib/atelier-presentation";
import type { SiteSettings } from "@/lib/site-content";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";

export function AtelierPresentationControls({ settings, onChange }: { settings: SiteSettings; onChange: (value: AtelierPresentation) => void }) {
  const value = readAtelierPresentation(settings.atelierPresentation);
  function update<K extends keyof AtelierPresentation>(key: K, next: AtelierPresentation[K]) {
    onChange({ ...settings.atelierPresentation, [key]: next });
  }
  const titleFont = COMPANY_FONTS[value.titleFont || "classic"], subtitleFont = COMPANY_FONTS[value.subtitleFont || "modern"];
  return <section className="atelier-presentation-controls" aria-labelledby="atelier-presentation-heading">
    <div className="studio-section-heading"><div><p className="eyebrow">ABERTURA DO ATELIER</p><h2 id="atelier-presentation-heading">Apresentação e tipografia</h2></div></div>
    <div className="atelier-presentation-toggle">
      <div><Label htmlFor="atelier-hero-enabled">Exibir apresentação inicial</Label><p>Desative para abrir somente o catálogo de produtos. Textos, imagem e ajustes continuam salvos.</p></div>
      <Switch id="atelier-hero-enabled" checked={value.enabled} onCheckedChange={(enabled) => update("enabled", enabled)} />
    </div>
    <div className="atelier-presentation-editor">
      <div className="atelier-presentation-fields">
        <div>
          <label htmlFor="atelier-hero-transparency">Transparência da apresentação <output>{value.transparency}%</output></label>
          <input id="atelier-hero-transparency" className="atelier-presentation-range" type="range" min={0} max={100} step={1} value={value.transparency} onChange={(e) => update("transparency", Number(e.target.value))} />
          <p>100% remove as camadas escuras e o fundo do texto, revelando a imagem sem escurecimento.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => update("transparency", 100)}>Deixar 100% transparente</Button>
        </div>
        <div>
          <label htmlFor="atelier-title-size">Tamanho do título <output>{value.titleScale}%</output></label>
          <input id="atelier-title-size" className="atelier-presentation-range" type="range" min={50} max={200} step={5} value={value.titleScale} onChange={(e) => update("titleScale", Number(e.target.value))} />
          <label htmlFor="atelier-title-font">Fonte do título</label>
          <select id="atelier-title-font" className="atelier-native-select" value={value.titleFont || "classic"} onChange={(e) => update("titleFont", e.target.value as CompanyFont)}>{COMPANY_FONT_KEYS.map((key) => <option key={key} value={key}>{COMPANY_FONTS[key].label}</option>)}</select>
        </div>
        <div>
          <label htmlFor="atelier-subtitle-size">Tamanho do subtítulo <output>{value.subtitleScale}%</output></label>
          <input id="atelier-subtitle-size" className="atelier-presentation-range" type="range" min={50} max={200} step={5} value={value.subtitleScale} onChange={(e) => update("subtitleScale", Number(e.target.value))} />
          <label htmlFor="atelier-subtitle-font">Fonte do subtítulo</label>
          <select id="atelier-subtitle-font" className="atelier-native-select" value={value.subtitleFont || "modern"} onChange={(e) => update("subtitleFont", e.target.value as CompanyFont)}>{COMPANY_FONT_KEYS.map((key) => <option key={key} value={key}>{COMPANY_FONTS[key].label}</option>)}</select>
        </div>
      </div>
      <div className="atelier-presentation-preview" aria-label="Prévia da apresentação">
        {value.enabled ? <>
          {settings.heroImageUrl && <img src={settings.heroImageUrl} alt="" style={{ opacity: .23 + .77 * value.transparency / 100 }} />}
          <div className="atelier-presentation-preview-shade" style={{ opacity: 1 - value.transparency / 100 }} />
          <div className="atelier-presentation-preview-copy">
            <p className="eyebrow">{settings.heroEyebrow}</p>
            <p className="atelier-presentation-preview-title" style={{ fontFamily: titleFont.family, fontSize: `${2 * value.titleScale / 100}rem` }}>{settings.heroTitle}</p>
            <p style={{ fontFamily: subtitleFont.family, fontSize: `${value.subtitleScale / 100}rem` }}>{settings.heroSubtitle}</p>
          </div>
        </> : <p className="atelier-presentation-disabled">Apresentação desativada.<br />A página abre diretamente nos produtos.</p>}
      </div>
    </div>
    <p className="atelier-help">Os tamanhos do título e do subtítulo são independentes. Use “Salvar alterações” para atualizar a prévia completa e os links compartilhados.</p>
  </section>;
}
