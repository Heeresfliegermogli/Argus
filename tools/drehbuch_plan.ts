// Plan für den Browser-Durchlauf (tools/e2e_drehbuch.py): spielt die fünf Modellteams wie
// tests/durchlauf.test.ts mit der echten Engine im Prozess durch (naiv, ideal, beide mit vier Verstärkungen,
// naiv mit fünf – dieselben Läufe wie tools/referenz/simuliere_durchlauf.py, Referenz tests/referenz_durchlauf.json)
// und schreibt je Team
//   • die Aktionen des Teams (seit 2.6 eine Rolle: je Meldung eine Entscheidung) und der Spielleitung mit Spielzeit,
//   • das Protokoll, das dabei entsteht (zum Vergleich mit den Protokollen der Browserfenster),
//   • die Auswertung dieses Protokolls (Ausgang je Fall, Sekunden je Entscheidung, Kennzahlen) zum Vergleich mit dem Plenum.
//
// Aufruf: npx vite-node tools/drehbuch_plan.ts -- <ziel.json>
import { readFileSync, writeFileSync } from "node:fs";
import { argusAllein } from "../src/engine/referenzlauf";
import { auswerten } from "../src/kern/auswertung";
import { type Bilanz, bilanz } from "../src/kern/bilanz";
import { inhalte } from "../tests/hilfen";
import { type DrehbuchReferenz, START_MS, drehbuchTeams, spieleDurch } from "../tests/modellteam";

const ref = JSON.parse(readFileSync(new URL("../tests/referenz_durchlauf.json", import.meta.url), "utf-8")) as DrehbuchReferenz;

const ziel = process.argv.slice(2).filter((a) => a !== "--")[0] ?? "drehbuch_plan.json";

/** Bilanz für den Plan (Vergleich in auswertung_probe.py). */
function bilanzPlan(b: Bilanz | null) {
  return b ? { fahrzeuge: b.fahrzeuge, wert_mio: b.wertMio, munition_eur: b.munitionEur, median_s: b.medianS, hingeschaut_s: b.hingeschautS, panzer: b.panzer, fehl: b.fehl, kinder: b.kinder } : null;
}
const inh = await inhalte();
// das Team klickt Lagemeldungen an (Team 3 erst nach einer Minute) – für Kennzahlen und Replay der Auswertung
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
      faelle: Object.fromEntries(a.faelle.map((f) => [f.id, { ausgang: t.faelle[f.id].ausgang, entscheid: t.faelle[f.id].kette.glied.was ?? null, sek: t.faelle[f.id].sek ?? null }])),
      kennzahlen: {
        fehl: k.fehl.wirkungen, warnung: k.trotzWarnung, widerspruch: k.widerspruch.gesamt, zu_recht: k.widerspruch.zuRecht,
        lm_gelesen: k.lagemeldungen[0]?.gelesen ?? null, sek_median: k.zeiten.alle.eingang, entscheidungen: k.zeiten.alle.n,
      },
      // seit 2.7 (G2): Bilanz „Das ist es wert“
      bilanz: bilanzPlan(t.bilanz),
    };
  })(),
}));
// Referenzlauf „ARGUS allein“ (G2.1), wie ihn die Auswertung beim Öffnen rechnet
const referenz = bilanzPlan(bilanz(inh, argusAllein(inh).z));
writeFileSync(ziel, JSON.stringify({ szenario: inh.szenario.version, zeiten: ref.zeiten, referenz, teams: plan }, null, 1));
console.log(`${plan.length} Teams, ${plan.reduce((n, t) => n + t.aktionen.length, 0)} Aktionen, ${plan.reduce((n, t) => n + t.protokoll.length, 0)} Ereignisse → ${ziel}`);
