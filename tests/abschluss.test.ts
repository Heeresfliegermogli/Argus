// Liste M (M4.6): Abschlussbild „Gefecht beendet“ – Zahlen gleich der Bilanz der Auswertung (naiv, ideal, ARGUS allein, ohne Eingriff),
// keine Fehlgriffe einzeln, keine Figuren (Trupps nur als Zahl), keine Zeiten und kein €; die Karten im Plenum in fester Reihenfolge.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { argusAllein, spieleAutomatisch } from "../src/engine/referenzlauf";
import type { Inhalte } from "../src/inhalte/typen";
import { abschluss, istFigur, kurzName, weitereText } from "../src/kern/abschluss";
import { auswerten } from "../src/kern/auswertung";
import { bilanz } from "../src/kern/bilanz";
import { weltFuer } from "../src/kern/lage";
import type { Spielzustand } from "../src/kern/zustand";
import { inhalte } from "./hilfen";
import { type DrehbuchReferenz, drehbuchTeams, spieleDurch } from "./modellteam";

const ref = JSON.parse(readFileSync(new URL("./referenz_durchlauf.json", import.meta.url), "utf-8")) as DrehbuchReferenz;

let cache: { inh: Inhalte; laeufe: { name: string; z: Spielzustand; protokoll: import("../src/kern/ereignisse").Ereignis[] }[] } | null = null;
async function laeufe() {
  if (cache) return cache;
  const inh = await inhalte();
  const teams = spieleDurch(inh, drehbuchTeams(ref));
  const argus = argusAllein(inh);
  const passiv = spieleAutomatisch(inh, null);
  cache = {
    inh,
    laeufe: [
      ...teams.map((m) => ({ name: `${m.name} ${m.opt.team}`, z: m.z, protokoll: m.kanal.protokoll })),
      { name: "ARGUS allein", z: argus.z, protokoll: argus.protokoll },
      { name: "ohne Eingriff", z: passiv.z, protokoll: passiv.protokoll },
    ],
  };
  return cache;
}

