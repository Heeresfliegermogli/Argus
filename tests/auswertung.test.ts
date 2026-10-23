// Auswertung (Schritt 8) mit den fünf Teams des Drehbuchs: Fälle je Team, Kennzahlen, Konfidenz, Replay, Export.
// Die Ausgänge stimmen mit tools/referenz/simuliere_durchlauf.py überein (naiv trifft die Fallen, ideal nicht).
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Auswertung, type TeamLauf, auswerten, ereignisseBis, exportAnonym, exportCsv, fallFenster, faelle, sollBekaempfen, zeitleiste, zustandBis,
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
  it("Reihenfolge der Auflösung aus den Daten: S3, S2, S1, S4, dann N1–N4; S4 mit Folgemeldung M23", () => {
    const fs = faelle(inh);
    expect(fs.map((f) => f.id)).toEqual(["S3", "S2", "S1", "S4", "N1", "N2", "N3", "N4"]);
    expect(fs.find((f) => f.id === "S4")!.folge).toEqual(["M23"]);
    expect(sollBekaempfen(inh.meldungen.M20)).toBe(false);
    expect(sollBekaempfen(inh.meldungen.M18)).toBe(false);
    expect(sollBekaempfen(inh.meldungen.M23)).toBe(true);
    expect(sollBekaempfen(inh.meldungen.M04)).toBe(true);
  });

  it("naive Teams treffen die Fallen, ideale stoppen an der richtigen Stufe", () => {
    const tabelle = Object.fromEntries(a.teams.map((t) => [t.name, Object.fromEntries(a.faelle.map((f) => [f.id, `${t.faelle[f.id].ausgang}${t.faelle[f.id].stufe ? `@${t.faelle[f.id].stufe}` : ""}`]))]));
    expect(tabelle["Falke Nord"]).toEqual({ S3: "falsch@g3", S2: "falsch@g3", S1: "falsch@g3", S4: "falsch@g3", N1: "richtig@g1", N2: "falsch@g3", N3: "richtig@g3", N4: "falsch@g3" });
    expect(tabelle["Löwe 2"]).toEqual({ S3: "richtig@g3", S2: "richtig@g1", S1: "richtig@g1", S4: "richtig@g2", N1: "richtig@g1", N2: "richtig@g1", N3: "richtig@g3", N4: "richtig@g2" });
    // naiv + 4 Verstärkungen: später dran, Zivilpersonen im Hof RABE schon weg (S4 richtig), N4 nach der Schule
    expect(tabelle["Team Ömer & Co"].S3).toBe("falsch@g3");
    expect(tabelle["Team Ömer & Co"].S4).toBe("richtig@g3");
    expect(tabelle.Kassiopeia.N2).toBe("offen");
  });

  it("Kette: Fast-Track überspringt G1, entscheidende Stufe markiert, Einschlag mit Treffern", () => {
    const s3 = a.teams[0].faelle.S3;
    expect(s3.fastTrack).toBe(true);
    expect(s3.kette.glieder.map((g) => g.zeichen)).toEqual(["FT", "✓", "✓"]);
    expect(s3.kette.glieder.find((g) => g.entscheidend)?.stufe).toBe("g3");
    expect(s3.kette.einschlag?.fehl).toBe(true);
    expect(s3.kette.einschlag?.text).toContain("Z-15 verbündet");
    expect(s3.zeilen).toEqual(["FREIGABE 10:22:15 (PzAbw)", "→ Verbündete getroffen"]);
    const s4 = a.teams[1].faelle.S4;
    expect(s4.kette.glieder[1].zeichen).toBe("◷");
    expect(s4.zeilen).toEqual(["G2 stellt zurück 10:20:10", "M23 FREIGABE 10:24:25"]);
    expect(a.teams[1].faelle.S1.text).toBe("G1 lehnt ab 10:09:10");
  });
});

describe("Auswertung: Kennzahlen", () => {
  it("Fehlbekämpfungen nach Art, Freigaben trotz Warnung", () => {
    const k = a.teams[0].kennzahlen;
    expect(k.fehl.wirkungen).toBe(5);
    expect(Object.fromEntries(k.fehl.arten.map((x) => [x.art, x.anzahl]))).toEqual({ attrappe: 1, geschuetzt: 1, zivil: 1, verbuendet: 1, ausser_gefecht: 1 });
    expect(k.trotzWarnung).toBe(1); // N4: Freigabe trotz Warnung NS-01
    expect(a.teams[1].kennzahlen.fehl.wirkungen).toBe(0);
    expect(a.teams[1].kennzahlen.trotzWarnung).toBe(0);
  });

  it("Widerspruch gegen ARGUS: zu Recht und zu Unrecht", () => {
    const ideal = a.teams[1].kennzahlen.widerspruch;
    expect(ideal.liste.map((w) => `${w.meldung}:${w.stufe}`)).toEqual(["M08:g1", "M12:g1", "M17:g2", "M20:g3", "M21:g1"]);
    expect([ideal.zuRecht, ideal.zuUnrecht]).toEqual([5, 0]);
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
    expect(naiv.fastTrack).toMatchObject({ an: true, seit: 870, angebot: 840, meldungen: 3 });
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
  it("ARGUS-Bilanz wie pruefe_szenario.py: 23 richtig, 4 falsch, Ø 93,5 % gegen 88,3 %", () => {
    const k = a.konfidenz;
    expect([k.richtig, k.falsch, k.mittelFalsch, k.mittelRichtig]).toEqual([23, 4, 93.5, 88.3]);
    expect(k.punkte.filter((p) => p.falsch).map((p) => p.meldung)).toEqual(["M08", "M12", "M20", "M21"]);
    // Die Teams folgten den falschen Empfehlungen nur bei hoher Konfidenz
    expect(k.fehl.min).toBeGreaterThanOrEqual(91);
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
    expect(ideal).toEqual(expect.arrayContaining(["✉", "▲", "M20", "G1✓", "G2✓", "G3✕", "✎"]));
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
    const spaeter = zustandBis(inh, p, 1350).z;
    expect(spaeter.zerstoert["Z-15"]).toBeCloseTo(1345, 0);
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
