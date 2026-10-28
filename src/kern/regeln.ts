// Einsatzregeln und Trefferregel. Portiert aus argus_lib.py (pruefe_wirkmittel, flugzeit, einschlag,
// wirkung). Reine Funktionen: Ergebnis hängt nur von Inhalten (bzw. der Welt eines Teams), Zeit und
// den zerstörten Fahrzeugen ab.
//
// Trefferregel seit Szenario 2.0 (regeln.json, wirkung): Die Wirkung gilt dem ersten Fahrzeug der Meldung,
// das bei der Freigabe noch steht, und schlägt an seinem Ort zum Einschlagzeitpunkt ein (Freigabe plus
// Flugzeit). Getroffen ist alles im Wirkradius nach der Lage beim Einschlag; R2, R3 und Einsatzbereich
// gelten am Einschlagort. Die Warnungen bei G2 und G3 rechnen den Einschlag mit derselben Funktion voraus.
import type { Inhalte, Meldung, Punkt, Regeln, Wirkmittel, Zone } from "../inhalte/typen";
import { abstandZone, dist, gtBei, position, vorhanden } from "./geometrie";

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
 * Seit 2.2 (C6): Ein Wirkmittel mit `nur_zielfahrzeug` (LM) trifft von den Fahrzeugen nur `zielFz` (das bekämpfte);
 * andere Fahrzeuge im Wirkradius bleiben stehen, Personen im Wirkradius sind betroffen.
 */
export function pruefeWirkmittel(
  inh: Inhalte, zielPos: Punkt, wmId: string, t: number, ausgenommen: string[] = [], zerstoert: Record<string, number> = {},
  zielFz?: string,
): Pruefung {
  const wm = inh.wirkmittel[wmId];
  if (!wm) throw new Error(`Wirkmittel ${wmId} unbekannt`);
  const r = wm.wirkradius_m;
  const verstoesse: Verstoss[] = [];
  for (const z of inh.szenario.zonen) {
    const a = abstandZone(zielPos, z);
    // sichtbarer Name (seit 2.1 „Schule“, „Ortschaft“); zone bleibt die interne ID (Vorschau, Auswertung)
    const name = zonenName(z);
    if (z.typ === "no_strike" && a < r) {
      verstoesse.push({ regel: "R2", zone: z.id, abstand_m: a, text: `${name} im Wirkradius (${abstandText(a)})` });
    }
    if (z.typ === "einschraenkung" && a < r && r > (z.max_wirkradius_m ?? Infinity)) {
      verstoesse.push({
        regel: "R3", zone: z.id, abstand_m: a,
        text: `${name} im Wirkradius, dort nur bis ${z.max_wirkradius_m} m erlaubt (${abstandText(a)})`,
      });
    }
  }
  const xMax = wm.einsatzbereich?.x_max;
  if (xMax !== undefined && zielPos[0] >= xMax) {
    verstoesse.push({ regel: "EB", text: `außerhalb des Einsatzbereichs (${wm.einsatzbereich!.text.split(",")[0]})` });
  }
  const getroffen: Treffer[] = [];
  const nurZiel = !!wm.nur_zielfahrzeug;
  for (const z of inh.szenario.ziele) {
    if (ausgenommen.includes(z.id)) continue;
    const fahrzeugTrifft = !nurZiel || z.id === zielFz;
    if (fahrzeugTrifft && vorhanden(z, t) && !((zerstoert[z.id] ?? Infinity) <= t) && dist(zielPos, position(z, t)) <= r) {
      const kat = gtBei(z, t).kategorie;
      getroffen.push({ ziel: z.id, was: kat === "attrappe" ? "attrappe" : "fahrzeug", kategorie: kat });
    }
    for (const p of z.personen ?? []) {
      if (vorhanden(p, t, z) && dist(zielPos, position(p, t)) <= r) {
        getroffen.push({ ziel: z.id, was: "personen", kategorie: p.art, anzahl: p.anzahl });
      }
    }
  }
  return { zulaessig: verstoesse.length === 0, verstoesse, getroffen };
}

/** Sichtbarer Name einer Zone (seit Szenario 2.1 „Schule“, „Ortschaft“); ohne Kurznamen die ID. */
export function zonenName(z: Pick<Zone, "id" | "kurz">): string {
  return z.kurz ?? z.id;
}

