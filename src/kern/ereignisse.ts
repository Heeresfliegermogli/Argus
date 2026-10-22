// Ereignisprotokoll: das Format, in dem jede Aktion festgehalten wird.
//
// Zwei Arten von Nachrichten:
//  • Aktion   – eine Anfrage einer Ansicht („G1 nimmt M07 an“). Jeder Rechner darf Aktionen senden.
//  • Ereignis – ein Eintrag im Protokoll. Nur der Host (die steuernde Spielleitung) schreibt ihn,
//               nachdem er die Aktion geprüft hat; daher gibt es genau eine gültige Reihenfolge.
//               Wird eine Aktion abgewiesen, entsteht das Ereignis „aktion_abgelehnt“.
//
// Alle Rechner berechnen den Spielstand selbst aus dem Protokoll (zustand.ts). Dasselbe Protokoll
// speist später Replay und Auswertung. Ereignisse sind unveränderlich; seq ist lückenlos ab 1.

export type Rolle = "g1" | "g2" | "g3" | "sl" | "plenum";
export const ROLLEN: Rolle[] = ["g1", "g2", "g3", "sl", "plenum"];

export interface Absender {
  rolle: Rolle | "system";
  /** zufällige Kennung des Browserfensters */
  client?: string;
  name?: string;
}

// ---------------------------------------------------------------- Codes

export type G1Entscheid = "annehmen" | "ablehnen";
export type G2Empfehlung = "bekaempfen" | "beobachten" | "nicht_bekaempfen";
export type G3Entscheid = "freigabe" | "ablehnen" | "zurueck";
export type UhrBefehl = "start" | "pause" | "tempo" | "setzen";

export interface TrefferDaten {
  ziel: string;
  was: "fahrzeug" | "attrappe" | "personen";
  kategorie: string;
  anzahl?: number;
}

/** Vorausberechneter Einschlag einer Freigabe (Trefferregel seit Szenario 2.0). */
export interface EinschlagDaten {
  /** Spielzeit des Einschlags (auf 0,01 s) */
  t: number;
  pos: [number, number];
  /** bekämpftes Fahrzeug */
  ziel: string;
}

// ---------------------------------------------------------------- Ereignisse

export interface EreignisDaten {
  /** Beginn eines Laufs (immer seq 1). */
  spiel_neu: { lauf: string; szenario: string; version: string; titel: string };
  /** Neuer Uhrstand: ab ts gilt Spielzeit t_s, läuft mit tempo. */
  uhr: { befehl: UhrBefehl; laeuft: boolean; t_s: number; tempo: number };
  /** ARGUS-Meldung erscheint. fast_track: geht ohne G1 direkt an G2. entfaellt: jedes Fahrzeug schon zerstört oder weg. */
  meldung: { meldung: string; fast_track?: boolean; manuell?: boolean; entfaellt?: boolean };
  /** Meldung entfällt in der Kette (bei G1, G2 oder G3), weil jedes ihrer Fahrzeuge zerstört oder abgezogen ist. */
  meldung_entfaellt: { meldung: string; stufe: "g1" | "g2" | "g3"; grund: string };
  g1_entscheid: { meldung: string; entscheid: G1Entscheid; vermerk?: string };
  /** warnungen: Regelprüfung (R2, R3, Einsatzbereich) zur Zeit der Empfehlung, vom Host berechnet. */
  g2_empfehlung: {
    meldung: string; empfehlung: G2Empfehlung; wirkmittel?: string; begruendung?: string; warnungen?: string[];
  };
  /** Bei Freigabe: wirkmittel aus der G2-Empfehlung, warnungen und einschlag am vorausberechneten Einschlagort. */
  g3_entscheid: {
    meldung: string; entscheid: G3Entscheid; bemerkung?: string; wirkmittel?: string; warnungen?: string[]; einschlag?: EinschlagDaten;
  };
  /**
   * Einschlag (Trefferregel seit 2.0): pos/ziel/t_einschlag wie bei der Freigabe vorausberechnet, getroffen nach der
   * Lage beim Einschlag, verstoesse am Einschlagort. Liegt der Einschlag nach Spielende, wird er bei Spielende abgerechnet.
   */
  wirkung: {
    meldung: string; wirkmittel: string; pos: [number, number]; t_freigabe: number; getroffen?: TrefferDaten[];
    t_einschlag?: number; ziel?: string; verstoesse?: string[];
  };
  /** Verstärkung eingespielt (Spielleitung): Ziele und Meldungen der Gruppe mit Zeiten ab t0. */
  verstaerkung: { gruppe: string; t0: number };
  /**
   * Hintergrundgefecht (szenario.hintergrund): Feindartillerie und Rauch sind Darstellung; eigene Panzerabwehr
   * wirkt nur, wenn das Ziel dann noch steht (wirkt=false mit grund, sonst folge zerstoert/ausser_gefecht).
   */
  hintergrund: { id: string; art: string; ziel?: string; wirkt?: boolean; folge?: string; grund?: string };
  /** Skriptereignis (E-01): je Wirkung ein Eintrag (wirkt oder nicht, mit grund) oder entfaellt als Ganzes. */
  ereignis: { ereignis: string; nr?: number; von?: string; ziel?: string; wirkt?: boolean; entfaellt?: boolean; grund?: string };
  inject: { inject: string; manuell?: boolean };
  inject_quittiert: { inject: string };
  lagehinweis: { text: string; an: Rolle[] };
  fast_track: { an: boolean };
  notiz: { text: string };
  spielende: { grund: string };
  aktion_abgelehnt: { aktionstyp: string; grund: string };
}

