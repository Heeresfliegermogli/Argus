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

/** Uhrzeit im Spiel, z. B. start 10:00:00 + 75 s → „10:01:15“. */
export function uhrzeit(start: string, t_s: number): string {
  const tot = sekunden(start) + Math.floor(t_s);
  const zwei = (n: number) => String(n).padStart(2, "0");
  return `${zwei(Math.floor(tot / 3600) % 24)}:${zwei(Math.floor(tot / 60) % 60)}:${zwei(tot % 60)}`;
}

export function mmss(t_s: number): string {
  const t = Math.max(0, Math.round(t_s));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function phaseZu(sz: Szenario, t_s: number) {
  return sz.phasen.find((p) => p.von_s <= t_s && t_s < p.bis_s) ?? sz.phasen[sz.phasen.length - 1];
}
