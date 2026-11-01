// Effekte auf der Karte: Einschläge, LM im Flug, Leuchtspur, Mündungsblitz, Feindartillerie, Rauch/Nebel,
// brennende Wracks und Krater.
//
// Reine Funktion von Welt und Spielstand: Die Liste sagt nur, WAS wann und wo geschieht (Wirkung welches
// Wirkmittels, welches Ereignis des Hintergrundgefechts, welches Fahrzeug feuert, welches Wrack mit welcher
// Folge). WIE es aussieht, entscheidet die Karte (src/karte/effektebene.ts) nach der Zuordnung im
// Asset-Manifest (effekte.zuordnung: Wirkmittel → Flug/Einschlag/danach, Hintergrund → Einschlag/Fläche,
// Wrack → Feuer/Rauch, feuert → Mündungsblitz). Neue Wirkmittel oder Effekte sind damit Daten, kein Code.
//
// Was eine Rolle sehen darf, entscheidet `sichtbar`:
//  • Spielleitung und Auflösung: alles.
//  • G1, G2, G3: eigene Wirkungen, Feindartillerie und Rauch; Wirkungen des Hintergrundgefechts und von
//    E-01 nur auf Ziele, die diese Rolle aus einer Meldung kennt (sonst verriete der Effekt ein ungemeldetes
//    Ziel); der Mündungsblitz eines Schützen nur, wenn die Rolle auch den Schützen kennt.
//  • Plenum während des Spiels („umgebung“): nur Feindartillerie und Rauch.
//
// Seit Szenario 2.1 (A8): Fahrzeuge mit `feuert` schießen nach ihrem Schussrhythmus (Mündungsblitz, danach
// Abschussrauch), solange sie stehen und nicht zerstört sind – sichtbar für Rollen, die das Fahrzeug kennen. Fahrende
// Fahrzeuge wirbeln Staub auf: staubSpur() liefert dafür je Fahrzeug die Staubwolken hinter ihm (Karte und
// Live-Drohnenbild zeichnen sie, Aussehen aus dem Asset-Manifest, effekte.zuordnung.fahrt).
import { verlustLage, zielZug, zuege, zugMitte } from "./verluste";
import type { Feuer, Inhalte, Punkt, RoutenPunkt, Ziel } from "../inhalte/typen";
import { geschwindigkeit, position, vorhanden, weg } from "./geometrie";
import { einschlaegeVon } from "./lage";
import type { Spielzustand } from "./zustand";

export type EffektArt = "einschlag" | "flug" | "muendung" | "nebel" | "wrack";

/** Woher ein Effekt kommt; daraus wählt die Karte die Animation (Asset-Manifest, effekte.zuordnung). */
export interface EffektQuelle {
  /** eigene Wirkung: Wirkmittel-ID (MRS, LM, PZA) */
  wirkmittel?: string;
  /** Hintergrundgefecht: Art (feindartillerie, panzerabwehr, rauch) */
  hintergrund?: string;
  /** Mündungsblitz: was feuert (kanone, moerser) */
  feuert?: string;
  /** Wrack: Folge (zerstoert, ausser_gefecht) */
  folge?: string;
}

export interface Effekt {
  id: string;
  art: EffektArt;
  quelle: EffektQuelle;
  /**
   * Spielzeit: Beginn (einschlag, muendung, nebel, wrack). flug: Ankunft am Ziel = Einschlag; mit
   * `echtzeit_s` fliegt der Effekt so viele Sekunden Echtzeit vorher los (Leuchtspur), sonst ab `ab`.
   */
  t: number;
  /** flug in Spielzeit: Abflug */
  ab?: number;
  /** nebel: Ende */
  bis?: number;
  pos: Punkt;
  /** Ausgangspunkt (flug) */
  von?: Punkt;
  /** flug: Dauer in Echtzeit (s) vor t – Leuchtspur, unabhängig vom Tempo */
  echtzeit_s?: number;
  /** nebel: Halbmesser der Fläche */
  radius_m?: number;
  /** Richtung in Grad (0 = Osten, 90 = Süden): Mündungsblitz */
  richtung?: number;
  /** Variante (z. B. Krater 0–2), fest je Effekt */
  nr?: number;
  /**
   * einschlag: Krater und andere „danach“-Bilder nur so lange (Spielzeit, s), die letzten 20 s ausgeblendet. Seit 2.3 für die
   * Treffer an den eigenen Stellungen: Es sind Hunderte je Lauf, dauerhaft stehende Krater kosten jedes Bild Rechenzeit.
   */
  bleibt_s?: number;
}

