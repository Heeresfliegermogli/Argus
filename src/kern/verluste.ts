// Verlustmodell der eigenen Truppe – seit Szenario 2.5 (Änderung F2) die 1./PzBtl 613 (Kopfzeile „1. Kp“) mit vier Kampfpanzern,
// Zustand je Panzer. Portiert aus tools/referenz/verluste.py; gleiche Ergebnisse prüft tests/durchlauf.test.ts (fünf Teams =
// Simulation, inkl. Einschießen, Zustand je Panzer und Druckmeldungen).
//
//   • Wer schießt: Direktschützen (T-72, BMP-2, BTR-80) erst ab dem Ostufer bzw. der Brücke Ost (x ≤ feuer_ab_x) und nach
//     feuerbereit_s im Halt, im Takt ihrer Waffe, auf den nächsten einsatzbereiten Panzer (zuerst die voll einsatzbereiten).
//     Schützen mit `feuert` nach Drehbuch (Mörser und Beobachter je Salve, Kanonen je Feuerstoß) auf feuert[].auf. Ziele in
//     `bereitstellung` schießen nicht direkt. Feindartillerie nach Drehbuch (Umkreis radius_m), Attrappe → 1/2, Durchbruch.
//   • Einschießen je Schütze und Ziel: direkt 1–2 daneben, 3 nah, ab 4 jeder zweite Treffer, ab 8 jeder; Steilfeuer 1–2 daneben,
//     ab 3 im Ziel. Zielwechsel beginnt neu.
//   • Zustand 100 %, Treffer je Waffe; ab 70 % einsatzbereit, 40–69 % eingeschränkt, unter 40 % ausgefallen. Höchstens zwei fallen
//     aus, die übrigen halten 40 % (die Kp hält immer). Verwundete je Stufe, keine Gefallenen.
//   • Bekämpfen stoppt den Schaden ab dem Einschlag. Deterministisch und ohne Winkelfunktionen: gleiche Entscheidungen ⇒ gleiche
//     Verluste, Referenz und Engine rechnen bitgleich.
//
// Alles ist eine reine Funktion von Welt, Spielstand und Spielzeit; jedes Fenster rechnet dasselbe.
import type { EigenerPanzer, Inhalte, Punkt, RegelnVerluste, VerlustArt, Ziel } from "../inhalte/typen";
import { type DurchbruchAbs, durchbruchGruppen } from "./durchbruch";
import { schuesse } from "./effekte";
import { abS, dist, gtBei, position, vorhanden } from "./geometrie";
import { weltFuer } from "./lage";
import type { InjectStand, Spielzustand } from "./zustand";

export type Ergebnis = "daneben" | "nah" | "treffer";
export type Stufe = "einsatzbereit" | "eingeschraenkt" | "ausgefallen";

export interface VerlustEreignis {
  /** Einschlag (Spielzeit, s) */
  t: number;
  /** Schuss (Spielzeit, s) */
  ts: number;
  panzer: string;
  /** Schütze (Ziel-ID), Hintergrundereignis (H-04), Attrappe (Z-07) oder durchgebrochenes Fahrzeug */
  quelle: string;
  art: VerlustArt;
  nr: number;
  /** Schuss dieses Schützen auf dieses Ziel (Einschießen), 0 ohne Einschießen */
  k: number;
  ergebnis: Ergebnis;
  /** Prozentpunkte (nur Treffer) */
  schaden: number;
  /** Zustand nach dem Einschlag (an der Untergrenze gedeckelt), roh ohne Deckel */
  zustand: number;
  roh: number;
  ausgefallen: boolean;
  /** Herkunft des Feuers für die Meldung („aus Hof RABE“), sonst leer */
  ort: string;
  /** Einschlagort (Darstellung) */
  pos: Punkt;
  /** Ort des Schützen (oder null) */
  von: Punkt | null;
}

export interface PanzerStand {
  zustand: number;
  roh: number;
  ausgefallen: boolean;
  treffer: number;
  stufe: Stufe;
  verwundete: number;
}

/** Kopfzeile: einsatzbereite (nicht ausgefallene) Panzer, eingeschränkte, ausgefallene, Verwundete gesamt. */
export interface ZugStand {
  bereit: number;
  gesamt: number;
  eingeschraenkt: number;
  ausgefallen: number;
  verwundete: number;
}

