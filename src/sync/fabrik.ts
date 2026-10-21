// Welcher Sync-Adapter für ein Fenster: Firebase (Variante A, mehrere Rechner) oder lokal
// (Variante C, ein Rechner mit mehreren Fenstern). Nur hier wird zwischen beiden gewählt.
import type { Einstellungen } from "../config";
import type { SyncAdapter } from "./adapter";
import { FirebaseAdapter } from "./firebase";
import { LokalAdapter } from "./lokal";

export function adapterFuer(e: Pick<Einstellungen, "sync" | "db" | "transport">, sitzung: string): SyncAdapter {
  if (e.sync === "lokal") return new LokalAdapter(sitzung);
  return new FirebaseAdapter(sitzung, { databaseURL: e.db, transport: e.transport });
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
