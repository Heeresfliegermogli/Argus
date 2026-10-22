// Plan der Bot-Spieler: dieselben Läufe wie tools/drehbuch_plan.ts für tools/e2e_drehbuch.py. Die fünf
// Modellteams (naiv, ideal, beide mit V-1…V-4, naiv mit V-1…V-5 – wie tools/referenz/simuliere_durchlauf.py)
// spielen hier im Browser einmal ohne Netz mit der echten Engine durch. Daraus entstehen je Team die Aktionen
// der Modellpersonen G1, G2, G3 und der Spielleitung mit Spielzeit; die Bots schicken sie im Lasttest zur
// geplanten Zeit über ihre eigene Firebase-Verbindung, wie ein Klick in ihrem Fenster.
import laeufe from "virtual:argus-laeufe";
import type { Inhalte } from "../../src/inhalte/typen";
import type { AktionsDaten, AktionsTyp } from "../../src/kern/ereignisse";
import { START_MS, spieleDurch } from "../../tests/modellteam";

/** Fast-Track schaltet die Modellperson G3 so viel früher (wie tools/e2e_drehbuch.py, VORLAUF_FT). */
export const VORLAUF_FT = 2.0;

export type PlanRolle = "g1" | "g2" | "g3" | "sl";

export interface PlanAktion {
  /** Spielzeit in s */
  t: number;
  rolle: PlanRolle;
  typ: AktionsTyp;
  daten: AktionsDaten[AktionsTyp];
}

export interface TeamPlan {
  nr: number;
  modell: "naiv" | "ideal";
  einspielen: Record<string, number>;
  aktionen: PlanAktion[];
  /** Stand bei Spielende ohne Netz (zum Vergleich) */
  ende: { seq: number; bestand: Record<string, number | null>; zerstoert: string[] };
}

export const ANZAHL_LAEUFE = laeufe.laeufe.length;

export function erstellePlan(inh: Inhalte, anzahl: number): TeamPlan[] {
  const auswahl = laeufe.laeufe.slice(0, Math.max(1, Math.min(anzahl, laeufe.laeufe.length)));
  const z = laeufe.zeiten;
  const teams = spieleDurch(inh, auswahl.map((l, i) => ({
    name: `team${i + 1}`,
    opt: { team: l.team, einspielen: l.einspielen, zeiten: z, ftNachAngebot: z.ft_nach_angebot, reihenfolge: laeufe.reihenfolge_wirkmittel },
  })));
  return teams.map((m, i) => {
    const meldezeiten = m.kanal.protokoll.filter((e) => e.typ === "meldung").map((e) => e.t_s);
    const aktionen: PlanAktion[] = m.kanal.gesendet
      .filter((a) => a.typ !== "uhr")
      .map((a) => {
        let t = Math.round(a.ts - START_MS) / 1000;
        // Im Netz kommt ein Klick einige Zehntel später an: Fast-Track vorziehen, sofern dazwischen keine Meldung erscheint.
        if (a.typ === "fast_track" && !meldezeiten.some((mz) => mz >= t - VORLAUF_FT && mz <= t)) t -= VORLAUF_FT;
        return { t, rolle: a.von.rolle as PlanRolle, typ: a.typ, daten: a.daten };
      })
      .sort((a, b) => a.t - b.t);
    return {
      nr: i + 1,
      modell: auswahl[i].team,
      einspielen: auswahl[i].einspielen,
      aktionen,
      ende: { seq: m.z.seq, bestand: m.z.bestand, zerstoert: Object.keys(m.z.zerstoert).sort() },
    };
  });
}
