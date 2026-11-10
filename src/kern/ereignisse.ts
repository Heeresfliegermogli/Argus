// Ereignisprotokoll: das Format, in dem jede Aktion festgehalten wird.
//
// Zwei Arten von Nachrichten:
//  • Aktion   – eine Anfrage („das Team bekämpft M07 mit LM“, „Spielleitung: Start für alle“).
//  • Ereignis – ein Eintrag im Protokoll. Nur der Host des Teams schreibt ihn, nachdem er die Aktion geprüft hat; daher gibt
//               es genau eine gültige Reihenfolge. Wird eine Aktion abgewiesen, entsteht das Ereignis „aktion_abgelehnt“.
//
// Seit 2.6 (Änderungen H) läuft der Host im Browser des Team-Laptops: Die Entscheidungen des Teams gehen ohne Netz an ihn,
// nur Aktionen der Spielleitung (Uhr, Reserve, Notiz) kommen über das Netz. Das Protokoll wird für Spielleitung und Auswertung
// in Stücken hochgeladen. Alle Rechner berechnen den Spielstand selbst aus dem Protokoll (zustand.ts). Dasselbe Protokoll
// speist Replay und Auswertung. Ereignisse sind unveränderlich; seq ist lückenlos ab 1.

/** zb = Zielbearbeitung (seit 2.6 die eine Rolle je Team; bis 2.5 g1 Aufklärung, g2 Zielprüfung, g3 Führung). */
export type Rolle = "zb" | "sl" | "plenum";
export const ROLLEN: Rolle[] = ["zb", "sl", "plenum"];

export interface Absender {
  rolle: Rolle | "system";
  /** zufällige Kennung des Browserfensters */
  client?: string;
  name?: string;
}

// ---------------------------------------------------------------- Codes

/** Die eine Entscheidung des Teams je Meldung (seit 2.6): BEKÄMPFEN mit Wirkmittel (= Freigabe), ZURÜCKSTELLEN oder ABLEHNEN. */
export type Entscheid = "bekaempfen" | "zurueckstellen" | "ablehnen";
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

/**
 * Einschlag einer Zug-Bekämpfung (seit 2.4, E3): flach, weil die Firebase-Regeln unter `daten` nur drei Ebenen zulassen
 * (einschlaege → Index → Feld).
 */
export interface EinschlagFlach {
  t: number;
  x: number;
  y: number;
  ziel: string;
}

// ---------------------------------------------------------------- Ereignisse

