// Lagebild und taktische Zeichen: Die Karte zeigt jeder Rolle nur, was sie wissen darf.
import ms from "milsymbol";
import { describe, expect, it } from "vitest";
import type { Absender, Ereignis } from "../src/kern/ereignisse";
import { lagebildKontrolle, lagebildZielmeldungen } from "../src/kern/lagebild";
import { zustandAus } from "../src/kern/zustand";
import { sidc, zeichenArgus, zeichenKraft, zeichenZiel } from "../src/karte/zeichen";
import { inhalte } from "./hilfen";

const SYS: Absender = { rolle: "system" };
function protokoll(liste: [Ereignis["typ"], unknown, number][]): Ereignis[] {
  return liste.map(([typ, daten, t_s], i) => ({ seq: i + 1, typ, ts: 1_000_000 + t_s * 1000, t_s, von: SYS, daten }) as Ereignis);
}
const START: [Ereignis["typ"], unknown, number][] = [
  ["spiel_neu", { lauf: "20261125-0930-test", szenario: "kraehe-01", version: "1.3", titel: "x" }, 0],
  ["uhr", { befehl: "start", laeuft: true, t_s: 0, tempo: 1 }, 0],
];

describe("Taktische Zeichen", () => {
  it("jeder Katalogtyp ergibt ein gültiges Zeichen", async () => {
    const inh = await inhalte();
    for (const f of Object.values(inh.fahrzeuge)) {
      expect(f.symbol.sidc, f.id).toBeTruthy();
      for (const z of ["H", "F", "N", "U"] as const) {
        const code = sidc(z, f.symbol.sidc!, { groesse: f.symbol.groesse });
        expect(code, `${f.id} ${z}`).toHaveLength(15);
        expect(new ms.Symbol(code).isValid(), `${f.id} ${code}`).toBe(true);
      }
    }
  });

  it("ARGUS-Zeichen: Klasse → Feind, UNKLAR → unbekannt; Ground Truth auf der Kontrollkarte", async () => {
    const inh = await inhalte();
    expect(zeichenArgus(inh, "KPz T-72", 96)).toBe("SHGPEVAT-------");
    expect(zeichenArgus(inh, "Fahrzeug unbekannt", 54)).toBe("SUGPEV---------");
    expect(zeichenArgus(inh, "SPW BTR-80", 91, "X")).toBe("SHGXEVAA-------");
    expect(zeichenZiel(inh, inh.ziele["Z-15"], false)).toBe("SFGPEVAT-------"); // PT-91 verbündet
    expect(zeichenZiel(inh, inh.ziele["Z-12"], false)).toBe("SHGPEVUA-------"); // Sanität
    expect(zeichenZiel(inh, inh.ziele["Z-22"], false)).toBe("SNGPEVCF-------"); // Traktor zivil
    expect(zeichenZiel(inh, inh.ziele["Z-24"], false)).toBe("SHGDEVAT-------"); // außer Gefecht
    expect(zeichenZiel(inh, inh.ziele["Z-01"], true)).toBe("SHGXUCRVA------"); // zerstört
    expect(zeichenKraft(inh, "pzgren_kp", "eigen")).toBe("SFGPUCIZ---E---");
    const attrappe = zeichenZiel(inh, inh.ziele["Z-07"], false);
    expect(attrappe).toBe("SHGPEVAT--G----"); // Attrappe: Täuschungszeichen über dem Feindzeichen
    expect(new ms.Symbol(attrappe).isValid()).toBe(true);
  });
});

