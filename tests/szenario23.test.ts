// Szenario 2.3 (Änderungsliste D1–D5 vom 01.11.2026, „mehr Druck“): eigene Züge am Westrand, Verlustmodell der eigenen
// Kompanie (kern/verluste.ts), Druckmeldungen der Kompanie an die Führung, kürzere Lagemeldungen, Auswertung „Preis des
// Abwartens“. Engine = Simulation (inkl. Verluste) prüft tests/durchlauf.test.ts; hier die Regeln des Modells für sich.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { faellig } from "../src/engine/ablauf";
import { auswerten, exportAnonym, exportCsv, type TeamLauf } from "../src/kern/auswertung";
import type { Absender, Ereignis } from "../src/kern/ereignisse";
import { lagebildKontrolle, lagebildZielmeldungen } from "../src/kern/lagebild";
import { weltFuer } from "../src/kern/lage";
import {
  deckel, druckmeldungen, fuelle, kompanie, stand, verlustLage, verlustStand, zeitlinie, zuege, zugMitte,
} from "../src/kern/verluste";
import { anwenden, zustandAus } from "../src/kern/zustand";
import { kapitelListe } from "../src/ansichten/auswertung";
import { inhalte } from "./hilfen";
import { type DrehbuchReferenz, drehbuchTeams, spieleDurch } from "./modellteam";

const SYS: Absender = { rolle: "system" };
const START: Ereignis[] = [
  { seq: 1, typ: "spiel_neu", ts: 1, t_s: 0, von: SYS, daten: { lauf: "20261101-0500-test", szenario: "kraehe-01", version: "2.3", titel: "x" } } as Ereignis,
  { seq: 2, typ: "uhr", ts: 2, t_s: 0, von: SYS, daten: { befehl: "start", laeuft: true, t_s: 0, tempo: 1 } } as Ereignis,
];
const MAX_LAGE = 140;
const LAENGSTE = { zug: "3. Zug", kk: 100, verw: "33 Verwundete", neu: "33 neue Verwundete", kp_kk: 100, kp_verw: "99 Verwundete" };
const fuellen = (t: string, w: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (m, k) => (k in w ? String(w[k]) : m));

/** Zeitplan ohne Entscheidungen bis t abspielen (wie Host.takt). */
function abspielen(inh: Awaited<ReturnType<typeof inhalte>>, t: number) {
  let z = zustandAus(START, inh);
  for (let i = 0; i < 400; i++) {
    const n = faellig(inh, z, t)[0];
    if (!n) break;
    z = anwenden(z, { seq: z.seq + 1, typ: n.typ, ts: 0, t_s: n.t_geplant ?? t, von: SYS, daten: n.daten } as Ereignis, inh);
  }
  return z;
}