export interface EreignisDaten {
  /** Beginn eines Laufs (immer seq 1). */
  spiel_neu: { lauf: string; szenario: string; version: string; titel: string };
  /** Neuer Uhrstand: ab ts gilt Spielzeit t_s, läuft mit tempo. */
  /**
   * ab_ts (seit 2.6, H1.4): Serverzeit, ab der die Uhr läuft, wenn das Startsignal der Spielleitung verspätet ankam – der Team-Laptop
   * holt den Verzug nach (höchstens 60 s), damit alle Teams dieselbe Spielzeit haben. Ohne ab_ts gilt ts des Ereignisses.
   */
  uhr: { befehl: UhrBefehl; laeuft: boolean; t_s: number; tempo: number; ab_ts?: number };
  /**
   * ARGUS-Meldung erscheint (im Eingang des Teams). entfaellt: jedes Fahrzeug schon zerstört oder weg.
   * gestoert (seit 2.4, E4): der Datenlink war zur Meldezeit gestört (EloKa) – ARGUS meldet unsicherer (kern/eloka.ts).
   */
  meldung: { meldung: string; manuell?: boolean; entfaellt?: boolean; gestoert?: boolean };
  /** Meldung entfällt, solange sie offen ist, weil jedes ihrer Fahrzeuge zerstört oder abgezogen ist. */
  meldung_entfaellt: { meldung: string; stufe: "offen"; grund: string };
  /**
   * Seit 2.6 (H2): die eine Entscheidung des Teams. Bei BEKÄMPFEN mit Wirkmittel (= Freigabe) rechnet der Host Warnungen und
   * Einschläge am vorausberechneten Einschlagort. Tempo (H2.4): t_offen = Spielzeit, zu der die Meldung geöffnet wurde;
   * sek_eingang/sek_offen = Sekunden ab Eingang bzw. ab Öffnen bis zur Entscheidung.
   */
  entscheid: {
    meldung: string; entscheid: Entscheid; wirkmittel?: string; warnungen?: string[]; einschlag?: EinschlagDaten;
    /** alle Einschläge einer Zug-Bekämpfung (der erste = einschlag); fehlt bei einem einzigen Einschlag */
    einschlaege?: EinschlagFlach[];
    t_offen?: number; sek_eingang?: number; sek_offen?: number;
  };
  /**
   * Einschlag (Trefferregel seit 2.0): pos/ziel/t_einschlag wie bei der Freigabe vorausberechnet, getroffen nach der
   * Lage beim Einschlag, verstoesse am Einschlagort. Liegt der Einschlag nach Spielende, wird er bei Spielende abgerechnet.
   */
  wirkung: {
    meldung: string; wirkmittel: string; pos: [number, number]; t_freigabe: number; getroffen?: TrefferDaten[];
    t_einschlag?: number; ziel?: string; verstoesse?: string[];
    /** seit 2.4 (E3): Nummer des Einschlags einer Zug-Bekämpfung (0 …) und Anzahl aller Einschläge dieser Freigabe */
    nr?: number; anzahl?: number;
  };
  /**
   * Verstärkung eingespielt (Spielleitung): Ziele und Meldungen der Gruppe mit Zeiten ab t_ab. Feldnamen in daten nur
   * aus Kleinbuchstaben und „_“ (Firebase-Regeln), daher nicht „t0“.
   */
  verstaerkung: { gruppe: string; t_ab: number };
  /**
   * Hintergrundgefecht (szenario.hintergrund): Feindartillerie und Rauch sind Darstellung; eigene Panzerabwehr
   * wirkt nur, wenn das Ziel dann noch steht (wirkt=false mit grund, sonst folge zerstoert/ausser_gefecht).
   */
  hintergrund: { id: string; art: string; ziel?: string; wirkt?: boolean; folge?: string; grund?: string };
  /**
   * Durchbruch (seit Szenario 2.1): nach dem Angriffszeitpunkt t_ab einer Feindgruppe entschieden. durch: nicht
   * aufgehalten, die Fahrzeuge fahren ab t_ab ihre Durchbruch-Route; sonst grund (z. B. „Z-14 zerstört“).
   */
  durchbruch: { gruppe: string; t_ab: number; durch: boolean; grund?: string };
  /**
   * Skriptereignis (E-01): je Wirkung ein Eintrag (wirkt oder nicht, mit grund) oder entfaellt als Ganzes. Seit 2.7 (I3.1) steht das Ziel
   * eines Schusses ohne festes Ziel hier (das erste stehende Fahrzeug aus ziele_reihenfolge im Bereich).
   */
  ereignis: { ereignis: string; nr?: number; von?: string; ziel?: string; wirkt?: boolean; entfaellt?: boolean; grund?: string };
  /**
   * Seit 2.7 (I3.2): Auflösung nach Zeit (szenario.aufloesungen) – ohne Freigabe bis nach_s nach der Meldung sind die Ziele erkannt
   * (z. B. als verbündet); die Meldung ist danach nicht mehr offen, keine Freigabe mehr möglich.
   */
  aufloesung: { aufloesung: string; meldung: string; als: string };
  /**
   * Lagemeldung an die Führung. Seit 2.3 (D3): Druckmeldungen der eigenen Truppe (K-01 …) und Lagemeldungen mit Platzhaltern
   * (I-07, I-06, I-13) tragen den Text mit dem Stand dieses Teams, Druckmeldungen dazu Zug und Stufe der Dringlichkeit.
   */
  inject: { inject: string; manuell?: boolean; text?: string; zug?: string; stufe?: number };
  /**
   * Seit 2.6: Lagemeldung im Feed angeklickt (gelesen). Seit 2.7 (I4): ohne Klick ist sie nach regeln.anzeige.lagemeldung_s (30 s
   * Spielzeit) weg – ob und nach wie vielen Sekunden sie angeklickt wurde, steht damit im Protokoll (Zeit des Klicks − Eingang).
   */
  inject_quittiert: { inject: string };
  /** Beobachtung der Spielleitung (SL 2), optional zu einem Schlüssel- oder Nebenfall (S1–S8, N1–N4) für die Auswertung. */
  notiz: { text: string; fall?: string };
  spielende: { grund: string };
  aktion_abgelehnt: { aktionstyp: string; grund: string };
}

export type EreignisTyp = keyof EreignisDaten;

export const EREIGNIS_TYPEN: EreignisTyp[] = [
  "spiel_neu", "uhr", "meldung", "meldung_entfaellt", "entscheid", "wirkung", "inject", "inject_quittiert", "notiz", "spielende",
  "aktion_abgelehnt", "verstaerkung", "hintergrund", "ereignis", "durchbruch", "aufloesung",
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
  /** t_offen: Spielzeit, zu der das Team die Meldung geöffnet hat (für die Sekunden bis zur Entscheidung) */
  entscheid: { meldung: string; entscheid: Entscheid; wirkmittel?: string; t_offen?: number };
  inject_quittiert: EreignisDaten["inject_quittiert"];
  notiz: EreignisDaten["notiz"];
  uhr: { befehl: UhrBefehl; tempo?: number; t_s?: number };
  meldung_ausloesen: { meldung: string };
  inject_ausloesen: { inject: string };
  verstaerkung_einspielen: { gruppe: string };
}

export type AktionsTyp = keyof AktionsDaten;

export const AKTIONS_TYPEN: AktionsTyp[] = [
  "entscheid", "inject_quittiert", "notiz", "uhr", "meldung_ausloesen", "inject_ausloesen", "verstaerkung_einspielen",
];

/**
 * Wer welche Aktion senden darf. Der Host prüft das. Die Uhr darf auch das Team stellen – nur der Test ohne Lobby zeigt dafür einen
 * Knopf (ohne Spielleitung); im Spiel startet die Spielleitung alle Teams.
 */
export const RECHTE: Record<AktionsTyp, Rolle[]> = {
  entscheid: ["zb"],
  inject_quittiert: ["zb"],
  notiz: ["sl"],
  uhr: ["sl", "zb"],
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
export const TEXT_MAX = { notiz: 500 } as const;

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
/** Raum des Tests ohne Lobby (?raum=…): ab vier Zeichen, damit er nie wie ein Code der Sitzung (drei Zeichen) aussieht. */
export const RAUM_MUSTER = /^[a-z0-9-]{4,32}$/;

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
