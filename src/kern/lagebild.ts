// Lagebild: was eine Rolle auf der Lagekarte sieht. Reine Funktion von Inhalten, Spielstand und
// Lagezeit; die Karte (src/karte/) zeichnet nur, was hier herauskommt. Damit steht die
// Informationsverteilung auch für die Karte an einer Stelle und ist testbar.
//
//  • Das Team (seit 2.6 eine Rolle, Zielbearbeitung) sieht die Zielmeldungen an der gemeldeten Position mit dem Zeichen der
//    ARGUS-Klasse – nie die Ground Truth, nie ungemeldete Ziele, keine Personen.
//  • Spielleitung und Plenum (Auflösung) sehen die Kontrollkarte: alle Ziele nach Ground Truth,
//    auch ungemeldete, Personen und getroffene Personen, alle Wirkungen mit Ergebnis.
//
// Bewegung (seit Schritt 7): Jedes Objekt trägt seine Route (`bahn`); die Karte rechnet daraus in jedem
// Bild die Position zur laufenden Spielzeit, ein zerstörtes Fahrzeug bleibt ab seiner Zerstörung als
// Wrack stehen. Das Lagebild selbst wird nur bei neuen Ereignissen und im Sekundentakt neu berechnet.
//
// Tracking: Gemeldete Ziele bleiben auf der Karte des Teams als Spur stehen und bewegen sich
// mit – an der Position des ersten noch stehenden Fahrzeugs der Meldung, mit dem Zeichen der ARGUS-Klasse
// (nie Ground Truth). Sind alle Fahrzeuge zerstört, bleibt das Zeichen durchgestrichen am Wrack; nach der
// eigenen Wirkung bleibt es beim bekämpften Fahrzeug am Einschlagort (Rest eines Zuges meldet ARGUS neu).
// Seit 2.7 (I1.2) verschwindet kein gemeldetes Ziel ohne Erklärung: Verlässt es den Raum, bleibt das Zeichen am Kartenrand stehen,
// wo es hinausfuhr – „durchgebrochen“ (über Brücke oder Furt nach Westen) oder „abgezogen“; der Eingang zeigt einen Vermerk
// (kern/sichten.ts, vermerke). Seit 2.7 (I3.2): Nach der Auflösung (A-01) zeigt das Zeichen der PT-91 blau „PL-PzKp (verbündet)“, nach
// Eigenbeschuss (I-08a) „verbündet, getroffen“.
import type { ArgusAusgabe, GtKategorie, Inhalte, Meldung, Punkt, RoutenPunkt } from "../inhalte/typen";
import { ZEICHEN_KONTAKT, sidc, zeichenArgus, zeichenZiel } from "../karte/zeichen";
import { durchbruchUeber } from "./durchbruch";
import { ausrichtung, dist, feinlage, gtBei, imPolygon, position, vorhanden } from "./geometrie";
import { einschlaegeVon, offeneEinschlaege } from "./lage";
import { gemeldetePosition } from "./regeln";
import { argusBei } from "./eloka";
import { standText, zielNummer } from "./sichten";
import { uhrzeit } from "./uhr";
import { panzer as eigenePanzer, PANZER_STUFE_TEXT, type Stufe, stand as verlustPanzerStand, trefferText, verlustLage, verwText, zug as zugStand, type ZugStand } from "./verluste";
import { zielNr } from "./zielnummern";
import type { MeldungsStand, Spielzustand } from "./zustand";
import type { TrefferDaten } from "./ereignisse";

export type ObjektZustand = "offen" | "zurueckgestellt" | "freigegeben" | "bekaempft" | "erledigt";

/**
 * Bewegung eines Objekts für die Karte: Position zur Spielzeit t = position(route, min(t, halt)),
 * sichtbar zwischen ab und bis (ein Wrack mit halt bleibt stehen). Ohne bahn steht das Objekt bei pos.
 */
export interface Bahn {
  route: RoutenPunkt[];
  /** ab hier steht das Objekt (Zerstörung) */
  halt?: number;
  ab?: number;
  bis?: number;
  /** Ausrichtung ohne Fahrt (Daten) */
  hdg?: number;
}

