// Szenario 2.7 (Änderungslisten G und I, Probelauf vom 09.11.2026): Meldungen früh genug (I2), kein gemeldetes Ziel verschwindet ohne
// Erklärung (I1), die polnischen Kampfpanzer kämpfen sichtbar mit und werden nach Zeit als verbündet erkannt (I3), Lagemeldungen
// verschwinden nach Klick oder 30 s ganz (I4), Referenzlauf „ARGUS allein“ und Bilanz (G2).
// Gespielt mit der echten Engine: „ohne Eingriff“ (niemand entscheidet), „ARGUS allein“ und die Modellteams naiv/ideal.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { feedSichtbar } from "../src/ansichten/zb";
import { argusAllein, spieleAutomatisch } from "../src/engine/referenzlauf";
import type { Inhalte } from "../src/inhalte/typen";
import { auswerten, zustandBis } from "../src/kern/auswertung";
import { bilanz, FEHL_IDS } from "../src/kern/bilanz";
import { bekannteZiele, effekte } from "../src/kern/effekte";
import { position, vorhanden } from "../src/kern/geometrie";
import { weltFuer } from "../src/kern/lage";
import { imWald, lagebildZielmeldungen, RAND_M } from "../src/kern/lagebild";
import { vermerke, zielNummer } from "../src/kern/sichten";
import { verlustLage } from "../src/kern/verluste";
import { zielNr } from "../src/kern/zielnummern";
import type { Spielzustand } from "../src/kern/zustand";
import { inhalte } from "./hilfen";
import { type DrehbuchReferenz, drehbuchTeams, spieleDurch } from "./modellteam";

const ref = JSON.parse(readFileSync(new URL("./referenz_durchlauf.json", import.meta.url), "utf-8")) as DrehbuchReferenz;

let cache: { inh: Inhalte; passiv: ReturnType<typeof spieleAutomatisch>; argus: ReturnType<typeof argusAllein>; teams: ReturnType<typeof spieleDurch> } | null = null;
async function laeufe() {
  if (cache) return cache;
  const inh = await inhalte();
  cache = { inh, passiv: spieleAutomatisch(inh, null), argus: argusAllein(inh), teams: spieleDurch(inh, drehbuchTeams(ref).slice(0, 2)) };
  return cache;
}

/** Erste Meldung je Fahrzeug (Spielzeit). */
function ersteMeldung(inh: Inhalte): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of inh.szenario.meldungen) for (const zid of m.ziele) out.set(zid, Math.min(out.get(zid) ?? Infinity, m.t_s));
  return out;
}