/** Wie lange Krater an den eigenen Stellungen stehen bleiben (Spielzeit, s). */
export const KRATER_STELLUNG_S = 90;

export type Sichtbarkeit = "alle" | "umgebung" | Set<string>;

/** Leuchtspur: Flugdauer in Echtzeit (s) bis zum Treffer. */
export const LEUCHTSPUR_S = 0.6;

/** Eigene Panzerabwehr schießt aus Stellungen westlich des Kartenrands (Pfeil der Kompanie). */
const WESTRAND_X = -40;

/**
 * Startpunkt der eigenen Panzerabwehr. Seit 2.3 (D1.2) aus der Stellung: das Fahrzeug des schießenden Zuges (kraft = Zug)
 * bzw. des Zuges im Gefechtsstreifen des Ziels, das dem Ziel am nächsten steht (Mündung ca. 5 m vor dem Fahrzeug).
 * Ohne eigene Truppe im Szenario wie bisher vom Westrand auf Höhe der Kompanie.
 */
export function abschussOrt(inh: Inhalte, kraft: string | undefined, ziel: Punkt): Punkt {
  const zl = zuege(inh);
  if (!zl.length) return westrand(inh, kraft, ziel[1]);
  const zug = zl.find((x) => x.id === kraft) ?? zielZug(zl, ziel) ?? zl[0];
  const fz = [...zug.fahrzeuge].sort((a, b) => Math.hypot(a[0] - ziel[0], a[1] - ziel[1]) - Math.hypot(b[0] - ziel[0], b[1] - ziel[1]))[0];
  return muendung(fz, ziel);
}

/** Startpunkt der eigenen Panzerabwehr ohne eigene Truppe: Westrand auf Höhe der schießenden Kompanie, sonst der nächsten. */
export function westrand(inh: Inhalte, kraft: string | undefined, y: number): Punkt {
  const eigene = inh.szenario.kraefte.filter((x) => x.zugehoerigkeit === "eigen");
  const k = eigene.find((x) => x.id === kraft)
    ?? [...eigene].sort((a, b) => Math.abs((a.pfeil_y ?? a.pos[1]) - y) - Math.abs((b.pfeil_y ?? b.pos[1]) - y))[0];
  return [WESTRAND_X, k ? k.pfeil_y ?? k.pos[1] : y];
}

/** feste Variante je Kennung (gleich in allen Fenstern) */
export function variante(id: string, n: number): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % n;
}

function grad(von: Punkt, nach: Punkt): number {
  return (Math.atan2(nach[1] - von[1], nach[0] - von[0]) * 180) / Math.PI;
}

/**
 * Schusszeitpunkte eines feuernden Fahrzeugs (ziele[].feuert, wie argus_lib.schuesse): Feuerstöße mit `salve` Schuss im
 * Abstand takt_s, dann pause_s. Liefert [t, nr] mit laufender Nummer (bei Mörsern wechseln die Rohre).
 */
export function schuesse(feuert: Feuer[] | undefined): [number, number][] {
  const out: [number, number][] = [];
  for (const f of feuert ?? []) {
    const salve = f.salve ?? 1;
    let t = f.von_s;
    let k = 0;
    while (t < f.bis_s) {
      for (let i = 0; i < salve; i++) {
        const ts = t + i * f.takt_s;
        if (ts < f.bis_s) out.push([Math.round(ts * 100) / 100, k++]);
      }
      t += salve * f.takt_s + (f.pause_s ?? 0);
    }
  }
  return out;
}

/** Schießt das Fahrzeug im Steilfeuer (Mörser)? Sonst Kanone im direkten Feuer. */
export function steilfeuer(ziel: Pick<Ziel, "typ">): boolean {
  return ziel.typ.includes("moerser");
}

