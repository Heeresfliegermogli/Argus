// Referenzlauf „ARGUS allein“ (seit 2.7, Änderung G2.1): Wie hätte das Spiel ausgesehen, wenn niemand hingeschaut hätte?
//
// Jede Meldung, deren (angezeigte) Empfehlung BEKÄMPFEN lautet, wird zur Meldezeit ohne Prüfung freigegeben. Wirkmittel: Mörser, wenn er
// am vorausberechneten Einschlagort ohne Warnung zulässig ist, sonst LM (solange Bestand), sonst die Kanone der 1. Kp. PRÜFEN, UNKLAR und
// NICHT BEKÄMPFEN bleiben liegen. Keine Verstärkungen, keine Klicks auf Lagemeldungen.
//
// Gerechnet mit derselben Engine wie die Teams (Host mit Zeitplan, Trefferregel, Verlustmodell, Durchbruch, E-01, Auflösung), mit
// gesteuerter Uhr im Speicher – deterministisch, ohne Netz. Die Simulation (tools/referenz/simuliere_durchlauf.py, Team „argus“) rechnet
// dasselbe; tests/durchlauf.test.ts vergleicht beide Meldung für Meldung.
import type { Inhalte, Meldung } from "../inhalte/typen";
import { argusBei } from "../kern/eloka";
import type { Absender, Aktion, AktionsDaten, AktionsTyp, Ereignis } from "../kern/ereignisse";
import { weg } from "../kern/geometrie";
import { offeneEinschlaege, weltFuer } from "../kern/lage";
import { vorhersage, wirkungBeimEinschlag } from "../kern/regeln";
import type { Spielzustand } from "../kern/zustand";
import { naechsteFaelligkeit } from "./ablauf";
import { Host } from "./host";

/** Reihenfolge der Wirkmittel bei „ARGUS allein“ (wie simuliere_durchlauf.AUSWAHL_ARGUS): Mörser ohne Warnung, sonst LM, sonst Kanone. */
export const AUSWAHL_ARGUS = ["MRS", "LM", "PZA"];

/** Kennung des Referenzlaufs (Protokoll im Speicher, nie im Netz). */
export const REFERENZ_LAUF = "referenz-argus-allein";

/**
 * Zerstörungen, die zur Zeit der Entscheidung schon feststehen (wie `zerstoert()` der Simulation): bisher zerstörte Fahrzeuge, das
 * geplante Hintergrundgefecht und eigene Wirkungen im Anflug (je Einschlag eines Zuges nacheinander). `inh` ist die Welt zur Zeit.
 */
export function zerstoertPrognose(inh: Inhalte, z: Spielzustand): Record<string, number> {
  const p: Record<string, number> = { ...z.zerstoert };
  for (const h of inh.szenario.hintergrund?.ereignisse ?? []) {
    if (h.art !== "panzerabwehr" || h.folge !== "zerstoert" || z.hintergrund[h.id]) continue;
    const ziel = inh.ziele[h.ziel];
    if (ziel && !weg(ziel, h.t_s, z.zerstoert)) p[h.ziel] = Math.min(p[h.ziel] ?? Infinity, h.t_s);
  }
  for (const id of z.reihenfolge) {
    const st = z.meldungen[id];
    if (st.stufe !== "wirkung" || !st.freigabe?.wirkmittel) continue;
    const zer = { ...z.zerstoert };
    for (const { e } of offeneEinschlaege(inh, z, id)) {
      for (const g of wirkungBeimEinschlag(inh, e, st.freigabe.wirkmittel, zer).getroffen) {
        if (g.was !== "personen") {
          p[g.ziel] = Math.min(p[g.ziel] ?? Infinity, e.t);
          zer[g.ziel] = Math.min(zer[g.ziel] ?? Infinity, e.t);
        }
      }
    }
  }
  return p;
}

/** Wirkmittel, das „ARGUS allein“ zur Zeit t für die Meldung wählt (null: keins mehr im Bestand). `inh` ist die Welt zur Zeit. */
export function argusWahl(inh: Inhalte, z: Spielzustand, m: Meldung, t: number): string | null {
  const zp = zerstoertPrognose(inh, z);
  for (const w of AUSWAHL_ARGUS) {
    if (!inh.wirkmittel[w]) continue;
    const b = z.bestand[w];
    if (b !== null && b !== undefined && b <= 0) continue;
    if (w === AUSWAHL_ARGUS[0] && !vorhersage(inh, m, w, t, zp, b ?? null).pruefung.zulaessig) continue;
    return w;
  }
  return null;
}

