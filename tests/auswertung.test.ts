// Auswertung mit den fünf Teams des Drehbuchs (2.6, eine Rolle; seit 2.7 mit Auflösung S3 und Kapitelplan 15 min): Fälle je Team,
// Kennzahlen, Konfidenz, Replay, Export.
// Die Ausgänge stimmen mit tools/referenz/simuliere_durchlauf.py überein (naiv trifft die Fallen, ideal nicht).
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Auswertung, type TeamLauf, auswerten, ereignisseBis, exportAnonym, exportCsv, fallFenster, faelle, kapitelPlan, regelWarnung, replayPlan,
  sollBekaempfen, zeitleiste, zustandBis,
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
    // naiv mit Verstärkungen: N4 entfällt (seit 2.7 mehr Meldungen, das Fahrzeug fällt, bevor das Team dran ist)
    expect(tabelle["Team Ömer & Co"]).toEqual({ ...tabelle["Falke Nord"], N4: "entfallen" });
    // alle Fälle erreicht (H2.5): kein Fall „nicht erreicht“ oder „offen“ – ohne Verstärkungen und bei ideal auch mit
    for (const t of [a.teams[0], a.teams[1], a.teams[3]]) for (const f of a.faelle) expect(["richtig", "falsch"], `${t.name} ${f.id}`).toContain(t.faelle[f.id].ausgang);
  });

  it("Entscheidung mit Sekunden ab Eingang; Einschlag mit Treffern; Folgemeldungen", () => {
    const s3 = a.teams[0].faelle.S3;
    expect(s3.kette.glied).toMatchObject({ zeichen: "✓", was: "bekaempfen", wirkmittel: "PZA", sek: 20, sekOffen: 20 });
    expect(s3.kette.einschlag?.fehl).toBe(true);
    expect(s3.kette.einschlag?.text).toContain("verbündet");
    expect(s3.zeilen).toEqual(["BEKÄMPFEN 20:35 (Kanone) · 20 s", "→ Verbündete getroffen"]);
    expect(s3.sek).toBe(20);
    const ideal = a.teams[1].faelle;
    // seit 2.7 (I3.2): Das ideale Team ist bis 21:45 nicht bei M20 (Rückstau) – die PT-91 sind dann als verbündet erkannt; nicht
    // freigegeben = richtig (I3.3)
    expect(ideal.S3.zeilen).toEqual(["ohne Entscheidung", "21:45 als verbündet erkannt"]);
    expect(ideal.S3.kette.glied).toMatchObject({ zeichen: "◆", art: "leer", t: 1305 });
    expect(ideal.S1.zeilen).toEqual(["ABLEHNEN 09:05 · 35 s"]);
    expect(ideal.S1.text).toContain("ABLEHNEN 09:05");
    expect(ideal.S2.zeilen).toEqual(["ABLEHNEN 13:50 · 35 s"]);
    // S4: zurückstellen – Ziel 33 (M23) ist dasselbe Fahrzeug später; das ideale Team hat dann keine LM mehr (Bestand)
    expect(ideal.S4.zeilen).toEqual(["ZURÜCKSTELLEN 20:05 · 110 s", "Ziel 33 zurückgestellt"]);
    expect(ideal.S4.kette.glied.zeichen).toBe("◷");
    // S5: zurückstellen; Ziel 29 (M36) kommt, als die LM aufgebraucht ist – zurückgestellt
    expect(ideal.S5.zeilen).toEqual(["ZURÜCKSTELLEN 17:45 · 75 s", "Ziel 29 zurückgestellt"]);
    expect(ideal.S6.zeilen).toEqual(["ABLEHNEN 21:15 · 120 s"]);
    expect(ideal.S7.zeilen).toEqual(["BEKÄMPFEN 15:25 (LM) · 40 s", "ohne Fehltreffer"]);
    expect(ideal.S8.zeilen).toEqual(["ABLEHNEN 18:20 · 80 s", "Ziel 25 BEKÄMPFEN 19:30"]);
    const naiv = a.teams[0].faelle;
    expect(naiv.S1.zeilen).toEqual(["BEKÄMPFEN 08:50 (Kanone) · 20 s", "→ Attrappe getroffen"]);
    expect(naiv.S4.zeilen).toEqual(["BEKÄMPFEN 18:35 (LM) · 20 s", "→ Zivilpersonen getroffen"]);
    expect(naiv.S5.zeilen).toEqual(["BEKÄMPFEN 17:00 (LM) · 30 s", "→ Zivilpersonen getroffen"]);
    expect(naiv.S6.zeilen).toEqual(["BEKÄMPFEN 19:35 (Kanone) · 20 s", "→ Wehrlose getroffen"]);
    expect(naiv.S7.zeilen).toEqual(["BEKÄMPFEN 15:05 (LM) · 20 s", "ohne Fehltreffer"]);
    expect(naiv.S8.zeilen).toEqual(["BEKÄMPFEN 17:20 (Mrs) · 20 s", "→ Zivilpersonen getroffen"]);
    // keine Stufen, kein Fast-Track mehr
    expect(JSON.stringify(a)).not.toMatch(/fastTrack|"g[123]"|Fast-Track/);
  });
});

