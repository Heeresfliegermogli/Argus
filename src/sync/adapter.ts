// Schnittstelle der Sync-Adapter. Spiellogik und Ansichten kennen nur diese Schnittstelle;
// zwischen Variante A (Firebase) und Variante C (ein PC, mehrere Fenster) wird nur der Adapter
// getauscht. Ein weiterer Adapter (z. B. WebSocket im Raum, Variante B) implementiert dieselben
// Methoden.
//
// Ein Adapter gehört zu genau einer Sitzung (Code). Datenmodell (Firebase-Pfad
// argus/v1/sitzungen/<code>/, lokal entsprechend):
//   info                            { code, szenario, version, titel, erstellt, von }  einmal angelegt
//   host                            { id, name, puls }  steuernde Spielleitung (genau eine, für alle Teams)
//   anwesenheit/<client>            { client, art, name, puls, version, team? }
//   teams/<team>                    { name, farbe, erstellt, lauf?, spieler/<client> { name, rollen, seit } }
//   laeufe/<team>/<lauf>/protokoll/<e…>   Ereignisse, nur der Host schreibt, nur anhängen
//   laeufe/<team>/<lauf>/aktionen/<id>    Aktionen der Ansichten, nur anhängen
// Die Teamliste ist klein (Lobby), die Protokolle liegen getrennt darunter: Wer die Lobby zeigt,
// lädt keine Protokolle. Eine Liste aller Sitzungen gibt es nicht. Alte Läufe bleiben erhalten
// (Testlauf und echter Durchlauf lassen sich später auswerten).
import type { Aktion, Ereignis } from "../kern/ereignisse";

export type Abmelden = () => void;

export interface Verbindung {
  verbunden: boolean;
  /** z. B. „Firebase · Long-Polling“ oder „lokal (dieser PC)“ */
  art: string;
  fehler?: string;
}

export interface SitzungsInfo {
  /** Anzeige, z. B. K7P */
  code: string;
  szenario: string;
  version: string;
  titel: string;
  /** Serverzeit (ms) */
  erstellt: number;
  /** Name der anlegenden Spielleitung */
  von: string;
}

/** Art eines Fensters: Teilnehmer (Lobby oder Team), Spielleitung, Plenum. */
export type FensterArt = "tt" | "sl" | "plenum";

export interface Teilnehmer {
  client: string;
  art: FensterArt;
  name: string;
  /** Serverzeit des letzten Lebenszeichens (ms) */
  puls: number;
  version?: string;
  /** Team, in dem das Fenster gerade spielt (nur Anzeige; maßgeblich ist teams/…/spieler) */
  team?: string;
}

export interface HostInfo {
  id: string;
  name: string;
  puls: number;
}

export interface SpielerEintrag {
  name: string;
  /** „g1“ oder „g1,g2“ (Doppelrolle), siehe rollenText() */
  rollen: string;
  /**
   * Serverzeit (ms) der letzten Rollenwahl. Greifen zwei Fenster gleichzeitig dieselbe Rolle,
   * behält sie das frühere; das spätere gibt sie von selbst wieder ab.
   */
  seit?: number;
}

export interface TeamKopf {
  name: string;
  /** #rrggbb */
  farbe: string;
  /** Serverzeit (ms), legt die Reihenfolge fest */
  erstellt: number;
}

export interface TeamDaten extends TeamKopf {
  /** aktueller Lauf des Teams; fehlt, solange das Team in der Lobby ist */
  lauf?: string;
  spieler?: Record<string, SpielerEintrag>;
}

export interface SyncAdapter {
  readonly art: "firebase" | "lokal";
  /** Pfadschlüssel der Sitzung (Kleinbuchstaben) */
  readonly sitzung: string;

  verbinden(): Promise<void>;
  trennen(): void;
  aufVerbindung(cb: (v: Verbindung) => void): Abmelden;
  /** Geschätzte Serverzeit in ms (Firebase: lokale Uhr plus gemessener Versatz). */
  serverJetzt(): number;
  neueId(): string;

  // ---- Sitzung
  /** Legt die Sitzung an; false, wenn es den Code schon gibt. */
  legeAn(info: SitzungsInfo): Promise<boolean>;
  aufInfo(cb: (info: SitzungsInfo | null) => void): Abmelden;

