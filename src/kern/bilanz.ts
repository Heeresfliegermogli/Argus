// Bilanz „Das ist es wert“ (seit 2.7, Änderung G2): Was ein Team – oder „ARGUS allein“ – in Spielwerten geleistet hat, und was in
// keiner Bilanz auftaucht.
//
// Teil 1 (Leistung): zerstörte Feindfahrzeuge mit Spielwert (regeln.bilanz.fahrzeuge_mio_eur), ihr Wert in Mio €, Munitionskosten
// (Einschläge × Preis), Zeit von der Meldung bis zur Wirkung (Median), eigene Panzer einsatzbereit, dazu „Wie lange habt ihr
// hingeschaut?“ (Sekunden ab Eingang bis zur Entscheidung, Median, H2.4).
// Teil 2 (Nicht in der Bilanz): Fehlbekämpfungen ohne Eurowert – Personen je Gruppe einmal, Fahrzeuge je Fahrzeug einmal.
//
// Keine Rangfolge, keine Wertung: nur Zahlen nebeneinander. Gleich gerechnet in tools/referenz/bilanz.py (Vergleich in den Tests).
import type { Inhalte, RegelnBilanz } from "../inhalte/typen";
import { weltFuer } from "./lage";
import { mitVerlusten, verlustStand } from "./verluste";
import type { Spielzustand } from "./zustand";

export const FEHL_IDS = ["sanitaet", "zivil", "kamerateam", "verwundete", "weisses_tuch", "verbuendet", "attrappe"] as const;
export type FehlId = (typeof FEHL_IDS)[number];

export interface Bilanz {
  /** zerstörte Feindfahrzeuge mit Spielwert (je Fahrzeug einmal) */
  fahrzeuge: number;
  fahrzeugIds: string[];
  /** Summe der Spielwerte in Mio € (auf 0,01 gerundet) */
  wertMio: number;
  /** Einschläge je Wirkmittel (ein Einschlag = ein Schuss bzw. eine LM) */
  schuss: Record<string, number>;
  munitionEur: number;
  /** Meldung bis (erster) Einschlag, Median in s */
  medianS: number | null;
  /** Sekunden ab Eingang bis zur Entscheidung, Median (null: keine Entscheidung) */
  hingeschautS: number | null;
  panzer: { bereit: number; gesamt: number } | null;
  fehl: Record<FehlId, number>;
  kinder: number;
  /** Fehlbekämpfungen insgesamt (Summe über die Arten, Kinder nicht doppelt) */
  fehlSumme: number;
}

