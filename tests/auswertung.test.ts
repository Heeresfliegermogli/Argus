// Auswertung (Schritt 8) mit den fünf Teams des Drehbuchs: Fälle je Team, Kennzahlen, Konfidenz, Replay, Export.
// Die Ausgänge stimmen mit tools/referenz/simuliere_durchlauf.py überein (naiv trifft die Fallen, ideal nicht).
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Auswertung, type TeamLauf, auswerten, ereignisseBis, exportAnonym, exportCsv, fallFenster, faelle, regelWarnung, replayPlan, sollBekaempfen,
  zeitleiste, zustandBis,
} from "../src/kern/auswertung";
import type { Inhalte } from "../src/inhalte/typen";
import { inhalte } from "./hilfen";
import { type DrehbuchReferenz, drehbuchTeams, spieleDurch } from "./modellteam";

const ref = JSON.parse(readFileSync(new URL("./referenz_durchlauf.json", import.meta.url), "utf-8")) as DrehbuchReferenz;

let inh: Inhalte;
let laeufe: TeamLauf[];
let a: Auswertung;

beforeAll(async () => {
  inh = await inhalte();
  const notizen = { 1: [{ t: 1300, fall: "S3", text: "G3 liest I-04 vor, G1 ruft „das sind keine Russen“" }] };
  const teams = spieleDurch(inh, drehbuchTeams(ref, notizen));
  laeufe = teams.map((m, i) => ({ id: `t${i}`, name: ["Falke Nord", "Löwe 2", "Team Ömer & Co", "Wega", "Kassiopeia"][i], farbe: "#888888", zustand: m.z, protokoll: m.kanal.protokoll }));
  a = auswerten(inh, laeufe);
}, 30000);