describe("Szenario 2.7: Daten", () => {
  it("Version 2.7, 37 Meldungen; Ziel 22 von 2.6 (M16) vor dem ersten Schuss um 16:28 gemeldet, jetzt Ziel 21", async () => {
    const inh = await inhalte();
    expect(inh.szenario.version).toBe("2.7");
    expect(inh.szenario.meldungen).toHaveLength(37);
    expect(inh.meldungen.M16.t_s).toBeLessThan(16 * 60 + 28);
    expect(zielNr(inh, null, "M16")).toBe("21");
    expect(zielNr(inh, null, "M11")).toBe("15");
    expect(zielNr(inh, null, "M20")).toBe("30");
    expect(inh.regeln.anzeige?.lagemeldung_s).toBe(30);
  });

  it("I2.2: jede erste Meldung höchstens 90 s nach der Einfahrt (sichtbar, nicht im Wald) und vor dem ersten Schuss auf die Kp", async () => {
    const { inh, passiv } = await laeufe();
    const erste = ersteMeldung(inh);
    const { breite, hoehe } = inh.karte.ausdehnung_m;
    // erster Schuss je Schütze ohne Eingriff (Verlustmodell)
    const schuss = new Map<string, number>();
    for (const e of verlustLage(inh, passiv.z).ereignisse) if (e.quelle) schuss.set(e.quelle, Math.min(schuss.get(e.quelle) ?? Infinity, e.t));
    const fehler: string[] = [];
    for (const z of inh.szenario.ziele) {
      if (z.ungemeldet || z.nur_kontakt || z.spaet_gewollt || z.herkunft || z.im_gebaeude) continue;
      const tm = erste.get(z.id);
      if (tm === undefined) continue;
      if (inh.szenario.meldungen.some((m) => m.ziele.includes(z.id) && m.folge_von && m.t_s === tm)) continue;
      // Einfahrt: erste Sekunde im Kartenrechteck und nicht im Wald
      let ein: number | null = null;
      for (let t = 0; t <= 1500; t += 1) {
        if (!vorhanden(z, t)) continue;
        const p = position(z, t);
        if (p[0] >= 0 && p[1] >= 0 && p[0] <= breite && p[1] <= hoehe && !imWald(inh, p)) { ein = t; break; }
      }
      if (ein !== null && tm > Math.max(ein, z.ab_s ?? 0) + 90 + 1) fehler.push(`${z.id}: Einfahrt ${ein} s, gemeldet ${tm} s`);
      const s = schuss.get(z.id);
      if (s !== undefined && s < tm) fehler.push(`${z.id}: schießt ${s} s, gemeldet ${tm} s`);
    }
    expect(fehler).toEqual([]);
  });

  it("G2: Spielwerte in regeln.bilanz, Fehlbekämpfungen ohne Eurowert in fester Reihenfolge", async () => {
    const inh = await inhalte();
    const b = inh.regeln.bilanz!;
    expect(b.fahrzeuge_mio_eur).toMatchObject({ kpz_t72: 1.2, spz_bmp2: 0.3, spw_btr80: 0.3, spaehpz_brdm2: 0.15, gfz_tigr: 0.2, lkw_ural: 0.1, eloka_lkw: 0.5, moerser_trupp: 0.1 });
    expect(b.munition_eur).toEqual({ LM: 100000, MRS: 2000, PZA: 10000 });
    expect(b.fahrzeuge_mio_eur.beobachter_trupp).toBeUndefined(); // Personen und Beobachter ohne Wert
    expect(b.fehl.map((f) => f.id)).toEqual([...FEHL_IDS]);
    expect(JSON.stringify(b.fehl)).not.toMatch(/eur|€/i);
    expect(b.fuss).toContain("Spielwerte");
  });
});

describe("I1: kein gemeldetes Ziel verschwindet ohne Erklärung", () => {
  /** Zeichen des Teams (je Ziel) zur Zeit t. */
  const zeichen = (inh: Inhalte, protokoll: Parameters<typeof zustandBis>[1], t: number) => {
    const z = zustandBis(inh, protokoll, t).z;
    return { z, lb: lagebildZielmeldungen(weltFuer(inh, z), z, t) };
  };

  it("ohne Eingriff: D-03 bricht durch, Ziel 15 (BTR-80 Z-13) bleibt als „durchgebrochen“ am Westrand, Vermerk im Eingang, I-13", async () => {
    const { inh, passiv } = await laeufe();
    const z = passiv.z;
    expect(z.durchbrueche["D-03"]?.durch).toBe(true);
    const welt = weltFuer(inh, z);
    const aus = welt.ziele["Z-13"].bis_s!;
    expect(aus).toBeLessThan(1500);
    // Meldung M11 entfällt mit Grund, nicht „Ziel hat den Raum verlassen“
    expect(z.meldungen.M11.entfallen?.grund).toBe("über die Brücke ELSTER durchgebrochen");
    const v = vermerke(inh, z).find((x) => x.meldung === "M11")!;
    expect(v).toMatchObject({ art: "durchgebrochen", text: "über die Brücke ELSTER durchgebrochen" });
    expect(v.t).toBeCloseTo(aus, 0);
    // Zeichen am Westrand mit Beschriftung, voll sichtbar
    const { lb } = zeichen(inh, passiv.protokoll, aus + 5);
    const o = lb.objekte.find((x) => x.meldungen?.includes("M11"))!;
    expect(o).toBeDefined();
    expect(o.weg).toBe("durchgebrochen");
    expect(o.text).toBe("Ziel 15 durchgebrochen");
    expect(o.pos[0]).toBeCloseTo(RAND_M, 0);
    expect(o.hervor).toBe(true);
    expect(o.bahn).toBeUndefined();
    expect(z.injects["I-13"]).toBeDefined();
  });

  it("in jedem Lauf (ohne Eingriff, ARGUS allein, naiv, ideal) bleibt jedes Zeichen bis Spielende; wer den Raum verlässt, hat einen Vermerk", async () => {
    const { inh, passiv, argus, teams } = await laeufe();
    const liste = [
      { name: "ohne Eingriff", z: passiv.z, protokoll: passiv.protokoll },
      { name: "ARGUS allein", z: argus.z, protokoll: argus.protokoll },
      ...teams.map((m) => ({ name: m.opt.team, z: m.z, protokoll: m.kanal.protokoll })),
    ];
    for (const l of liste) {
      const fehlt: string[] = [];
      let vorher = new Set<string>();
      for (let t = 0; t <= 1500; t += 10) {
        const { z, lb } = zeichen(inh, l.protokoll, t);
        const jetzt = new Set(lb.objekte.filter((o) => !o.art).map((o) => o.id));
        for (const id of vorher) if (!jetzt.has(id)) fehlt.push(`${l.name} ${t} s: ${id}`);
        vorher = jetzt;
        void z;
      }
      expect(fehlt, l.name).toEqual([]);
      // jedes Zeichen am Rand („durchgebrochen“, „abgezogen“) hat einen Vermerk zu einer seiner Meldungen
      const z = l.z;
      const lb = lagebildZielmeldungen(weltFuer(inh, z), z, 1500);
      const vm = vermerke(inh, z);
      for (const o of lb.objekte.filter((x) => x.weg)) {
        expect(vm.some((v) => o.meldungen?.includes(v.meldung) && v.art === o.weg), `${l.name} ${o.text}`).toBe(true);
      }
    }
  }, 60000);
});

