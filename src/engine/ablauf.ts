// Zeitplan des Szenarios: Was ist zur Spielzeit t fällig? Reine Funktion von Inhalten, Spielstand
// und t, damit ein neu gestarteter Host genau dort weitermacht, wo der alte aufgehört hat.
//
// Seit Schritt 7 (Szenario 2.0):
//   • Meldungen mit Fast-Track-Weiche; eine Meldung entfällt, wenn jedes ihrer Fahrzeuge zerstört oder
//     abgezogen ist – beim Erscheinen oder später in der Kette (meldung_entfaellt bei G1, G2 oder G3).
//   • Wirkung zum Einschlagzeitpunkt, Treffer nach der Lage beim Einschlag (kern/regeln.ts).
//   • Hintergrundgefecht (szenario.hintergrund): eigene Panzerabwehr wirkt nur, wenn das Ziel dann noch steht.
//   • Skriptereignis E-01 (polnischer Gegenangriff) mit Abbruch durch eine Freigabe auf Z-15–17.
//   • Verstärkungen: die Welt des Teams (kern/welt.ts) enthält ihre Ziele und Meldungen.
//
// Gleichzeitigkeit (deterministisch, wie simuliere_durchlauf.py): Zerstörungen zum Zeitpunkt T gelten für
// Entscheidungen zum Zeitpunkt T schon. Was davon abhängt, dass bis T keine Freigabe kam (E-01, I-08b),
// wird erst fällig, wenn die Uhr T überschritten hat – eine Freigabe genau um T zählt also noch.
import type { HintergrundEreignis, Inhalte, Meldung } from "../inhalte/typen";
import { gtBei, position, weg } from "../kern/geometrie";
import { alleWeg, einschlagVon, freigaben, fruehesteFreigabe, wegAb, weltFuer } from "../kern/lage";
import { verstossText, wirkungBeimEinschlag } from "../kern/regeln";
import { uhrzeit } from "../kern/uhr";
import type { Spielzustand } from "../kern/zustand";

export { alleWeg, einschlagVon, freigaben, wegAb, weltFuer };
import { type Entwurf, entwurf } from "./entwurf";

/** kleiner Abstand für „erst nach T fällig“ (s) */
export const NACH = 0.001;

export function fastTrackGreift(inh: Inhalte, z: Spielzustand, m: Meldung): boolean {
  return z.fastTrack && m.argus.konfidenz >= inh.regeln.fast_track.schwelle && m.argus.empfehlung === "BEKÄMPFEN";
}

/** Meldung freigeben: als Entwurf mit Fast-Track-Weiche und „entfällt“, wenn jedes Fahrzeug schon weg ist. */
export function meldungEntwurf(inh: Inhalte, z: Spielzustand, m: Meldung, manuell = false, t = m.t_s): Entwurf {
  const entfaellt = alleWeg(inh, z, m.ziele, t);
  return entwurf("meldung", {
    meldung: m.id,
    ...(entfaellt ? { entfaellt: true } : fastTrackGreift(inh, z, m) ? { fast_track: true } : {}),
    ...(manuell ? { manuell: true } : {}),
  }, { t_geplant: manuell ? undefined : m.t_s });
}

/** Zivilpersonen beim Einschlag dieser Freigabe? Nur bekannt, wenn die Wirkung schon da ist. */
function wirkungMitZivil(z: Spielzustand, id: string): number | null {
  const w = z.meldungen[id]?.wirkung;
  if (!w) return null;
  return w.getroffen.some((g) => g.kategorie === "zivil") ? w.t_einschlag : null;
}

