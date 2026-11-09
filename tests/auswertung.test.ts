// Auswertung mit den fünf Teams des Drehbuchs (2.6, eine Rolle): Fälle je Team, Kennzahlen, Konfidenz, Replay, Export.
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
  const notizen = {
    0: [{ t: 600, fall: "S1", text: "kein Feuer auf Attrappen – Lupe nicht benutzt" }],
    1: [{ t: 1300, fall: "S3", text: "Team liest I-04 vor, einer ruft „das sind keine Russen“" }],
  };
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

  it("naive Teams treffen die Fallen, ideale nicht – eine Entscheidung je Meldung (H2)", () => {
    const tabelle = Object.fromEntries(a.teams.map((t) => [t.name, Object.fromEntries(a.faelle.map((f) => [f.id, t.faelle[f.id].ausgang]))]));
    // 2.6: naiv entscheidet in 20 s – S7 (Kirchturm, legitim) mit LM richtig, N4 trifft die Schule (früher dran als mit drei Rollen)
    expect(tabelle["Falke Nord"]).toEqual({
      S3: "falsch", S2: "falsch", S1: "falsch", S4: "falsch", S5: "falsch", S6: "falsch", S7: "richtig", S8: "falsch",
      N1: "richtig", N2: "falsch", N3: "richtig", N4: "falsch",
    });
    for (const n of ["Löwe 2", "Wega"]) expect(Object.values(tabelle[n]).every((x) => x === "richtig"), n).toBe(true);
    expect(tabelle["Team Ömer & Co"]).toEqual(tabelle["Falke Nord"]);
    // alle Fälle erreicht (H2.5): kein Fall „nicht erreicht“ oder „offen“
    for (const t of a.teams) for (const f of a.faelle) expect(["richtig", "falsch"], `${t.name} ${f.id}`).toContain(t.faelle[f.id].ausgang);
  });

  it("Entscheidung mit Sekunden ab Eingang; Einschlag mit Treffern; Folgemeldungen", () => {
    const s3 = a.teams[0].faelle.S3;
    expect(s3.kette.glied).toMatchObject({ zeichen: "✓", was: "bekaempfen", wirkmittel: "PZA", sek: 20, sekOffen: 20 });
    expect(s3.kette.einschlag?.fehl).toBe(true);
    expect(s3.kette.einschlag?.text).toContain("verbündet");
    expect(s3.zeilen).toEqual(["BEKÄMPFEN 20:35 (Kanone) · 20 s", "→ Verbündete getroffen"]);
    expect(s3.sek).toBe(20);
    const ideal = a.teams[1].faelle;
    expect(ideal.S3.zeilen).toEqual(["ABLEHNEN 21:15 · 60 s"]); // M20 kam, während das Team noch an M36 saß
    expect(ideal.S3.kette.glied).toMatchObject({ zeichen: "✕", was: "ablehnen", sek: 60, sekOffen: 35 });
    expect(ideal.S1.zeilen).toEqual(["ABLEHNEN 09:05 · 35 s"]);
    expect(ideal.S1.text).toContain("ABLEHNEN 09:05");
    expect(ideal.S2.zeilen).toEqual(["ABLEHNEN 13:50 · 35 s"]);
    // S4: zurückstellen – Ziel 31 (M23) ist dasselbe Fahrzeug später; das ideale Team hat dann keine LM mehr (Bestand)
    expect(ideal.S4.zeilen).toEqual(["ZURÜCKSTELLEN 18:55 · 40 s", "Ziel 31 zurückgestellt"]);
    expect(ideal.S4.kette.glied.zeichen).toBe("◷");
    // S5: zurückstellen, das Fahrzeug fällt später; Ziel 27 (M36) bekämpft
    expect(ideal.S5.zeilen).toEqual(["ZURÜCKSTELLEN 17:10 · 40 s", "entfallen – Fahrzeug zerstört", "Ziel 27 BEKÄMPFEN 20:40"]);
    expect(ideal.S6.zeilen).toEqual(["ABLEHNEN 20:05 · 50 s"]);
    expect(ideal.S7.zeilen).toEqual(["BEKÄMPFEN 15:25 (LM) · 40 s", "ohne Fehltreffer"]);
    expect(ideal.S8.zeilen).toEqual(["ABLEHNEN 19:30 · 45 s", "Ziel 30 BEKÄMPFEN 22:25"]);
    const naiv = a.teams[0].faelle;
    expect(naiv.S1.zeilen).toEqual(["BEKÄMPFEN 08:50 (Kanone) · 20 s", "→ Attrappe getroffen"]);
    expect(naiv.S4.zeilen).toEqual(["BEKÄMPFEN 18:35 (LM) · 20 s", "→ Zivilpersonen getroffen"]);
    expect(naiv.S5.zeilen).toEqual(["BEKÄMPFEN 16:50 (LM) · 20 s", "→ Zivilpersonen getroffen"]);
    expect(naiv.S6.zeilen).toEqual(["BEKÄMPFEN 19:35 (Kanone) · 20 s", "→ Wehrlose getroffen"]);
    expect(naiv.S7.zeilen).toEqual(["BEKÄMPFEN 15:05 (LM) · 20 s", "ohne Fehltreffer"]);
    expect(naiv.S8.zeilen).toEqual(["BEKÄMPFEN 19:05 (Mrs) · 20 s", "→ Zivilpersonen getroffen"]);
    // keine Stufen, kein Fast-Track mehr
    expect(JSON.stringify(a)).not.toMatch(/fastTrack|"g[123]"|Fast-Track/);
  });
});

