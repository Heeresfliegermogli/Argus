// Was das Team sieht. Seit 2.6 (Änderungen H) gibt es je Team nur noch eine Rolle, die Zielbearbeitung (intern zb): 2–3 Personen
// an einem Laptop sehen jede ARGUS-Meldung mit Drohnenbild, alle Lagemeldungen und entscheiden je Meldung einmal. Ungemeldete Ziele
// und die Ground Truth sehen nur Spielleitung und Plenum (nach Spielende).
//
// Hinweis: Alle Rechner laden dieselben Dateien; die Trennung ist eine Frage der Anzeige, kein Geheimnisschutz (im Unterricht
// ausreichend, alles ist fiktiv).
import type { Inhalte, Inject, ReserveInject } from "../inhalte/typen";
import type { Entscheid, Rolle } from "./ereignisse";
import type { InjectStand, MeldungsStand, Spielzustand } from "./zustand";

export const ROLLEN_NAME: Record<Rolle, string> = {
  zb: "Zielbearbeitung",
  sl: "Spielleitung",
  plenum: "Plenum",
};

/** Offene Meldungen des Teams in Eingangsreihenfolge; zurückgestellte zuletzt. */
export function warteschlange(z: Spielzustand): MeldungsStand[] {
  const liste = z.reihenfolge.map((id) => z.meldungen[id]).filter((m) => m.stufe === "offen");
  return [...liste.filter((m) => !m.zurueckgestellt), ...liste.filter((m) => m.zurueckgestellt)];
}

export function injectFuer(inh: Inhalte, id: string): Inject | ReserveInject | undefined {
  return inh.injects[id];
}

/** Lagemeldungen des Teams (seit 2.6 alle; die Spielleitung sieht dieselben). */
export function injectsFuer(_inh: Inhalte, z: Spielzustand): InjectStand[] {
  return z.injectReihenfolge.map((id) => z.injects[id]);
}

export const STUFE_TEXT: Record<MeldungsStand["stufe"], string> = {
  offen: "im Eingang",
  wirkung: "Wirkung läuft",
  erledigt: "erledigt",
  entfallen: "entfallen",
};

export const ERGEBNIS_TEXT: Record<NonNullable<MeldungsStand["ergebnis"]>, string> = {
  abgelehnt: "abgelehnt",
  bekaempft: "bekämpft",
};

export const ENTSCHEID_TEXT: Record<Entscheid, string> = {
  bekaempfen: "BEKÄMPFEN",
  zurueckstellen: "ZURÜCKSTELLEN",
  ablehnen: "ABLEHNEN",
};

/** Stand einer Meldung in Worten (Tooltip, Zeitplan der Spielleitung). */
export function standText(st: MeldungsStand): string {
  if (st.ergebnis) return ERGEBNIS_TEXT[st.ergebnis];
  if (st.zurueckgestellt && st.stufe === "offen") return "zurückgestellt";
  return STUFE_TEXT[st.stufe];
}

/** Interner Schlüssel des Ziels einer Meldung (Ziel-ID oder Gruppe): fasst Folgemeldungen auf der Karte zusammen. */
export function zielNummer(inh: Inhalte, m: { ziele: string[] }): string {
  if (m.ziele.length === 1) return m.ziele[0];
  const gruppe = inh.ziele[m.ziele[0]]?.gruppe;
  return gruppe ?? m.ziele.join(", ");
}
