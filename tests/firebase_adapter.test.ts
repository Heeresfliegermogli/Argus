// Firebase-Adapter gegen eine Nachbildung der Realtime Database (firebase-server, Regeln aktiv).
// Läuft nur, wenn der Testserver installiert ist: npm --prefix tools/firebase-testserver install
// (Die Nachbildung spricht nur WebSocket; Long-Polling wurde am 19.10. mit der echten Datenbank geprüft.)
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Rolle } from "../src/kern/ereignisse";
import { fingerabdruck } from "../src/kern/zustand";
import { Sitzung } from "../src/sitzung/sitzung";
import { FirebaseAdapter } from "../src/sync/firebase";
import { bis, inhalte } from "./hilfen";

const ORDNER = fileURLToPath(new URL("../tools/firebase-testserver/", import.meta.url));
const vorhanden = existsSync(`${ORDNER}node_modules/firebase-server`);
const PORT = 5577;

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

  const fenster = async (rolle: Rolle, raum: string) => {
    const a = new FirebaseAdapter(raum, { databaseURL: `http://localhost:${PORT}?ns=argus-test`, transport: "auto" });
    const s = new Sitzung(await inhalte(), a, rolle);
    sitzungen.push(s);
    await s.starten();
    return s;
  };

  it("vier Fenster: Kette G1 → G2 → G3, gleicher Stand, jede Aktion im Protokoll", async () => {
    const sl = await fenster("sl", "fbtest");
    await bis(() => sl.stand.istHost && sl.stand.zustand.seq >= 2, 8000, "SL steuert");
    const [g1, g2, g3] = [await fenster("g1", "fbtest"), await fenster("g2", "fbtest"), await fenster("g3", "fbtest")];
    const alle = [sl, g1, g2, g3];
    await bis(() => alle.every((s) => s.stand.geladen && s.stand.lauf === sl.stand.lauf), 8000, "alle im Lauf");
    const ids: (string | null)[] = [];
    ids.push(sl.senden("meldung_ausloesen", { meldung: "M01" }));
    await bis(() => g1.stand.zustand.meldungen.M01?.stufe === "g1", 8000, "M01 bei G1");
    ids.push(g1.senden("g1_entscheid", { meldung: "M01", entscheid: "annehmen", vermerk: "heiß" }));
    await bis(() => g2.stand.zustand.meldungen.M01?.stufe === "g2", 8000, "bei G2");
    ids.push(g2.senden("g2_empfehlung", { meldung: "M01", empfehlung: "bekaempfen", wirkmittel: "LM" }));
    await bis(() => g3.stand.zustand.meldungen.M01?.stufe === "g3", 8000, "bei G3");
    ids.push(g3.senden("g3_entscheid", { meldung: "M01", entscheid: "freigabe" }));
    ids.push(g3.senden("lagehinweis", { text: "Feuerverbot Feldweg Süd", an: ["g1", "g2"] }));
    ids.push(sl.senden("uhr", { befehl: "start" }));
    await bis(() => alle.every((s) => ids.every((id) => id && s.stand.zustand.aktionen[id] !== undefined)), 8000, "alle Aktionen überall");
    await bis(() => new Set(alle.map((s) => `${s.stand.zustand.seq}:${fingerabdruck(s.stand.zustand)}`)).size === 1, 8000, "gleicher Stand");
    expect(g2.stand.zustand.meldungen.M01.stufe).toBe("wirkung");
    expect(sl.stand.teilnehmer.length).toBe(4);
  }, 30000);
});
