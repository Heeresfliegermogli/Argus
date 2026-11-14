// Firebase-Adapter gegen eine Nachbildung der Realtime Database (firebase-server, Regeln aktiv).
// Läuft nur, wenn der Testserver installiert ist: npm --prefix tools/firebase-testserver install
// (Die Nachbildung spricht nur WebSocket; Long-Polling wurde am 19.10. mit der echten Datenbank geprüft.)
// Seit 2.6 (H1): Jeder Team-Laptop rechnet sein Spiel selbst und lädt das Protokoll in Stücken hoch; die Spielleitung liest mit und
// bekommt alle paar Sekunden eine Statusmeldung. Zweiter Teil (H1.6): dasselbe mit künstlichem Netzverzug (5 s und 15 s) und einer
// Trennung – das Spiel der Teams läuft unverändert, Übersicht und Protokoll holen auf.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { neuerCode } from "../src/kern/sitzungen";
import { fingerabdruck } from "../src/kern/zustand";
import { Sicht } from "../src/sitzung/sicht";
import { Sitzung } from "../src/sitzung/sitzung";
import type { SyncAdapter } from "../src/sync/adapter";
import { FirebaseAdapter } from "../src/sync/firebase";
import { VerzugAdapter } from "../src/sync/verzug";
import { bis, inhalte, warte } from "./hilfen";

const ORDNER = fileURLToPath(new URL("../tools/firebase-testserver/", import.meta.url));
const vorhanden = existsSync(`${ORDNER}node_modules/firebase-server`);
const PORT = 5577;
const DB = { databaseURL: `http://localhost:${PORT}?ns=argus-test`, transport: "auto" as const };