/** Position und Ausrichtung eines Objekts zur Spielzeit t nach seiner Bahn; null, wenn es dann nicht da ist. */
export function bahnLage(b: Bahn, t: number): { pos: Punkt; hdg: number } | null {
  if (b.halt === undefined && ((b.ab !== undefined && t < b.ab) || (b.bis !== undefined && t >= b.bis))) return null;
  const tt = b.halt !== undefined ? Math.min(t, b.halt) : t;
  const obj = { pos: [b.route[0]?.[1] ?? 0, b.route[0]?.[2] ?? 0] as Punkt, bewegung: { route: b.route }, hdg: b.hdg };
  return { pos: position(obj, tt), hdg: ausrichtung(obj, tt) };
}

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
  /** Meldung, die ein Klick auswählt (Team) */
  meldung?: string;
  /** alle Meldungen zu diesem Ziel */
  meldungen?: string[];
  /** nur Kontrollkarte: Ground Truth, Sprite für starken Zoom */
  kategorie?: GtKategorie;
  ungemeldet?: boolean;
  /** nur Kontrollkarte: Schutzzeichen am Zeichen (Rotes Kreuz bei Sanität, sonst allgemein geschützt) */
  schutz?: "rotes_kreuz" | "geschuetzt";
  /**
   * Sprite (Kontrollkarte beim Hineinzoomen): name intakt; ab `wrackAb` das Wrack, ab `zustandAb` der
   * Zustands-Sprite (z. B. `kpz_t72_kette_ab.png` für außer Gefecht). Die Karte wählt je Bild nach der Spielzeit.
   */
  sprite?: { name: string; hdg: number; wrack?: string; wrackAb?: number; zustand?: string; zustandAb?: number; fahrt?: string; fahrtBis?: number };
  /** Bewegung (die Karte rechnet die Position je Bild); fehlt bei stehenden Objekten */
  bahn?: Bahn;
  /** alle Fahrzeuge zerstört (Zeichen durchgestrichen), auch wenn nicht von diesem Team bekämpft */
  zerstoert?: boolean;
  /**
   * Seit 2.2: „kontakt“ = Bewegung erkannt, keine Meldung beim Team (C1);
   * „teil“ = Fahrzeug einer Meldung, das sich vom Zeichen entfernt hat; „wrack“ = getroffenes Fahrzeug einer
   * zugweisen Meldung am Einschlagort (C8). Kleiner gezeichnet, ohne Marke, nicht anklickbar.
   */
  art?: "kontakt" | "teil" | "wrack";
  /** seit 2.7 (I1.2): hat den Raum verlassen – das Zeichen steht am Kartenrand, wo das Fahrzeug hinausfuhr */
  weg?: "durchgebrochen" | "abgezogen";
  /** seit 2.7 (I3.2): als verbündet erkannt (blau), nicht mehr zu bekämpfen */
  verbuendet?: boolean;
  /** trotz Zustand „erledigt“ voll sichtbar (verbündet, durchgebrochen) */
  hervor?: boolean;
}

export interface PersonenMarke {
  id: string;
  pos: Punkt;
  bahn?: Bahn;
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
  /** freigegeben, Einschlag steht noch aus (Vorlaufzeit läuft): nur Umriss, Countdown bis zum Einschlag (seit 2.6, H5.3) */
  geplant?: boolean;
  /** Spielzeit des Einschlags (Countdown) und bekämpftes Fahrzeug (Marke am Ziel) */
  t_einschlag?: number;
  ziel?: string;
  /** Meldung der Wirkung */
  meldung?: string;
}

/** Seit 2.5 (F1/F2.6): ein Kampfpanzer der eigenen 1. Kp auf der Karte – alle Rollen sehen ihn und seinen Zustand. */
export interface EigenerPanzerMarke {
  id: string;
  /** „1/1“ */
  name: string;
  pos: Punkt;
  hdg: number;
  sidc: string;
  zustand: number;
  stufe: Stufe;
  ausgefallen: boolean;
  verwundete: number;
  /** Spielzeiten von Treffern um die Lagezeit (das Zeichen blinkt kurz) */
  treffer: number[];
  titel: string;
  zeilen: string[];
}

export interface EigeneLage {
  panzer: EigenerPanzerMarke[];
  zug: ZugStand;
}

export interface Lagebild {
  objekte: KartenObjekt[];
  personen: PersonenMarke[];
  wirkungen: WirkungsMarke[];
  /** seit 2.3: eigene Truppe mit Zustand, seit 2.5 vier Panzer (fehlt ohne eigene Truppe) */
  eigene?: EigeneLage;
}

/** Zeichen eines eigenen Kampfpanzers (APP-6 Gerät „Kampfpanzer“, eigen); ausgefallen: beschädigt (Querstrich), grau gezeichnet. */
export const ZEICHEN_EIGENER_PANZER = "SFGPEVAT-------";
export const ZEICHEN_EIGENER_PANZER_AUS = "SFGDEVAT-------";

