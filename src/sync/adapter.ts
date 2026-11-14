// Schnittstelle der Sync-Adapter. Spiellogik und Ansichten kennen nur diese Schnittstelle;
// zwischen Variante A (Firebase) und Variante C (ein PC, mehrere Fenster) wird nur der Adapter
// getauscht. Ein weiterer Adapter (z. B. WebSocket im Raum, Variante B) implementiert dieselben
// Methoden.
//
// Ein Adapter gehört zu genau einer Sitzung (Code). Datenmodell (Firebase-Pfad
// argus/v1/sitzungen/<code>/, lokal entsprechend):
//   info                            { code, szenario, version, titel, erstellt, von }  einmal angelegt
//   host                            { id, name, puls }  steuernde Spielleitung (Start, Pause, Spiel öffnen)
//   anwesenheit/<client>            { client, art, name, puls, version, team? }   (seit Liste J: version „0.9.0 1536x730“, siehe firebase.ts)
//   teams/<team>                    { name, farbe, erstellt, lauf?, spieler/<client> { name, rollen, seit } }
//   status/<team>                   Statusmeldung des Team-Laptops an die Spielleitung, etwa alle 5 s (seit 2.6, H1.2)
//   laeufe/<team>/<lauf>/protokoll/<e…>   Ereignisse, nur anhängen. Seit 2.6 (H1) rechnet der Team-Laptop sein Spiel selbst und
//                                         lädt das Protokoll in Stücken hoch (Upload); Spielleitung und Plenum lesen es.
//   laeufe/<team>/<lauf>/aktionen/<id>    Aktionen an den Team-Laptop (Start, Pause, Tempo, Reserve, Notiz der Spielleitung)
// Außerhalb der Sitzungen (seit Liste L): argus/v1/reset = Serverzeit der Notbremse „Alle Sitzungen beenden“ (lokal argus:reset:v1).
// Die Teamliste ist klein (Lobby), die Protokolle liegen getrennt darunter: Wer die Lobby zeigt,
// lädt keine Protokolle. Eine Liste aller Sitzungen gibt es nicht. Alte Läufe bleiben erhalten
// (Testlauf und echter Durchlauf lassen sich später auswerten).
import type { Aktion, Ereignis } from "../kern/ereignisse";
import type { TeamStatus } from "../kern/uebersicht";

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
  /** seit Liste J (J2.4): Fenstergröße „1536x730“ – zeigt die Spielleitung je Team (Laptop zu klein?) */
  fenster?: string;
  /** seit Liste K (K3.4): Bei diesem Fenster lehnen die Firebase-Regeln ab – die Spielleitung zeigt den roten Balken */
  regeln?: boolean;
  /** seit Liste L (L2.4): Dieses Fenster rechnet, kann aber nicht hochladen – im Netz steht ein anderer Verlauf desselben Laufs */
  zwei?: boolean;
  /** seit Liste L (L4.2): Der Tab liegt im Hintergrund (document.hidden) – Browser drosseln dort Zeitgeber */
  hintergrund?: boolean;
}

export interface HostInfo {
  id: string;
  name: string;
  puls: number;
}

export interface SpielerEintrag {
  name: string;
  /** seit 2.6 immer „zb“ (Zielbearbeitung, eine Rolle je Team), siehe rollenText() */
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
  /**
   * Upload des Team-Laptops (seit 2.6): mehrere Ereignisse in einem Schreibvorgang, ganz oder gar nicht. Schlägt fehl, wenn eine
   * seq schon belegt ist oder die Regeln das Ereignis ablehnen.
   */
  schreibeEreignisse(team: string, lauf: string, liste: Ereignis[]): Promise<void>;
  sendeAktion(team: string, lauf: string, a: Aktion): Promise<void>;
  /** Alle Aktionen des Laufs (vorhandene und künftige), in Eingangsreihenfolge. Nur Host. */
  aufAktionen(team: string, lauf: string, cb: (a: Aktion) => void): Abmelden;

  // ---- Statusmeldungen der Team-Laptops (seit 2.6, H1.2)
  schreibeStatus(team: string, s: TeamStatus): Promise<void>;
  /** Statusmeldungen aller Teams (Spielleitung, Plenum); die letzte je Team. */
  aufStatus(cb: (liste: Record<string, TeamStatus>) => void): Abmelden;