export interface Druckmeldung {
  id: string;
  t: number;
  /** der Panzer, um den es geht (Feld heißt im Protokoll seit 2.3 `zug`) */
  zug: string;
  stufe: number;
  text: string;
}

/** feste Richtungen für Steilfeuer daneben (Einheitsvektoren, wie RICHTUNGEN in verluste.py) */
const RICHTUNGEN: Punkt[] = [[1, 0], [0.6, 0.8], [0, 1], [-0.6, 0.8], [-1, 0], [-0.6, -0.8], [0, -1], [0.6, -0.8]];

/** Auf 0,01 s runden (wie die Einschlagzeit im Protokoll). */
export function r2(x: number): number {
  return Math.floor(x * 100 + 0.5) / 100;
}

/** Auf 0,1 m runden. */
export function r1(x: number): number {
  return Math.floor(x * 10 + 0.5) / 10;
}

function variante(s: string, n: number): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % n;
}

export function panzer(inh: Inhalte): EigenerPanzer[] {
  return (inh.basis ?? inh).szenario.eigene_truppe?.panzer ?? [];
}

/** Kennung eines eigenen Panzers („1/2“) zur ID, sonst die ID selbst. */
export function panzerName(inh: Inhalte, id: string | undefined): string {
  return panzer(inh).find((p) => p.id === id)?.name ?? id ?? "";
}

/** Hat das Szenario ein Verlustmodell (eigene Truppe und regeln.verluste)? */
export function mitVerlusten(inh: Inhalte): boolean {
  return !!(inh.regeln.verluste && panzer(inh).length);
}

/** Wie lange steht das Fahrzeug zur Zeit t schon (s)? 0, wenn es fährt; ohne Route seit es im Raum ist. */
export function haltSeit(ziel: Ziel, t: number): number {
  const r = ziel.bewegung?.route;
  if (!r || !r.length) return t - abS(ziel);
  if (t < r[0][0]) return 0;
  const gleich = (a: number[], b: number[]) => Math.abs(a[1] - b[1]) < 0.01 && Math.abs(a[2] - b[2]) < 0.01;
  let i = r.length - 1;
  for (let k = 0; k < r.length - 1; k++) {
    if (r[k][0] <= t && t < r[k + 1][0]) {
      if (!gleich(r[k], r[k + 1])) return 0;
      i = k;
      break;
    }
  }
  while (i > 0 && gleich(r[i - 1], r[i])) i--;
  return t - r[i][0];
}

/** Fester Versatz des Takts je Fahrzeug (Ziffern der Kennung), damit nicht alle zugleich feuern. */
export function phase(zid: string, takt: number): number {
  const ziffern = zid.replace(/\D/g, "");
  return (Number(ziffern || "0") * 7) % Math.trunc(takt);
}

/** Beginn jeder Salve des Schussrhythmus (feuert): [t, nr] – im Verlustmodell zählt eine Salve als ein Schuss. */
export function salven(ziel: Pick<Ziel, "feuert">): [number, number][] {
  const out: [number, number][] = [];
  for (const f of ziel.feuert ?? []) {
    let t = f.von_s;
    let k = 0;
    while (t < f.bis_s) {
      out.push([Math.round(t * 100) / 100, k++]);
      t += (f.salve ?? 1) * f.takt_s + (f.pause_s ?? 0);
    }
  }
  return out;
}

function ortText(inh: Inhalte, p: Punkt): string {
  let best = "";
  let bd = Infinity;
  for (const o of (inh.basis ?? inh).szenario.verluste?.orte ?? []) {
    const d = dist(o.pos, p);
    if (d <= (o.radius_m ?? 150) && d < bd - 1e-9) {
      best = o.text;
      bd = d;
    }
  }
  return best;
}

/**
 * Nächster einsatzbereiter Panzer zur Stelle p: zuerst die voll einsatzbereiten (Zustand ≥ ab), sonst der nächste nicht
 * ausgefallene (bei Gleichstand der erste der Liste). Ohne zustand: der nächste nicht ausgefallene.
 */
export function naechster(pl: EigenerPanzer[], p: Punkt, aus: Set<string>, zustand?: Record<string, number>, ab = 0): EigenerPanzer | null {
  for (const nurVoll of zustand ? [true, false] : [false]) {
    let best: EigenerPanzer | null = null;
    let bd = Infinity;
    for (const pz of pl) {
      if (aus.has(pz.id) || (nurVoll && zustand![pz.id] < ab)) continue;
      const d = dist(pz.pos, p);
      if (best === null || d < bd - 1e-9) {
        best = pz;
        bd = d;
      }
    }
    if (best) return best;
  }
  return null;
}

