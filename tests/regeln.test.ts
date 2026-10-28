// Vergleich der TypeScript-Portierung mit argus_lib.py (Referenzdaten aus tools/referenz/erzeuge_referenz.py).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { abstandZone, feinlage, gtBei, position, pq, vorhanden } from "../src/kern/geometrie";
import { argusEmpfehlung, einschlag, flugzeit, pruefeWirkmittel, vorhersage } from "../src/kern/regeln";
import type { Punkt } from "../src/inhalte/typen";
import { inhalte } from "./hilfen";

interface Referenz {
  faelle: { meldung: string; ziel: string; pos: Punkt; t: number; wm: string; zulaessig: boolean; verstoesse: [string, string | null, number | null][]; getroffen: string[] }[];
  positionen: { ziel: string; t: number; pos: Punkt; vorhanden: boolean }[];
  raster: { p: Punkt; pq: string }[];
  zonen: { p: Punkt; zone: string; abstand: number }[];
  einschlaege: {
    meldung: string; t_freigabe: number; wm: string; t: number; pos: Punkt; ziel: string; zulaessig: boolean;
    verstoesse: [string, string | null, number | null][]; getroffen: string[];
  }[];
  zerstoert_hintergrund: Record<string, number>;
}

const ref = JSON.parse(readFileSync(new URL("./referenz_regeln.json", import.meta.url), "utf-8")) as Referenz;

describe("Geometrie wie argus_lib.py", () => {
  it("Positionen und Anwesenheit aller Ziele", async () => {
    const inh = await inhalte();
    for (const r of ref.positionen) {
      const z = inh.ziele[r.ziel];
      const p = position(z, r.t);
      expect(p[0]).toBeCloseTo(r.pos[0], 6);
      expect(p[1]).toBeCloseTo(r.pos[1], 6);
      expect(vorhanden(z, r.t)).toBe(r.vorhanden);
    }
  });

  it("Planquadrate", async () => {
    const inh = await inhalte();
    for (const r of ref.raster) expect(pq(r.p, inh.karte)).toBe(r.pq);
    expect(feinlage([476, 612], inh.karte)).toBe("E7 · 76/12");
    expect(feinlage([548, 386], inh.karte)).toBe("F4 · 48/86");
  });

  it("Abstände zu den Zonen", async () => {
    const inh = await inhalte();
    const zonen = Object.fromEntries(inh.szenario.zonen.map((z) => [z.id, z]));
    for (const r of ref.zonen) expect(abstandZone(r.p, zonen[r.zone])).toBeCloseTo(r.abstand, 6);
  });
});