/** Staub hinter fahrenden Fahrzeugen: alle STAUB_TAKT_S Spielzeit eine Wolke, sichtbar STAUB_N Takte lang. */
export const STAUB_TAKT_S = 1.2;
export const STAUB_N = 6;
/** ab dieser Geschwindigkeit (m/s) wirbelt ein Fahrzeug Staub auf */
const STAUB_AB_MPS = 1.5;

export interface StaubWolke {
  pos: Punkt;
  /** Alter in Spielzeit (s), 0 … STAUB_TAKT_S · STAUB_N */
  alter: number;
  /** Variante (fest je Wolke) */
  nr: number;
}

/**
 * Staubwolken hinter einem Fahrzeug zur Spielzeit t (reine Funktion der Route): Wolke k entstand zur Zeit
 * floor(t/Δ)·Δ − k·Δ an der Position des Fahrzeugs, wenn es dann fuhr. halt: ab hier steht es (Zerstörung).
 */
export function staubSpur(route: RoutenPunkt[] | undefined, t: number, halt = Infinity, ab = -Infinity, bis = Infinity): StaubWolke[] {
  if (!route || route.length < 2) return [];
  const obj = { pos: [route[0][1], route[0][2]] as Punkt, bewegung: { route } };
  const k0 = Math.floor(t / STAUB_TAKT_S);
  const out: StaubWolke[] = [];
  for (let k = 0; k < STAUB_N; k++) {
    const te = (k0 - k) * STAUB_TAKT_S;
    if (te < ab || te >= bis || te >= halt || te < route[0][0] || te > t) continue;
    if (geschwindigkeit(obj, te) < STAUB_AB_MPS) continue;
    out.push({ pos: position(obj, te), alter: t - te, nr: (k0 - k) & 3 });
  }
  return out;
}

/** Mündung vor dem Fahrzeug (halbe Länge plus Rohr, ca. 5 m) in Richtung des Ziels. */
function muendung(von: Punkt, nach: Punkt, m = 5): Punkt {
  const d = Math.hypot(nach[0] - von[0], nach[1] - von[1]) || 1;
  return [von[0] + ((nach[0] - von[0]) * m) / d, von[1] + ((nach[1] - von[1]) * m) / d];
}

/**
 * Alle Effekte des Spiels bis jetzt, dazu vorausberechnete (LM im Flug, Einschlag einer Freigabe), damit sie
 * in jedem Fenster pünktlich kommen. sichtbar: „alle“, „umgebung“ oder die Ziel-IDs, die eine Rolle kennt.
 */