  // ---- Teams und Spieler (Lobby)
  aufTeams(cb: (teams: Record<string, TeamDaten>) => void): Abmelden;
  /** Legt ein Team an oder ergänzt es (Kopf wird zusammengeführt, Spieler bleiben); optional mit erstem Spieler. */
  setzeTeam(team: string, kopf: TeamKopf, spieler?: { client: string; eintrag: SpielerEintrag }): Promise<void>;
  aendereTeam(team: string, teil: Partial<Pick<TeamDaten, "name" | "farbe" | "lauf">>): Promise<void>;
  loescheTeam(team: string): Promise<void>;
  /**
   * Setzt einen Spieler in ein Team (eintrag) oder nimmt ihn heraus (null). `ausTeams`: aus diesen
   * Teams gleichzeitig herausnehmen (Teamwechsel, Verschieben durch die Spielleitung).
   */
  setzeSpieler(team: string | null, client: string, eintrag: SpielerEintrag | null, ausTeams?: string[]): Promise<void>;

  // ---- Läufe je Team
  /** Ganzes Protokoll eines Laufs, nach seq sortiert. */
  ladeProtokoll(team: string, lauf: string): Promise<Ereignis[]>;
  /** Ereignisse mit seq > abSeq, in Reihenfolge, auch künftige. Doppelte Zustellung ist möglich. */
  aufProtokoll(team: string, lauf: string, abSeq: number, cb: (e: Ereignis) => void): Abmelden;
  /** Nur Host. Schlägt fehl, wenn die seq schon belegt ist (zweiter Host). */
  schreibeEreignis(team: string, lauf: string, e: Ereignis): Promise<void>;
  sendeAktion(team: string, lauf: string, a: Aktion): Promise<void>;
  /** Alle Aktionen des Laufs (vorhandene und künftige), in Eingangsreihenfolge. Nur Host. */
  aufAktionen(team: string, lauf: string, cb: (a: Aktion) => void): Abmelden;

  // ---- Anwesenheit und Host (für die ganze Sitzung)
  meldeAnwesenheit(t: Omit<Teilnehmer, "puls">): void;
  aufAnwesenheit(cb: (liste: Teilnehmer[]) => void): Abmelden;
  /** Host-Rolle beanspruchen; gelingt, wenn frei, veraltet, schon eigen oder erzwungen. */
  beanspruche(host: Omit<HostInfo, "puls">, erzwingen: boolean): Promise<boolean>;
  gibFrei(id: string): Promise<void>;
  aufHost(cb: (h: HostInfo | null) => void): Abmelden;
}

/**
 * Kanal zu einem Team-Spiel: was Spiel (Fenster) und Host (Spielleitung) von einem Team brauchen.
 * Ein dünner Aufsatz auf den Adapter; so bleiben Host und Spielstand unabhängig von Sitzung und Lobby.
 */
export interface TeamKanal {
  readonly team: string;
  serverJetzt(): number;
  neueId(): string;
  ladeProtokoll(lauf: string): Promise<Ereignis[]>;
  aufProtokoll(lauf: string, abSeq: number, cb: (e: Ereignis) => void): Abmelden;
  schreibeEreignis(lauf: string, e: Ereignis): Promise<void>;
  sendeAktion(lauf: string, a: Aktion): Promise<void>;
  aufAktionen(lauf: string, cb: (a: Aktion) => void): Abmelden;
}

export function teamKanal(a: SyncAdapter, team: string): TeamKanal {
  return {
    team,
    serverJetzt: () => a.serverJetzt(),
    neueId: () => a.neueId(),
    ladeProtokoll: (lauf) => a.ladeProtokoll(team, lauf),
    aufProtokoll: (lauf, abSeq, cb) => a.aufProtokoll(team, lauf, abSeq, cb),
    schreibeEreignis: (lauf, e) => a.schreibeEreignis(team, lauf, e),
    sendeAktion: (lauf, x) => a.sendeAktion(team, lauf, x),
    aufAktionen: (lauf, cb) => a.aufAktionen(team, lauf, cb),
  };
}

/** Nach dieser Zeit ohne Puls gilt ein Host oder Teilnehmer als weg. */
export const PULS_INTERVALL_MS = 5000;
export const VERALTET_MS = 20000;

export function istVeraltet(puls: number | undefined, jetzt: number): boolean {
  return typeof puls !== "number" || jetzt - puls > VERALTET_MS;
}
