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

// ---------------------------------------------------------------- Zug-Bekämpfung (seit Szenario 2.4, E3)

/** Wie BEKÄMPFEN auf einen Zug wirkt: „je_fahrzeug“ (LM, PzAbw) oder „flaeche“ (Mörser; ohne Angabe). */
export function zugArt(wm: Wirkmittel | undefined): "je_fahrzeug" | "flaeche" {
  return wm?.zug?.art ?? "flaeche";
}

/** Fahrzeuge der Meldung, die zur Zeit t im Raum und nicht zerstört sind (Reihenfolge der Meldung). */
export function stehende(inh: Inhalte, ziele: string[], t: number, zerstoert: Record<string, number> = {}): string[] {
  return ziele.filter((id) => inh.ziele[id] && vorhanden(inh.ziele[id], t) && !((zerstoert[id] ?? Infinity) <= t));
}

/**
 * Alle Einschläge einer Freigabe (wie argus_lib.einschlaege): Fläche (Mörser) ein Einschlag wie einschlag(); je Fahrzeug
 * (LM, PzAbw) ein Schuss je bei der Freigabe noch stehendem Fahrzeug, der i-te startet zug.abstand_s · i nach der Freigabe.
 * bestand (endlich): höchstens so viele Fahrzeuge, wie Munition da ist (mindestens eines).
 */
export function einschlaege(
  inh: Inhalte, ziele: string[], wmId: string, tFreigabe: number, zerstoert: Record<string, number> = {}, bestand: number | null = null,
): Einschlag[] {
  const wm = inh.wirkmittel[wmId];
  if (zugArt(wm) !== "je_fahrzeug") return [einschlag(inh, ziele, wmId, tFreigabe, zerstoert)];
  let kand = stehende(inh, ziele, tFreigabe, zerstoert);
  if (!kand.length) return [einschlag(inh, ziele, wmId, tFreigabe, zerstoert)];
  if (bestand !== null) kand = kand.slice(0, Math.max(1, bestand));
  const abstand = wm.zug?.abstand_s ?? 0;
  return kand.map((id, i) => {
    const z0 = inh.ziele[id];
    const t0 = tFreigabe + i * abstand;
    let t = t0 + flugzeit(wm, position(z0, t0));
    for (let k = 0; k < 4; k++) t = t0 + flugzeit(wm, position(z0, t));
    return { t, pos: position(z0, t), ziel: id };
  });
}

/** Ergebnis einer Freigabe über alle Einschläge (Zug): erster Einschlag, Prüfung und Treffer zusammengefasst, je Einschlag einzeln. */
export interface ZugWirkung extends Wirkungsergebnis {
  /** je Einschlag (nacheinander gerechnet: ein Fahrzeug, das ein früherer Einschlag zerstört hat, zählt beim nächsten als Wrack) */
  teile: Wirkungsergebnis[];
  /** Fahrzeuge der Meldung, die bei der Freigabe noch stehen */
  n: number;
  /** davon bekämpft (je Fahrzeug: höchstens der Bestand; Fläche: 1) */
  k: number;
}

/** Treffer zusammenfassen: ein Eintrag je Ziel und Art (Fahrzeug/Attrappe bzw. Personenart). */
export function trefferVereint(liste: Treffer[]): Treffer[] {
  const out: Treffer[] = [];
  const gesehen = new Set<string>();
  for (const g of liste) {
    const k = `${g.ziel}|${g.was === "personen" ? "p" : "f"}|${g.kategorie}`;
    if (gesehen.has(k)) continue;
    gesehen.add(k);
    out.push(g);
  }
  return out;
}

/** Was eine Freigabe mit allen ihren Einschlägen trifft (wie argus_lib.wirkung seit 2.4). */
export function wirkungZug(inh: Inhalte, e: Einschlag[], wmId: string, zerstoert: Record<string, number> = {}, n = e.length): ZugWirkung {
  const zer = { ...zerstoert };
  const teile = e.map((x) => {
    const w = wirkungBeimEinschlag(inh, x, wmId, zer);
    for (const g of w.getroffen) if (g.was !== "personen") zer[g.ziel] = Math.min(zer[g.ziel] ?? Infinity, x.t);
    return w;
  });
  const verstoesse: Verstoss[] = [];
  for (const w of teile) for (const v of w.pruefung.verstoesse) if (!verstoesse.some((x) => x.regel === v.regel && x.text === v.text)) verstoesse.push(v);
  const getroffen = trefferVereint(teile.flatMap((w) => w.getroffen));
  return {
    einschlag: teile[0].einschlag,
    pruefung: { zulaessig: teile.every((w) => w.pruefung.zulaessig), verstoesse, getroffen: trefferVereint(teile.flatMap((w) => w.pruefung.getroffen)) },
    getroffen, teile, n, k: e.length,
  };
}

/**
 * Vorhersage für eine Freigabe zur Zeit tFreigabe (Warnungen G2/G3): alle Einschläge (seit 2.4 je Fahrzeug eines Zuges),
 * Regelprüfung und Treffer dort. bestand: Restbestand des Wirkmittels (null = unbegrenzt).
 */
export function vorhersage(
  inh: Inhalte, m: Meldung, wmId: string, tFreigabe: number, zerstoert: Record<string, number> = {}, bestand: number | null = null,
): ZugWirkung {
  const e = einschlaege(inh, m.ziele, wmId, tFreigabe, zerstoert, bestand);
  const n = zugArt(inh.wirkmittel[wmId]) === "je_fahrzeug" ? Math.max(1, stehende(inh, m.ziele, tFreigabe, zerstoert).length) : 1;
  return wirkungZug(inh, e, wmId, zerstoert, n);
}

export function trefferText(t: Treffer): string {
  if (t.was === "personen") return `${t.ziel}: ${t.anzahl ?? ""} ${PERSONEN_TEXT[t.kategorie] ?? t.kategorie}`.trim();
  return `${t.ziel}${t.was === "attrappe" ? " (Attrappe)" : ""}`;
}

/** Warnungstext je Verstoß, mit Uhrzeit des Einschlags (für Protokoll und Anzeige). */
export function verstossText(v: Verstoss): string {
  return `${v.regel}: ${v.text}`;
}