describe("Lagebild G2/G3", () => {
  it("G2 sieht nur angenommene oder Fast-Track-Meldungen an der gemeldeten Position", async () => {
    const inh = await inhalte();
    const z = zustandAus(protokoll([
      ...START,
      ["meldung", { meldung: "M01" }, 60],
      ["meldung", { meldung: "M02" }, 150],
      ["meldung", { meldung: "M03" }, 240],
      ["g1_entscheid", { meldung: "M01", entscheid: "annehmen" }, 70],
      ["g1_entscheid", { meldung: "M02", entscheid: "ablehnen" }, 160],
      ["meldung", { meldung: "M20", fast_track: true }, 1215],
    ]), inh);
    const lb = lagebildZielmeldungen(inh, z, "g2");
    expect(lb.objekte.map((o) => o.id).sort()).toEqual(["Z-01–02", "Z-15–17"]);
    expect(lb.personen).toEqual([]);
    const pt = lb.objekte.find((o) => o.id === "Z-15–17")!;
    expect(pt.sidc).toBe("SHGPEVAT-------"); // ARGUS meint T-72 – G2 sieht keinen Verbündeten
    expect(pt.menge).toBe(3);
    expect(pt.zustand).toBe("offen");
    expect(pt.pos.map(Math.round)).toEqual([477, 617]);
    expect(JSON.stringify(lb)).not.toMatch(/verb[uü]ndet|PT-91|Twardy/);
    // G3 sieht noch nichts: keine Empfehlung von G2
    expect(lagebildZielmeldungen(inh, z, "g3").objekte).toEqual([]);
  });

  it("Folgemeldung zum selben Ziel ergibt ein Zeichen, bekämpft wird als zerstört gezeigt", async () => {
    const inh = await inhalte();
    const z = zustandAus(protokoll([
      ...START,
      ["meldung", { meldung: "M18" }, 1095],
      ["g1_entscheid", { meldung: "M18", entscheid: "annehmen" }, 1100],
      ["g2_empfehlung", { meldung: "M18", empfehlung: "beobachten" }, 1110],
      ["meldung", { meldung: "M23" }, 1320],
      ["g1_entscheid", { meldung: "M23", entscheid: "annehmen" }, 1325],
      ["g2_empfehlung", { meldung: "M23", empfehlung: "bekaempfen", wirkmittel: "LM" }, 1330],
      ["g3_entscheid", { meldung: "M23", entscheid: "freigabe", wirkmittel: "LM" }, 1340],
      ["wirkung", { meldung: "M23", wirkmittel: "LM", pos: [768, 305], t_freigabe: 1340, getroffen: [{ ziel: "Z-19", was: "fahrzeug", kategorie: "feind" }] }, 1380],
    ]), inh);
    const g2 = lagebildZielmeldungen(inh, z, "g2");
    expect(g2.objekte).toHaveLength(1);
    expect(g2.objekte[0].text).toBe("Ziel 18/23"); // Zielnummern statt M18/M23 (B7)
    expect(g2.objekte[0].zustand).toBe("bekaempft");
    expect(g2.objekte[0].sidc[3]).toBe("X");
    expect(g2.wirkungen.map((w) => w.id)).toEqual(["W-M23"]);
    expect(g2.wirkungen[0].zeilen.join(" ")).not.toMatch(/getroffen/); // kein Ergebnis für G2
    const g3 = lagebildZielmeldungen(inh, z, "g3");
    expect(g3.objekte.map((o) => o.meldungen)).toEqual([["M23"]]); // M18 kam nie bei G3 an
  });
});

