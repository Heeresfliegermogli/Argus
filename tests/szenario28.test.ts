// Szenario 2.8 (Änderungsliste M, Test „allein testen“ vom 15.11.2026):
//   M3.1 Jede Feuerquelle meldet sich mit ihrem ersten Einschlag bei den eigenen Panzern (höchstens erste_quelle_s = 3 s danach) –
//        die Feuervorbereitung H-01 um 05:00, H-04 um 13:35, H-12 um 19:50; alle übrigen Druckmeldungen bleiben wie in 2.7.
//   M3.2 I-03 „Zielbearbeitung dauert zu lange …“ gestrichen.
//   M3.3 Nach der Auflösung A-01 zeigt kein PT-91 mehr ein Feindzeichen; die drei stehen als EIN blaues Zeichen Größe Zug da.
// Gespielt mit der echten Engine: „ohne Eingriff“, „ARGUS allein“ und die Modellteams naiv/ideal (wie tests/szenario27.test.ts).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { argusAllein, spieleAutomatisch } from "../src/engine/referenzlauf";
import type { Inhalte } from "../src/inhalte/typen";
import { zustandBis } from "../src/kern/auswertung";
import { weltFuer } from "../src/kern/lage";
import { lagebildZielmeldungen, zeichenVerbuendet } from "../src/kern/lagebild";
import { warteschlange } from "../src/kern/sichten";
import { druckmeldungen, verlustLage, verlustStand, vorbereitungen } from "../src/kern/verluste";
import type { Spielzustand } from "../src/kern/zustand";
import { inhalte } from "./hilfen";
import { type DrehbuchReferenz, drehbuchTeams, spieleDurch } from "./modellteam";

const ref = JSON.parse(readFileSync(new URL("./referenz_durchlauf.json", import.meta.url), "utf-8")) as DrehbuchReferenz;
const PT91 = ["Z-15", "Z-16", "Z-17"];

let cache: { inh: Inhalte; laeufe: { name: string; z: Spielzustand }[]; passiv: ReturnType<typeof spieleAutomatisch> } | null = null;
async function laeufe() {
  if (cache) return cache;
  const inh = await inhalte();
  const passiv = spieleAutomatisch(inh, null);
  const [naiv, ideal] = spieleDurch(inh, drehbuchTeams(ref).slice(0, 2));
  cache = { inh, passiv, laeufe: [{ name: "ohne Eingriff", z: passiv.z }, { name: "ARGUS allein", z: argusAllein(inh).z }, { name: "naiv", z: naiv.z }, { name: "ideal", z: ideal.z }] };
  return cache;
}

/** Erster Einschlag je Feuerquelle (Feuervorbereitung: erster Einschlag überhaupt) – unabhängig von druckmeldungen() bestimmt. */
function ersteEinschlaege(inh: Inhalte, z: Spielzustand): Map<string, number> {
  const out = new Map<string, number>();
  for (const h of inh.szenario.hintergrund?.ereignisse ?? []) {
    if (h.art === "feindartillerie" && h.einschlaege[0][0] < inh.szenario.spieluhr.dauer_s) out.set(h.id, h.einschlaege[0][0]);
  }
  for (const e of verlustLage(inh, z).ereignisse) if (!out.has(e.quelle)) out.set(e.quelle, e.t);
  return out;
}

