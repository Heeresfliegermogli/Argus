// Szenario 2.9 (Änderungsliste P vom 16.11.2026, Test mit vier Rechnern): 2. statt 1. Kompanie (P1), Zeichen „Kampfpanzer, schwer“ (P2),
// Kanone nur bis zum Ortsanfang KRÄHE als harte Grenze (P3), Lagemeldungen passend zum Geschehen (P4: nur gemeldete Kräfte brechen durch,
// I-13 nennt sie, Varianten mit Behauptung, Befund von Lt Mann als Test P4.6).
import ms from "milsymbol";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { verarbeiteAktion } from "../src/engine/aktionen";
import { argusAllein } from "../src/engine/referenzlauf";
import type { Behauptung, Inhalte } from "../src/inhalte/typen";
import { abweichungen, durchBis, gemeldetAb } from "../src/kern/behauptung";
import { durchbruchGruppen, durchbruchStand } from "../src/kern/durchbruch";
import type { Aktion } from "../src/kern/ereignisse";
import { ZEICHEN_EIGENER_PANZER, ZEICHEN_EIGENER_PANZER_AUS, eigeneLage, lagebildZielmeldungen } from "../src/kern/lagebild";
import { weltFuer } from "../src/kern/lage";
import { einschlaege, harteGrenze, vorhersage, wirkungBeimEinschlag } from "../src/kern/regeln";
import { zielNr } from "../src/kern/zielnummern";
import { type Spielzustand, zustandAus } from "../src/kern/zustand";
import { inhalte } from "./hilfen";
import { type DrehbuchReferenz, type ModellOptionen, type Modellteam, drehbuchTeams, spieleDurch } from "./modellteam";

const ref = JSON.parse(readFileSync(new URL("./referenz_durchlauf.json", import.meta.url), "utf-8")) as DrehbuchReferenz;

let laeufe: { name: string; m: Modellteam }[] | null = null;
/** naiv, ideal, naiv + V-1…V-4, ideal + V-1…V-4, naiv + V-1…V-5, ohne Eingriff, naiv ohne M38 (P4.6) */
async function lauf(): Promise<{ name: string; m: Modellteam }[]> {
  if (laeufe) return laeufe;
  const inh = await inhalte();
  const teams: { name: string; opt: ModellOptionen }[] = [
    ...drehbuchTeams(ref),
    { name: "ohne", opt: { team: "naiv", ohne: true } },
    { name: "naiv-ohne-M38", opt: { team: "naiv", auslassen: ["M38"], dauer: ref.zeiten.naiv } },
  ];
  laeufe = spieleDurch(inh, teams).map((m, i) => ({ name: teams[i].name, m }));
  return laeufe;
}

const SYS = { rolle: "zb" as const, client: "zbtest", name: "Team" };
function aktion(typ: Aktion["typ"], daten: unknown, t: number): Aktion {
  return { id: `a${t}`, typ, von: SYS, ts: 1_000_000 + t * 1000, daten } as Aktion;
}

describe("P1 · 2. statt 1. Kompanie", () => {
  it("eigene Truppe 2./PzBtl 613 („2. Kp“), Fahrzeuge 1/1–1/4; Absender der Lage- und Druckmeldungen und Wirkmittel nennen die 2. Kp", async () => {
    const inh = await inhalte();
    expect(inh.szenario.version).toBe("2.9");
    const et = inh.szenario.eigene_truppe!;
    expect([et.einheit, et.kompanie, et.name]).toEqual(["2./PzBtl 613", "2. Kompanie Panzerbataillon 613", "2. Kp"]);
    expect(et.panzer.map((p) => p.name)).toEqual(["1/1", "1/2", "1/3", "1/4"]);
    expect(inh.szenario.verluste!.meldungen!.von).toBe("2. Kp");
    expect(inh.wirkmittel.PZA.name).toBe("2. Kp (Kanone 120 mm)");
    for (const id of ["I-06", "I-07", "I-11", "I-12", "I-13"]) expect(inh.injects[id].von, id).toBe("2. Kp");
    // Leitfrage der Diskussion (M3.2): „Druck der 2. Kp“
    expect(JSON.stringify(inh.szenario.auswertung)).toContain("Druck der 2. Kp");
    const roh = JSON.stringify([inh.szenario, inh.regeln, inh.wirkmittel, inh.fahrzeuge]);
    expect(roh).not.toMatch(/(?<![\d/.])1\. ?Kp\b|1\.\/PzBtl|1\. Kompanie/);
  });
});

