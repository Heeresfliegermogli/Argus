// Behauptungen der Lagemeldungen (seit Szenario 2.9, Änderung P4): Jede Lagemeldung, die ein Ergebnis behauptet (brennt, zerstört,
// getroffen, eingebrochen, zurückgezogen, genommen, zerschlagen), stimmt mit dem Stand im Spiel des Teams überein.
//
// In den Daten trägt eine Lagemeldung dafür `behauptet` (was ihr Text behauptet) und, wo das nicht in jedem Spiel stimmt, `varianten`:
// je Variante `behauptet` und `text`. Die Engine nimmt die erste Variante, deren Behauptung zur Zeit der Meldung stimmt, sonst den Text
// der Lagemeldung selbst (der dann nichts behaupten darf, was nicht in jedem Spiel stimmt – das prüft tools/referenz/pruefe_szenario.py
// in den Läufen ohne Eingriff, naiv, ideal, ARGUS allein und mit Verstärkungen). Gleiche Logik wie tools/referenz/behauptung.py.
//
// Behauptungen (alle angegebenen müssen stimmen, Zeit t = Zeit der Meldung):
//   zerstoert: [ids]              alle zerstört (von wem auch immer)
//   stehen: [ids]                 mindestens eines steht (im Raum, nicht zerstört)
//   hintergrund: [ids]            diese Ereignisse des Hintergrundgefechts haben gewirkt (Kanone der Kp traf)
//   ereignis_traf: E              das Skriptereignis E (polnischer Gegenangriff) traf mindestens ein Fahrzeug
//   bereich_frei: E               im Bereich von E (Brücke Ost) steht kein Feind (legitimes Ziel) mehr
//   feind_im_bereich: E           im Bereich von E steht mindestens ein Feind
//   ereignis_aus: E               E fiel aus oder brach ab – Freigabe auf seine Bedingungsziele (PT-91) vor seinem letzten Schuss
//   getroffen: {ziele, min?, personen?}  eigene Wirkungen trafen mindestens min (1) dieser Fahrzeuge – mit personen: Personen dieser Art
//                                 bei ihnen
//   durchbruch: true | [ids]      ein gemeldetes Fahrzeug einer durchgebrochenen Gruppe ist über dem Bach (mit Liste: eines davon)
//   panzer_getroffen: "durchbruch" ein eigener Panzer wurde vom Durchbruch getroffen
//   beschuss: {quelle, panzer?}   Feuer der Quelle lag auf den eigenen Panzern (auf diesem)
//   eloka: true                   Datenlink gestört (EloKa-Fahrzeug aktiv)
//   verstoss: "R2" | "R3"         eine eigene Wirkung verletzte die Regel
//   letzte_nicht_bekaempft: true  die letzte Entscheidung des Teams war nicht BEKÄMPFEN
import type { Behauptung, Inhalte, Skriptereignis } from "../inhalte/typen";
import { kurzName } from "./abschluss";
import { durchbruchGruppen } from "./durchbruch";
import { elokaAktiv } from "./eloka";
import { gtBei, position, vorhanden } from "./geometrie";
import { freigaben, fruehesteFreigabe, weltFuer } from "./lage";
import { verlustLage } from "./verluste";
import { zielNummern } from "./zielnummern";
import type { Spielzustand } from "./zustand";

export const BEHAUPTUNG_SCHLUESSEL = [
  "zerstoert", "stehen", "hintergrund", "ereignis_traf", "bereich_frei", "feind_im_bereich", "ereignis_aus", "getroffen", "durchbruch",
  "panzer_getroffen", "beschuss", "eloka", "verstoss", "letzte_nicht_bekaempft",
] as const;

function ereignis(inh: Inhalte, id: string): Skriptereignis | undefined {
  return (inh.basis ?? inh).szenario.ereignisse?.find((e) => e.id === id);
}

/** Steht das Fahrzeug zur Zeit t (im Raum, nicht zerstört)? */
function steht(inh: Inhalte, z: Spielzustand, id: string, t: number): boolean {
  const ziel = inh.ziele[id];
  return !!ziel && vorhanden(ziel, t) && !((z.zerstoert[id] ?? Infinity) <= t);
}

