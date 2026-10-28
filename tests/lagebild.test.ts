// Lagebild und taktische Zeichen: Die Karte zeigt jeder Rolle nur, was sie wissen darf.
import ms from "milsymbol";
import { describe, expect, it } from "vitest";
import type { Absender, Ereignis } from "../src/kern/ereignisse";
import { lagebildKontrolle, lagebildZielmeldungen } from "../src/kern/lagebild";
import { zustandAus } from "../src/kern/zustand";
import { ZEICHEN_KONTAKT, sidc, zeichenArgus, zeichenKraft, zeichenZiel } from "../src/karte/zeichen";
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
    // C7 (2.2): zugweise Meldung → Zeichen der Einheit mit Größenangabe nach APP-6 (●● Halbzug/Trupp, ●●● Zug)
    expect(zeichenArgus(inh, "KPz T-72", 91, "P", 3)).toBe("SHGPUCA----D---");
    expect(zeichenArgus(inh, "SPz BMP-2", 87, "P", 2)).toBe("SHGPUCIZ---C---");
    expect(zeichenArgus(inh, "Spähpanzer BRDM-2", 94, "P", 2)).toBe("SHGPUCRVA--C---");
    expect(zeichenArgus(inh, "Fahrzeug unbekannt", 54, "P", 2)).toBe("SUGPEV---------");
    for (const code of ["SHGPUCA----D---", "SHGPUCIZ---C---", ZEICHEN_KONTAKT]) expect(new ms.Symbol(code).isValid(), code).toBe(true);
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
    expect(pt.sidc).toBe("SHGPUCA----D---"); // ARGUS meint drei T-72 (Panzerzug, C7) – G2 sieht keinen Verbündeten
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
    expect(g2.objekte[0].text).toBe("Ziel 21/26"); // Zielnummern statt M18/M23 (B7; seit 2.2 drei Meldungen mehr davor)
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
    expect(o.pos).toEqual([772, 440]); // Z-01 hält östlich der Schule (Spähtrupp HAUPT, seit 2.1)
    expect(o.sidc).toBe(lagebildZielmeldungen(inh, vorher, "g2").objekte.find((x) => x.meldung === "M01")!.sidc); // ARGUS-Klasse, nicht Ground Truth
    expect(o.menge).toBe(2);
    expect(lagebildZielmeldungen(inh, vorher, "g1", 100).objekte.filter((x) => !x.art).map((x) => x.meldung)).toEqual(["M01"]); // auch G1 (Karte ab 6b)

    // Mörser auf M01: trifft Z-01 um 175 am Einschlagort; Z-02 steht 32 m daneben – der Mörser (80 m) trifft beide
    const nachher = zustandAus(protokoll([
      ...START,
      ["meldung", { meldung: "M01" }, 20],
      ["g1_entscheid", { meldung: "M01", entscheid: "annehmen" }, 60],
      ["g2_empfehlung", { meldung: "M01", empfehlung: "bekaempfen", wirkmittel: "MRS" }, 110],
      ["g3_entscheid", { meldung: "M01", entscheid: "freigabe", wirkmittel: "MRS", einschlag: { t: 175, pos: [772, 440], ziel: "Z-01" } }, 140],
      ["wirkung", { meldung: "M01", wirkmittel: "MRS", pos: [772, 440], t_freigabe: 140, t_einschlag: 175, ziel: "Z-01",
        getroffen: [{ ziel: "Z-01", was: "fahrzeug", kategorie: "feind" }] }, 175],
    ]), inh);
    // (hier trifft das Protokoll nur Z-01): C8 – das Zeichen folgt dem noch stehenden Z-02, Z-01 bekommt ein eigenes Wrackzeichen
    const lb2 = lagebildZielmeldungen(inh, nachher, "g2", 230);
    const w = lb2.objekte.find((x) => x.meldung === "M01")!;
    expect(w.zerstoert).toBe(false);
    expect(w.sidc).toBe(zeichenArgus(inh, "Spähpanzer BRDM-2", inh.meldungen.M01.argus.konfidenz)); // ein Fahrzeug: ohne Größenangabe
    expect(w.menge).toBeUndefined();
    expect(w.zustand).toBe("erledigt");
    const wrack = lb2.objekte.find((x) => x.art === "wrack")!;
    expect(wrack.id).toBe("Z-01–02~Z-01");
    expect(wrack.sidc[3]).toBe("X");
    expect(wrack.zustand).toBe("bekaempft");
    expect(wrack.bahn?.halt).toBe(175);
    expect(wrack.pos).toEqual([772, 440]);
    // geplante Wirkung vor dem Einschlag: am vorausberechneten Ort
    const geplant = zustandAus(protokoll([
      ...START,
      ["meldung", { meldung: "M01" }, 20],
      ["g1_entscheid", { meldung: "M01", entscheid: "annehmen" }, 60],
      ["g2_empfehlung", { meldung: "M01", empfehlung: "bekaempfen", wirkmittel: "LM" }, 110],
      ["g3_entscheid", { meldung: "M01", entscheid: "freigabe", wirkmittel: "LM", einschlag: { t: 180.8, pos: [772, 440], ziel: "Z-01" } }, 140],
    ]), inh);
    const gw = lagebildZielmeldungen(inh, geplant, "g3", 150).wirkungen.find((x) => x.geplant)!;
    expect(gw.pos).toEqual([772, 440]);
    expect(gw.text).toMatch(/LM · 03:00$/); // Spieluhr 00:00–25:00 (B4)
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

