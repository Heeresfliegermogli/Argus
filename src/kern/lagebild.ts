// Lagebild: was eine Rolle auf der Lagekarte sieht. Reine Funktion von Inhalten, Spielstand und
// Lagezeit; die Karte (src/karte/) zeichnet nur, was hier herauskommt. Damit steht die
// Informationsverteilung auch für die Karte an einer Stelle und ist testbar.
//
//  • G2 und G3 sehen die Zielmeldungen an der gemeldeten Position mit dem Zeichen der ARGUS-Klasse –
//    nie die Ground Truth, nie ungemeldete Ziele, keine Personen.
//  • Spielleitung und Plenum (Auflösung) sehen die Kontrollkarte: alle Ziele nach Ground Truth,
//    auch ungemeldete, Personen und getroffene Personen, alle Wirkungen mit Ergebnis.
//
// Bewegung: In Schritt 6 zeigt die Kontrollkarte die Lage zur übergebenen Lagezeit als Standbild
// (position(ziel, t)). Flüssige Bewegung und Animationen kommen in Schritt 7 dazu, indem die Karte
// die Lagezeit fortlaufend setzt.
import type { GtKategorie, Inhalte, Meldung, Punkt } from "../inhalte/typen";
import { zeichenArgus, zeichenZiel } from "../karte/zeichen";
import { feinlage, gtBei, position, vorhanden } from "./geometrie";
import { gemeldetePosition } from "./regeln";
import { STUFE_TEXT, ERGEBNIS_TEXT, zielNummer } from "./sichten";
import { uhrzeit } from "./uhr";
import type { MeldungsStand, Spielzustand } from "./zustand";

export type ObjektZustand = "offen" | "zurueckgestellt" | "freigegeben" | "bekaempft" | "erledigt";

export interface KartenObjekt {
  /** eindeutig je Lagebild (Ziel-Nr.) */
  id: string;
  pos: Punkt;
  sidc: string;
  /** Anzahl Fahrzeuge (Gruppenmeldung), wird am Zeichen angeschrieben */
  menge?: number;
  /** kurze Beschriftung unter dem Zeichen */
  text: string;
  /** erste Zeile des Tooltips */
  titel: string;
  zeilen: string[];
  zustand: ObjektZustand;
  /** Meldung, die ein Klick auswählt (G2/G3) */
  meldung?: string;
  /** alle Meldungen zu diesem Ziel */
  meldungen?: string[];
  /** nur Kontrollkarte: Ground Truth, Sprite für starken Zoom */
  kategorie?: GtKategorie;
  ungemeldet?: boolean;
  /** nur Kontrollkarte: Schutzzeichen am Zeichen (Rotes Kreuz bei Sanität, sonst allgemein geschützt) */
  schutz?: "rotes_kreuz" | "geschuetzt";
  sprite?: { name: string; hdg: number };
}

export interface PersonenMarke {
  id: string;
  pos: Punkt;
  art: string;
  anzahl: number;
  klein?: number;
  getroffen: boolean;
  titel: string;
}

export interface WirkungsMarke {
  id: string;
  pos: Punkt;
  radius_m: number;
  text: string;
  zeilen: string[];
  /** Kontrollkarte: Wirkung traf Geschütztes, Verbündete, Zivilpersonen oder eine Attrappe */
  fehl?: boolean;
  /** freigegeben, Einschlag steht noch aus (Vorlaufzeit läuft): nur Umriss, Uhrzeit des Einschlags */
  geplant?: boolean;
}

export interface Lagebild {
  objekte: KartenObjekt[];
  personen: PersonenMarke[];
  wirkungen: WirkungsMarke[];
}

export const LEER: Lagebild = { objekte: [], personen: [], wirkungen: [] };

/** Die Kontrollkarte zeigt die Lage als Standbild in diesem Takt (Spielzeit); Bewegung folgt in Schritt 7. */
export const LAGE_TAKT_S = 5;

const PERSONEN_NAME: Record<string, string> = {
  zivil: "Zivilpersonen",
  soldat: "Soldaten",
  besatzung_ergibt_sich: "Besatzung, ergibt sich",
};

export const GT_NAME: Record<GtKategorie, string> = {
  feind: "Feind",
  verbuendet: "verbündet",
  zivil: "zivil",
  geschuetzt: "geschützt",
  attrappe: "Attrappe",
  ausser_gefecht: "außer Gefecht",
};

/** Kategorien, deren Treffer eine Fehlbekämpfung ist (für die Kontrollkarte). */
const FEHL = new Set(["verbuendet", "zivil", "geschuetzt", "attrappe", "ausser_gefecht", "besatzung_ergibt_sich"]);

/** Hat diese Rolle die Meldung als Zielmeldung bekommen? */
function erreicht(st: MeldungsStand, rolle: "g2" | "g3"): boolean {
  if (rolle === "g2") return st.fastTrack || st.g1?.entscheid === "annehmen";
  return st.stufe === "g3" || !!st.g3 || !!st.wirkung;
}

