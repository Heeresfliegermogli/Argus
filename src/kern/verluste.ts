// Verlustmodell der eigenen 2. Kompanie (seit Szenario 2.3, Änderung D2/D3). Portiert aus tools/referenz/verluste.py,
// gleiche Ergebnisse prüft tests/durchlauf.test.ts (fünf Teams = Simulation, inkl. Verluste und Druckmeldungen).
//
//   • Schaden entsteht nur durch feuernde Feinde, die noch stehen: Fahrzeuge mit `feuert` (Mörser auf den Zug aus
//     feuert[].auf), Kampf- und Schützenpanzer im Halt in Reichweite (fester Takt, Zug im Gefechtsstreifen),
//     Feindartillerie (Einschläge im Hintergrundgefecht). Je Schuss ein fester Wert in Promille (regeln.verluste).
//   • Bekämpfen stoppt den Schaden ab dem Einschlag; der Schaden kommt verzug_s nach dem Schuss an der Stellung an.
//   • Fehler haben Folgen: Attrappe getroffen → Feindartillerie auf den verratenen Zug; Durchbruch → Schaden am Zug
//     am Übergang; ohne E-01 feuern die Feinde an der Brücke Ost einfach weiter.
//   • Deterministisch und ganzzahlig: gleiche Entscheidungen ⇒ gleiche Verluste. Untergrenze je Zug, danach
//     eskalieren nur die Meldungen. Keine Darstellung getöteter Menschen: Kampfkraft in %, Verwundete als Zahl.
//
// Alles ist eine reine Funktion von Welt, Spielstand und Spielzeit; jedes Fenster rechnet dasselbe.
import type { EigenerZug, Inhalte, Punkt, RegelnVerluste, VerlustArt, Ziel } from "../inhalte/typen";
import { type DurchbruchAbs, durchbruchGruppen } from "./durchbruch";
import { schuesse } from "./effekte";
import { abS, dist, gtBei, position, vorhanden } from "./geometrie";
import { weltFuer } from "./lage";
import type { InjectStand, Spielzustand } from "./zustand";

export interface VerlustEreignis {
  /** Zeit des Schadens an der Stellung (Spielzeit, s) */
  t: number;
  zug: string;
  promille: number;
  art: VerlustArt;
  /** Schütze (Ziel-ID), Hintergrundereignis (H-04), Attrappe (Z-07) oder durchgebrochenes Fahrzeug */
  quelle: string;
  nr: number;
  /** Herkunft des Feuers für die Meldung („aus Hof RABE“), sonst leer */
  ort: string;
  /** Einschlagort an der Stellung (Darstellung) */
  pos: Punkt;
}

export interface ZugStand {
  /** Verlust in Promille, gedeckelt an der Untergrenze */
  verlust: number;
  /** Verlust ohne Deckel (Prüfung der Untergrenze) */
  roh: number;
  kampfkraft: number;
  verwundete: number;
}

export interface KompanieStand {
  kampfkraft: number;
  verwundete: number;
}

export interface Druckmeldung {
  id: string;
  t: number;
  zug: string;
  stufe: number;
  text: string;
}

/** Auf 0,01 s runden (wie die Einschlagzeit im Protokoll). */
export function r2(x: number): number {
  return Math.floor(x * 100 + 0.5) / 100;
}

export function zuege(inh: Inhalte): EigenerZug[] {
  return (inh.basis ?? inh).szenario.eigene_truppe?.zuege ?? [];
}

export function zugMitte(zug: EigenerZug): Punkt {
  const f = zug.fahrzeuge;
  return [f.reduce((a, p) => a + p[0], 0) / f.length, f.reduce((a, p) => a + p[1], 0) / f.length];
}