/** Feinde (legitime Ziele), die zur Zeit t im Bereich des Ereignisses stehen. */
function feindeImBereich(inh: Inhalte, z: Spielzustand, e: Skriptereignis, t: number): string[] {
  const b = e.bereich;
  if (!b) return [];
  return inh.szenario.ziele.filter((ziel) => {
    if (!steht(inh, z, ziel.id, t)) return false;
    const gt = gtBei(ziel, t);
    if (!gt.legitim || gt.kategorie !== "feind") return false;
    const p = position(ziel, t);
    return b.x[0] <= p[0] && p[0] <= b.x[1] && b.y[0] <= p[1] && p[1] <= b.y[1];
  }).map((x) => x.id);
}

/** Fiel das Ereignis aus oder brach es ab (Freigabe auf seine Bedingungsziele bis t und vor seinem letzten Schuss)? */
export function ereignisAus(inh: Inhalte, z: Spielzustand, e: Skriptereignis, t: number): boolean {
  const frueh = fruehesteFreigabe(freigaben(inh, z), e.bedingung.ziele);
  const letzter = Math.max(e.bedingung.typ === "keine_freigabe_bis" ? e.bedingung.t_s : -Infinity, ...e.wirkungen.map((w) => w.t_s));
  return !!frueh && frueh.t <= t && frueh.t <= letzter;
}

/** Ziel-ID → Zeit der ersten Meldung, die das Team bekam (erschienen, nicht schon beim Erscheinen entfallen). */
export function gemeldetAb(inh: Inhalte, z: Spielzustand): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of z.reihenfolge) {
    const st = z.meldungen[id];
    const m = inh.meldungen[id];
    if (!m || (st.stufe === "entfallen" && !st.entfallen)) continue;
    for (const zid of m.ziele) out[zid] = Math.min(out[zid] ?? Infinity, st.erschienen.t_s);
  }
  return out;
}

export interface DurchFahrzeug {
  ziel: string;
  /** über dem Bach (Spielzeit) */
  t: number;
  /** Übergang („Brücke ELSTER“) */
  ueber: string;
  gruppe: string;
}

/** Fahrzeuge durchgebrochener Gruppen, die bis t über dem Bach sind (und bis dahin nicht zerstört), in der Reihenfolge des Übergangs. */
export function durchBis(inh: Inhalte, z: Spielzustand, t: number): DurchFahrzeug[] {
  const out: DurchFahrzeug[] = [];
  for (const g of durchbruchGruppen(inh, z.verstaerkungen)) {
    if (!z.durchbrueche[g.id]?.durch) continue;
    for (const zid of g.ziele) {
      const tc = g.ueber_s[zid];
      if (tc === undefined || tc > t || (z.zerstoert[zid] ?? Infinity) <= tc) continue;
      out.push({ ziel: zid, t: tc, ueber: g.ueber, gruppe: g.id });
    }
  }
  return out.sort((a, b) => a.t - b.t || a.ziel.localeCompare(b.ziel));
}

/** Eigene Einschläge bis t: [Einschlagzeit, Treffer]. */
function eigeneTreffer(z: Spielzustand, t: number) {
  const out: { t: number; getroffen: { ziel: string; was: string; kategorie: string }[]; verstoesse: string[] }[] = [];
  for (const id of z.reihenfolge) {
    for (const w of z.meldungen[id].wirkungen ?? []) if (w.t_einschlag <= t) out.push({ t: w.t_einschlag, getroffen: w.getroffen, verstoesse: w.verstoesse ?? [] });
  }
  return out;
}

