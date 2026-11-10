// Schritt 6b: Bausteine der Kartenoberfläche als reine Funktionen – Lage des Drohnenbild-Fensters am Ort,
// Marken je Meldung (zurückgestellte bleiben stehen), Einweisung (seit 2.6 eine Rolle: Übersicht mit Pfeilen, Klassenbeispiele).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KLASSEN_BEISPIEL, TOUR } from "../src/ansichten/einweisung";
import { fensterLage, meldungsMarken } from "../src/ansichten/gemeinsam/lagekarte";
import { LAGEMELDUNG_MAX, lageEinblendung } from "../src/ansichten/zb";
import { MIN_FENSTER, PRUEFGROESSEN, fensterKennung, leseFensterKennung, skalaFuer, zuKlein } from "../src/kern/fenster";
import type { InjectStand } from "../src/kern/zustand";
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
  return { id, erschienen: { seq: 1, t_s: 20 }, manuell: false, stufe: "offen", zurueckgestellt: false, ...extra } as MeldungsStand;
}

describe("Marken der Meldungen", () => {
  it("je offene Meldung ein Knopf; gewählt und zurückgestellt erkennbar", () => {
    const geklickt: string[] = [];
    const m = meldungsMarken([stand("M01"), stand("M03", { zurueckgestellt: true }), stand("M04")], "M04", (id) => geklickt.push(id),
      (id) => `Ziel ${Number(id.slice(1))}`);
    // Spieler sehen „Ziel 1“, die Marke trägt intern weiter die Meldung (B7)
    expect(m.map((x) => [x.id, x.text, x.art])).toEqual([
      ["M01", "Ziel 1", "offen"],
      ["M03", "Ziel 3 · zurückgestellt", "zurueck"],
      ["M04", "Ziel 4", "gewaehlt"],
    ]);
    m[1].onClick?.();
    expect(geklickt).toEqual(["M03"]);
    // Die Karte misst denselben Text, den der Knopf zeigt (Platz für die Marke)
    for (const x of m) expect(x.mass).toBe(x.text);
  });
});

describe("Einweisung (H4)", () => {
  const quelle = (f: string) => readFileSync(new URL(`../src/ansichten/${f}`, import.meta.url), "utf-8");

  it("Übersicht mit Pfeilen: jedes Ziel der Tour gibt es auf der echten Oberfläche", () => {
    const ziele = TOUR.map((s) => s.ziel);
    // seit Liste J (J4): „Lagemeldungen“ zeigt auf die Einblendung oben links auf der Karte, „Wirkmittel“ auf die drei Kacheln
    for (const z of ["eingang", "entscheiden", "karte", "panzer", "feed", "wirkmittel", "uhr"]) expect(ziele, z).toContain(z);
    const ui = quelle("zb.tsx") + quelle("gemeinsam/rahmen.tsx");
    for (const z of ziele) expect(ui, z).toContain(`data-tour="${z}"`);
    for (const s of TOUR) expect(s.titel.length, s.ziel).toBeGreaterThan(5);
  });

  it("Auftrag für das Team (eine Rolle, Ihr-Form), ohne G1–G3, Fast-Track, Gegenangriff und Regelblock", async () => {
    const inh = await inhalte();
    expect(Object.keys(inh.szenario.lage).sort()).toEqual(["plenum", "spielleitung", "team"]);
    const team = inh.szenario.lage.team.absaetze.join(" ");
    expect(team).toMatch(/BEKÄMPFEN/);
    expect(team).toMatch(/ZURÜCKSTELLEN/);
    expect(team).toMatch(/ABLEHNEN/);
    expect(team).toMatch(/\b(Ihr|ihr)\b/);
    const sichtbar = JSON.stringify([inh.szenario.lage.team, inh.szenario.lage.plenum, inh.szenario.phasen.map((p) => [p.name, p.kurz])]);
    expect(sichtbar).not.toMatch(/\bG[123]\b|Fast-Track|Gegenangriff|Aufklärer|Zielprüfer/);
    // im Code der Einweisung (ohne Kommentare) kein Kleingedrucktes und kein Regelblock (H4.3)
    const einweisung = quelle("einweisung.tsx").split("\n").filter((z) => !z.trim().startsWith("//")).join("\n");
    expect(einweisung).not.toMatch(/Kleingedruckt|Regelungen/);
  });

  it("je Klasse ein Bildbeispiel aus einer Routinemeldung (keine Lösungshinweise)", async () => {
    const inh = await inhalte();
    expect(KLASSEN_BEISPIEL.map((k) => k.klasse)).toEqual(["Panzer", "Fahrzeug", "Infanterie"]);
    for (const k of KLASSEN_BEISPIEL) {
      const m = inh.meldungen[k.meldung];
      expect(m, k.meldung).toBeDefined();
      expect(m.fall, k.meldung).toBeUndefined();
      expect(m.argus.empfehlung, k.meldung).toBe("BEKÄMPFEN");
      expect(m.ziele.every((z) => inh.ziele[z].gt.legitim), k.meldung).toBe(true);
    }
  });
});

