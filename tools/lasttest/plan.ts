// Plan der Team-Laptops im Lasttest (seit 2.6, H1): je Team ein Modellteam mit einer Rolle (tests/modellteam.ts). Die echte
// Engine spielt im Browser einmal ohne Netz durch; daraus entstehen je Team die Entscheidungen und die angeklickten
// Lagemeldungen mit Spielzeit, dazu der Ausgang ohne Netz (zum Vergleich). Im Lasttest „klickt“ ein Bot sie zur geplanten
// Spielzeit am eigenen Team-Laptop – wie im Hörsaal lokal, ohne Netz.
import laeufe from "virtual:argus-laeufe";
import type { Inhalte } from "../../src/inhalte/typen";
import { auswerten } from "../../src/kern/auswertung";
import type { AktionsDaten } from "../../src/kern/ereignisse";
import { type ModellOptionen, START_MS, spieleDurch } from "../../tests/modellteam";

export interface Modell {
  modell: "naiv" | "ideal";
  /** Sekunden je Entscheidung */
  dauer: number;
  lage?: ModellOptionen["lage"];
}

/** Sieben Teams wie im Seminar (H2.1): die Modellzeiten der Simulation (naiv 20 s, ideal 35 s) und Teams dazwischen. */
export const MODELLE: Modell[] = [
  { modell: "naiv", dauer: laeufe.zeiten.naiv },
  { modell: "ideal", dauer: laeufe.zeiten.ideal },
  { modell: "naiv", dauer: laeufe.zeiten.naiv, lage: { quittieren_s: 30, i04_s: 60 } },
  { modell: "ideal", dauer: 30 },
  { modell: "naiv", dauer: 25 },
  { modell: "ideal", dauer: 25 },
  { modell: "naiv", dauer: 30 },
];

export const ANZAHL_LAEUFE = MODELLE.length;

export type PlanTyp = "entscheid" | "inject_quittiert";

export interface PlanAktion {
  /** Spielzeit in s */
  t: number;
  typ: PlanTyp;
  daten: AktionsDaten[PlanTyp];
}

export interface TeamPlan {
  nr: number;
  modell: "naiv" | "ideal";
  dauer: number;
  aktionen: PlanAktion[];
  /** Stand bei Spielende ohne Netz (zum Vergleich) */
  ende: { seq: number; bestand: Record<string, number | null>; zerstoert: string[]; faelle: Record<string, string> };
}

export function teamName(p: Pick<TeamPlan, "nr" | "modell" | "dauer">): string {
  return `Last ${p.nr} · ${p.modell} ${p.dauer} s`;
}

export function erstellePlan(inh: Inhalte, anzahl: number): TeamPlan[] {
  const auswahl = MODELLE.slice(0, Math.max(1, Math.min(anzahl, MODELLE.length)));
  const teams = spieleDurch(inh, auswahl.map((m, i) => ({
    name: `team${i + 1}`,
    opt: { team: m.modell, dauer: m.dauer, reihenfolge: laeufe.reihenfolge_wirkmittel, ...(m.lage ? { lage: m.lage } : {}) },
  })));
  return teams.map((m, i) => {
    const aktionen: PlanAktion[] = m.kanal.gesendet
      .filter((a): a is typeof a & { typ: PlanTyp } => a.von.rolle === "zb" && (a.typ === "entscheid" || a.typ === "inject_quittiert"))
      .map((a) => ({ t: Math.round(a.ts - START_MS) / 1000, typ: a.typ, daten: a.daten as AktionsDaten[PlanTyp] }))
      .sort((a, b) => a.t - b.t);
    const ausw = auswerten(inh, [{ id: m.name, name: m.name, farbe: "#888888", zustand: m.z, protokoll: m.kanal.protokoll }]);
    return {
      nr: i + 1,
      modell: auswahl[i].modell,
      dauer: auswahl[i].dauer,
      aktionen,
      ende: {
        seq: m.z.seq, bestand: m.z.bestand, zerstoert: Object.keys(m.z.zerstoert).sort(),
        faelle: Object.fromEntries(ausw.faelle.map((f) => [f.id, ausw.teams[0].faelle[f.id].ausgang])),
      },
    };
  });
}
