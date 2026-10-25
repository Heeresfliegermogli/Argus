// Texte des Szenarios für die Anzeige (Änderungen B3, B4, B7 vom 25.10.2026), einmal beim Laden:
//   • Rollen ohne G-Nummern: „G1“ → „Aufklärung“, „G2“ → „Zielprüfung“, „G3“ → „Führung“ (G1 heißt in der Bundeswehr
//     Personal). Präpositionen bekommen den Artikel („an G2“ → „an die Zielprüfung“).
//   • Spieluhr 00:00–25:00: Uhrzeiten wie „10:17:00“ werden zu „17:00“.
//   • Zielnummern: „M20“ wird zu „Ziel 20“ (Nummer nach der Zeitleiste, src/kern/zielnummern.ts).
// Die Daten (public/daten/) dürfen die alten Schreibweisen behalten; Kennungen (id, an, meldung, ziele …) und
// Schlüssel bleiben unverändert, weil Engine, Protokoll und Auswertung mit ihnen rechnen.
import type { Szenario } from "../inhalte/typen";
import { spieluhrImText } from "./uhr";
import { basisNummern, meldungenImText } from "./zielnummern";

const ROLLE: Record<string, string> = { G1: "Aufklärung", G2: "Zielprüfung", G3: "Führung" };

/** Rollennamen in einem Text: G1/G2/G3 → Aufklärung/Zielprüfung/Führung (alle drei weiblich: die/der/zur). */
export function rollenImText(text: string): string {
  if (!/\bG[123]\b/.test(text)) return text;
  const r = (g: string) => ROLLE[g];
  return text
    .replace(/\bG([123]) (Aufklärung|Zielprüfung|Führung)\b/g, "$2")
    .replace(/\b(AN|VON) (G[123])\b/g, (_, p: string, g: string) => `${p} ${r(g).toUpperCase()}`)
    .replace(/\b(an|für|durch|ohne|gegen|um|nur) (G[123])\b/g, (_, p: string, g: string) => `${p} die ${r(g)}`)
    .replace(/\b(von|bei|mit|nach|aus|vor|gibst|gibt|gebt|geben|meldet|zeigt) (G[123])\b/g, (_, p: string, g: string) => `${p} der ${r(g)}`)
    .replace(/\bzu (G[123])\b/g, (_, g: string) => `zur ${r(g)}`)
    // am Satzanfang vor einem Verb oder „und“: „G3 gibt …“ → „Die Führung gibt …“
    .replace(/(^|[.!?]\s+|„|\(\s*)(G[123])(?=\s+[a-zäöüß])/g, (_, a: string, g: string) => `${a}${a.startsWith("(") ? "die" : "Die"} ${r(g)}`)
    .replace(/\bG([123])\b/g, (_, n: string) => ROLLE[`G${n}`]);
}

/** Kennungen und Steuerfelder: Diese Werte rechnet der Code, sie bleiben, wie sie in den Daten stehen. */
const KENNUNGEN = new Set([
  "id", "ziele", "typ", "kategorie", "art", "klasse", "empfehlung", "datei", "an", "ziel", "fall", "meldung", "folge_von",
  "start", "gruppe", "bei", "folge", "phase", "aktion", "version", "stand", "anzeige", "karte", "fahrzeuge", "wirkmittel",
  "regeln", "zugehoerigkeit", "seite", "schritt", "regel_id", "stufe", "prueft", "schaltet",
]);

function wandle<T>(wert: T, f: (s: string) => string, schluessel?: string): T {
  if (typeof wert === "string") return (schluessel && KENNUNGEN.has(schluessel) ? wert : f(wert)) as T;
  if (Array.isArray(wert)) return wert.map((x) => wandle(x, f, schluessel)) as T;
  if (wert && typeof wert === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(wert)) out[k] = wandle(v, f, k);
    return out as T;
  }
  return wert;
}

/** Ein Text des Szenarios für die Anzeige (Rollen, Spieluhr, Zielnummern). */
export function anzeigeText(text: string, sz: Szenario, basis = basisNummern(sz)): string {
  return meldungenImText(spieluhrImText(rollenImText(text), sz.spieluhr.start, sz.spieluhr.dauer_s), basis);
}

/** Alle Texte des Szenarios für die Anzeige umschreiben (Kennungen bleiben). */
export function anzeigeSzenario(sz: Szenario): Szenario {
  const basis = basisNummern(sz);
  const neu = wandle(sz, (s) => anzeigeText(s, sz, basis));
  neu.spieluhr = { ...sz.spieluhr };
  return neu;
}

/** Texte anderer Daten (Regeln): nur Rollen und Spieluhr. */
export function anzeigeDaten<T>(daten: T, sz: Szenario): T {
  return wandle(daten, (s) => spieluhrImText(rollenImText(s), sz.spieluhr.start, sz.spieluhr.dauer_s));
}