/** Hat das Szenario ein Verlustmodell (eigene Truppe und regeln.verluste)? */
export function mitVerlusten(inh: Inhalte): boolean {
  return !!(inh.regeln.verluste && zuege(inh).length);
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

/** Zug, auf den ein Feind an der Stelle p schießt: im Gefechtsstreifen, sonst der nächste – nur in Reichweite. */
export function zielZug(zl: EigenerZug[], p: Punkt, reichweite?: number): EigenerZug | null {
  for (const zug of zl) {
    const st = zug.streifen;
    if (st && st[0] <= p[1] && p[1] < st[1]) {
      if (reichweite === undefined || dist(zugMitte(zug), p) <= reichweite) return zug;
      break;
    }
  }
  let best: EigenerZug | null = null;
  let bd = Infinity;
  for (const zug of zl) {
    const d = dist(zugMitte(zug), p);
    if (reichweite !== undefined && d > reichweite) continue;
    if (d < bd - 1e-9) {
      best = zug;
      bd = d;
    }
  }
  return best;
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
 * Alle Schadensereignisse an den eigenen Zügen, nach Zeit sortiert (wie verluste.zeitlinie).
 * inh: Welt des Teams (Verstärkungen und Durchbrüche) · zerstoert: Ziel → Zeit · attrappeT: Einschlag der ersten Wirkung
 * auf die Attrappe · durch: Durchbruch-Gruppen, die durchgebrochen sind.
 */
export function zeitlinie(inh: Inhalte, zerstoertRoh: Record<string, number>, attrappeT: number | null, durch: DurchbruchAbs[]): VerlustEreignis[] {
  const sz = inh.szenario;
  const vr = inh.regeln.verluste;
  const vs = (inh.basis ?? inh).szenario.verluste;
  const zl = zuege(inh);
  if (!vr || !zl.length) return [];
  const zmap = new Map(zl.map((z) => [z.id, z]));
  const dauer = sz.spieluhr.dauer_s;
  const zerstoert: Record<string, number> = {};
  for (const [k, v] of Object.entries(zerstoertRoh)) zerstoert[k] = r2(v);
  const ev: (Omit<VerlustEreignis, "pos"> & { pos?: Punkt })[] = [];
  const steht = (ziel: Ziel, t: number) => {
    if (!vorhanden(ziel, t) || (zerstoert[ziel.id] ?? 1e9) <= t) return false;
    const gt = gtBei(ziel, t);
    return gt.kategorie === "feind" && !!gt.legitim;
  };

  for (const ziel of sz.ziele) {
    const w = vr.waffen[ziel.typ];
    if (!w) continue;
    const promille = ziel.verlust_promille ?? w.promille;
    if (ziel.feuert?.length) {
      for (const [ts, nr] of schuesse(ziel.feuert)) {
        if (ts >= dauer || !steht(ziel, ts)) continue;
        const f = ziel.feuert.find((x) => x.von_s <= ts && ts < x.bis_s) ?? ziel.feuert[0];
        const p = position(ziel, ts);
        const zug = (f.auf ? zmap.get(f.auf) : undefined) ?? zielZug(zl, p, w.reichweite_m);
        if (!zug) continue;
        ev.push({ t: r2(ts + vr.verzug_s[w.art]), zug: zug.id, promille, art: w.art, quelle: ziel.id, nr, ort: ortText(inh, p) });
      }
      continue;
    }
    if (w.art !== "direkt") continue;
    const takt = w.takt_s ?? 20;
    const ph = phase(ziel.id, takt);
    let k = Math.max(0, Math.ceil((abS(ziel) - ph) / takt));
    let nr = 0;
    for (;;) {
      const ts = k * takt + ph;
      k++;
      if (ts >= dauer || ts >= (ziel.bis_s ?? 1e9) || ts >= (zerstoert[ziel.id] ?? 1e9)) break;
      if (!steht(ziel, ts) || haltSeit(ziel, ts) < (w.feuerbereit_s ?? 0)) continue;
      const p = position(ziel, ts);
      const zug = zielZug(zl, p, w.reichweite_m);
      if (!zug) continue;
      ev.push({ t: r2(ts + vr.verzug_s.direkt), zug: zug.id, promille, art: "direkt", quelle: ziel.id, nr, ort: ortText(inh, p) });
      nr++;
    }
  }

  for (const h of sz.hintergrund?.ereignisse ?? []) {
    if (h.art !== "feindartillerie") continue;
    h.einschlaege.forEach(([t, x, y], nr) => {
      const zug = zielZug(zl, [x, y], vr.feindartillerie.radius_m);
      if (!zug || t >= dauer) return;
      ev.push({ t: r2(t), zug: zug.id, promille: vr.feindartillerie.promille, art: "artillerie", quelle: h.id, nr, ort: "", pos: [x, y] });
    });
  }

  const at = vs?.attrappe;
  if (at && attrappeT !== null && zmap.has(at.zug)) {
    const zug = zmap.get(at.zug)!;
    const [mx, my] = zugMitte(zug);
    at.einschlaege.forEach(([dt, dx, dy], nr) => {
      const t = r2(attrappeT + at.verzoegerung_s + dt);
      if (t >= dauer) return;
      ev.push({ t, zug: zug.id, promille: vr.attrappe.promille, art: "attrappe", quelle: at.ziel, nr, ort: "", pos: [mx + dx, my + dy] });
    });
  }

  for (const g of durch) {
    const zid = vs?.durchbruch?.[g.ueber];
    const zug = zid ? zmap.get(zid) : undefined;
    if (!zug) continue;
    for (const x of g.ziele) {
      const tc = g.ueber_s[x];
      if (tc === undefined || tc >= dauer || (zerstoert[x] ?? 1e9) <= tc) continue;
      ev.push({ t: r2(tc), zug: zug.id, promille: vr.durchbruch.promille, art: "durchbruch", quelle: x, nr: 0, ort: "" });
    }
  }

  const reihe = new Map(zl.map((z, i) => [z.id, i]));
  const liste = ev.filter((e) => e.t < dauer).sort((a, b) =>
    a.t - b.t || reihe.get(a.zug)! - reihe.get(b.zug)! || (a.quelle < b.quelle ? -1 : a.quelle > b.quelle ? 1 : 0) || a.nr - b.nr);
  const versatz = vr.versatz_m.length ? vr.versatz_m : [[0, 0] as Punkt];
  const zaehler = new Map(zl.map((z) => [z.id, 0]));
  return liste.map((e) => {
    if (e.pos) return e as VerlustEreignis;
    const zug = zmap.get(e.zug)!;
    const k = zaehler.get(e.zug)!;
    zaehler.set(e.zug, k + 1);
    const fz = zug.fahrzeuge[k % zug.fahrzeuge.length];
    const [dx, dy] = versatz[k % versatz.length];
    return { ...e, pos: [fz[0] + dx, fz[1] + dy] as Punkt };
  });
}

export function deckel(vr: RegelnVerluste): number {
  return 1000 - 10 * vr.untergrenze_prozent;
}

/** Stand je Zug zur Zeit t (Ereignisse bis einschließlich t). */
export function stand(inh: Inhalte, ev: VerlustEreignis[], t = Infinity): Record<string, ZugStand> {
  const vr = inh.regeln.verluste!;
  const roh: Record<string, number> = Object.fromEntries(zuege(inh).map((z) => [z.id, 0]));
  for (const e of ev) {
    if (e.t > t) break;
    roh[e.zug] += e.promille;
  }
  const out: Record<string, ZugStand> = {};
  for (const [zid, v] of Object.entries(roh)) {
    const vv = Math.min(v, deckel(vr));
    out[zid] = { verlust: vv, roh: v, kampfkraft: Math.floor((1000 - vv) / 10), verwundete: Math.floor(vv / vr.promille_je_verwundeter) };
  }
  return out;
}

/** Kopfzeile: Kampfkraft der Kompanie (Mittel der Züge, abgerundet) und Verwundete gesamt. */
export function kompanie(st: Record<string, ZugStand>): KompanieStand {
  const werte = Object.values(st);
  if (!werte.length) return { kampfkraft: 100, verwundete: 0 };
  return {
    kampfkraft: Math.floor(werte.reduce((a, s) => a + 1000 - s.verlust, 0) / (10 * werte.length)),
    verwundete: werte.reduce((a, s) => a + s.verwundete, 0),
  };
}

/** Stufe der Dringlichkeit: 0, 1 (unter erster Schwelle), 2 (unter zweiter), 3 (Untergrenze erreicht). */
export function stufeFuer(vr: RegelnVerluste, verlust: number): number {
  if (verlust >= deckel(vr)) return 3;
  const kk = 1000 - verlust;
  let s = 0;
  vr.schwellen_prozent.forEach((sw, i) => {
    if (kk < 10 * sw) s = i + 1;
  });
  return s;
}

export function verwText(n: number): string {
  return n === 0 ? "keine Verwundeten" : n === 1 ? "1 Verwundeter" : `${n} Verwundete`;
}

function neuText(n: number): string {
  return n <= 0 ? "keine neuen Verwundeten" : n === 1 ? "1 neuer Verwundeter" : `${n} neue Verwundete`;
}

function format(vorlage: string, werte: Record<string, string | number>): string {
  return vorlage.replace(/\{(\w+)\}/g, (m, k) => (k in werte ? String(werte[k]) : m));
}

/** Druckmeldungen der Kompanie (D3) aus der Zeitlinie, wie verluste.meldungen. */
export function druckmeldungen(inh: Inhalte, ev: VerlustEreignis[]): Druckmeldung[] {
  const vr = inh.regeln.verluste;
  const vm = (inh.basis ?? inh).szenario.verluste?.meldungen;
  if (!vr || !vm) return [];
  const regel = vr.meldungen;
  const dk = deckel(vr);
  const zl = zuege(inh);
  const name = new Map(zl.map((z) => [z.id, z.name]));
  type L = { t: number; art: VerlustArt; ort: string; p: number; k: number };
  const zst = new Map(zl.map((z) => [z.id, { verlust: 0, stufe: 0, t: null as number | null, verw: 0, arten: new Set<string>(), letzte: [] as L[] }]));
  const out: Druckmeldung[] = [];
  let tAlle: number | null = null;
  ev.forEach((e, i) => {
    const s = zst.get(e.zug)!;
    s.verlust = Math.min(dk, s.verlust + e.promille);
    s.letzte.push({ t: e.t, art: e.art, ort: e.ort, p: e.promille, k: i });
    const verw = Math.floor(s.verlust / vr.promille_je_verwundeter);
    const neu = stufeFuer(vr, s.verlust);
    const t = e.t;
    const freiAlle = tAlle === null || t - tAlle >= regel.abstand_alle_s;
    const ersteArt = (regel.sofort ?? []).includes(e.art) && !s.arten.has(e.art);
    s.arten.add(e.art);
    let stufe: number;
    if (neu > s.stufe || ersteArt) stufe = neu;
    else if (neu < 3 && verw - s.verw >= regel.je_verwundete && freiAlle && (s.t === null || t - s.t >= regel.abstand_zug_s)) stufe = neu;
    else if (neu === 3 && freiAlle && (s.t === null || t - s.t >= regel.abstand_limit_s)) stufe = 3;
    else return;
    let art: VerlustArt = e.art;
    let ort = e.ort;
    if (!ersteArt) {
      const summe = new Map<string, { a: VerlustArt; o: string; p: number; k: number }>();
      for (const x of s.letzte) {
        if (x.t < t - regel.fenster_s) continue;
        const schl = `${x.art}\u0000${x.ort}`;
        const alt = summe.get(schl);
        summe.set(schl, { a: x.art, o: x.ort, p: (alt?.p ?? 0) + x.p, k: x.k });
      }
      let best: { a: VerlustArt; o: string; p: number; k: number } | null = null;
      for (const v of summe.values()) if (!best || v.p > best.p || (v.p === best.p && v.k > best.k)) best = v;
      art = best!.a;
      ort = best!.o;
    }
    const werte = {
      zug: name.get(e.zug)!, kk: Math.floor((1000 - s.verlust) / 10), verw: verwText(verw), neu: neuText(verw - s.verw),
      waffe: vm.waffe[art], ort: ort ? ` ${ort}` : "", forderung: vm.forderung[art],
    };
    const vorlage = vm.texte[ersteArt && neu === s.stufe ? "sofort" : String(stufe)];
    out.push({ id: `${vm.kennung}${String(out.length + 1).padStart(2, "0")}`, t, zug: e.zug, stufe, text: format(vorlage, werte) });
    s.stufe = Math.max(s.stufe, neu);
    s.t = t;
    s.verw = verw;
    s.letzte = s.letzte.filter((x) => x.t >= t - regel.fenster_s);
    tAlle = t;
  });
  return out;
}

/** Platzhalter einer festen Lagemeldung (I-07, I-06, I-13) mit dem Stand dieses Teams füllen. */
export function fuelle(inh: Inhalte, text: string, st: Record<string, ZugStand>, zugId?: string): string {
  if (!text.includes("{")) return text;
  const zug = zuege(inh).find((z) => z.id === zugId);
  const s = (zugId && st[zugId]) || { kampfkraft: 100, verwundete: 0 };
  const kp = kompanie(st);
  return format(text, { zug: zug?.name ?? "", kk: s.kampfkraft, verw: verwText(s.verwundete), kp_kk: kp.kampfkraft, kp_verw: verwText(kp.verwundete) });
}

// ---------------------------------------------------------------- aus dem Spielstand

/** Zerstörungen für das Verlustmodell: Spielstand plus vorausberechnete Einschläge freigegebener Wirkungen. */
function zerstoertMitEinschlag(z: Spielzustand): { zer: Record<string, number>; schl: string } {
  let zer = z.zerstoert;
  const teile: string[] = [];
  for (const id of z.reihenfolge) {
    const st = z.meldungen[id];
    const e = st.stufe === "wirkung" ? st.g3?.einschlag : undefined;
    if (!e || (zer[e.ziel] ?? Infinity) <= e.t) continue;
    if (zer === z.zerstoert) zer = { ...zer };
    zer[e.ziel] = e.t;
    teile.push(`${e.ziel}@${e.t}`);
  }
  return { zer, schl: teile.join(",") };
}

/** Einschlag der ersten eigenen Wirkung, die die Attrappe traf (oder null). */
export function attrappeTreffer(z: Spielzustand): number | null {
  let t: number | null = null;
  for (const id of z.reihenfolge) {
    const w = z.meldungen[id].wirkung;
    if (w?.getroffen.some((g) => g.kategorie === "attrappe" && g.was !== "personen")) t = t === null ? w.t_einschlag : Math.min(t, w.t_einschlag);
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

/** Stand je Zug und der Kompanie zur Spielzeit t. */
export function verlustStand(basis: Inhalte, z: Spielzustand, t: number): { zuege: Record<string, ZugStand>; kompanie: KompanieStand } | null {
  if (!mitVerlusten(basis)) return null;
  const l = verlustLage(basis, z);
  const st = stand(l.welt, l.ereignisse, t);
  return { zuege: st, kompanie: kompanie(st) };
}

/** Kampfkraft der Kompanie über die Spielzeit (Auswertung „Preis des Abwartens“): [t, kampfkraft, verwundete]. */
export function verlustVerlauf(basis: Inhalte, z: Spielzustand, schritt = 15): [number, number, number][] {
  if (!mitVerlusten(basis)) return [];
  const l = verlustLage(basis, z);
  const dauer = l.welt.szenario.spieluhr.dauer_s;
  const out: [number, number, number][] = [];
  for (let t = 0; t <= dauer; t += schritt) {
    const kp = kompanie(stand(l.welt, l.ereignisse, t));
    out.push([t, kp.kampfkraft, kp.verwundete]);
  }
  return out;
}

/** Was eine Lagemeldung im Postfach zeigt: Absender und Text (Druckmeldungen und gefüllte Platzhalter aus dem Protokoll). */
export function injectAnzeige(inh: Inhalte, i: InjectStand): { von: string; text: string; an: string } {
  const plan = inh.injects[i.id];
  const vm = (inh.basis ?? inh).szenario.verluste?.meldungen;
  return {
    von: plan?.von ?? (vm?.von || "2. Kp"),
    text: i.text ?? plan?.text ?? "",
    an: plan?.an ?? "G3",
  };
}