describe("P2 · Zeichen der eigenen Panzer: Kampfpanzer, schwer", () => {
  it("SFGPEVATH (ausgefallen SFGDEVATH), milsymbol zeichnet es gültig mit drei Strichen; Lagebild aller Rollen nutzt es", async () => {
    expect(ZEICHEN_EIGENER_PANZER).toBe("SFGPEVATH------");
    expect(ZEICHEN_EIGENER_PANZER_AUS).toBe("SFGDEVATH------");
    for (const s of [ZEICHEN_EIGENER_PANZER, ZEICHEN_EIGENER_PANZER_AUS]) expect(new ms.Symbol(s, { size: 30 }).isValid(), s).toBe(true);
    // „schwer“ unterscheidet sich vom Kampfpanzer ohne Klasse (drei Striche in der Kette)
    expect(new ms.Symbol(ZEICHEN_EIGENER_PANZER, { size: 30 }).asSVG()).not.toBe(new ms.Symbol("SFGPEVAT-------", { size: 30 }).asSVG());
    const inh = await inhalte();
    const el = eigeneLage(inh, zustandAus([], inh), 0)!;
    expect(el.panzer.map((p) => [p.name, p.sidc])).toEqual(["1/1", "1/2", "1/3", "1/4"].map((n) => [n, ZEICHEN_EIGENER_PANZER]));
    expect(el.panzer[0].zeilen[0]).toBe("2./PzBtl 613 · Kampfpanzer");
  });
});