describe("Szenario 2.8: Daten", () => {
  it("Version 2.8; I-03 gestrichen (auch „30 s je Meldung“ in der Diskussion); I-12 nur noch der Angriff; erste_quelle an", async () => {
    const inh = await inhalte();
    expect(["2.8", "2.9"]).toContain(inh.szenario.version); // 2.9 baut auf 2.8 auf (P)
    expect(inh.regeln.version).toBe(inh.szenario.version);
    expect(inh.szenario.meldungen.filter((m) => !m.bedingung)).toHaveLength(37);
    expect(inh.szenario.injects.map((i) => i.id)).not.toContain("I-03");
    expect(inh.injects["I-03"]).toBeUndefined();
    const roh = JSON.stringify(inh.szenario);
    expect(roh).not.toContain("I-03");
    expect(roh).not.toContain("30 s je Meldung");
    expect(inh.injects["I-12"].text).toBe("Feind greift mit einer Kp an: Richtung Furt, durch KRÄHE und an der Schule vorbei.");
    expect(inh.regeln.verluste!.meldungen).toMatchObject({ erste_quelle: true, erste_quelle_s: 3 });
    const h = Object.fromEntries((inh.szenario.hintergrund?.ereignisse ?? []).map((x) => [x.id, x]));
    expect(h["H-01"]).toMatchObject({ art: "feindartillerie", panzer: ["pz1", "pz2"] });
    expect(h["H-04"]).toMatchObject({ art: "feindartillerie", panzer: ["pz1", "pz2", "pz3", "pz4"] });
    expect(h["H-12"]).toMatchObject({ art: "feindartillerie", panzer: ["pz1"] });
    const a01 = inh.szenario.aufloesungen!.find((a) => a.id === "A-01")!;
    expect(a01).toMatchObject({ name: "PL-PzZug (verbündet)", groesse: "zug", getroffen: { name: "PL-PzZug (verbündet, getroffen)" } });
    // Lagemeldungen dürfen weiter von der PL-PzKp sprechen
    expect(inh.injects["I-17"].text).toContain("PL-PzKp");
  });

  it("Feuervorbereitungen: H-01 05:00 auf 1/1 und 1/2, H-04 13:35 auf alle vier, H-12 19:50 auf 1/1", async () => {
    const inh = await inhalte();
    expect(vorbereitungen(inh)).toEqual([
      { t: 300, quelle: "H-01", panzer: ["pz1", "pz2"] },
      { t: 815, quelle: "H-04", panzer: ["pz1", "pz2", "pz3", "pz4"] },
      { t: 1190, quelle: "H-12", panzer: ["pz1"] },
    ]);
  });
});

describe("M3.1: erster Einschlag bei uns → sofort eine Meldung", () => {
  it("jede Feuerquelle meldet sich ≤ 3 s nach ihrem ersten Einschlag – ohne Eingriff, ARGUS allein, naiv, ideal (Meldung im Protokoll)", async () => {
    const { inh, laeufe: ls } = await laeufe();
    const grenze = inh.regeln.verluste!.meldungen.erste_quelle_s!;
    for (const { name, z } of ls) {
      const dm = verlustLage(inh, z).meldungen;
      const erste = ersteEinschlaege(inh, z);
      expect(erste.size, name).toBeGreaterThan(5);
      for (const [q, t0] of erste) {
        const m = dm.find((x) => x.quelle === q);
        expect(m, `${name}: ${q} ohne Meldung`).toBeDefined();
        const im = z.injects[m!.id];
        expect(im, `${name}: ${q} ${m!.id} nicht im Protokoll`).toBeDefined();
        expect(im.erschienen.t_s - t0, `${name}: ${q} erster Einschlag ${t0} s, Meldung ${im.erschienen.t_s} s`).toBeLessThanOrEqual(grenze);
        expect(im.erschienen.t_s, `${name}: ${q}`).toBeGreaterThanOrEqual(t0 - 1e-6);
        expect(im.text).toBe(m!.text);
      }
    }
  });

  it("H-01 um 05:00 (bis 2.7 ohne Meldung), H-04 um 13:35 statt I-12 um 14:40, H-12 um 19:50 – Text nach Vorlage", async () => {
    const { laeufe: ls } = await laeufe();
    for (const { name, z } of ls) {
      const k = (t: number) => Object.values(z.injects).find((i) => i.id.startsWith("K-") && Math.abs(i.erschienen.t_s - t) < 1e-6);
      expect(k(300)?.text, name).toBe("1/1 und 1/2 unter Artilleriefeuer, Einschläge noch daneben. Halten Stellung.");
      expect(k(815)?.text, name).toBe("1/1 bis 1/4 unter Artilleriefeuer, Einschläge noch daneben. Halten Stellung.");
      expect(k(1190)?.text, name).toBe("1/1 unter Artilleriefeuer, Einschläge noch daneben. Halten Stellung.");
      expect(z.injects["K-01"].erschienen.t_s, name).toBe(300); // die erste Meldung über Beschuss kommt um 05:00 (2.7: 06:12)
      // keine doppelte Meldung zu H-04: I-12 spricht nur noch vom Angriff
      expect(z.injects["I-12"].text ?? "", name).not.toMatch(/Artillerie/);
    }
  });

  it("die erste Meldung je Quelle kommt dazu – alle Meldungen von 2.7 bleiben, in derselben Reihenfolge und mit demselben Text", async () => {
    const { inh, laeufe: ls } = await laeufe();
    const alt: Inhalte = { ...inh, regeln: { ...inh.regeln, verluste: { ...inh.regeln.verluste!, meldungen: { ...inh.regeln.verluste!.meldungen, erste_quelle: false } } } };
    for (const { name, z } of ls) {
      const vl = verlustLage(inh, z);
      const neu = druckmeldungen(vl.welt, vl.ereignisse);
      const vorher = druckmeldungen({ ...vl.welt, regeln: alt.regeln }, vl.ereignisse);
      const schl = (m: { t: number; zug: string; stufe: number; text: string }) => `${m.t}|${m.zug}|${m.stufe}|${m.text}`;
      const rest = neu.map(schl);
      let i = 0;
      for (const m of vorher.map(schl)) {
        i = rest.indexOf(m, i);
        expect(i, `${name}: ${m} fehlt`).toBeGreaterThanOrEqual(0);
        i++;
      }
      expect(neu.length, name).toBeGreaterThan(vorher.length);
    }
  });

  it("Kalibrierung bleibt: naiv 4/4 einsatzbereit, ideal 3/4", async () => {
    const { inh, laeufe: ls } = await laeufe();
    const ende = inh.szenario.spieluhr.dauer_s;
    expect(verlustStand(inh, ls[2].z, ende)!.zug.bereit).toBe(4);
    expect(verlustStand(inh, ls[3].z, ende)!.zug.bereit).toBe(3);
  });
});

