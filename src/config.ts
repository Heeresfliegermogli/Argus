// Einstellungen aus der Adresszeile.
//
// Sitzung mit Lobby (Schritt 4b):
//   …/?sitzung=K7P                    Teilnehmer: Lobby, danach das eigene Team (ich= kommt dazu)
//   …/?sitzung=K7P&rolle=sl           Spielleitung (Übersicht aller Teams, Steuerung)
//   …/?sitzung=K7P&rolle=plenum       Smartboard
// Direktaufruf ohne Lobby, ein Team (wie bis Schritt 6, z. B. für Tests und Probeläufe):
//   …/?rolle=g1&raum=kraehe           rolle g1 | g2 | g3 | sl | plenum
// Weitere Parameter:
//   ich        Kennung des Teilnehmer-Fensters (wird beim Beitreten gesetzt; Neuladen führt zurück)
//   sync       firebase | lokal    (Standard: firebase; in der Offline-Datei lokal)
//   db         Adresse der Firebase-Datenbank (Standard: Projekt argus-sync-e9fbc)
//   transport  lp | auto           (Standard: lp = Long-Polling, weil WebSocket gesperrt ist)
//   name       Anzeigename des Fensters, z. B. „SL 2“
//   szenario   Szenario-Datei in daten/, Standard szenario_kraehe_01.json
//   fps        höchste Bildrate der Lagekarte (1–30, Standard 30). Für schwache Rechner und Variante C mit vielen
//              Fenstern an einem PC; wird im Browser gemerkt, fps=30 stellt zurück.
import { STANDARD_SZENARIO } from "./inhalte/laden";
import { RAUM_MUSTER, ROLLEN, type Rolle } from "./kern/ereignisse";
import { SITZUNG_MUSTER } from "./kern/sitzungen";

export const FIREBASE_DB = "https://argus-sync-e9fbc-default-rtdb.firebaseio.com";

export interface Einstellungen {
  rolle: Rolle | null;
  /** Sitzung (Pfadschlüssel, klein) – mit Lobby */
  sitzung: string | null;
  /** Direktaufruf ohne Lobby: Raum (wird zur Sitzung mit einem Team) */
  raum: string | null;
  /** Teilnehmer-Fenster: Kennung */
  ich: string | null;
  sync: "firebase" | "lokal";
  db: string;
  transport: "lp" | "auto";
  name: string;
  szenario: string;
  /** höchste Bildrate der Lagekarte */
  fps: number;
}

function gemerkt(k: string): string | null {
  try {
    return localStorage.getItem(`argus:einst:${k}`);
  } catch {
    return null;
  }
}

export function merke(k: string, wert: string): void {
  try {
    localStorage.setItem(`argus:einst:${k}`, wert);
  } catch {
    /* privater Modus */
  }
}

export function gemerkterWert(k: string): string | null {
  return gemerkt(k);
}

export function merken(e: Einstellungen): void {
  merke("sync", e.sync);
  if (e.raum) merke("raum", e.raum);
}

/** Zuletzt als Spielleitung geöffnete Sitzung (Startseite: „Fortsetzen“), je Browser. */
export interface LetzteSitzung {
  code: string;
  sync: "firebase" | "lokal";
  zeit: number;
}

export function merkeSitzung(code: string, sync: "firebase" | "lokal"): void {
  merke("letzte_sitzung", JSON.stringify({ code, sync, zeit: Date.now() } satisfies LetzteSitzung));
}

export function letzteSitzung(): LetzteSitzung | null {
  try {
    const l = JSON.parse(gemerkt("letzte_sitzung") ?? "null") as LetzteSitzung | null;
    return l && typeof l.code === "string" && SITZUNG_MUSTER.test(l.code) && (l.sync === "lokal" || l.sync === "firebase") ? l : null;
  } catch {
    return null;
  }
}

export function leseEinstellungen(search: string = location.search): Einstellungen {
  const q = new URLSearchParams(search);
  const rolle = q.get("rolle") as Rolle | null;
  const raumRoh = q.get("raum")?.trim().toLowerCase() ?? null;
  const sitzungRoh = q.get("sitzung")?.trim().toLowerCase() ?? null;
  const syncRoh = q.get("sync") ?? gemerkt("sync") ?? (__ARGUS_OFFLINE__ ? "lokal" : "firebase");
  const ich = q.get("ich");
  return {
    rolle: rolle && ROLLEN.includes(rolle) ? rolle : null,
    sitzung: sitzungRoh && SITZUNG_MUSTER.test(sitzungRoh) ? sitzungRoh : null,
    raum: raumRoh !== null ? (RAUM_MUSTER.test(raumRoh) ? raumRoh : "kraehe") : null,
    ich: ich && /^[a-z0-9]{6}$/.test(ich) ? ich : null,
    sync: syncRoh === "lokal" ? "lokal" : "firebase",
    db: (q.get("db") ?? FIREBASE_DB).trim().replace(/\/+$/, ""),
    transport: q.get("transport") === "auto" ? "auto" : "lp",
    name: (q.get("name") ?? "").slice(0, 40),
    szenario: q.get("szenario") ?? STANDARD_SZENARIO,
    fps: Math.max(1, Math.min(30, Math.round(Number(q.get("fps") ?? gemerkt("fps") ?? 30)) || 30)),
  };
}

function technik(e: Einstellungen, q: URLSearchParams): void {
  q.set("sync", e.sync);
  if (e.db !== FIREBASE_DB) q.set("db", e.db);
  if (e.transport !== "lp") q.set("transport", e.transport);
  if (e.szenario !== STANDARD_SZENARIO) q.set("szenario", e.szenario);
}

/** Direktaufruf ohne Lobby: Adresse für ein Fenster mit bestimmter Rolle im Raum. */
export function adresseFuer(e: Einstellungen, rolle: Rolle | null, name?: string): string {
  const q = new URLSearchParams();
  if (rolle) q.set("rolle", rolle);
  q.set("raum", e.raum ?? "kraehe");
  technik(e, q);
  if (name) q.set("name", name);
  return `${location.pathname}?${q.toString()}`;
}

/** Adresse in einer Sitzung: Teilnehmer (ohne rolle), Spielleitung oder Plenum. */
export function sitzungsAdresse(e: Einstellungen, sitzung: string, extra: { rolle?: Rolle; ich?: string; name?: string } = {}): string {
  const q = new URLSearchParams();
  q.set("sitzung", sitzung.toUpperCase());
  if (extra.rolle) q.set("rolle", extra.rolle);
  if (extra.ich) q.set("ich", extra.ich);
  if (extra.name) q.set("name", extra.name);
  technik(e, q);
  return `${location.pathname}?${q.toString()}`;
}

/** Adresse, unter der die Teilnehmer die Seite finden (für Tafel und Smartboard), ohne https://. */
export function seitenAdresse(): string {
  if (location.protocol === "file:") return "argus-offline.html";
  return `${location.host}${location.pathname}`.replace(/index\.html$/, "");
}