/** Gemeldete Position einer Meldung: Hauptziel (erstes Ziel) zur Meldezeit. */
export function gemeldetePosition(inh: Inhalte, m: Meldung): Punkt {
  return position(inh.ziele[m.ziele[0]], m.t_s);
}

// ---------------------------------------------------------------- Trefferregel (Lage beim Einschlag)

/** Zeit von der Freigabe bis zum Einschlag in s. LM: Startvorbereitung + Strecke ab Startpunkt / Geschwindigkeit. */
export function flugzeit(wm: Wirkmittel, zielPos: Punkt): number {
  const fl = wm.flug;
  if (fl) return (fl.vorbereitung_s ?? 0) + dist(fl.start, zielPos) / fl.geschwindigkeit_mps;
  return wm.vorlauf_s;
}

export interface Einschlag {
  /** Spielzeit des Einschlags */
  t: number;
  pos: Punkt;
  /** bekämpftes Fahrzeug (erstes Fahrzeug der Meldung, das bei der Freigabe noch steht) */
  ziel: string;
}

/**
 * Einschlagzeit und -ort einer Wirkung (wie argus_lib.einschlag). zerstoert: Ziel → Zeitpunkt der
 * Zerstörung; zählt nur bis zur Freigabe. Beim LM hängt die Flugzeit vom Ort ab (Fixpunkt-Iteration).
 */
export function einschlag(inh: Inhalte, ziele: string[], wmId: string, tFreigabe: number, zerstoert: Record<string, number> = {}): Einschlag {
  const kand = ziele.map((id) => inh.ziele[id]).filter((z) => z && vorhanden(z, tFreigabe) && !((zerstoert[z.id] ?? Infinity) <= tFreigabe));
  const haupt = kand[0] ?? inh.ziele[ziele[0]];
  const wm = inh.wirkmittel[wmId];
  let t = tFreigabe + flugzeit(wm, position(haupt, tFreigabe));
  for (let i = 0; i < 4; i++) t = tFreigabe + flugzeit(wm, position(haupt, t));
  return { t, pos: position(haupt, t), ziel: haupt.id };
}

export interface Wirkungsergebnis {
  einschlag: Einschlag;
  /** Regelprüfung am Einschlagort zum Einschlagzeitpunkt */
  pruefung: Pruefung;
  /** alles im Wirkradius beim Einschlag, dazu das bekämpfte Fahrzeug, wenn es dann noch steht */
  getroffen: Treffer[];
}

/** Was eine Wirkung beim Einschlag trifft (wie argus_lib.wirkung, ab dem berechneten Einschlag). */
export function wirkungBeimEinschlag(inh: Inhalte, e: Einschlag, wmId: string, zerstoert: Record<string, number> = {}): Wirkungsergebnis {
  const pruefung = pruefeWirkmittel(inh, e.pos, wmId, e.t, [], zerstoert, e.ziel);
  const getroffen = [...pruefung.getroffen];
  const z0 = inh.ziele[e.ziel];
  if (z0 && vorhanden(z0, e.t) && !((zerstoert[z0.id] ?? Infinity) <= e.t) && !getroffen.some((g) => g.ziel === z0.id && g.was !== "personen")) {
    const kat = gtBei(z0, e.t).kategorie;
    getroffen.push({ ziel: z0.id, was: kat === "attrappe" ? "attrappe" : "fahrzeug", kategorie: kat });
  }
  return { einschlag: e, pruefung, getroffen };
}

/** Vorhersage für eine Freigabe zur Zeit tFreigabe: Einschlag, Regelprüfung dort und Treffer (Warnungen G2/G3). */
export function vorhersage(inh: Inhalte, m: Meldung, wmId: string, tFreigabe: number, zerstoert: Record<string, number> = {}): Wirkungsergebnis {
  return wirkungBeimEinschlag(inh, einschlag(inh, m.ziele, wmId, tFreigabe, zerstoert), wmId, zerstoert);
}

export function trefferText(t: Treffer): string {
  if (t.was === "personen") return `${t.ziel}: ${t.anzahl ?? ""} ${PERSONEN_TEXT[t.kategorie] ?? t.kategorie}`.trim();
  return `${t.ziel}${t.was === "attrappe" ? " (Attrappe)" : ""}`;
}

/** Warnungstext je Verstoß, mit Uhrzeit des Einschlags (für Protokoll und Anzeige). */
export function verstossText(v: Verstoss): string {
  return `${v.regel}: ${v.text}`;
}
