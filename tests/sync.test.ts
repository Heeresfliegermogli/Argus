// Mehrere Fenster in einem Prozess: jede Sitzung mit eigenem LokalAdapter, gemeinsamer Ablage und BroadcastChannel (wie mehrere
// Browserfenster an einem PC). Hier der Direktaufruf ohne Lobby (ein Team); Teams und Lobby: teams.test.ts.
// Seit 2.6 (H1) rechnet das Team-Fenster sein Spiel selbst; die Spielleitung steuert über Aktionen und liest das hochgeladene Protokoll.
// Dazu der Nachweis H1.6 im Kleinen: künstlicher Verzug und zeitweise Trennung (VerzugAdapter) – das Team spielt ungestört weiter, die
// Spielleitung holt auf, am Ende sind alle Protokolle gleich.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Ereignis, Rolle } from "../src/kern/ereignisse";
import { DIREKT_TEAM } from "../src/kern/sitzungen";
import { fingerabdruck } from "../src/kern/zustand";
import { Sicht } from "../src/sitzung/sicht";
import { Sitzung } from "../src/sitzung/sitzung";
import type { SyncAdapter } from "../src/sync/adapter";
import { LokalAdapter } from "../src/sync/lokal";
import { VerzugAdapter } from "../src/sync/verzug";
import { bis, inhalte, warte } from "./hilfen";

let sitzungen: Sitzung[] = [];
let raumNr = 0;

/** Fenster im Direktaufruf …/?rolle=…&raum=…: gibt die Sicht der Rolle auf das eine Team zurück. */
async function fenster(raum: string, rolle: Rolle, opt: { name?: string; client?: string; adapter?: SyncAdapter } = {}): Promise<Sicht> {
  const art = rolle === "sl" ? "sl" : rolle === "plenum" ? "plenum" : "tt";
  const s = new Sitzung(await inhalte(), opt.adapter ?? new LokalAdapter(raum), { art, name: opt.name, client: opt.client, direkt: { rolle }, takt: { statusMs: 200 } });
  sitzungen.push(s);
  await s.starten();
  await bis(() => !!s.spiel(DIREKT_TEAM), 3000, `${rolle}: Team da`);
  return new Sicht(s, s.spiel(DIREKT_TEAM)!, rolle === "plenum" ? "plenum" : rolle);
}