describe("Einsatzregeln wie argus_lib.py", () => {
  it(`alle ${ref.faelle.length} Fälle (Meldung × Wirkmittel × Zeit)`, async () => {
    const inh = await inhalte();
    for (const f of ref.faelle) {
      const p = pruefeWirkmittel(inh, f.pos, f.wm, f.t, [], {}, f.ziel);
      const ort = `${f.meldung} ${f.wm} t=${f.t}`;
      expect(p.zulaessig, ort).toBe(f.zulaessig);
      expect(p.verstoesse.map((v) => v.regel), ort).toEqual(f.verstoesse.map((v) => v[0]));
      p.verstoesse.forEach((v, i) => {
        const soll = f.verstoesse[i][2];
        if (soll !== null) expect(Math.abs(v.abstand_m! - soll), ort).toBeLessThanOrEqual(0.5 + 1e-9);
      });
      expect(p.getroffen.map((g) => `${g.ziel}|${g.kategorie}`).sort(), ort).toEqual(f.getroffen);
    }
  });

  it("ARGUS-Empfehlung aus der Konfidenz", async () => {
    const inh = await inhalte();
    expect(argusEmpfehlung(80, inh.regeln)).toBe("BEKÄMPFEN");
    expect(argusEmpfehlung(79, inh.regeln)).toBe("PRÜFEN");
    expect(argusEmpfehlung(59, inh.regeln)).toBe("UNKLAR");
  });

  it("Trefferregel: S4 Mörser im Hof RABE – vor 10:21:40 trifft jede Wirkung die Zivilpersonen", async () => {
    const inh = await inhalte();
    const m18 = inh.meldungen.M18;
    const lm = vorhersage(inh, m18, "LM", 1100).getroffen.map((g) => g.kategorie);
    const mrs = vorhersage(inh, m18, "MRS", 1100).getroffen.map((g) => g.kategorie);
    expect(lm).toEqual(expect.arrayContaining(["feind", "zivil"]));
    expect(mrs).toContain("zivil");
    expect(vorhersage(inh, inh.meldungen.M23, "LM", 1325).getroffen.map((g) => g.kategorie)).not.toContain("zivil");
  });

  it("Ground Truth wechselt im Gefecht: Z-24 ist bis 10:19:30 Feind, danach außer Gefecht", async () => {
    const inh = await inhalte();
    const z24 = inh.ziele["Z-24"];
    expect(gtBei(z24, 1100).kategorie).toBe("feind");
    expect(gtBei(z24, 1170).kategorie).toBe("ausser_gefecht");
    const p = position(z24, 1100);
    expect(pruefeWirkmittel(inh, p, "LM", 1100, [], {}, "Z-24").getroffen.find((g) => g.ziel === "Z-24")?.kategorie).toBe("feind");
    const q = position(z24, 1250);
    expect(pruefeWirkmittel(inh, q, "LM", 1250, [], {}, "Z-24").getroffen.map((g) => g.kategorie)).toEqual(
      expect.arrayContaining(["ausser_gefecht", "besatzung_ergibt_sich"]));
  });

  it("Trefferregel: gemeldetes Ziel ist getroffen, solange es im Raum ist (M20 → Z-15)", async () => {
    const inh = await inhalte();
    const w = vorhersage(inh, inh.meldungen.M20, "PZA", 1300);
    expect(w.getroffen.some((g) => g.ziel === "Z-15" && g.was === "fahrzeug")).toBe(true);
  });
});

describe("Trefferregel beim Einschlag wie argus_lib.py (einschlag, wirkung)", () => {
  it(`alle ${ref.einschlaege.length} Fälle (Meldung × Freigabe +30/+90/+150 s × Wirkmittel)`, async () => {
    const inh = await inhalte();
    const zerstoert = ref.zerstoert_hintergrund;
    for (const f of ref.einschlaege) {
      const ort = `${f.meldung} ${f.wm} frei ${f.t_freigabe}`;
      const v = vorhersage(inh, inh.meldungen[f.meldung], f.wm, f.t_freigabe, zerstoert);
      expect(v.einschlag.t, ort).toBeCloseTo(f.t, 6);
      expect(v.einschlag.pos[0], ort).toBeCloseTo(f.pos[0], 6);
      expect(v.einschlag.pos[1], ort).toBeCloseTo(f.pos[1], 6);
      expect(v.einschlag.ziel, ort).toBe(f.ziel);
      expect(v.pruefung.zulaessig, ort).toBe(f.zulaessig);
      expect(v.pruefung.verstoesse.map((x) => x.regel), ort).toEqual(f.verstoesse.map((x) => x[0]));
      expect(v.getroffen.map((g) => `${g.ziel}|${g.kategorie}`).sort(), ort).toEqual(f.getroffen);
    }
  });

  it("LM: Flugzeit hängt vom Ziel ab (5 s Start, 30 m/s ab Startpunkt westlich der Karte), Mörser 35 s, PzAbw 10 s", async () => {
    const inh = await inhalte();
    const lm = inh.wirkmittel.LM;
    expect(flugzeit(lm, [lm.flug!.start[0] + 300, lm.flug!.start[1]])).toBeCloseTo(15, 6);
    expect(flugzeit(inh.wirkmittel.MRS, [900, 300])).toBe(35);
    expect(flugzeit(inh.wirkmittel.PZA, [400, 300])).toBe(10);
    // N4: BMP-2 fährt während des LM-Anflugs zur Schule – Einschlag am Schulgebäude, Warnung R2 erst beim Einschlag
    const m17 = inh.meldungen.M17;
    const e = einschlag(inh, m17.ziele, "LM", m17.t_s + 60);
    expect(e.t - (m17.t_s + 60)).toBeGreaterThan(30);
    expect(pruefeWirkmittel(inh, e.pos, "LM", e.t).verstoesse.some((x) => x.regel === "R2")).toBe(true);
  });
});