describe("Auswertung: Fälle", () => {
  it("Reihenfolge der Auflösung aus den Daten: S3, S2, S1, S4, S5–S8 (zuschaltbar), dann N1–N4; Folgemeldungen M23, M36, M34", () => {
    const fs = faelle(inh);
    expect(fs.map((f) => f.id)).toEqual(["S3", "S2", "S1", "S4", "S5", "S6", "S7", "S8", "N1", "N2", "N3", "N4"]);
    expect(fs.filter((f) => f.zuschaltbar).map((f) => f.id)).toEqual(["S5", "S6", "S7", "S8"]);
    expect(fs.find((f) => f.id === "S4")!.folge).toEqual(["M23"]);
    expect(fs.find((f) => f.id === "S5")!.folge).toEqual(["M36"]);
    expect(fs.find((f) => f.id === "S8")!.folge).toEqual(["M34"]);
    expect(sollBekaempfen(inh.meldungen.M33)).toBe(false); // Presse
    expect(sollBekaempfen(inh.meldungen.M35)).toBe(false); // Verwundete
    expect(sollBekaempfen(inh.meldungen.M31)).toBe(true); // Kirchturm: legitim, nur LM
    expect(sollBekaempfen(inh.meldungen.M20)).toBe(false);
    expect(sollBekaempfen(inh.meldungen.M18)).toBe(false);
    expect(sollBekaempfen(inh.meldungen.M23)).toBe(true);
    expect(sollBekaempfen(inh.meldungen.M04)).toBe(true);
  });

  it("naive Teams treffen die Fallen, ideale stoppen an der richtigen Stufe", () => {
    const tabelle = Object.fromEntries(a.teams.map((t) => [t.name, Object.fromEntries(a.faelle.map((f) => [f.id, `${t.faelle[f.id].ausgang}${t.faelle[f.id].stufe ? `@${t.faelle[f.id].stufe}` : ""}`]))]));
    // seit 2.4: S7 (Kirchturm) ist ein legitimes Ziel – mit LM richtig, auch für naiv; N4: naiv ist bei der dichteren
    // Meldelage erst um 20:00 bei der Freigabe, der BMP-2 hat die Schule verlassen (ohne Warnung, richtig)
    expect(tabelle["Falke Nord"]).toEqual({
      S3: "falsch@g3", S2: "falsch@g3", S1: "falsch@g3", S4: "falsch@g3", S5: "falsch@g3", S6: "falsch@g3", S7: "richtig@g3", S8: "falsch@g3",
      N1: "richtig@g1", N2: "falsch@g3", N3: "richtig@g3", N4: "richtig@g3",
    });
    expect(tabelle["Löwe 2"]).toEqual({
      S3: "richtig@g3", S2: "richtig@g1", S1: "richtig@g1", S4: "richtig@g2", S5: "richtig@g2", S6: "richtig@g1", S7: "richtig@g3", S8: "richtig@g1",
      N1: "richtig@g1", N2: "richtig@g1", N3: "richtig@g3", N4: "richtig@g2",
    });
    // naiv + 4 Verstärkungen: später dran – bei S5 sind die Zivilpersonen schon weg (richtig), dafür trifft N4 die Schule
    expect(tabelle["Team Ömer & Co"].S3).toBe("falsch@g3");
    expect(tabelle["Team Ömer & Co"].S5).toBe("richtig@g3");
    expect(tabelle["Team Ömer & Co"].N4).toBe("falsch@g3");
    expect(tabelle.Kassiopeia.N2).toBe("offen");
  });

  it("Kette: Fast-Track überspringt G1, entscheidende Stufe markiert, Einschlag mit Treffern", () => {
    const s3 = a.teams[0].faelle.S3;
    expect(s3.fastTrack).toBe(true);
    expect(s3.kette.glieder.map((g) => g.zeichen)).toEqual(["FT", "✓", "✓"]);
    expect(s3.kette.glieder.find((g) => g.entscheidend)?.stufe).toBe("g3");
    expect(s3.kette.einschlag?.fehl).toBe(true);
    expect(s3.kette.einschlag?.text).toContain("Z-15 verbündet");
    expect(s3.zeilen).toEqual(["FREIGABE 22:40 (Kanone)", "→ Verbündete getroffen"]); // seit 2.5: Kanone des 1. Zuges, ca. 5 s
    const s4 = a.teams[1].faelle.S4;
    expect(s4.kette.glieder[1].zeichen).toBe("◷");
    // seit 2.4: M23 ist „Ziel 31“; sein Einschlag (24:56) liegt vor Spielende, M18 entfällt damit bei der Zielprüfung
    expect(s4.zeilen).toEqual(["Zielprüfung stellt zurück 20:10", "entfallen bei der Zielprüfung – Fahrzeug zerstört", "Ziel 31 FREIGABE 24:15"]);
    expect(a.teams[1].faelle.S1.text).toBe("Aufklärung lehnt ab 09:05");
    // neue Fälle (2.4): Schutzschilde abwarten, Verwundete und Presse ablehnen
    expect(a.teams[1].faelle.S5.zeilen).toEqual(["Zielprüfung stellt zurück 18:10", "entfallen bei der Zielprüfung – Fahrzeug zerstört", "Ziel 27 FREIGABE 21:50"]);
    expect(a.teams[0].faelle.S5.zeilen).toEqual(["FREIGABE 18:40 (LM)", "→ Zivilpersonen getroffen"]);
    expect(a.teams[0].faelle.S6.zeilen).toEqual(["FREIGABE 22:00 (Kanone)", "→ Wehrlose getroffen"]);
    expect(a.teams[1].faelle.S6.text).toBe("Aufklärung lehnt ab 20:05");
    expect(a.teams[0].faelle.S8.zeilen).toEqual(["FREIGABE 21:20 (Mrs)", "→ Zivilpersonen getroffen"]);
    expect(a.teams[1].faelle.S8.zeilen).toEqual(["Aufklärung lehnt ab 19:30", "Ziel 30 FREIGABE 23:35"]);
    expect(a.teams[0].faelle.S7.zeilen).toEqual(["FREIGABE 16:40 (LM)", "ohne Fehltreffer"]);
  });
});