/** Welche Teile der Behauptung stimmen zur Zeit t nicht? (leer: alles stimmt) */
export function abweichungen(basis: Inhalte, z: Spielzustand, b: Behauptung | undefined, t: number): string[] {
  if (!b) return [];
  const inh = weltFuer(basis, z);
  const aus: string[] = [];
  if (b.zerstoert && !b.zerstoert.every((id) => (z.zerstoert[id] ?? Infinity) <= t)) aus.push("zerstoert");
  if (b.stehen && !b.stehen.some((id) => steht(inh, z, id, t))) aus.push("stehen");
  if (b.hintergrund) {
    const hg = (inh.basis ?? inh).szenario.hintergrund?.ereignisse ?? [];
    if (!b.hintergrund.every((id) => !!z.hintergrund[id]?.wirkt && (hg.find((h) => h.id === id)?.t_s ?? Infinity) <= t)) aus.push("hintergrund");
  }
  if (b.ereignis_traf) {
    const st = z.ereignisse[b.ereignis_traf];
    if (!Object.values(st?.wirkungen ?? {}).some((w) => w.wirkt && w.t_s <= t)) aus.push("ereignis_traf");
  }
  for (const k of ["bereich_frei", "feind_im_bereich"] as const) {
    const id = b[k];
    if (!id) continue;
    const e = ereignis(inh, id);
    const n = e ? feindeImBereich(inh, z, e, t).length : 0;
    if (!e || (k === "bereich_frei" ? n > 0 : n === 0)) aus.push(k);
  }
  if (b.ereignis_aus) {
    const e = ereignis(inh, b.ereignis_aus);
    if (!e || !ereignisAus(inh, z, e, t)) aus.push("ereignis_aus");
  }
  if (b.getroffen) {
    const g = b.getroffen;
    const hit = new Set<string>();
    for (const w of eigeneTreffer(z, t)) {
      for (const x of w.getroffen) {
        if (!g.ziele.includes(x.ziel)) continue;
        if (g.personen ? x.was === "personen" && x.kategorie === g.personen : x.was !== "personen") hit.add(x.ziel);
      }
    }
    if (hit.size < (g.min ?? 1)) aus.push("getroffen");
  }
  if (b.durchbruch) {
    const gemeldet = gemeldetAb(inh, z);
    const liste = durchBis(inh, z, t).filter((d) => gemeldet[d.ziel] !== undefined && gemeldet[d.ziel] <= t);
    if (!(Array.isArray(b.durchbruch) ? liste.some((d) => (b.durchbruch as string[]).includes(d.ziel)) : liste.length > 0)) aus.push("durchbruch");
  }
  if (b.panzer_getroffen || b.beschuss) {
    const ev = verlustLage(basis, z).ereignisse.filter((e) => e.t <= t);
    if (b.panzer_getroffen && !ev.some((e) => e.art === b.panzer_getroffen && e.ergebnis === "treffer")) aus.push("panzer_getroffen");
    if (b.beschuss && !ev.some((e) => e.quelle === b.beschuss!.quelle && (!b.beschuss!.panzer || e.panzer === b.beschuss!.panzer))) aus.push("beschuss");
  }
  if (b.eloka && !elokaAktiv(inh, z.zerstoert, t)) aus.push("eloka");
  if (b.verstoss && !eigeneTreffer(z, t).some((w) => w.verstoesse.some((v) => v.startsWith(`${b.verstoss}:`)))) aus.push("verstoss");
  if (b.letzte_nicht_bekaempft) {
    const letzte = z.reihenfolge.map((id) => z.meldungen[id].entscheid).filter((e) => !!e && e.t_s <= t).sort((a, c) => a!.t_s - c!.t_s || a!.seq - c!.seq).pop();
    if (!letzte || letzte.entscheid === "bekaempfen") aus.push("letzte_nicht_bekaempft");
  }
  return aus;
}

/** Stimmt die Behauptung zur Zeit t? */
export function stimmt(basis: Inhalte, z: Spielzustand, b: Behauptung | undefined, t: number): boolean {
  return abweichungen(basis, z, b, t).length === 0;
}

/** Text und Behauptung einer Lagemeldung zur Zeit t: die erste Variante, die stimmt, sonst der Text der Lagemeldung selbst. */
export function variante(
  basis: Inhalte, z: Spielzustand, plan: { text: string; behauptet?: Behauptung; varianten?: { behauptet: Behauptung; text: string }[] }, t: number,
): { text: string; behauptet?: Behauptung; nr: number } {
  for (const [i, v] of (plan.varianten ?? []).entries()) {
    if (stimmt(basis, z, v.behauptet, t)) return { text: v.text, behauptet: v.behauptet, nr: i + 1 };
  }
  return { text: plan.text, behauptet: plan.behauptet, nr: 0 };
}

function aufzaehlen(teile: string[]): string {
  return teile.length <= 1 ? teile.join("") : `${teile.slice(0, -1).join(", ")} und ${teile[teile.length - 1]}`;
}

/**
 * Platzhalter aus dem Spielstand (seit 2.9, P4.3): {durch} – wer bis t über den Bach ist, je Meldung mit Zielnummer („KPz T-72 und SPz
 * BMP-2 (Ziel 33a)“; Anzahl nur, wenn mehr als eines), {ueber} – über welchen Übergang („die Brücke ELSTER“), {getroffen_zahl} – wie viele
 * Fahrzeuge der Bedingung (I-08a: die PT-91) eigene Wirkungen bis t trafen („Ein“, „Zwei“, „Drei“).
 */
