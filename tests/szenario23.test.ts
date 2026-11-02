// Szenario 2.3 (Änderungsliste D1–D5 vom 01.11.2026, „mehr Druck“): kürzere Lagemeldungen, Druckmeldungen an die Führung,
// Auswertung „Preis des Abwartens“. Seit 2.5 (F) ist die eigene Truppe der 1. Zug mit vier Panzern: das Verlustmodell je Panzer
// prüft tests/szenario25.test.ts, Engine = Simulation tests/durchlauf.test.ts; hier, was von D bleibt.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { auswerten, exportAnonym, exportCsv, type TeamLauf } from "../src/kern/auswertung";
import { weltFuer } from "../src/kern/lage";
import { kapitelListe } from "../src/ansichten/auswertung";
import { inhalte } from "./hilfen";
import { type DrehbuchReferenz, drehbuchTeams, spieleDurch } from "./modellteam";

const MAX_LAGE = 140;
/** längste Werte der Platzhalter (wie pruefe_szenario.py LAENGSTE, seit 2.5 je Panzer) */
const LAENGSTE = { pz: "1/1", zustand: 100, verw: "3 Verwundete", treffer: "noch ohne Treffer", lage: "eingeschränkt", bereit: 4, gesamt: 4, zug_verw: "8 Verwundete", zug: "1. Zug" };
const fuellen = (t: string, w: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (m, k) => (k in w ? String(w[k]) : m));

describe("Szenario 2.3: Daten (D4)", () => {
  it("D4: alle Lagemeldungen mit Absender höchstens 140 Zeichen (feste, bedingte, Reserve und Druckmeldungen je Panzer)", async () => {
    const inh = await inhalte();
    for (const i of Object.values(inh.injects)) {
      const text = `${i.von}: ${fuellen(i.text, LAENGSTE)}`;
      expect(text.length, text).toBeLessThanOrEqual(MAX_LAGE);
      expect(text.includes("{"), `${i.id} Platzhalter offen`).toBe(false);
    }
    const vm = inh.szenario.verluste!.meldungen!;
    const ort = Math.max(...inh.szenario.verluste!.orte!.map((o) => o.text.length));
    const schadenE = Math.max(...inh.szenario.eigene_truppe!.panzer.map((p) => (p.schaden_eingeschraenkt ?? "").length));
    for (const [anlass, vorlage] of Object.entries(vm.texte)) {
      for (const art of Object.keys(vm.waffe)) {
        const schaden = Math.max(...(vm.schaden?.[art] ?? [""]).map((x) => x.length));
        const text = `${vm.von}: ${fuellen(vorlage, { ...LAENGSTE, waffe: vm.waffe[art], forderung: vm.forderung[art], ort: ` ${"x".repeat(ort)}`, schaden: "x".repeat(schaden), schaden_e: "x".repeat(schadenE) })}`;
        expect(text.length, `${anlass} ${art}: ${text}`).toBeLessThanOrEqual(MAX_LAGE);
        expect(text.includes("{"), `${anlass}: Platzhalter offen`).toBe(false);
      }
    }
  });

  it("D4.2: Schlüsselinformationen bleiben (Schule belegt, PT-91/Feldweg Süd/Zeit, Fast-Track ab 90 %, Mörser Hof RABE)", async () => {
    const inh = await inhalte();
    expect(inh.injects["I-02"].text).toMatch(/Schule.*40 Zivilpersonen.*Kinder/);
    expect(inh.injects["I-04"].text).toMatch(/PT-91.*19:00.*Feldweg Süd.*Brücke Ost/);
    expect(inh.injects["I-05"].text).toMatch(/Fast-Track.*90 %/);
    expect(inh.injects["I-07"].text).toMatch(/Mörserfeuer aus Hof RABE/);
  });
});