describe("Liste J: ganze Karte, jede Fenstergröße", () => {
  const css = readFileSync(new URL("../src/stil/basis.css", import.meta.url), "utf-8");
  const quelle = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf-8");

  it("J1.1: Kartenfeld der Zielbearbeitung im Seitenverhältnis 10 : 7 aus der Höhe, rechte Spalte der Rest; G4b (Füllen) ist weg", () => {
    expect(css).toMatch(/\.zb-raster \{[^}]*grid-template-columns: min\(calc\(100cqh \* 10 \/ 7\), calc\(100cqw - 8px - var\(--zb-rechts-min\)\)\) minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.ansicht-zb \{ --zb-rechts-min: 440px;[^}]*container-type: size/);
    // Plenum: ebenfalls die ganze Karte (J3.1)
    expect(css).toMatch(/\.karte-raster \{[^}]*\* 10 \/ 7 \+ 2px\)/);
    for (const f of ["ansichten/zb.tsx", "ansichten/plenum.tsx", "ansichten/gemeinsam/lagekarte.tsx", "karte/lagekarte.ts"]) {
      expect(quelle(f), f).not.toMatch(/fuellen=|fuellen\?:|fuellFaktor/);
    }
    expect(quelle("ansichten/zb.tsx")).toContain("senkrechtMitte");
  });

  it("J1.2: höchstens zwei Lagemeldungen auf der Karte, die neuesten; die übrigen stehen dahinter", () => {
    const inj = (id: string, t: number, quittiert = false) => ({ id, erschienen: { seq: 1, t_s: t }, ...(quittiert ? { quittiert: { seq: 2, t_s: t + 1 } } : {}) }) as InjectStand;
    const inh = { regeln: { anzeige: { lagemeldung_s: 30 } } } as Parameters<typeof lageEinblendung>[0];
    const alle = [inj("I-01", 100), inj("I-02", 105), inj("I-03", 110, true), inj("I-04", 112)];
    const e = lageEinblendung(inh, alle, 115);
    expect(LAGEMELDUNG_MAX).toBe(2);
    expect(e.zeigen.map((i) => i.id)).toEqual(["I-04", "I-02"]);
    expect(e.weitere.map((i) => i.id)).toEqual(["I-01"]);
    // I-01 läuft weiter ab (30 s Spielzeit) und erscheint nicht mehr, wenn sie um ist
    expect(lageEinblendung(inh, alle, 131).zeigen.map((i) => i.id)).toEqual(["I-04", "I-02"]);
    expect(lageEinblendung(inh, alle, 131).weitere).toEqual([]);
  });

  it("J2.1: Mindestgröße 1280 × 600 – darunter gleichmäßig verkleinert; Prüfgrößen", () => {
    expect(MIN_FENSTER).toEqual({ breite: 1280, hoehe: 600 });
    expect(PRUEFGROESSEN).toEqual([[1536, 730], [1366, 650], [1530, 800], [1920, 960]]);
    for (const [b, h] of PRUEFGROESSEN) {
      expect(skalaFuer(b, h), `${b}×${h}`).toBe(1);
      expect(zuKlein(b, h)).toBe(false);
    }
    expect(skalaFuer(1100, 560)).toBeCloseTo(1100 / 1280, 6);
    expect(skalaFuer(1400, 540)).toBeCloseTo(540 / 600, 6);
    expect(zuKlein(1279, 700)).toBe(true);
    expect(fensterKennung({ breite: 1536, hoehe: 730 })).toBe("1536x730");
    expect(leseFensterKennung("1536x730")).toEqual({ breite: 1536, hoehe: 730 });
    expect(leseFensterKennung("0.9.0")).toBeNull();
    // die Ansicht rechnet mit 100 % (kein 100vh mehr), sonst stimmt die Verkleinerung nicht
    expect(css).toMatch(/\.rahmen \{[^}]*height: 100%;/);
  });

  it("J1.3: Wirkmittel als Kacheln, eine Zeile Warnung, Knöpfe immer an derselben Stelle", () => {
    const zb = quelle("ansichten/zb.tsx");
    expect(zb).toContain('class="wm-kacheln" data-tour="wirkmittel"');
    expect(zb).toContain("<WarnZeile");
    // Knöpfe stehen außerhalb der Bedingung „Meldung offen“ (immer da)
    expect(zb.indexOf('data-testid="zb-knoepfe"')).toBeGreaterThan(zb.indexOf("<WarnZeile"));
    expect(css).toMatch(/\.zb-knoepfe \{[^}]*margin-top: auto/);
    expect(css).toMatch(/section\.eingang \{[^}]*flex: 0 0 155px; height: 155px/);
    // die Regel trifft nicht die Zelle „Eingang“ in der Übersicht der Spielleitung
    expect(css).not.toMatch(/^\.eingang \{[^}]*height:/m);
  });
});
