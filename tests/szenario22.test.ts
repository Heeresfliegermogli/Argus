// Szenario 2.2 (Änderungsliste C1–C9 nach dem 2. Solo-Durchlauf am 28.10.2026): Fahrzeuge fahren vom Kartenrand ein und
// sind ab dort als Kontakt sichtbar, keine Meldelücke über 60 s, LM trifft genau ein Fahrzeug, EloKa-Meldung „Ziel unbekannt“.
// Gleiche Prüfungen wie tools/referenz/pruefe_szenario.py (dort ausführlicher, mit Abständen und Durchbruch).
import { describe, expect, it } from "vitest";
import { abS, dist, position } from "../src/kern/geometrie";
import { imWald, lagebildZielmeldungen } from "../src/kern/lagebild";
import { einschlag, wirkungBeimEinschlag } from "../src/kern/regeln";
import { welt } from "../src/kern/welt";
import { zustandAus } from "../src/kern/zustand";
import type { Absender, Ereignis } from "../src/kern/ereignisse";
import { inhalte } from "./hilfen";

const SYS: Absender = { rolle: "system" };
const START: Ereignis[] = [
  { seq: 1, typ: "spiel_neu", ts: 1, t_s: 0, von: SYS, daten: { lauf: "20261028-test", szenario: "kraehe-01", version: "2.2", titel: "x" } } as Ereignis,
  { seq: 2, typ: "uhr", ts: 2, t_s: 0, von: SYS, daten: { befehl: "start", laeuft: true, t_s: 0, tempo: 1 } } as Ereignis,
];

function amRand(p: [number, number], w: number, h: number, rand = 20): boolean {
  return Math.min(p[0], w - p[0], p[1], h - p[1]) <= rand;
}

describe("Szenario 2.2: Daten", () => {
  it("C1: jedes Fahrzeug erscheint am Kartenrand (nur was bei Spielbeginn dasteht, steht mitten im Bild)", async () => {
    const inh = await inhalte();
    const { breite: w, hoehe: h } = inh.karte.ausdehnung_m;
    expect(inh.szenario.version).toBe("2.2");
    for (const z of inh.szenario.ziele) {
      const a = abS(z);
      if (a <= 0 && !z.bewegung?.route?.length) continue; // Attrappe Z-07 steht seit Spielbeginn
      expect(z.bewegung?.route?.length, `${z.id} ohne Route`).toBeGreaterThan(0);
      expect(amRand(position(z, a), w, h), `${z.id} erscheint um ${a} s mitten im Bild`).toBe(true);
      if (z.bis_s !== undefined && z.bis_s !== null) expect(amRand(position(z, z.bis_s), w, h), `${z.id} verschwindet mitten im Bild`).toBe(true);
    }
    // auch die Verstärkungen (alle Einspielzeiten gleich: Zeiten relativ zum Einspielen)
    for (const g of inh.szenario.verstaerkungen?.gruppen ?? []) {
      const wv = welt(inh, [{ gruppe: g.id, t0: 300 }]);
      for (const zv of g.ziele) {
        const z = wv.ziele[zv.id];
        expect(amRand(position(z, abS(z)), w, h), `${g.id} ${z.id}`).toBe(true);
      }
    }
  });

  it("C3: höchstens 60 s ohne neue Meldung (sonst pause_gewollt)", async () => {
    const inh = await inhalte();
    const ts = [0, ...inh.szenario.meldungen.map((m) => m.t_s), inh.szenario.spieluhr.dauer_s];
    const luecken = ts.slice(1).map((t, i) => [t - ts[i], i] as const);
    const ohneAbsicht = luecken.filter(([l, i]) => l > 60 && !inh.szenario.meldungen[i]?.pause_gewollt);
    expect(ohneAbsicht).toEqual([]);
    expect(inh.szenario.meldungen.map((m) => m.id).filter((id) => ["M28", "M29", "M30"].includes(id))).toEqual(["M28", "M29", "M30"]);
  });

  it("C6: LM trifft genau das bekämpfte Fahrzeug, der Mörser alle im Wirkradius", async () => {
    const inh = await inhalte();
    expect(inh.wirkmittel.LM.nur_zielfahrzeug).toBe(true);
    // Spähtrupp HAUPT (M01) steht ab 00:59 mit 32 m Abstand östlich der Schule
    const lm = wirkungBeimEinschlag(inh, einschlag(inh, ["Z-01", "Z-02"], "LM", 100), "LM");
    expect(lm.getroffen.filter((g) => g.was !== "personen").map((g) => g.ziel)).toEqual(["Z-01"]);
    const mrs = wirkungBeimEinschlag(inh, einschlag(inh, ["Z-01", "Z-02"], "MRS", 100), "MRS");
    expect(mrs.getroffen.filter((g) => g.was !== "personen").map((g) => g.ziel).sort()).toEqual(["Z-01", "Z-02"]);
    // Personen im Wirkradius trifft auch die LM (S4: Zivilpersonen im Hof RABE)
    const s4 = wirkungBeimEinschlag(inh, einschlag(inh, ["Z-19"], "LM", 1100), "LM");
    expect(s4.getroffen.some((g) => g.was === "personen" && g.kategorie === "zivil")).toBe(true);
  });

  it("C1: Fahrzeuge einer Meldung halten mindestens 15 m Abstand (im Stand und in Fahrt)", async () => {
    const inh = await inhalte();
    for (const m of inh.szenario.meldungen) {
      for (let i = 0; i < m.ziele.length; i++) {
        for (let j = i + 1; j < m.ziele.length; j++) {
          const a = inh.ziele[m.ziele[i]];
          const b = inh.ziele[m.ziele[j]];
          for (let t = Math.max(abS(a), abS(b)); t <= Math.min(a.bis_s ?? 1500, b.bis_s ?? 1500); t += 2) {
            expect(dist(position(a, t), position(b, t)), `${m.id} ${a.id}/${b.id} um ${t} s`).toBeGreaterThanOrEqual(14.5);
          }
        }
      }
    }
  });

  it("C9: EloKa-Meldung M25 ist „Ziel unbekannt“ mit niedriger Konfidenz, das Bild stark gestört", async () => {
    const inh = await inhalte();
    const m = inh.meldungen.M25;
    expect(m.argus).toMatchObject({ klasse: "Ziel unbekannt", empfehlung: "UNKLAR" });
    expect(m.argus.konfidenz).toBeLessThan(inh.regeln.argus.schwellen.pruefen);
    expect(m.bild.sicht.find((s) => s.art === "stoerung")!.anteil).toBeGreaterThanOrEqual(0.8);
    expect(m.sensor.bildalter_s).toBeGreaterThanOrEqual(15);
    expect(inh.ziele["Z-23"].gt.legitim).toBe(true);
    expect(m.sensor.waerme).toMatch(/Generator/);
  });
});