function hgZielStand(inh: Inhalte, z: Spielzustand, h: HintergrundEreignis): { wirkt: boolean; grund?: string } {
  if (h.art !== "panzerabwehr") return { wirkt: true };
  const ziel = inh.ziele[h.ziel];
  if (!ziel) return { wirkt: false, grund: `${h.ziel} unbekannt` };
  if (weg(ziel, h.t_s, z.zerstoert)) {
    return { wirkt: false, grund: z.zerstoert[h.ziel] !== undefined ? `${h.ziel} schon zerstört (${z.zerstoertDurch[h.ziel] ?? "?"})` : `${h.ziel} nicht im Raum` };
  }
  const grenze = Object.values(inh.wirkmittel).find((w) => w.id === "PZA")?.einsatzbereich?.x_max;
  if (grenze !== undefined && position(ziel, h.t_s)[0] >= grenze) return { wirkt: false, grund: "jenseits der Einsatzgrenze" };
  return { wirkt: true };
}

/** Entwurf einer Wirkung (zum Einschlag oder bei Spielende abgerechnet). */
function wirkungEntwurf(inh: Inhalte, z: Spielzustand, id: string, dauer: number): Entwurf | null {
  const st = z.meldungen[id];
  const wmId = st.g3?.wirkmittel;
  const e = einschlagVon(inh, z, id);
  if (!wmId || !e || !inh.wirkmittel[wmId]) return null;
  const w = wirkungBeimEinschlag(inh, e, wmId, z.zerstoert);
  return entwurf("wirkung", {
    meldung: id, wirkmittel: wmId, pos: [Math.round(e.pos[0] * 10) / 10, Math.round(e.pos[1] * 10) / 10], t_freigabe: st.g3!.t_s,
    getroffen: w.getroffen, t_einschlag: Math.round(e.t * 100) / 100, ziel: e.ziel, verstoesse: w.pruefung.verstoesse.map(verstossText),
  }, { t_geplant: Math.min(e.t, dauer) });
}