/** Was „ARGUS allein“ mit einer offenen Meldung tut: BEKÄMPFEN mit Wirkmittel, ZURÜCKSTELLEN (kein Wirkmittel mehr) oder nichts. */
export function argusEntscheid(basis: Inhalte, z: Spielzustand, id: string, t: number): { entscheid: "bekaempfen"; wirkmittel: string } | { entscheid: "zurueckstellen" } | null {
  const st = z.meldungen[id];
  if (!st || st.stufe !== "offen") return null;
  const inh = weltFuer(basis, z);
  const m = inh.meldungen[id];
  if (!m || argusBei(inh, m, st.gestoert).empfehlung !== "BEKÄMPFEN") return null;
  const w = argusWahl(inh, z, m, t);
  return w ? { entscheid: "bekaempfen", wirkmittel: w } : { entscheid: "zurueckstellen" };
}

export interface Referenzlauf {
  z: Spielzustand;
  protokoll: Ereignis[];
  /** Rechenzeit in ms (nur zur Information) */
  ms: number;
}

const START_MS = 1_800_000_000_000;

/** Entscheidung einer Automatik zu einer neuen Meldung zur Zeit t (null: liegen lassen). */
export type Automatik = (inh: Inhalte, z: Spielzustand, id: string, t: number) => { entscheid: "bekaempfen"; wirkmittel: string } | { entscheid: "zurueckstellen" | "ablehnen" } | null;

/**
 * Spielt das Szenario mit einer Automatik bis zum Spielende durch (deterministisch, im Speicher, ohne Verstärkungen und ohne Klicks auf
 * Lagemeldungen): Jede neue Meldung bekommt sofort die Entscheidung der Automatik. Ohne Automatik entscheidet niemand („ohne Eingriff“).
 */
export function spieleAutomatisch(inh: Inhalte, automatik: Automatik | null, lauf = REFERENZ_LAUF): Referenzlauf {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  let ms = START_MS;
  let n = 0;
  const protokoll: Ereignis[] = [];
  let hoerer: ((a: Aktion) => void) | null = null;
  const host = new Host(inh, {
    serverJetzt: () => ms,
    aufAktionen: (_lauf, cb) => {
      hoerer = cb;
      return () => (hoerer = null);
    },
  }, lauf, [], { rolle: "zb", client: "argus", name: "ARGUS allein" }, { taktMs: 0, ausgabe: (e) => protokoll.push(e) });
  const senden = <T extends AktionsTyp>(typ: T, daten: AktionsDaten[T], rolle: Absender["rolle"]) => {
    n += 1;
    const a = { id: `auto-a${String(n).padStart(5, "0")}`, typ, von: { rolle, client: `${rolle}auto`, name: "Automatik" }, ts: ms, daten } as Aktion;
    hoerer?.(a);
  };
  host.starten();
  senden("uhr", { befehl: "start" }, "sl");
  let gesehen = 0;
  let t = 0;
  for (let schritt = 0; schritt < 20000 && !host.zustand.ende; schritt++) {
    ms = START_MS + Math.round(t * 1000);
    host.takt();
    // jede neue Meldung sofort entscheiden (oder liegen lassen)
    for (; gesehen < host.zustand.reihenfolge.length; gesehen++) {
      const id = host.zustand.reihenfolge[gesehen];
      const e = automatik?.(inh, host.zustand, id, t) ?? null;
      if (e) senden("entscheid", { meldung: id, ...e, t_offen: t }, "zb");
    }
    if (host.zustand.ende) break;
    const naechste = naechsteFaelligkeit(inh, host.zustand, t);
    if (!Number.isFinite(naechste) || naechste <= t) break;
    t = naechste;
  }
  host.stoppen();
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return { z: host.zustand, protokoll, ms: Math.round(t1 - t0) };
}

/** Spielt das Szenario mit „ARGUS allein“ bis zum Spielende durch (deterministisch, im Speicher). */
export function argusAllein(inh: Inhalte): Referenzlauf {
  return spieleAutomatisch(inh, argusEntscheid);
}
