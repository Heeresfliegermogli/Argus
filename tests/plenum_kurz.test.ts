// Liste O (15.11.2026): kurzes Plenum – Kapitelplan (Gefecht beendet, Schlüsselfälle einzeln, Gesamt; ca. 5 min), Zählregel
// „falsch behandelt“ (O1.5), Prozentsätze je Fall und gesamt (O1.4/O1.6) und die eine Zahl (O1.7: Median der Sekunden vom Öffnen bis
// zur Entscheidung über alle Entscheidungen aller Teams) – für die Modellteams naiv/ideal des Drehbuchs und die Beispielteams von
// ?auswertung=demo. Die Zahl wird hier unabhängig aus den Protokollen nachgerechnet.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Auswertung, type FallAusgang, type TeamLauf, FALSCH_BEHANDELT, auswerten, fallQuote, folienKapitel, folienPlan, gesamtQuote, hinschauZahl,
  kapitelPlan,
} from "../src/kern/auswertung";
import type { Ereignis } from "../src/kern/ereignisse";
import { zustandAus } from "../src/kern/zustand";
import type { Inhalte } from "../src/inhalte/typen";
import { inhalte } from "./hilfen";
import { type DrehbuchReferenz, drehbuchTeams, spieleDurch } from "./modellteam";

const ref = JSON.parse(readFileSync(new URL("./referenz_durchlauf.json", import.meta.url), "utf-8")) as DrehbuchReferenz;
const demo = JSON.parse(readFileSync(new URL("../public/demo/auswertung_demo.json", import.meta.url), "utf-8")) as
  { teams: { id: string; name: string; farbe: string; modell: string; protokoll: Ereignis[] }[] };

let inh: Inhalte;
let laeufe: TeamLauf[];
let a: Auswertung;

/** Median der Sekunden vom Öffnen bis zur Entscheidung, unabhängig gerechnet: jede Entscheidung im Protokoll (`entscheid`). */
function medianAusProtokoll(teams: TeamLauf[]): { median: number; n: number } {
  const w = teams.flatMap((t) => t.protokoll.filter((e) => e.typ === "entscheid").map((e) => (e.daten as { sek_offen?: number; sek_eingang?: number })))
    .map((d) => d.sek_offen ?? d.sek_eingang).filter((x): x is number => typeof x === "number").sort((x, y) => x - y);
  const m = Math.floor(w.length / 2);
  return { median: w.length % 2 ? w[m] : (w[m - 1] + w[m]) / 2, n: w.length };
}

/** Auswertung mit erfundenen Ausgängen für die Zählregel (nur `faelle` wird gebraucht). */
function mitAusgaengen(ausgaenge: FallAusgang[]): Auswertung {
  return { faelle: [], konfidenz: {} as Auswertung["konfidenz"], teams: ausgaenge.map((x, i) => ({ id: `t${i}`, faelle: { S9: { ausgang: x } } })) } as unknown as Auswertung;
}

beforeAll(async () => {
  inh = await inhalte();
  const teams = spieleDurch(inh, drehbuchTeams(ref));
  laeufe = teams.map((m, i) => ({ id: `t${i}`, name: `Team ${i + 1}`, farbe: "#888888", zustand: m.z, protokoll: m.kanal.protokoll }));
  a = auswerten(inh, laeufe);
}, 30000);