describe("P3 · Kanone nur bis zum Ortsanfang KRÄHE (harte Grenze)", () => {
  it("Grenze in den Daten: x = 500 m, hart, „nur bis Ortsanfang KRÄHE“; R3 nennt nur noch LM", async () => {
    const inh = await inhalte();
    expect(inh.wirkmittel.PZA.einsatzbereich).toMatchObject({ x_max: 500, hart: true, kurz: "nur bis Ortsanfang KRÄHE" });
    expect(harteGrenze(inh.wirkmittel.PZA)).toBe(500);
    expect(harteGrenze(inh.wirkmittel.LM)).toBeNull();
    expect(inh.regeln.einsatzregeln.regeln.find((r) => r.id === "R3")!.text).toContain("(LM)");
    expect(inh.regeln.einsatzregeln.regeln.find((r) => r.id === "R3")!.text).not.toContain("Kanone");
  });

  it("Ziel jenseits der Linie (M30, Beobachter am Nordrand der Ortschaft): nicht wählbar, die Engine lehnt ab, kein Einschlag", async () => {
    const inh = await inhalte();
    const m = inh.meldungen.M30;
    const z = zustandAus([], inh);
    const v = vorhersage(inh, m, "PZA", m.t_s + 20);
    expect(v.waehlbar).toBe(false);
    expect(v.k).toBe(0);
    expect(v.teile).toHaveLength(0);
    expect(v.pruefung.verstoesse.map((x) => x.text)).toContain("außer Reichweite (nur bis Ortsanfang KRÄHE)");
    expect(einschlaege(inh, m.ziele, "PZA", m.t_s + 20)).toEqual([]);
    // LM und Mörser bleiben wählbar
    expect(vorhersage(inh, m, "LM", m.t_s + 20).waehlbar).toBe(true);
    // Engine: BEKÄMPFEN mit Kanone wird abgelehnt (Protokoll „aktion_abgelehnt … außer Reichweite“)
    const zz = { ...z, meldungen: { M30: { id: "M30", erschienen: { seq: 1, t_s: m.t_s }, manuell: false, stufe: "offen", zurueckgestellt: false, verlauf: [1] } }, reihenfolge: ["M30"], seq: 2 } as unknown as Spielzustand;
    const r = verarbeiteAktion(inh, zz, aktion("entscheid", { meldung: "M30", entscheid: "bekaempfen", wirkmittel: "PZA" }, m.t_s + 20), m.t_s + 20);
    expect(r).toEqual({ ok: false, grund: "Kanone außer Reichweite – nur bis Ortsanfang KRÄHE" });
    // jenseits der Linie wirkt die Kanone nie (auch nicht aus einem älteren Protokoll)
    const w = wirkungBeimEinschlag(inh, { t: m.t_s + 25, pos: [699, 220], ziel: "Z-37" }, "PZA");
    expect(w.getroffen).toEqual([]);
  });

  it("Zug teils jenseits der Linie: nur die Fahrzeuge in Reichweite, Hinweis „nur k von n in Reichweite“, im Protokoll ausser_reichweite", async () => {
    const inh = await inhalte();
    const m = inh.meldungen.M15; // drei SPz der Achse NORD auf dem Weg zur Furt
    let t = m.t_s;
    let v = vorhersage(inh, m, "PZA", t);
    while (t < m.t_s + 200 && !(v.waehlbar && v.ausser.length)) v = vorhersage(inh, m, "PZA", (t += 1));
    expect(v.waehlbar).toBe(true);
    expect(v.ausser.length).toBeGreaterThan(0);
    expect(v.k + v.ausser.length).toBe(v.n);
    expect(v.pruefung.zulaessig).toBe(false); // wie bisher eine Warnung
    for (const x of v.teile) expect(x.einschlag.pos[0]).toBeLessThan(500);
    const zz = { ...zustandAus([], inh), meldungen: { M15: { id: "M15", erschienen: { seq: 1, t_s: m.t_s }, manuell: false, stufe: "offen", zurueckgestellt: false, verlauf: [1] } }, reihenfolge: ["M15"], seq: 2 } as unknown as Spielzustand;
    const r = verarbeiteAktion(inh, zz, aktion("entscheid", { meldung: "M15", entscheid: "bekaempfen", wirkmittel: "PZA" }, t), t);
    expect(r.ok).toBe(true);
    const d = (r as { ok: true; entwuerfe: { daten: Record<string, unknown> }[] }).entwuerfe[0].daten as { warnungen: string[]; ausser_reichweite: string[]; einschlaege?: { x: number }[]; einschlag: { pos: [number, number] } };
    expect(d.ausser_reichweite).toEqual(v.ausser);
    expect(d.warnungen.some((w) => /^nur \d von \d in Reichweite – Kanone nur bis Ortsanfang KRÄHE$/.test(w))).toBe(true);
    for (const x of d.einschlaege ?? [{ x: d.einschlag.pos[0] }]) expect(x.x).toBeLessThan(500);
  });

  it("in allen Modellläufen und bei „ARGUS allein“ schlägt die Kanone nur diesseits der Linie ein", async () => {
    const inh = await inhalte();
    const protokolle = [...(await lauf()).map((x) => x.m.kanal.protokoll), argusAllein(inh).protokoll];
    let n = 0;
    for (const p of protokolle) {
      for (const e of p) {
        if (e.typ !== "wirkung" || e.daten.wirkmittel !== "PZA") continue;
        n += 1;
        expect(e.daten.pos[0], `${e.daten.meldung}`).toBeLessThan(500);
      }
    }
    expect(n).toBeGreaterThan(5);
  });
});