  // ---- Anwesenheit und Host (für die ganze Sitzung)
  meldeAnwesenheit(t: Omit<Teilnehmer, "puls">): void;
  aufAnwesenheit(cb: (liste: Teilnehmer[]) => void): Abmelden;
  /**
   * Nur für Tests und Vorführung (künstliche Trennung, verzug.ts): Anwesenheit dieses Fensters aussetzen (true) – die anderen sehen
   * es als nicht verbunden, wie bei einem echten Netzausfall – und wieder aufnehmen (false).
   */
  pausiereAnwesenheit?(ja: boolean): void;
  /** Host-Rolle beanspruchen; gelingt, wenn frei, veraltet, schon eigen oder erzwungen. */
  beanspruche(host: Omit<HostInfo, "puls">, erzwingen: boolean): Promise<boolean>;
  gibFrei(id: string): Promise<void>;
  aufHost(cb: (h: HostInfo | null) => void): Abmelden;

  // ---- Notbremse (seit Liste L, L3): globale Marke argus/v1/reset, gilt für ALLE Sitzungen und den Testraum
  /**
   * Marke „Alle Sitzungen beendet“ (Serverzeit in ms) oder null. `lesbar` false: Die Datenbank lässt die Marke nicht lesen (alte
   * Firebase-Regeln ohne den Pfad) – dann gibt es für dieses Fenster keine Marke, sonst bricht nichts.
   */
  aufReset(cb: (ts: number | null, lesbar: boolean) => void): Abmelden;
  /** Marke setzen (Serverzeit). Schlägt mit einem Regelfehler fehl, solange die neuen Regeln nicht veröffentlicht sind. */
  setzeReset(): Promise<void>;
}

/**
 * Kanal zu einem Team-Spiel: was Spiel (Fenster) und Host (Team-Laptop) von einem Team brauchen.
 * Ein dünner Aufsatz auf den Adapter; so bleiben Host und Spielstand unabhängig von Sitzung und Lobby.
 */
export interface TeamKanal {
  readonly team: string;
  /** Art des Adapters: lokal liegt das hochgeladene Protokoll schon im Speicher dieses Rechners */
  readonly art: SyncAdapter["art"];
  serverJetzt(): number;
  neueId(): string;
  ladeProtokoll(lauf: string): Promise<Ereignis[]>;
  aufProtokoll(lauf: string, abSeq: number, cb: (e: Ereignis) => void): Abmelden;
  schreibeEreignisse(lauf: string, liste: Ereignis[]): Promise<void>;
  sendeAktion(lauf: string, a: Aktion): Promise<void>;
  aufAktionen(lauf: string, cb: (a: Aktion) => void): Abmelden;
  schreibeStatus(s: TeamStatus): Promise<void>;
}

export function teamKanal(a: SyncAdapter, team: string): TeamKanal {
  return {
    team,
    art: a.art,
    serverJetzt: () => a.serverJetzt(),
    neueId: () => a.neueId(),
    ladeProtokoll: (lauf) => a.ladeProtokoll(team, lauf),
    aufProtokoll: (lauf, abSeq, cb) => a.aufProtokoll(team, lauf, abSeq, cb),
    schreibeEreignisse: (lauf, liste) => a.schreibeEreignisse(team, lauf, liste),
    sendeAktion: (lauf, x) => a.sendeAktion(team, lauf, x),
    aufAktionen: (lauf, cb) => a.aufAktionen(team, lauf, cb),
    schreibeStatus: (s) => a.schreibeStatus(team, s),
  };
}

/** Fehlertext von Firebase, wenn die Regeln einen Schreibvorgang ablehnen (z. B. alte Regeln ohne Rolle „zb“). */
export function regelFehler(e: unknown): boolean {
  return /permission[_ ]denied/i.test(String((e as Error)?.message ?? e));
}

/** Nach dieser Zeit ohne Puls gilt ein Host oder Teilnehmer als weg. */
export const PULS_INTERVALL_MS = 5000;
export const VERALTET_MS = 20000;
/** Liste K (K2.1): So lange muss der Laptop eines Teams nicht verbunden sein, bevor ein anderes Fenster sichtbar übernehmen darf. */
export const UEBERNAHME_MS = 20000;

export function istVeraltet(puls: number | undefined, jetzt: number): boolean {
  return typeof puls !== "number" || jetzt - puls > VERALTET_MS;
}
