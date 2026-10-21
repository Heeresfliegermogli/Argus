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
      ["meldung", { meldung: "M19", fast_track: true }, 1215],
    ]), inh);
    const lb = lagebildZielmeldungen(inh, z, "g2");
    expect(lb.objekte.map((o) => o.id).sort()).toEqual(["Z-01", "Z-15–17"]);
    expect(lb.personen).toEqual([]);
    const pt = lb.objekte.find((o) => o.id === "Z-15–17")!;
    expect(pt.sidc).toBe("SHGPEVAT-------"); // ARGUS meint T-72 – G2 sieht keinen Verbündeten
    expect(pt.menge).toBe(3);
    expect(pt.zustand).toBe("offen");
    expect(pt.pos.map(Math.round)).toEqual([476, 612]);
    expect(JSON.stringify(lb)).not.toMatch(/verb[uü]ndet|PT-91|Twardy/);
    // G3 sieht noch nichts: keine Empfehlung von G2
    expect(lagebildZielmeldungen(inh, z, "g3").objekte).toEqual([]);
  });

  it("Folgemeldung zum selben Ziel ergibt ein Zeichen, bekämpft wird als zerstört gezeigt", async () => {
    const inh = await inhalte();
    const z = zustandAus(protokoll([
      ...START,
      ["meldung", { meldung: "M16" }, 1095],
      ["g1_entscheid", { meldung: "M16", entscheid: "annehmen" }, 1100],
      ["g2_empfehlung", { meldung: "M16", empfehlung: "beobachten" }, 1110],
      ["meldung", { meldung: "M21" }, 1290],
      ["g1_entscheid", { meldung: "M21", entscheid: "annehmen" }, 1295],
      ["g2_empfehlung", { meldung: "M21", empfehlung: "bekaempfen", wirkmittel: "LM" }, 1300],
      ["g3_entscheid", { meldung: "M21", entscheid: "freigabe", wirkmittel: "LM" }, 1310],
      ["wirkung", { meldung: "M21", wirkmittel: "LM", pos: [768, 305], t_freigabe: 1310, getroffen: [{ ziel: "Z-19", was: "fahrzeug", kategorie: "feind" }] }, 1430],
    ]), inh);
    const g2 = lagebildZielmeldungen(inh, z, "g2");
    expect(g2.objekte).toHaveLength(1);
    expect(g2.objekte[0].text).toBe("M16/M21");
    expect(g2.objekte[0].zustand).toBe("bekaempft");
    expect(g2.objekte[0].sidc[3]).toBe("X");
    expect(g2.wirkungen.map((w) => w.id)).toEqual(["W-M21"]);
    expect(g2.wirkungen[0].zeilen.join(" ")).not.toMatch(/getroffen/); // kein Ergebnis für G2
    const g3 = lagebildZielmeldungen(inh, z, "g3");
    expect(g3.objekte.map((o) => o.meldungen)).toEqual([["M21"]]); // M16 kam nie bei G3 an
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
      ["meldung", { meldung: "M16" }, 1095],
      ["g1_entscheid", { meldung: "M16", entscheid: "annehmen" }, 1100],
      ["g2_empfehlung", { meldung: "M16", empfehlung: "bekaempfen", wirkmittel: "LM" }, 1110],
      ["g3_entscheid", { meldung: "M16", entscheid: "freigabe", wirkmittel: "LM" }, 1120],
      ["wirkung", { meldung: "M16", wirkmittel: "LM", pos: [768, 305], t_freigabe: 1120, getroffen: [
        { ziel: "Z-19", was: "fahrzeug", kategorie: "feind" }, { ziel: "Z-19", was: "personen", kategorie: "soldat", anzahl: 5 },
        { ziel: "Z-19", was: "personen", kategorie: "zivil", anzahl: 4 }] }, 1240],
    ]), inh);
    const lb = lagebildKontrolle(inh, z, 1400);
    const mrs = lb.objekte.find((o) => o.id === "Z-19")!;
    expect(mrs.zustand).toBe("bekaempft");
    expect(mrs.sprite?.name).toBe("moerser_trupp_wrack.png");
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
      expect(lb.wirkungen[0].text).toBe("M01 Mrs · 10:03:05"); // Freigabe 10:01:35 + 1:30 Vorlauf
    }
    const nach = zustandAus(protokoll([...bis,
      ["wirkung", { meldung: "M01", wirkmittel: "MRS", pos: [880, 300], t_freigabe: 95, getroffen: [{ ziel: "Z-01", was: "fahrzeug", kategorie: "feind" }] }, 185],
    ]), inh);
    const lb = lagebildKontrolle(inh, nach, 190);
    expect(lb.wirkungen.map((w) => !!w.geplant)).toEqual([false]);
  });
});
