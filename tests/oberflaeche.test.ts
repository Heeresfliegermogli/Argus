// Schritt 6b: Bausteine der Kartenoberfläche als reine Funktionen – Lage des Drohnenbild-Fensters am Ort,
// Marken je Meldung (zurückgestellte bleiben stehen), Rollen auf der Einweisungskarte.
import { describe, expect, it } from "vitest";
import { gruppenKurz } from "../src/ansichten/einweisung";
import { fensterLage, meldungsMarken } from "../src/ansichten/gemeinsam/lagekarte";
import type { MeldungsStand } from "../src/kern/zustand";
import { inhalte } from "./hilfen";

const W = 416;
const H = 260;
/** Kartenfeld G1 in 1530 × 800 (ca. 1050 × 730) */
const BW = 1050;
const BH = 730;

function innen(p: [number, number], r: [number, number, number, number], rand: number): boolean {
  return p[0] > r[0] - rand && p[0] < r[2] + rand && p[1] > r[1] - rand && p[1] < r[3] + rand;
}

describe("Drohnenbild-Fenster am Ort", () => {
  it("liegt ganz in der Karte und verdeckt das Ziel nicht – überall auf der Karte", () => {
    for (let x = 0; x <= BW; x += 35) {
      for (let y = 0; y <= BH; y += 35) {
        const r = fensterLage([x, y], W, H, BW, BH);
        expect(r[2] - r[0]).toBe(W);
        expect(r[3] - r[1]).toBe(H);
        expect(r[0]).toBeGreaterThanOrEqual(0);
        expect(r[1]).toBeGreaterThanOrEqual(0);
        expect(r[2]).toBeLessThanOrEqual(BW);
        expect(r[3]).toBeLessThanOrEqual(BH);
        expect(innen([x, y], r, 10), `Ziel (${x}, ${y}) unter dem Fenster ${r}`).toBe(false);
      }
    }
  });

  it("weicht anderen Marken aus, wenn es geht", () => {
    const p: [number, number] = [500, 380];
    const frei = fensterLage(p, W, H, BW, BH);
    // Hindernis genau dort, wo das Fenster ohne Hindernis läge
    const mitHindernis = fensterLage(p, W, H, BW, BH, [frei]);
    const ueber = Math.max(0, Math.min(frei[2], mitHindernis[2]) - Math.max(frei[0], mitHindernis[0]))
      * Math.max(0, Math.min(frei[3], mitHindernis[3]) - Math.max(frei[1], mitHindernis[1]));
    expect(ueber).toBeLessThan(W * H * 0.5);
  });

  it("findet eine Lage, die Lagehinweise und Marken ganz frei lässt (Fall M13 aus der Probe)", () => {
    const ecke: [number, number, number, number] = [8, 8, 211, 37];
    const marken: [number, number, number, number][] = [
      [280, 358, 316, 376], [271, 319, 303, 351], // M08
      [572, 478, 608, 496], [574, 442, 606, 474], // M12
      [670, 430, 702, 448], [840, 436, 872, 454], // M11, M14
      [848, 242, 884, 260], [960, 188, 996, 206], // M04, M05
    ];
    const r = fensterLage([650, 255], W, H, BW, BH, [{ r: ecke, gewicht: 4 }, ...marken]);
    const ueber = (o: number[]) => Math.max(0, Math.min(r[2], o[2]) - Math.max(r[0], o[0])) * Math.max(0, Math.min(r[3], o[3]) - Math.max(r[1], o[1]));
    expect(ueber(ecke)).toBe(0);
    for (const m of marken) expect(ueber(m), `Marke ${m}`).toBe(0);
  });
});

function stand(id: string, extra: Partial<MeldungsStand> = {}): MeldungsStand {
  return {
    id, erschienen: { seq: 1, t_s: 20 }, fastTrack: false, manuell: false, stufe: "g2", beobachten: false, verlauf: [], ...extra,
  } as MeldungsStand;
}

describe("Marken der Meldungen", () => {
  it("je offene Meldung ein Knopf; gewählt, zurückgestellt und Zusatz (⚠) erkennbar", () => {
    const geklickt: string[] = [];
    const m = meldungsMarken([stand("M01"), stand("M03", { beobachten: true }), stand("M04")], "M04", (id) => geklickt.push(id),
      (st) => (st.id === "M01" ? "⚠" : undefined));
    expect(m.map((x) => [x.id, x.text, x.art])).toEqual([
      ["M01", "M01 · ⚠", "offen"],
      ["M03", "M03 · zurückgestellt", "zurueck"],
      ["M04", "M04", "gewaehlt"],
    ]);
    m[1].onClick?.();
    expect(geklickt).toEqual(["M03"]);
    // Die Karte misst denselben Text, den der Knopf zeigt (Platz für die Marke)
    for (const x of m) expect(x.mass).toBe(x.text);
  });
});

describe("Einweisungskarten", () => {
  it("nennen alle drei Rollen des Teams (Plenum und Teamleiste)", async () => {
    const inh = await inhalte();
    const g = gruppenKurz(inh);
    expect(g.map((x) => x.rolle)).toEqual(["g1", "g2", "g3"]);
    for (const x of g) expect(x.text).toMatch(/^[A-ZÄÖÜ].+\.$/);
  });

  it("Auftrag je Rolle in der Du-Form (jede Rolle ist eine Person)", async () => {
    const inh = await inhalte();
    for (const r of ["G1", "G2", "G3"]) {
      const text = inh.szenario.lage[r].absaetze.join(" ");
      expect(text, r).not.toMatch(/\b(Ihr|ihr|euch|eure)\b/);
      expect(text, r).toMatch(/\b(Du|du)\b/);
    }
  });
});
