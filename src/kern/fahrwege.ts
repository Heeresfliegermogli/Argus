// Fahrwege für die Spielleitung (Änderung B10, 25.10.2026): Die Kontrollkarte zeigt die Routen der Einheiten, die
// Vorschau einer Verstärkung zeigt ihre Fahrwege und Einheiten ausgegraut – so sieht die Spielleitung vor dem
// Einspielen, wo die Gruppe entlangfährt. Reine Funktionen der Daten (Routen [t_s, x, y]).
import type { Inhalte, Punkt, Ziel } from "../inhalte/typen";
import { zeichenZiel } from "../karte/zeichen";
import { gtBei } from "./geometrie";
import { verstaerkungZiel, verstaerkungen } from "./welt";

/**
 * Fahrweg einer Einheit auf der Kontrollkarte: Route als Linie in der Farbe der Zugehörigkeit; `vorschau` = Verstärkung,
 * die noch nicht eingespielt ist (grau, gestrichelt, mit grauem Zeichen am Start).
 */
export interface Fahrweg {
  id: string;
  punkte: Punkt[];
  art: string;
  vorschau?: boolean;
  /** taktisches Zeichen am Start (nur Vorschau) */
  sidc?: string;
}

function punkte(z: Ziel): Punkt[] {
  return (z.bewegung?.route ?? []).map(([, x, y]) => [x, y] as Punkt);
}

/** Routen aller Fahrzeuge der Welt eines Teams (mit eingespielten Verstärkungen), Farbe nach Ground Truth zur Zeit t. */
export function fahrwegeAlle(inh: Inhalte, t: number): Fahrweg[] {
  return inh.szenario.ziele
    .filter((z) => (z.bewegung?.route?.length ?? 0) > 1)
    .map((z) => ({ id: z.id, punkte: punkte(z), art: gtBei(z, t).kategorie }));
}

/** Vorschau einer Verstärkung, als würde sie zur Spielzeit t0 eingespielt: Fahrwege grau, Zeichen am Start. */
export function verstaerkungVorschau(inh: Inhalte, gruppe: string, t0: number): Fahrweg[] {
  const g = verstaerkungen(inh).find((x) => x.id === gruppe);
  if (!g) return [];
  return g.ziele.map((roh) => {
    const z = verstaerkungZiel(roh, t0);
    const p = punkte(z);
    return { id: `V-${z.id}`, punkte: p.length > 1 ? p : [z.pos, z.pos], art: gtBei(z, t0).kategorie, vorschau: true, sidc: zeichenZiel(inh, z, false) };
  });
}