describe("Kapitelplan des kurzen Plenums (O1.1, O1.2, O1.6, O1.9)", () => {
  it("Standard: Gefecht beendet 1:00, S3, S2, S1, S4 je 0:45, Gesamt 1:00 – Σ 5:00", () => {
    const p = kapitelPlan(inh);
    expect(p.kapitel.map((k) => [k.id, k.sek])).toEqual([
      ["gefecht", 60], ["fall-S3", 45], ["fall-S2", 45], ["fall-S1", 45], ["fall-S4", 45], ["gesamt", 60],
    ]);
    expect(p.summe).toBe(5 * 60);
    expect(p.kapitel.filter((k) => k.folie).map((k) => k.folie!.id)).toEqual(["S3", "S2", "S1", "S4"]);
    expect(p.kapitel.some((k) => k.fall)).toBe(false); // kein Replay im Standard
    expect(folienKapitel("S3")).toBe("fall-S3");
  });

  it("die bisherigen Kapitel sind zuschaltbar, nach „Gesamt“, in der bisherigen Reihenfolge", () => {
    const p = kapitelPlan(inh);
    expect(p.zuschaltbar.map((k) => [k.id, k.nach])).toEqual([
      ["teams", "gesamt"], ["kennzahlen", "gesamt"], ["konfidenz", "gesamt"], ["replay", "gesamt"], ["preis", "gesamt"],
      ["bilanz", "gesamt"], ["impuls", "gesamt"], ["diskussion", "gesamt"], ["abschluss", "gesamt"],
    ]);
    const alle = kapitelPlan(inh, { zusatz: p.zuschaltbar.map((k) => k.id) });
    expect(alle.kapitel.map((k) => k.id)).toEqual([
      "gefecht", "fall-S3", "fall-S2", "fall-S1", "fall-S4", "gesamt",
      "teams", "kennzahlen", "konfidenz", "S3", "S2", "preis", "bilanz", "impuls", "diskussion", "abschluss",
    ]);
    expect(alle.kapitel.find((k) => k.id === "S3")!.fall?.id).toBe("S3"); // Replay wie bisher, 4 min geteilt
    expect(alle.kapitel.find((k) => k.id === "S3")!.sek).toBe(120);
    expect(alle.kapitel.filter((k) => k.zuschaltbar)).toHaveLength(10);
    expect(alle.summe).toBe(300 + 60 + 45 + 30 + 240 + 60 + 120 + 60 + 360 + 60);
  });

  it("Fälle zuschalten und ordnen: S5–S8 dazu, Reihenfolge nach Wahl, je Fall 0:45 (die Zeit wächst)", () => {
    expect(folienPlan(inh).zuschaltbar.map((f) => f.id)).toEqual(["S5", "S6", "S7", "S8"]);
    const p = kapitelPlan(inh, { faelle: ["S2", "S3", "S1", "S4", "S6"], zusatz: ["replay"], replay: ["S1"] });
    expect(p.kapitel.map((k) => k.id)).toEqual(["gefecht", "fall-S2", "fall-S3", "fall-S1", "fall-S4", "fall-S6", "gesamt", "S1"]);
    expect(p.summe).toBe(60 + 5 * 45 + 60 + 240);
    // Unbekanntes, Doppeltes und Nebenfälle fallen weg
    expect(folienPlan(inh, ["S3", "S3", "N2", "S9", "S8"]).faelle.map((f) => f.id)).toEqual(["S3", "S8"]);
  });

  it("jeder Schlüsselfall hat einen Satz zur Auflösung; Ablauf im Unterricht: Plenum 5 min", () => {
    for (const f of inh.szenario.schluesselfaelle) expect(f.wirklich, f.id).toBeTruthy();
    expect(inh.szenario.schluesselfaelle.find((f) => f.id === "S3")!.wirklich).toContain("verbündet");
    expect(inh.szenario.ablauf_unterricht.map((x) => [x.phase, x.dauer_min])).toEqual([["Einweisung", 3], ["Spiel", 25], ["Plenum", 5]]);
  });
});