/** Ergebnis des k-ten Schusses (1 …) eines Schützen auf dasselbe Ziel (F2.3). */
export function einschuss(vr: RegelnVerluste, art: VerlustArt, k: number): Ergebnis {
  if (art === "direkt") {
    const e = vr.einschiessen.direkt;
    if (k <= e.daneben) return "daneben";
    if (k <= e.daneben + e.nah) return "nah";
    if (k >= e.jeder_ab) return "treffer";
    return (k - e.jeder_zweite_ab) % 2 === 0 ? "treffer" : "nah";
  }
  return k <= vr.einschiessen.steil.daneben ? "daneben" : "treffer";
}

/** Einschlagort (Darstellung) wie einschlag_ort in verluste.py: nur Grundrechenarten und Wurzel. */
function einschlagOrt(vr: RegelnVerluste, art: VerlustArt, ergebnis: Ergebnis, k: number, von: Punkt | null, ziel: Punkt, schl: string): Punkt {
  const am = vr.ablage_m;
  const v = variante(schl, 1000);
  const [x, y] = ziel;
  let ux = 1;
  let uy = 0;
  if (art === "direkt" && von) {
    const dx = x - von[0];
    const dy = y - von[1];
    const n = Math.sqrt(dx * dx + dy * dy) || 1;
    ux = dx / n;
    uy = dy / n;
  }
  const qx = -uy;
  const qy = ux;
  if (ergebnis === "treffer") return [r1(x - ux * 1.5), r1(y - uy * 1.5)];
  if (ergebnis === "nah") {
    const [a, b] = am.nah;
    const s = a + (v % (b - a + 1));
    const seite = (k + v) % 2 ? 1 : -1;
    return [r1(x + qx * s * seite), r1(y + qy * s * seite)];
  }
  if (art === "direkt") {
    const [a, b] = am.daneben;
    const s = a + (v % (b - a + 1));
    const vorn = k % 2 ? -1 : 1;
    const quer = (v % 11) - 5;
    return [r1(x + ux * s * vorn + qx * quer), r1(y + uy * s * vorn + qy * quer)];
  }
  const [a, b] = am.steil_daneben;
  const s = a + (v % (b - a + 1));
  const [rx, ry] = RICHTUNGEN[(v + k) % RICHTUNGEN.length];
  return [r1(x + rx * s), r1(y + ry * s)];
}

interface Kandidat {
  t: number;
  ts: number;
  quelle: string;
  nr: number;
  art: VerlustArt;
  fest?: string;
  ueber?: string;
  von: Punkt | null;
  pos?: Punkt;
  radius?: number;
  schaden: number;
  ort: string;
}

/**
 * Alle Schüsse auf die eigenen Panzer, nach Zeit, mit Ergebnis und Zustand danach (wie verluste.zeitlinie).
 * inh: Welt des Teams (Verstärkungen und Durchbrüche) · zerstoert: Ziel → Zeit · attrappeT: Einschlag der ersten Wirkung
 * auf die Attrappe · durch: Durchbruch-Gruppen, die durchgebrochen sind.
 */
