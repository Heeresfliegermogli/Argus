// Szenario 2.1 (Änderungsliste A1–A9 nach dem Solo-Durchlauf am 25.10.2026): Durchbruch nicht aufgehaltener Gruppen
// mit Lagemeldung I-13, Feuer nach Schussrhythmus, Staub hinter fahrenden Fahrzeugen, Zonen ohne Kürzel, nur die 2. Kp.
// Gespielt mit den Modellteams naiv und ideal (wie tools/referenz/simuliere_durchlauf.py).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AssetManifest } from "../src/assets/typen";
import { bedingtStand } from "../src/engine/ablauf";
import { durchbruchGruppen, durchgebrochen } from "../src/kern/durchbruch";
import { bekannteZiele, effekte, schuesse, staubSpur } from "../src/kern/effekte";
import { position, vorhanden } from "../src/kern/geometrie";
import { weltFuer } from "../src/kern/lage";
import { pruefeWirkmittel } from "../src/kern/regeln";
import { welt } from "../src/kern/welt";
import { inhalte } from "./hilfen";
import { type Modellteam, spieleDurch } from "./modellteam";

const man = JSON.parse(readFileSync(fileURLToPath(new URL("../public/assets/manifest.json", import.meta.url)), "utf-8")) as AssetManifest;

let teams: Modellteam[] | null = null;
async function lauf(): Promise<Modellteam[]> {
  if (teams) return teams;
  const inh = await inhalte();
  teams = spieleDurch(inh, [{ name: "naiv", opt: { team: "naiv" } }, { name: "ideal", opt: { team: "ideal" } }]);
  return teams;
}

describe("Szenario 2.1: Daten", () => {
  it("nur noch die 2. Kompanie, Zonen mit sichtbaren Namen, Durchbruch-Gruppen mit Lagemeldung", async () => {
    const inh = await inhalte();
    const sz = inh.szenario;
    expect(Number(sz.version)).toBeGreaterThanOrEqual(2.1); // 2.2 baut auf 2.1 auf
    expect(sz.kraefte.map((k) => k.id)).toEqual(["K-2"]);
    expect(sz.zonen.map((z) => z.kurz)).toEqual(["Schule", "Ortschaft"]);
    expect(sz.durchbruch?.gruppen.length).toBeGreaterThanOrEqual(8);
    expect(sz.injects.find((i) => i.id === "I-13")?.bedingung?.typ).toBe("durchbruch");
    // sichtbare Texte ohne Zonen-Kürzel und ohne 3. Kp
    const sichtbar = JSON.stringify([sz.lage, sz.injects, sz.schluesselfaelle, sz.nebenfaelle, sz.meldungen.map((m) => [m.sensor, m.bild.beschreibung])]);
    expect(sichtbar).not.toMatch(/NS-01|EZ-01|3\. Kp|3\. Kompanie/);
  });

  it("Warnungen nennen die Zone beim Namen (R2 Schule, R3 Ortschaft), die ID bleibt intern", async () => {
    const inh = await inhalte();
    const schule = pruefeWirkmittel(inh, [650, 500], "MRS", 0).verstoesse.find((v) => v.regel === "R2")!;
    expect(schule.text).toMatch(/^Schule im Wirkradius/);
    expect(schule.zone).toBe("NS-01");
    const ort = pruefeWirkmittel(inh, [700, 360], "MRS", 0).verstoesse.find((v) => v.regel === "R3")!;
    expect(ort.text).toMatch(/^Ortschaft im Wirkradius/);
  });

  it("A1–A3: Spähtrupps über die Felder, Achse SÜD an der Schule vorbei", async () => {
    const inh = await inhalte();
    const z = inh.ziele;
    // NORD westlich der Ortschaft bis zur Brücke, HAUPT südlich der Ortschaft (östlich der Schule)
    expect(position(z["Z-03"], 300)[0]).toBeLessThan(500);
    expect(position(z["Z-01"], 200)[1]).toBeGreaterThan(420);
    // Achse SÜD: zwischen Ortschaft und Schule (y 405–425) zur Brücke Ost
    for (const id of ["Z-18", "Z-20", "Z-36"]) {
      const r = z[id].bewegung!.route;
      expect(r.some(([, x, y]) => x > 560 && x < 720 && y > 405 && y < 425), id).toBe(true);
    }
  });
});

