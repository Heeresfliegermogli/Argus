// Lage eines Teams: Welt (Inhalte plus Verstärkungen), welche Fahrzeuge weg sind, Freigaben und Einschläge.
// Reine Funktionen von Inhalten und Spielstand; Engine (Zeitplan), Lagebild und Übersicht nutzen sie gemeinsam.
import type { Inhalte, Punkt } from "../inhalte/typen";
import { weg } from "./geometrie";
import { type Einschlag, einschlag } from "./regeln";
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

/** Freigaben (BEKÄMPFEN) je Ziel: Ziel → frühester Zeitpunkt und auslösende Meldung. */
export function freigaben(inh: Inhalte, z: Spielzustand): Map<string, { t: number; meldung: string; wirkmittel?: string }> {
  const out = new Map<string, { t: number; meldung: string; wirkmittel?: string }>();
  for (const id of z.reihenfolge) {
    const f = z.meldungen[id].freigabe;
    if (!f || !inh.meldungen[id]) continue;
    for (const zid of inh.meldungen[id].ziele) {
      const alt = out.get(zid);
      if (!alt || f.t_s < alt.t) out.set(zid, { t: f.t_s, meldung: id, wirkmittel: f.wirkmittel });
    }
  }
  return out;
}

/** Früheste Freigabe auf eines der Ziele (oder undefined). */
export function fruehesteFreigabe(frei: ReturnType<typeof freigaben>, ziele: string[]) {
  return ziele.map((zid) => frei.get(zid)).filter((f) => f !== undefined).sort((a, b) => a.t - b.t)[0];
}

/** Einschlag einer freigegebenen Meldung (aus dem Protokoll; ältere Läufe ohne einschlag: neu gerechnet). Bei einem Zug der erste. */
export function einschlagVon(inh: Inhalte, z: Spielzustand, id: string) {
  const f = z.meldungen[id]?.freigabe;
  if (!f?.wirkmittel) return null;
  if (f.einschlag) return { t: f.einschlag.t, pos: f.einschlag.pos, ziel: f.einschlag.ziel };
  const m = inh.meldungen[id];
  return m ? einschlag(inh, m.ziele, f.wirkmittel, f.t_s, z.zerstoert) : null;
}

/** Alle Einschläge einer bekämpften Meldung (seit 2.4, E3: bei einer Zug-Bekämpfung je Fahrzeug einer), in Reihenfolge. */
export function einschlaegeVon(inh: Inhalte, z: Spielzustand, id: string): Einschlag[] {
  const f = z.meldungen[id]?.freigabe;
  if (f?.einschlaege?.length) return f.einschlaege.map((e) => ({ t: e.t, pos: [e.x, e.y] as Punkt, ziel: e.ziel }));
  const e = einschlagVon(inh, z, id);
  return e ? [e] : [];
}

/** Einschläge einer Freigabe, die noch ausstehen (Nummer und Einschlag). */
export function offeneEinschlaege(inh: Inhalte, z: Spielzustand, id: string): { nr: number; e: Einschlag }[] {
  const st = z.meldungen[id];
  if (!st || st.stufe !== "wirkung") return [];
  const da = new Set((st.wirkungen ?? []).map((w) => w.nr));
  return einschlaegeVon(inh, z, id).map((e, nr) => ({ nr, e })).filter((x) => !da.has(x.nr));
}

