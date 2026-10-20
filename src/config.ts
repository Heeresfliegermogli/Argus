// Einstellungen aus der Adresszeile, z. B. …/?rolle=g1&raum=kraehe
//   rolle      g1 | g2 | g3 | sl   (fehlt: Startseite mit Rollenwahl)
//   raum       Raumname, Standard „kraehe“ (Kleinbuchstaben, Ziffern, Bindestrich)
//   sync       firebase | lokal    (Standard: firebase; in der Offline-Datei lokal)
//   db         Adresse der Firebase-Datenbank (Standard: Projekt argus-sync-e9fbc)
//   transport  lp | auto           (Standard: lp = Long-Polling, weil WebSocket gesperrt ist)
//   name       Anzeigename des Fensters, z. B. „SL 2“
//   szenario   Szenario-Datei in daten/, Standard szenario_kraehe_01.json
import { STANDARD_SZENARIO } from "./inhalte/laden";
import { RAUM_MUSTER, ROLLEN, type Rolle } from "./kern/ereignisse";

export const FIREBASE_DB = "https://argus-sync-e9fbc-default-rtdb.firebaseio.com";

export interface Einstellungen {
  rolle: Rolle | null;
  raum: string;
  sync: "firebase" | "lokal";
  db: string;
  transport: "lp" | "auto";
  name: string;
  szenario: string;
}

function gemerkt(k: string): string | null {
  try {
    return localStorage.getItem(`argus:einst:${k}`);
  } catch {
    return null;
  }
}

export function merken(e: Einstellungen): void {
  try {
    localStorage.setItem("argus:einst:raum", e.raum);
    localStorage.setItem("argus:einst:sync", e.sync);
  } catch {
    /* privater Modus */
  }
}

export function leseEinstellungen(search: string = location.search): Einstellungen {
  const q = new URLSearchParams(search);
  const rolle = q.get("rolle") as Rolle | null;
  const raumRoh = (q.get("raum") ?? gemerkt("raum") ?? "kraehe").trim().toLowerCase();
  const syncRoh = q.get("sync") ?? gemerkt("sync") ?? (__ARGUS_OFFLINE__ ? "lokal" : "firebase");
  return {
    rolle: rolle && ROLLEN.includes(rolle) ? rolle : null,
    raum: RAUM_MUSTER.test(raumRoh) ? raumRoh : "kraehe",
    sync: syncRoh === "lokal" ? "lokal" : "firebase",
    db: (q.get("db") ?? FIREBASE_DB).trim().replace(/\/+$/, ""),
    transport: q.get("transport") === "auto" ? "auto" : "lp",
    name: (q.get("name") ?? "").slice(0, 40),
    szenario: q.get("szenario") ?? STANDARD_SZENARIO,
  };
}

/** Adresse für ein Fenster mit bestimmter Rolle (gleiche Seite, andere Parameter). */
export function adresseFuer(e: Einstellungen, rolle: Rolle | null, name?: string): string {
  const q = new URLSearchParams();
  if (rolle) q.set("rolle", rolle);
  q.set("raum", e.raum);
  q.set("sync", e.sync);
  if (e.db !== FIREBASE_DB) q.set("db", e.db);
  if (e.transport !== "lp") q.set("transport", e.transport);
  if (e.szenario !== STANDARD_SZENARIO) q.set("szenario", e.szenario);
  if (name) q.set("name", name);
  return `${location.pathname}?${q.toString()}`;
}
