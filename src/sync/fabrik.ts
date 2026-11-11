// Welcher Sync-Adapter für ein Fenster: Firebase (Variante A, mehrere Rechner) oder lokal
// (Variante C, ein Rechner mit mehreren Fenstern). Nur hier wird zwischen beiden gewählt.
import type { Einstellungen } from "../config";
import { ENDE_TEAM } from "../kern/sitzungen";
import type { SitzungsInfo, SyncAdapter, TeamDaten } from "./adapter";
import { FirebaseAdapter } from "./firebase";
import { LokalAdapter } from "./lokal";
import { VerzugAdapter } from "./verzug";

export function adapterFuer(e: Pick<Einstellungen, "sync" | "db" | "transport"> & { verzug?: number }, sitzung: string): SyncAdapter {
  const a = e.sync === "lokal" ? new LokalAdapter(sitzung) : new FirebaseAdapter(sitzung, { databaseURL: e.db, transport: e.transport });
  if (!e.verzug) return a;
  // künstlicher Verzug (H1.6): für Tests und Vorführung über die Konsole erreichbar
  const v = new VerzugAdapter(a, e.verzug);
  (globalThis as { argusVerzug?: VerzugAdapter }).argusVerzug = v;
  return v;
}

export type SitzungGefunden = "da" | "fehlt" | "keine_antwort";

/** Gibt es die Sitzung? Verbindet kurz, liest info und trennt wieder. */
export async function sitzungVorhanden(e: Pick<Einstellungen, "sync" | "db" | "transport">, sitzung: string, wartenMs = 10000): Promise<SitzungGefunden> {
  const a = adapterFuer(e, sitzung);
  await a.verbinden();
  try {
    return await new Promise<SitzungGefunden>((ok) => {
      const t = setTimeout(() => ok("keine_antwort"), wartenMs);
      let ab: (() => void) | null = null;
      ab = a.aufInfo((info) => {
        clearTimeout(t);
        queueMicrotask(() => ab?.());
        ok(info ? "da" : "fehlt");
      });
    });
  } finally {
    a.trennen();
  }
}

/** Kurzinfo einer Sitzung für die Startseite (Liste K: K1.2 „Zurück zu Team …“, K4.3 Datum und Zahl der Teams, beendete nicht mehr). */
export interface SitzungsKurzinfo {
  gefunden: SitzungGefunden;
  info: SitzungsInfo | null;
  /** Zahl der Teams (ohne die Marke „beendet“) */
  teams: number;
  beendet: boolean;
  /** Name des Teams, in dem diese Kennung steht (K1.2), sonst null */
  teamVon: (client: string) => string | null;
}

/** Verbindet kurz, liest info und Teams und trennt wieder. */
export async function sitzungsKurzinfo(e: Pick<Einstellungen, "sync" | "db" | "transport">, sitzung: string, wartenMs = 8000): Promise<SitzungsKurzinfo> {
  const leer = (gefunden: SitzungGefunden): SitzungsKurzinfo => ({ gefunden, info: null, teams: 0, beendet: false, teamVon: () => null });
  const a = adapterFuer(e, sitzung);
  await a.verbinden();
  const abos: (() => void)[] = [];
  try {
    return await new Promise<SitzungsKurzinfo>((ok) => {
      const t = setTimeout(() => ok(leer("keine_antwort")), wartenMs);
      let info: SitzungsInfo | null | undefined;
      let teams: Record<string, TeamDaten> | undefined;
      const fertig = () => {
        if (info === undefined || (info && teams === undefined)) return;
        clearTimeout(t);
        if (!info) return ok(leer("fehlt"));
        const liste = Object.entries(teams ?? {}).filter(([id, d]) => id !== ENDE_TEAM && d && typeof d.name === "string");
        ok({
          gefunden: "da", info, teams: liste.length, beendet: !!teams?.[ENDE_TEAM],
          teamVon: (client) => liste.find(([, d]) => d.spieler?.[client])?.[1].name ?? null,
        });
      };
      abos.push(a.aufInfo((i) => { info = i; fertig(); }));
      abos.push(a.aufTeams((x) => { teams = x ?? {}; fertig(); }));
    });
  } finally {
    queueMicrotask(() => {
      abos.forEach((ab) => ab());
      a.trennen();
    });
  }
}