/** Eigene Panzer zur Lagezeit t (F1): Stellung, Zustand, Stufe und Verwundete aus dem Verlustmodell (kern/verluste.ts). */
export function eigeneLage(inh: Inhalte, z: Spielzustand, t: number): EigeneLage | undefined {
  const et = (inh.basis ?? inh).szenario.eigene_truppe;
  if (!et) return undefined;
  const vr = inh.regeln.verluste;
  const l = vr ? verlustLage(inh, z) : null;
  const st = l ? verlustPanzerStand(l.welt, l.ereignisse, t) : {};
  const marken = eigenePanzer(inh).map((pz) => {
    const s = st[pz.id] ?? { zustand: 100, stufe: "einsatzbereit" as Stufe, ausgefallen: false, verwundete: 0, treffer: 0, roh: 100 };
    const treffer = (l?.ereignisse ?? []).filter((e) => e.panzer === pz.id && e.ergebnis === "treffer" && e.t > t - 3 && e.t <= t + 2).map((e) => e.t);
    return {
      id: pz.id, name: pz.name, pos: pz.pos, hdg: pz.hdg, sidc: s.ausgefallen ? ZEICHEN_EIGENER_PANZER_AUS : ZEICHEN_EIGENER_PANZER,
      zustand: s.zustand, stufe: s.stufe, ausgefallen: s.ausgefallen, verwundete: s.verwundete, treffer,
      titel: `${pz.name} (eigen${pz.rolle ? `, ${pz.rolle}` : ""}) · ${pz.ort}`,
      zeilen: [`${et.einheit} · Kampfpanzer`, `${PANZER_STUFE_TEXT[s.stufe]} · ${s.zustand} % · ${trefferText(s.treffer)}${s.verwundete ? ` · ${verwText(s.verwundete)}` : ""}`],
    };
  });
  return { panzer: marken, zug: zugStand(Object.fromEntries(marken.map((m) => [m.id, st[m.id] ?? { zustand: 100, roh: 100, ausgefallen: false, treffer: 0, stufe: "einsatzbereit" as Stufe, verwundete: 0 }]))) };
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

/** Kategorien, deren Treffer eine Fehlbekämpfung ist (Kontrollkarte, Übersicht der Spielleitung). */
export const FEHL = new Set(["verbuendet", "zivil", "geschuetzt", "attrappe", "ausser_gefecht", "besatzung_ergibt_sich"]);

function zustandFuer(st: MeldungsStand): ObjektZustand {
  if (st.ergebnis === "bekaempft") return "bekaempft";
  if (st.stufe === "wirkung") return "freigegeben";
  if (st.stufe === "offen") return st.zurueckgestellt ? "zurueckgestellt" : "offen";
  return "erledigt";
}

/** Kennung der Wirkungsmarke: W-M07 (erster Einschlag), bei einem Zug W-M07-1, W-M07-2 … (seit 2.4, E3). */
function markenId(id: string, nr: number): string {
  return nr ? `W-${id}-${nr}` : `W-${id}`;
}

/** Freigegebene Wirkung, deren Einschläge noch ausstehen (für alle Karten gleich): Ort und Zeit vorausberechnet, je Einschlag. */
function geplanteWirkungen(inh: Inhalte, z: Spielzustand, m: Meldung, st: MeldungsStand): WirkungsMarke[] {
  if (st.stufe !== "wirkung" || st.wirkung || !st.freigabe?.wirkmittel) return [];
  const wm = inh.wirkmittel[st.freigabe.wirkmittel];
  if (!wm) return [];
  const start = inh.szenario.spieluhr.start;
  const alle = einschlaegeVon(inh, z, m.id);
  const zug = alle.length > 1 ? ` ×${alle.length}` : "";
  return offeneEinschlaege(inh, z, m.id).map(({ nr, e }) => ({
    id: markenId(m.id, nr),
    pos: e.pos,
    radius_m: wm.wirkradius_m,
    text: `Ziel ${zielNr(inh, z, m.id)} ${wm.kurz}${zug}`,
    zeilen: [`bekämpft ${uhrzeit(start, st.freigabe!.t_s)}, Einschlag vorausberechnet`, wm.name],
    geplant: true,
    t_einschlag: e.t,
    ziel: e.ziel,
    meldung: m.id,
  }));
}

/** Eingeschlagene Wirkungen einer Meldung, je Einschlag (seit 2.4 bei einem Zug mehrere). */
function einschlagListe(st: MeldungsStand): { nr: number; pos: Punkt; t: number; getroffen: TrefferDaten[] }[] {
  if (st.wirkungen?.length) return st.wirkungen.map((w) => ({ nr: w.nr, pos: w.pos, t: w.t_einschlag, getroffen: w.getroffen }));
  return st.wirkung ? [{ nr: 0, pos: st.wirkung.pos, t: st.wirkung.t_einschlag, getroffen: st.wirkung.getroffen }] : [];
}

/** Ab wann das Hintergrundgefecht ein Ziel außer Gefecht gesetzt hat (folge ausser_gefecht, wirkt); sonst undefined. */
export function ausserGefechtAb(inh: Inhalte, z: Spielzustand, id: string): number | undefined {
  for (const h of inh.szenario.hintergrund?.ereignisse ?? []) {
    if (h.art === "panzerabwehr" && h.ziel === id && h.folge === "ausser_gefecht" && z.hintergrund[h.id]?.wirkt) return h.t_s;
  }
  return undefined;
}

/** Bahn eines Ziels: Route aus den Daten, angehalten bei der Zerstörung. */
export function zielBahn(inh: Inhalte, z: Spielzustand, id: string): Bahn | undefined {
  const ziel = inh.ziele[id];
  if (!ziel) return undefined;
  const route: RoutenPunkt[] = ziel.bewegung?.route?.length ? ziel.bewegung.route : [[0, ziel.pos[0], ziel.pos[1]]];
  const ab = ziel.ab_s ?? (ziel.bewegung?.route?.length ? ziel.bewegung.route[0][0] : undefined);
  return { route, halt: z.zerstoert[id], ab, bis: ziel.bis_s, hdg: ziel.hdg };
}

const RANG: Record<ObjektZustand, number> = { offen: 5, zurueckgestellt: 4, freigegeben: 3, bekaempft: 2, erledigt: 1 };

/** Bis zu diesem Abstand vom Zeichen gehört ein Fahrzeug der Meldung zum Zeichen (Zahl, Größenangabe); weiter weg
 *  bekommt es ein eigenes kleines Zeichen (seit 2.2). */
export const GRUPPE_RADIUS_M = 40;

/** So weit vom Kartenrand (m) steht das Zeichen eines Ziels, das den Raum verlassen hat (seit 2.7, I1.2). */
export const RAND_M = 14;

/** Punkt auf die Karte ziehen (mit Abstand RAND_M vom Rand). */
function amRand(inh: Inhalte, p: Punkt): Punkt {
  const { breite, hoehe } = inh.karte.ausdehnung_m;
  return [Math.max(RAND_M, Math.min(breite - RAND_M, p[0])), Math.max(RAND_M, Math.min(hoehe - RAND_M, p[1]))];
}

/** Zeichen einer verbündeten Kraft nach der Auflösung (seit 2.7, I3.2): Panzer-Einheit, Größe Kompanie; getroffen = beschädigt. */
export function zeichenVerbuendet(getroffen: boolean, zerstoert = false): string {
  return sidc("F", "UCA", { status: zerstoert ? "X" : getroffen ? "D" : "P", groesse: "E" });
}

/** Liegt die Position im Wald? Dort sieht die Drohne keine Bewegung (kein Kontakt, seit 2.2). */
export function imWald(inh: Inhalte, p: Punkt): boolean {
  return inh.karte.flaechen.some((f) => f.art === "wald" && imPolygon(p, f.punkte as Punkt[]));
}

function stehtNoch(inh: Inhalte, z: Spielzustand, id: string, t: number): boolean {
  const ziel = inh.ziele[id];
  return !!ziel && !(z.zerstoert[id] !== undefined && z.zerstoert[id] <= t + 1e-6) && vorhanden(ziel, t);
}

/**
 * Zielmeldungen für das Team. Mehrere Meldungen zum selben Ziel (Folgemeldung) ergeben ein
 * Zeichen; ein Klick wählt die Meldung, die offen ist, sonst die neueste.
 * Mit tLage folgt das Zeichen dem Ziel (Tracking, `bahn`); ohne steht es an der gemeldeten Position.
 *
 * Seit 2.2 (Änderungen C1, C7, C8 nach dem 2. Solo-Durchlauf), nur mit tLage:
 *  • Das Zeichen folgt den noch stehenden Fahrzeugen der Meldung (Zahl und Größenangabe nach APP-6 verringern sich);
 *    jedes getroffene Fahrzeug einer zugweisen Meldung bekommt ein eigenes durchgestrichenes Zeichen am Wrack.
 *  • Entfernt sich ein Fahrzeug der Meldung weiter als GRUPPE_RADIUS_M vom Zeichen, bekommt es ein eigenes kleines
 *    Zeichen („teil“), bis ARGUS es neu meldet.
 *  • Jedes andere Fahrzeug, das die Drohne sieht (nicht im Wald, nicht ungemeldet, mit Route), steht ab der Einfahrt
 *    als Kontakt auf der Karte, bis eine Meldung dazu bei der Rolle ankommt. So erscheint kein Fahrzeug mitten im Bild.
 */
export function lagebildZielmeldungen(inh: Inhalte, z: Spielzustand, tLage?: number): Lagebild {
  const start = inh.szenario.spieluhr.start;
  const proZiel = new Map<string, { m: Meldung; st: MeldungsStand }[]>();
  for (const id of z.reihenfolge) {
    const st = z.meldungen[id];
    const m = inh.meldungen[id];
    if (!st || !m) continue;
    if (st.stufe === "entfallen" && !st.entfallen) continue; // schon beim Erscheinen entfallen: nie gesehen
    const nr = zielNummer(inh, m);
    proZiel.set(nr, [...(proZiel.get(nr) ?? []), { m, st }]);
  }
  const objekte: KartenObjekt[] = [];
  const wirkungen: WirkungsMarke[] = [];
  /** je Zeichen: Fahrzeug, dem es folgt, und alle Fahrzeuge seiner Meldungen (für Teil-, Wrack- und Kontaktzeichen) */
  const zeichen: { o: KartenObjekt; fuehrer: string | null; fahrzeuge: string[]; m: Meldung; nummern: string[]; argus: ArgusAusgabe }[] = [];
  for (const [nr, liste] of proZiel) {
    const sortiert = [...liste].sort((a, b) => RANG[zustandFuer(b.st)] - RANG[zustandFuer(a.st)]
      || b.st.erschienen.seq - a.st.erschienen.seq);
    const { m, st } = sortiert[0];
    const zustand = zustandFuer(st);
    const bekaempft = liste.some((x) => x.st.ergebnis === "bekaempft");
    const gemeldet = gemeldetePosition(inh, m);
    const ids = liste.map((x) => x.m.id);
    let pos = gemeldet;
    let bahn: Bahn | undefined;
    let zerstoert = false;
    let fuehrer: string | null = null;
    let menge = m.ziele.length > 1 ? m.ziele.length : undefined;
    let anzahl = m.ziele.length;
    const wirkung = bekaempft ? liste.map((x) => x.st.wirkung).find((w) => !!w) : undefined;
    let weg: KartenObjekt["weg"];
    // seit 2.7 (I3.2): nach Zeit als verbündet erkannt – oder nach Eigenbeschuss als verbündet gemeldet (I-08a)
    const aufl = (inh.basis ?? inh).szenario.aufloesungen?.find((a) => ids.includes(a.meldung));
    const verbuendet = aufl ? (z.aufloesungen?.[aufl.id] ? { name: aufl.name, getroffen: false }
      : aufl.getroffen && z.injects[aufl.getroffen.inject] ? { name: aufl.getroffen.name, getroffen: true } : null) : null;
    if (tLage !== undefined) {
      const stehend = m.ziele.filter((id) => stehtNoch(inh, z, id, tLage));
      const wracks = m.ziele.filter((id) => z.zerstoert[id] !== undefined && z.zerstoert[id] <= tLage + 1e-6);
      if (stehend.length) {
        // C8: Das Zeichen folgt dem ersten noch stehenden Fahrzeug; Zahl = noch stehende Fahrzeuge in seiner Nähe
        fuehrer = stehend[0];
        bahn = zielBahn(inh, z, fuehrer);
        const lage = bahn && bahnLage(bahn, tLage);
        if (lage) pos = lage.pos;
        const dabei = stehend.filter((id) => id === fuehrer || dist(position(inh.ziele[id], tLage), pos) <= GRUPPE_RADIUS_M);
        anzahl = dabei.length;
        menge = anzahl > 1 ? anzahl : undefined;
      } else if (wracks.length) {
        // kein Fahrzeug steht mehr: das Zeichen bleibt beim bekämpften (sonst ersten) Fahrzeug am Wrack, durchgestrichen
        const id = wirkung?.ziel && wracks.includes(wirkung.ziel) ? wirkung.ziel : wracks[0];
        const b = zielBahn(inh, z, id);
        bahn = b ? { ...b, halt: z.zerstoert[id] } : undefined;
        pos = (bahn && bahnLage(bahn, tLage)?.pos) ?? wirkung?.pos ?? gemeldet;
        zerstoert = true;
        fuehrer = id;
        anzahl = 1;
        menge = undefined;
      } else {
        // seit 2.7 (I1.2): kein Fahrzeug mehr im Raum – das Zeichen bleibt am Rand, wo das (erste nicht zerstörte) Fahrzeug hinausfuhr,
        // „durchgebrochen“ über Brücke oder Furt, sonst „abgezogen“; die Karte bewegt es nicht mehr
        const fz = m.ziele.find((id) => z.zerstoert[id] === undefined && inh.ziele[id]) ?? m.ziele[0];
        const b = zielBahn(inh, z, fz);
        const tAus = b?.bis !== undefined ? Math.min(b.bis - 0.05, tLage) : tLage;
        const lage = b && bahnLage({ ...b, halt: tAus }, tAus);
        pos = amRand(inh, lage ? lage.pos : pos);
        bahn = undefined;
        weg = durchbruchUeber(inh, z, m.ziele) ? "durchgebrochen" : "abgezogen";
        anzahl = 1;
        menge = undefined;
      }
    }
    const zeichenStatus = zerstoert || (bekaempft && tLage === undefined) ? "X" : "P";
    // Spieler sehen „Ziel 7“ (B7), nie die Kennung M07 oder Z-07
    const nummern = ids.map((id) => zielNr(inh, z, id));
    // bekämpft, aber Fahrzeuge stehen noch: das Zeichen der übrigen ist erledigt (blass), das Wrack trägt das Kreuz (C8)
    const objZustand: ObjektZustand = zerstoert && bekaempft ? "bekaempft" : zustand === "bekaempft" ? "erledigt" : zustand;
    const ueber = weg === "durchgebrochen" ? durchbruchUeber(inh, z, m.ziele) : null;
    const o: KartenObjekt = {
      id: nr,
      pos,
      // seit 2.4 (E4): das Zeichen zeigt, was ARGUS zur Meldezeit meldete (bei gestörtem Datenlink unsicherer); seit 2.7 nach der
      // Auflösung blau (verbündet)
      sidc: verbuendet ? zeichenVerbuendet(verbuendet.getroffen, zerstoert)
        : zeichenArgus(inh, argusBei(inh, m, st.gestoert).klasse, argusBei(inh, m, st.gestoert).konfidenz, zeichenStatus, anzahl),
      menge: verbuendet ? undefined : menge,
      text: verbuendet ? verbuendet.name : `Ziel ${nummern.join("/")}${weg === "durchgebrochen" ? " durchgebrochen" : weg === "abgezogen" ? " abgezogen" : ""}`,
      titel: verbuendet ? `${verbuendet.name} · war Ziel ${nummern.join(", ")}` : `Ziel ${nummern.join(", ")} · ${m.argus.klasse} · ${m.argus.konfidenz} %`,
      zeilen: [
        `gemeldet ${feinlage(gemeldet, inh.karte)}${tLage !== undefined && !zerstoert && !weg ? ` · jetzt ${feinlage(pos, inh.karte)}` : ""}`,
        ...liste.map((x) => `Ziel ${zielNr(inh, z, x.m.id)}: ${standText(x.st)}`),
        ...(zerstoert && !bekaempft ? ["Ziel zerstört"] : []),
        ...(weg === "durchgebrochen" ? [`über ${ueber ?? "den Bach"} durchgebrochen, westlich aus dem Raum`] : weg === "abgezogen" ? ["aus dem Raum abgezogen"] : []),
        ...(verbuendet ? [verbuendet.getroffen ? "verbündet – Eigenbeschuss" : (aufl?.vermerk ?? "verbündet – nicht bekämpfen")] : []),
        ...(menge && !verbuendet ? [`${menge} Fahrzeuge${anzahl < m.ziele.length ? ` (von ${m.ziele.length})` : ""}`] : []),
      ],
      zustand: tLage === undefined && bekaempft ? "bekaempft" : objZustand,
      meldung: m.id,
      meldungen: ids,
      bahn,
      zerstoert: zerstoert || (bekaempft && tLage === undefined),
      ...(weg ? { weg } : {}),
      ...(verbuendet ? { verbuendet: true } : {}),
      ...(verbuendet || weg === "durchgebrochen" ? { hervor: true } : {}),
    };
    objekte.push(o);
    zeichen.push({ o, fuehrer, fahrzeuge: [...new Set(liste.flatMap((x) => x.m.ziele))], m, nummern, argus: argusBei(inh, m, st.gestoert) });
    for (const x of liste) {
      wirkungen.push(...geplanteWirkungen(inh, z, x.m, x.st));
      const wmId = x.st.wirkung?.wirkmittel ?? x.st.freigabe?.wirkmittel;
      const wm = wmId ? inh.wirkmittel[wmId] : undefined;
      for (const w of einschlagListe(x.st)) {
        wirkungen.push({
          id: markenId(x.m.id, w.nr),
          pos: w.pos,
          radius_m: wm?.wirkradius_m ?? 0,
          text: `Ziel ${zielNr(inh, z, x.m.id)} ${wm?.kurz ?? wmId ?? ""}`,
          zeilen: [`Einschlag ${uhrzeit(start, w.t)} mit ${wm?.name ?? wmId ?? ""}`, `bekämpft ${uhrzeit(start, x.st.freigabe?.t_s ?? w.t)}`],
          t_einschlag: w.t,
          meldung: x.m.id,
        });
      }
    }
  }
  if (tLage !== undefined) objekte.push(...weitereZeichen(inh, z, tLage, zeichen));
  return { objekte, personen: [], wirkungen, eigene: tLage !== undefined ? eigeneLage(inh, z, tLage) : undefined };
}

/** Wrack-, Teil- und Kontaktzeichen zu den Meldungszeichen des Teams (seit 2.2, C1/C8). */
function weitereZeichen(inh: Inhalte, z: Spielzustand, t: number,
  zeichen: { o: KartenObjekt; fuehrer: string | null; fahrzeuge: string[]; m: Meldung; nummern: string[]; argus: ArgusAusgabe }[]): KartenObjekt[] {
  const out: KartenObjekt[] = [];
  const fuehrer = new Set(zeichen.map((x) => x.fuehrer).filter((x): x is string => !!x));
  const erledigt = new Set<string>(fuehrer);
  const bekannt = new Set(zeichen.flatMap((x) => x.fahrzeuge));
  for (const x of zeichen) {
    const zpos = x.o.bahn ? bahnLage(x.o.bahn, t)?.pos ?? x.o.pos : x.o.pos;
    for (const id of x.fahrzeuge) {
      if (erledigt.has(id) || !inh.ziele[id]) continue;
      const ziel = inh.ziele[id];
      const tz = z.zerstoert[id];
      if (tz !== undefined && tz <= t + 1e-6) {
        // C8: getroffenes Fahrzeug einer zugweisen Meldung – eigenes durchgestrichenes Zeichen am Wrack
        erledigt.add(id);
        const durch = z.zerstoertDurch[id];
        const eigen = durch !== undefined && !!inh.meldungen[durch];
        out.push({
          id: `${x.o.id}~${id}`,
          pos: position(ziel, tz),
          sidc: zeichenArgus(inh, x.argus.klasse, x.argus.konfidenz, "X", 1),
          text: "",
          titel: `Ziel ${x.nummern.join(", ")} · Fahrzeug zerstört`,
          zeilen: [`${eigen ? `getroffen bei Ziel ${zielNr(inh, z, durch!)}` : "zerstört"} (${uhrzeit(inh.szenario.spieluhr.start, tz)})`],
          zustand: eigen ? "bekaempft" : "erledigt",
          bahn: { ...(zielBahn(inh, z, id) as Bahn), halt: tz },
          zerstoert: true,
          art: "wrack",
        });
        continue;
      }
      if (!vorhanden(ziel, t)) continue;
      if (dist(position(ziel, t), zpos) <= GRUPPE_RADIUS_M) {
        erledigt.add(id);
        continue;
      }
      // entfernt sich vom Zeichen: eigenes kleines Zeichen, bis ARGUS es neu meldet
      erledigt.add(id);
      out.push({
        id: `${x.o.id}+${id}`,
        pos: position(ziel, t),
        sidc: zeichenArgus(inh, x.argus.klasse, x.argus.konfidenz, "P", 1),
        text: x.o.text,
        titel: `${x.o.text} · ein Fahrzeug der Meldung`,
        zeilen: ["Fahrzeug dieser Meldung, hat sich vom Zeichen entfernt"],
        zustand: x.o.zustand === "bekaempft" ? "erledigt" : x.o.zustand === "offen" || x.o.zustand === "zurueckgestellt" ? "offen" : "erledigt",
        bahn: zielBahn(inh, z, id),
        art: "teil",
      });
    }
  }
  // C1: Kontakte – was die Drohne fahren sieht, ohne dass eine Meldung dazu beim Team ist
  for (const ziel of inh.szenario.ziele) {
    if (ziel.ungemeldet || bekannt.has(ziel.id) || !ziel.bewegung?.route?.length) continue;
    if (!stehtNoch(inh, z, ziel.id, t)) continue;
    const p = position(ziel, t);
    if (imWald(inh, p)) continue;
    out.push({
      id: `?${ziel.id}`,
      pos: p,
      sidc: ZEICHEN_KONTAKT,
      text: "",
      titel: "Kontakt",
      zeilen: ["Bewegung erkannt – (noch) keine Meldung bei euch"],
      zustand: "erledigt",
      bahn: zielBahn(inh, z, ziel.id),
      art: "kontakt",
    });
  }
  return out;
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
    if (!st) continue;
    if (inh.meldungen[id]) wirkungen.push(...geplanteWirkungen(inh, z, inh.meldungen[id], st));
    const wmId = st.wirkung?.wirkmittel ?? st.freigabe?.wirkmittel;
    const wm = wmId ? inh.wirkmittel[wmId] : undefined;
    // seit 2.4 (E3): je Einschlag eines Zuges eine Marke
    for (const w of einschlagListe(st)) {
      for (const g of w.getroffen) if (g.was === "personen") getroffenePersonen.add(`${g.ziel}:${g.kategorie}`);
      const treffer = w.getroffen.map((g) => g.was === "personen"
        ? `${g.ziel}: ${g.anzahl ?? ""} ${PERSONEN_NAME[g.kategorie] ?? g.kategorie}`.replace("  ", " ")
        : `${g.ziel} (${GT_NAME[g.kategorie as GtKategorie] ?? g.kategorie})`);
      wirkungen.push({
        id: markenId(id, w.nr),
        pos: w.pos,
        radius_m: wm?.wirkradius_m ?? 0,
        text: `Ziel ${zielNr(inh, z, id)} ${wm?.kurz ?? wmId ?? ""}`,
        zeilen: [`Einschlag ${uhrzeit(start, w.t)} (bekämpft ${uhrzeit(start, st.freigabe?.t_s ?? w.t)}) mit ${wm?.name ?? wmId ?? ""}`,
          treffer.length ? `getroffen: ${treffer.join(", ")}` : "nichts getroffen"],
        fehl: w.getroffen.some((g) => FEHL.has(g.kategorie)),
      });
    }
  }

  const objekte: KartenObjekt[] = [];
  const personen: PersonenMarke[] = [];
  for (const ziel of inh.szenario.ziele) {
    const tZerst = z.zerstoert[ziel.id];
    const zerstoert = tZerst !== undefined && tZerst <= tLage + 1e-6;
    if (!zerstoert && !vorhanden(ziel, tLage)) continue;
    const tt = zerstoert ? tZerst : tLage;
    const pos = position(ziel, tt);
    const f = inh.fahrzeuge[ziel.typ];
    const meld = gemeldetIn.get(ziel.id) ?? [];
    const gt = gtBei(ziel, tt);
    const durch = z.zerstoertDurch[ziel.id];
    // außer Gefecht durch das Hintergrundgefecht (z. B. Z-24: Kette ab, kein Brand)
    const ag = ausserGefechtAb(inh, z, ziel.id);
    objekte.push({
      id: ziel.id,
      pos,
      sidc: zeichenZiel(inh, { ...ziel, gt }, zerstoert),
      text: ziel.id,
      titel: `${ziel.id} · ${f?.name ?? ziel.typ}`,
      zeilen: [
        `${GT_NAME[gt.kategorie]}: ${gt.text}`,
        ziel.ungemeldet ? "von ARGUS nicht gemeldet" : `gemeldet als ${meld.map((id) => `Ziel ${zielNr(inh, z, id)}`).join(", ")}`,
        ...(zerstoert ? [`zerstört ${uhrzeit(start, tZerst)}${durch ? ` (${inh.meldungen[durch] ? `Wirkung auf Ziel ${zielNr(inh, z, durch)}` : durch})` : ""}`] : []),
      ],
      zustand: zerstoert ? "bekaempft" : "offen",
      kategorie: gt.kategorie,
      ungemeldet: !!ziel.ungemeldet,
      schutz: gt.kategorie === "geschuetzt" ? (f?.symbol?.art === "sanitaet" ? "rotes_kreuz" : "geschuetzt") : undefined,
      sprite: f?.sprite ? {
        name: f.sprite, hdg: ausrichtung(ziel, tt), wrack: f.sprite_wrack ?? undefined, wrackAb: tZerst,
        ...(ag ? { zustand: "kette_ab", zustandAb: ag } : {}),
        // Mörsertrupp auf Lkw: Lkw-Sprite, bis er in Stellung ist (seit Katalog 1.3)
        ...(f.sprite_fahrt && ziel.bewegung?.route?.length ? { fahrt: f.sprite_fahrt, fahrtBis: ziel.bewegung.route[ziel.bewegung.route.length - 1][0] } : {}),
      } : undefined,
      bahn: zielBahn(inh, z, ziel.id),
      zerstoert,
    });
    (ziel.personen ?? []).forEach((p, i) => {
      if (!vorhanden(p, tLage, ziel)) return;
      personen.push({
        id: `${ziel.id}-P${i + 1}`,
        pos: position(p, tLage),
        bahn: p.bewegung?.route?.length ? { route: p.bewegung.route, ab: p.ab_s, bis: p.bis_s } : undefined,
        art: p.art,
        anzahl: p.anzahl,
        klein: p.klein,
        getroffen: getroffenePersonen.has(`${ziel.id}:${p.art}`),
        titel: `${p.anzahl} ${PERSONEN_NAME[p.art] ?? p.art}${p.klein ? `, davon ${p.klein} Kinder` : ""} bei ${ziel.id}${p.text ? ` – ${p.text}` : ""}`,
      });
    });
  }
  return { objekte, personen, wirkungen, eigene: eigeneLage(inh, z, tLage) };
}