export function zeitlinie(inh: Inhalte, zerstoertRoh: Record<string, number>, attrappeT: number | null, durch: DurchbruchAbs[]): VerlustEreignis[] {
  const sz = inh.szenario;
  const vr = inh.regeln.verluste;
  const vs = (inh.basis ?? inh).szenario.verluste;
  const pl = panzer(inh);
  if (!vr || !pl.length) return [];
  const pmap = new Map(pl.map((p) => [p.id, p]));
  const dauer = sz.spieluhr.dauer_s;
  const zerstoert: Record<string, number> = {};
  for (const [k, v] of Object.entries(zerstoertRoh)) zerstoert[k] = r2(v);
  const kand: Kandidat[] = [];
  const steht = (ziel: Ziel, t: number) => {
    if (!vorhanden(ziel, t) || (zerstoert[ziel.id] ?? 1e9) <= t) return false;
    const gt = gtBei(ziel, t);
    return gt.kategorie === "feind" && !!gt.legitim;
  };
  const rund = (p: Punkt): Punkt => [r1(p[0]), r1(p[1])];

  for (const ziel of sz.ziele) {
    const w = vr.waffen[ziel.typ];
    if (!w) continue;
    if (ziel.feuert?.length) {
      // Steilfeuer und gelenktes Feuer: eine Salve = ein Schuss; direktes Feuer: jeder Feuerstoß des Rhythmus ein Schuss
      const zeiten = w.art === "steil" || w.art === "beobachter" ? salven(ziel) : schuesse(ziel.feuert);
      for (const [ts, nr] of zeiten) {
        if (ts >= dauer || !steht(ziel, ts)) continue;
        const f = ziel.feuert.find((x) => x.von_s <= ts && ts < x.bis_s) ?? ziel.feuert[0];
        const p = position(ziel, ts);
        kand.push({ t: r2(ts + (vr.verzug_s[w.art] ?? 0)), ts, quelle: ziel.id, nr, art: w.art, fest: f.auf, von: rund(p), schaden: w.treffer_prozent, ort: ortText(inh, p) });
      }
      continue;
    }
    if (w.art !== "direkt" || ziel.bereitstellung) continue; // Bereitstellung: kein Direktfeuer
    const takt = w.takt_s ?? 15;
    const ph = phase(ziel.id, takt);
    let k = Math.max(0, Math.ceil((abS(ziel) - ph) / takt));
    let nr = 0;
    for (;;) {
      const ts = k * takt + ph;
      k++;
      if (ts >= dauer || ts >= (ziel.bis_s ?? 1e9) || ts >= (zerstoert[ziel.id] ?? 1e9)) break;
      if (!steht(ziel, ts) || haltSeit(ziel, ts) < (w.feuerbereit_s ?? 0)) continue;
      const p = position(ziel, ts);
      if (p[0] > vr.feuer_ab_x) continue;
      kand.push({ t: r2(ts + vr.verzug_s.direkt), ts, quelle: ziel.id, nr, art: "direkt", von: rund(p), schaden: w.treffer_prozent, ort: ortText(inh, p) });
      nr++;
    }
  }

  for (const h of sz.hintergrund?.ereignisse ?? []) {
    if (h.art !== "feindartillerie") continue;
    h.einschlaege.forEach(([t, x, y], nr) => {
      if (t >= dauer) return;
      kand.push({ t: r2(t), ts: t, quelle: h.id, nr, art: "artillerie", pos: [x, y], radius: vr.feindartillerie.radius_m, schaden: vr.feindartillerie.treffer_prozent, ort: "", von: null });
    });
  }

  const at = vs?.attrappe;
  if (at && attrappeT !== null && pmap.has(at.panzer)) {
    const [px, py] = pmap.get(at.panzer)!.pos;
    at.einschlaege.forEach(([dt, dx, dy], nr) => {
      const t = r2(attrappeT + at.verzoegerung_s + dt);
      if (t >= dauer) return;
      kand.push({ t, ts: t, quelle: at.ziel, nr, art: "attrappe", pos: [px + dx, py + dy], radius: vr.attrappe.radius_m, schaden: vr.attrappe.treffer_prozent, ort: "", von: null });
    });
  }

  const db = vs?.durchbruch ?? {};
  const zmap = new Map(sz.ziele.map((z) => [z.id, z]));
  for (const g of durch) {
    if (!(db[g.ueber] ?? []).length) continue;
    for (const zid of g.ziele) {
      const tc = g.ueber_s[zid];
      if (tc === undefined || tc >= dauer || (zerstoert[zid] ?? 1e9) <= tc) continue;
      const z = zmap.get(zid);
      const w = z ? vr.waffen[z.typ] : undefined;
      if (!z || !w || w.art !== "direkt") continue;
      const p = position(z, tc);
      kand.push({ t: r2(tc), ts: tc, quelle: zid, nr: 0, art: "durchbruch", ueber: g.ueber, von: rund(p), schaden: vr.durchbruch?.treffer_prozent ?? w.treffer_prozent, ort: ortText(inh, p) });
    }
  }

  const liste = kand.filter((c) => c.t < dauer).sort((a, b) =>
    a.t - b.t || (a.quelle < b.quelle ? -1 : a.quelle > b.quelle ? 1 : 0) || a.nr - b.nr);

  const unter = vr.untergrenze_prozent;
  const ausUnter = vr.stufen.ausgefallen_unter;
  const zustand: Record<string, number> = Object.fromEntries(pl.map((p) => [p.id, vr.zustand_start]));
  const roh: Record<string, number> = { ...zustand };
  const aus = new Set<string>();
  const schuetze = new Map<string, [string, number]>();
  const nDurch = new Map<string, number>();
  const ev: VerlustEreignis[] = [];
  for (const c of liste) {
    const a = c.art;
    let ziel: EigenerPanzer | null = null;
    let k = 0;
    let ergebnis: Ergebnis = "treffer";
    let pos: Punkt;
    if (a === "artillerie") {
      let bd = Infinity;
      for (const pz of pl) {
        const d = dist(pz.pos, c.pos!);
        if (d <= c.radius! && (ziel === null || d < bd - 1e-9)) {
          ziel = pz;
          bd = d;
        }
      }
      if (!ziel || aus.has(ziel.id)) continue;
      pos = rund(c.pos!);
    } else if (a === "attrappe") {
      ziel = pmap.get(at!.panzer)!;
      const im = dist(ziel.pos, c.pos!) <= c.radius! && !aus.has(ziel.id);
      ergebnis = im ? "treffer" : "daneben";
      pos = rund(c.pos!);
    } else {
      if (a === "durchbruch") {
        const l = db[c.ueber!];
        const n = nDurch.get(c.ueber!) ?? 0;
        c.fest = l[n % l.length];
        nDurch.set(c.ueber!, n + 1);
      }
      const fest = c.fest ? pmap.get(c.fest) : undefined;
      ziel = fest && !aus.has(fest.id) ? fest : naechster(pl, c.von!, aus, zustand, vr.stufen.einsatzbereit_ab);
      if (!ziel) continue;
      if (a !== "durchbruch") {
        const alt = schuetze.get(c.quelle);
        k = alt && alt[0] === ziel.id ? alt[1] + 1 : 1;
        schuetze.set(c.quelle, [ziel.id, k]);
        ergebnis = einschuss(vr, a, k);
      }
      pos = einschlagOrt(vr, a, ergebnis, k, c.von, ziel.pos, `${c.quelle}${ziel.id}${k}`);
    }
    const pid = ziel.id;
    const schaden = ergebnis === "treffer" ? c.schaden : 0;
    roh[pid] -= schaden;
    let neu = zustand[pid] - schaden;
    if (neu < ausUnter && !aus.has(pid) && aus.size >= vr.hoechstens_ausgefallen) neu = Math.max(neu, unter); // die letzten halten
    if (aus.has(pid)) neu = zustand[pid]; // ein ausgefallener Panzer nimmt keinen weiteren Schaden
    zustand[pid] = neu;
    if (neu < ausUnter) aus.add(pid);
    ev.push({ t: c.t, ts: c.ts, panzer: pid, quelle: c.quelle, art: a, nr: c.nr, k, ergebnis, schaden, zustand: neu, roh: roh[pid], ausgefallen: aus.has(pid), ort: c.ort, pos, von: c.von });
  }
  return ev;
}