describe("Auswertung: Kennzahlen", () => {
  it("Fehlbekämpfungen nach Art, Bekämpfungen trotz Warnung", () => {
    const k = a.teams[0].kennzahlen;
    expect(k.fehl.wirkungen).toBe(9);
    expect(Object.fromEntries(k.fehl.arten.map((x) => [x.art, x.anzahl]))).toEqual({ attrappe: 1, geschuetzt: 1, zivil: 4, verbuendet: 1, ausser_gefecht: 2 });
    expect(k.fehl.liste.map((x) => x.meldung)).toEqual(["M08", "M12", "M32", "M18", "M33", "M35", "M20", "M21", "M26"]);
    expect(k.trotzWarnung).toBe(4); // M17, M19, M22, M27 mit R2/R3-Warnung
    expect(a.teams[2].kennzahlen.trotzWarnung).toBe(5);
    expect(a.teams[1].kennzahlen.fehl.wirkungen).toBe(0);
    expect(a.teams[1].kennzahlen.trotzWarnung).toBe(0);
    expect(a.teams[3].kennzahlen.trotzWarnung).toBe(0); // der Hinweis „nur k von n – Bestand reicht nicht“ ist keine Regelwarnung
    expect(regelWarnung("R3: Einschlag im Wirkradius Ortschaft – beim Einschlag 10:18:20")).toBe(true);
    expect(regelWarnung("nur 3 von 4 Fahrzeugen – Bestand LM reicht nicht")).toBe(false);
    expect(regelWarnung("Bestand LM aufgebraucht")).toBe(false);
    expect(k.freigaben).toEqual({ gesamt: 26, wieArgus: 22 });
    expect(k.meldungen).toEqual({ erschienen: 29, bearbeitet: 29, gesamt: 36, offenEnde: 0 });
    expect(a.teams[1].kennzahlen.meldungen).toEqual({ erschienen: 33, bearbeitet: 28, gesamt: 36, offenEnde: 2 });
  });

  it("Widerspruch gegen ARGUS: zu Recht und zu Unrecht", () => {
    const ideal = a.teams[1].kennzahlen.widerspruch;
    expect(ideal.liste.map((w) => `${w.meldung}:${w.recht}`)).toEqual([
      "M08:true", "M12:true", "M32:true", "M17:true", "M33:true", "M35:true", "M20:true", "M21:true",
      "M23:false", "M19:false", // zurückgestellt, weil die LM aufgebraucht war – ARGUS hatte recht
    ]);
    expect([ideal.zuRecht, ideal.zuUnrecht]).toEqual([8, 2]);
    // naiv: M18 trotz NICHT BEKÄMPFEN bekämpft, Zivilpersonen getroffen → zu Unrecht
    const naiv = a.teams[0].kennzahlen.widerspruch;
    expect(naiv.liste.map((w) => `${w.meldung}:${w.recht}`)).toEqual(["M18:false"]);
  });

  it("Sekunden je Entscheidung (Median) ab Eingang und ab Öffnen, getrennt nach Konfidenz (H2.4)", () => {
    const z = a.teams[1].kennzahlen.zeiten;
    expect(z.alle).toEqual({ eingang: 40, offen: 35, n: 30 });
    expect(z.hoch.n + z.niedrig.n).toBe(z.alle.n);
    expect([z.schwelle, z.kuerzeste, z.laengste, z.unter20]).toEqual([90, 35, 75, 0]);
    const naiv = a.teams[0].kennzahlen.zeiten;
    expect(naiv.alle).toEqual({ eingang: 20, offen: 20, n: 29 });
    expect(naiv.unter20).toBe(29);
    // Team 4 (ideal + Verstärkungen): mehr Meldungen, längere Wartezeit im Eingang bei gleicher Bearbeitungszeit
    expect(a.teams[3].kennzahlen.zeiten.alle).toEqual({ eingang: 70, offen: 35, n: 31 });
  });

  it("Lagemeldung I-04 angeklickt wann", () => {
    expect(a.teams[0].kennzahlen.lagemeldungen[0]).toEqual({ id: "I-04", fall: "S3", erschienen: 1020, gelesen: 1290 });
    expect(a.teams[1].kennzahlen.lagemeldungen[0].gelesen).toBe(1040);
    // Team 3 klickt I-04 nach einer Minute an – und trifft die PT-91 trotzdem
    expect(a.teams[2].kennzahlen.lagemeldungen[0].gelesen).toBe(1080);
    expect(a.teams[2].faelle.S3.ausgang).toBe("falsch");
  });
});