describe("Tracking (Schritt 7)", () => {
  it("die Spur folgt dem ersten noch stehenden Fahrzeug, zeigt die ARGUS-Klasse und bleibt nach der Wirkung am Wrack", async () => {
    const inh = await inhalte();
    const vorher = zustandAus(protokoll([
      ...START,
      ["meldung", { meldung: "M01" }, 20],
      ["g1_entscheid", { meldung: "M01", entscheid: "annehmen" }, 60],
    ]), inh);
    const lb = lagebildZielmeldungen(inh, vorher, "g2", 100);
    const o = lb.objekte.find((x) => x.meldung === "M01")!;
    expect(o.bahn).toBeDefined();
    expect(o.pos).toEqual([926, 322]); // Z-01 hält an der Hauptstraße
    expect(o.sidc).toBe(lagebildZielmeldungen(inh, vorher, "g2").objekte.find((x) => x.meldung === "M01")!.sidc); // ARGUS-Klasse, nicht Ground Truth
    expect(o.menge).toBe(2);
    expect(lagebildZielmeldungen(inh, vorher, "g1", 100).objekte.map((x) => x.meldung)).toEqual(["M01"]); // auch G1 (Karte ab 6b)

    // Mörser auf M01: trifft Z-01 um 175 am Einschlagort; Z-02 fährt weiter, die Spur bleibt am Wrack
    const nachher = zustandAus(protokoll([
      ...START,
      ["meldung", { meldung: "M01" }, 20],
      ["g1_entscheid", { meldung: "M01", entscheid: "annehmen" }, 60],
      ["g2_empfehlung", { meldung: "M01", empfehlung: "bekaempfen", wirkmittel: "MRS" }, 110],
      ["g3_entscheid", { meldung: "M01", entscheid: "freigabe", wirkmittel: "MRS", einschlag: { t: 175, pos: [926, 322], ziel: "Z-01" } }, 140],
      ["wirkung", { meldung: "M01", wirkmittel: "MRS", pos: [926, 322], t_freigabe: 140, t_einschlag: 175, ziel: "Z-01",
        getroffen: [{ ziel: "Z-01", was: "fahrzeug", kategorie: "feind" }] }, 175],
    ]), inh);
    const w = lagebildZielmeldungen(inh, nachher, "g2", 230).objekte.find((x) => x.meldung === "M01")!;
    expect(w.zerstoert).toBe(true);
    expect(w.sidc[3]).toBe("X");
    expect(w.bahn?.halt).toBe(175);
    expect(w.pos).toEqual([926, 322]);
    // geplante Wirkung vor dem Einschlag: am vorausberechneten Ort
    const geplant = zustandAus(protokoll([
      ...START,
      ["meldung", { meldung: "M01" }, 20],
      ["g1_entscheid", { meldung: "M01", entscheid: "annehmen" }, 60],
      ["g2_empfehlung", { meldung: "M01", empfehlung: "bekaempfen", wirkmittel: "LM" }, 110],
      ["g3_entscheid", { meldung: "M01", entscheid: "freigabe", wirkmittel: "LM", einschlag: { t: 181.2, pos: [926, 322], ziel: "Z-01" } }, 140],
    ]), inh);
    const gw = lagebildZielmeldungen(inh, geplant, "g3", 150).wirkungen.find((x) => x.geplant)!;
    expect(gw.pos).toEqual([926, 322]);
    expect(gw.text).toMatch(/LM · 03:01$/); // Spieluhr 00:00–25:00 (B4)
  });

  it("ein fahrendes Ziel: Bahn = Route, Position zur Lagezeit", async () => {
    const inh = await inhalte();
    const z = zustandAus(protokoll([...START, ["meldung", { meldung: "M03" }, 240], ["g1_entscheid", { meldung: "M03", entscheid: "annehmen" }, 250]]), inh);
    const o = lagebildZielmeldungen(inh, z, "g2", 300).objekte.find((x) => x.meldung === "M03")!;
    const id = inh.meldungen.M03.ziele[0];
    expect(o.bahn?.route).toEqual(inh.ziele[id].bewegung?.route ?? [[0, ...inh.ziele[id].pos]]);
    expect(o.zeilen[0]).toMatch(/gemeldet .* · jetzt /);
  });
});

