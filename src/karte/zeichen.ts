// Taktische Zeichen (MIL-STD-2525C / APP-6, gezeichnet mit milsymbol).
// Der Fahrzeugkatalog liefert den Funktionsteil (symbol.sidc, z. B. „EVAT“ = Kampfpanzer); hier
// kommen Zugehörigkeit und Status dazu. Reine Funktionen, damit Tests sie ohne Browser prüfen.
import type { Fahrzeug, GtKategorie, Inhalte, Ziel } from "../inhalte/typen";

/** H Feind, F eigen/verbündet, N neutral (Zivil), U unbekannt */
export type Zugehoerigkeit = "H" | "F" | "N" | "U";
/** P vorhanden, D beschädigt/außer Gefecht, X zerstört */
export type ZeichenStatus = "P" | "D" | "X";

/** Allgemeines Bodenfahrzeug, wenn der Katalog kein Zeichen kennt oder ARGUS unsicher ist. */
export const FUNKTION_ALLGEMEIN = "EV";

/** Stelle 11 des Kenncodes: „G“ = Täuschung/Attrappe (feint/dummy, gestrichelter Winkel über dem Zeichen). */
export const MODIFIKATOR_ATTRAPPE = "G";

/** 15-stelliger Kenncode, z. B. sidc("H", "EVAT") → „SHGPEVAT-------“. */
export function sidc(z: Zugehoerigkeit, funktion: string, opt: { status?: ZeichenStatus; groesse?: string; modifikator?: string } = {}): string {
  const f = (funktion || FUNKTION_ALLGEMEIN).toUpperCase().padEnd(6, "-").slice(0, 6);
  return `S${z}G${opt.status ?? "P"}${f}${opt.modifikator ?? "-"}${opt.groesse ?? "-"}---`;
}

export function funktionVon(f: Fahrzeug | undefined): string {
  return f?.symbol?.sidc ?? FUNKTION_ALLGEMEIN;
}

/** Ground Truth → Zugehörigkeit auf der Kontrollkarte. */
export const GT_ZUGEHOERIGKEIT: Record<GtKategorie, Zugehoerigkeit> = {
  feind: "H",
  geschuetzt: "H",
  attrappe: "H",
  ausser_gefecht: "H",
  verbuendet: "F",
  zivil: "N",
};

/**
 * Zeichen einer ARGUS-Meldung, wie G2 und G3 sie auf der Karte sehen: ARGUS nennt eine
 * militärische Klasse → Feind mit dem Zeichen des ersten Katalogtyps dieser Klasse. Liegt die
 * Konfidenz unter der Schwelle für PRÜFEN (UNKLAR), weiß ARGUS es nicht → unbekanntes Fahrzeug.
 * Seit 2.2 (C7): Stehen noch mindestens zwei Fahrzeuge der Meldung, zeigt die Karte das Zeichen der Einheit
 * (Katalog symbol.einheit) mit Größenangabe nach APP-6 (●● Halbzug/Trupp, ●●● Zug; Katalog groesse_nach_anzahl).
 */
export function zeichenArgus(inh: Inhalte, klasse: string, konfidenz: number, status: ZeichenStatus = "P", anzahl = 1): string {
  if (konfidenz < inh.regeln.argus.schwellen.pruefen) return sidc("U", FUNKTION_ALLGEMEIN, { status });
  const typ = Object.values(inh.fahrzeuge).find((f) => f.argus_klasse === klasse);
  const einheit = typ?.symbol?.einheit;
  if (anzahl >= 2 && einheit) return sidc("H", einheit, { status, groesse: groesseNachAnzahl(inh, anzahl) });
  return sidc("H", funktionVon(typ), { status });
}

/** Größenangabe (APP-6) für n Fahrzeuge: aus dem Katalog, sonst 2 → C (●●), ab 3 → D (●●●). */
export function groesseNachAnzahl(inh: Pick<Inhalte, "groessen">, anzahl: number): string | undefined {
  if (anzahl < 2) return undefined;
  const g = inh.groessen ?? {};
  const schluessel = Object.keys(g).map(Number).filter((n) => n <= anzahl).sort((a, b) => b - a)[0];
  return schluessel !== undefined ? g[String(schluessel)] : anzahl >= 3 ? "D" : "C";
}

/**
 * Kontakt (seit 2.2, C1): Bewegung erkannt, (noch) keine Meldung bei dieser Rolle – unbekannte Zugehörigkeit ohne
 * Funktion (APP-6: leerer Vierpass). Fährt sichtbar vom Kartenrand ein.
 */
export const ZEICHEN_KONTAKT = "SUGP-----------";

/** Zeichen eines Ziels nach Ground Truth (Kontrollkarte der Spielleitung, Auflösung im Plenum). */
export function zeichenZiel(inh: Inhalte, ziel: Ziel, zerstoert: boolean): string {
  const f = inh.fahrzeuge[ziel.typ];
  const status: ZeichenStatus = zerstoert ? "X" : ziel.gt.kategorie === "ausser_gefecht" ? "D" : "P";
  const modifikator = ziel.gt.kategorie === "attrappe" ? MODIFIKATOR_ATTRAPPE : undefined;
  return sidc(GT_ZUGEHOERIGKEIT[ziel.gt.kategorie] ?? "U", funktionVon(f), { status, groesse: f?.symbol?.groesse, modifikator });
}

/** Zeichen einer eigenen oder verbündeten Kraft (Pfeil am Kartenrand). */
export function zeichenKraft(inh: Inhalte, typ: string, zugehoerigkeit: "eigen" | "feind" | "verbuendet"): string {
  const f = inh.fahrzeuge[typ];
  return sidc(zugehoerigkeit === "feind" ? "H" : "F", funktionVon(f), { groesse: f?.symbol?.groesse });
}
