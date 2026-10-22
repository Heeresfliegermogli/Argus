// Prüft eine Aktion gegen Rechte und Spielstand und macht daraus Ereignisse.
// Was nicht passt, wird nicht verworfen, sondern als „aktion_abgelehnt“ protokolliert.
import type { Inhalte } from "../inhalte/typen";
import {
  type Aktion, type AktionsDaten, type AktionsTyp, RECHTE, type Rolle, TEXT_MAX,
} from "../kern/ereignisse";
import { einschlag, vorhersage } from "../kern/regeln";
import { uhrzeit } from "../kern/uhr";
import { einspielSperre, verstaerkungen } from "../kern/welt";
import type { Spielzustand } from "../kern/zustand";
import { meldungEntwurf, weltFuer } from "./ablauf";
import { type Entwurf, entwurf } from "./entwurf";

export type Verarbeitung = { ok: true; entwuerfe: Entwurf[] } | { ok: false; grund: string };

const nein = (grund: string): Verarbeitung => ({ ok: false, grund });
const ja = (...entwuerfe: Entwurf[]): Verarbeitung => ({ ok: true, entwuerfe });

function text(wert: unknown, max: number, pflicht = false): string | undefined | false {
  if (wert === undefined || wert === null || wert === "") return pflicht ? false : undefined;
  if (typeof wert !== "string") return false;
  const t = wert.trim().replace(/\s+/g, " ");
  if (pflicht && !t) return false;
  return t.length <= max ? t || undefined : false;
}

/**
 * Warnungen zu R2, R3 und Einsatzbereich für ein Wirkmittel, vorausgerechnet für eine Freigabe zur Zeit t:
 * am Ort des Ziels zum Einschlagzeitpunkt (Trefferregel seit Szenario 2.0).
 */
export function warnungen(inh: Inhalte, z: Spielzustand, meldung: string, wm: string, t: number): string[] {
  const m = inh.meldungen[meldung];
  const v = vorhersage(inh, m, wm, t, z.zerstoert);
  const uhr = uhrzeit(inh.szenario.spieluhr.start, v.einschlag.t);
  const w = v.pruefung.verstoesse.map((x) => `${x.regel}: ${x.text} – beim Einschlag ${uhr}`);
  if (z.bestand[wm] === 0) w.push(`Bestand ${inh.wirkmittel[wm].kurz} aufgebraucht`);
  return w;
}