export function behauptungWerte(basis: Inhalte, z: Spielzustand, t: number, ziele: string[] = []): Record<string, string> {
  const inh = weltFuer(basis, z);
  const werte: Record<string, string> = {};
  const gemeldet = gemeldetAb(inh, z);
  const liste = durchBis(inh, z, t).filter((d) => gemeldet[d.ziel] !== undefined && gemeldet[d.ziel] <= t);
  if (liste.length) {
    const nummern = zielNummern(inh, z);
    // je Fahrzeug die letzte Meldung des Teams, in der es stand (bis t)
    const nrVon = (zid: string) => {
      const ids = z.reihenfolge.filter((id) => inh.meldungen[id]?.ziele.includes(zid) && z.meldungen[id].erschienen.t_s <= t
        && !(z.meldungen[id].stufe === "entfallen" && !z.meldungen[id].entfallen));
      return ids.length ? nummern.get(ids[ids.length - 1]) ?? "?" : "?";
    };
    const gruppen: { nr: string; typen: Map<string, number> }[] = [];
    for (const d of liste) {
      const nr = nrVon(d.ziel);
      let g = gruppen.find((x) => x.nr === nr);
      if (!g) gruppen.push((g = { nr, typen: new Map() }));
      const name = kurzName(inh.fahrzeuge[inh.ziele[d.ziel]?.typ]?.name ?? d.ziel);
      g.typen.set(name, (g.typen.get(name) ?? 0) + 1);
    }
    werte.durch = aufzaehlen(gruppen.map((g) => `${aufzaehlen([...g.typen].map(([name, n]) => (n > 1 ? `${n} ${name}` : name)))} (Ziel ${g.nr})`));
    werte.ueber = aufzaehlen([...new Set(liste.map((d) => `die ${d.ueber}`))]);
  }
  if (ziele.length) {
    const hit = new Set<string>();
    for (const w of eigeneTreffer(z, t)) for (const x of w.getroffen) if (ziele.includes(x.ziel) && x.was !== "personen") hit.add(x.ziel);
    werte.getroffen_zahl = ["Kein", "Ein", "Zwei", "Drei", "Vier", "Fünf"][hit.size] ?? String(hit.size);
  }
  return werte;
}

/** Kurzer Text einer Behauptung für die Spielleitung („nur, wenn …“). */
export function behauptungText(b: Behauptung | undefined): string {
  if (!b) return "";
  const t: string[] = [];
  if (b.zerstoert) t.push(`${b.zerstoert.join(", ")} zerstört`);
  if (b.stehen) t.push(`${b.stehen.join("/")} steht noch`);
  if (b.hintergrund) t.push(`${b.hintergrund.join(", ")} hat gewirkt`);
  if (b.ereignis_traf) t.push(`${b.ereignis_traf} hat getroffen`);
  if (b.bereich_frei) t.push(`kein Feind mehr im Bereich von ${b.bereich_frei}`);
  if (b.feind_im_bereich) t.push(`Feind im Bereich von ${b.feind_im_bereich}`);
  if (b.ereignis_aus) t.push(`${b.ereignis_aus} ausgefallen`);
  if (b.getroffen) t.push(`eigene Wirkung traf ${b.getroffen.personen ? `${b.getroffen.personen === "zivil" ? "Zivilpersonen" : b.getroffen.personen} bei ` : ""}${b.getroffen.ziele.join("/")}`);
  if (b.durchbruch) t.push("gemeldete Kräfte über dem Bach");
  if (b.panzer_getroffen) t.push("eigener Panzer vom Durchbruch getroffen");
  if (b.beschuss) t.push(`Feuer von ${b.beschuss.quelle}${b.beschuss.panzer ? ` auf ${b.beschuss.panzer}` : ""}`);
  if (b.eloka) t.push("Datenlink gestört (EloKa)");
  if (b.verstoss) t.push(`eigene Wirkung mit Verstoß ${b.verstoss}`);
  if (b.letzte_nicht_bekaempft) t.push("letzte Entscheidung war nicht BEKÄMPFEN");
  return t.join(" · ");
}