describe("Szenario 2.1: Durchbruch (A4)", () => {
  it("Welt mit Durchbruch: Route ab t_s über die Brücke, Ausfahrt am Westrand", async () => {
    const inh = await inhalte();
    const g = inh.szenario.durchbruch!.gruppen.find((x) => x.id === "D-04")!;
    const w = welt(inh, [], ["D-04"]);
    const z27 = w.ziele["Z-27"];
    expect(position(z27, g.t_s - 1)).toEqual(position(inh.ziele["Z-27"], g.t_s - 1));
    expect(position(z27, g.ueber_s["Z-27"])[0]).toBeLessThan(440);
    expect(vorhanden(z27, 1499)).toBe(z27.bis_s! > 1499);
    expect(z27.bis_s).toBeCloseTo(g.routen["Z-27"][g.routen["Z-27"].length - 1][0], 6);
    // ohne Durchbruch bleibt die Standardroute
    expect(weltFuer(inh, { ...(await lauf())[1].z, durchbrueche: {} }).ziele["Z-27"].bis_s).toBeUndefined();
  });

  it("naiv: Freigabe auf die PT-91 → E-01 fällt aus, die letzten Feindkräfte brechen durch, I-13 kommt 10 s nach dem ersten über dem Bach", async () => {
    const [naiv] = await lauf();
    const inh = weltFuer(naiv.inh, naiv.z);
    const d = durchgebrochen(inh, naiv.z.durchbrueche, naiv.z.zerstoert, naiv.z.verstaerkungen);
    expect(d.fahrzeuge).toEqual(["Z-27", "Z-28"]);
    expect(naiv.z.durchbrueche["D-04"].durch).toBe(true);
    expect(naiv.z.injects["I-13"].erschienen.t_s).toBeCloseTo(d.erstesUeber! + 10, 1);
    // die Achse NORD hat die 2. Kp zerschlagen (aufgehalten)
    expect(naiv.z.durchbrueche["D-01"]).toMatchObject({ durch: false });
    expect(naiv.z.durchbrueche["D-01"].grund).toMatch(/zerstört/);
    // die Spielleitung sieht den Stand je Gruppe
    const st = bedingtStand(naiv.inh, naiv.z, 1500).filter((b) => b.art === "durchbruch");
    expect(st.find((b) => b.id === "D-04")?.status).toBe("ausgeloest");
    expect(st.find((b) => b.id === "D-01")?.status).toBe("entfaellt");
  });

  it("ideal: niemand bricht durch, kein I-13 (das Gefecht ist nicht zu „verlieren“, Durchbruch nur Kennzahl)", async () => {
    const [, ideal] = await lauf();
    const inh = weltFuer(ideal.inh, ideal.z);
    expect(durchgebrochen(inh, ideal.z.durchbrueche, ideal.z.zerstoert, ideal.z.verstaerkungen).fahrzeuge).toEqual([]);
    expect(ideal.z.injects["I-13"]).toBeUndefined();
    expect(Object.values(ideal.z.durchbrueche).every((x) => !x.durch)).toBe(true);
    expect(durchbruchGruppen(inh, ideal.z.verstaerkungen).every((g) => ideal.z.durchbrueche[g.id])).toBe(true);
  });
});

describe("Szenario 2.1: Animationen (A8)", () => {
  it("Mörser feuern nach Schussrhythmus, sichtbar erst, wenn die Rolle sie kennt; nach der Zerstörung nicht mehr", async () => {
    const [naiv] = await lauf();
    const inh = weltFuer(naiv.inh, naiv.z);
    const z06 = inh.ziele["Z-06"];
    const plan = schuesse(z06.feuert);
    expect(plan.length).toBeGreaterThan(40);
    const alle = effekte(inh, naiv.z, "alle").filter((e) => e.id.startsWith("Z-06-s"));
    const tz = naiv.z.zerstoert["Z-06"];
    expect(tz).toBeDefined();
    expect(alle.length).toBeGreaterThan(0);
    expect(alle.every((e) => e.t < tz && e.art === "muendung" && e.quelle.feuert === "moerser")).toBe(true);
    // Zielprüfung kennt Z-06 aus M05, das Plenum (Umgebung) sieht keine Schüsse
    expect(effekte(inh, naiv.z, bekannteZiele(inh, naiv.z, "g2")).some((e) => e.id.startsWith("Z-06-s"))).toBe(true);
    expect(effekte(inh, naiv.z, "umgebung").some((e) => e.id.startsWith("Z-06-s"))).toBe(false);
    // BMP-2 an der Brücke: Kanone nach Westen (Richtung 2. Kp)
    const z18 = effekte(inh, naiv.z, "alle").filter((e) => e.id.startsWith("Z-18-s"));
    expect(z18.length).toBeGreaterThan(0);
    expect(z18.every((e) => e.quelle.feuert === "kanone" && Math.abs(Math.abs(e.richtung!) - 180) < 30)).toBe(true);
  });

  it("Staub nur hinter fahrenden Fahrzeugen; Atlas hat Abschussrauch und Staub", async () => {
    const inh = await inhalte();
    const r01 = inh.ziele["Z-01"].bewegung!.route;
    expect(staubSpur(r01, 40).length).toBeGreaterThan(2);       // fährt über die Felder
    expect(staubSpur(r01, 200)).toEqual([]);                    // hält östlich der Schule
    expect(staubSpur(r01, 40, 30).every((w) => w.alter >= 10)).toBe(true); // nach dem Halt (Zerstörung) keine neuen Wolken
    const zu = man.effekte.zuordnung;
    expect(man.effekte.animationen[zu.abschuss!.moerser]).toBeDefined();
    expect(man.effekte.animationen[zu.fahrt!]).toBeDefined();
  });
});