describe("Kontakte, Teil- und Wrackzeichen (2.2, C1/C8)", () => {
  it("jedes fahrende Fahrzeug ist ab der Einfahrt ein Kontakt, bis seine Meldung bei der Rolle ankommt", async () => {
    const inh = await inhalte();
    const leer = zustandAus(protokoll([...START]), inh);
    const k = lagebildZielmeldungen(inh, leer, "g1", 15).objekte;
    expect(k.map((o) => o.id).sort()).toEqual(["?Z-01", "?Z-02"]); // Spähtrupp HAUPT fährt um 00:06/00:12 vom Ostrand ein
    expect(k.every((o) => o.art === "kontakt" && o.sidc === ZEICHEN_KONTAKT && !o.meldung && o.bahn)).toBe(true);
    expect(k.find((o) => o.id === "?Z-01")!.bahn!.ab).toBe(6);
    // die Attrappe (steht seit Spielbeginn) und ungemeldete Ziele sind nie Kontakte
    expect(lagebildZielmeldungen(inh, leer, "g1", 1450).objekte.some((o) => o.id === "?Z-07" || o.id === "?Z-27" || o.id === "?Z-28")).toBe(false);
    // M01 erscheint: bei der Aufklärung wird der Kontakt zur Zielmeldung, bei der Zielprüfung erst nach ANNEHMEN
    const z = zustandAus(protokoll([...START, ["meldung", { meldung: "M01" }, 20]]), inh);
    expect(lagebildZielmeldungen(inh, z, "g1", 30).objekte.filter((o) => o.art === "kontakt").map((o) => o.id)).toEqual([]);
    expect(lagebildZielmeldungen(inh, z, "g2", 30).objekte.map((o) => o.id).sort()).toEqual(["?Z-01", "?Z-02"]);
  });

  it("im Wald sieht die Drohne keine Bewegung (Z-21 in der Lauerstellung)", async () => {
    const inh = await inhalte();
    const z = zustandAus(protokoll([...START]), inh);
    expect(lagebildZielmeldungen(inh, z, "g1", 1200).objekte.some((o) => o.id === "?Z-21")).toBe(false);
    expect(lagebildZielmeldungen(inh, z, "g1", 1250).objekte.some((o) => o.id === "?Z-21")).toBe(true);
  });

  it("ein Fahrzeug, das sich vom Zeichen seiner Meldung entfernt, bekommt ein eigenes kleines Zeichen", async () => {
    const inh = await inhalte();
    const z = zustandAus(protokoll([...START, ["meldung", { meldung: "M01" }, 20]]), inh);
    const lb = lagebildZielmeldungen(inh, z, "g1", 200);
    const haupt = lb.objekte.find((o) => o.meldung === "M01")!;
    expect(haupt.menge).toBeUndefined(); // Z-02 ist schon zur Brücke unterwegs
    const teil = lb.objekte.find((o) => o.id === "Z-01–02+Z-02")!;
    expect(teil.art).toBe("teil");
    expect(teil.text).toBe("Ziel 1");
    expect(teil.meldung).toBeUndefined();
    // gemeinsam: Zahl und Größenangabe
    const zusammen = lagebildZielmeldungen(inh, z, "g1", 100).objekte.find((o) => o.meldung === "M01")!;
    expect(zusammen.menge).toBe(2);
    expect(zusammen.sidc).toBe("SHGPUCRVA--C---");
  });
});
