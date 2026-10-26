// Lage eines Teams: Welt (Inhalte plus Verstärkungen), welche Fahrzeuge weg sind, Freigaben und Einschläge.
// Reine Funktionen von Inhalten und Spielstand; Engine (Zeitplan), Lagebild und Übersicht nutzen sie gemeinsam.
import type { Inhalte } from "../inhalte/typen";
import { weg } from "./geometrie";
import { einschlag } from "./regeln";
import { welt } from "./welt";
import type { Spielzustand } from "./zustand";

/** Welt des Teams: Inhalte plus eingespielte Verstärkungen und Durchbrüche (in Protokollreihenfolge). */
export function weltFuer(inh: Inhalte, z: Spielzustand): Inhalte {
  return welt(inh, z.verstaerkungen, durchIds(z));
}

const DURCH = new WeakMap<Spielzustand["durchbrueche"], string[]>();

/** Kennungen der durchgebrochenen Gruppen in Protokollreihenfolge (gleiches Objekt ⇒ gleiche Liste, für den Cache). */
export function durchIds(z: Spielzustand): string[] {
  const d = z.durchbrueche ?? {};
  let l = DURCH.get(d);
  if (!l) {
    l = Object.entries(d).filter(([, v]) => v.durch).sort((a, b) => a[1].seq - b[1].seq).map(([k]) => k);
    DURCH.set(d, l);
  }
  return l;
}

/** Ab wann Fahrzeuge außer Gefecht sind (Hintergrundgefecht mit folge ausser_gefecht, wenn es gewirkt hat). */
export function ausserGefechtZeiten(inh: Inhalte, z: Spielzustand): Record<string, number> {
  const out: Record<string, number> = {};
  for (const h of inh.szenario.hintergrund?.ereignisse ?? []) {
    if (h.art === "panzerabwehr" && h.folge === "ausser_gefecht" && z.hintergrund[h.id]?.wirkt) out[h.ziel] = h.t_s;
  }
  return out;
}

/** Ist jedes Fahrzeug der Liste zur Zeit t weg (zerstört oder nicht im Raum)? */
export function alleWeg(inh: Inhalte, z: Spielzustand, ziele: string[], t: number): boolean {
  return ziele.every((id) => !inh.ziele[id] || weg(inh.ziele[id], t, z.zerstoert));
}

/** Ab wann jedes Fahrzeug der Liste weg ist (zerstört oder abgezogen); Infinity, solange eines bleibt. */
export function wegAb(inh: Inhalte, z: Spielzustand, ziele: string[]): number {
  let ab = -Infinity;
  for (const id of ziele) {
    const zi = inh.ziele[id];
    if (!zi) continue;
    ab = Math.max(ab, Math.min(z.zerstoert[id] ?? Infinity, zi.bis_s ?? Infinity));
  }
  return ab;
}

/** Freigaben je Ziel: Ziel → frühester Freigabezeitpunkt und auslösende Meldung. */
export function freigaben(inh: Inhalte, z: Spielzustand): Map<string, { t: number; meldung: string; wirkmittel?: string }> {
  const out = new Map<string, { t: number; meldung: string; wirkmittel?: string }>();
  for (const id of z.reihenfolge) {
    const g3 = z.meldungen[id].g3;
    if (!g3 || g3.entscheid !== "freigabe" || !inh.meldungen[id]) continue;
    for (const zid of inh.meldungen[id].ziele) {
      const alt = out.get(zid);
      if (!alt || g3.t_s < alt.t) out.set(zid, { t: g3.t_s, meldung: id, wirkmittel: g3.wirkmittel });
    }
  }
  return out;
}

/** Früheste Freigabe auf eines der Ziele (oder undefined). */
export function fruehesteFreigabe(frei: ReturnType<typeof freigaben>, ziele: string[]) {
  return ziele.map((zid) => frei.get(zid)).filter((f) => f !== undefined).sort((a, b) => a.t - b.t)[0];
}

/** Einschlag einer freigegebenen Meldung (aus dem Protokoll; ältere Läufe ohne einschlag: neu gerechnet). */
export function einschlagVon(inh: Inhalte, z: Spielzustand, id: string) {
  const g3 = z.meldungen[id]?.g3;
  if (!g3?.wirkmittel || g3.entscheid !== "freigabe") return null;
  if (g3.einschlag) return { t: g3.einschlag.t, pos: g3.einschlag.pos, ziel: g3.einschlag.ziel };
  const m = inh.meldungen[id];
  return m ? einschlag(inh, m.ziele, g3.wirkmittel, g3.t_s, z.zerstoert) : null;
}

