// Lagebild: was eine Rolle auf der Lagekarte sieht. Reine Funktion von Inhalten, Spielstand und
// Lagezeit; die Karte (src/karte/) zeichnet nur, was hier herauskommt. Damit steht die
// Informationsverteilung auch für die Karte an einer Stelle und ist testbar.
//
//  • G2 und G3 sehen die Zielmeldungen an der gemeldeten Position mit dem Zeichen der ARGUS-Klasse –
//    nie die Ground Truth, nie ungemeldete Ziele, keine Personen.
//  • Spielleitung und Plenum (Auflösung) sehen die Kontrollkarte: alle Ziele nach Ground Truth,
//    auch ungemeldete, Personen und getroffene Personen, alle Wirkungen mit Ergebnis.
//
// Bewegung (seit Schritt 7): Jedes Objekt trägt seine Route (`bahn`); die Karte rechnet daraus in jedem
// Bild die Position zur laufenden Spielzeit, ein zerstörtes Fahrzeug bleibt ab seiner Zerstörung als
// Wrack stehen. Das Lagebild selbst wird nur bei neuen Ereignissen und im Sekundentakt neu berechnet.
//
// Tracking: Gemeldete Ziele bleiben auf den Karten von G1, G2 und G3 als Spur stehen und bewegen sich
// mit – an der Position des ersten noch stehenden Fahrzeugs der Meldung, mit dem Zeichen der ARGUS-Klasse
// (nie Ground Truth). Sind alle Fahrzeuge zerstört, bleibt das Zeichen durchgestrichen am Wrack; nach der
// eigenen Wirkung bleibt es beim bekämpften Fahrzeug am Einschlagort (Rest eines Zuges meldet ARGUS neu).
// Zieht ein Ziel ab, verschwindet seine Spur, sobald die Meldung bei dieser Rolle erledigt ist.
import type { GtKategorie, Inhalte, Meldung, Punkt, RoutenPunkt } from "../inhalte/typen";
import { ZEICHEN_KONTAKT, zeichenArgus, zeichenZiel } from "../karte/zeichen";
import { ausrichtung, dist, feinlage, gtBei, imPolygon, position, vorhanden } from "./geometrie";
import { einschlagVon } from "./lage";
import { gemeldetePosition } from "./regeln";
import { STUFE_TEXT, ERGEBNIS_TEXT, zielNummer } from "./sichten";
import { uhrzeit } from "./uhr";
import { zielNr } from "./zielnummern";
import type { MeldungsStand, Spielzustand } from "./zustand";

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
  /** Meldung, die ein Klick auswählt (G2/G3) */
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
   * Seit 2.2 (Aufklärung, Zielprüfung, Führung): „kontakt“ = Bewegung erkannt, keine Meldung bei der Rolle (C1);
   * „teil“ = Fahrzeug einer Meldung, das sich vom Zeichen entfernt hat; „wrack“ = getroffenes Fahrzeug einer
   * zugweisen Meldung am Einschlagort (C8). Kleiner gezeichnet, ohne Marke, nicht anklickbar.
   */
  art?: "kontakt" | "teil" | "wrack";
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

/** Kategorien, deren Treffer eine Fehlbekämpfung ist (Kontrollkarte, Übersicht der Spielleitung). */
export const FEHL = new Set(["verbuendet", "zivil", "geschuetzt", "attrappe", "ausser_gefecht", "besatzung_ergibt_sich"]);

/** Hat diese Rolle die Meldung bekommen (G1: jede erschienene, G2: angenommen oder Fast-Track, G3: mit Empfehlung)? */
function erreicht(st: MeldungsStand, rolle: "g1" | "g2" | "g3"): boolean {
  if (rolle === "g1") return true;
  if (rolle === "g2") return st.fastTrack || st.g1?.entscheid === "annehmen";
  return st.stufe === "g3" || !!st.g3 || !!st.wirkung;
}

function zustandFuer(st: MeldungsStand, rolle: "g1" | "g2" | "g3"): ObjektZustand {
  if (st.ergebnis === "bekaempft") return "bekaempft";
  if (st.stufe === "wirkung") return "freigegeben";
  if (st.stufe === rolle) return st.beobachten ? "zurueckgestellt" : "offen";
  return "erledigt";
}

