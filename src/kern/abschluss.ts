// Abschlussbild „Gefecht beendet“ (Liste M, M4, 15.11.2026): je Team eine kurze Übersicht nach dem Spielende – am Team-Laptop und im
// Plenum (eine Karte je Team, feste Reihenfolge wie in der Lobby), die Spielleitung sieht die Karten in der Übersicht.
//
//   • Abgeschossen: die zerstörten Feindfahrzeuge der Bilanz (kern/bilanz.ts, dieselbe Rechnung wie die Auswertung), je Typ mit
//     Anzahl und Fahrzeug-Sprite. Trupps (Mörser, Beobachter) und Infanterie erscheinen NIE als Sprite (keine Figuren) – sie zählen nur
//     in der neutralen Zeile.
//   • Eure Panzer: 1/1–1/4 mit Zustand in %, Stufe und Treffern, Verwundete gesamt (Verlustmodell zum Spielende).
//   • Wirkmittel: verbraucht von Bestand (Mörser, LM; die Kanone hat keinen Bestand).
//   • „Dazu x weitere bekämpfte Ziele – mehr in der Auswertung“: alles, was eigene Wirkungen sonst trafen (Trupps, Attrappe,
//     Sanitätsfahrzeug, Verbündete, Zivilpersonen, Kamerateam, Besatzung mit weißem Tuch, Fahrzeuge außer Gefecht …), je Objekt bzw.
//     Personengruppe einmal. Fehlgriffe erscheinen hier nie einzeln – die Überraschung bleibt für die Auswertung.
// Keine Zeiten, kein Wert in €, keine Fälle, keine Summe über Teams, keine Rangfolge.
import type { Fahrzeug, Inhalte } from "../inhalte/typen";
import { bilanz } from "./bilanz";
import { weltFuer } from "./lage";
import { type Stufe, mitVerlusten, panzer as eigenePanzer, verlustStand } from "./verluste";
import type { Spielzustand } from "./zustand";

export interface AbschlussFeind {
  typ: string;
  /** „KPz T-72“ */
  kurz: string;
  n: number;
  sprite: string;
  wrack: string | null;
}

export interface AbschlussPanzer {
  id: string;
  name: string;
  zustand: number;
  stufe: Stufe;
  treffer: number;
}

export interface AbschlussWirkmittel {
  id: string;
  kurz: string;
  verbraucht: number;
  bestand: number;
}

export interface Abschluss {
  /** zerstörte Feindfahrzeuge je Typ (ohne Trupps), in der Reihenfolge des Katalogs */
  feind: AbschlussFeind[];
  feindSumme: number;
  /** alles andere, was eigene Wirkungen trafen (Trupps und Fehlgriffe), je Objekt bzw. Personengruppe einmal – nur als Zahl */
  weitere: number;
  panzer: AbschlussPanzer[];
  bereit: number;
  gesamt: number;
  verwundete: number;
  wirkmittel: AbschlussWirkmittel[];
}

/** Symbolarten, die Menschen zeigen (Trupps, Infanterie): nie als Sprite im Abschlussbild. */
const FIGUREN = new Set(["moerser", "beobachter", "infanterie"]);

/** Fahrzeuge, die Menschen zeigen (Trupps, Infanterie)? Dann nur als Zahl. */
export function istFigur(f: Fahrzeug | undefined): boolean {
  return !f || FIGUREN.has(f.symbol?.art ?? "");
}

/** „Kampfpanzer T-72“ → „KPz T-72“, „Schützenpanzerwagen BTR-80“ → „SPW BTR-80“ … (Anzeige im Abschlussbild). */
export function kurzName(name: string): string {
  return name
    .replace(/^Kampfpanzer /, "KPz ")
    .replace(/^Schützenpanzerwagen /, "SPW ")
    .replace(/^Schützenpanzer /, "SPz ")
    .replace(/^Spähpanzer /, "SpähPz ")
    .replace(/^Geschütztes Fahrzeug /, "")
    .replace(/^Störsender auf Lkw \(EloKa\)$/, "Störsender-Lkw")
    .replace(/\s*\((militärisch|eigen)\)$/, "");
}

