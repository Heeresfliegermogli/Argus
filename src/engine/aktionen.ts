// Prüft eine Aktion gegen Rechte und Spielstand und macht daraus Ereignisse.
// Was nicht passt, wird nicht verworfen, sondern als „aktion_abgelehnt“ protokolliert.
import { fuelle, mitVerlusten, verlustLage } from "../kern/verluste";
import type { Inhalte } from "../inhalte/typen";
import {
  type Aktion, type AktionsDaten, type AktionsTyp, RECHTE, type Rolle, TEXT_MAX,
} from "../kern/ereignisse";
import { einschlaege, vorhersage } from "../kern/regeln";
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

/** Auf 0,1 s runden (Sekunden bis zur Entscheidung im Protokoll). */
function r1(x: number): number {
  return Math.round(x * 10) / 10;
}

/**
 * Warnungen zu R2, R3 und Einsatzbereich für ein Wirkmittel, vorausgerechnet für BEKÄMPFEN zur Zeit t:
 * am Ort des Ziels zum Einschlagzeitpunkt (Trefferregel seit Szenario 2.0).
 */
export function warnungen(inh: Inhalte, z: Spielzustand, meldung: string, wm: string, t: number): string[] {
  const m = inh.meldungen[meldung];
  const v = vorhersage(inh, m, wm, t, z.zerstoert, z.bestand[wm] ?? null);
  const start = inh.szenario.spieluhr.start;
  // seit 2.4 (E3): je Einschlag eines Zuges; dieselbe Warnung nur einmal (mit der Zeit des ersten Einschlags, für den sie gilt)
  const w: string[] = [];
  for (const teil of v.teile) {
    const uhr = uhrzeit(start, teil.einschlag.t);
    for (const x of teil.pruefung.verstoesse) {
      if (!w.some((alt) => alt.startsWith(`${x.regel}: ${x.text} `))) w.push(`${x.regel}: ${x.text} – beim Einschlag ${uhr}`);
    }
  }
  if (z.bestand[wm] === 0) w.push(`Bestand ${inh.wirkmittel[wm].kurz} aufgebraucht`);
  else if (v.k < v.n) w.push(`nur ${v.k} von ${v.n} Fahrzeugen – Bestand ${inh.wirkmittel[wm].kurz} reicht nicht`);
  return w;
}

export function verarbeiteAktion(basis: Inhalte, z: Spielzustand, a: Aktion, t: number): Verarbeitung {
  const inh = weltFuer(basis, z);
  if (!a || typeof a !== "object" || !(a.typ in RECHTE)) return nein("unbekannte Aktion");
  const rolle = a.von?.rolle as Rolle;
  if (!RECHTE[a.typ as AktionsTyp].includes(rolle)) return nein(`${rolle ?? "?"} darf ${a.typ} nicht`);
  const spielAktion = ["entscheid", "meldung_ausloesen"].includes(a.typ);
  if (spielAktion && z.ende) return nein("Spiel ist beendet");

  switch (a.typ) {
    case "entscheid": {
      // seit 2.6 (H2): eine Entscheidung je Meldung – BEKÄMPFEN mit Wirkmittel (= Freigabe), ZURÜCKSTELLEN oder ABLEHNEN
      const dd = a.daten as AktionsDaten["entscheid"];
      const st = z.meldungen[dd.meldung];
      if (!st) return nein(`Meldung ${dd.meldung} liegt nicht vor`);
      if (st.stufe !== "offen") return nein(`Meldung ${dd.meldung} ist nicht (mehr) offen`);
      if (!["bekaempfen", "zurueckstellen", "ablehnen"].includes(dd.entscheid)) return nein("Entscheidung ungültig");
      if (dd.entscheid === "zurueckstellen" && st.zurueckgestellt) return nein(`Meldung ${dd.meldung} ist schon zurückgestellt`);
      // Tempo (H2.4): Sekunden ab Eingang (Erscheinen der Meldung) und ab Öffnen (vom Fenster gemeldet, nie vor dem Eingang)
      const tEin = st.erschienen.t_s;
      const tOffen = typeof dd.t_offen === "number" && Number.isFinite(dd.t_offen) ? Math.min(t, Math.max(tEin, dd.t_offen)) : undefined;
      const tempo = { ...(tOffen !== undefined ? { t_offen: r1(tOffen), sek_offen: r1(t - tOffen) } : {}), sek_eingang: r1(t - tEin) };
      if (dd.entscheid !== "bekaempfen") return ja(entwurf("entscheid", { meldung: dd.meldung, entscheid: dd.entscheid, ...tempo }));
      const wm = dd.wirkmittel;
      if (!wm || !inh.wirkmittel[wm]) return nein("Wirkmittel fehlt");
      if (z.bestand[wm] === 0) return nein(`${inh.wirkmittel[wm].kurz} aufgebraucht – anderes Wirkmittel wählen`);
      // seit 2.4 (E3): BEKÄMPFEN wirkt auf den ganzen Zug – je Fahrzeug ein Einschlag (LM, Kanone), höchstens so viele wie Bestand
      const liste = einschlaege(inh, inh.meldungen[dd.meldung].ziele, wm, t, z.zerstoert, z.bestand[wm] ?? null)
        .map((e) => ({ t: Math.round(e.t * 100) / 100, x: Math.round(e.pos[0] * 10) / 10, y: Math.round(e.pos[1] * 10) / 10, ziel: e.ziel }));
      const e = liste[0];
      return ja(entwurf("entscheid", {
        meldung: dd.meldung, entscheid: "bekaempfen", wirkmittel: wm, warnungen: warnungen(inh, z, dd.meldung, wm, t),
        einschlag: { t: e.t, pos: [e.x, e.y], ziel: e.ziel },
        ...(liste.length > 1 ? { einschlaege: liste } : {}),
        ...tempo,
      }));
    }
    case "inject_quittiert": {
      const i = z.injects[a.daten.inject];
      if (!i) return nein(`Inject ${a.daten.inject} liegt nicht vor`);
      if (i.quittiert) return nein(`Inject ${i.id} ist schon quittiert`);
      return ja(entwurf("inject_quittiert", { inject: i.id }));
    }
    case "notiz": {
      const t2 = text(a.daten.text, TEXT_MAX.notiz, true);
      if (!t2) return nein("Notiz leer oder zu lang");
      const fall = a.daten.fall;
      if (fall === undefined || fall === null || fall === "") return ja(entwurf("notiz", { text: t2 }));
      const bekannt = [...inh.szenario.schluesselfaelle, ...inh.szenario.nebenfaelle].some((f) => f.id === fall);
      if (!bekannt) return nein(`Fall ${String(fall)} gibt es nicht`);
      return ja(entwurf("notiz", { text: t2, fall }));
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
      // seit 2.3: Platzhalter (Verluste dieses Teams) zur Zeit des Auslösens füllen
      if (i.text.includes("{") && mitVerlusten(inh)) {
        const vl = verlustLage(inh, z);
        const text = fuelle(vl.welt, i.text, vl.ereignisse, t, "verluste_panzer" in i ? i.verluste_panzer : undefined);
        return ja(entwurf("inject", { inject: i.id, manuell: true, text }));
      }
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