describe("M3.2: I-03 gestrichen", () => {
  it("kommt in keinem Lauf mehr", async () => {
    const { laeufe: ls, passiv } = await laeufe();
    for (const { name, z } of ls) expect(z.injects["I-03"], name).toBeUndefined();
    expect(passiv.protokoll.some((e) => e.typ === "inject" && (e.daten as { inject?: string }).inject === "I-03")).toBe(false);
  });
});

describe("M3.3: PT-91 nach der Auflösung", () => {
  it("ohne Eingriff: ab 21:45 kein Feindzeichen mehr an einem PT-91 – ein blaues Zeichen Größe Zug, kein Teil-, Wrack- oder Kontaktzeichen", async () => {
    const { inh, passiv } = await laeufe();
    const z = passiv.z;
    expect(z.aufloesungen["A-01"].t_s).toBeCloseTo(1305, 1);
    expect(zeichenVerbuendet(false, false, "zug")).toBe("SFGPUCA----D---");
    // bis 2.7 bekam der dritte PT-91 (mehr als 40 m hinter dem ersten) ein eigenes Zeichen mit dem Feindzeichen von ARGUS
    for (let t = 1306; t <= inh.szenario.spieluhr.dauer_s; t += 4) {
      const zt = zustandBis(inh, passiv.protokoll, t).z;
      const lb = lagebildZielmeldungen(weltFuer(inh, zt), zt, t);
      const pt = lb.objekte.filter((o) => o.meldungen?.includes("M20") || PT91.some((id) => o.id.includes(id)));
      expect(pt.map((o) => o.id), `t=${t}`).toEqual(["Z-15–17"]);
      expect(pt[0]).toMatchObject({ verbuendet: true, text: "PL-PzZug (verbündet)", sidc: "SFGPUCA----D---" });
      expect(pt[0].menge).toBeUndefined();
      // Meldungsmarke und Drohnenbild-Rahmen: M20 ist nicht mehr im Eingang (nichts zu öffnen)
      expect(warteschlange(zt).map((x) => x.id), `t=${t}`).not.toContain("M20");
    }
    // vorher wie ARGUS meldet (Feind)
    const z0 = zustandBis(inh, passiv.protokoll, 1300).z;
    const v0 = lagebildZielmeldungen(weltFuer(inh, z0), z0, 1300).objekte.find((o) => o.meldungen?.includes("M20"))!;
    expect(v0.sidc[1]).toBe("H");
  });

  it("nach Eigenbeschuss (naiv, I-08a): „PL-PzZug (verbündet, getroffen)“, kein PT-91 mehr mit Feindzeichen", async () => {
    const { inh, laeufe: ls } = await laeufe();
    const z = ls[2].z;
    const t8 = z.injects["I-08a"].erschienen.t_s;
    for (const t of [Math.ceil(t8) + 1, 1350, 1400, 1490]) {
      const lb = lagebildZielmeldungen(weltFuer(inh, z), z, t);
      const pt = lb.objekte.filter((o) => o.meldungen?.includes("M20") || PT91.some((id) => o.id.includes(id)));
      expect(pt.length, `t=${t}`).toBe(1);
      expect(pt[0].text).toBe("PL-PzZug (verbündet, getroffen)");
      expect(pt[0].sidc.slice(0, 2)).toBe("SF");
      expect(pt[0].sidc[11]).toBe("D");
    }
  });
});
