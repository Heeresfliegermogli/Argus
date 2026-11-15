// Liste N (15.11.2026): Testpult – ein Fenster, drei Reiter (Spielleitung · Zielbearbeitung · Plenum). Die Bedienung prüft
// tools/testpult_probe.py im Browser; hier Adressen, Einstellungen, die Marke am Reiter und Festlegungen im Quelltext.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PULT_RAUM, leseEinstellungen, pultFensterAdresse, testpultAdresse } from "../src/config";
import { PULT_REITER, zbMarke } from "../src/ansichten/testpult";

const quelle = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf-8");

describe("Testpult: Adressen und Einstellungen (N1.1, N1.6)", () => {
  const g = globalThis as { location?: unknown };
  let alt: unknown;
  beforeEach(() => {
    alt = g.location;
    g.location = { pathname: "/Argus/", search: "" };
  });
  afterEach(() => {
    g.location = alt;
  });

  it("das Pult hat eine eigene Adresse; jeder Reiter ist lokal im Raum „pult“", () => {
    expect(testpultAdresse({ szenario: "szenario_kraehe_01.json" })).toBe("/Argus/?testpult=1");
    for (const r of PULT_REITER) {
      const u = new URLSearchParams(pultFensterAdresse({ szenario: "szenario_kraehe_01.json" }, r).split("?")[1]);
      expect(Object.fromEntries(u)).toEqual({ rolle: r, raum: PULT_RAUM, sync: "lokal", pult: "1" });
    }
    expect(PULT_RAUM).toBe("pult");
  });

  it("ein Reiter ist immer lokal und im Raum „pult“ – unabhängig von Adresse und gemerkter Wahl der Startseite", () => {
    localStorage.setItem("argus:einst:sync", "firebase");
    const e = leseEinstellungen("?rolle=zb&raum=kraehe&sync=firebase&pult=1");
    expect(e).toMatchObject({ rolle: "zb", raum: "pult", sync: "lokal", pult: true });
    // ohne pult=1 bleibt alles wie bisher
    expect(leseEinstellungen("?rolle=zb&raum=kraehe")).toMatchObject({ raum: "kraehe", sync: "firebase" });
    expect(leseEinstellungen("?rolle=zb&raum=kraehe").pult).toBeUndefined();
    // in einer Sitzung mit Lobby gibt es kein Pult
    expect(leseEinstellungen("?sitzung=K7P&rolle=sl&pult=1").pult).toBeUndefined();
    localStorage.removeItem("argus:einst:sync");
  });
});

describe("Testpult: Marke am Reiter Zielbearbeitung (N1.4)", () => {
  const stand = { lauf: "L1", eingang: 2, meldungen: 3, begonnen: true, ende: false, rechnet: true, entfernt: false };
  it("Zahl der neuen Meldungen im Eingang; „neu“, wenn seit dem letzten Blick eine Meldung kam", () => {
    expect(zbMarke(stand, { lauf: "L1", n: 3 })).toEqual({ zahl: 2, neu: false, achtung: false });
    expect(zbMarke(stand, { lauf: "L1", n: 2 })).toEqual({ zahl: 2, neu: true, achtung: false });
    // neuer Lauf (Neues Spiel): jede Meldung ist neu
    expect(zbMarke({ ...stand, lauf: "L2", meldungen: 1, eingang: 1 }, { lauf: "L1", n: 3 }).neu).toBe(true);
    expect(zbMarke({ ...stand, lauf: "L2", meldungen: 0, eingang: 0 }, { lauf: "L1", n: 3 })).toEqual({ zahl: 0, neu: false, achtung: false });
  });
  it("nach Spielende keine Zahl; „Testraum geleert“ als Achtung", () => {
    expect(zbMarke({ ...stand, ende: true }, { lauf: "L1", n: 0 })).toEqual({ zahl: 0, neu: false, achtung: false });
    expect(zbMarke({ ...stand, entfernt: true }, { lauf: "L1", n: 3 }).achtung).toBe(true);
    expect(zbMarke(null, { lauf: null, n: 0 })).toEqual({ zahl: 0, neu: false, achtung: false });
  });
});

describe("Testpult: Festlegungen im Quelltext", () => {
  it("N1.1/N1.5: drei Reiter in fester Reihenfolge, Startreiter Zielbearbeitung, gewählter Reiter im sessionStorage", () => {
    expect(PULT_REITER).toEqual(["sl", "zb", "plenum"]);
    const pult = quelle("ansichten/testpult.tsx");
    expect(pult).toContain('const START_REITER: PultReiter = "zb"');
    expect(pult).toMatch(/sessionStorage\.setItem\(k, v\)/);
    expect(pult).toContain("So geht’s:");
    expect(pult).toContain("◂ Startseite");
  });

  it("N1.2: verdeckte Reiter über visibility (nicht display: none), alle drei Frames bleiben stehen; Leiste 34 px", () => {
    const css = quelle("stil/basis.css");
    const regel = css.slice(css.indexOf(".pult-flaeche iframe {"), css.indexOf(".pult-flaeche iframe.vorn"));
    expect(regel).toContain("visibility: hidden");
    expect(regel).not.toMatch(/display:\s*none/);
    expect(css).toMatch(/--pult-leiste: 34px/);
    // Frames werden nie abgebaut: immer alle drei gerendert, nur die Klasse „vorn“ wechselt
    const pult = quelle("ansichten/testpult.tsx");
    expect(pult).toMatch(/PULT_REITER\.map\(\(r\) => \(\s*<iframe/);
  });

  it("N1.3: im Pult kein Reiter „Zielbearbeitung (nur lesen)“ und kein „Team-Fenster öffnen“, dafür „→ Reiter Zielbearbeitung“", () => {
    const slf = quelle("ansichten/sl-fenster.tsx");
    expect(slf).toContain('{!pult && <div class="sl-rollen" role="tablist">');
    expect(slf).toContain("→ Reiter Zielbearbeitung");
    const sl = quelle("ansichten/sl.tsx");
    expect(sl).toContain("imPult() ? <ZurZielbearbeitung /> : <TeamFensterKnopf />");
  });

  it("N1.6: das Pult merkt sich weder Sync noch Raum der Startseite", () => {
    expect(quelle("main.tsx")).toContain("if (!e.pult) merken(e);");
  });
});