describe("Szenario 2.3: Daten (D1, D4)", () => {
  it("D1: drei eigene Züge westlich des Bachs, Gefechtsstand dahinter, eigene PzAbw aus den Stellungen", async () => {
    const inh = await inhalte();
    expect(["2.3", "2.4"]).toContain(inh.szenario.version); // 2.4 baut auf 2.3 auf (E-a)
    const et = inh.szenario.eigene_truppe!;
    expect(et.zuege.map((z) => [z.id, z.name, z.ort])).toEqual([
      ["zug1", "1. Zug", "Brücke West"], ["zug2", "2. Zug", "Furt Nord West"], ["zug3", "3. Zug", "Süd"]]);
    for (const zug of et.zuege) for (const f of zug.fahrzeuge) expect(f[0], zug.id).toBeLessThan(380);
    expect(et.gefechtsstand.pos[0]).toBeLessThan(Math.min(...et.zuege.flatMap((z) => z.fahrzeuge.map((f) => f[0]))));
    // die Attrappe steht weiter westlich des Bachs („scheinbar durchgebrochen“), aber nicht in einer Stellung
    const attrappe = inh.ziele["Z-07"].pos;
    expect(attrappe[0]).toBeLessThan(390);
    for (const zug of et.zuege) expect(Math.hypot(attrappe[0] - zugMitte(zug)[0], attrappe[1] - zugMitte(zug)[1]), zug.id).toBeGreaterThan(100);
    for (const h of inh.szenario.hintergrund!.ereignisse) if (h.art === "panzerabwehr") expect(et.zuege.map((z) => z.id), h.id).toContain(h.von);
    expect(inh.szenario.kraefte.some((k) => k.ausserhalb)).toBe(false);
  });

  it("D4: alle Lagemeldungen mit Absender höchstens 140 Zeichen (feste, bedingte, Reserve und Druckmeldungen der Kompanie)", async () => {
    const inh = await inhalte();
    for (const i of Object.values(inh.injects)) {
      const text = `${i.von}: ${fuellen(i.text, LAENGSTE)}`;
      expect(text.length, text).toBeLessThanOrEqual(MAX_LAGE);
      expect(text.includes("{"), `${i.id} Platzhalter offen`).toBe(false);
    }
    const vm = inh.szenario.verluste!.meldungen!;
    const ort = Math.max(...inh.szenario.verluste!.orte!.map((o) => o.text.length));
    for (const [stufe, vorlage] of Object.entries(vm.texte)) {
      for (const art of Object.keys(vm.waffe)) {
        const text = `${vm.von}: ${fuellen(vorlage, { ...LAENGSTE, waffe: vm.waffe[art], forderung: vm.forderung[art], ort: ` ${"x".repeat(ort)}` })}`;
        expect(text.length, `Stufe ${stufe} ${art}: ${text}`).toBeLessThanOrEqual(MAX_LAGE);
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

describe("Szenario 2.3: Verlustmodell (D2)", () => {
  it("ohne Entscheidungen: Schaden nur durch Feuer, Untergrenze hält, Kompanie ist Mittel der Züge", async () => {
    const inh = await inhalte();
    const z = abspielen(inh, 1500);
    const v = verlustStand(inh, z, 1500)!;
    const vr = inh.regeln.verluste!;
    for (const [zug, s] of Object.entries(v.zuege)) {
      expect(s.kampfkraft, zug).toBeGreaterThanOrEqual(vr.untergrenze_prozent);
      expect(s.verlust, zug).toBeLessThanOrEqual(deckel(vr));
      expect(s.verwundete, zug).toBe(Math.floor(s.verlust / vr.promille_je_verwundeter));
    }
    expect(v.kompanie).toEqual(kompanie(v.zuege));
    // ohne jede Abwehr verliert die Kompanie deutlich (Druck), hält aber (Hintergrundgefecht und E-01 wirken weiter)
    expect(v.kompanie.kampfkraft).toBeLessThan(60);
    expect(Object.values(v.zuege).every((s) => s.kampfkraft >= vr.untergrenze_prozent)).toBe(true);
    // Arten: Mörser, direktes Feuer, Feindartillerie, seit 2.4 der gelenkte Beschuss durch den Kirchturm-Beobachter (S7);
    // ohne Attrappe und Durchbruch keine solchen Schäden
    const arten = new Set(verlustLage(inh, z).ereignisse.map((e) => e.art));
    expect([...arten].sort()).toEqual(["artillerie", "beobachter", "direkt", "steil", ...(Object.values(z.durchbrueche).some((d) => d.durch) ? ["durchbruch"] : [])].sort());
  });

  it("deterministisch: gleiche Lage ⇒ gleiche Zeitlinie; Bekämpfen stoppt den Schaden dieses Feindes ab dem Einschlag", async () => {
    const inh = await inhalte();
    const a = zeitlinie(inh, {}, null, []);
    const b = zeitlinie(inh, {}, null, []);
    expect(a).toEqual(b);
    const vom19 = (ev: typeof a) => ev.filter((e) => e.quelle === "Z-19");
    expect(vom19(a).length).toBeGreaterThan(20);
    expect(new Set(vom19(a).map((e) => e.zug))).toEqual(new Set(["zug3"]));
    const tz = 1200;
    const mit = zeitlinie(inh, { "Z-19": tz }, null, []);
    const verzug = inh.regeln.verluste!.verzug_s.steil;
    expect(vom19(mit).every((e) => e.t - verzug < tz)).toBe(true);
    expect(vom19(mit).length).toBeLessThan(vom19(a).length);
    // früh stoppen = weniger Verluste beim beschossenen Zug
    expect(stand(inh, mit).zug3.verlust).toBeLessThan(stand(inh, a).zug3.verlust);
  });

  it("Fehler haben Folgen: Wirkung auf die Attrappe bringt Feindartillerie auf den 2. Zug, Durchbruch Schaden am Übergang", async () => {
    const inh = await inhalte();
    const ohne = zeitlinie(inh, {}, null, []);
    const mit = zeitlinie(inh, {}, 640, []);
    const att = mit.filter((e) => e.art === "attrappe");
    expect(att.length).toBe(inh.szenario.verluste!.attrappe!.einschlaege.length);
    expect(new Set(att.map((e) => e.zug))).toEqual(new Set(["zug2"]));
    expect(att[0].t).toBe(640 + inh.szenario.verluste!.attrappe!.verzoegerung_s);
    expect(stand(inh, mit).zug2.roh).toBe(stand(inh, ohne).zug2.roh + att.length * inh.regeln.verluste!.attrappe.promille);
    // die erste Artillerie nach dem Attrappen-Treffer meldet die Kompanie sofort („Stellung offenbar aufgeklärt“)
    const k = druckmeldungen(inh, mit).find((m) => m.t === att[0].t);
    expect(k?.text).toMatch(/2\. Zug unter Artilleriefeuer.*Stellung offenbar aufgeklärt/);
  });

  it("Lagebild: alle Rollen sehen die eigenen Züge mit Kampfkraft (D1.3), Feinde der Ground Truth bleiben verborgen", async () => {
    const inh = await inhalte();
    const z = abspielen(inh, 900);
    for (const rolle of ["g1", "g2", "g3"] as const) {
      const lb = lagebildZielmeldungen(inh, z, rolle, 900);
      expect(lb.eigene?.zuege.map((e) => e.id), rolle).toEqual(["zug1", "zug2", "zug3"]);
      expect(lb.eigene!.zuege.every((e) => e.kampfkraft <= 100 && e.kampfkraft >= 40)).toBe(true);
      expect(lb.objekte.some((o) => o.kategorie !== undefined), rolle).toBe(false);
    }
    const kk = lagebildKontrolle(inh, z, 900).eigene!;
    expect(kk.gefechtsstand).toBeDefined();
    expect(kk.zuege.map((e) => e.kampfkraft)).toEqual(zuege(inh).map((zug) => verlustStand(inh, z, 900)!.zuege[zug.id].kampfkraft));
  });

  it("D3.2: I-07 nennt die tatsächlichen Verwundeten des beschossenen Zuges, I-06 die Kampfkraft des 1. Zuges", async () => {
    const inh = await inhalte();
    const z = abspielen(inh, 1210);
    const lage = verlustLage(inh, z);
    expect(z.injects["I-07"].text).toBe(fuelle(lage.welt, inh.injects["I-07"].text, stand(lage.welt, lage.ereignisse, 1095), "zug3"));
    expect(z.injects["I-07"].text).toMatch(/^3\. Zug unter Mörserfeuer aus Hof RABE, (\d+ Verwundete|1 Verwundeter|keine Verwundeten)\./);
    expect(z.injects["I-06"].text).toMatch(/1\. Zug \d+ %/);
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
        expect(`2. Kp: ${k.text}`.length, k.text).toBeLessThanOrEqual(MAX_LAGE);
        expect(k.zug).toMatch(/^zug[123]$/);
      }
      expect(m.kanal.protokoll.filter((e) => e.typ === "inject" && (e.daten as { stufe?: number }).stufe !== undefined).length).toBe(km.length);
      // Stufen steigen je Zug nie ab (außer den Wiederholungen an der Untergrenze)
      for (const zug of ["zug1", "zug2", "zug3"]) {
        const st = km.filter((k) => k.zug === zug).map((k) => k.stufe!);
        expect(st.every((x, i) => i === 0 || x >= st[i - 1] || x === 0), `${m.name} ${zug} ${st}`).toBe(true);
      }
    }
    const laeufe: TeamLauf[] = teams.map((m, i) => ({ id: `t${i}`, name: `Team ${i + 1}`, farbe: "#888888", zustand: m.z, protokoll: m.kanal.protokoll }));
    const a = auswerten(inh, laeufe);
    const kap = kapitelListe(a);
    expect(kap.map((k) => k.id)).toEqual(["teams", "kennzahlen", "konfidenz", "S3", "S2", "S1", "S4", "preis", "schluss"]);
    expect(kap.reduce((s, k) => s + k.budget, 0)).toBe(12 * 60);
    // D2.6: Modellteam „ideal“ (Team 2) hat mehr eigene Verluste als „naiv“ (Team 1)
    expect(a.teams[1].kennzahlen.verluste!.kampfkraft).toBeLessThan(a.teams[0].kennzahlen.verluste!.kampfkraft);
    for (const t of a.teams) {
      const v = t.kennzahlen.verluste!;
      expect(v.verlauf[0]).toEqual([0, 100, 0]);
      expect(v.verlauf[v.verlauf.length - 1][1]).toBe(v.kampfkraft);
      expect(v.zuege).toHaveLength(3);
    }
    // D5.3: Export anonym mit Kampfkraft und Verwundeten je Team
    const ex = exportAnonym(inh, laeufe, a, { freitext: false });
    expect(ex.teams[0].kennzahlen).toMatchObject({ kampfkraft_ende: a.teams[0].kennzahlen.verluste!.kampfkraft, verwundete_ende: a.teams[0].kennzahlen.verluste!.verwundete });
    expect(Object.keys((ex.teams[0].kennzahlen as Record<string, unknown>).kampfkraft_zuege as object)).toEqual(["1. Zug", "2. Zug", "3. Zug"]);
    const csv = exportCsv(a).split("\r\n");
    expect(csv[0]).toContain("kampfkraft_ende;verwundete_ende");
    expect(JSON.stringify(ex)).not.toContain("Team 1");
    // die Welt des Teams bleibt intakt (Verstärkungen eingespielt) – die Verluste rechnen mit ihr
    expect(weltFuer(inh, teams[2].z).eingespielt?.length).toBe(4);
  });
});
