// Übersicht der Spielleitung über alle Teams: Eingang je Stufe, Wirkungen, Fehltreffer und die
// Schlüsselfälle live. Reine Funktion von Inhalten und Spielstand eines Teams.
//
// Schlüsselfall (S1–S4) live:
//   wartet  – die Meldung ist noch nicht gekommen
//   offen   – die Meldung ist in der Kette (bei G1, G2, G3 oder zurückgestellt)
//   richtig – abgeschlossen, ohne dass Geschütztes, Verbündete, Zivilpersonen oder die Attrappe
//             getroffen wurden (S4: auch, wenn M16 zurückgestellt bleibt und die Folgemeldung erledigt ist)
//   falsch  – eine Freigabe trifft (oder wird treffen) etwas, das nicht bekämpft werden durfte
// Das ist die Live-Anzeige für die Spielleitung, nicht die Auswertung (Schritt 8).
import type { Inhalte } from "../inhalte/typen";
import { einschlagVon, weltFuer } from "./lage";
import { FEHL } from "./lagebild";
import { wirkungBeimEinschlag } from "./regeln";
import { ERGEBNIS_TEXT, STUFE_TEXT, warteschlange } from "./sichten";
import type { MeldungsStand, Spielzustand } from "./zustand";

export type FallStatus = "wartet" | "offen" | "richtig" | "falsch";

export interface FallStand {
  id: string;
  titel: string;
  status: FallStatus;
  /** kurzer Stand für den Tooltip */
  text: string;
}

export interface TeamUebersicht {
  eingang: { g1: number; g2: number; g3: number };
  zurueckgestellt: number;
  /** Meldungen erschienen / im Szenario */
  meldungen: number;
  wirkungen: number;
  /** Freigaben, die Geschütztes, Verbündete, Zivilpersonen oder die Attrappe treffen (auch noch im Anflug) */
  fehltreffer: number;
  faelle: FallStand[];
}

/** Treffer einer Freigabe: nach der Wirkung, sonst wie sie beim vorausberechneten Einschlag ausfallen wird. */
function trefferDerFreigabe(inh: Inhalte, z: Spielzustand, st: MeldungsStand) {
  if (st.wirkung) return st.wirkung.getroffen;
  if (st.g3?.entscheid !== "freigabe" || !st.g3.wirkmittel) return [];
  const e = einschlagVon(inh, z, st.id);
  return e ? wirkungBeimEinschlag(inh, e, st.g3.wirkmittel, z.zerstoert).getroffen : [];
}

function istFehl(inh: Inhalte, z: Spielzustand, st: MeldungsStand): boolean {
  return trefferDerFreigabe(inh, z, st).some((g) => FEHL.has(g.kategorie));
}

const ABGESCHLOSSEN = new Set(["erledigt", "entfallen", "wirkung"]);

export function teamUebersicht(basis: Inhalte, z: Spielzustand): TeamUebersicht {
  const inh = weltFuer(basis, z);
  const sz = inh.szenario;
  const liste = z.reihenfolge.map((id) => z.meldungen[id]);
  const faelle = [...sz.schluesselfaelle].sort((a, b) => a.id.localeCompare(b.id)).map((f): FallStand => {
    const ids = [...new Set([f.meldung, ...sz.meldungen.filter((m) => m.fall === f.id).map((m) => m.id)])];
    const staende = ids.map((id) => z.meldungen[id]).filter((x): x is MeldungsStand => !!x);
    const haupt = z.meldungen[f.meldung];
    const fehl = staende.find((st) => istFehl(inh, z, st));
    if (fehl) return { id: f.id, titel: f.titel, status: "falsch", text: `${fehl.id} freigegeben – trifft, was nicht bekämpft werden durfte` };
    if (!haupt) return { id: f.id, titel: f.titel, status: "wartet", text: `${f.meldung} noch nicht gekommen` };
    const textVon = (st: MeldungsStand) => `${st.id}: ${st.ergebnis ? ERGEBNIS_TEXT[st.ergebnis] : st.beobachten ? "zurückgestellt" : STUFE_TEXT[st.stufe]}`;
    if (ABGESCHLOSSEN.has(haupt.stufe)) return { id: f.id, titel: f.titel, status: "richtig", text: textVon(haupt) };
    const folge = staende.find((st) => st.id !== haupt.id && ABGESCHLOSSEN.has(st.stufe));
    if (haupt.beobachten && folge) return { id: f.id, titel: f.titel, status: "richtig", text: `${textVon(haupt)}, ${textVon(folge)}` };
    return { id: f.id, titel: f.titel, status: "offen", text: textVon(haupt) };
  });
  return {
    eingang: { g1: warteschlange(z, "g1").length, g2: warteschlange(z, "g2").length, g3: warteschlange(z, "g3").length },
    zurueckgestellt: liste.filter((m) => m.beobachten && m.stufe === "g2").length,
    meldungen: liste.length,
    wirkungen: liste.filter((m) => m.wirkung).length,
    fehltreffer: liste.filter((m) => istFehl(inh, z, m)).length,
    faelle,
  };
}