export function stufe(vr: RegelnVerluste, zustand: number, ausgefallen: boolean): Stufe {
  if (ausgefallen) return "ausgefallen";
  return zustand >= vr.stufen.einsatzbereit_ab ? "einsatzbereit" : "eingeschraenkt";
}

export const PANZER_STUFE_TEXT: Record<Stufe, string> = { einsatzbereit: "einsatzbereit", eingeschraenkt: "eingeschränkt", ausgefallen: "ausgefallen" };

/** Stand je Panzer zur Zeit t (Ereignisse bis einschließlich t). */
export function stand(inh: Inhalte, ev: VerlustEreignis[], t = Infinity): Record<string, PanzerStand> {
  const vr = inh.regeln.verluste!;
  const out: Record<string, PanzerStand> = Object.fromEntries(panzer(inh).map((p) => [p.id, {
    zustand: vr.zustand_start, roh: vr.zustand_start, ausgefallen: false, treffer: 0, stufe: "einsatzbereit" as Stufe, verwundete: 0,
  }]));
  for (const e of ev) {
    if (e.t > t) break;
    const s = out[e.panzer];
    s.zustand = e.zustand;
    s.roh = e.roh;
    s.ausgefallen = e.ausgefallen;
    if (e.ergebnis === "treffer") s.treffer++;
  }
  for (const s of Object.values(out)) {
    s.stufe = stufe(vr, s.zustand, s.ausgefallen);
    s.verwundete = vr.verwundete[s.stufe] ?? 0;
  }
  return out;
}