/** Freigegebene Wirkung, deren Einschlag noch aussteht (für alle Karten gleich): Ort und Zeit vorausberechnet. */
function geplanteWirkung(inh: Inhalte, z: Spielzustand, m: Meldung, st: MeldungsStand): WirkungsMarke | null {
  if (st.stufe !== "wirkung" || st.wirkung || !st.g3?.wirkmittel) return null;
  const wm = inh.wirkmittel[st.g3.wirkmittel];
  const e = einschlagVon(inh, z, m.id);
  if (!wm || !e) return null;
  const start = inh.szenario.spieluhr.start;
  return {
    id: `W-${m.id}`,
    pos: e.pos,
    radius_m: wm.wirkradius_m,
    text: `Ziel ${zielNr(inh, z, m.id)} ${wm.kurz} · ${uhrzeit(start, e.t)}`,
    zeilen: [`freigegeben ${uhrzeit(start, st.g3.t_s)}, Einschlag ${uhrzeit(start, e.t)} (vorausberechnet)`, wm.name],
    geplant: true,
  };
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

function standText(st: MeldungsStand): string {
  if (st.ergebnis) return ERGEBNIS_TEXT[st.ergebnis];
  if (st.beobachten) return "zurückgestellt (BEOBACHTEN)";
  return STUFE_TEXT[st.stufe];
}

/** Bis zu diesem Abstand vom Zeichen gehört ein Fahrzeug der Meldung zum Zeichen (Zahl, Größenangabe); weiter weg
 *  bekommt es ein eigenes kleines Zeichen (seit 2.2). */
export const GRUPPE_RADIUS_M = 40;

/** Liegt die Position im Wald? Dort sieht die Drohne keine Bewegung (kein Kontakt, seit 2.2). */
export function imWald(inh: Inhalte, p: Punkt): boolean {
  return inh.karte.flaechen.some((f) => f.art === "wald" && imPolygon(p, f.punkte as Punkt[]));
}

function stehtNoch(inh: Inhalte, z: Spielzustand, id: string, t: number): boolean {
  const ziel = inh.ziele[id];
  return !!ziel && !(z.zerstoert[id] !== undefined && z.zerstoert[id] <= t + 1e-6) && vorhanden(ziel, t);
}

/**
 * Zielmeldungen für G1, G2 oder G3. Mehrere Meldungen zum selben Ziel (Folgemeldung) ergeben ein
 * Zeichen; ein Klick wählt die Meldung, die bei dieser Rolle offen ist, sonst die neueste.
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
export function lagebildZielmeldungen(inh: Inhalte, z: Spielzustand, rolle: "g1" | "g2" | "g3", tLage?: number): Lagebild {
  const start = inh.szenario.spieluhr.start;
  const proZiel = new Map<string, { m: Meldung; st: MeldungsStand }[]>();
  for (const id of z.reihenfolge) {
    const st = z.meldungen[id];
    const m = inh.meldungen[id];
    if (!st || !m || !erreicht(st, rolle)) continue;
    if (st.stufe === "entfallen" && !st.entfallen) continue; // schon beim Erscheinen entfallen: nie gesehen
    const nr = zielNummer(inh, m);
    proZiel.set(nr, [...(proZiel.get(nr) ?? []), { m, st }]);
  }
  const objekte: KartenObjekt[] = [];
  const wirkungen: WirkungsMarke[] = [];
  /** je Zeichen: Fahrzeug, dem es folgt, und alle Fahrzeuge seiner Meldungen (für Teil-, Wrack- und Kontaktzeichen) */
  const zeichen: { o: KartenObjekt; fuehrer: string | null; fahrzeuge: string[]; m: Meldung; nummern: string[] }[] = [];
  for (const [nr, liste] of proZiel) {
    const sortiert = [...liste].sort((a, b) => RANG[zustandFuer(b.st, rolle)] - RANG[zustandFuer(a.st, rolle)]
      || b.st.erschienen.seq - a.st.erschienen.seq);
    const { m, st } = sortiert[0];
    const zustand = zustandFuer(st, rolle);
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
        if (zustand === "erledigt" || zustand === "bekaempft") continue; // abgezogen: keine Spur mehr
        // abgezogen, aber noch offen bei der Rolle: das Zeichen bleibt an der letzten Stelle
        const b = zielBahn(inh, z, m.ziele[0]);
        bahn = b ? { ...b, halt: b.halt ?? tLage } : undefined;
        const lage = bahn && bahnLage(bahn, tLage);
        if (lage) pos = lage.pos;
        anzahl = 1;
        menge = undefined;
      }
    }
    const zeichenStatus = zerstoert || (bekaempft && tLage === undefined) ? "X" : "P";
    // Spieler sehen „Ziel 7“ (B7), nie die Kennung M07 oder Z-07
    const nummern = ids.map((id) => zielNr(inh, z, id));
    // bekämpft, aber Fahrzeuge stehen noch: das Zeichen der übrigen ist erledigt (blass), das Wrack trägt das Kreuz (C8)
    const objZustand: ObjektZustand = zerstoert && bekaempft ? "bekaempft" : zustand === "bekaempft" ? "erledigt" : zustand;
    const o: KartenObjekt = {
      id: nr,
      pos,
      sidc: zeichenArgus(inh, m.argus.klasse, m.argus.konfidenz, zeichenStatus, anzahl),
      menge,
      text: `Ziel ${nummern.join("/")}`,
      titel: `Ziel ${nummern.join(", ")} · ${m.argus.klasse} · ${m.argus.konfidenz} %`,
      zeilen: [
        `gemeldet ${feinlage(gemeldet, inh.karte)}${tLage !== undefined && !zerstoert ? ` · jetzt ${feinlage(pos, inh.karte)}` : ""}`,
        ...liste.map((x) => `Ziel ${zielNr(inh, z, x.m.id)}: ${standText(x.st)}`),
        ...(zerstoert && !bekaempft ? ["Ziel zerstört"] : []),
        ...(menge ? [`${menge} Fahrzeuge${anzahl < m.ziele.length ? ` (von ${m.ziele.length})` : ""}`] : []),
      ],
      zustand: tLage === undefined && bekaempft ? "bekaempft" : objZustand,
      meldung: m.id,
      meldungen: ids,
      bahn,
      zerstoert: zerstoert || (bekaempft && tLage === undefined),
    };
    objekte.push(o);
    zeichen.push({ o, fuehrer, fahrzeuge: [...new Set(liste.flatMap((x) => x.m.ziele))], m, nummern });
    for (const x of liste) {
      const geplant = geplanteWirkung(inh, z, x.m, x.st);
      if (geplant) wirkungen.push(geplant);
      const w = x.st.wirkung;
      if (!w) continue;
      const wm = inh.wirkmittel[w.wirkmittel];
      wirkungen.push({
        id: `W-${x.m.id}`,
        pos: w.pos,
        radius_m: wm?.wirkradius_m ?? 0,
        text: `Ziel ${zielNr(inh, z, x.m.id)} ${wm?.kurz ?? w.wirkmittel}`,
        zeilen: [`Einschlag ${uhrzeit(start, w.t_einschlag)} mit ${wm?.name ?? w.wirkmittel}`, `freigegeben ${uhrzeit(start, w.t_freigabe)}`],
      });
    }
  }
  if (tLage !== undefined) objekte.push(...weitereZeichen(inh, z, tLage, zeichen));
  return { objekte, personen: [], wirkungen };
}