function median(werte: number[]): number | null {
  if (!werte.length) return null;
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Spielwerte aus regeln.json (Abschnitt bilanz); null, wenn das Szenario keine hat. */
export function bilanzRegeln(inh: Inhalte): RegelnBilanz | null {
  return (inh.basis ?? inh).regeln.bilanz ?? null;
}

/** Bilanz eines Laufs (Team oder Referenzlauf) zum Stand des Spielzustands. */
export function bilanz(basis: Inhalte, z: Spielzustand): Bilanz | null {
  const regel = bilanzRegeln(basis);
  if (!regel) return null;
  const inh = weltFuer(basis, z);
  const werte = regel.fahrzeuge_mio_eur;
  const jeTyp = regel.personen_je_typ ?? {};
  const feind = new Map<string, number>();
  const schuss: Record<string, number> = {};
  const zeiten: number[] = [];
  const hingeschaut: number[] = [];
  const fahrzeugFehl: Record<"sanitaet" | "verbuendet" | "attrappe" | "verwundete", Set<string>> = {
    sanitaet: new Set(), verbuendet: new Set(), attrappe: new Set(), verwundete: new Set(),
  };
  const personen = new Map<string, { art: FehlId; n: number; kinder: number }>();
  for (const id of z.reihenfolge) {
    const st = z.meldungen[id];
    if (st.entscheid?.sek_eingang !== undefined) hingeschaut.push(st.entscheid.sek_eingang);
    const f = st.freigabe;
    if (!f) continue;
    const plan = f.einschlaege?.length ? f.einschlaege.map((e) => e.t) : f.einschlag ? [f.einschlag.t] : [];
    schuss[f.wirkmittel] = (schuss[f.wirkmittel] ?? 0) + Math.max(1, plan.length);
    if (plan.length) zeiten.push(Math.round((plan[0] - st.erschienen.t_s) * 100) / 100);
    for (const w of st.wirkungen ?? []) {
      for (const g of w.getroffen) {
        const ziel = inh.ziele[g.ziel];
        if (!ziel) continue;
        if (g.was !== "personen") {
          if (g.was === "attrappe" || g.kategorie === "attrappe") fahrzeugFehl.attrappe.add(g.ziel);
          else if (g.kategorie === "feind" && werte[ziel.typ] !== undefined) { if (!feind.has(g.ziel)) feind.set(g.ziel, w.t_einschlag); }
          else if (g.kategorie === "geschuetzt") fahrzeugFehl.sanitaet.add(g.ziel);
          else if (g.kategorie === "verbuendet") fahrzeugFehl.verbuendet.add(g.ziel);
          else if (g.kategorie === "ausser_gefecht" && jeTyp[ziel.typ] !== undefined) fahrzeugFehl.verwundete.add(g.ziel);
          continue;
        }
        const p = (ziel.personen ?? []).find((x) => x.art === g.kategorie && x.anzahl === g.anzahl);
        if (!p) continue;
        const art: FehlId | null = g.kategorie === "zivil" ? (ziel.typ === "pkw_presse" ? "kamerateam" : "zivil")
          : g.kategorie === "besatzung_ergibt_sich" ? "weisses_tuch" : null;
        const schl = `${g.ziel}|${g.kategorie}`;
        if (art && !personen.has(schl)) personen.set(schl, { art, n: p.anzahl, kinder: p.klein ?? 0 });
      }
    }
  }
  const fehl = Object.fromEntries(FEHL_IDS.map((k) => [k, 0])) as Record<FehlId, number>;
  let kinder = 0;
  for (const p of personen.values()) {
    fehl[p.art] += p.n;
    if (p.art === "zivil") kinder += p.kinder;
  }
  for (const [art, ids] of Object.entries(fahrzeugFehl) as [keyof typeof fahrzeugFehl, Set<string>][]) {
    for (const zid of ids) fehl[art] += art === "verwundete" ? jeTyp[inh.ziele[zid].typ] ?? 1 : 1;
  }
  const dauer = (basis.basis ?? basis).szenario.spieluhr.dauer_s;
  const st = mitVerlusten(basis) ? verlustStand(basis, z, z.ende ? dauer : Math.min(dauer, z.uhr.t_s)) : null;
  const ids = [...feind.keys()].sort();
  return {
    fahrzeuge: ids.length,
    fahrzeugIds: ids,
    wertMio: Math.round(ids.reduce((a, i) => a + werte[inh.ziele[i].typ], 0) * 100) / 100,
    schuss: Object.fromEntries(Object.entries(schuss).sort(([a], [b]) => a.localeCompare(b))),
    munitionEur: Object.entries(schuss).reduce((a, [w, n]) => a + n * (regel.munition_eur[w] ?? 0), 0),
    medianS: median(zeiten),
    hingeschautS: median(hingeschaut),
    panzer: st ? { bereit: st.zug.bereit, gesamt: st.zug.gesamt } : null,
    fehl,
    kinder,
    fehlSumme: FEHL_IDS.reduce((a, k) => a + fehl[k], 0),
  };
}

/** Mio € mit Komma, z. B. „15,85“. */
export function mio(x: number): string {
  return x.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Euro als Mio mit einer Nachkommastelle („2,1 Mio €“) oder in Tsd. („48 Tsd. €“). */
export function euro(x: number): string {
  if (x >= 1e6) return `${(x / 1e6).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mio €`;
  if (x >= 1e3) return `${Math.round(x / 1e3).toLocaleString("de-DE")} Tsd. €`;
  return `${x.toLocaleString("de-DE")} €`;
}