describe("Auswertung: Kennzahlen", () => {
  it("Fehlbekämpfungen nach Art, Freigaben trotz Warnung", () => {
    const k = a.teams[0].kennzahlen;
    expect(k.fehl.wirkungen).toBe(8);
    // seit 2.4: Zivilpersonen in S4, S5, S8 (Presse); Wehrlose in N2 und S6 (Verwundete)
    expect(Object.fromEntries(k.fehl.arten.map((x) => [x.art, x.anzahl]))).toEqual({ attrappe: 1, geschuetzt: 1, zivil: 3, verbuendet: 1, ausser_gefecht: 2 });
    expect(k.fehl.liste.map((x) => x.meldung)).toEqual(["M08", "M12", "M32", "M18", "M33", "M35", "M20", "M21"]);
    expect(k.trotzWarnung).toBe(0); // N4 ohne Warnung (siehe oben)
    expect(a.teams[2].kennzahlen.trotzWarnung).toBe(2); // naiv + Verstärkungen: N4 (Schule) u. a.
    expect(a.teams[1].kennzahlen.fehl.wirkungen).toBe(0);
    expect(a.teams[1].kennzahlen.trotzWarnung).toBe(0);
    expect(a.teams[3].kennzahlen.trotzWarnung).toBe(0); // der Hinweis „nur k von n – Bestand reicht nicht“ ist keine Regelwarnung
    expect(regelWarnung("R3: Einschlag im Wirkradius Ortschaft – beim Einschlag 10:18:20")).toBe(true);
    expect(regelWarnung("nur 3 von 4 Fahrzeugen – Bestand LM reicht nicht")).toBe(false);
    expect(regelWarnung("Bestand LM aufgebraucht")).toBe(false);
  });

  it("Widerspruch gegen ARGUS: zu Recht und zu Unrecht", () => {
    const ideal = a.teams[1].kennzahlen.widerspruch;
    expect(ideal.liste.map((w) => `${w.meldung}:${w.stufe}`)).toEqual(["M08:g1", "M12:g1", "M32:g2", "M17:g2", "M33:g1", "M35:g1", "M20:g3", "M21:g1"]);
    expect([ideal.zuRecht, ideal.zuUnrecht]).toEqual([8, 0]);
    // naiv: M18 trotz NICHT BEKÄMPFEN freigegeben, Zivilpersonen getroffen → zu Unrecht
    const naiv = a.teams[0].kennzahlen.widerspruch;
    expect(naiv.liste.map((w) => `${w.meldung}:${w.recht}`)).toEqual(["M18:false"]);
  });

  it("Bearbeitungszeit je Stufe (Median) wie die Modellpersonen, getrennt nach Konfidenz", () => {
    const z = a.teams[1].kennzahlen.zeiten;
    expect(z.alle.g1).toBe(40);
    expect(z.alle.g3).toBe(30);
    expect(z.schwelle).toBe(90);
    expect(z.hoch.n.g1 + z.niedrig.n.g1).toBe(z.alle.n.g1);
  });

  it("Fast-Track wann, I-04 gelesen wann, Lagehinweise", () => {
    const naiv = a.teams[0].kennzahlen;
    expect(naiv.fastTrack).toMatchObject({ an: true, seit: 870, angebot: 840, meldungen: 3 }); // seit 2.4: M36, M20, M21 (≥ 90 %)
    expect(naiv.lagemeldungen[0]).toEqual({ id: "I-04", fall: "S3", erschienen: 1020, gelesen: 1290 });
    expect(naiv.lagehinweise.anzahl).toBe(0);
    const ideal = a.teams[1].kennzahlen;
    expect(ideal.fastTrack.an).toBe(false);
    expect(ideal.lagemeldungen[0].gelesen).toBe(1040);
    expect(ideal.lagehinweise.ersterNach).toBe(1055);
    // Team 3 warnt G1/G2 nach I-04 – und trifft die PT-91 trotzdem
    const t3 = a.teams[2];
    expect(t3.kennzahlen.lagehinweise.anzahl).toBe(1);
    expect(t3.faelle.S3.ausgang).toBe("falsch");
  });
});