describe("I3: die PT-91 kämpfen sichtbar mit und werden aufgelöst", () => {
  it("ohne Eingriff: E-01 ab 20:45 alle 20 s auf das erste stehende Feindfahrzeug an der Brücke Ost, sichtbar mit Leuchtspur", async () => {
    const { inh, passiv } = await laeufe();
    const z = passiv.z;
    const e01 = inh.szenario.ereignisse[0];
    expect(e01.wirkungen[0].t_s).toBe(1245);
    expect(e01.wirkungen.map((w) => w.t_s)).toEqual(e01.wirkungen.map((_, i) => 1245 + 20 * i));
    const getroffen = Object.entries(z.ereignisse["E-01"].wirkungen).filter(([, w]) => w.wirkt);
    expect(getroffen.length).toBeGreaterThanOrEqual(3);
    // nach der Meldung M20 (20:15): erst schießen, nachdem ARGUS die PT-91 gemeldet hat (S3 bleibt Falle)
    expect(Math.min(...getroffen.map(([, w]) => w.t_s))).toBeGreaterThan(inh.meldungen.M20.t_s);
    for (const [, w] of getroffen) {
      const ziel = weltFuer(inh, z).ziele[w.ziel!];
      const p = position(ziel, w.t_s);
      expect(p[0] >= e01.bereich!.x[0] && p[0] <= e01.bereich!.x[1] && p[1] >= e01.bereich!.y[0] && p[1] <= e01.bereich!.y[1], w.ziel).toBe(true);
      expect(z.zerstoertDurch[w.ziel!]).toBe("E-01");
    }
    const fx = effekte(weltFuer(inh, z), z, bekannteZiele(weltFuer(inh, z), z));
    for (const [nr] of getroffen) {
      expect(fx.some((e) => e.id === `E-01-${nr}-m`), `Mündungsfeuer ${nr}`).toBe(true);
      expect(fx.some((e) => e.id === `E-01-${nr}-s`), `Leuchtspur ${nr}`).toBe(true);
      expect(fx.some((e) => e.id === `E-01-${nr}-x`), `Treffer ${nr}`).toBe(true);
    }
  });

  it("ohne Freigabe bis 21:45: als verbündet erkannt – Zeichen blau, Meldung aus dem Eingang mit Vermerk, I-17, danach keine Freigabe", async () => {
    const { inh, passiv } = await laeufe();
    const z = passiv.z;
    expect(z.aufloesungen["A-01"].t_s).toBeCloseTo(1305, 1);
    expect(z.meldungen.M20).toMatchObject({ stufe: "erledigt", aufgeloest: { als: "verbuendet", aufloesung: "A-01" } });
    expect(z.injects["I-17"].erschienen.t_s).toBeCloseTo(1305, 1);
    expect(z.injects["I-17"].text ?? inh.injects["I-17"].text).toBe("PL-PzKp: Feuerstellung Feldweg Süd bezogen, bekämpfen Feind an der Brücke Ost.");
    expect(vermerke(inh, z).find((v) => v.meldung === "M20")).toMatchObject({ art: "verbuendet", text: "verbündet – nicht bekämpfen" });
    const vorher = lagebildZielmeldungen(weltFuer(inh, zustandBis(inh, passiv.protokoll, 1300).z), zustandBis(inh, passiv.protokoll, 1300).z, 1300);
    const v0 = vorher.objekte.find((o) => o.meldungen?.includes("M20"))!;
    expect(v0.sidc[1]).toBe("H"); // bis dahin wie ARGUS meldet: Feind
    const lb = lagebildZielmeldungen(weltFuer(inh, z), z, 1320);
    const o = lb.objekte.find((x) => x.meldungen?.includes("M20"))!;
    expect(o.verbuendet).toBe(true);
    expect(o.sidc.slice(0, 2)).toBe("SF");
    expect(o.text).toBe("PL-PzKp (verbündet)");
    expect(o.hervor).toBe(true);
    // keine Freigabe mehr: die Engine lehnt BEKÄMPFEN ab
    const { verarbeiteAktion } = await import("../src/engine/aktionen");
    const erg = verarbeiteAktion(inh, z, { id: "x", typ: "entscheid", von: { rolle: "zb", client: "t", name: "t" }, ts: 0, daten: { meldung: "M20", entscheid: "bekaempfen", wirkmittel: "PZA" } }, 1320);
    expect(erg.ok).toBe(false);
  });

  it("Freigabe vorher (naiv): Eigenbeschuss I-08a, E-01 bricht ab, Zeichen „verbündet, getroffen“; Auswertung S3 falsch, ideal S3 richtig", async () => {
    const { inh, teams } = await laeufe();
    const [naiv, ideal] = teams;
    expect(naiv.z.meldungen.M20.wirkung).toBeDefined();
    expect(naiv.z.injects["I-08a"]).toBeDefined();
    expect(naiv.z.aufloesungen["A-01"]).toBeUndefined();
    const lb = lagebildZielmeldungen(weltFuer(inh, naiv.z), naiv.z, 1400);
    const o = lb.objekte.find((x) => x.meldungen?.includes("M20"))!;
    expect(o.text).toBe("PL-PzKp (verbündet, getroffen)");
    expect(o.sidc.slice(0, 2)).toBe("SF");
    const a = auswerten(inh, teams.map((m, i) => ({ id: `t${i}`, name: m.name, farbe: "#888", zustand: m.z, protokoll: m.kanal.protokoll })));
    expect(a.teams[0].faelle.S3.ausgang).toBe("falsch");
    // ideal ist bis 21:45 nicht bei M20 (Rückstau): nicht freigegeben = richtig (I3.3), aufgelöst
    expect(ideal.z.meldungen.M20.aufgeloest).toBeDefined();
    expect(a.teams[1].faelle.S3).toMatchObject({ ausgang: "richtig", zeilen: ["ohne Entscheidung", "21:45 als verbündet erkannt"] });
  });
});