/** Kopfzeile: „1. Kp: 3/4 einsatzbereit · 4 Verwundete“ (einsatzbereit = nicht ausgefallen; eingeschränkte schießen weiter). */
export function zug(st: Record<string, PanzerStand>): ZugStand {
  const w = Object.values(st);
  return {
    bereit: w.filter((s) => !s.ausgefallen).length, gesamt: w.length,
    eingeschraenkt: w.filter((s) => s.stufe === "eingeschraenkt").length, ausgefallen: w.filter((s) => s.ausgefallen).length,
    verwundete: w.reduce((a, s) => a + s.verwundete, 0),
  };
}

export function verwText(n: number): string {
  return n === 0 ? "keine Verwundeten" : n === 1 ? "1 Verwundeter" : `${n} Verwundete`;
}

export function trefferText(n: number): string {
  return n === 0 ? "noch ohne Treffer" : n === 1 ? "1 Treffer" : `${n} Treffer`;
}

/** Platzhalter {name} ersetzen (unbekannte bleiben stehen), wie fmt in verluste.py. */
export function format(vorlage: string, werte: Record<string, string | number>): string {
  return vorlage.replace(/\{([A-Za-z_]\w*)\}/g, (m, k) => (k in werte ? String(werte[k]) : m));
}

/** Druckmeldungen der Kp je Panzer (F2.7) aus der Zeitlinie, wie verluste.meldungen. */
export function druckmeldungen(inh: Inhalte, ev: VerlustEreignis[]): Druckmeldung[] {
  const vr = inh.regeln.verluste;
  const sz = (inh.basis ?? inh).szenario;
  const vm = sz.verluste?.meldungen;
  if (!vr || !vm) return [];
  const regel = vr.meldungen;
  const pl = panzer(inh);
  const pmap = new Map(pl.map((p) => [p.id, p]));
  const zst = new Map(pl.map((p) => [p.id, { zustand: vr.zustand_start, aus: false, t: null as number | null, treffer: 0, arten: new Set<string>() }]));
  const out: Druckmeldung[] = [];
  let tAlle: number | null = null;
  for (const e of ev) {
    const s = zst.get(e.panzer)!;
    const vorher = stufe(vr, s.zustand, s.aus);
    s.zustand = e.zustand;
    s.aus = e.ausgefallen;
    const nachher = stufe(vr, s.zustand, s.aus);
    if (e.ergebnis === "treffer") s.treffer++;
    const t = e.t;
    const freiAlle = tAlle === null || t - tAlle >= regel.abstand_alle_s;
    const freiPz = s.t === null || t - s.t >= regel.abstand_panzer_s;
    const ersteArt = e.ergebnis === "treffer" && (regel.sofort ?? []).includes(e.art) && !s.arten.has(e.art);
    if (e.ergebnis === "treffer") s.arten.add(e.art);
    const nAus = [...zst.values()].filter((x) => x.aus).length;
    let schl: string;
    let st: number;
    if (nachher === "ausgefallen" && vorher !== "ausgefallen") [schl, st] = [nAus >= vr.hoechstens_ausgefallen ? "limit" : "ausgefallen", 3];
    else if (nachher === "eingeschraenkt" && vorher === "einsatzbereit") [schl, st] = ["eingeschraenkt", 2];
    else if (ersteArt) [schl, st] = ["sofort", nachher === "einsatzbereit" ? 1 : 2];
    else if (e.ergebnis === "treffer" && nachher === "einsatzbereit" && freiAlle && freiPz) [schl, st] = ["treffer", 1];
    else if (e.ergebnis === "treffer" && nachher === "eingeschraenkt" && freiAlle && (s.t === null || t - s.t >= regel.abstand_limit_s)) [schl, st] = ["erneut", 2];
    else if (e.k === 1 && e.ergebnis !== "treffer" && freiAlle && freiPz) [schl, st] = ["beschuss", 0];
    else continue;
    const pz = pmap.get(e.panzer)!;
    const bereit = [...zst.values()].filter((x) => !x.aus).length;
    const liste = vm.schaden?.[e.art] ?? [""];
    const werte = {
      pz: pz.name, zustand: s.zustand, verw: verwText(vr.verwundete[nachher] ?? 0), waffe: vm.waffe[e.art], ort: e.ort ? ` ${e.ort}` : "",
      forderung: vm.forderung[e.art], bereit, gesamt: pl.length, schaden: s.treffer ? liste[(s.treffer - 1) % liste.length] : "",
      schaden_e: pz.schaden_eingeschraenkt ?? "", zug: sz.eigene_truppe?.name ?? "",
    };
    out.push({ id: `${vm.kennung}${String(out.length + 1).padStart(2, "0")}`, t, zug: e.panzer, stufe: st, text: format(vm.texte[schl], werte) });
    s.t = t;
    tAlle = t;
  }
  return out;
}