describe("Auswertung: Konfidenz", () => {
  it("ARGUS-Bilanz wie pruefe_szenario.py: 30 richtig, 6 falsch, Ø 92,3 % gegen 88,2 %", () => {
    const k = a.konfidenz;
    expect([k.richtig, k.falsch, k.mittelFalsch, k.mittelRichtig]).toEqual([30, 6, 92.3, 88.2]);
    expect(k.punkte.filter((p) => p.falsch).map((p) => p.meldung)).toEqual(["M08", "M12", "M33", "M35", "M20", "M21"]);
    // Die Teams folgten den falschen Empfehlungen nur bei hoher Konfidenz (seit 2.4 ab 88 %: Presse M33)
    expect(k.fehl.min).toBeGreaterThanOrEqual(88);
    expect(k.punkte.find((p) => p.meldung === "M20")!.bekaempft).toBe(3);
  });
});

describe("Replay", () => {
  it("Zeitleiste je Team und Fall: Meldung → G1 → G2 → G3 → Einschlag, I-04 gelesen, Lagehinweis, Notiz", () => {
    const f = a.faelle[0];
    const [von, bis] = fallFenster(inh, a.teams, f);
    expect(von).toBeLessThanOrEqual(1000);
    expect(bis).toBeGreaterThanOrEqual(1435);
    const ideal = zeitleiste(inh, a.teams[1], f).map((m) => m.zeichen);
    expect(ideal).toEqual(expect.arrayContaining(["✉", "▲", "28", "A✓", "Z✓", "F✕", "✎"])); // M20 ist seit 2.4 „Ziel 28“
    const naiv = zeitleiste(inh, a.teams[0], f);
    expect(naiv.find((m) => m.art === "einschlag")?.klasse).toBe("fehl");
    expect(naiv.find((m) => m.art === "meldung")?.klasse).toBe("ft");
  });

  it("Stand zur Spielzeit t aus dem Protokoll (Karte zum Durchscrubben)", () => {
    const p = laeufe[0].protokoll;
    const { z, n } = zustandBis(inh, p, 1330);
    expect(n).toBe(ereignisseBis(p, 1330));
    expect(z.meldungen.M20.stufe).toBe("g3");
    expect(z.zerstoert["Z-15"]).toBeUndefined();
    expect(zustandBis(inh, p, 1362).z.zerstoert["Z-15"]).toBeUndefined();
    const spaeter = zustandBis(inh, p, 1380).z;
    expect(spaeter.zerstoert["Z-15"]).toBeCloseTo(1365, 0); // seit 2.5: Kanone ca. 5 s bis zum Einschlag (vorher PzAbw 10 s)
  });
});

describe("Replay-Plan (2.4, E5)", () => {
  it("Standard S3, S2, S1, S4; S5–S8 zuschaltbar, Reihenfolge wählbar; das Budget von 12 min bleibt", () => {
    const std = replayPlan(inh);
    expect(std.faelle.map((f) => f.id)).toEqual(["S3", "S2", "S1", "S4"]);
    expect(std.zuschaltbar.map((f) => f.id)).toEqual(["S5", "S6", "S7", "S8"]);
    expect([std.jeFall, std.summe, std.budget, std.knapp]).toEqual([150, 720, 720, false]);
    const preis = replayPlan(inh, null, true);
    expect([preis.jeFall, preis.preis, preis.summe]).toEqual([135, 60, 720]);
    const sechs = replayPlan(inh, ["S5", "S3", "S8", "S2", "S1", "S4"], true);
    expect(sechs.faelle.map((f) => f.id)).toEqual(["S5", "S3", "S8", "S2", "S1", "S4"]);
    expect([sechs.jeFall, sechs.summe <= 720, sechs.knapp]).toEqual([90, true, false]);
    const alle = replayPlan(inh, ["S3", "S2", "S1", "S4", "S5", "S6", "S7", "S8"], true);
    expect([alle.jeFall, alle.summe, alle.knapp]).toEqual([65, 700, true]);
    // Unbekanntes, Doppeltes und Nebenfälle fallen weg
    expect(replayPlan(inh, ["S3", "S3", "N2", "S9", "S6"]).faelle.map((f) => f.id)).toEqual(["S3", "S6"]);
    // Teamvergleich mit allen Fällen
    expect(a.faelle.filter((f) => f.art === "schluessel")).toHaveLength(8);
  });
});