/** Kurzer Schlüssel, damit die Karte nur neu zeichnet, wenn sich das Lagebild ändert. */
export function lagebildSchluessel(lb: Lagebild): string {
  // Objekte mit Bahn bewegt die Karte selbst; ihre Position gehört nicht in den Schlüssel
  const ort = (o: { pos: Punkt; bahn?: Bahn }) => (o.bahn ? `~${o.bahn.halt ?? ""}` : `${Math.round(o.pos[0])},${Math.round(o.pos[1])}`);
  return [
    lb.objekte.map((o) => `${o.id}@${ort(o)}:${o.sidc}:${o.zustand}:${o.text}:${o.menge ?? ""}:${o.sprite ? `${o.sprite.name}${o.sprite.wrackAb ?? ""}${o.sprite.zustandAb ?? ""}` : ""}:${o.zeilen.join("/")}`).join(";"),
    lb.personen.map((p) => `${p.id}@${ort(p)}:${p.getroffen ? 1 : 0}`).join(";"),
    lb.wirkungen.map((w) => `${w.id}${w.geplant ? "?" : ""}`).join(";"),
    (lb.eigene?.panzer ?? []).map((e) => `${e.id}:${e.zustand}:${e.stufe}:${e.treffer.join(",")}`).join(";"),
  ].join("|");
}