describe("Auswertung: Konfidenz", () => {
  it("ARGUS-Bilanz wie pruefe_szenario.py: 30 richtig, 6 falsch, Ø 92,3 % gegen 88,2 %", () => {
    const k = a.konfidenz;
    expect([k.richtig, k.falsch, k.mittelFalsch, k.mittelRichtig]).toEqual([30, 6, 92.3, 88.2]);
    expect(k.punkte.filter((p) => p.falsch).map((p) => p.meldung)).toEqual(["M08", "M12", "M33", "M35", "M20", "M21"]);
    // Die Teams folgten den falschen Empfehlungen nur bei hoher Konfidenz (ab 88 %: Presse M33)
    expect(k.fehl.min).toBeGreaterThanOrEqual(88);
    expect(k.punkte.find((p) => p.meldung === "M20")!.bekaempft).toBe(3);
  });
});

describe("Replay", () => {
  it("Zeitleiste je Team und Fall: Meldung → Entscheidung mit Sekunden → Einschlag, I-04 angeklickt, Notiz", () => {
    const f = a.faelle[0];
    const [von, bis] = fallFenster(inh, a.teams, f);
    expect(von).toBeLessThanOrEqual(1020);
    expect(bis).toBeGreaterThanOrEqual(1300);
    const ideal = zeitleiste(inh, a.teams[1], f).map((m) => m.zeichen);
    expect(ideal).toEqual(["✉", "28", "✕ 60 s", "✎"]); // M20 ist „Ziel 28“
    const naiv = zeitleiste(inh, a.teams[0], f);
    expect(naiv.map((m) => `${m.art}:${m.zeichen}`)).toEqual(["gelesen:✉", "meldung:28", "entscheid:✓ 20 s", "einschlag:✸"]);
    expect(naiv.find((m) => m.art === "einschlag")?.klasse).toBe("fehl");
  });

  it("Stand zur Spielzeit t aus dem Protokoll (Karte zum Durchscrubben)", () => {
    const p = laeufe[0].protokoll;
    const { z, n } = zustandBis(inh, p, 1237);
    expect(n).toBe(ereignisseBis(p, 1237));
    expect(z.meldungen.M20.stufe).toBe("wirkung"); // bekämpft 20:35, Kanone ca. 5 s
    expect(z.zerstoert["Z-15"]).toBeUndefined();
    const spaeter = zustandBis(inh, p, 1260).z;
    expect(spaeter.meldungen.M20.stufe).toBe("erledigt");
    expect(spaeter.zerstoert["Z-15"]).toBeCloseTo(1240, 0);
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
    expect(e.teams[1].faelle.S1).toMatchObject({ ausgang: "richtig", entscheid: "ablehnen", sekunden_ab_eingang: 35, sekunden_ab_oeffnen: 35 });
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
    const ok = verarbeiteAktion(inh, z, { id: "a1", typ: "notiz", von, ts: 0, daten: { text: "Team liest I-04 vor", fall: "S3" } }, 100);
    expect(ok.ok && ok.entwuerfe[0].daten).toEqual({ text: "Team liest I-04 vor", fall: "S3" });
    const nein = verarbeiteAktion(inh, z, { id: "a2", typ: "notiz", von, ts: 0, daten: { text: "x", fall: "S9" } }, 100);
    expect(nein.ok).toBe(false);
    const ohne = verarbeiteAktion(inh, z, { id: "a3", typ: "notiz", von, ts: 0, daten: { text: "allgemein" } }, 100);
    expect(ohne.ok && ohne.entwuerfe[0].daten).toEqual({ text: "allgemein" });
    const z2 = anwenden(z, { seq: 1, typ: "notiz", ts: 0, t_s: 100, von, daten: { text: "Team liest I-04 vor", fall: "S3" } }, inh);
    expect(z2.notizen).toEqual([{ seq: 1, t_s: 100, ts: 0, von, text: "Team liest I-04 vor", fall: "S3" }]);
    // in der Auswertung beim Fall
    const t = { ...laeufe[0], zustand: { ...laeufe[0].zustand, notizen: z2.notizen } };
    expect(auswerten(inh, [t]).teams[0].notizen).toEqual([{ t: 100, fall: "S3", text: "Team liest I-04 vor" }]);
  });
});