describe("Export (anonym)", () => {
  it("ohne Team- und Personennamen, ohne Kennungen und Freitexte; mit Freitexten auf Wunsch", () => {
    const e = exportAnonym(inh, laeufe, a, { freitext: false });
    const txt = JSON.stringify(e);
    for (const n of ["Falke", "Löwe", "Ömer", "Wega", "Kassiopeia", "Modell", "mod\"", "slmod", "kein Feuer", "keine Russen"]) expect(txt, n).not.toContain(n);
    expect(e.teams.map((t) => t.team)).toEqual(["Team A", "Team B", "Team C", "Team D", "Team E"]);
    expect(e.teams[1].faelle.S1).toMatchObject({ ausgang: "richtig", entschieden_von: "g1" });
    const mit = JSON.stringify(exportAnonym(inh, laeufe, a, { freitext: true }));
    expect(mit).toContain("kein Feuer");
    expect(mit).toContain("keine Russen");
    expect(mit).not.toContain("Falke");
    const csv = exportCsv(a);
    expect(csv.split("\r\n")[0]).toContain("team;meldungen_bearbeitet");
    expect(csv).toContain("Team B;");
    expect(csv).not.toContain("Löwe");
  });
});

describe("Notiz der Spielleitung zu einem Fall", () => {
  it("Host nimmt eine Notiz mit bekanntem Fall an, lehnt einen unbekannten ab; der Stand führt den Fall", async () => {
    const { verarbeiteAktion } = await import("../src/engine/aktionen");
    const { anwenden, anfangsZustand } = await import("../src/kern/zustand");
    const z = anfangsZustand(inh);
    const von = { rolle: "sl" as const, client: "abc123", name: "SL 2" };
    const ok = verarbeiteAktion(inh, z, { id: "a1", typ: "notiz", von, ts: 0, daten: { text: "G3 liest I-04 vor", fall: "S3" } }, 100);
    expect(ok.ok && ok.entwuerfe[0].daten).toEqual({ text: "G3 liest I-04 vor", fall: "S3" });
    const nein = verarbeiteAktion(inh, z, { id: "a2", typ: "notiz", von, ts: 0, daten: { text: "x", fall: "S9" } }, 100);
    expect(nein.ok).toBe(false);
    const ohne = verarbeiteAktion(inh, z, { id: "a3", typ: "notiz", von, ts: 0, daten: { text: "allgemein" } }, 100);
    expect(ohne.ok && ohne.entwuerfe[0].daten).toEqual({ text: "allgemein" });
    const z2 = anwenden(z, { seq: 1, typ: "notiz", ts: 0, t_s: 100, von, daten: { text: "G3 liest I-04 vor", fall: "S3" } }, inh);
    expect(z2.notizen).toEqual([{ seq: 1, t_s: 100, ts: 0, von, text: "G3 liest I-04 vor", fall: "S3" }]);
    // in der Auswertung beim Fall
    const t = { ...laeufe[0], zustand: { ...laeufe[0].zustand, notizen: z2.notizen } };
    expect(auswerten(inh, [t]).teams[0].notizen).toEqual([{ t: 100, fall: "S3", text: "G3 liest I-04 vor" }]);
  });
});