describe.skipIf(!vorhanden)("Firebase-Adapter (Nachbildung mit Regeln)", () => {
  let server: { close(cb?: () => void): void };
  const sitzungen: Sitzung[] = [];

  beforeAll(() => {
    const require = createRequire(`${ORDNER}package.json`);
    const FirebaseServer = require("firebase-server");
    server = new FirebaseServer({ port: PORT }, `localhost:${PORT}`, {});
    (server as unknown as { setRules(r: unknown): void }).setRules(require("../../firebase/database.rules.json"));
  });
  afterAll(() => {
    sitzungen.forEach((s) => s.stoppen());
    server?.close();
  });

  const fenster = async (code: string, art: "sl" | "tt" | "plenum", name?: string, adapter?: (a: FirebaseAdapter) => SyncAdapter) => {
    const roh = new FirebaseAdapter(code, DB);
    const s = new Sitzung(await inhalte(), adapter ? adapter(roh) : roh, { art, name, takt: { statusMs: 300 } });
    sitzungen.push(s);
    await s.starten();
    return s;
  };
  const zb = (s: Sitzung) => new Sicht(s, s.spiel(s.stand.ich.team)!, "zb", { nurLesen: !s.stand.ich.rechnet });

  it("Sitzung anlegen, Lobby, zwei Team-Laptops: jedes Team rechnet selbst, Upload, Status, Zuschauer im Team", async () => {
    const code = await Sitzung.anlegen(await inhalte(), (c) => new FirebaseAdapter(c, DB), "SL 1", neuerCode);
    expect(code).toBeTruthy();
    // gleicher Code ein zweites Mal: wird abgewiesen
    const doppelt = new FirebaseAdapter(code!, DB);
    await doppelt.verbinden();
    expect(await doppelt.legeAn({ code: code!.toUpperCase(), szenario: "x", version: "1", titel: "x", erstellt: Date.now(), von: "x" })).toBe(false);
    doppelt.trennen();

    const sl = await fenster(code!, "sl", "SL 1");
    await bis(() => sl.stand.istHost && !!sl.stand.info, 8000, "SL steuert");
    const a1 = await fenster(code!, "tt", "Falke Laptop");
    const ta = (await a1.teamErstellen("Falke"))!;
    const a2 = await fenster(code!, "tt", "Lt A2");
    await bis(() => !!a2.team(ta), 8000);
    expect(await a2.teamBeitreten(ta)).toBe(true);
    const b1 = await fenster(code!, "tt", "Orion Laptop");
    const tb = (await b1.teamErstellen("Orion"))!;
    // Teamwechsel in einem Schreibvorgang (mehrere Pfade): A2 kurz zu Orion und zurück – der Team-Laptop bleibt
    await sl.spielerSetzen(a2.client, tb);
    await bis(() => a2.stand.ich.team === tb && sl.team(ta)!.spieler.length === 1, 8000, "A2 verschoben");
    await sl.spielerSetzen(a2.client, ta);
    await bis(() => a2.stand.ich.team === ta && sl.team(ta)!.spieler.length === 2, 8000, "A2 zurück");
    expect(sl.team(ta)!.rechner).toBe(a1.client);
    expect(sl.team(tb)!.rechner).toBe(b1.client);

    await sl.spielOeffnen([ta, tb]);
    await bis(() => [a1, a2, b1].every((s) => (s.spiel(s.stand.ich.team)?.stand.zustand.seq ?? 0) >= 2)
      && [ta, tb].every((t) => (sl.spiel(t)?.stand.zustand.seq ?? 0) >= 2), 8000, "Spiele offen");
    expect(a1.stand.ich.rechnet && b1.stand.ich.rechnet && !a2.stand.ich.rechnet).toBe(true);
    sl.sendenAn([ta, tb], "uhr", { befehl: "start" });
    sl.sendenAn([ta, tb], "meldung_ausloesen", { meldung: "M01" });
    await bis(() => zb(a1).stand.zustand.meldungen.M01?.stufe === "offen" && zb(b1).stand.zustand.meldungen.M01?.stufe === "offen", 8000, "M01 im Eingang");
    const idA = zb(a1).senden("entscheid", { meldung: "M01", entscheid: "bekaempfen", wirkmittel: "LM", t_offen: zb(a1).stand.zustand.uhr.t_s })!;
    const idB = zb(b1).senden("entscheid", { meldung: "M01", entscheid: "ablehnen" })!;
    // der Zuschauer im Team kann nicht entscheiden
    expect(zb(a2).senden("entscheid", { meldung: "M01", entscheid: "ablehnen" })).toBeNull();

    const imTeam = (team: string, s: Sitzung) => s.spiel(team)!.stand.zustand;
    await bis(() => [sl, a1, a2].every((s) => imTeam(ta, s).aktionen[idA] !== undefined), 8000, "Team A: Entscheidung überall");
    await bis(() => [sl, b1].every((s) => imTeam(tb, s).aktionen[idB] !== undefined), 8000, "Team B: Entscheidung überall");
    await bis(() => new Set([sl, a1, a2].map((s) => `${imTeam(ta, s).seq}:${fingerabdruck(imTeam(ta, s))}`)).size === 1, 8000, "A synchron");
    await bis(() => new Set([sl, b1].map((s) => `${imTeam(tb, s).seq}:${fingerabdruck(imTeam(tb, s))}`)).size === 1, 8000, "B synchron");
    expect(imTeam(tb, sl).aktionen[idA]).toBeUndefined();
    expect(["wirkung", "erledigt"]).toContain(imTeam(ta, sl).meldungen.M01.stufe);
    expect(imTeam(tb, sl).meldungen.M01.ergebnis).toBe("abgelehnt");
    await bis(() => sl.stand.status[ta]?.lauf === sl.team(ta)!.lauf && sl.stand.status[tb]?.lauf === sl.team(tb)!.lauf, 8000, "Status bei der SL");
    expect(sl.stand.teilnehmer.length).toBe(4);
    expect(sl.stand.regelFehler).toBeFalsy();
  }, 60000);

  for (const verzug of [5000, 15000]) {
    it(`Netzverzug ${verzug / 1000} s und Trennung (H1.6): die Teams spielen flüssig weiter, SL und Protokoll holen auf`, async () => {
      const code = await Sitzung.anlegen(await inhalte(), (c) => new FirebaseAdapter(c, DB), "SL 1", neuerCode);
      const verzoegert: VerzugAdapter[] = [];
      const mitVerzug = (a: FirebaseAdapter) => {
        const v = new VerzugAdapter(a, 0); // Lobby ohne Verzug, damit der Test nicht ewig dauert
        verzoegert.push(v);
        return v;
      };
      const sl = await fenster(code!, "sl", "SL 1", mitVerzug);
      await bis(() => sl.stand.istHost && !!sl.stand.info, 8000, "SL steuert");
      const laptops: Sitzung[] = [];
      const ids: string[] = [];
      for (const n of ["Wega", "Lyra", "Rigel"]) {
        const s = await fenster(code!, "tt", `${n} Laptop`, mitVerzug);
        ids.push((await s.teamErstellen(n))!);
        laptops.push(s);
      }
      const plenum = await fenster(code!, "plenum", "Plenum", mitVerzug);
      await bis(() => sl.stand.teams.length === 3 && sl.stand.teams.every((t) => !!t.rechner), 8000, "Lobby");
      await sl.spielOeffnen(ids);
      await bis(() => laptops.every((s, i) => (s.spiel(ids[i])?.stand.zustand.seq ?? 0) >= 2) && ids.every((id) => (sl.spiel(id)?.stand.zustand.seq ?? 0) >= 2), 8000, "Spiele offen");

      // ab jetzt hat jedes Fenster den Verzug (hin und zurück)
      verzoegert.forEach((v) => { v.verzugMs = verzug; });
      const start = Date.now();
      sl.sendenAn(ids, "uhr", { befehl: "tempo", tempo: 10 });
      sl.sendenAn(ids, "uhr", { befehl: "start" });
      await bis(() => laptops.every((s, i) => s.spiel(ids[i])!.stand.zustand.uhr.laeuft), verzug * 3 + 8000, "Start angekommen");
      const ankunft = Date.now() - start;
      expect(ankunft).toBeGreaterThanOrEqual(verzug * 2 - 50); // hin zur Datenbank, zurück zum Laptop
      // gleiche Spielzeit: die Engine holt den verspäteten Start nach (ab Serverzeit des Befehls)
      const zeiten = laptops.map((s, i) => s.spiel(ids[i])!.spielzeit());
      expect(Math.max(...zeiten) - Math.min(...zeiten)).toBeLessThan(2);
      expect(Math.min(...zeiten)).toBeGreaterThan(((verzug * 2) / 1000) * 10 * 0.5);

      // Team 0 wird getrennt: entscheidet trotzdem sofort (lokal), ohne Netz
      const v0 = verzoegert[1];
      v0.trennenSimuliert(true);
      const sicht0 = zb(laptops[0]);
      await bis(() => Object.values(sicht0.stand.zustand.meldungen).some((m) => m.stufe === "offen"), 20000, "erste Meldung bei Team 0");
      const m0 = Object.values(sicht0.stand.zustand.meldungen).find((m) => m.stufe === "offen")!.id;
      const vorher = Date.now();
      const id0 = sicht0.senden("entscheid", { meldung: m0, entscheid: "ablehnen" })!;
      await bis(() => sicht0.stand.zustand.aktionen[id0] !== undefined, 1000, "lokal verarbeitet");
      expect(Date.now() - vorher).toBeLessThan(500); // kein Netz im Spiel des Teams
      // die anderen Teams entscheiden auch lokal, ihr Upload läuft (verzögert) weiter
      for (const [i, s] of laptops.entries()) {
        if (i === 0) continue;
        const sicht = zb(s);
        await bis(() => Object.values(sicht.stand.zustand.meldungen).some((m) => m.stufe === "offen"), 20000, `Meldung bei Team ${i}`);
        const m = Object.values(sicht.stand.zustand.meldungen).find((x) => x.stufe === "offen")!.id;
        const t = Date.now();
        const id = sicht.senden("entscheid", { meldung: m, entscheid: i === 1 ? "zurueckstellen" : "ablehnen" })!;
        await bis(() => sicht.stand.zustand.aktionen[id] !== undefined, 1000, "lokal");
        expect(Date.now() - t).toBeLessThan(500);
      }
      await warte(Math.min(verzug, 6000));
      // wieder verbunden: Protokoll und Status holen auf
      v0.trennenSimuliert(false);
      sl.sendenAn(ids, "uhr", { befehl: "pause" });
      for (const [i, s] of laptops.entries()) {
        await bis(() => {
          const a = s.spiel(ids[i])!.stand;
          const b = sl.spiel(ids[i])?.stand;
          return !!b && !a.zustand.uhr.laeuft && a.zustand.seq === b.zustand.seq && fingerabdruck(a.zustand) === fingerabdruck(b.zustand)
            && sl.stand.status[ids[i]]?.seq === a.zustand.seq;
        }, verzug * 6 + 15000, `Team ${i}: SL hat aufgeholt`);
      }
      expect(sl.spiel(ids[0])!.stand.zustand.aktionen[id0]).toBeDefined();
      // das Plenum sieht dieselben Stände
      await bis(() => ids.every((id) => plenum.spiel(id)?.stand.zustand.seq === sl.spiel(id)!.stand.zustand.seq), verzug * 4 + 8000, "Plenum");
      // Die Bestätigung des letzten Schreibvorgangs kommt beim Laptop mit demselben Verzug an wie das Ereignis bei der Spielleitung –
      // wenige ms früher oder später (bei zwei Kernen im Wechsel). Deshalb kurz warten statt sofort prüfen (seit Liste L).
      await bis(() => laptops.every((s, i) => s.spiel(ids[i])!.stand.upload.hoch === s.spiel(ids[i])!.stand.zustand.seq), 5000, "alle Laptops: Protokoll vollständig im Netz");
    }, 180000);
  }
});