describe("Auswertung: Kennzahlen", () => {
  it("Fehlbekämpfungen nach Art, Bekämpfungen trotz Warnung", () => {
    const k = a.teams[0].kennzahlen;
    expect(k.fehl.wirkungen).toBe(9);
    expect(Object.fromEntries(k.fehl.arten.map((x) => [x.art, x.anzahl]))).toEqual({ attrappe: 1, geschuetzt: 1, zivil: 4, verbuendet: 1, ausser_gefecht: 2 });
    expect(k.fehl.liste.map((x) => x.meldung)).toEqual(["M08", "M12", "M32", "M33", "M18", "M35", "M20", "M21", "M26"]);
    expect(k.trotzWarnung).toBe(4); // M17, M19, M22, M27 mit R2/R3-Warnung
    expect(a.teams[2].kennzahlen.trotzWarnung).toBe(5);
    expect(a.teams[1].kennzahlen.fehl.wirkungen).toBe(0);
    expect(a.teams[1].kennzahlen.trotzWarnung).toBe(0);
    expect(a.teams[3].kennzahlen.trotzWarnung).toBe(0); // der Hinweis „nur k von n – Bestand reicht nicht“ ist keine Regelwarnung
    expect(regelWarnung("R3: Einschlag im Wirkradius Ortschaft – beim Einschlag 10:18:20")).toBe(true);
    expect(regelWarnung("nur 3 von 4 Fahrzeugen – Bestand LM reicht nicht")).toBe(false);
    expect(regelWarnung("Bestand LM aufgebraucht")).toBe(false);
    expect(k.freigaben).toEqual({ gesamt: 26, wieArgus: 22 });
    expect(k.meldungen).toEqual({ erschienen: 29, bearbeitet: 29, gesamt: 37, offenEnde: 0 });
    expect(a.teams[1].kennzahlen.meldungen).toEqual({ erschienen: 33, bearbeitet: 28, gesamt: 37, offenEnde: 1 });
  });

  it("Widerspruch gegen ARGUS: zu Recht und zu Unrecht", () => {
    const ideal = a.teams[1].kennzahlen.widerspruch;
    expect(ideal.liste.map((w) => `${w.meldung}:${w.recht}`)).toEqual([
      "M08:true", "M12:true", "M32:true", "M33:true", "M17:true",
      "M37:false", // zurückgestellt, weil die LM aufgebraucht war – ARGUS hatte recht
      "M35:true", "M36:false", "M21:true", "M23:false", "M26:false",
    ]);
    expect([ideal.zuRecht, ideal.zuUnrecht]).toEqual([7, 4]);
    // naiv: M18 trotz NICHT BEKÄMPFEN bekämpft, Zivilpersonen getroffen → zu Unrecht
    const naiv = a.teams[0].kennzahlen.widerspruch;
    expect(naiv.liste.map((w) => `${w.meldung}:${w.recht}`)).toEqual(["M18:false"]);
  });

  it("Sekunden je Entscheidung (Median) ab Eingang und ab Öffnen, getrennt nach Konfidenz (H2.4)", () => {
    const z = a.teams[1].kennzahlen.zeiten;
    expect(z.alle).toEqual({ eingang: 42.5, offen: 35, n: 30 });
    expect(z.hoch.n + z.niedrig.n).toBe(z.alle.n);
    expect([z.schwelle, z.kuerzeste, z.laengste, z.unter20]).toEqual([90, 35, 130, 0]);
    const naiv = a.teams[0].kennzahlen.zeiten;
    expect(naiv.alle).toEqual({ eingang: 20, offen: 20, n: 29 });
    expect(naiv.unter20).toBe(26); // seit 2.7 dichter: dreimal wartete auch das schnelle Team
    // Team 4 (ideal + Verstärkungen): mehr Meldungen, längere Wartezeit im Eingang bei gleicher Bearbeitungszeit
    expect(a.teams[3].kennzahlen.zeiten.alle).toEqual({ eingang: 55, offen: 35, n: 31 });
  });

  it("Lagemeldung I-04 angeklickt wann (seit 2.7 nur 30 s im Feed)", () => {
    // naiv: I-04 lief ungelesen durch
    expect(a.teams[0].kennzahlen.lagemeldungen[0]).toEqual({ id: "I-04", fall: "S3", erschienen: 1020 });
    expect(a.teams[1].kennzahlen.lagemeldungen[0].gelesen).toBe(1040);
    // Team 3 klickt I-04 nach 25 s an – und trifft die PT-91 trotzdem
    expect(a.teams[2].kennzahlen.lagemeldungen[0].gelesen).toBe(1045);
    expect(a.teams[2].faelle.S3.ausgang).toBe("falsch");
  });
});

