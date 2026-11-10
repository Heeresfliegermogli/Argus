// Was das Team sieht. Seit 2.6 (Änderungen H) gibt es je Team nur noch eine Rolle, die Zielbearbeitung (intern zb): 2–3 Personen
// an einem Laptop sehen jede ARGUS-Meldung mit Drohnenbild, alle Lagemeldungen und entscheiden je Meldung einmal. Ungemeldete Ziele
// und die Ground Truth sehen nur Spielleitung und Plenum (nach Spielende).
//
// Hinweis: Alle Rechner laden dieselben Dateien; die Trennung ist eine Frage der Anzeige, kein Geheimnisschutz (im Unterricht
// ausreichend, alles ist fiktiv).
import type { Inhalte, Inject, ReserveInject } from "../inhalte/typen";
import { durchbruchUeber } from "./durchbruch";
import type { Entscheid, Rolle } from "./ereignisse";
import { wegAb, weltFuer } from "./lage";
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

// ---------------------------------------------------------------- Vermerke im Eingang (seit 2.7, I1.2 und I3.2)

/** Warum ein gemeldetes Ziel aus dem Eingang oder von der Karte verschwand. */
export type VermerkArt = "verbuendet" | "durchgebrochen" | "abgezogen" | "zerstoert";

export interface Vermerk {
  /** Meldung, zu der der Vermerk gehört */
  meldung: string;
  /** Spielzeit */
  t: number;
  art: VermerkArt;
  /** „verbündet – nicht bekämpfen“, „über die Brücke ELSTER durchgebrochen“, „aus dem Raum abgezogen“, „Fahrzeug zerstört“ */
  text: string;
}

/** So lange (Spielzeit, s) steht ein Vermerk im Eingang; das Zeichen auf der Karte bleibt. */
export const VERMERK_S = 60;

/**
 * Vermerke für das Team (seit 2.7): Kein gemeldetes Ziel verschwindet ohne Erklärung (I1.2). Zu jeder Meldung, die aus dem Eingang
 * fiel (entfallen, nach Zeit aufgelöst), und zu jeder schon entschiedenen Meldung, deren Fahrzeuge den Raum verließen (durchgebrochen,
 * abgezogen), ein Eintrag mit Zeit und Grund – je Meldung einer, in Reihenfolge der Zeit. Mit `bis` nur die bis dahin fälligen.
 */
export function vermerke(basis: Inhalte, z: Spielzustand, bis = Infinity): Vermerk[] {
  const inh = weltFuer(basis, z);
  const sz = (basis.basis ?? basis).szenario;
  const out: Vermerk[] = [];
  for (const id of z.reihenfolge) {
    const st = z.meldungen[id];
    const m = inh.meldungen[id];
    if (!st || !m || (st.stufe === "entfallen" && !st.entfallen)) continue; // schon beim Erscheinen entfallen: nie gesehen
    if (st.aufgeloest) {
      const a = sz.aufloesungen?.find((x) => x.id === st.aufgeloest!.aufloesung);
      out.push({ meldung: id, t: st.aufgeloest.t_s, art: "verbuendet", text: a?.vermerk ?? st.aufgeloest.als });
    } else if (st.entfallen) {
      const g = st.entfallen.grund;
      const art: VermerkArt = /durchgebrochen/.test(g) ? "durchgebrochen" : /zerstört/.test(g) && !/abgezogen/.test(g) ? "zerstoert" : "abgezogen";
      // Protokolle vor 2.7: „Ziel hat den Raum verlassen“
      out.push({ meldung: id, t: st.entfallen.t_s, art, text: g === "Ziel hat den Raum verlassen" ? "aus dem Raum abgezogen" : g });
    } else if (st.stufe === "erledigt") {
      // entschieden (abgelehnt, bekämpft): Fahrzeuge, die nicht zerstört sind und den Raum verlassen haben
      const tw = wegAb(inh, z, m.ziele);
      const gegangen = m.ziele.filter((zid) => z.zerstoert[zid] === undefined && inh.ziele[zid]?.bis_s !== undefined);
      if (!Number.isFinite(tw) || !gegangen.length) continue;
      const ueber = durchbruchUeber(inh, z, gegangen);
      out.push({ meldung: id, t: tw, art: ueber ? "durchgebrochen" : "abgezogen", text: ueber ? `über ${ueber} durchgebrochen` : "aus dem Raum abgezogen" });
    }
  }
  // eine Folgemeldung zum selben Fahrzeug ergibt keinen zweiten Vermerk
  const gesehen = new Set<string>();
  return out.filter((v) => v.t <= bis + 1e-6).sort((a, b) => a.t - b.t).filter((v) => {
    const schl = `${zielNummer(inh, inh.meldungen[v.meldung])}|${v.art}`;
    if (gesehen.has(schl)) return false;
    gesehen.add(schl);
    return true;
  });
}
