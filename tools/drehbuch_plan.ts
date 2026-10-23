// Plan für den Browser-Durchlauf (tools/e2e_drehbuch.py): spielt die fünf Modellteams wie
// tests/durchlauf.test.ts mit der echten Engine im Prozess durch (naiv, ideal, beide mit vier Verstärkungen,
// naiv mit fünf – dieselben Läufe wie tools/referenz/simuliere_durchlauf.py, Referenz tests/referenz_durchlauf.json)
// und schreibt je Team
//   • die Aktionen der Modellpersonen G1, G2, G3 und der Spielleitung mit Spielzeit (zum Nachspielen im Browser),
//   • das Protokoll, das dabei entsteht (zum Vergleich mit den Protokollen der Browserfenster),
//   • die Auswertung dieses Protokolls (Schritt 8: Ausgang je Fall und Kennzahlen) zum Vergleich mit dem Plenum.
//
// Aufruf: npx vite-node tools/drehbuch_plan.ts -- <ziel.json>
import { readFileSync, writeFileSync } from "node:fs";
import { auswerten } from "../src/kern/auswertung";
import { inhalte } from "../tests/hilfen";
import { type DrehbuchReferenz, START_MS, drehbuchTeams, spieleDurch } from "../tests/modellteam";

const ref = JSON.parse(readFileSync(new URL("../tests/referenz_durchlauf.json", import.meta.url), "utf-8")) as DrehbuchReferenz;

const ziel = process.argv.slice(2).filter((a) => a !== "--")[0] ?? "drehbuch_plan.json";
const inh = await inhalte();
// G3 quittiert Lagemeldungen und gibt (ideal, Team 3) Lagehinweise – für Kennzahlen und Replay der Auswertung (Schritt 8)
const teams = spieleDurch(inh, drehbuchTeams(ref));

const a = auswerten(inh, teams.map((m) => ({ id: m.name, name: m.name, farbe: "#888888", zustand: m.z, protokoll: m.kanal.protokoll })));
const plan = teams.map((m, i) => ({
  name: m.name,
  modell: ref.laeufe[i].team,
  einspielen: ref.laeufe[i].einspielen,
  aktionen: m.kanal.gesendet
    .filter((a) => a.typ !== "uhr")
    .map((a) => ({ t: Math.round(((a.ts - START_MS) / 1000) * 1000) / 1000, rolle: a.von.rolle, typ: a.typ, daten: a.daten })),
  protokoll: m.kanal.protokoll.map((e) => ({ seq: e.seq, typ: e.typ, t_s: e.t_s, rolle: e.von.rolle, daten: e.daten })),
  ende: { seq: m.z.seq, abgelehnt: m.z.abgelehnt.length, bestand: m.z.bestand, zerstoert: m.z.zerstoert },
  auswertung: (() => {
    const t = a.teams[i];
    const k = t.kennzahlen;
    return {
      faelle: Object.fromEntries(a.faelle.map((f) => [f.id, { ausgang: t.faelle[f.id].ausgang, stufe: t.faelle[f.id].stufe ?? null }])),
      kennzahlen: {
        fehl: k.fehl.wirkungen, warnung: k.trotzWarnung, widerspruch: k.widerspruch.gesamt, zu_recht: k.widerspruch.zuRecht,
        ft: k.fastTrack.an, lm_gelesen: k.lagemeldungen[0]?.gelesen ?? null, lagehinweise: k.lagehinweise.anzahl,
      },
    };
  })(),
}));
writeFileSync(ziel, JSON.stringify({ szenario: inh.szenario.version, zeiten: ref.zeiten, teams: plan }, null, 1));
console.log(`${plan.length} Teams, ${plan.reduce((n, t) => n + t.aktionen.length, 0)} Aktionen, ${plan.reduce((n, t) => n + t.protokoll.length, 0)} Ereignisse → ${ziel}`);