describe("Zählregel „falsch behandelt“ (O1.5)", () => {
  it("falsch und zu Unrecht abgelehnt zählen als falsch; offen, entfallen, nicht erreicht zählen nicht in den Prozentsatz", () => {
    expect([...FALSCH_BEHANDELT]).toEqual(["falsch", "verpasst"]);
    const q = fallQuote(mitAusgaengen(["falsch", "verpasst", "richtig", "offen", "entfallen", "nicht_erreicht", "falsch"]), "S9");
    expect(q).toEqual({ fall: "S9", richtig: 1, falsch: 3, ohne: 3, n: 4, prozent: 75 });
    expect(fallQuote(mitAusgaengen(["falsch", "falsch", "falsch", "falsch", "falsch", "richtig", "richtig"]), "S9").prozent).toBe(71); // 5 von 7
    expect(fallQuote(mitAusgaengen(["offen", "nicht_erreicht"]), "S9")).toMatchObject({ n: 0, prozent: null }); // kein Team hat entschieden
  });

  it("gesamt: Summe über die gezeigten Fälle, falsch + richtig = 100 %", () => {
    const g = gesamtQuote(a, ["S3", "S2", "S1", "S4"]);
    const f = g.faelle.reduce((x, q) => x + q.falsch, 0);
    const r = g.faelle.reduce((x, q) => x + q.richtig, 0);
    expect([g.falsch, g.richtig, g.n]).toEqual([f, r, f + r]);
    expect(g.prozentFalsch).toBe(Math.round((100 * f) / (f + r)));
    expect(g.prozentFalsch! + g.prozentRichtig!).toBe(100);
  });
});

describe("Modellteams des Drehbuchs (naiv, ideal, mit Verstärkungen)", () => {
  it("S3, S2, S1, S4: die drei naiven Teams behandeln sie falsch, die beiden idealen richtig – 3 von 5 Teams, 60 %", () => {
    for (const f of ["S3", "S2", "S1", "S4"]) {
      const q = fallQuote(a, f);
      // naiv = Team 1, 3, 5 (ohne, mit V-1…V-4, mit V-1…V-5); ideal = Team 2, 4
      expect(a.teams.map((t) => t.faelle[f].ausgang), f).toEqual(["falsch", "richtig", "falsch", "richtig", "falsch"]);
      expect(q, f).toEqual({ fall: f, richtig: 2, falsch: 3, ohne: 0, n: 5, prozent: 60 });
    }
    const g = gesamtQuote(a, ["S3", "S2", "S1", "S4"]);
    expect([g.falsch, g.richtig, g.n, g.prozentFalsch, g.prozentRichtig]).toEqual([12, 8, 20, 60, 40]);
  });

  it("die Zahl: Median der Sekunden vom Öffnen bis zur Entscheidung über alle Entscheidungen aller Teams – wie aus dem Protokoll", () => {
    const z = hinschauZahl(a);
    const p = medianAusProtokoll(laeufe);
    expect(z.n).toBe(p.n);
    expect(z.median).toBe(p.median);
    expect(z.sekunden).toBe(Math.round(p.median));
    // je Modell: naiv entscheidet nach 20 s, ideal nach 35 s
    const nur = (i: number) => hinschauZahl(auswerten(inh, [laeufe[i]])).sekunden;
    expect([nur(0), nur(1)]).toEqual([20, 35]);
    expect(z.n).toBeGreaterThan(100);
  });
});

describe("Beispiel …/?auswertung=demo (7 Teams)", () => {
  it("dieselben Zahlen wie im Plenum: je Fall, gesamt und die Zahl", () => {
    const teams: TeamLauf[] = demo.teams.map((t) => ({ id: t.id, name: t.name, farbe: t.farbe, protokoll: t.protokoll, zustand: zustandAus(t.protokoll, inh) }));
    const d = auswerten(inh, teams);
    const quoten = ["S3", "S2", "S1", "S4"].map((f) => fallQuote(d, f));
    for (const q of quoten) expect(q.n, q.fall).toBe(7);
    // Modelle der Beispielteams: naiv (auch mit Verstärkungen, 25 s und 30 s je Entscheidung) behandeln S1–S4 falsch, ideal richtig
    const naiv = demo.teams.filter((t) => !/ideal/.test(t.modell)).length;
    for (const q of quoten) expect([q.falsch, q.richtig], q.fall).toEqual([naiv, 7 - naiv]);
    const g = gesamtQuote(d, ["S3", "S2", "S1", "S4"]);
    expect(g.n).toBe(28);
    expect(g.prozentFalsch).toBe(Math.round((100 * 4 * naiv) / 28));
    const z = hinschauZahl(d);
    const p = medianAusProtokoll(teams);
    expect([z.sekunden, z.n]).toEqual([Math.round(p.median), p.n]);
  });
});
