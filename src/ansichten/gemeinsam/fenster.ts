// Fenstergröße und Verkleinerung (seit Liste J, 10.11.2026).
// Jede Ansicht passt sich der Fenstergröße an (CSS-Grid, Karte im Seitenverhältnis 10 : 7). Unter der Mindestgröße 1280 × 600 wird
// die ganze Ansicht gleichmäßig verkleinert (transform: scale am Element #app) – nie gerollt, nie abgeschnitten. Der Team-Laptop
// meldet seine Fenstergröße mit der Anwesenheit, damit die Spielleitung am Tag sieht, ob ein Laptop zu klein ist (J2.4).
import { useEffect, useState } from "preact/hooks";

export { MIN_FENSTER, PRUEFGROESSEN, fensterJetzt, fensterKennung, fensterText, leseFensterKennung, skalaFuer, zuKlein } from "../../kern/fenster";
import { MIN_FENSTER, fensterJetzt, skalaFuer } from "../../kern/fenster";

let skala = 1;
/** Mindestgröße der gerade gezeigten Ansicht (Auswertung: 1530 × 800, siehe setzeMindestgroesse) */
let mindest = { ...MIN_FENSTER };
let anwenden: (() => void) | null = null;

/** Aktuelle Verkleinerung der Ansicht (1 = keine). */
export function aktuelleSkala(): number {
  return skala;
}

/**
 * Mindestgröße für die gezeigte Ansicht setzen (null: wieder 1280 × 600). Die Auswertung ist für das Smartboard (1530 × 800) gebaut
 * und wird in kleineren Fenstern als Ganzes verkleinert (z. B. 1536 × 730 auf 91 %), statt Inhalte abzuschneiden.
 */
export function setzeMindestgroesse(m: { breite: number; hoehe: number } | null): void {
  mindest = m ?? { ...MIN_FENSTER };
  anwenden?.();
}

/**
 * Verkleinerung am Wurzelelement anwenden und bei jeder Größenänderung nachführen. Das Element bekommt die Größe, die die Ansicht
 * bei 1 hätte (Fenster / Faktor), und wird mit transform: scale verkleinert; die Ansicht selbst rechnet nur mit 100 %.
 */
export function skalierungAnwenden(el: HTMLElement): () => void {
  anwenden = () => {
    const f = fensterJetzt();
    const k = f.breite > 0 && f.hoehe > 0 ? Math.min(skalaFuer(f.breite, f.hoehe), f.breite / mindest.breite, f.hoehe / mindest.hoehe, 1) : 1;
    skala = k;
    document.documentElement.style.setProperty("--skala", String(k));
    document.documentElement.dataset.skala = k < 1 ? k.toFixed(4) : "1";
    if (k >= 1) {
      el.style.removeProperty("width");
      el.style.removeProperty("height");
      el.style.removeProperty("transform");
      el.style.removeProperty("transform-origin");
      return;
    }
    el.style.width = `${f.breite / k}px`;
    el.style.height = `${f.hoehe / k}px`;
    el.style.transformOrigin = "0 0";
    el.style.transform = `scale(${k})`;
  };
  const neu = () => anwenden?.();
  neu();
  window.addEventListener("resize", neu);
  return () => {
    window.removeEventListener("resize", neu);
    anwenden = null;
  };
}

/** Fenstergröße als Zustand (folgt Größenänderungen). */
export function useFenster(): { breite: number; hoehe: number } {
  const [f, setF] = useState(fensterJetzt);
  useEffect(() => {
    const neu = () => setF(fensterJetzt());
    window.addEventListener("resize", neu);
    return () => window.removeEventListener("resize", neu);
  }, []);
  return f;
}
