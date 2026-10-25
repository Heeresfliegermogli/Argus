// Was welche Rolle sieht. Die Informationsverteilung ist Teil des Lernziels und steht deshalb an
// einer Stelle: Die Aufklärung (g1) sieht die volle ARGUS-Meldung (Bild, Sensordaten, Kleingedrucktes).
// Zielprüfung (g2) und Führung (g3) sehen nur die Zielmeldung. Nur die Führung bekommt die Lage-Injects.
// Ungemeldete Ziele sehen nur Spielleitung und Plenum.
//
// Hinweis: Alle Rechner laden dieselben Dateien; die Trennung ist eine Frage der Anzeige, kein
// Geheimnisschutz (im Unterricht ausreichend, alles ist fiktiv).
import type { Inhalte, Inject, Meldung, ReserveInject } from "../inhalte/typen";
import type { Rolle } from "./ereignisse";
import { feinlage } from "./geometrie";
import { gemeldetePosition } from "./regeln";
import { uhrzeit } from "./uhr";
import { zielName } from "./zielnummern";
import type { InjectStand, MeldungsStand, Spielzustand } from "./zustand";

/** Rollen ohne G-Nummern (Änderung B3: G1 heißt in der Bundeswehr Personal). Interne Kennungen g1/g2/g3 bleiben. */
export const ROLLEN_NAME: Record<Rolle, string> = {
  g1: "Aufklärung",
  g2: "Zielprüfung",
  g3: "Führung",
  sl: "Spielleitung",
  plenum: "Plenum",
};

/** Mit Artikel im Dativ: „bei der Aufklärung“, „von der Führung“. */
export const ROLLEN_DATIV: Record<"g1" | "g2" | "g3", string> = { g1: "der Aufklärung", g2: "der Zielprüfung", g3: "der Führung" };
/** Mit Artikel im Akkusativ: „an die Zielprüfung“. */
export const ROLLEN_AKK: Record<"g1" | "g2" | "g3", string> = { g1: "die Aufklärung", g2: "die Zielprüfung", g3: "die Führung" };
/** Ein Buchstabe für enge Stellen (Kette in der Auswertung, Zeitleiste), immer mit Legende oder Tooltip. */
export const ROLLEN_ZEICHEN: Record<"g1" | "g2" | "g3", string> = { g1: "A", g2: "Z", g3: "F" };

/** Die Zielmeldung, wie Zielprüfung und Führung sie sehen (kein Bild, keine Sensordaten, seit B6 kein Vermerk). */
export interface Zielmeldung {
  meldung: string;
  /** Anzeige für die Spieler: „Ziel 7“ bzw. „Ziel 7 (3 Fz)“ (Änderung B7) */
  zielNr: string;
  lage: string;
  klasse: string;
  konfidenz: number;
  argusEmpfehlung: string;
  fastTrack: boolean;
  uhrzeit: string;
  /** Folgemeldung zu „Ziel 18“ */
  folgeVon?: string;
}

/** Interner Schlüssel des Ziels einer Meldung (Ziel-ID oder Gruppe): fasst Folgemeldungen auf der Karte zusammen. */
export function zielNummer(inh: Inhalte, m: Meldung): string {
  if (m.ziele.length === 1) return m.ziele[0];
  const gruppe = inh.ziele[m.ziele[0]]?.gruppe;
  return gruppe ?? m.ziele.join(", ");
}

export function zielmeldung(inh: Inhalte, z: Spielzustand, id: string): Zielmeldung {
  const m = inh.meldungen[id];
  const st = z.meldungen[id];
  return {
    meldung: id,
    zielNr: zielName(inh, z, id),
    lage: feinlage(gemeldetePosition(inh, m), inh.karte),
    klasse: m.argus.klasse,
    konfidenz: m.argus.konfidenz,
    argusEmpfehlung: m.argus.empfehlung,
    fastTrack: !!st?.fastTrack,
    uhrzeit: uhrzeit(inh.szenario.spieluhr.start, st?.erschienen.t_s ?? m.t_s),
    folgeVon: m.folge_von ? zielName(inh, z, m.folge_von, false) : undefined,
  };
}

/** Offene Meldungen einer Rolle in Eingangsreihenfolge; zurückgestellte (BEOBACHTEN) zuletzt. */
export function warteschlange(z: Spielzustand, rolle: Rolle): MeldungsStand[] {
  const stufe = rolle === "g1" ? "g1" : rolle === "g2" ? "g2" : rolle === "g3" ? "g3" : null;
  if (!stufe) return [];
  const liste = z.reihenfolge.map((id) => z.meldungen[id]).filter((m) => m.stufe === stufe);
  return [...liste.filter((m) => !m.beobachten), ...liste.filter((m) => m.beobachten)];
}

/** Meldungen, die eine Rolle schon bearbeitet hat oder die an ihr vorbeigingen (neueste zuerst). */
export function verlauf(z: Spielzustand, rolle: Rolle): MeldungsStand[] {
  const offen = new Set(warteschlange(z, rolle).map((m) => m.id));
  const relevant = (m: MeldungsStand) => {
    if (rolle === "g1") return true; // G1 sieht alle Meldungen, auch Fast-Track, im Verlauf
    if (rolle === "g2") return !!m.g1 && m.g1.entscheid === "annehmen" || m.fastTrack;
    if (rolle === "g3") return !!m.g2;
    return true;
  };
  return z.reihenfolge.map((id) => z.meldungen[id]).filter((m) => !offen.has(m.id) && relevant(m)).reverse();
}

export function injectFuer(inh: Inhalte, id: string): Inject | ReserveInject | undefined {
  return inh.injects[id];
}

/** Injects, die eine Rolle sieht: G3 alle an G3 und an alle; andere nur die an alle. */
export function injectsFuer(inh: Inhalte, z: Spielzustand, rolle: Rolle): InjectStand[] {
  return z.injectReihenfolge
    .map((id) => z.injects[id])
    .filter((i) => {
      const an = inh.injects[i.id]?.an ?? "G3";
      if (rolle === "sl" || rolle === "plenum") return true;
      if (an === "alle") return true;
      return an.toLowerCase() === rolle;
    });
}

export function lagehinweiseFuer(z: Spielzustand, rolle: Rolle) {
  if (rolle === "sl" || rolle === "g3" || rolle === "plenum") return z.lagehinweise;
  return z.lagehinweise.filter((l) => l.an.includes(rolle));
}

export const STUFE_TEXT: Record<MeldungsStand["stufe"], string> = {
  g1: "bei der Aufklärung",
  g2: "bei der Zielprüfung",
  g3: "bei der Führung",
  wirkung: "Wirkung läuft",
  erledigt: "erledigt",
  entfallen: "entfallen",
};

export const ERGEBNIS_TEXT: Record<NonNullable<MeldungsStand["ergebnis"]>, string> = {
  abgelehnt_g1: "von der Aufklärung abgelehnt",
  nicht_bekaempfen_g2: "Zielprüfung: nicht bekämpfen",
  abgelehnt_g3: "von der Führung abgelehnt",
  bekaempft: "bekämpft",
};

export const ENTSCHEID_TEXT: Record<string, string> = {
  annehmen: "ANNEHMEN",
  ablehnen: "ABLEHNEN",
  bekaempfen: "BEKÄMPFEN",
  beobachten: "BEOBACHTEN",
  nicht_bekaempfen: "NICHT BEKÄMPFEN",
  freigabe: "FREIGABE",
  zurueck: "ZURÜCK AN ZIELPRÜFUNG",
};