/** Wrack-, Teil- und Kontaktzeichen zu den Meldungszeichen einer Rolle (seit 2.2, C1/C8). */
function weitereZeichen(inh: Inhalte, z: Spielzustand, t: number,
  zeichen: { o: KartenObjekt; fuehrer: string | null; fahrzeuge: string[]; m: Meldung; nummern: string[] }[]): KartenObjekt[] {
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
          sidc: zeichenArgus(inh, x.m.argus.klasse, x.m.argus.konfidenz, "X", 1),
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
        sidc: zeichenArgus(inh, x.m.argus.klasse, x.m.argus.konfidenz, "P", 1),
        text: x.o.text,
        titel: `${x.o.text} · ein Fahrzeug der Meldung`,
        zeilen: ["Fahrzeug dieser Meldung, hat sich vom Zeichen entfernt"],
        zustand: x.o.zustand === "bekaempft" ? "erledigt" : x.o.zustand === "offen" || x.o.zustand === "zurueckgestellt" ? "offen" : "erledigt",
        bahn: zielBahn(inh, z, id),
        art: "teil",
      });
    }
  }
  // C1: Kontakte – was die Drohne fahren sieht, ohne dass eine Meldung dazu bei der Rolle ist
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
      zeilen: ["Bewegung erkannt – (noch) keine Meldung bei dir"],
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
    const geplant = st && inh.meldungen[id] && geplanteWirkung(inh, z, inh.meldungen[id], st);
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
      text: `Ziel ${zielNr(inh, z, id)} ${wm?.kurz ?? w.wirkmittel}`,
      zeilen: [`Einschlag ${uhrzeit(start, w.t_einschlag)} (frei ${uhrzeit(start, w.t_freigabe)}) mit ${wm?.name ?? w.wirkmittel}`,
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
  return { objekte, personen, wirkungen };
}

/** Kurzer Schlüssel, damit die Karte nur neu zeichnet, wenn sich das Lagebild ändert. */
export function lagebildSchluessel(lb: Lagebild): string {
  // Objekte mit Bahn bewegt die Karte selbst; ihre Position gehört nicht in den Schlüssel
  const ort = (o: { pos: Punkt; bahn?: Bahn }) => (o.bahn ? `~${o.bahn.halt ?? ""}` : `${Math.round(o.pos[0])},${Math.round(o.pos[1])}`);
  return [
    lb.objekte.map((o) => `${o.id}@${ort(o)}:${o.sidc}:${o.zustand}:${o.text}:${o.menge ?? ""}:${o.sprite ? `${o.sprite.name}${o.sprite.wrackAb ?? ""}${o.sprite.zustandAb ?? ""}` : ""}:${o.zeilen.join("/")}`).join(";"),
    lb.personen.map((p) => `${p.id}@${ort(p)}:${p.getroffen ? 1 : 0}`).join(";"),
    lb.wirkungen.map((w) => `${w.id}${w.geplant ? "?" : ""}`).join(";"),
  ].join("|");
}