export type EreignisTyp = keyof EreignisDaten;

export const EREIGNIS_TYPEN: EreignisTyp[] = [
  "spiel_neu", "uhr", "meldung", "meldung_entfaellt", "g1_entscheid", "g2_empfehlung", "g3_entscheid", "wirkung", "inject",
  "inject_quittiert", "lagehinweis", "fast_track", "notiz", "spielende", "aktion_abgelehnt", "verstaerkung", "hintergrund", "ereignis",
];

export type Ereignis = {
  [T in EreignisTyp]: {
    seq: number;
    typ: T;
    /** Serverzeit in ms */
    ts: number;
    /** Spielzeit in s, vom Host beim Schreiben berechnet */
    t_s: number;
    von: Absender;
    /** Kennung der auslösenden Aktion, fehlt bei Ereignissen des Ablaufs */
    aktion?: string;
    /** Serverzeit der auslösenden Aktion (Klick), für Bearbeitungszeiten */
    ts_aktion?: number;
    daten: EreignisDaten[T];
  };
}[EreignisTyp];

export type EreignisVon<T extends EreignisTyp> = Extract<Ereignis, { typ: T }>;

// ---------------------------------------------------------------- Aktionen

export interface AktionsDaten {
  g1_entscheid: EreignisDaten["g1_entscheid"];
  g2_empfehlung: Omit<EreignisDaten["g2_empfehlung"], "warnungen">;
  g3_entscheid: Omit<EreignisDaten["g3_entscheid"], "warnungen" | "wirkmittel">;
  inject_quittiert: EreignisDaten["inject_quittiert"];
  lagehinweis: EreignisDaten["lagehinweis"];
  fast_track: EreignisDaten["fast_track"];
  notiz: EreignisDaten["notiz"];
  uhr: { befehl: UhrBefehl; tempo?: number; t_s?: number };
  meldung_ausloesen: { meldung: string };
  inject_ausloesen: { inject: string };
  verstaerkung_einspielen: { gruppe: string };
}

export type AktionsTyp = keyof AktionsDaten;

export const AKTIONS_TYPEN: AktionsTyp[] = [
  "g1_entscheid", "g2_empfehlung", "g3_entscheid", "inject_quittiert", "lagehinweis", "fast_track", "notiz",
  "uhr", "meldung_ausloesen", "inject_ausloesen", "verstaerkung_einspielen",
];

/** Wer welche Aktion senden darf. Der Host prüft das. */
export const RECHTE: Record<AktionsTyp, Rolle[]> = {
  g1_entscheid: ["g1"],
  g2_empfehlung: ["g2"],
  g3_entscheid: ["g3"],
  inject_quittiert: ["g3"],
  lagehinweis: ["g3"],
  fast_track: ["g3", "sl"],
  notiz: ["sl"],
  uhr: ["sl"],
  meldung_ausloesen: ["sl"],
  inject_ausloesen: ["sl"],
  verstaerkung_einspielen: ["sl"],
};

export type Aktion = {
  [T in AktionsTyp]: {
    id: string;
    typ: T;
    von: Absender;
    /** Serverzeit beim Klick in ms */
    ts: number;
    daten: AktionsDaten[T];
  };
}[AktionsTyp];

/** Höchstlängen für Freitexte (auch in den Firebase-Regeln). */
export const TEXT_MAX = { vermerk: 120, begruendung: 120, bemerkung: 120, lagehinweis: 240, notiz: 500 } as const;

// ---------------------------------------------------------------- Schlüssel und Kennungen

/** Protokoll-Schlüssel in der Datenbank: e000001 … (sortiert lexikografisch richtig). */
export function protokollSchluessel(seq: number): string {
  return `e${String(seq).padStart(6, "0")}`;
}

/** Lauf-Kennung, z. B. 20261125-0931-k3x9 */
export function neueLaufId(jetzt = new Date()): string {
  const z = (n: number, l = 2) => String(n).padStart(l, "0");
  const datum = `${jetzt.getFullYear()}${z(jetzt.getMonth() + 1)}${z(jetzt.getDate())}`;
  const zeit = `${z(jetzt.getHours())}${z(jetzt.getMinutes())}`;
  return `${datum}-${zeit}-${zufall(4)}`;
}

export const LAUF_MUSTER = /^\d{8}-\d{4}-[a-z0-9]{4}$/;
export const RAUM_MUSTER = /^[a-z0-9-]{3,32}$/;

export function zufall(n: number): string {
  const zeichen = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  const werte = new Uint32Array(n);
  crypto.getRandomValues(werte);
  for (const w of werte) s += zeichen[w % zeichen.length];
  return s;
}

/** Entfernt undefined (Firebase lehnt undefined ab) und tiefe Kopien. */
export function bereinigt<T>(wert: T): T {
  return JSON.parse(JSON.stringify(wert)) as T;
}