function zustandFuer(st: MeldungsStand, rolle: "g2" | "g3"): ObjektZustand {
  if (st.ergebnis === "bekaempft") return "bekaempft";
  if (st.stufe === "wirkung") return "freigegeben";
  if (st.stufe === rolle) return st.beobachten ? "zurueckgestellt" : "offen";
  return "erledigt";
}

/** Freigegebene Wirkung, deren Vorlaufzeit noch läuft (für alle Karten gleich). */
function geplanteWirkung(inh: Inhalte, m: Meldung, st: MeldungsStand): WirkungsMarke | null {
  if (st.stufe !== "wirkung" || st.wirkung || !st.g3?.wirkmittel) return null;
  const wm = inh.wirkmittel[st.g3.wirkmittel];
  if (!wm) return null;
  const start = inh.szenario.spieluhr.start;
  return {
    id: `W-${m.id}`,
    pos: gemeldetePosition(inh, m),
    radius_m: wm.wirkradius_m,
    text: `${m.id} ${wm.kurz} · ${uhrzeit(start, st.g3.t_s + wm.vorlauf_s)}`,
    zeilen: [`freigegeben ${uhrzeit(start, st.g3.t_s)}, Einschlag ${uhrzeit(start, st.g3.t_s + wm.vorlauf_s)}`, wm.name],
    geplant: true,
  };
}

const RANG: Record<ObjektZustand, number> = { offen: 5, zurueckgestellt: 4, freigegeben: 3, bekaempft: 2, erledigt: 1 };

function standText(st: MeldungsStand): string {
  if (st.ergebnis) return ERGEBNIS_TEXT[st.ergebnis];
  if (st.beobachten) return "zurückgestellt (BEOBACHTEN)";
  return STUFE_TEXT[st.stufe];
}

/**
 * Zielmeldungen für G2 oder G3. Mehrere Meldungen zum selben Ziel (Folgemeldung) ergeben ein
 * Zeichen; ein Klick wählt die Meldung, die bei dieser Rolle offen ist, sonst die neueste.
 */
export function lagebildZielmeldungen(inh: Inhalte, z: Spielzustand, rolle: "g2" | "g3"): Lagebild {
  const start = inh.szenario.spieluhr.start;
  const proZiel = new Map<string, { m: Meldung; st: MeldungsStand }[]>();
  for (const id of z.reihenfolge) {
    const st = z.meldungen[id];
    if (!st || st.stufe === "entfallen" || !erreicht(st, rolle)) continue;
    const m = inh.meldungen[id];
    const nr = zielNummer(inh, m);
    proZiel.set(nr, [...(proZiel.get(nr) ?? []), { m, st }]);
  }
  const objekte: KartenObjekt[] = [];
  const wirkungen: WirkungsMarke[] = [];
  for (const [nr, liste] of proZiel) {
    const sortiert = [...liste].sort((a, b) => RANG[zustandFuer(b.st, rolle)] - RANG[zustandFuer(a.st, rolle)]
      || b.st.erschienen.seq - a.st.erschienen.seq);
    const { m, st } = sortiert[0];
    const zustand = zustandFuer(st, rolle);
    const bekaempft = liste.some((x) => x.st.ergebnis === "bekaempft");
    const pos = gemeldetePosition(inh, m);
    const ids = liste.map((x) => x.m.id);
    objekte.push({
      id: nr,
      pos,
      sidc: zeichenArgus(inh, m.argus.klasse, m.argus.konfidenz, bekaempft ? "X" : "P"),
      menge: m.ziele.length > 1 ? m.ziele.length : undefined,
      text: ids.join("/"),
      titel: `${ids.join(", ")} · ${m.argus.klasse} · ${m.argus.konfidenz} %`,
      zeilen: [`Ziel ${nr} · ${feinlage(pos, inh.karte)}`, ...liste.map((x) => `${x.m.id}: ${standText(x.st)}`)],
      zustand: bekaempft ? "bekaempft" : zustand,
      meldung: m.id,
      meldungen: ids,
    });
    for (const x of liste) {
      const geplant = geplanteWirkung(inh, x.m, x.st);
      if (geplant) wirkungen.push(geplant);
      const w = x.st.wirkung;
      if (!w) continue;
      const wm = inh.wirkmittel[w.wirkmittel];
      wirkungen.push({
        id: `W-${x.m.id}`,
        pos: w.pos,
        radius_m: wm?.wirkradius_m ?? 0,
        text: `${x.m.id} ${wm?.kurz ?? w.wirkmittel}`,
        zeilen: [`Wirkung ${uhrzeit(start, w.t_s)} mit ${wm?.name ?? w.wirkmittel}`, `freigegeben ${uhrzeit(start, w.t_freigabe)}`],
      });
    }
  }
  return { objekte, personen: [], wirkungen };
}

/**
 * Kontrollkarte: alle Ziele nach Ground Truth zur Lagezeit tLage. Zerstörte Fahrzeuge bleiben als
 * Wrack an der Stelle, an der sie getroffen wurden.
 */