/**
 * Platzhalter einer festen Lagemeldung (I-07, I-06, I-13) mit dem Stand dieses Teams zur Zeit t füllen. panzerId: Panzer der
 * Meldung oder „durchbruch“ (der Panzer, den der erste Durchbruch bis t traf).
 */
export function fuelle(inh: Inhalte, text: string, ev: VerlustEreignis[], t: number, panzerId?: string): string {
  if (!text.includes("{")) return text;
  const vr = inh.regeln.verluste!;
  const sz = (inh.basis ?? inh).szenario;
  const st = stand(inh, ev, t);
  const zg = zug(st);
  let pid = panzerId;
  if (pid === "durchbruch") pid = ev.find((e) => e.art === "durchbruch" && e.t <= t)?.panzer;
  const s = pid ? st[pid] : undefined;
  const pz = pid ? panzer(inh).find((p) => p.id === pid) : undefined;
  const werte: Record<string, string | number> = { bereit: zg.bereit, gesamt: zg.gesamt, zug_verw: verwText(zg.verwundete), zug: sz.eigene_truppe?.name ?? "" };
  if (s && pz) Object.assign(werte, { pz: pz.name, zustand: s.zustand, verw: verwText(s.verwundete), treffer: trefferText(s.treffer), lage: PANZER_STUFE_TEXT[s.stufe] });
  else Object.assign(werte, { pz: "ein Panzer", zustand: vr.zustand_start, verw: verwText(0), treffer: trefferText(0), lage: "einsatzbereit" });
  return format(text, werte);
}

// ---------------------------------------------------------------- aus dem Spielstand

/** Zerstörungen für das Verlustmodell: Spielstand plus vorausberechnete Einschläge freigegebener Wirkungen. */
function zerstoertMitEinschlag(z: Spielzustand): { zer: Record<string, number>; schl: string } {
  let zer = z.zerstoert;
  const teile: string[] = [];
  for (const id of z.reihenfolge) {
    const st = z.meldungen[id];
    if (st.stufe !== "wirkung" || !st.g3) continue;
    // seit 2.4 (E3): je Einschlag eines Zuges, der noch aussteht
    const da = new Set((st.wirkungen ?? []).map((w) => w.nr));
    const liste = st.g3.einschlaege?.length ? st.g3.einschlaege.map((e) => ({ t: e.t, ziel: e.ziel })) : st.g3.einschlag ? [st.g3.einschlag] : [];
    liste.forEach((e, nr) => {
      if (da.has(nr) || (zer[e.ziel] ?? Infinity) <= e.t) return;
      if (zer === z.zerstoert) zer = { ...zer };
      zer[e.ziel] = e.t;
      teile.push(`${e.ziel}@${e.t}`);
    });
  }
  return { zer, schl: teile.join(",") };
}

/** Einschlag der ersten eigenen Wirkung, die die Attrappe traf (oder null); seit 2.4 je Einschlag eines Zuges. */
export function attrappeTreffer(z: Spielzustand): number | null {
  let t: number | null = null;
  for (const id of z.reihenfolge) {
    for (const w of z.meldungen[id].wirkungen ?? []) {
      if (w.getroffen.some((g) => g.kategorie === "attrappe" && g.was !== "personen")) t = t === null ? w.t_einschlag : Math.min(t, w.t_einschlag);
    }
  }
  return t === null ? null : r2(t);
}

export interface VerlustLage {
  welt: Inhalte;
  ereignisse: VerlustEreignis[];
  meldungen: Druckmeldung[];
}

const CACHE = new WeakMap<Record<string, number>, Map<string, VerlustLage>>();