export function verarbeiteAktion(basis: Inhalte, z: Spielzustand, a: Aktion, t: number): Verarbeitung {
  const inh = weltFuer(basis, z);
  if (!a || typeof a !== "object" || !(a.typ in RECHTE)) return nein("unbekannte Aktion");
  const rolle = a.von?.rolle as Rolle;
  if (!RECHTE[a.typ as AktionsTyp].includes(rolle)) return nein(`${rolle ?? "?"} darf ${a.typ} nicht`);
  const d = (a.daten ?? {}) as Record<string, unknown>;
  const spielAktion = ["g1_entscheid", "g2_empfehlung", "g3_entscheid", "meldung_ausloesen"].includes(a.typ);
  if (spielAktion && z.ende) return nein("Spiel ist beendet");

  const meldungIn = (stufe: string) => {
    const id = d.meldung as string;
    const st = z.meldungen[id];
    if (!st) return `Meldung ${id} liegt nicht vor`;
    if (st.stufe !== stufe) return `Meldung ${id} ist nicht (mehr) bei ${stufe.toUpperCase()}`;
    return null;
  };

  switch (a.typ) {
    case "g1_entscheid": {
      const f = meldungIn("g1");
      if (f) return nein(f);
      if (d.entscheid !== "annehmen" && d.entscheid !== "ablehnen") return nein("Entscheid ungültig");
      const vermerk = text(d.vermerk, TEXT_MAX.vermerk);
      if (vermerk === false) return nein("Vermerk zu lang");
      return ja(entwurf("g1_entscheid", { meldung: a.daten.meldung, entscheid: a.daten.entscheid, vermerk }));
    }
    case "g2_empfehlung": {
      const f = meldungIn("g2");
      if (f) return nein(f);
      const dd = a.daten as AktionsDaten["g2_empfehlung"];
      if (!["bekaempfen", "beobachten", "nicht_bekaempfen"].includes(dd.empfehlung)) return nein("Empfehlung ungültig");
      const begruendung = text(dd.begruendung, TEXT_MAX.begruendung);
      if (begruendung === false) return nein("Begründung zu lang");
      if (dd.empfehlung !== "bekaempfen") {
        return ja(entwurf("g2_empfehlung", { meldung: dd.meldung, empfehlung: dd.empfehlung, begruendung }));
      }
      if (!dd.wirkmittel || !inh.wirkmittel[dd.wirkmittel]) return nein("Wirkmittel fehlt");
      return ja(entwurf("g2_empfehlung", {
        meldung: dd.meldung, empfehlung: "bekaempfen", wirkmittel: dd.wirkmittel, begruendung,
        warnungen: warnungen(inh, z, dd.meldung, dd.wirkmittel, t),
      }));
    }
    case "g3_entscheid": {
      const f = meldungIn("g3");
      if (f) return nein(f);
      const dd = a.daten as AktionsDaten["g3_entscheid"];
      if (!["freigabe", "ablehnen", "zurueck"].includes(dd.entscheid)) return nein("Entscheid ungültig");
      const bemerkung = text(dd.bemerkung, TEXT_MAX.bemerkung);
      if (bemerkung === false) return nein("Bemerkung zu lang");
      if (dd.entscheid !== "freigabe") return ja(entwurf("g3_entscheid", { meldung: dd.meldung, entscheid: dd.entscheid, bemerkung }));
      const wm = z.meldungen[dd.meldung].g2?.wirkmittel;
      if (!wm) return nein("Empfehlung ohne Wirkmittel");
      if (z.bestand[wm] === 0) return nein(`${inh.wirkmittel[wm].kurz} aufgebraucht – zurück an G2`);
      const e = einschlag(inh, inh.meldungen[dd.meldung].ziele, wm, t, z.zerstoert);
      return ja(entwurf("g3_entscheid", {
        meldung: dd.meldung, entscheid: "freigabe", bemerkung, wirkmittel: wm, warnungen: warnungen(inh, z, dd.meldung, wm, t),
        einschlag: { t: Math.round(e.t * 100) / 100, pos: [Math.round(e.pos[0] * 10) / 10, Math.round(e.pos[1] * 10) / 10], ziel: e.ziel },
      }));
    }
    case "inject_quittiert": {
      const i = z.injects[a.daten.inject];
      if (!i) return nein(`Inject ${a.daten.inject} liegt nicht vor`);
      if (i.quittiert) return nein(`Inject ${i.id} ist schon quittiert`);
      return ja(entwurf("inject_quittiert", { inject: i.id }));
    }
    case "lagehinweis": {
      const t2 = text(a.daten.text, TEXT_MAX.lagehinweis, true);
      if (!t2) return nein("Lagehinweis leer oder zu lang");
      const an = (Array.isArray(a.daten.an) ? a.daten.an : []).filter((r) => r === "g1" || r === "g2");
      if (!an.length) return nein("Empfänger fehlt");
      return ja(entwurf("lagehinweis", { text: t2, an: [...new Set(an)] }));
    }
    case "fast_track":
      if (typeof a.daten.an !== "boolean") return nein("Wert ungültig");
      return ja(entwurf("fast_track", { an: a.daten.an }));
    case "notiz": {
      const t2 = text(a.daten.text, TEXT_MAX.notiz, true);
      if (!t2) return nein("Notiz leer oder zu lang");
      return ja(entwurf("notiz", { text: t2 }));
    }
    case "uhr": {
      const { befehl } = a.daten;
      const tempo = z.uhr.tempo;
      if (befehl === "start") return ja(entwurf("uhr", { befehl, laeuft: true, t_s: t, tempo }));
      if (befehl === "pause") return ja(entwurf("uhr", { befehl, laeuft: false, t_s: t, tempo }));
      if (befehl === "tempo") {
        const neu = Number(a.daten.tempo);
        if (!(neu >= 0.25 && neu <= 30)) return nein("Tempo muss zwischen 0,25 und 30 liegen");
        return ja(entwurf("uhr", { befehl, laeuft: z.uhr.laeuft, t_s: t, tempo: neu }));
      }
      if (befehl === "setzen") {
        const neu = Number(a.daten.t_s);
        if (!(neu >= 0 && neu <= inh.szenario.spieluhr.dauer_s)) return nein("Spielzeit außerhalb des Spiels");
        return ja(entwurf("uhr", { befehl, laeuft: z.uhr.laeuft, t_s: neu, tempo }));
      }
      return nein("Uhr-Befehl unbekannt");
    }
    case "meldung_ausloesen": {
      const m = inh.meldungen[a.daten.meldung];
      if (!m) return nein(`Meldung ${a.daten.meldung} gibt es nicht`);
      if (z.meldungen[m.id]) return nein(`Meldung ${m.id} ist schon ausgelöst`);
      return ja(meldungEntwurf(inh, z, m, true, Math.max(t, m.t_s)));
    }
    case "inject_ausloesen": {
      const i = inh.injects[a.daten.inject];
      if (!i) return nein(`Inject ${a.daten.inject} gibt es nicht`);
      if (z.injects[i.id]) return nein(`Inject ${i.id} ist schon ausgelöst`);
      return ja(entwurf("inject", { inject: i.id, manuell: true }));
    }
    case "verstaerkung_einspielen": {
      if (z.ende) return nein("Spiel ist beendet");
      const g = verstaerkungen(inh).find((x) => x.id === a.daten.gruppe);
      if (!g) return nein(`Verstärkung ${a.daten.gruppe} gibt es nicht`);
      if (z.verstaerkungen.some((v) => v.gruppe === g.id)) return nein(`${g.id} ist in diesem Lauf schon eingespielt`);
      const sperre = einspielSperre(inh, g.id, t);
      if (sperre.gesperrt) {
        return nein(`${g.id} jetzt nicht – käme einem geschützten Objekt zu nahe (wieder ab ${uhrzeit(inh.szenario.spieluhr.start, sperre.bis! + 1)})`);
      }
      return ja(entwurf("verstaerkung", { gruppe: g.id, t_ab: Math.round(t * 10) / 10 }));
    }
  }
}
