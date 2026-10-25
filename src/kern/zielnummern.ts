// Einfache Zielnummern für die Spieler (Änderung B7, 25.10.2026): Ziele heißen „Ziel 1, 2, 3 …“ in der Reihenfolge,
// in der ARGUS sie meldet – statt M07 oder Z-07. Gruppen (zugweise Meldungen) heißen „Ziel 7 (3 Fz)“.
//
// Die Nummer einer Meldung des Szenarios ist ihr Platz in der Zeitleiste (nach t_s): Ohne Verstärkung ist das genau
// die Reihenfolge, in der ARGUS meldet, und sie ist für alle Teams gleich – die Auswertung vergleicht die Teams mit
// denselben Nummern. Meldungen einer Verstärkung bekommen die Nummer der zuletzt erschienenen Meldung des Szenarios
// mit Buchstaben (8a, 8b …), damit die Nummern der Szenario-Meldungen in allen Teams gleich bleiben.
// Die interne Kennung (M07) sieht nur die Spielleitung, klein daneben.
import type { Inhalte, Meldung, Szenario } from "../inhalte/typen";
import type { Spielzustand } from "./zustand";

const BASIS = new WeakMap<Szenario, Map<string, number>>();

/** Nummer je Meldung des Szenarios (ohne Verstärkungen): Platz nach t_s, 1 … n. */
export function basisNummern(sz: Szenario): Map<string, number> {
  let m = BASIS.get(sz);
  if (!m) {
    const liste = sz.meldungen.filter((x) => !x.verstaerkung).map((x, i) => ({ id: x.id, t: x.t_s, i }));
    liste.sort((a, b) => a.t - b.t || a.i - b.i);
    m = new Map(liste.map((x, i) => [x.id, i + 1]));
    BASIS.set(sz, m);
  }
  return m;
}

function basisSzenario(inh: Inhalte): Szenario {
  return (inh.basis ?? inh).szenario;
}

const TEAM = new WeakMap<Spielzustand, Map<string, string>>();

/**
 * Nummern im Lauf eines Teams: Szenario-Meldungen nach basisNummern, Verstärkungen nach der zuletzt erschienenen
 * Szenario-Meldung mit Buchstaben (a, b, …).
 */
export function zielNummern(inh: Inhalte, z: Spielzustand): Map<string, string> {
  let m = TEAM.get(z);
  if (m) return m;
  const basis = basisNummern(basisSzenario(inh));
  m = new Map();
  let letzte = 0;
  let zusatz = 0;
  for (const id of z.reihenfolge) {
    const n = basis.get(id);
    if (n !== undefined) {
      m.set(id, String(n));
      letzte = Math.max(letzte, n);
      zusatz = 0;
    } else {
      m.set(id, `${letzte}${String.fromCharCode(97 + Math.min(25, zusatz))}`);
      zusatz += 1;
    }
  }
  TEAM.set(z, m);
  return m;
}

/** Nummer einer Meldung (ohne „Ziel“), z. B. „7“ oder „8a“; ohne Lauf die Nummer im Szenario. */
export function zielNr(inh: Inhalte, z: Spielzustand | null, id: string): string {
  const n = z ? zielNummern(inh, z).get(id) : undefined;
  return n ?? String(basisNummern(basisSzenario(inh)).get(id) ?? id);
}

/** „Ziel 7“ bzw. bei einer Gruppe „Ziel 7 (3 Fz)“. */
export function zielName(inh: Inhalte, z: Spielzustand | null, id: string, gruppe = true): string {
  const m: Meldung | undefined = inh.meldungen[id];
  const n = m && gruppe && m.ziele.length > 1 ? ` (${m.ziele.length} Fz)` : "";
  return `Ziel ${zielNr(inh, z, id)}${n}`;
}

/** Interne Kennungen M07 in Texten des Szenarios durch „Ziel 7“ ersetzen (Anzeige; Kennungen in den Daten bleiben). */
export function meldungenImText(text: string, basis: Map<string, number>): string {
  return text.replace(/\bM(\d{2})\b/g, (ganz, nr: string) => {
    const n = basis.get(`M${nr}`);
    return n === undefined ? ganz : `Ziel ${n}`;
  });
}