describe("I4: Lagemeldungen verschwinden ganz", () => {
  it("sichtbar, bis angeklickt oder 30 s Spielzeit um sind; die Spielleitung sieht weiter alle", async () => {
    const { inh, passiv } = await laeufe();
    const z: Spielzustand = passiv.z;
    const alle = z.injectReihenfolge.map((id) => z.injects[id]);
    const i04 = z.injects["I-04"];
    expect(feedSichtbar(inh, alle, i04.erschienen.t_s + 29).map((i) => i.id)).toContain("I-04");
    expect(feedSichtbar(inh, alle, i04.erschienen.t_s + 30).map((i) => i.id)).not.toContain("I-04");
    const gelesen = alle.map((i) => (i.id === "I-04" ? { ...i, quittiert: { t_s: i04.erschienen.t_s + 3, seq: 1 } } : i)) as typeof alle;
    expect(feedSichtbar(inh, gelesen, i04.erschienen.t_s + 5).map((i) => i.id)).not.toContain("I-04");
    // die neueste oben
    const t = 1400;
    const s = feedSichtbar(inh, alle, t);
    expect(s.map((i) => i.erschienen.t_s)).toEqual([...s.map((i) => i.erschienen.t_s)].sort((a, b) => b - a));
  });

  it("Auswertung S3: I-04 „gelesen nach x s“ oder „ungelesen verschwunden“", async () => {
    const { inh, teams } = await laeufe();
    const { zeitleiste } = await import("../src/kern/auswertung");
    const a = auswerten(inh, teams.map((m, i) => ({ id: `t${i}`, name: m.name, farbe: "#888", zustand: m.z, protokoll: m.kanal.protokoll })));
    const s3 = a.faelle.find((f) => f.id === "S3")!;
    const naiv = zeitleiste(inh, a.teams[0], s3).find((x) => x.art === "gelesen")!;
    const ideal = zeitleiste(inh, a.teams[1], s3).find((x) => x.art === "gelesen")!;
    expect(naiv.text).toMatch(/I-04 .* – ungelesen verschwunden \(nach 30 s\)$/);
    expect(naiv.klasse).toBe("ungelesen");
    expect(ideal.text).toMatch(/I-04 .* – gelesen nach 20 s$/);
  });
});

