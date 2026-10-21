// Firebase-Adapter gegen eine Nachbildung der Realtime Database (firebase-server, Regeln aktiv).
// Läuft nur, wenn der Testserver installiert ist: npm --prefix tools/firebase-testserver install
// (Die Nachbildung spricht nur WebSocket; Long-Polling wurde am 19.10. mit der echten Datenbank geprüft.)
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { neuerCode } from "../src/kern/sitzungen";
import { fingerabdruck } from "../src/kern/zustand";
import { Sicht } from "../src/sitzung/sicht";
import { Sitzung } from "../src/sitzung/sitzung";
import { FirebaseAdapter } from "../src/sync/firebase";
import { bis, inhalte } from "./hilfen";

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

  const fenster = async (code: string, art: "sl" | "tt", name?: string) => {
    const s = new Sitzung(await inhalte(), new FirebaseAdapter(code, DB), { art, name });
    sitzungen.push(s);
    await s.starten();
    return s;
  };

  it("Sitzung anlegen, Lobby, zwei Teams (eins mit Doppelrolle): getrennte Stände, jede Aktion im Protokoll ihres Teams", async () => {
    const code = await Sitzung.anlegen(await inhalte(), (c) => new FirebaseAdapter(c, DB), "SL 1", neuerCode);
    expect(code).toBeTruthy();
    // gleicher Code ein zweites Mal: wird abgewiesen
    const doppelt = new FirebaseAdapter(code!, DB);
    await doppelt.verbinden();
    expect(await doppelt.legeAn({ code: code!.toUpperCase(), szenario: "x", version: "1", titel: "x", erstellt: Date.now(), von: "x" })).toBe(false);
    doppelt.trennen();

    const sl = await fenster(code!, "sl", "SL 1");
    await bis(() => sl.stand.istHost && !!sl.stand.info, 8000, "SL steuert");
    const a1 = await fenster(code!, "tt", "Lt A1");
    const ta = (await a1.teamErstellen("Falke", "g1"))!;
    const a2 = await fenster(code!, "tt", "Lt A2");
    const a3 = await fenster(code!, "tt", "Lt A3");
    await bis(() => !!a2.team(ta) && !!a3.team(ta), 8000);
    expect(await a2.rolleWaehlen(ta, "g2")).toBe(true);
    expect(await a3.rolleWaehlen(ta, "g3")).toBe(true);
    const b1 = await fenster(code!, "tt", "Lt B1");
    const tb = (await b1.teamErstellen("Orion", "g1"))!;
    const b23 = await fenster(code!, "tt", "Lt B23");
    await bis(() => !!b23.team(tb), 8000);
    expect(await b23.rolleWaehlen(tb, "g2")).toBe(true);
    expect(await b23.rolleWaehlen(tb, "g3")).toBe(true); // Doppelrolle
    // Teamwechsel in einem Schreibvorgang (mehrere Pfade): A3 kurz zu Orion als G3 und zurück.
    // Die Spielleitung entscheidet: B23 gibt G3 dabei ab und nimmt sie danach wieder dazu.
    await sl.spielerSetzen(a3.client, tb, ["g3"]);
    await bis(() => a3.stand.ich.team === tb && b23.stand.ich.rollen.join() === "g2", 8000, "A3 verschoben, B23 nur noch G2");
    await sl.spielerSetzen(a3.client, ta, ["g3"]);
    await bis(() => a3.stand.ich.team === ta && !!b23.team(tb)?.frei.includes("g3"), 8000, "A3 zurück");
    expect(await b23.rolleWaehlen(tb, "g3")).toBe(true);
    await bis(() => sl.stand.teams.every((t) => t.frei.length === 0), 8000, "alle Rollen besetzt");

    await sl.spielOeffnen([ta, tb]);
    const alle = [sl, a1, a2, a3, b1, b23];
    await bis(() => alle.every((s) => s.stand.art === "sl" || (s.spiel(s.stand.ich.team)?.stand.zustand.seq ?? 0) >= 2), 8000, "Spiele offen");
    sl.sendenAn([ta, tb], "uhr", { befehl: "start" });

    const sicht = (s: Sitzung, r: "g1" | "g2" | "g3") => new Sicht(s, s.spiel(s.stand.ich.team)!, r);
    const idsA: (string | null)[] = [sl.sendenAn([ta], "meldung_ausloesen", { meldung: "M01" })[0]];
    const idsB: (string | null)[] = [sl.sendenAn([tb], "meldung_ausloesen", { meldung: "M01" })[0]];
    await bis(() => sicht(a1, "g1").stand.zustand.meldungen.M01?.stufe === "g1" && sicht(b1, "g1").stand.zustand.meldungen.M01?.stufe === "g1", 8000);
    idsA.push(sicht(a1, "g1").senden("g1_entscheid", { meldung: "M01", entscheid: "annehmen", vermerk: "heiß" }));
    idsB.push(sicht(b1, "g1").senden("g1_entscheid", { meldung: "M01", entscheid: "annehmen" }));
    await bis(() => sicht(a2, "g2").stand.zustand.meldungen.M01?.stufe === "g2" && sicht(b23, "g2").stand.zustand.meldungen.M01?.stufe === "g2", 8000);
    idsA.push(sicht(a2, "g2").senden("g2_empfehlung", { meldung: "M01", empfehlung: "bekaempfen", wirkmittel: "LM" }));
    idsB.push(sicht(b23, "g2").senden("g2_empfehlung", { meldung: "M01", empfehlung: "bekaempfen", wirkmittel: "MRS" }));
    await bis(() => sicht(a3, "g3").stand.zustand.meldungen.M01?.stufe === "g3" && sicht(b23, "g3").stand.zustand.meldungen.M01?.stufe === "g3", 8000);
    idsA.push(sicht(a3, "g3").senden("g3_entscheid", { meldung: "M01", entscheid: "freigabe" }));
    idsB.push(sicht(b23, "g3").senden("g3_entscheid", { meldung: "M01", entscheid: "ablehnen" }));

    const imTeam = (team: string, s: Sitzung) => s.spiel(team)!.stand.zustand;
    await bis(() => [sl, a1, a2, a3].every((s) => idsA.every((id) => id && imTeam(ta, s).aktionen[id] !== undefined)), 8000, "Team A: Aktionen");
    await bis(() => [sl, b1, b23].every((s) => idsB.every((id) => id && imTeam(tb, s).aktionen[id] !== undefined)), 8000, "Team B: Aktionen");
    await bis(() => new Set([sl, a1, a2, a3].map((s) => `${imTeam(ta, s).seq}:${fingerabdruck(imTeam(ta, s))}`)).size === 1, 8000, "A synchron");
    await bis(() => new Set([sl, b1, b23].map((s) => `${imTeam(tb, s).seq}:${fingerabdruck(imTeam(tb, s))}`)).size === 1, 8000, "B synchron");
    expect(idsA.some((id) => imTeam(tb, sl).aktionen[id!] !== undefined)).toBe(false);
    expect(imTeam(ta, sl).meldungen.M01.stufe).toBe("wirkung");
    expect(imTeam(tb, sl).meldungen.M01.ergebnis).toBe("abgelehnt_g3");
    expect(sl.stand.teilnehmer.length).toBe(6);
  }, 40000);
});