export function faellig(basis: Inhalte, z: Spielzustand, t: number): Entwurf[] {
  const liste: Entwurf[] = [];
  if (z.seq === 0) return liste;
  const inh = weltFuer(basis, z);
  const sz = inh.szenario;
  const dauer = sz.spieluhr.dauer_s;
  const start = sz.spieluhr.start;

  // 1 Hintergrundgefecht (vor den eigenen Wirkungen: bei gleichem Zeitpunkt wirkt das Drehbuch zuerst)
  for (const h of sz.hintergrund?.ereignisse ?? []) {
    if (z.hintergrund[h.id] || t < h.t_s) continue;
    if (h.art === "panzerabwehr") {
      const s = hgZielStand(inh, z, h);
      liste.push(entwurf("hintergrund", { id: h.id, art: h.art, ziel: h.ziel, wirkt: s.wirkt, folge: h.folge, grund: s.grund }, { t_geplant: h.t_s }));
    } else {
      liste.push(entwurf("hintergrund", { id: h.id, art: h.art }, { t_geplant: h.t_s }));
    }
  }

  // 2 eigene Wirkungen zum Einschlag (bei Spielende alle noch ausstehenden)
  for (const id of z.reihenfolge) {
    if (z.meldungen[id].stufe !== "wirkung") continue;
    const e = einschlagVon(inh, z, id);
    if (!e || (t < e.t && t < dauer)) continue;
    const w = wirkungEntwurf(inh, z, id, dauer);
    if (w) liste.push(w);
  }

  // 3 Skriptereignisse (E-01): erst nach ihrem Zeitpunkt fällig, damit eine Freigabe genau dann noch zählt
  const frei = freigaben(inh, z);
  for (const e of sz.ereignisse ?? []) {
    const b = e.bedingung;
    if (b.typ !== "keine_freigabe_bis") continue;
    const stand = z.ereignisse[e.id];
    if (stand?.entfaellt) continue;
    const frueh = fruehesteFreigabe(frei, b.ziele);
    if (frueh && frueh.t <= b.t_s) {
      if (t > b.t_s && !Object.keys(stand?.wirkungen ?? {}).length) {
        liste.push(entwurf("ereignis", {
          ereignis: e.id, entfaellt: true, grund: `Freigabe ${frueh.meldung} um ${uhrzeit(start, frueh.t)} – Angriff abgebrochen`,
        }, { t_geplant: b.t_s }));
      }
      continue;
    }
    e.wirkungen.forEach((w, nr) => {
      if (stand?.wirkungen[nr] || !(t > w.t_s)) return;
      const ziel = inh.ziele[w.ziel];
      let grund: string | undefined;
      if (frueh && frueh.t <= w.t_s) grund = `Freigabe ${frueh.meldung} um ${uhrzeit(start, frueh.t)} – Angriff abgebrochen`;
      else if ((z.zerstoert[w.von] ?? Infinity) <= w.t_s) grund = `${w.von} ist ausgefallen`;
      else if (!ziel || weg(ziel, w.t_s, z.zerstoert)) grund = `${w.ziel} ${z.zerstoert[w.ziel] !== undefined ? "schon zerstört" : "nicht im Raum"}`;
      else if (ziel && !gtBei(ziel, w.t_s).legitim) grund = `${w.ziel} ist kein legitimes Ziel`;
      liste.push(entwurf("ereignis", { ereignis: e.id, nr, von: w.von, ziel: w.ziel, wirkt: !grund, grund }, { t_geplant: w.t_s }));
    });
  }

  // 4 Meldungen in der Kette, deren Fahrzeuge alle weg sind, entfallen
  for (const id of z.reihenfolge) {
    const st = z.meldungen[id];
    if (st.stufe !== "g1" && st.stufe !== "g2" && st.stufe !== "g3") continue;
    const m = inh.meldungen[id];
    if (!m) continue;
    const ab = wegAb(inh, z, m.ziele);
    if (ab > t) continue;
    const zerstoert = m.ziele.filter((zid) => z.zerstoert[zid] !== undefined).length;
    const grund = zerstoert === m.ziele.length ? (m.ziele.length > 1 ? "alle Fahrzeuge zerstört" : "Fahrzeug zerstört")
      : zerstoert ? "Fahrzeuge zerstört oder abgezogen" : "Ziel hat den Raum verlassen";
    liste.push(entwurf("meldung_entfaellt", { meldung: id, stufe: st.stufe, grund }, { t_geplant: ab }));
  }

  // 5 neue Meldungen
  for (const m of sz.meldungen) {
    if (m.t_s > t) break;
    if (!z.meldungen[m.id]) liste.push(meldungEntwurf(inh, z, m));
  }

  // 6 Injects: fest und bedingt
  for (const i of sz.injects) {
    if (z.injects[i.id]) continue;
    if (i.t_s !== undefined) {
      if (i.t_s <= t) liste.push(entwurf("inject", { inject: i.id }, { t_geplant: i.t_s }));
      continue;
    }
    const b = i.bedingung;
    if (!b) continue;
    if (b.typ === "keine_freigabe_bis") {
      const frueh = fruehesteFreigabe(frei, b.ziele);
      if (t > b.t_s && !(frueh && frueh.t <= b.t_s)) liste.push(entwurf("inject", { inject: i.id }, { t_geplant: b.t_s }));
      continue;
    }
    if (b.typ === "freigabe") {
      const erste = fruehesteFreigabe(frei, b.ziele);
      if (erste && t >= erste.t + b.verzoegerung_s) liste.push(entwurf("inject", { inject: i.id }, { t_geplant: erste.t + b.verzoegerung_s }));
      continue;
    }
    // freigabe_mit_zivil: zählt die Zivilpersonen beim Einschlag (frühestmöglich, sobald die Wirkung da ist)
    let tInject = Infinity;
    for (const id of z.reihenfolge) {
      const st = z.meldungen[id];
      if (st.g3?.entscheid !== "freigabe" || !inh.meldungen[id]?.ziele.some((zid) => b.ziele.includes(zid))) continue;
      const tz = wirkungMitZivil(z, id);
      if (tz !== null) tInject = Math.min(tInject, Math.max(st.g3.t_s + b.verzoegerung_s, tz));
    }
    if (t >= tInject) liste.push(entwurf("inject", { inject: i.id }, { t_geplant: tInject }));
  }

  // 7 Spielende
  if (t >= dauer && !z.ende) {
    // Uhr nur anhalten, wenn sie noch läuft – sonst entstünde bei jedem Takt ein neues Uhr-Ereignis
    // und das Spielende käme nie (Fehler bis Schritt 5).
    if (z.uhr.laeuft) liste.push(entwurf("uhr", { befehl: "pause", laeuft: false, t_s: dauer, tempo: z.uhr.tempo }, { t_geplant: dauer }));
    liste.push(entwurf("spielende", { grund: "Spielzeit abgelaufen" }, { t_geplant: dauer }));
  }

  // stabil sortiert: bei gleicher Zeit gilt die Reihenfolge oben
  return liste.sort((a, b) => (a.t_geplant ?? t) - (b.t_geplant ?? t));
}

