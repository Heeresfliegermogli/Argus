// Einsatzregeln und Trefferregel. Portiert aus argus_lib.py (pruefe_wirkmittel) und
// simuliere_durchlauf.py (Trefferregel). Reine Funktionen, Ergebnis hängt nur von Inhalten und t ab.
import type { Inhalte, Meldung, Punkt, Regeln } from "../inhalte/typen";
import { abstandZone, dist, position, vorhanden } from "./geometrie";

export type ArgusEmpfehlungSoll = "BEKÄMPFEN" | "PRÜFEN" | "UNKLAR";

export function argusEmpfehlung(konfidenz: number, regeln: Regeln): ArgusEmpfehlungSoll {
  const s = regeln.argus.schwellen;
  if (konfidenz >= s.bekaempfen) return "BEKÄMPFEN";
  if (konfidenz >= s.pruefen) return "PRÜFEN";
  return "UNKLAR";
}

export interface Verstoss {
  /** R2, R3 oder EB (Einsatzbereich des Wirkmittels) */
  regel: "R2" | "R3" | "EB";
  zone?: string;
  abstand_m?: number;
  text: string;
}

export interface Treffer {
  ziel: string;
  /** fahrzeug, attrappe oder personen */
  was: "fahrzeug" | "attrappe" | "personen";
  /** Ground-Truth-Kategorie bzw. Personenart */
  kategorie: string;
  anzahl?: number;
}

export interface Pruefung {
  zulaessig: boolean;
  verstoesse: Verstoss[];
  /** Was im Wirkradius liegt (nach der Lage zur Zeit t). */
  getroffen: Treffer[];
}

const PERSONEN_TEXT: Record<string, string> = {
  zivil: "Zivilpersonen",
  soldat: "Soldaten",
  besatzung_ergibt_sich: "Besatzung (ergibt sich)",
};

function abstandText(a: number): string {
  return a === 0 ? "Ziel liegt im Gebiet" : `Abstand ${Math.round(a)} m`;
}

export const SCHUTZ_KATEGORIEN = ["zivil", "geschuetzt", "verbuendet", "besatzung_ergibt_sich", "ausser_gefecht"];

/**
 * Prüft ein Wirkmittel an einer Zielposition gegen R2, R3 und den Einsatzbereich und ermittelt,
 * was zur Zeit t im Wirkradius liegt. Ob das Ziel selbst geschützt ist, prüft der Mensch.
 */
export function pruefeWirkmittel(
  inh: Inhalte, zielPos: Punkt, wmId: string, t: number, ausgenommen: string[] = [],
): Pruefung {
  const wm = inh.wirkmittel[wmId];
  if (!wm) throw new Error(`Wirkmittel ${wmId} unbekannt`);
  const r = wm.wirkradius_m;
  const verstoesse: Verstoss[] = [];
  for (const z of inh.szenario.zonen) {
    const a = abstandZone(zielPos, z);
    if (z.typ === "no_strike" && a < r) {
      verstoesse.push({ regel: "R2", zone: z.id, abstand_m: a, text: `${z.id} im Wirkradius (${abstandText(a)})` });
    }
    if (z.typ === "einschraenkung" && a < r && r > (z.max_wirkradius_m ?? Infinity)) {
      verstoesse.push({
        regel: "R3", zone: z.id, abstand_m: a,
        text: `${z.id} im Wirkradius, dort nur bis ${z.max_wirkradius_m} m erlaubt (${abstandText(a)})`,
      });
    }
  }
  const xMax = wm.einsatzbereich?.x_max;
  if (xMax !== undefined && zielPos[0] >= xMax) {
    verstoesse.push({ regel: "EB", text: `außerhalb des Einsatzbereichs (${wm.einsatzbereich!.text.split(",")[0]})` });
  }
  const getroffen: Treffer[] = [];
  for (const z of inh.szenario.ziele) {
    if (ausgenommen.includes(z.id)) continue;
    if (vorhanden(z, t) && dist(zielPos, position(z, t)) <= r) {
      const attrappe = z.gt.kategorie === "attrappe";
      getroffen.push({ ziel: z.id, was: attrappe ? "attrappe" : "fahrzeug", kategorie: z.gt.kategorie });
    }
    for (const p of z.personen ?? []) {
      if (vorhanden(p, t, z) && dist(zielPos, position(p, t)) <= r) {
        getroffen.push({ ziel: z.id, was: "personen", kategorie: p.art, anzahl: p.anzahl });
      }
    }
  }
  return { zulaessig: verstoesse.length === 0, verstoesse, getroffen };
}

/** Gemeldete Position einer Meldung: Hauptziel (erstes Ziel) zur Meldezeit. */
export function gemeldetePosition(inh: Inhalte, m: Meldung): Punkt {
  return position(inh.ziele[m.ziele[0]], m.t_s);
}

/**
 * Trefferregel (regeln.json): Das gemeldete Ziel ist getroffen (bei Gruppen das erste Fahrzeug),
 * wenn es noch im Raum ist; zusätzlich alles im Wirkradius um die gemeldete Position nach der
 * Lage zum Zeitpunkt der Freigabe.
 */
export function berechneWirkung(
  inh: Inhalte, m: Meldung, wmId: string, tFreigabe: number,
): { pos: Punkt; pruefung: Pruefung; getroffen: Treffer[] } {
  const pos = gemeldetePosition(inh, m);
  const pruefung = pruefeWirkmittel(inh, pos, wmId, tFreigabe);
  const getroffen = [...pruefung.getroffen];
  const haupt = inh.ziele[m.ziele[0]];
  const schonDabei = getroffen.some((g) => g.ziel === haupt.id && g.was !== "personen");
  if (vorhanden(haupt, tFreigabe) && !schonDabei) {
    getroffen.push({
      ziel: haupt.id, was: haupt.gt.kategorie === "attrappe" ? "attrappe" : "fahrzeug", kategorie: haupt.gt.kategorie,
    });
  }
  return { pos, pruefung, getroffen };
}

export function trefferText(t: Treffer): string {
  if (t.was === "personen") return `${t.ziel}: ${t.anzahl ?? ""} ${PERSONEN_TEXT[t.kategorie] ?? t.kategorie}`.trim();
  return `${t.ziel}${t.was === "attrappe" ? " (Attrappe)" : ""}`;
}