describe("P4 · Meldungen passend zum Geschehen", () => {
  it("P4.2: M38 (Z-27, Z-28) kommt nur nach einer Freigabe auf die PT-91, als „Ziel 33a“; die übrigen Nummern bleiben", async () => {
    const inh = await inhalte();
    const m38 = inh.meldungen.M38;
    expect(m38).toMatchObject({ t_s: 1335, ziele: ["Z-27", "Z-28"], bedingung: { typ: "freigabe", ziele: ["Z-15", "Z-16", "Z-17"] }, loesung: { entscheid: "BEKÄMPFEN", wirkmittel: ["LM"] } });
    expect(zielNr(inh, null, "M23")).toBe("33");
    expect(zielNr(inh, null, "M24")).toBe("34"); // wie bis 2.8
    expect(zielNr(inh, null, "M38")).toBe("33a");
    const [naiv, ideal] = (await lauf()).map((x) => x.m);
    expect(naiv.z.meldungen.M38?.erschienen.t_s).toBe(1335);
    expect(zielNr(inh, naiv.z, "M38")).toBe("33a");
    expect(ideal.z.meldungen.M38).toBeUndefined();
    // M38 kommt 78 s vor dem Angriff der beiden (gemeldet_s = 60)
    const g = durchbruchGruppen(inh).filter((x) => x.ziele.some((id) => m38.ziele.includes(id)));
    for (const x of g) expect(x.t_s - m38.t_s).toBeGreaterThanOrEqual(inh.szenario.durchbruch!.gemeldet_s!);
  });

  it("P4.2: eine Gruppe, die ARGUS nicht (spätestens 60 s vorher) gemeldet hat, bricht nie durch", async () => {
    const inh = await inhalte();
    const g = durchbruchGruppen(inh).find((x) => x.id === "D-04")!;
    expect(durchbruchStand(g, inh, {}, {}, {})).toEqual({ durch: false, grund: "von ARGUS nicht gemeldet" });
    expect(durchbruchStand(g, inh, {}, {}, { "Z-27": g.t_s - 59 })).toEqual({ durch: false, grund: "von ARGUS nicht gemeldet" });
    expect(durchbruchStand(g, inh, {}, {}, { "Z-27": g.t_s - 60 })).toEqual({ durch: true });
    // ohne Eingriff: was bricht durch, ist gemeldet
    const ohne = (await lauf()).find((x) => x.name === "ohne")!.m;
    const gem = gemeldetAb(weltFuer(inh, ohne.z), ohne.z);
    for (const d of durchBis(weltFuer(inh, ohne.z), ohne.z, 1500)) expect(gem[d.ziel], d.ziel).toBeLessThanOrEqual(1500);
    expect(ohne.z.meldungen.M38).toBeUndefined();
  });

  it("P4.6 (Befund Lt Mann): Ein Team bekämpft alles, was an der Brücke gemeldet wird – keine Meldung „eingebrochen“", async () => {
    // naiv gibt die PT-91 frei (S3) und bekämpft danach auch M38; ideal bekämpft nicht die PT-91 – in beiden kein I-13, kein Durchbruch
    for (const name of ["team1", "team2", "team3", "team4", "team5"]) {
      const m = (await lauf()).find((x) => x.name === name)!.m;
      expect(m.z.injects["I-13"], name).toBeUndefined();
      expect(Object.values(m.z.durchbrueche).some((d) => d.durch), name).toBe(false);
    }
  });

  it("P4.6: Ein Team gibt die PT-91 frei und bekämpft die gemeldeten Durchbrecher nicht – I-13 mit Namen, Durchbruch auf der Karte", async () => {
    const inh = await inhalte();
    const m = (await lauf()).find((x) => x.name === "naiv-ohne-M38")!.m;
    const z = m.z;
    expect(z.meldungen.M20.wirkung).toBeDefined();
    expect(z.meldungen.M38?.entscheid).toBeUndefined();
    expect(z.durchbrueche["D-04"]).toMatchObject({ durch: true });
    const i13 = z.injects["I-13"];
    expect(i13).toBeDefined();
    const welt = weltFuer(inh, z);
    const erst = durchBis(welt, z, 1500)[0];
    expect(erst.ziel).toBe("Z-27");
    expect(i13.erschienen.t_s).toBeCloseTo(erst.t + 10, 1);
    expect(i13.text).toBe("Gegenangriff PL ausgefallen: KPz T-72 (Ziel 33a) über die Brücke ELSTER eingebrochen! Kp 4/4 einsatzbereit.");
    // auf der Karte: das Zeichen von Ziel 33a heißt „durchgebrochen“, sobald der T-72 über dem Bach ist – und folgt ihm
    const lb = lagebildZielmeldungen(welt, z, Math.ceil(erst.t));
    const o = lb.objekte.find((x) => x.meldung === "M38")!;
    expect(o.text).toBe("Ziel 33a durchgebrochen");
    expect(o.hervor).toBe(true);
    expect(o.pos[0]).toBeLessThan(440);
    expect(lagebildZielmeldungen(welt, z, Math.floor(erst.t) - 2).objekte.find((x) => x.meldung === "M38")!.text).toBe("Ziel 33a");
  });

  it("P4.4: I-11 „ein SPz brennt“ nur, wenn H-02 wirkte; I-08b „zerschlagen“ nur, wenn der Gegenangriff traf; I-08a erst nach dem Treffer", async () => {
    const l = await lauf();
    const naiv = l.find((x) => x.name === "team1")!.m.z;
    const ideal = l.find((x) => x.name === "team2")!.m.z;
    const ohne = l.find((x) => x.name === "ohne")!.m.z;
    // das naive Team zerstörte den verstärkten Zug vor 09:20 – kein „SPz brennt“
    expect(naiv.hintergrund["H-02"].wirkt).toBe(false);
    expect(naiv.injects["I-11"].text).toBe("Angriff des verstärkten Feindzuges Richtung Brücke ist zerschlagen.");
    expect(ohne.hintergrund["H-02"].wirkt).toBe(true);
    expect(ohne.injects["I-11"].text).toContain("ein SPz brennt an der Brücke Ost");
    // I-08b nur ohne Freigabe; „letzte Feindkräfte dort zerschlagen“ nur, wenn E-01 traf und an der Brücke Ost niemand mehr steht
    expect(Object.values(ideal.ereignisse["E-01"].wirkungen).some((w) => w.wirkt)).toBe(true);
    expect(ideal.injects["I-08b"].text).toBe("Gegenangriff erfolgreich: Brücke Ost genommen, letzte Feindkräfte dort zerschlagen.");
    // I-08a: 60 s nach dem Treffer, mit der Zahl der getroffenen PT-91 (die Kanone trifft alle drei)
    const tTreffer = Math.min(...(naiv.meldungen.M20.wirkungen ?? []).map((w) => w.t_einschlag));
    expect(naiv.injects["I-08a"].erschienen.t_s).toBeCloseTo(tTreffer + 60, 1);
    expect(naiv.injects["I-08a"].text).toBe("Eigenbeschuss! Drei Panzer ausgefallen, Besatzungen verwundet. Gegenangriff eingestellt. Feuer sofort einstellen!");
  });

  it("P4.5: in allen Läufen (ohne Eingriff, naiv, ideal, mit Verstärkungen, ARGUS allein, P4.6) stimmt jede Lagemeldung zur Zeit der Meldung", async () => {
    const inh = await inhalte();
    const zustaende: [string, Spielzustand][] = [...(await lauf()).map((x) => [x.name, x.m.z] as [string, Spielzustand]), ["ARGUS allein", argusAllein(inh).z]];
    let n = 0;
    for (const [name, z] of zustaende) {
      for (const id of z.injectReihenfolge) {
        const plan = inh.injects[id] as { behauptet?: Behauptung; varianten?: { behauptet: Behauptung }[] } | undefined;
        if (!plan || (!plan.behauptet && !plan.varianten)) continue;
        const st = z.injects[id];
        const nr = st.variante ?? 0;
        const b = nr ? plan.varianten![nr - 1].behauptet : plan.behauptet;
        n += 1;
        expect(abweichungen(inh, z, b, st.erschienen.t_s), `${name} ${id} „${st.text ?? ""}“`).toEqual([]);
      }
    }
    expect(n).toBeGreaterThan(60);
  });

  it("P4.1: jede Lagemeldung mit Ergebnis-Wort trägt `behauptet`; Varianten haben Behauptung und Text", async () => {
    const inh: Inhalte = await inhalte();
    const WOERTER = /brennt|zerstört|getroffen|eingebrochen|zurück|genommen|zerschlagen|ausgefallen|verletzt|bekämpft|Eigenbeschuss|Einschlag|unter Mörserfeuer|sammelt|gestört/;
    for (const i of [...inh.szenario.injects, ...inh.szenario.reserve_injects]) {
      const texte = [i.text, ...("varianten" in i ? (i.varianten ?? []).map((v) => v.text) : [])];
      if (texte.some((t) => WOERTER.test(t))) expect(i.behauptet, i.id).toBeDefined();
      for (const v of "varianten" in i ? i.varianten ?? [] : []) expect(v.behauptet && v.text, i.id).toBeTruthy();
    }
  });
});