/** Zeitlinie und Druckmeldungen eines Teams aus dem Spielstand (zwischengespeichert; gleiche Lage ⇒ dasselbe Objekt). */
export function verlustLage(basis: Inhalte, z: Spielzustand): VerlustLage {
  const welt = weltFuer(basis, z);
  const { zer, schl: vorher } = zerstoertMitEinschlag(z);
  const att = attrappeTreffer(z);
  const durchIds = Object.entries(z.durchbrueche ?? {}).filter(([, v]) => v.durch).map(([k]) => k).sort();
  const schl = `${(welt.eingespielt ?? []).map((e) => `${e.gruppe}@${e.t0}`).join(",")}|${durchIds.join(",")}|${att ?? ""}|${vorher}`;
  let m = CACHE.get(z.zerstoert);
  if (!m) CACHE.set(z.zerstoert, (m = new Map()));
  const alt = m.get(schl);
  if (alt && alt.welt === welt) return alt;
  if (!mitVerlusten(welt)) {
    const leer = { welt, ereignisse: [], meldungen: [] };
    m.set(schl, leer);
    return leer;
  }
  const durch = durchbruchGruppen(welt, z.verstaerkungen).filter((g) => durchIds.includes(g.id) && g.t_s < welt.szenario.spieluhr.dauer_s);
  const ereignisse = zeitlinie(welt, zer, att, durch);
  const lage = { welt, ereignisse, meldungen: druckmeldungen(welt, ereignisse) };
  if (m.size > 16) m.clear();
  m.set(schl, lage);
  return lage;
}

/** Stand je Panzer und der Kp zur Spielzeit t. */
export function verlustStand(basis: Inhalte, z: Spielzustand, t: number): { panzer: Record<string, PanzerStand>; zug: ZugStand } | null {
  if (!mitVerlusten(basis)) return null;
  const l = verlustLage(basis, z);
  const st = stand(l.welt, l.ereignisse, t);
  return { panzer: st, zug: zug(st) };
}

/** Zustand der Panzer über die Spielzeit (Auswertung „Preis des Abwartens“): [t, Zustand je Panzer, einsatzbereit, Verwundete]. */
export function verlustVerlauf(basis: Inhalte, z: Spielzustand, schritt = 15): [number, number[], number, number][] {
  if (!mitVerlusten(basis)) return [];
  const l = verlustLage(basis, z);
  const pl = panzer(l.welt);
  const dauer = l.welt.szenario.spieluhr.dauer_s;
  const out: [number, number[], number, number][] = [];
  for (let t = 0; t <= dauer; t += schritt) {
    const st = stand(l.welt, l.ereignisse, t);
    const zg = zug(st);
    out.push([t, pl.map((p) => st[p.id].zustand), zg.bereit, zg.verwundete]);
  }
  return out;
}

/**
 * Wer schießt für die eigene Kp (Leuchtspur, F1.4/F1.5): der vorgesehene Panzer, wenn er zur Zeit t nicht ausgefallen ist, sonst
 * der nächste nicht ausgefallene zum Ziel (eingeschränkte schießen weiter). Ohne Verlustmodell der vorgesehene bzw. nächste.
 */
export function schuetze(basis: Inhalte, z: Spielzustand | null, t: number, ziel: Punkt, vorgesehen?: string): EigenerPanzer | null {
  const pl = panzer(basis);
  if (!pl.length) return null;
  const aus = new Set<string>();
  if (z && mitVerlusten(basis)) {
    const st = stand(verlustLage(basis, z).welt, verlustLage(basis, z).ereignisse, t);
    for (const [id, s] of Object.entries(st)) if (s.ausgefallen) aus.add(id);
  }
  const v = vorgesehen ? pl.find((p) => p.id === vorgesehen) : undefined;
  if (v && !aus.has(v.id)) return v;
  return naechster(pl, ziel, aus) ?? pl[0];
}

/** Was eine Lagemeldung im Postfach zeigt: Absender und Text (Druckmeldungen und gefüllte Platzhalter aus dem Protokoll). */
export function injectAnzeige(inh: Inhalte, i: InjectStand): { von: string; text: string; an: string } {
  const plan = inh.injects[i.id];
  const vm = (inh.basis ?? inh).szenario.verluste?.meldungen;
  return {
    von: plan?.von ?? (vm?.von || "1. Kp"),
    text: i.text ?? plan?.text ?? "",
    an: plan?.an ?? "G3",
  };
}
