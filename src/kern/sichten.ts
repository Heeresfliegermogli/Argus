// Was welche Rolle sieht. Die Informationsverteilung ist Teil des Lernziels und steht deshalb an
// einer Stelle: G1 sieht die volle ARGUS-Meldung (Bild, Sensordaten, Kleingedrucktes). G2 und G3
// sehen nur die Zielmeldung. Nur G3 bekommt die Lage-Injects. Ungemeldete Ziele sehen nur
// Spielleitung und Plenum.
//
// Hinweis: Alle Rechner laden dieselben Dateien; die Trennung ist eine Frage der Anzeige, kein
// Geheimnisschutz (im Unterricht ausreichend, alles ist fiktiv).
import type { Inhalte, Inject, Meldung, ReserveInject } from "../inhalte/typen";
import type { Rolle } from "./ereignisse";
import { feinlage } from "./geometrie";
import { gemeldetePosition } from "./regeln";
import { uhrzeit } from "./uhr";
import type { InjectStand, MeldungsStand, Spielzustand } from "./zustand";

export const ROLLEN_NAME: Record<Rolle, string> = {
  g1: "G1 Aufklärung",
  g2: "G2 Zielprüfung",
  g3: "G3 Führung",
  sl: "Spielleitung",
  plenum: "Plenum",
};

/** Die Zielmeldung, wie G2 und G3 sie sehen (kein Bild, keine Sensordaten). */
export interface Zielmeldung {
  meldung: string;
  zielNr: string;
  lage: string;
  klasse: string;
  konfidenz: number;
  argusEmpfehlung: string;
  vermerkG1?: string;
  fastTrack: boolean;
  uhrzeit: string;
  folgeVon?: string;
}

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
    zielNr: zielNummer(inh, m),
    lage: feinlage(gemeldetePosition(inh, m), inh.karte),
    klasse: m.argus.klasse,
    konfidenz: m.argus.konfidenz,
    argusEmpfehlung: m.argus.empfehlung,
    vermerkG1: st?.g1?.vermerk,
    fastTrack: !!st?.fastTrack,
    uhrzeit: uhrzeit(inh.szenario.spieluhr.start, st?.erschienen.t_s ?? m.t_s),
    folgeVon: m.folge_von,
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
  g1: "bei G1",
  g2: "bei G2",
  g3: "bei G3",
  wirkung: "Wirkung läuft",
  erledigt: "erledigt",
  entfallen: "entfallen",
};

export const ERGEBNIS_TEXT: Record<NonNullable<MeldungsStand["ergebnis"]>, string> = {
  abgelehnt_g1: "von G1 abgelehnt",
  nicht_bekaempfen_g2: "G2: nicht bekämpfen",
  abgelehnt_g3: "von G3 abgelehnt",
  bekaempft: "bekämpft",
};

export const ENTSCHEID_TEXT: Record<string, string> = {
  annehmen: "ANNEHMEN",
  ablehnen: "ABLEHNEN",
  bekaempfen: "BEKÄMPFEN",
  beobachten: "BEOBACHTEN",
  nicht_bekaempfen: "NICHT BEKÄMPFEN",
  freigabe: "FREIGABE",
  zurueck: "ZURÜCK AN G2",
};
