// Lage eines Teams: Welt (Inhalte plus Verstärkungen), welche Fahrzeuge weg sind, Freigaben und Einschläge.
// Reine Funktionen von Inhalten und Spielstand; Engine (Zeitplan), Lagebild und Übersicht nutzen sie gemeinsam.
import type { Inhalte } from "../inhalte/typen";
import { weg } from "./geometrie";
import { einschlag } from "./regeln";
import { welt } from "./welt";
import type { Spielzustand } from "./zustand";

/** Welt des Teams: Inhalte plus eingespielte Verstärkungen. */
export function weltFuer(inh: Inhalte, z: Spielzustand): Inhalte {
  return welt(inh, z.verstaerkungen);
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

