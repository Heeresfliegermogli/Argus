// Szenario 2.5 (Änderungsliste F vom 02.11.2026, „Panzerzug“): eigene Truppe ist die 1./PzBtl 613 (Absender „1. Kp“, seit dem Folgeauftrag F5; vorher 1. Zug der PzKp W.) mit vier
// Kampfpanzern Leopard 2A7V (F1), Feindfeuer mit Einschießen und Zustand je Panzer (F2), „Schule“ statt „Schule mit Sportplatz“ (F3).
// Engine = Simulation (Zeitlinie, Zustand je Panzer, Druckmeldungen bitgleich) prüft tests/durchlauf.test.ts, die Kalibrierung F2.9
// tests/szenario24.test.ts („Kalibrierung“) und dieser Test an den Referenzläufen.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dist } from "../src/kern/geometrie";
import { druckmeldungen, einschuss, panzer, stand, zeitlinie, zug, type VerlustEreignis } from "../src/kern/verluste";
import { inhalte } from "./hilfen";

type RefZeile = [number, string, string, string, number, string, number, number, boolean, [number, number]];
const ref = JSON.parse(readFileSync(new URL("./referenz_durchlauf.json", import.meta.url), "utf-8")) as {
  laeufe: { team: string; einspielen: Record<string, number>; faelle: Record<string, boolean>; verluste: { zeitlinie: RefZeile[] } }[];
};
const WURZEL = fileURLToPath(new URL("../", import.meta.url));

/** Feindfeuer ohne jede eigene Bekämpfung (schlimmster Fall) und die Zeitlinien der fünf Referenzläufe */
async function alleLaeufe(): Promise<{ name: string; ev: Pick<VerlustEreignis, "t" | "panzer" | "quelle" | "art" | "ergebnis" | "schaden" | "zustand" | "ausgefallen">[] }[]> {
  const inh = await inhalte();
  return [
    { name: "ohne Bekämpfung", ev: zeitlinie(inh, {}, null, []) },
    ...ref.laeufe.map((l, i) => ({
      name: `${l.team} ${i}`,
      ev: l.verluste.zeitlinie.map(([t, pz, quelle, art, , ergebnis, schaden, zustand, ausgefallen]) => ({ t, panzer: pz, quelle, art: art as VerlustEreignis["art"], ergebnis: ergebnis as VerlustEreignis["ergebnis"], schaden, zustand, ausgefallen })),
    })),
  ];
}

describe("Szenario 2.5: F1 eigene Truppe", () => {
  it("F1.1/F1.2/F5: 1./PzBtl 613, vier Leopard 2A7V einzeln am Westrand (1/2 55,365 · 1/1 55,412 · 1/3 55,470 · 1/4 50,530)", async () => {
    const inh = await inhalte();
    expect(inh.szenario.version).toBe("2.5");
    const et = inh.szenario.eigene_truppe!;
    expect(et).toMatchObject({ einheit: "1./PzBtl 613", uebergeordnet: "PzBtl 613", name: "1. Kp", fahrzeug: "kpz_leo2a7v" });
    expect(et.panzer.map((p) => [p.name, p.pos])).toEqual([["1/1", [55, 412]], ["1/2", [55, 365]], ["1/3", [55, 470]], ["1/4", [50, 530]]]);
    expect(et.panzer.every((p) => p.hdg === 0)).toBe(true); // Blick nach Osten
    // Sprite eigen in drei Zuständen, Zeichen Kampfpanzer
    const f = inh.fahrzeuge.kpz_leo2a7v;
    expect(f.symbol?.art).toBe("kampfpanzer");
    const atlas = JSON.parse(readFileSync(join(WURZEL, "public/assets/sprites/fahrzeuge.json"), "utf-8")) as { frames: Record<string, unknown> };
    for (const s of [f.sprite, f.sprite_eingeschraenkt, f.sprite_wrack]) expect(atlas.frames[s!], String(s)).toBeDefined();
    // kein Gefechtsstand, keine Züge mehr
    expect((et as unknown as Record<string, unknown>).zuege).toBeUndefined();
    expect(inh.szenario.kraefte.filter((k) => k.zugehoerigkeit === "eigen").map((k) => k.name)).toEqual(["1./PzBtl 613"]);
    expect(inh.fahrzeuge.pz_zug.symbol?.groesse).toBe("E"); // F5: Größenangabe Kompanie
  });

  it("F1.4: Wirkmittel „1. Kp (Kanone 120 mm)“ – 5 m, ca. 5 s, unbegrenzt, bis zum Bach, je Fahrzeug ein Schuss", async () => {
    const inh = await inhalte();
    expect(inh.wirkmittel.PZA).toMatchObject({ name: "1. Kp (Kanone 120 mm)", kurz: "Kanone", wirkradius_m: 5, vorlauf_s: 5, bestand: null, einsatzbereich: { x_max: 500 }, zug: { art: "je_fahrzeug" } });
  });

  it("F1.5: Hintergrundgefecht schießt von den Panzern; N2 und das Wrack an der Brücke bleiben", async () => {
    const inh = await inhalte();
    const ids = new Set(panzer(inh).map((p) => p.id));
    const pza = inh.szenario.hintergrund!.ereignisse.filter((h) => h.art === "panzerabwehr");
    expect(pza.length).toBeGreaterThan(5);
    for (const h of pza) expect(ids.has(h.von!), h.id).toBe(true);
    for (const l of ref.laeufe.slice(0, 4)) expect(l.faelle.N2, l.team).toBe(true);
  });
});