describe("Szenario 2.3: Druckmeldungen (D3) und Auswertung (D5) mit den Drehbuch-Teams", () => {
  const ref = JSON.parse(readFileSync(new URL("./referenz_durchlauf.json", import.meta.url), "utf-8")) as DrehbuchReferenz;

  it("Druckmeldungen kurz und dringlicher werdend, an die Führung, im Protokoll; Auswertung mit Kapitel „Preis des Abwartens“", async () => {
    const inh = await inhalte();
    const teams = spieleDurch(inh, drehbuchTeams(ref));
    for (const m of teams) {
      const km = m.z.injectReihenfolge.map((id) => m.z.injects[id]).filter((i) => i.stufe !== undefined);
      expect(km.length, m.name).toBeGreaterThan(5);
      for (const k of km) {
        expect(`1. Zug: ${k.text}`.length, k.text).toBeLessThanOrEqual(MAX_LAGE);
        expect(k.zug).toMatch(/^pz[1234]$/); // seit 2.5: der Panzer, um den es geht
        expect(k.text!.startsWith(inh.szenario.eigene_truppe!.panzer.find((p) => p.id === k.zug)!.name) || k.text!.startsWith("DRINGEND")).toBe(true);
      }
      expect(m.kanal.protokoll.filter((e) => e.typ === "inject" && (e.daten as { stufe?: number }).stufe !== undefined).length).toBe(km.length);
      // je Panzer: „ausgefallen“ (Stufe 3) nur einmal und als letzte Meldung dieses Panzers
      for (const pz of ["pz1", "pz2", "pz3", "pz4"]) {
        const st = km.filter((k) => k.zug === pz).map((k) => k.stufe!);
        expect(st.filter((x) => x === 3).length, `${m.name} ${pz} ${st}`).toBeLessThanOrEqual(1);
        if (st.includes(3)) expect(st[st.length - 1], `${m.name} ${pz} ${st}`).toBe(3);
      }
    }
    const laeufe: TeamLauf[] = teams.map((m, i) => ({ id: `t${i}`, name: `Team ${i + 1}`, farbe: "#888888", zustand: m.z, protokoll: m.kanal.protokoll }));
    const a = auswerten(inh, laeufe);
    const kap = kapitelListe(a);
    expect(kap.map((k) => k.id)).toEqual(["teams", "kennzahlen", "konfidenz", "S3", "S2", "S1", "S4", "preis", "schluss"]);
    expect(kap.reduce((s, k) => s + k.budget, 0)).toBe(12 * 60);
    // F2.9: Modellteam „ideal“ (Team 2) endet spürbar schlechter als „naiv“ (Team 1): mehr Panzer ausgefallen
    expect(a.teams[1].kennzahlen.verluste!.ausgefallen).toBeGreaterThan(a.teams[0].kennzahlen.verluste!.ausgefallen);
    for (const t of a.teams) {
      const v = t.kennzahlen.verluste!;
      expect(v.verlauf[0]).toEqual([0, [100, 100, 100, 100], 4, 0]);
      expect(v.verlauf[v.verlauf.length - 1][1]).toEqual(v.panzer.map((p) => p.zustand));
      expect(v.panzer.map((p) => p.name)).toEqual(["1/1", "1/2", "1/3", "1/4"]);
      expect(v.bereit + v.ausgefallen).toBe(4);
    }
    // D5.3: Export anonym mit dem Zustand je Panzer
    const ex = exportAnonym(inh, laeufe, a, { freitext: false });
    expect(ex.teams[0].kennzahlen).toMatchObject({ einsatzbereit_ende: a.teams[0].kennzahlen.verluste!.bereit, verwundete_ende: a.teams[0].kennzahlen.verluste!.verwundete });
    expect(Object.keys((ex.teams[0].kennzahlen as Record<string, unknown>).zustand_panzer as object)).toEqual(["1/1", "1/2", "1/3", "1/4"]);
    const csv = exportCsv(a).split("\r\n");
    expect(csv[0]).toContain("einsatzbereit_ende;ausgefallen_ende;verwundete_ende");
    expect(JSON.stringify(ex)).not.toContain("Team 1");
    // die Welt des Teams bleibt intakt (Verstärkungen eingespielt) – die Verluste rechnen mit ihr
    expect(weltFuer(inh, teams[2].z).eingespielt?.length).toBe(4);
  }, 60000);
});