/** Abschlussbild eines Teams zum Spielende (null ohne Bilanz-Regeln). Dieselben Zahlen wie die Bilanz der Auswertung. */
export function abschluss(basis: Inhalte, z: Spielzustand): Abschluss | null {
  const b = bilanz(basis, z);
  if (!b) return null;
  const inh = weltFuer(basis, z);
  const kat = Object.values(inh.fahrzeuge);
  // Abgeschossen: Fahrzeuge der Bilanz, ohne Trupps
  const n = new Map<string, number>();
  const gezeigt = new Set<string>();
  for (const id of b.fahrzeugIds) {
    const typ = inh.ziele[id].typ;
    if (istFigur(inh.fahrzeuge[typ])) continue;
    gezeigt.add(id);
    n.set(typ, (n.get(typ) ?? 0) + 1);
  }
  const feind: AbschlussFeind[] = kat.filter((f) => n.has(f.id)).map((f) => ({
    typ: f.id, kurz: kurzName(f.name), n: n.get(f.id)!, sprite: f.sprite ?? "", wrack: f.sprite_wrack ?? null,
  }));
  // weitere bekämpfte Ziele: alles, was eigene Wirkungen sonst trafen – je Objekt bzw. Personengruppe einmal
  const weitere = new Set<string>();
  for (const id of z.reihenfolge) {
    for (const w of z.meldungen[id].wirkungen ?? []) {
      for (const g of w.getroffen) {
        if (g.was === "personen") weitere.add(`P|${g.ziel}|${g.kategorie}|${g.anzahl ?? ""}`);
        else if (!gezeigt.has(g.ziel)) weitere.add(`F|${g.ziel}`);
      }
    }
  }
  // eigene Panzer zum Spielende (wie die Bilanz: Spielende oder aktuelle Spielzeit)
  const dauer = (basis.basis ?? basis).szenario.spieluhr.dauer_s;
  const st = mitVerlusten(basis) ? verlustStand(basis, z, z.ende ? dauer : Math.min(dauer, z.uhr.t_s)) : null;
  const panzer: AbschlussPanzer[] = st ? eigenePanzer(basis).map((p) => ({
    id: p.id, name: p.name, zustand: st.panzer[p.id].zustand, stufe: st.panzer[p.id].stufe, treffer: st.panzer[p.id].treffer,
  })) : [];
  const wirkmittel: AbschlussWirkmittel[] = Object.values(inh.wirkmittel)
    .filter((w) => typeof w.bestand === "number" && w.bestand > 0)
    .map((w) => ({ id: w.id, kurz: w.kurz, bestand: w.bestand as number, verbraucht: (w.bestand as number) - (z.bestand[w.id] ?? (w.bestand as number)) }));
  return {
    feind,
    feindSumme: feind.reduce((a, f) => a + f.n, 0),
    weitere: weitere.size,
    panzer,
    bereit: st?.zug.bereit ?? 0,
    gesamt: st?.zug.gesamt ?? 0,
    verwundete: st?.zug.verwundete ?? 0,
    wirkmittel,
  };
}

/** „Dazu 3 weitere bekämpfte Ziele – mehr in der Auswertung“ (ohne weitere: nur der Verweis). */
export function weitereText(n: number): string {
  if (n <= 0) return "Mehr in der Auswertung.";
  return `Dazu ${n} weitere${n === 1 ? "s bekämpftes Ziel" : " bekämpfte Ziele"} – mehr in der Auswertung.`;
}

export const STUFE_KURZ: Record<Stufe, string> = { einsatzbereit: "einsatzbereit", eingeschraenkt: "eingeschränkt", ausgefallen: "ausgefallen" };