describe("Szenario 2.5: F2 Feindfeuer auf die eigenen Panzer", () => {
  it("F2.3: Einschießen deterministisch – direkt 1–2 daneben, 3 nah, ab 4 jeder zweite, ab 8 jeder; Steilfeuer 1–2 daneben, ab 3 im Ziel", async () => {
    const vr = (await inhalte()).regeln.verluste!;
    expect(Array.from({ length: 10 }, (_, i) => einschuss(vr, "direkt", i + 1))).toEqual(
      ["daneben", "daneben", "nah", "treffer", "nah", "treffer", "nah", "treffer", "treffer", "treffer"]);
    for (const a of ["steil", "beobachter"] as const) {
      expect(Array.from({ length: 4 }, (_, i) => einschuss(vr, a, i + 1))).toEqual(["daneben", "daneben", "treffer", "treffer"]);
    }
  });

  it("F2.1–F2.3: Direktschützen erst ab x ≤ 560 m, im Takt ihrer Waffe; Einschießen je Schütze und Ziel; erster T-72-Treffer ≥ 45 s nach dem ersten Schuss", async () => {
    const inh = await inhalte();
    const vr = inh.regeln.verluste!;
    expect(vr.feuer_ab_x).toBe(560);
    expect(Object.fromEntries(["kpz_t72", "spz_bmp2", "spw_btr80"].map((w) => [w, vr.waffen[w].takt_s]))).toEqual({ kpz_t72: 15, spz_bmp2: 10, spw_btr80: 12 });
    const pl = new Map(panzer(inh).map((p) => [p.id, p]));
    for (const [zerstoert, name] of [[{}, "ohne"], [{ "Z-06": 400, "Z-19": 1100 }, "Mörser bekämpft"]] as const) {
      const ev = zeitlinie(inh, zerstoert, null, []);
      expect(ev).toEqual(zeitlinie(inh, zerstoert, null, [])); // deterministisch
      // Schützen mit feuert (Schutzschild-SPz S5, BMP-2 Brücke Ost) wirken nach Drehbuch, unabhängig von der Entfernung
      const direkt = ev.filter((e) => e.art === "direkt" && !inh.ziele[e.quelle]?.feuert);
      expect(direkt.length, name).toBeGreaterThan(20);
      for (const e of direkt) expect(e.von![0], `${name} ${e.quelle}`).toBeLessThanOrEqual(560);
      const folgen = new Map<string, VerlustEreignis[]>();
      for (const e of ev.filter((x) => x.k > 0)) folgen.set(`${e.quelle}>${e.panzer}`, [...(folgen.get(`${e.quelle}>${e.panzer}`) ?? []), e]);
      for (const [k, l] of folgen) {
        const typ = inh.ziele[l[0].quelle]?.typ;
        // ohne Zielwechsel zählt k fortlaufend; nach einem Zielwechsel beginnt das Einschießen neu (k = 1)
        expect(l[0].k, k).toBe(1);
        for (let i = 1; i < l.length; i++) expect(l[i].k === l[i - 1].k + 1 || l[i].k === 1, `${k} ${l.map((x) => x.k)}`).toBe(true);
        for (const e of l) expect(e.ergebnis, `${k} Schuss ${e.k}`).toBe(einschuss(vr, e.art, e.k));
        if (l[0].art === "direkt" && !inh.ziele[l[0].quelle]?.feuert) {
          // Takt der Waffe zwischen zwei Schüssen desselben Schützen
          const takt = vr.waffen[typ].takt_s!;
          for (let i = 1; i < l.length; i++) expect(l[i].ts - l[i - 1].ts, k).toBeGreaterThanOrEqual(takt - 1e-9);
          if (typ === "kpz_t72") {
            const erster = l.find((e) => e.ergebnis === "treffer");
            if (erster) expect(erster.ts - l[0].ts, k).toBeGreaterThanOrEqual(45);
          }
        }
        // Ablage: daneben 20–40 m (Steilfeuer 60–100 m), nah ≤ 8 m (Einschlagort auf 0,1 m gerundet, daher ± 0,1 m)
        for (const e of l) {
          const d = dist(e.pos, pl.get(e.panzer)!.pos);
          if (e.ergebnis === "nah") expect(d, `${k} nah`).toBeLessThanOrEqual(vr.ablage_m.nah[1] + 0.1);
          if (e.ergebnis === "daneben") {
            const [lo, hi] = e.art === "direkt" ? vr.ablage_m.daneben : vr.ablage_m.steil_daneben;
            expect(d, `${k} daneben`).toBeGreaterThanOrEqual(lo - 0.1);
            expect(d, `${k} daneben`).toBeLessThanOrEqual(hi + 0.1);
          }
        }
      }
    }
  });

  it("F2.2/F2.8: Drehbuch-Schützen – Mörser Salve alle 30 s, Beobachter alle 35 s; Z-06 → 1/2, Z-19 → 1/4, Z-41 → 1/1, Z-42 → 1/2", async () => {
    const inh = await inhalte();
    const auf: Record<string, string> = { "Z-06": "pz2", "Z-19": "pz4", "Z-41": "pz1", "Z-42": "pz2" };
    for (const [zid, pz] of Object.entries(auf)) {
      const f = inh.ziele[zid].feuert!;
      expect(f.every((x) => x.auf === pz), zid).toBe(true);
    }
    for (const zid of ["Z-06", "Z-19"]) expect(inh.ziele[zid].feuert!.every((x) => x.takt_s * ((x.salve ?? 1) - 1) + (x.pause_s ?? 0) === 30), zid).toBe(true);
    expect(inh.ziele["Z-42"].feuert!.every((x) => x.takt_s === 35 && x.salve === 1)).toBe(true);
    // Schüsse nach Drehbuch bleiben auf ihrem Panzer, solange er nicht ausgefallen ist (Mörser bekämpft: 1/2 hält)
    const ev = zeitlinie(inh, { "Z-06": 400, "Z-19": 1100 }, null, []);
    for (const [zid, pz] of Object.entries(auf)) {
      for (const e of ev.filter((x) => x.quelle === zid)) {
        const aus = ev.some((x) => x.panzer === pz && x.ausgefallen && x.t < e.t);
        if (!aus) expect(e.panzer, `${zid} ${e.t}`).toBe(pz);
      }
    }
    // S1 Attrappe → Feindartillerie auf 1/2; Durchbruch Brücke → 1/3 und 1/1 im Wechsel, Furt → 1/2
    expect(inh.szenario.verluste!.attrappe!.panzer).toBe("pz2");
    expect(inh.szenario.verluste!.durchbruch).toEqual({ "Brücke ELSTER": ["pz3", "pz1"], "Furt Nord": ["pz2"] });
    const att = zeitlinie(inh, { "Z-06": 400 }, 600, []).filter((e) => e.art === "attrappe");
    expect(att.length).toBe(inh.szenario.verluste!.attrappe!.einschlaege.length);
    expect(att.every((e) => e.panzer === "pz2")).toBe(true);
    expect(att.slice(0, 2).map((e) => e.ergebnis)).toEqual(["daneben", "daneben"]);
  });

  it("F2.4: Wirkung am Panzer – T-72 −25 %, BMP-2 −5 %, BTR-80 −2 %, Mörser/Artillerie/gelenktes Feuer −4 %; Stufen 70/40", async () => {
    const inh = await inhalte();
    const vr = inh.regeln.verluste!;
    expect(Object.fromEntries(Object.entries(vr.waffen).map(([k, w]) => [k, w.treffer_prozent]))).toEqual(
      { kpz_t72: 25, spz_bmp2: 5, spw_btr80: 2, moerser_trupp: 4, beobachter_trupp: 4 });
    expect(vr.feindartillerie.treffer_prozent).toBe(4);
    expect(vr.stufen).toEqual({ einsatzbereit_ab: 70, ausgefallen_unter: 40 });
    const ev = zeitlinie(inh, {}, null, []);
    for (const e of ev) {
      if (e.ergebnis !== "treffer") expect(e.schaden, `${e.quelle} ${e.ergebnis}`).toBe(0); // daneben und nah: kein Schaden
      else if (e.art === "direkt") expect(e.schaden).toBe(vr.waffen[inh.ziele[e.quelle].typ].treffer_prozent);
      else if (e.art !== "durchbruch") expect(e.schaden, `${e.quelle} ${e.art}`).toBe(4);
    }
  });

  it("F2.5 und „Fertig, wenn“: Untergrenze hält, kein Ausfall vor dem dritten Treffer (zwei T-72-Treffer reichen nie), Verwundete je Stufe", async () => {
    const inh = await inhalte();
    const vr = inh.regeln.verluste!;
    expect(vr.hoechstens_ausgefallen).toBe(2);
    expect(vr.untergrenze_prozent).toBe(40);
    expect(vr.verwundete).toEqual({ einsatzbereit: 0, eingeschraenkt: 1, ausgefallen: 3 });
    expect(100 - 2 * vr.waffen.kpz_t72.treffer_prozent).toBeGreaterThanOrEqual(vr.stufen.ausgefallen_unter);
    for (const { name, ev } of await alleLaeufe()) {
      const aus = new Set<string>();
      const treffer: Record<string, number> = {};
      const zustand: Record<string, number> = {};
      for (const e of ev) {
        if (e.ergebnis === "treffer") treffer[e.panzer] = (treffer[e.panzer] ?? 0) + 1;
        if (e.ausgefallen && !aus.has(e.panzer)) {
          aus.add(e.panzer);
          expect(treffer[e.panzer], `${name}: ${e.panzer} fällt beim ${treffer[e.panzer]}. Treffer aus`).toBeGreaterThanOrEqual(3);
        }
        zustand[e.panzer] = e.zustand;
      }
      expect(aus.size, name).toBeLessThanOrEqual(2);
      for (const [pid, z] of Object.entries(zustand)) if (!aus.has(pid)) expect(z, `${name} ${pid}`).toBeGreaterThanOrEqual(40);
      // T-72 allein: ein Panzer fällt erst mit dem dritten T-72-Treffer aus, wenn ihn sonst nichts getroffen hat
      const nurT72 = Object.keys(zustand).filter((pid) => ev.every((e) => e.panzer !== pid || e.ergebnis !== "treffer" || (e.art === "direkt" && inh.ziele[e.quelle]?.typ === "kpz_t72")));
      for (const pid of nurT72) {
        const n = ev.filter((e) => e.panzer === pid && e.ergebnis === "treffer").findIndex((e) => e.ausgefallen);
        if (n >= 0) expect(n + 1, `${name} ${pid}`).toBeGreaterThanOrEqual(3);
      }
    }
    // Verwundete je Stufe fest, keine Gefallenen
    const st = stand(inh, zeitlinie(inh, {}, null, []));
    for (const s of Object.values(st)) expect(s.verwundete).toBe(vr.verwundete[s.stufe]);
    const zs = zug(st);
    expect(zs.verwundete).toBe(Object.values(st).reduce((a, s) => a + s.verwundete, 0));
    expect(zs.bereit + zs.ausgefallen).toBe(4);
  });

  it("F2.7: Druckmeldungen je Panzer von der 1. Kp, höchstens 140 Zeichen; I-07 nennt 1/4, I-06 die Kp, I-13 den getroffenen Panzer", async () => {
    const inh = await inhalte();
    const vm = inh.szenario.verluste!.meldungen!;
    expect(vm.von).toBe("1. Kp");
    const ev = zeitlinie(inh, { "Z-06": 400 }, 600, []);
    const dm = druckmeldungen(inh, ev);
    expect(dm.length).toBeGreaterThan(5);
    const namen = panzer(inh).map((p) => p.name);
    for (const m of dm) {
      expect(`${vm.von}: ${m.text}`.length, m.text).toBeLessThanOrEqual(140);
      expect(namen.some((n) => m.text.includes(n)), m.text).toBe(true);
      expect(m.text).not.toMatch(/\{\w+\}/);
    }
    const inj = Object.fromEntries(inh.szenario.injects.map((i) => [i.id, i]));
    expect(inj["I-07"]).toMatchObject({ von: "1. Kp", verluste_panzer: "pz4" });
    expect(inj["I-07"].text).toContain("{pz}");
    expect(inj["I-06"].text).toContain("Kp {bereit}/4");
    expect(inj["I-13"]).toMatchObject({ verluste_panzer: "durchbruch" });
    for (const id of ["I-06", "I-07", "I-13"]) expect(inj[id].von, id).toBe("1. Kp");
  });
});

