// ARGUS-Logo (Liste O, O2): Schild mit Auge des Kameraden, freigestellt in public/assets/argus_logo.png (240 × 265), Varianten aus
// tools/logo/logo_varianten.py (argus_schild.png, argus_schrift.png, Favicons). Der Schriftzug des Logos ist dunkelrot/schwarz und auf
// dem dunklen Grund der App kaum lesbar – dort stehen deshalb das Schild und „ARGUS“ in der hellen Schrift der App; das ganze Logo nur
// auf hellem Grund (Druck der Einweisung). Nicht im Drohnenbild.
// Die Bilder kommen wie alle Assets über assetUrl: auf der Webseite aus assets/, in der Offline-Datei als data-Adresse eingebettet.
import { assetUrl } from "../../assets/assets";

export const LOGO = { schild: "argus_schild.png", ganz: "argus_logo.png" } as const;

/** Adresse des Schilds (oder null, wenn es in dieser Fassung fehlt – dann steht nur der Name). */
export function schildUrl(): string | null {
  try {
    return assetUrl(LOGO.schild);
  } catch {
    return null;
  }
}

function logoUrl(): string | null {
  try {
    return assetUrl(LOGO.ganz);
  } catch {
    return null;
  }
}

/** Schild als Bild (dekorativ, ohne Alternativtext – daneben steht immer „ARGUS“). */
export function Schild(p: { hoehe: number; klasse?: string }) {
  const url = schildUrl();
  if (!url) return null;
  return <img class={`argus-schild ${p.klasse ?? ""}`} src={url} alt="" aria-hidden="true" draggable={false} style={{ height: `${p.hoehe}px` }} />;
}

/** Kopfzeile: Schild (26 px) vor „ARGUS“ – im Rollenband und in der Leiste des Testpults. */
export function ArgusMarke(p: { klasse?: string }) {
  return (
    <span class={`marke ${p.klasse ?? ""}`} data-testid="argus-marke">
      <Schild hoehe={26} klasse="marke-schild" />
      <span class="marke-text">ARGUS</span>
    </span>
  );
}

/** Titel auf dunklem Grund (Startseite ca. 120 px): Schild über „ARGUS“ in der hellen Schrift der App. */
export function ArgusTitel(p: { hoehe?: number; klasse?: string }) {
  return (
    <div class={`argus-titel ${p.klasse ?? ""}`} data-testid="argus-titel">
      <Schild hoehe={p.hoehe ?? 120} />
      <h1>ARGUS</h1>
    </div>
  );
}

/** Das ganze Logo (Schild und dunkler Schriftzug) – nur auf hellem Grund, z. B. im Druck der Einweisung. */
export function LogoGanz(p: { hoehe: number; klasse?: string }) {
  const url = logoUrl();
  if (!url) return null;
  return <img class={`argus-logo-ganz ${p.klasse ?? ""}`} src={url} alt="ARGUS" draggable={false} style={{ height: `${p.hoehe}px` }} data-testid="argus-logo" />;
}
