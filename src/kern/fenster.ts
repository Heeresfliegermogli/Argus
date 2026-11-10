// Fenstergröße (seit Liste J, 10.11.2026): Mindestgröße, Prüfgrößen, Kennung für die Anwesenheit. Ohne Abhängigkeit von Preact –
// die Sitzung meldet die Fenstergröße mit, die Ansichten verkleinern darunter (ansichten/gemeinsam/fenster.ts).

/** Mindestgröße der Ansicht (CSS-Pixel); darunter wird verkleinert. */
export const MIN_FENSTER = { breite: 1280, hoehe: 600 };

/** Prüfgrößen (J2.3): Dienst-Laptop (Standard), kleiner Laptop, Smartboard, großer Bildschirm. */
export const PRUEFGROESSEN: [number, number][] = [[1536, 730], [1366, 650], [1530, 800], [1920, 960]];

/** Verkleinerung für ein Fenster b × h: 1 ab der Mindestgröße, sonst so, dass 1280 × 600 hineinpasst (gleichmäßig). */
export function skalaFuer(b: number, h: number): number {
  if (!(b > 0 && h > 0)) return 1;
  return Math.min(1, b / MIN_FENSTER.breite, h / MIN_FENSTER.hoehe);
}

/** Ist das Fenster kleiner als die Mindestgröße (dann Hinweis „Browser auf Vollbild (F11)“)? */
export function zuKlein(b: number, h: number): boolean {
  return b < MIN_FENSTER.breite || h < MIN_FENSTER.hoehe;
}

/** „1536 × 730“ */
export function fensterText(f: { breite: number; hoehe: number }): string {
  return `${f.breite} × ${f.hoehe}`;
}

/** Kennung für die Anwesenheit: „1536x730“ (passt in das Feld version der Firebase-Regeln, siehe sync/firebase.ts). */
export function fensterKennung(f: { breite: number; hoehe: number }): string {
  return `${f.breite}x${f.hoehe}`;
}

/** „1536x730“ → { breite, hoehe }, sonst null. */
export function leseFensterKennung(k: string | undefined | null): { breite: number; hoehe: number } | null {
  const m = typeof k === "string" ? k.match(/^(\d{2,5})x(\d{2,5})$/) : null;
  return m ? { breite: Number(m[1]), hoehe: Number(m[2]) } : null;
}

/** Aktuelle Fenstergröße (Inhalt des Browserfensters, CSS-Pixel). */
export function fensterJetzt(): { breite: number; hoehe: number } {
  return typeof window === "undefined" ? { breite: 0, hoehe: 0 } : { breite: Math.round(window.innerWidth), hoehe: Math.round(window.innerHeight) };
}