describe("G2: Referenzlauf „ARGUS allein“ und Bilanz", () => {
  it("ARGUS allein: schneller als beide Modellteams, alle vier Panzer einsatzbereit, mehr zerstört als das ideale Team – mit Fehlbekämpfungen", async () => {
    const { inh, argus, teams } = await laeufe();
    const b = bilanz(inh, argus.z)!;
    const naiv = bilanz(inh, teams[0].z)!;
    const ideal = bilanz(inh, teams[1].z)!;
    expect(b.medianS!).toBeLessThan(naiv.medianS!);
    expect(b.medianS!).toBeLessThan(ideal.medianS!);
    expect(b.hingeschautS).toBe(0);
    expect(b.panzer).toEqual({ bereit: 4, gesamt: 4 });
    expect(b.fahrzeuge).toBeGreaterThan(ideal.fahrzeuge);
    expect(b.wertMio).toBeGreaterThan(ideal.wertMio);
    expect(b.fehlSumme).toBeGreaterThan(0);
    expect(ideal.fehlSumme).toBe(0);
    for (const k of ["sanitaet", "kamerateam", "verwundete", "verbuendet", "attrappe"] as const) expect(b.fehl[k], k).toBeGreaterThan(0);
  });

  it("Bilanz = Summe der zerstörten Feindfahrzeuge × Spielwert, Munition = Einschläge × Preis (je Lauf)", async () => {
    const { inh, argus, passiv, teams } = await laeufe();
    const r = inh.regeln.bilanz!;
    for (const [name, z] of [["ARGUS allein", argus.z], ["ohne Eingriff", passiv.z], ["naiv", teams[0].z], ["ideal", teams[1].z]] as const) {
      const b = bilanz(inh, z)!;
      const w = weltFuer(inh, z);
      expect(b.wertMio, name).toBeCloseTo(b.fahrzeugIds.reduce((a, id) => a + r.fahrzeuge_mio_eur[w.ziele[id].typ], 0), 6);
      expect(b.munitionEur, name).toBe(Object.entries(b.schuss).reduce((a, [wm, n]) => a + n * r.munition_eur[wm], 0));
      // nur eigene Wirkungen zählen: jedes Fahrzeug ist durch eine Meldung des Laufs zerstört
      for (const id of b.fahrzeugIds) expect(z.zerstoertDurch[id], `${name} ${id}`).toMatch(/^M\d+|^V\d-M\d/);
    }
    expect(bilanz(inh, passiv.z)).toMatchObject({ fahrzeuge: 0, wertMio: 0, munitionEur: 0, hingeschautS: null, fehlSumme: 0 });
    void zielNummer;
  });
});
