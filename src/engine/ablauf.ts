// Zeitplan des Szenarios: Was ist zur Spielzeit t fällig? Reine Funktion von Inhalten, Spielstand
// und t, damit ein neu gestarteter Host genau dort weitermacht, wo der alte aufgehört hat.
//
// Umfang Schritt 4: Meldungen (mit Fast-Track-Weiche und „entfällt“), feste und bedingte Injects,
// Wirkung nach Vorlaufzeit, Spielende. Skriptereignisse (E-01) und Bewegung folgen in Schritt 7.
import type { Inhalte, Meldung } from "../inhalte/typen";
import { berechneWirkung } from "../kern/regeln";
import type { Spielzustand } from "../kern/zustand";
import { type Entwurf, entwurf } from "./entwurf";

export function fastTrackGreift(inh: Inhalte, z: Spielzustand, m: Meldung): boolean {
  return z.fastTrack && m.argus.konfidenz >= inh.regeln.fast_track.schwelle && m.argus.empfehlung === "BEKÄMPFEN";
}

/** Meldung freigeben: als Entwurf mit Fast-Track-Weiche und „entfällt“, wenn ein Ziel schon zerstört ist. */
export function meldungEntwurf(inh: Inhalte, z: Spielzustand, m: Meldung, manuell = false): Entwurf {
  const entfaellt = m.ziele.some((id) => z.zerstoert[id] !== undefined);
  return entwurf("meldung", {
    meldung: m.id,
    ...(entfaellt ? { entfaellt: true } : fastTrackGreift(inh, z, m) ? { fast_track: true } : {}),
    ...(manuell ? { manuell: true } : {}),
  }, { t_geplant: manuell ? undefined : m.t_s });
}

/** Freigaben je Ziel: Ziel → frühester Freigabezeitpunkt und auslösende Meldung. */
export function freigaben(inh: Inhalte, z: Spielzustand): Map<string, { t: number; meldung: string; wirkmittel?: string }> {
  const out = new Map<string, { t: number; meldung: string; wirkmittel?: string }>();
  for (const id of z.reihenfolge) {
    const st = z.meldungen[id];
    const g3 = st.g3;
    if (!g3 || g3.entscheid !== "freigabe") continue;
    for (const zid of inh.meldungen[id].ziele) {
      const alt = out.get(zid);
      if (!alt || g3.t_s < alt.t) out.set(zid, { t: g3.t_s, meldung: id, wirkmittel: g3.wirkmittel });
    }
  }
  return out;
}

export function faellig(inh: Inhalte, z: Spielzustand, t: number): Entwurf[] {
  const sz = inh.szenario;
  const liste: Entwurf[] = [];
  if (z.seq === 0) return liste;

  for (const m of sz.meldungen) {
    if (m.t_s > t) break;
    if (!z.meldungen[m.id]) liste.push(meldungEntwurf(inh, z, m));
  }

  const frei = freigaben(inh, z);
  for (const i of sz.injects) {
    if (z.injects[i.id]) continue;
    if (i.t_s !== undefined) {
      if (i.t_s <= t) liste.push(entwurf("inject", { inject: i.id }, { t_geplant: i.t_s }));
      continue;
    }
    const b = i.bedingung;
    if (!b) continue;
    if (b.typ === "keine_freigabe_bis") {
      const frueh = b.ziele.some((zid) => (frei.get(zid)?.t ?? Infinity) <= b.t_s);
      if (t >= b.t_s && !frueh) liste.push(entwurf("inject", { inject: i.id }, { t_geplant: b.t_s }));
      continue;
    }
    const treffer = b.ziele.map((zid) => frei.get(zid)).filter((f) => f !== undefined);
    if (!treffer.length) continue;
    const erste = treffer.sort((a, c) => a.t - c.t)[0];
    if (b.typ === "freigabe_mit_zivil") {
      const m = inh.meldungen[erste.meldung];
      const zivil = erste.wirkmittel
        && berechneWirkung(inh, m, erste.wirkmittel, erste.t).getroffen.some((g) => g.kategorie === "zivil");
      if (!zivil) continue;
    }
    if (t >= erste.t + b.verzoegerung_s) {
      liste.push(entwurf("inject", { inject: i.id }, { t_geplant: erste.t + b.verzoegerung_s }));
    }
  }

  for (const id of z.reihenfolge) {
    const st = z.meldungen[id];
    if (st.stufe !== "wirkung" || !st.g3?.wirkmittel) continue;
    const wm = inh.wirkmittel[st.g3.wirkmittel];
    const tWirkung = st.g3.t_s + wm.vorlauf_s;
    if (t < tWirkung) continue;
    const w = berechneWirkung(inh, inh.meldungen[id], wm.id, st.g3.t_s);
    liste.push(entwurf("wirkung", {
      meldung: id, wirkmittel: wm.id, pos: [Math.round(w.pos[0]), Math.round(w.pos[1])], t_freigabe: st.g3.t_s,
      getroffen: w.getroffen,
    }, { t_geplant: tWirkung }));
  }

  const dauer = sz.spieluhr.dauer_s;
  if (t >= dauer && !z.ende) {
    liste.push(entwurf("uhr", { befehl: "pause", laeuft: false, t_s: dauer, tempo: z.uhr.tempo }, { t_geplant: dauer }));
    liste.push(entwurf("spielende", { grund: "Spielzeit abgelaufen" }, { t_geplant: dauer }));
  }

  return liste.sort((a, b) => (a.t_geplant ?? t) - (b.t_geplant ?? t));
}