const gleich = (liste: Sicht[]) => {
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

describe("Team-Laptop rechnet selbst, Spielleitung steuert (lokaler Adapter, Direktaufruf)", () => {
  it("Spielleitung startet, das Team entscheidet ohne Netz, alle Stände gleich, jede Aktion im Protokoll", async () => {
    const raum = `test-${raumNr}`;
    const sl = await fenster(raum, "sl");
    await bis(() => sl.stand.istHost, 3000, "SL steuert");
    const zb = await fenster(raum, "zb");
    await bis(() => zb.stand.rechnet && zb.stand.zustand.seq >= 2, 3000, "Team-Fenster rechnet und legt das Spiel an");
    expect(sl.spiel.hostAktiv).toBe(false);
    await bis(() => sl.stand.lauf === zb.stand.lauf && sl.stand.zustand.seq >= 2, 3000, "SL liest das hochgeladene Protokoll");

    const ids: string[] = [];
    ids.push(sl.senden("meldung_ausloesen", { meldung: "M01" })!);
    await bis(() => zb.stand.zustand.meldungen.M01?.stufe === "offen", 3000, "M01 im Eingang des Teams");
    // Entscheidung am Team-Laptop: sofort im Spielstand (kein Netz dazwischen)
    const a = zb.senden("entscheid", { meldung: "M01", entscheid: "bekaempfen", wirkmittel: "LM", t_offen: 0 })!;
    expect(zb.stand.zustand.aktionen[a]).toBeDefined();
    expect(zb.stand.zustand.meldungen.M01.stufe).toBe("wirkung");
    ids.push(a);
    ids.push(zb.senden("entscheid", { meldung: "M01", entscheid: "ablehnen" })!); // zu spät → abgelehnt
    ids.push(sl.senden("uhr", { befehl: "start" })!);
    ids.push(sl.senden("notiz", { text: "Team diskutiert" })!);
    await bis(() => [sl, zb].every((s) => ids.every((id) => s.stand.zustand.aktionen[id] !== undefined)), 3000, "alle Aktionen im Protokoll");
    await bis(() => gleich([sl, zb]), 3000, "gleicher Stand");

    const z = sl.stand.zustand;
    expect(z.meldungen.M01.stufe).toBe("wirkung");
    expect(z.bestand.LM).toBe(19); // 20 im Katalog; bei stehender Uhr (t = 0) ist noch kein Fahrzeug im Raum → ein Schuss
    expect(z.abgelehnt).toHaveLength(1);
    expect(sl.stand.offen).toEqual({});
    expect(sl.stand.protokoll.map((e) => e.typ).slice(0, 2)).toEqual(["spiel_neu", "uhr"]);
    expect(sl.stand.protokoll.map((e) => e.seq)).toEqual(sl.stand.protokoll.map((_, i) => i + 1));
    expect(sl.stand.protokoll.find((e) => e.typ === "entscheid")?.von).toMatchObject({ rolle: "zb", client: zb.sitzung.client });
    // Statusmeldung des Teams kommt bei der Spielleitung an (H1.2)
    await bis(() => sl.sitzung.stand.status[DIREKT_TEAM]?.seq === zb.stand.zustand.seq, 3000, "Status");
    expect(sl.sitzung.stand.status[DIREKT_TEAM]).toMatchObject({ client: zb.sitzung.client, laeuft: true, hoch: zb.stand.zustand.seq });
  });

  it("Team-Fenster neu geladen: setzt mit demselben Stand fort", async () => {
    const raum = `test-${raumNr}`;
    const zb = await fenster(raum, "zb", { client: "abc123" });
    await bis(() => zb.stand.rechnet && zb.stand.zustand.seq >= 2, 3000);
    zb.senden("uhr", { befehl: "start" }); // Test allein: das Team startet selbst
    await bis(() => zb.stand.zustand.uhr.laeuft, 3000);
    await warte(150);
    const vorher = zb.stand.zustand.seq;
    const lauf = zb.stand.lauf;
    zb.sitzung.stoppen();
    const neu = await fenster(raum, "zb", { client: "abc123" });
    await bis(() => neu.stand.rechnet && neu.stand.lauf === lauf && neu.stand.zustand.seq >= vorher, 3000, "fortgesetzt");
    expect(neu.stand.zustand.uhr.laeuft).toBe(true);
    expect(neu.stand.protokoll.slice(0, vorher).map((e) => e.ts)).toEqual(zb.stand.protokoll.slice(0, vorher).map((e) => e.ts));
  });

  it("Zweite Spielleitung übernimmt die Steuerung; Befehle beider kommen beim Team an", async () => {
    const raum = `test-${raumNr}`;
    const sl1 = await fenster(raum, "sl", { name: "SL 1" });
    await bis(() => sl1.stand.istHost, 3000);
    const zb = await fenster(raum, "zb");
    await bis(() => zb.stand.rechnet && sl1.stand.zustand.seq >= 2, 3000);
    const sl2 = await fenster(raum, "sl", { name: "SL 2" });
    await bis(() => sl2.stand.geladen, 3000);
    await warte(100);
    expect(sl2.stand.istHost).toBe(false);
    await sl2.uebernehmen();
    await bis(() => sl2.stand.istHost && !sl1.stand.istHost, 4000, "Übergabe");
    sl1.senden("meldung_ausloesen", { meldung: "M02" });
    await bis(() => zb.stand.zustand.meldungen.M02?.stufe === "offen", 3000, "Team verarbeitet");
    await bis(() => sl2.stand.zustand.meldungen.M02 !== undefined, 3000, "SL 2 sieht es");
    expect(sl1.spiel.hostAktiv || sl2.spiel.hostAktiv).toBe(false);
  });

  it("Neues Spiel: das Team wechselt in den neuen Lauf, der alte bleibt gespeichert", async () => {
    const raum = `test-${raumNr}`;
    const sl = await fenster(raum, "sl");
    await bis(() => sl.stand.istHost, 3000);
    const zb = await fenster(raum, "zb");
    await bis(() => zb.stand.zustand.seq >= 2 && sl.stand.lauf === zb.stand.lauf, 3000);
    const alt = sl.stand.lauf!;
    sl.senden("meldung_ausloesen", { meldung: "M03" });
    await bis(() => zb.stand.zustand.meldungen.M03 !== undefined, 3000);
    await sl.neuesSpiel();
    await bis(() => zb.stand.lauf !== alt && zb.stand.zustand.seq >= 2, 3000, "Wechsel");
    expect(zb.stand.zustand.meldungen.M03).toBeUndefined();
    expect((await sl.adapter.ladeProtokoll(DIREKT_TEAM, alt)).length).toBeGreaterThanOrEqual(3);
  });

  it("Zweites Fenster desselben Teams sieht nur zu und führt das Spiel auf Wunsch weiter", async () => {
    const raum = `test-${raumNr}`;
    const erst = await fenster(raum, "zb", { client: "erst01" });
    await bis(() => erst.stand.rechnet && erst.stand.zustand.seq >= 2, 3000);
    const zweit = await fenster(raum, "zb", { client: "zweit1" });
    await bis(() => zweit.stand.geladen && zweit.stand.zustand.seq >= 2, 3000);
    await warte(100);
    expect(zweit.stand.rechnet).toBe(false);
    expect(zweit.sitzung.stand.ich.rechnet).toBe(false);
    erst.senden("uhr", { befehl: "start" });
    await bis(() => zweit.stand.zustand.uhr.laeuft, 3000, "Zuschauer sieht das Spiel");
    erst.sitzung.stoppen();
    // kein Übernehmen von selbst (H1.3): ein Laptop ohne Netz spielt weiter – sonst entstünden zwei Spielstände
    await bis(() => !zweit.stand.rechnerOnline, 3000, "Team-Laptop nicht mehr verbunden");
    await warte(300);
    expect(zweit.stand.rechnet).toBe(false);
    expect(zweit.stand.rechnerName).toBeTruthy();
    await zweit.uebernehmenTeam();
    await bis(() => zweit.stand.rechnet, 3000, "übernimmt");
    const seq = zweit.stand.zustand.seq;
    zweit.senden("uhr", { befehl: "pause" });
    expect(zweit.stand.zustand.seq).toBe(seq + 1);
  });

  it("Zuschauen: eine Sicht mit nurLesen sendet nichts", async () => {
    const raum = `test-${raumNr}`;
    const sl = await fenster(raum, "sl");
    await fenster(raum, "zb");
    await bis(() => sl.stand.zustand.seq >= 2, 3000);
    const zu = new Sicht(sl.sitzung, sl.spiel, "zb", { nurLesen: true });
    expect(zu.senden("entscheid", { meldung: "M01", entscheid: "ablehnen" })).toBeNull();
    expect(zu.stand.nurLesen).toBe(true);
    expect(zu.stand.zustand).toBe(sl.stand.zustand);
  });
});

describe("H1.6 im Kleinen: Netzverzug und Trennung (VerzugAdapter um den lokalen Adapter)", () => {
  it("das Team spielt mit Verzug und Trennung ungestört, die Spielleitung holt auf, das Protokoll ist am Ende vollständig", async () => {
    const raum = `test-${raumNr}`;
    const VERZUG = 200;
    const slA = new VerzugAdapter(new LokalAdapter(raum), VERZUG);
    const zbA = new VerzugAdapter(new LokalAdapter(raum), VERZUG);
    const sl = await fenster(raum, "sl", { adapter: slA });
    await bis(() => sl.stand.istHost, 5000, "SL steuert");
    const zb = await fenster(raum, "zb", { adapter: zbA });
    await bis(() => zb.stand.rechnet && zb.stand.zustand.seq >= 2, 5000, "Team rechnet");
    await bis(() => sl.stand.lauf === zb.stand.lauf && sl.stand.zustand.seq >= 2, 5000, "SL folgt");

    // Start von der Spielleitung kommt mit Verzug an; die Uhr läuft ab der Serverzeit des Klicks (ab_ts)
    const klick = sl.adapter.serverJetzt();
    sl.senden("uhr", { befehl: "start" });
    await bis(() => zb.stand.zustand.uhr.laeuft, 5000, "Start kommt an");
    const uhr = zb.stand.protokoll.find((e): e is Extract<Ereignis, { typ: "uhr" }> => e.typ === "uhr" && e.daten.befehl === "start")!;
    expect(uhr.daten.ab_ts).toBeGreaterThanOrEqual(klick - 5);
    expect(uhr.daten.ab_ts).toBeLessThanOrEqual(klick + 50);
    expect(zb.spielzeit()).toBeCloseTo((zb.adapter.serverJetzt() - klick) / 1000, 0);

    // getrennt: das Team entscheidet weiter, sofort im eigenen Stand; die Spielleitung sieht nichts Neues
    zbA.trennenSimuliert(true);
    sl.senden("meldung_ausloesen", { meldung: "M01" });
    await warte(VERZUG * 4);
    expect(zb.stand.zustand.meldungen.M01).toBeUndefined(); // die Aktion der SL liegt im Netz
    const vorTrennung = sl.stand.zustand.seq;
    zb.senden("notiz" as never, {} as never); // nicht erlaubt → wird lokal abgewiesen, auch ohne Netz
    zb.senden("uhr", { befehl: "tempo", tempo: 5 });
    const tLokal = zb.stand.zustand.seq;
    expect(tLokal).toBeGreaterThan(vorTrennung);
    await warte(VERZUG * 3);
    expect(sl.stand.zustand.seq).toBeLessThan(tLokal);
    expect(zb.stand.upload.hoch).toBeLessThan(tLokal);

    // wieder verbunden: Aktion der SL kommt an, der Upload holt auf, alle Stände gleich
    zbA.trennenSimuliert(false);
    await bis(() => zb.stand.zustand.meldungen.M01?.stufe === "offen", 8000, "M01 nach dem Wiederverbinden");
    zb.senden("entscheid", { meldung: "M01", entscheid: "zurueckstellen" });
    await bis(() => zb.stand.upload.hoch === zb.stand.zustand.seq, 40000, "Upload vollständig");
    await bis(() => gleich([sl, zb]), 8000, "SL hat aufgeholt");
    expect(sl.stand.protokoll.map((e) => e.ts)).toEqual(zb.stand.protokoll.map((e) => e.ts));
    await bis(() => sl.sitzung.stand.status[DIREKT_TEAM]?.hoch === zb.stand.zustand.seq, 8000, "Status meldet: alles hochgeladen");
  }, 60000);
});