export function effekte(inh: Inhalte, z: Spielzustand, sichtbar: Sichtbarkeit = "alle"): Effekt[] {
  const out: Effekt[] = [];
  const kennt = (ziel: string | undefined) => sichtbar === "alle" || (sichtbar !== "umgebung" && !!ziel && sichtbar.has(ziel));

  // Hintergrundgefecht: Feindartillerie und Rauch (für alle), eigene Panzerabwehr (wenn sie wirkt)
  for (const h of inh.szenario.hintergrund?.ereignisse ?? []) {
    if (h.art === "feindartillerie") {
      h.einschlaege.forEach(([t, x, y], i) => {
        out.push({ id: `${h.id}-${i}`, art: "einschlag", quelle: { hintergrund: h.art }, t, pos: [x, y], nr: variante(`${h.id}${i}`, 3) });
      });
    } else if (h.art === "rauch") {
      out.push({ id: h.id, art: "nebel", quelle: { hintergrund: h.art }, t: h.t_s, bis: h.t_s + h.dauer_s, pos: h.pos, radius_m: h.radius_m });
    } else if (h.art === "panzerabwehr" && kennt(h.ziel)) {
      const ziel = inh.ziele[h.ziel];
      if (!ziel) continue;
      const stand = z.hintergrund[h.id];
      // erst mit dem Ereignis im Protokoll sicher; davor nur, solange das Ziel noch steht (Vorschau für den Takt)
      const wirkt = stand ? !!stand.wirkt : !weg(ziel, h.t_s, z.zerstoert);
      if (!wirkt) continue;
      const pos = position(ziel, h.t_s);
      out.push({ id: `${h.id}-s`, art: "flug", quelle: { hintergrund: h.art }, t: h.t_s, pos, von: abschussOrt(inh, h.von, pos), echtzeit_s: LEUCHTSPUR_S });
      out.push({ id: `${h.id}-x`, art: "einschlag", quelle: { hintergrund: h.art }, t: h.t_s, pos, nr: variante(h.id, 3) });
    }
  }

  // Treffer an den Stellungen der eigenen Züge (seit 2.3, D3.3): für alle sichtbar – eigene Truppe, verrät kein Ziel.
  // Feindartillerie steht schon oben (Hintergrundgefecht); hier Mörser, direktes Feuer, Attrappe und Durchbruch.
  for (const v of verlustLage(inh, z).ereignisse) {
    if (v.art === "artillerie") continue;
    const q = v.art === "direkt" || v.art === "durchbruch" ? { hintergrund: "panzerabwehr" } : { hintergrund: "feindartillerie" };
    out.push({ id: `V-${v.art}-${v.quelle}-${v.nr}`, art: "einschlag", quelle: q, t: v.t, pos: v.pos, nr: variante(`${v.quelle}${v.nr}`, 3),
      bleibt_s: KRATER_STELLUNG_S });
  }

  if (sichtbar === "umgebung") return out;

  // eigene Wirkungen: Flug (LM in Spielzeit, PzAbw als Leuchtspur) und Einschlag am vorausberechneten Ort
  for (const id of z.reihenfolge) {
    const st = z.meldungen[id];
    const wmId = st.g3?.entscheid === "freigabe" ? st.g3.wirkmittel : undefined;
    if (!wmId) continue;
    const wm = inh.wirkmittel[wmId];
    if (!wm) continue;
    const q = { wirkmittel: wmId };
    // seit 2.4 (E3): je Einschlag eines Zuges (LM und PzAbw je Fahrzeug, nacheinander gestartet); Ort und Zeit aus dem Protokoll
    const abstand = wm.zug?.abstand_s ?? 0;
    einschlaegeVon(inh, z, id).forEach((plan, nr) => {
      const da = st.wirkungen?.find((w) => w.nr === nr);
      const e = da ? { t: da.t_einschlag, pos: da.pos } : plan;
      const k = nr ? `${id}~${nr}` : id;
      if (wm.flug) {
        out.push({ id: `${k}-f`, art: "flug", quelle: q, ab: st.g3!.t_s + nr * abstand + (wm.flug.vorbereitung_s ?? 0), t: e.t, pos: e.pos, von: wm.flug.start });
      } else if (wm.einsatzbereich) {
        // direktes Feuer aus den Stellungen der eigenen Züge (seit 2.3; vorher vom Westrand)
        out.push({ id: `${k}-f`, art: "flug", quelle: q, t: e.t, pos: e.pos, von: abschussOrt(inh, undefined, e.pos), echtzeit_s: LEUCHTSPUR_S });
      }
      out.push({ id: `${k}-x`, art: "einschlag", quelle: q, t: e.t, pos: e.pos, nr: variante(k, 3) });
    });
  }

  // Skriptereignisse (E-01): polnische Panzer schießen auf die letzten Feindkräfte (Kanone, direktes Feuer)
  for (const e of inh.szenario.ereignisse ?? []) {
    const stand = z.ereignisse[e.id];
    if (!stand) continue;
    e.wirkungen.forEach((w, nr) => {
      if (!stand.wirkungen[nr]?.wirkt) return;
      const von = inh.ziele[w.von];
      const ziel = inh.ziele[w.ziel];
      if (!von || !ziel) return;
      const pv = position(von, w.t_s);
      const pz = position(ziel, w.t_s);
      const q = { feuert: "kanone" };
      if (kennt(w.von)) out.push({ id: `${e.id}-${nr}-m`, art: "muendung", quelle: q, t: w.t_s - LEUCHTSPUR_S / 2, pos: muendung(pv, pz), richtung: grad(pv, pz) });
      if (!kennt(w.ziel)) return;
      if (kennt(w.von)) out.push({ id: `${e.id}-${nr}-s`, art: "flug", quelle: { hintergrund: "panzerabwehr" }, t: w.t_s, pos: pz, von: muendung(pv, pz), echtzeit_s: LEUCHTSPUR_S / 2 });
      out.push({ id: `${e.id}-${nr}-x`, art: "einschlag", quelle: { hintergrund: "panzerabwehr" }, t: w.t_s, pos: pz });
    });
  }

  // Feuer nach Schussrhythmus (seit 2.1): Mündungsblitz (danach Abschussrauch), solange das Fahrzeug steht
  for (const ziel of inh.szenario.ziele) {
    if (!ziel.feuert?.length || !kennt(ziel.id)) continue;
    if (inh.fahrzeuge[ziel.typ]?.feuer_effekt === "keiner") continue; // seit 2.4: Beobachter lenkt Feuer, schießt nicht selbst
    const tz = z.zerstoert[ziel.id] ?? Infinity;
    const steil = steilfeuer(ziel);
    for (const [ts, nr] of schuesse(ziel.feuert)) {
      if (ts >= tz || !vorhanden(ziel, ts) || geschwindigkeit(ziel, ts) > 0.3) continue;
      const pv = position(ziel, ts);
      if (steil) {
        // zwei Rohre im Wechsel, quer zur Ausrichtung
        const w = (((ziel.hdg ?? 0) + 90) * Math.PI) / 180;
        const o = nr % 2 ? 1.6 : -1.6;
        out.push({ id: `${ziel.id}-s${nr}`, art: "muendung", quelle: { feuert: "moerser" }, t: ts, pos: [pv[0] + Math.cos(w) * o, pv[1] + Math.sin(w) * o], nr });
      } else {
        // Kanone im direkten Feuer auf den eigenen Zug im Gefechtsstreifen (seit 2.3; vorher Richtung Westrand)
        const zug = zielZug(zuege(inh), pv);
        const ziel2 = zug ? zugMitte(zug) : westrand(inh, undefined, pv[1]);
        out.push({ id: `${ziel.id}-s${nr}`, art: "muendung", quelle: { feuert: "kanone" }, t: ts, pos: muendung(pv, ziel2), richtung: grad(pv, ziel2), nr });
      }
    }
  }

  // Wracks: zerstört (brennt) oder außer Gefecht (Hintergrundgefecht, kein Brand) – am Ort des Treffers
  for (const [id, tz] of Object.entries(z.zerstoert)) {
    const ziel = inh.ziele[id];
    if (!ziel || !kennt(id)) continue;
    out.push({ id: `${id}-w`, art: "wrack", quelle: { folge: "zerstoert" }, t: tz, pos: position(ziel, tz), nr: variante(id, 4) });
  }
  for (const h of inh.szenario.hintergrund?.ereignisse ?? []) {
    if (h.art !== "panzerabwehr" || h.folge === "zerstoert" || !z.hintergrund[h.id]?.wirkt || !kennt(h.ziel)) continue;
    const ziel = inh.ziele[h.ziel];
    if (ziel && z.zerstoert[h.ziel] === undefined) out.push({ id: `${h.ziel}-w`, art: "wrack", quelle: { folge: h.folge }, t: h.t_s, pos: position(ziel, h.t_s) });
  }
  return out;
}

/** Ziel-IDs, die eine Rolle aus ihren Meldungen kennt (für die Sichtbarkeit der Effekte). */
export function bekannteZiele(inh: Inhalte, z: Spielzustand, rolle: "g1" | "g2" | "g3"): Set<string> {
  const s = new Set<string>();
  for (const id of z.reihenfolge) {
    const st = z.meldungen[id];
    const m = inh.meldungen[id];
    if (!m) continue;
    const ja = rolle === "g1" ? !!st.entfallen || st.stufe !== "entfallen"
      : rolle === "g2" ? st.fastTrack || st.g1?.entscheid === "annehmen"
        : st.stufe === "g3" || !!st.g3 || !!st.wirkung;
    if (ja) m.ziele.forEach((x) => s.add(x));
  }
  return s;
}

/** Kurzer Schlüssel, damit die Karte nur bei Änderungen die Liste neu übernimmt. */
export function effekteSchluessel(liste: Effekt[]): string {
  return liste.map((e) => `${e.id}@${Math.round(e.t * 10)}${e.ab !== undefined ? `/${Math.round(e.ab * 10)}` : ""}`).join(";");
}