describe("Kontrollkarte", () => {
  it("zeigt ungemeldete Ziele, Personen und Ground Truth zur Lagezeit", async () => {
    const inh = await inhalte();
    const z = zustandAus(protokoll(START), inh);
    const frueh = lagebildKontrolle(inh, z, 100);
    expect(frueh.objekte.some((o) => o.id === "Z-27")).toBe(false);
    const spaet = lagebildKontrolle(inh, z, 1300);
    const z27 = spaet.objekte.find((o) => o.id === "Z-27")!;
    expect(z27.ungemeldet).toBe(true);
    expect(spaet.objekte.find((o) => o.id === "Z-15")!.kategorie).toBe("verbuendet");
    expect(spaet.objekte.some((o) => o.id === "Z-12")).toBe(false); // hat den Raum um 10:16:40 verlassen
    const zivil = spaet.personen.find((p) => p.id.startsWith("Z-19") && p.art === "zivil")!;
    expect(zivil.anzahl).toBe(4);
    expect(zivil.klein).toBe(2);
  });

  it("Wirkung: Wrack bleibt stehen, getroffene Personen und Fehlbekämpfung sind markiert", async () => {
    const inh = await inhalte();
    const z = zustandAus(protokoll([
      ...START,
      ["meldung", { meldung: "M18" }, 1095],
      ["g1_entscheid", { meldung: "M18", entscheid: "annehmen" }, 1100],
      ["g2_empfehlung", { meldung: "M18", empfehlung: "bekaempfen", wirkmittel: "LM" }, 1110],
      ["g3_entscheid", { meldung: "M18", entscheid: "freigabe", wirkmittel: "LM" }, 1120],
      ["wirkung", { meldung: "M18", wirkmittel: "LM", pos: [768, 305], t_freigabe: 1120, getroffen: [
        { ziel: "Z-19", was: "fahrzeug", kategorie: "feind" }, { ziel: "Z-19", was: "personen", kategorie: "soldat", anzahl: 5 },
        { ziel: "Z-19", was: "personen", kategorie: "zivil", anzahl: 4 }] }, 1240],
    ]), inh);
    const lb = lagebildKontrolle(inh, z, 1400);
    const mrs = lb.objekte.find((o) => o.id === "Z-19")!;
    expect(mrs.zustand).toBe("bekaempft");
    // Sprite wechselt zur Spielzeit der Zerstörung auf das Wrack (die Karte wählt je Bild)
    expect(mrs.sprite).toMatchObject({ name: "moerser_trupp.png", wrack: "moerser_trupp_wrack.png", wrackAb: 1240 });
    expect(lb.personen.find((p) => p.art === "zivil")!.getroffen).toBe(true);
    expect(lb.wirkungen[0].fehl).toBe(true);
    expect(lb.wirkungen[0].zeilen[1]).toMatch(/4 Zivilpersonen/);
  });

  it("Schutzzeichen: Sanitätsfahrzeug trägt das Rote Kreuz, andere nicht", async () => {
    const inh = await inhalte();
    const lb = lagebildKontrolle(inh, zustandAus(protokoll(START), inh), 800);
    expect(lb.objekte.find((o) => o.id === "Z-12")!.schutz).toBe("rotes_kreuz");
    expect(lb.objekte.filter((o) => o.schutz).map((o) => o.id)).toEqual(["Z-12"]);
  });
});

describe("Freigegebene Wirkung (Vorlaufzeit läuft)", () => {
  it("erscheint bei G2, G3 und SL als geplante Wirkung mit Einschlagzeit und verschwindet mit der Wirkung", async () => {
    const inh = await inhalte();
    const bis: [Ereignis["typ"], unknown, number][] = [
      ...START,
      ["meldung", { meldung: "M01" }, 60],
      ["g1_entscheid", { meldung: "M01", entscheid: "annehmen" }, 70],
      ["g2_empfehlung", { meldung: "M01", empfehlung: "bekaempfen", wirkmittel: "MRS" }, 80],
      ["g3_entscheid", { meldung: "M01", entscheid: "freigabe", wirkmittel: "MRS" }, 95],
    ];
    const z = zustandAus(protokoll(bis), inh);
    for (const lb of [lagebildZielmeldungen(inh, z, "g2"), lagebildZielmeldungen(inh, z, "g3"), lagebildKontrolle(inh, z, 100)]) {
      expect(lb.wirkungen).toHaveLength(1);
      expect(lb.wirkungen[0].geplant).toBe(true);
      expect(lb.wirkungen[0].radius_m).toBe(80);
      expect(lb.wirkungen[0].text).toBe("Ziel 1 Mrs · 02:10"); // Freigabe 01:35 + 35 s bis zum Einschlag
    }
    const nach = zustandAus(protokoll([...bis,
      ["wirkung", { meldung: "M01", wirkmittel: "MRS", pos: [880, 300], t_freigabe: 95, getroffen: [{ ziel: "Z-01", was: "fahrzeug", kategorie: "feind" }] }, 185],
    ]), inh);
    const lb = lagebildKontrolle(inh, nach, 190);
    expect(lb.wirkungen.map((w) => !!w.geplant)).toEqual([false]);
  });
});