describe("Auswertung: Konfidenz", () => {
  it("ARGUS-Bilanz wie pruefe_szenario.py: 31 richtig, 6 falsch, Ø 92,3 % gegen 88,2 %", () => {
    const k = a.konfidenz;
    expect([k.richtig, k.falsch, k.mittelFalsch, k.mittelRichtig]).toEqual([31, 6, 92.3, 88.2]); // seit 2.7 M37
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
    expect(bis).toBeGreaterThanOrEqual(1320); // bis nach der Auflösung (21:45)
    const ideal = zeitleiste(inh, a.teams[1], f).map((m) => m.zeichen);
    expect(ideal).toEqual(["✉", "30", "✎", "◆"]); // M20 ist seit 2.7 „Ziel 30“; ◆ als verbündet erkannt
    const naiv = zeitleiste(inh, a.teams[0], f);
    expect(naiv.map((m) => `${m.art}:${m.zeichen}`)).toEqual(["gelesen:✉", "meldung:30", "entscheid:✓ 20 s", "einschlag:✸"]);
    expect(naiv.find((m) => m.art === "einschlag")?.klasse).toBe("fehl");
    expect(naiv.find((m) => m.art === "gelesen")?.klasse).toBe("ungelesen");
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

describe("Replay-Plan (2.4, E5; seit 2.7 G1) und Kapitelplan 15 min", () => {
  it("Standard S3, S2 je 2:00; S1, S4–S8 zuschaltbar, Reihenfolge wählbar; das Replay-Budget von 4 min bleibt", () => {
    const std = replayPlan(inh);
    expect(std.faelle.map((f) => f.id)).toEqual(["S3", "S2"]);
    expect(std.zuschaltbar.map((f) => f.id)).toEqual(["S1", "S4", "S5", "S6", "S7", "S8"]);
    expect([std.jeFall, std.summe, std.budget, std.knapp]).toEqual([120, 240, 240, false]);
    const drei = replayPlan(inh, ["S3", "S2", "S1"]);
    expect([drei.jeFall, drei.summe, drei.knapp]).toEqual([80, 240, false]);
    const sechs = replayPlan(inh, ["S5", "S3", "S8", "S2", "S1", "S4"]);
    expect(sechs.faelle.map((f) => f.id)).toEqual(["S5", "S3", "S8", "S2", "S1", "S4"]);
    expect([sechs.jeFall, sechs.summe <= 240, sechs.knapp]).toEqual([40, true, true]);
    const alle = replayPlan(inh, ["S3", "S2", "S1", "S4", "S5", "S6", "S7", "S8"]);
    expect([alle.jeFall, alle.summe, alle.knapp]).toEqual([30, 240, true]);
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

describe("Kapitelplan (seit 2.7, G1.1)", () => {
  it("Standard: Teamvergleich 1:00, Replay S3/S2 4:00, Bilanz 2:00, Impuls 1:00, Diskussion 6:00, Abschluss 1:00 – 15 min", () => {
    const p = kapitelPlan(inh);
    expect(p.kapitel.map((k) => [k.id, k.sek])).toEqual([
      ["teams", 60], ["S3", 120], ["S2", 120], ["bilanz", 120], ["impuls", 60], ["diskussion", 360], ["abschluss", 60],
    ]);
    expect(p.summe).toBe(15 * 60);
    // zuschaltbar: Kennzahlen und Konfidenz nach dem Teamvergleich, Preis des Abwartens nach dem Replay (Verlustmodell)
    expect(p.zuschaltbar.map((k) => [k.id, k.nach])).toEqual([["kennzahlen", "teams"], ["konfidenz", "teams"], ["preis", "replay"]]);
    const mehr = kapitelPlan(inh, { zusatz: ["preis", "kennzahlen"], faelle: ["S3", "S2", "S1"] });
    expect(mehr.kapitel.map((k) => k.id)).toEqual(["teams", "kennzahlen", "S3", "S2", "S1", "preis", "bilanz", "impuls", "diskussion", "abschluss"]);
    expect(mehr.summe).toBe(15 * 60 + 45 + 60);
    expect(mehr.kapitel.find((k) => k.id === "S1")!.sek).toBe(80);
  });

  it("Bilanz je Team (Spielwerte) und Referenzlauf im Export und in der CSV, anonym, Fehlbekämpfungen ohne Eurowert", async () => {
    const { argusAllein } = await import("../src/engine/referenzlauf");
    const mitRef = auswerten(inh, laeufe, { zustand: argusAllein(inh).z });
    expect(mitRef.referenz?.name).toBe("ARGUS allein");
    expect(mitRef.referenz?.bilanz?.hingeschautS).toBe(0);
    expect(mitRef.teams[1].bilanz?.fehlSumme).toBe(0);
    const ex = exportAnonym(inh, laeufe, mitRef, { freitext: false }) as unknown as { referenz: { bilanz: Record<string, unknown> }; teams: { bilanz: Record<string, unknown> }[] };
    expect(ex.referenz.bilanz).toMatchObject({ sekunden_hingeschaut_median: 0, panzer_einsatzbereit: "4/4" });
    expect(Object.keys(ex.teams[0].bilanz)).toEqual(["feindfahrzeuge", "wert_mio_eur", "munition_eur", "schuss", "sekunden_meldung_bis_wirkung_median",
      "sekunden_hingeschaut_median", "panzer_einsatzbereit", "fehlbekaempfungen", "davon_kinder"]);
    expect(JSON.stringify((ex.teams[0].bilanz as { fehlbekaempfungen: unknown }).fehlbekaempfungen)).not.toMatch(/eur/i);
    expect(JSON.stringify(ex)).not.toMatch(/Falke Nord|Löwe 2|Ömer/);
    const csv = exportCsv(mitRef).split("\r\n");
    expect(csv[0]).toContain("bilanz_wert_mio_eur");
    expect(csv[0].split(";").length).toBe(csv[1].split(";").length);
    expect(csv.find((z) => z.startsWith("ARGUS allein;"))!.split(";").length).toBe(csv[0].split(";").length);
  });
});