describe("Szenario 2.5: F3 und alte Bezeichnungen", () => {
  const VERBOTEN = /2\. ?Kp\b|PzGrenBtl|Schule mit Sportplatz|Panzergrenadier/;
  // F5 (Folgeauftrag 02.11. abends): eigene Kräfte heißen 1./PzBtl 613 bzw. 1. Kp; die alten Namen nirgends mehr sichtbar
  const VERBOTEN_F5 = /WOLF|PzKp W|1\. Zug|PzBtl \(Übung\)|Panzerbataillon \(Übung\)|Zug \{|Zug: \d|am eigenen Zug|der Zug hält|eigenen? Zug(es)?\b/;
  const dateien = (ordner: string, endungen: RegExp): string[] =>
    readdirSync(ordner).filter((n) => n !== "node_modules").flatMap((n) => {
      const p = join(ordner, n);
      return statSync(p).isDirectory() ? dateien(p, endungen) : endungen.test(n) ? [p] : [];
    });

  it("„Fertig, wenn“: nirgends mehr „2. Kp“, „PzGrenBtl“, „Schule mit Sportplatz“ – Daten (public/daten, public/demo) und Oberfläche (src, index.html)", () => {
    const funde: string[] = [];
    const quellen = [...dateien(join(WURZEL, "public/daten"), /\.json$/), ...dateien(join(WURZEL, "public/demo"), /\.json$/), ...dateien(join(WURZEL, "src"), /\.(ts|tsx|css)$/), join(WURZEL, "index.html")];
    for (const p of quellen) {
      readFileSync(p, "utf-8").split("\n").forEach((z, i) => {
        if (VERBOTEN.test(z)) funde.push(`${p.slice(WURZEL.length)}:${i + 1}: ${z.trim().slice(0, 100)}`);
      });
    }
    expect(funde).toEqual([]);
  });

  it("F5: nirgends mehr „1./PzKp WOLF“, „PzKp WOLF“, „1. Zug“, „PzBtl (Übung)“ – Daten, Beispieldaten, Oberfläche und Werkzeuge (ohne die Bau-Nachweise)", () => {
    const funde: string[] = [];
    const quellen = [...dateien(join(WURZEL, "public/daten"), /\.json$/), ...dateien(join(WURZEL, "public/demo"), /\.json$/),
      ...dateien(join(WURZEL, "src"), /\.(ts|tsx|css)$/), join(WURZEL, "index.html"),
      ...dateien(join(WURZEL, "tools"), /\.(py|ts|mjs)$/).filter((p) => !/bau_szenario_v\d+\.py$/.test(p))];
    for (const p of quellen) {
      readFileSync(p, "utf-8").split("\n").forEach((z, i) => {
        if (VERBOTEN_F5.test(z)) funde.push(`${p.slice(WURZEL.length)}:${i + 1}: ${z.trim().slice(0, 100)}`);
      });
    }
    expect(funde).toEqual([]);
  });

  it("F3.1: Zone NS-01 und Karte heißen „Schule“, Regel R2 nennt „(Schule)“, die Geometrie bleibt", async () => {
    const inh = await inhalte();
    const ns = inh.szenario.zonen.find((z) => z.id === "NS-01")!;
    expect(ns.name).toBe("Schule");
    expect(inh.regeln.einsatzregeln.regeln.find((r) => r.id === "R2")!.text).toContain("(Schule)");
    const karte = JSON.parse(readFileSync(join(WURZEL, "public/daten/karte_kraehe.json"), "utf-8")) as { flaechen: { id: string; name?: string }[] };
    expect(karte.flaechen.find((f) => f.id === "schulgelaende")?.name).toBe("Schule");
  });
});