describe("M4: Abschlussbild „Gefecht beendet“", () => {
  it("M4.6: Zahlen = Bilanz der Auswertung – Fahrzeuge (Sprites + Trupps), eigene Panzer; Wirkmittel = Bestand", async () => {
    const { inh, laeufe: ls } = await laeufe();
    const a = auswerten(inh, ls.slice(0, 5).map((l, i) => ({ id: `t${i}`, name: l.name, farbe: "#888", zustand: l.z, protokoll: l.protokoll })));
    ls.forEach((l, i) => {
      const ab = abschluss(inh, l.z)!;
      const b = bilanz(inh, l.z)!;
      if (i < 5) expect(a.teams[i].bilanz, l.name).toEqual(b);
      const welt = weltFuer(inh, l.z);
      const trupps = b.fahrzeugIds.filter((id) => istFigur(welt.fahrzeuge[welt.ziele[id].typ]));
      expect(ab.feindSumme + trupps.length, l.name).toBe(b.fahrzeuge);
      expect(ab.feind.reduce((s, f) => s + f.n, 0), l.name).toBe(ab.feindSumme);
      expect({ bereit: ab.bereit, gesamt: ab.gesamt }, l.name).toEqual(b.panzer);
      expect(ab.panzer.map((p) => p.name), l.name).toEqual(["1/1", "1/2", "1/3", "1/4"]);
      expect(ab.panzer.filter((p) => p.stufe !== "ausgefallen").length, l.name).toBe(ab.bereit);
      for (const w of ab.wirkmittel) expect(w.verbraucht, `${l.name} ${w.id}`).toBe(w.bestand - (l.z.bestand[w.id] ?? 0));
      expect(ab.wirkmittel.map((w) => w.id), l.name).toEqual(["MRS", "LM"]);
      // Trupps und Infanterie nie als Sprite (keine Figuren)
      for (const f of ab.feind) expect(istFigur(inh.fahrzeuge[f.typ]), `${l.name} ${f.typ}`).toBe(false);
      // weitere ≥ Trupps; Fehlgriffe zählen mit (je Objekt bzw. Personengruppe einmal)
      expect(ab.weitere, l.name).toBeGreaterThanOrEqual(trupps.length + (b.fehlSumme > 0 ? 1 : 0));
    });
    // naiv 4/4, ideal 3/4 (Kalibrierung) – im Abschlussbild genauso
    expect(abschluss(inh, ls[0].z)!.bereit).toBe(4);
    expect(abschluss(inh, ls[1].z)!.bereit).toBe(3);
    // ohne Eingriff: nichts abgeschossen, nichts weiter
    expect(abschluss(inh, ls[6].z)).toMatchObject({ feind: [], feindSumme: 0, weitere: 0 });
  });

  it("M4.3: naiv – Fehlgriffe (Attrappe, Sanität, PT-91, Zivilpersonen, Kamerateam, weißes Tuch) nur in der neutralen Zahl, nicht einzeln", async () => {
    const { inh, laeufe: ls } = await laeufe();
    const ab = abschluss(inh, ls[0].z)!;
    const typen = ab.feind.map((f) => f.typ);
    for (const t of ["attrappe_kpz", "san_rad", "kpz_pt91", "pkw_presse", "pkw_zivil", "traktor", "moerser_trupp", "beobachter_trupp", "verwundete"]) {
      expect(typen, t).not.toContain(t);
    }
    const b = bilanz(inh, ls[0].z)!;
    expect(b.fehl.attrappe + b.fehl.verbuendet + b.fehl.sanitaet).toBeGreaterThan(0);
    // naiv traf: Attrappe, Sanitätsfahrzeug, drei PT-91, Zivilpersonen u. a. – alles in einer Zahl
    expect(ab.weitere).toBeGreaterThanOrEqual(1 + 1 + 3);
    const text = JSON.stringify(ab);
    expect(text).not.toMatch(/Attrappe|Sanität|PT-91|verbündet|Zivil|Kind|Kamera|Presse|Tuch|Mio|€|sek|t_s/);
    expect(weitereText(ab.weitere)).toBe(`Dazu ${ab.weitere} weitere bekämpfte Ziele – mehr in der Auswertung.`);
  });

  it("Texte: Kurzname je Typ, neutrale Zeile ohne Zahl, wenn nichts weiter getroffen wurde", async () => {
    const inh = await inhalte();
    // nur Typen, die abgeschossen erscheinen können (Feindfahrzeuge mit Spielwert, keine Trupps)
    const werte = inh.regeln.bilanz!.fahrzeuge_mio_eur;
    const namen = Object.values(inh.fahrzeuge).filter((f) => !istFigur(f) && werte[f.id] !== undefined).map((f) => kurzName(f.name));
    expect(namen).toContain("KPz T-72");
    expect(namen).toContain("SPz BMP-2");
    expect(namen).toContain("SPW BTR-80");
    expect(namen).toContain("SpähPz BRDM-2");
    expect(namen).toContain("Lkw Ural");
    for (const n of namen) expect(n.length, n).toBeLessThanOrEqual(24);
    expect(weitereText(0)).toBe("Mehr in der Auswertung.");
    expect(weitereText(1)).toBe("Dazu 1 weiteres bekämpftes Ziel – mehr in der Auswertung.");
  });

  it("M4.5: Plenum und Übersicht – Karten in der Reihenfolge der Lobby, keine Summe, kein Sortieren", () => {
    const quelle = (f: string) => readFileSync(new URL(`../src/ansichten/${f}`, import.meta.url), "utf-8");
    const ab = quelle("gemeinsam/abschluss.tsx");
    const uebersicht = ab.slice(ab.indexOf("export function AbschlussUebersicht"));
    expect(uebersicht).toContain("p.teams.map(");
    expect(uebersicht).not.toMatch(/\.sort\(|reduce\(/);
    // seit Liste O: „Gefecht beendet“ ist Kapitel 1 des kurzen Plenums (auswertung.tsx); das Plenum schaltet nach Spielende dorthin
    const fenster = quelle("sl-fenster.tsx");
    expect(fenster).toContain('alleEnde ? "auswertung" : "spiel"');
    expect(quelle("auswertung.tsx")).toContain("<AbschlussUebersicht inh={p.inh} teams={p.teams}");
    expect(quelle("uebersicht.tsx")).toContain("<AbschlussUebersicht");
    expect(quelle("gemeinsam/rahmen.tsx")).toContain("<AbschlussBild");
  });
});
