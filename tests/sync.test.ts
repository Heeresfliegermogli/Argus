// Mehrere Fenster in einem Prozess: jede Sitzung mit eigenem LokalAdapter, gemeinsamer Ablage
// und BroadcastChannel (wie mehrere Browserfenster an einem PC).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Rolle } from "../src/kern/ereignisse";
import { fingerabdruck } from "../src/kern/zustand";
import { Sitzung } from "../src/sitzung/sitzung";
import { LokalAdapter } from "../src/sync/lokal";
import { bis, inhalte, warte } from "./hilfen";

let sitzungen: Sitzung[] = [];
let raumNr = 0;

async function fenster(raum: string, rolle: Rolle, name?: string): Promise<Sitzung> {
  const s = new Sitzung(await inhalte(), new LokalAdapter(raum), rolle, name);
  sitzungen.push(s);
  await s.starten();
  return s;
}

const gleich = (liste: Sitzung[]) => {
  const f = liste.map((s) => `${s.stand.zustand.seq}:${fingerabdruck(s.stand.zustand)}`);
  return f.every((x) => x === f[0]);
};

beforeEach(() => {
  localStorage.clear();
  raumNr += 1;
});
afterEach(() => {
  sitzungen.forEach((s) => s.stoppen());
  sitzungen = [];
});

describe("Vier Fenster bleiben synchron (lokaler Adapter)", () => {
  it("Spielleitung startet, G1–G3 arbeiten eine Meldung ab, alle Stände gleich, jede Aktion im Protokoll", async () => {
    const raum = `test-${raumNr}`;
    const sl = await fenster(raum, "sl");
    await bis(() => sl.stand.istHost && sl.stand.zustand.seq >= 2, 3000, "SL wird Host und startet ein Spiel");
    const g1 = await fenster(raum, "g1");
    const g2 = await fenster(raum, "g2");
    const g3 = await fenster(raum, "g3");
    const alle = [sl, g1, g2, g3];
    await bis(() => alle.every((s) => s.stand.geladen && s.stand.lauf === sl.stand.lauf), 3000, "alle im selben Lauf");

    sl.senden("meldung_ausloesen", { meldung: "M01" });
    await bis(() => g1.stand.zustand.meldungen.M01?.stufe === "g1", 3000, "M01 bei G1");
    const ids: string[] = [];
    ids.push(g1.senden("g1_entscheid", { meldung: "M01", entscheid: "annehmen", vermerk: "fährt, heiß" })!);
    await bis(() => g2.stand.zustand.meldungen.M01?.stufe === "g2", 3000, "M01 bei G2");
    ids.push(g2.senden("g2_empfehlung", { meldung: "M01", empfehlung: "bekaempfen", wirkmittel: "LM" })!);
    await bis(() => g3.stand.zustand.meldungen.M01?.stufe === "g3", 3000, "M01 bei G3");
    ids.push(g3.senden("g3_entscheid", { meldung: "M01", entscheid: "freigabe" })!);
    ids.push(g3.senden("lagehinweis", { text: "Feldweg Süd: Feuerverbot", an: ["g1", "g2"] })!);
    ids.push(g1.senden("g1_entscheid", { meldung: "M01", entscheid: "ablehnen" })!); // zu spät → abgelehnt
    ids.push(sl.senden("uhr", { befehl: "start" })!);
    await bis(() => alle.every((s) => ids.every((id) => s.stand.zustand.aktionen[id] !== undefined)), 3000, "alle Aktionen im Protokoll");
    await bis(() => gleich(alle), 3000, "gleicher Stand");

    const z = g2.stand.zustand;
    expect(z.meldungen.M01.stufe).toBe("wirkung");
    expect(z.bestand.LM).toBe(9);
    expect(z.lagehinweise[0].text).toBe("Feldweg Süd: Feuerverbot");
    expect(z.abgelehnt).toHaveLength(1);
    expect(g1.stand.offen).toEqual({});
    const typen = sl.stand.protokoll.map((e) => e.typ);
    expect(typen.slice(0, 2)).toEqual(["spiel_neu", "uhr"]);
    expect(sl.stand.protokoll.map((e) => e.seq)).toEqual(sl.stand.protokoll.map((_, i) => i + 1));
  });

  it("Neu geladenes Fenster baut denselben Stand aus dem Protokoll auf", async () => {
    const raum = `test-${raumNr}`;
    const sl = await fenster(raum, "sl");
    await bis(() => sl.stand.zustand.seq >= 2, 3000);
    sl.senden("meldung_ausloesen", { meldung: "M07" });
    sl.senden("fast_track", { an: true });
    await bis(() => sl.stand.zustand.fastTrack, 3000);
    const spaet = await fenster(raum, "g2");
    await bis(() => spaet.stand.zustand.seq === sl.stand.zustand.seq, 3000);
    expect(fingerabdruck(spaet.stand.zustand)).toBe(fingerabdruck(sl.stand.zustand));
  });

  it("Zweite Spielleitung übernimmt die Steuerung, der erste Host hört auf", async () => {
    const raum = `test-${raumNr}`;
    const sl1 = await fenster(raum, "sl", "SL 1");
    await bis(() => sl1.stand.istHost && sl1.stand.zustand.seq >= 2, 3000);
    const sl2 = await fenster(raum, "sl", "SL 2");
    await bis(() => sl2.stand.geladen, 3000);
    await warte(100);
    expect(sl2.stand.istHost).toBe(false);
    await sl2.uebernehmen();
    await bis(() => sl2.stand.istHost && !sl1.stand.istHost, 4000, "Übergabe");
    const g1 = await fenster(raum, "g1");
    await bis(() => g1.stand.geladen, 3000);
    sl1.senden("meldung_ausloesen", { meldung: "M02" }); // Aktion vom alten Host-Fenster geht an den neuen Host
    await bis(() => g1.stand.zustand.meldungen.M02?.stufe === "g1", 3000, "neuer Host verarbeitet");
    expect(sl1.hostAktiv).toBe(false);
    expect(sl2.hostAktiv).toBe(true);
  });

  it("Neues Spiel: alle Fenster wechseln in den neuen Lauf, der alte bleibt gespeichert", async () => {
    const raum = `test-${raumNr}`;
    const sl = await fenster(raum, "sl");
    const g3 = await fenster(raum, "g3");
    await bis(() => sl.stand.zustand.seq >= 2 && g3.stand.lauf === sl.stand.lauf, 3000);
    const alt = sl.stand.lauf!;
    sl.senden("meldung_ausloesen", { meldung: "M03" });
    await bis(() => g3.stand.zustand.meldungen.M03 !== undefined, 3000);
    await warte(1100); // neue Lauf-Kennung braucht eine andere Minute oder anderen Zufall
    await sl.neuesSpiel();
    await bis(() => g3.stand.lauf !== alt && g3.stand.zustand.seq >= 2, 3000, "Wechsel");
    expect(g3.stand.zustand.meldungen.M03).toBeUndefined();
    expect((await sl.adapter.ladeProtokoll(alt)).length).toBeGreaterThanOrEqual(3);
  });
});