/**
 * Nächster Zeitpunkt nach t, zu dem faellig() etwas liefern kann (Infinity: nichts mehr geplant).
 * Für Tests mit gesteuerter Uhr; der Host fragt einfach im Takt.
 */
export function naechsteFaelligkeit(basis: Inhalte, z: Spielzustand, t: number): number {
  const inh = weltFuer(basis, z);
  const sz = inh.szenario;
  const k: number[] = [sz.spieluhr.dauer_s];
  for (const m of sz.meldungen) if (!z.meldungen[m.id]) k.push(m.t_s);
  for (const i of sz.injects) if (!z.injects[i.id] && i.t_s !== undefined) k.push(i.t_s);
  for (const h of sz.hintergrund?.ereignisse ?? []) if (!z.hintergrund[h.id]) k.push(h.t_s);
  const frei = freigaben(inh, z);
  for (const e of sz.ereignisse ?? []) {
    if (z.ereignisse[e.id]?.entfaellt) continue;
    k.push(e.bedingung.typ === "keine_freigabe_bis" ? e.bedingung.t_s + NACH : Infinity);
    e.wirkungen.forEach((w, nr) => { if (!z.ereignisse[e.id]?.wirkungen[nr]) k.push(w.t_s + NACH); });
  }
  for (const i of sz.injects) {
    const b = i.bedingung;
    if (z.injects[i.id] || !b) continue;
    if (b.typ === "keine_freigabe_bis") k.push(b.t_s + NACH);
    else {
      const erste = fruehesteFreigabe(frei, b.ziele);
      if (erste) k.push(erste.t + b.verzoegerung_s);
    }
  }
  for (const id of z.reihenfolge) {
    const st = z.meldungen[id];
    const m = inh.meldungen[id];
    if (!m) continue;
    if (st.stufe === "wirkung") {
      const e = einschlagVon(inh, z, id);
      if (e) k.push(e.t);
    }
    if (st.stufe === "g1" || st.stufe === "g2" || st.stufe === "g3") k.push(wegAb(inh, z, m.ziele));
    const w = st.wirkung;
    if (w && st.g3) for (const i of sz.injects) if (i.bedingung?.typ === "freigabe_mit_zivil") k.push(Math.max(st.g3.t_s + i.bedingung.verzoegerung_s, w.t_einschlag));
  }
  return Math.min(...k.filter((x) => x > t + 1e-9));
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

type Bedingung = NonNullable<Inhalte["szenario"]["injects"][number]["bedingung"]>;

function bedingungText(inh: Inhalte, b: Bedingung): string {
  const ziele = b.ziele.length > 1 ? `${b.ziele[0]}–${b.ziele[b.ziele.length - 1].slice(2)}` : b.ziele[0];
  const uhr = (t: number) => uhrzeit(inh.szenario.spieluhr.start, t);
  if (b.typ === "keine_freigabe_bis") return `wenn bis ${uhr(b.t_s)} keine Freigabe auf ${ziele}`;
  if (b.typ === "freigabe_mit_zivil") return `${b.verzoegerung_s} s nach Freigabe auf ${ziele}, wenn beim Einschlag Zivilpersonen im Wirkradius`;
  return `${b.verzoegerung_s} s nach Freigabe auf ${ziele}`;
}

/**
 * Was die Spielleitung zu bedingten Injects (I-08a, I-08b, I-09) und Skriptereignissen (E-01) wissen
 * muss: wartet die Bedingung noch, ist sie erfüllt (und wann kommt es), ist es ausgelöst oder entfällt
 * es. Gleiche Logik wie faellig(), nur als Anzeige.
 */
export function bedingtStand(basis: Inhalte, z: Spielzustand, t: number): BedingtStand[] {
  const inh = weltFuer(basis, z);
  const start = inh.szenario.spieluhr.start;
  const uhr = (x: number) => uhrzeit(start, x);
  const frei = freigaben(inh, z);
  const aus: BedingtStand[] = [];
  for (const i of inh.szenario.injects) {
    const b = i.bedingung;
    if (!b) continue;
    const text = bedingungText(inh, b);
    if (z.injects[i.id]) {
      aus.push({ id: i.id, art: "inject", status: "ausgeloest", text: `${text} – ausgelöst ${uhr(z.injects[i.id].erschienen.t_s)}` });
      continue;
    }
    const erste = fruehesteFreigabe(frei, b.ziele);
    if (b.typ === "keine_freigabe_bis") {
      if (erste && erste.t <= b.t_s) aus.push({ id: i.id, art: "inject", status: "entfaellt", text: `${text} – entfällt (Freigabe ${erste.meldung} ${uhr(erste.t)})` });
      else aus.push({ id: i.id, art: "inject", status: t >= b.t_s ? "erfuellt" : "wartet", text, t: b.t_s });
      continue;
    }
    if (!erste) {
      aus.push({ id: i.id, art: "inject", status: "wartet", text });
      continue;
    }
    if (b.typ === "freigabe") {
      aus.push({ id: i.id, art: "inject", status: "erfuellt", text: `${text} – Freigabe ${erste.meldung} ${uhr(erste.t)}`, t: erste.t + b.verzoegerung_s });
      continue;
    }
    // freigabe_mit_zivil: offen, bis die Wirkungen der Freigaben eingeschlagen sind
    const offen = z.reihenfolge.filter((id) => z.meldungen[id].stufe === "wirkung" && inh.meldungen[id]?.ziele.some((zid) => b.ziele.includes(zid)));
    aus.push(offen.length
      ? { id: i.id, art: "inject", status: "wartet", text: `${text} – Freigabe ${erste.meldung} ${uhr(erste.t)}, Einschlag steht aus` }
      : { id: i.id, art: "inject", status: "entfaellt", text: `${text} – keine Zivilpersonen beim Einschlag (Freigabe ${erste.meldung} ${uhr(erste.t)})` });
  }
  for (const e of inh.szenario.ereignisse ?? []) {
    const b = e.bedingung;
    const text = bedingungText(inh, b);
    const stand = z.ereignisse[e.id];
    const erledigt = Object.values(stand?.wirkungen ?? {});
    const getroffen = e.wirkungen.filter((_, nr) => stand?.wirkungen[nr]?.wirkt).map((w) => w.ziel);
    const erste = fruehesteFreigabe(frei, b.ziele);
    if (stand?.entfaellt || (b.typ === "keine_freigabe_bis" && erste && erste.t <= b.t_s)) {
      aus.push({ id: e.id, art: "ereignis", status: "entfaellt", text: `${text} – entfällt (Freigabe ${erste?.meldung ?? "?"} ${erste ? uhr(erste.t) : ""})` });
    } else if (erledigt.length) {
      const fertig = erledigt.length === e.wirkungen.length;
      aus.push({ id: e.id, art: "ereignis", status: "ausgeloest", text: `${fertig ? "abgeschlossen" : "läuft"} – getroffen: ${getroffen.join(", ") || "nichts"}${erste ? ` · abgebrochen durch Freigabe ${erste.meldung}` : ""}` });
    } else if (b.typ === "keine_freigabe_bis") {
      aus.push({ id: e.id, art: "ereignis", status: t >= b.t_s ? "erfuellt" : "wartet", text, t: b.t_s });
    }
  }
  return aus;
}
