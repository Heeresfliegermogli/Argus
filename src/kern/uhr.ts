// Spieluhr. Die Uhr wird nicht laufend übertragen: Jedes Uhr-Ereignis im Protokoll hält fest,
// welche Spielzeit zu welcher Serverzeit galt, ob die Uhr läuft und mit welchem Tempo. Jeder
// Rechner rechnet die aktuelle Spielzeit daraus selbst aus (Serverzeit über den Sync-Adapter).
import type { Szenario } from "../inhalte/typen";

export interface UhrStand {
  laeuft: boolean;
  /** Spielzeit in s zum Zeitpunkt ts */
  t_s: number;
  /** Serverzeit in ms */
  ts: number;
  tempo: number;
}

export const UHR_START: UhrStand = { laeuft: false, t_s: 0, ts: 0, tempo: 1 };

/** Aktuelle Spielzeit in s (nicht gerundet, nicht begrenzt). */
export function spielzeit(uhr: UhrStand, jetztMs: number): number {
  if (!uhr.laeuft) return uhr.t_s;
  return uhr.t_s + (Math.max(0, jetztMs - uhr.ts) / 1000) * uhr.tempo;
}

function sekunden(hhmmss: string): number {
  const [h, m, s] = hhmmss.split(":").map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

const zwei = (n: number) => String(n).padStart(2, "0");

/**
 * Spieluhr zur Anzeige (seit 25.10.2026: 00:00–25:00 statt 10:00–10:25): Spielzeit als mm:ss, z. B. 75 s → „01:15“.
 * `start` (spieluhr.start der Daten) bleibt als Parameter, zählt für die Anzeige aber nicht mehr.
 */
export function uhrzeit(_start: string, t_s: number): string {
  const t = Math.max(0, Math.floor(t_s));
  return `${zwei(Math.floor(t / 60))}:${zwei(t % 60)}`;
}

/**
 * Uhrzeiten in Texten des Szenarios (z. B. „um 10:17:00“, „bis 10:25“) in die Spieluhr umrechnen („um 17:00“,
 * „bis 25:00“). Uhrzeiten bis eine Stunde vor Spielbeginn werden negativ („Erstsichtung 09:52“ → „Erstsichtung
 * −08:00“). Andere Zahlen bleiben.
 */
export function spieluhrImText(text: string, start: string, dauer_s: number): string {
  const s0 = sekunden(start);
  return text.replace(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g, (ganz, h: string, m: string, s?: string) => {
    const t = Number(h) * 3600 + Number(m) * 60 + Number(s ?? 0) - s0;
    if (Number(m) > 59 || (s !== undefined && Number(s) > 59) || t < -3600 || t > dauer_s + 600) return ganz;
    return t < 0 ? `−${uhrzeit(start, -t)}` : uhrzeit(start, t);
  });
}

export function mmss(t_s: number): string {
  const t = Math.max(0, Math.round(t_s));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function phaseZu(sz: Szenario, t_s: number) {
  return sz.phasen.find((p) => p.von_s <= t_s && t_s < p.bis_s) ?? sz.phasen[sz.phasen.length - 1];
}
