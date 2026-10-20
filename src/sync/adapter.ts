// Schnittstelle der Sync-Adapter. Spiellogik und Ansichten kennen nur diese Schnittstelle;
// zwischen Variante A (Firebase) und Variante C (ein PC, mehrere Fenster) wird nur der Adapter
// getauscht. Ein weiterer Adapter (z. B. WebSocket im Raum, Variante B) implementiert dieselben
// Methoden.
//
// Datenmodell je Raum (Firebase-Pfad argus/v1/raeume/<raum>/, lokal entsprechend):
//   aktuell                        Kennung des laufenden Laufs
//   host                           { id, name, puls }  steuernde Spielleitung (genau eine)
//   anwesenheit/<client>           { rolle, name, puls }
//   laeufe/<lauf>/protokoll/<e…>   Ereignisse, nur der Host schreibt, nur anhängen
//   laeufe/<lauf>/aktionen/<id>    Aktionen der Ansichten, nur anhängen
// Alte Läufe bleiben erhalten (Testlauf und echter Durchlauf lassen sich später auswerten).
import type { Aktion, Ereignis, Rolle } from "../kern/ereignisse";

export type Abmelden = () => void;

export interface Verbindung {
  verbunden: boolean;
  /** z. B. „Firebase · Long-Polling“ oder „lokal (dieser PC)“ */
  art: string;
  fehler?: string;
}

export interface Teilnehmer {
  client: string;
  rolle: Rolle;
  name: string;
  /** Serverzeit des letzten Lebenszeichens (ms) */
  puls: number;
  version?: string;
}

export interface HostInfo {
  id: string;
  name: string;
  puls: number;
}

export interface SyncAdapter {
  readonly art: "firebase" | "lokal";
  readonly raum: string;

  verbinden(): Promise<void>;
  trennen(): void;
  aufVerbindung(cb: (v: Verbindung) => void): Abmelden;
  /** Geschätzte Serverzeit in ms (Firebase: lokale Uhr plus gemessener Versatz). */
  serverJetzt(): number;
  neueId(): string;

  aufAktuellenLauf(cb: (lauf: string | null) => void): Abmelden;
  setzeAktuellenLauf(lauf: string): Promise<void>;

  /** Ganzes Protokoll eines Laufs, nach seq sortiert. */
  ladeProtokoll(lauf: string): Promise<Ereignis[]>;
  /** Ereignisse mit seq > abSeq, in Reihenfolge, auch künftige. Doppelte Zustellung ist möglich. */
  aufProtokoll(lauf: string, abSeq: number, cb: (e: Ereignis) => void): Abmelden;
  /** Nur Host. Schlägt fehl, wenn die seq schon belegt ist (zweiter Host). */
  schreibeEreignis(lauf: string, e: Ereignis): Promise<void>;

  sendeAktion(lauf: string, a: Aktion): Promise<void>;
  /** Alle Aktionen des Laufs (vorhandene und künftige), in Eingangsreihenfolge. Nur Host. */
  aufAktionen(lauf: string, cb: (a: Aktion) => void): Abmelden;

  meldeAnwesenheit(t: Omit<Teilnehmer, "puls">): void;
  aufAnwesenheit(cb: (liste: Teilnehmer[]) => void): Abmelden;

  /** Host-Rolle beanspruchen; gelingt, wenn frei, veraltet, schon eigen oder erzwungen. */
  beanspruche(host: Omit<HostInfo, "puls">, erzwingen: boolean): Promise<boolean>;
  gibFrei(id: string): Promise<void>;
  aufHost(cb: (h: HostInfo | null) => void): Abmelden;
}

/** Nach dieser Zeit ohne Puls gilt ein Host oder Teilnehmer als weg. */
export const PULS_INTERVALL_MS = 5000;
export const VERALTET_MS = 20000;

export function istVeraltet(puls: number | undefined, jetzt: number): boolean {
  return typeof puls !== "number" || jetzt - puls > VERALTET_MS;
}
