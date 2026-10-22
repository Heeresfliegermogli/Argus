// Plan für den Browser-Durchlauf (tools/e2e_drehbuch.py): spielt die fünf Modellteams wie
// tests/durchlauf.test.ts mit der echten Engine im Prozess durch (naiv, ideal, beide mit vier Verstärkungen,
// naiv mit fünf – dieselben Läufe wie tools/referenz/simuliere_durchlauf.py, Referenz tests/referenz_durchlauf.json)
// und schreibt je Team
//   • die Aktionen der Modellpersonen G1, G2, G3 und der Spielleitung mit Spielzeit (zum Nachspielen im Browser),
//   • das Protokoll, das dabei entsteht (zum Vergleich mit den Protokollen der Browserfenster).
//
// Aufruf: npx vite-node tools/drehbuch_plan.ts -- <ziel.json>
import { readFileSync, writeFileSync } from "node:fs";
import { inhalte } from "../tests/hilfen";
import { START_MS, spieleDurch, type Team } from "../tests/modellteam";

const ref = JSON.parse(readFileSync(new URL("../tests/referenz_durchlauf.json", import.meta.url), "utf-8")) as {
  zeiten: { G1: number; G2: number; G3: number; ft_nach_angebot: number }; reihenfolge_wirkmittel: string[];
  laeufe: { team: Team; einspielen: Record<string, number> }[];
};

const ziel = process.argv.slice(2).filter((a) => a !== "--")[0] ?? "drehbuch_plan.json";
const inh = await inhalte();
const teams = spieleDurch(inh, ref.laeufe.map((l, i) => ({
  name: `team${i + 1}`,
  opt: { team: l.team, einspielen: l.einspielen, zeiten: ref.zeiten, ftNachAngebot: ref.zeiten.ft_nach_angebot, reihenfolge: ref.reihenfolge_wirkmittel },
})));

const plan = teams.map((m, i) => ({
  name: m.name,
  modell: ref.laeufe[i].team,
  einspielen: ref.laeufe[i].einspielen,
  aktionen: m.kanal.gesendet
    .filter((a) => a.typ !== "uhr")
    .map((a) => ({ t: Math.round(((a.ts - START_MS) / 1000) * 1000) / 1000, rolle: a.von.rolle, typ: a.typ, daten: a.daten })),
  protokoll: m.kanal.protokoll.map((e) => ({ seq: e.seq, typ: e.typ, t_s: e.t_s, rolle: e.von.rolle, daten: e.daten })),
  ende: { seq: m.z.seq, abgelehnt: m.z.abgelehnt.length, bestand: m.z.bestand, zerstoert: m.z.zerstoert },
}));
writeFileSync(ziel, JSON.stringify({ szenario: inh.szenario.version, zeiten: ref.zeiten, teams: plan }, null, 1));
console.log(`${plan.length} Teams, ${plan.reduce((n, t) => n + t.aktionen.length, 0)} Aktionen, ${plan.reduce((n, t) => n + t.protokoll.length, 0)} Ereignisse → ${ziel}`);