export function lagebildKontrolle(inh: Inhalte, z: Spielzustand, tLage: number): Lagebild {
  const start = inh.szenario.spieluhr.start;
  const gemeldetIn = new Map<string, string[]>();
  for (const m of inh.szenario.meldungen) for (const zid of m.ziele) gemeldetIn.set(zid, [...(gemeldetIn.get(zid) ?? []), m.id]);

  const getroffenePersonen = new Set<string>();
  const wirkungen: WirkungsMarke[] = [];
  for (const id of z.reihenfolge) {
    const st = z.meldungen[id];
    const geplant = st && geplanteWirkung(inh, inh.meldungen[id], st);
    if (geplant) wirkungen.push(geplant);
    const w = st?.wirkung;
    if (!w) continue;
    const wm = inh.wirkmittel[w.wirkmittel];
    for (const g of w.getroffen) if (g.was === "personen") getroffenePersonen.add(`${g.ziel}:${g.kategorie}`);
    const treffer = w.getroffen.map((g) => g.was === "personen"
      ? `${g.ziel}: ${g.anzahl ?? ""} ${PERSONEN_NAME[g.kategorie] ?? g.kategorie}`.replace("  ", " ")
      : `${g.ziel} (${GT_NAME[g.kategorie as GtKategorie] ?? g.kategorie})`);
    wirkungen.push({
      id: `W-${id}`,
      pos: w.pos,
      radius_m: wm?.wirkradius_m ?? 0,
      text: `${id} ${wm?.kurz ?? w.wirkmittel}`,
      zeilen: [`Wirkung ${uhrzeit(start, w.t_s)} (frei ${uhrzeit(start, w.t_freigabe)}) mit ${wm?.name ?? w.wirkmittel}`,
        treffer.length ? `getroffen: ${treffer.join(", ")}` : "nichts getroffen"],
      fehl: w.getroffen.some((g) => FEHL.has(g.kategorie)),
    });
  }

  const objekte: KartenObjekt[] = [];
  const personen: PersonenMarke[] = [];
  for (const ziel of inh.szenario.ziele) {
    const tZerst = z.zerstoert[ziel.id];
    const zerstoert = tZerst !== undefined && tZerst <= tLage + 1e-6;
    if (!zerstoert && !vorhanden(ziel, tLage)) continue;
    const pos = position(ziel, zerstoert ? tZerst : tLage);
    const f = inh.fahrzeuge[ziel.typ];
    const meld = gemeldetIn.get(ziel.id) ?? [];
    const gt = gtBei(ziel, zerstoert ? tZerst : tLage);
    objekte.push({
      id: ziel.id,
      pos,
      sidc: zeichenZiel(inh, { ...ziel, gt }, zerstoert),
      text: ziel.id,
      titel: `${ziel.id} · ${f?.name ?? ziel.typ}`,
      zeilen: [
        `${GT_NAME[gt.kategorie]}: ${gt.text}`,
        ziel.ungemeldet ? "von ARGUS nicht gemeldet" : `gemeldet in ${meld.join(", ")}`,
        ...(zerstoert ? [`zerstört ${uhrzeit(start, tZerst)}`] : []),
      ],
      zustand: zerstoert ? "bekaempft" : "offen",
      kategorie: gt.kategorie,
      ungemeldet: !!ziel.ungemeldet,
      schutz: gt.kategorie === "geschuetzt" ? (f?.symbol?.art === "sanitaet" ? "rotes_kreuz" : "geschuetzt") : undefined,
      sprite: f?.sprite ? { name: (zerstoert ? f.sprite_wrack : f.sprite) ?? f.sprite, hdg: ziel.hdg } : undefined,
    });
    (ziel.personen ?? []).forEach((p, i) => {
      if (!vorhanden(p, tLage, ziel)) return;
      personen.push({
        id: `${ziel.id}-P${i + 1}`,
        pos: position(p, tLage),
        art: p.art,
        anzahl: p.anzahl,
        klein: p.klein,
        getroffen: getroffenePersonen.has(`${ziel.id}:${p.art}`),
        titel: `${p.anzahl} ${PERSONEN_NAME[p.art] ?? p.art}${p.klein ? `, davon ${p.klein} Kinder` : ""} bei ${ziel.id}${p.text ? ` – ${p.text}` : ""}`,
      });
    });
  }
  return { objekte, personen, wirkungen };
}

/** Kurzer Schlüssel, damit die Karte nur neu zeichnet, wenn sich das Lagebild ändert. */
export function lagebildSchluessel(lb: Lagebild): string {
  return [
    lb.objekte.map((o) => `${o.id}@${Math.round(o.pos[0])},${Math.round(o.pos[1])}:${o.sidc}:${o.zustand}:${o.text}`).join(";"),
    lb.personen.map((p) => `${p.id}@${Math.round(p.pos[0])},${Math.round(p.pos[1])}:${p.getroffen ? 1 : 0}`).join(";"),
    lb.wirkungen.map((w) => `${w.id}${w.geplant ? "?" : ""}`).join(";"),
  ].join("|");
}