describe("Szenario 2.2: Kontakte auf der Karte der Spieler", () => {
  it("kein Fahrzeug taucht mitten im Bild auf: Vor seiner ersten Meldung ist jedes gemeldete Fahrzeug als Kontakt da", async () => {
    const inh = await inhalte();
    const leer = zustandAus(START, inh);
    // je Meldung: kurz vor der Meldezeit steht jedes ihrer Fahrzeuge schon als Kontakt (oder im Wald / seit Spielbeginn)
    const gesehen = new Set<string>();
    for (const m of inh.szenario.meldungen) {
      const lb = lagebildZielmeldungen(inh, leer, "g1", m.t_s - 1);
      for (const id of m.ziele) {
        if (gesehen.has(id)) continue;
        gesehen.add(id);
        const z = inh.ziele[id];
        if (!z.bewegung?.route?.length) continue; // Attrappe
        const p = position(z, m.t_s - 1);
        if (imWald(inh, p)) continue;
        expect(lb.objekte.some((o) => o.id === `?${id}`), `${id} vor ${m.id}`).toBe(true);
      }
    }
  });

  it("Kontakte kommen über den Kartenrand herein (erste sichtbare Lage am Rand)", async () => {
    const inh = await inhalte();
    const leer = zustandAus(START, inh);
    const { breite: w, hoehe: h } = inh.karte.ausdehnung_m;
    const erstmals = new Map<string, [number, number]>();
    for (let t = 0; t <= 1500; t += 2) {
      for (const o of lagebildZielmeldungen(inh, leer, "g1", t).objekte) {
        if (o.art === "kontakt" && !erstmals.has(o.id)) erstmals.set(o.id, o.pos);
      }
    }
    expect(erstmals.size).toBeGreaterThan(25);
    const mitten = [...erstmals].filter(([id, p]) => !amRand(p, w, h, 30) && !imWald(inh, position(inh.ziele[id.slice(1)], 0)));
    // nur Fahrzeuge, die aus dem Wald kommen (Mörser MARDER, BMP-2 DACHS), erscheinen am Waldrand
    for (const [id, p] of mitten) {
      const z = inh.ziele[id.slice(1)];
      const t0 = abS(z);
      const ausWald = z.bewegung!.route.some(([t, x, y]) => t >= t0 && imWald(inh, [x, y]));
      expect(ausWald, `${id} erscheint bei ${p.map(Math.round)}`).toBe(true);
    }
  });
});
