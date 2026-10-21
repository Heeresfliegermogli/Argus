// Zeitplan des Szenarios: Was ist zur Spielzeit t fällig? Reine Funktion von Inhalten, Spielstand
// und t, damit ein neu gestarteter Host genau dort weitermacht, wo der alte aufgehört hat.
//
// Umfang Schritt 4: Meldungen (mit Fast-Track-Weiche und „entfällt“), feste und bedingte Injects,
// Wirkung nach Vorlaufzeit, Spielende. Skriptereignisse (E-01) und Bewegung folgen in Schritt 7.
import type { Inhalte, Meldung } from "../inhalte/typen";
import { berechneWirkung } from "../kern/regeln";
import type { Spielzustand } from "../kern/zustand";
import { uhrzeit } from "../kern/uhr";
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
    // Uhr nur anhalten, wenn sie noch läuft – sonst entstünde bei jedem Takt ein neues Uhr-Ereignis
    // und das Spielende käme nie (Fehler bis Schritt 5).
    if (z.uhr.laeuft) liste.push(entwurf("uhr", { befehl: "pause", laeuft: false, t_s: dauer, tempo: z.uhr.tempo }, { t_geplant: dauer }));
    liste.push(entwurf("spielende", { grund: "Spielzeit abgelaufen" }, { t_geplant: dauer }));
  }

  return liste.sort((a, b) => (a.t_geplant ?? t) - (b.t_geplant ?? t));
}

/** Stand eines bedingten Injects oder Skriptereignisses für die Spielleitung. */
export interface BedingtStand {
  id: string;
  art: "inject" | "ereignis";
  /** wartet: Bedingung offen · erfuellt: kommt zur Zeit t · ausgeloest · entfaellt */
  status: "wartet" | "erfuellt" | "ausgeloest" | "entfaellt";
  text: string;
  t?: number;
}

function bedingungText(inh: Inhalte, b: NonNullable<Inhalte["szenario"]["injects"][number]["bedingung"]>): string {
  const ziele = b.ziele.length > 1 ? `${b.ziele[0]}–${b.ziele[b.ziele.length - 1].slice(2)}` : b.ziele[0];
  const uhr = (t: number) => uhrzeitKurz(inh, t);
  if (b.typ === "keine_freigabe_bis") return `wenn bis ${uhr(b.t_s)} keine Freigabe auf ${ziele}`;
  if (b.typ === "freigabe_mit_zivil") return `${b.verzoegerung_s} s nach Freigabe auf ${ziele}, wenn Zivilpersonen im Wirkradius`;
  return `${b.verzoegerung_s} s nach Freigabe auf ${ziele}`;
}

function uhrzeitKurz(inh: Inhalte, t: number): string {
  return uhrzeit(inh.szenario.spieluhr.start, t);
}

/**
 * Was die Spielleitung zu bedingten Injects (I-08a, I-08b, I-09) und Skriptereignissen (E-01) wissen
 * muss: wartet die Bedingung noch, ist sie erfüllt (und wann kommt es), ist es ausgelöst oder entfällt
 * es. Gleiche Logik wie faellig(), nur als Anzeige.
 */
export function bedingtStand(inh: Inhalte, z: Spielzustand, t: number): BedingtStand[] {
  const frei = freigaben(inh, z);
  const aus: BedingtStand[] = [];
  const pruefe = (id: string, art: BedingtStand["art"], b: Inhalte["szenario"]["injects"][number]["bedingung"] & object, ausgeloest: boolean) => {
    const text = bedingungText(inh, b);
    if (ausgeloest) return aus.push({ id, art, status: "ausgeloest", text });
    if (b.typ === "keine_freigabe_bis") {
      const frueh = b.ziele.map((zid) => frei.get(zid)).filter((f) => f && f.t <= b.t_s).sort((a, c) => a!.t - c!.t)[0];
      if (frueh) return aus.push({ id, art, status: "entfaellt", text: `${text} – entfällt (Freigabe ${frueh.meldung} ${uhrzeitKurz(inh, frueh.t)})` });
      return aus.push({ id, art, status: t >= b.t_s ? "erfuellt" : "wartet", text, t: b.t_s });
    }
    const treffer = b.ziele.map((zid) => frei.get(zid)).filter((f) => f !== undefined).sort((a, c) => a.t - c.t);
    if (!treffer.length) return aus.push({ id, art, status: "wartet", text });
    const erste = treffer[0];
    if (b.typ === "freigabe_mit_zivil") {
      const zivil = erste.wirkmittel && berechneWirkung(inh, inh.meldungen[erste.meldung], erste.wirkmittel, erste.t).getroffen.some((g) => g.kategorie === "zivil");
      if (!zivil) return aus.push({ id, art, status: "entfaellt", text: `${text} – entfällt (keine Zivilpersonen bei Freigabe ${uhrzeitKurz(inh, erste.t)})` });
    }
    return aus.push({ id, art, status: "erfuellt", text: `${text} – Freigabe ${erste.meldung} ${uhrzeitKurz(inh, erste.t)}`, t: erste.t + b.verzoegerung_s });
  };
  for (const i of inh.szenario.injects) if (i.bedingung) pruefe(i.id, "inject", i.bedingung, !!z.injects[i.id]);
  for (const e of inh.szenario.ereignisse ?? []) pruefe(e.id, "ereignis", e.bedingung, false);
  return aus;
}
