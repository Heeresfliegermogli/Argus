// Sitzung mit Code, Lobby und Teams (Schritt 4b, seit 2.6 eine Rolle je Team) mit dem lokalen Adapter: bis zu 9 Fenster in einem Prozess.
//  • Lobby: Team anlegen, beitreten (zweites Fenster sieht zu), wechseln, Spielleitung verwaltet.
//  • 7 Team-Laptops + Spielleitung: jedes Team rechnet sein Spiel selbst, getrennte Spielstände, jede Aktion im Protokoll ihres Teams,
//    Start für alle mit gleicher Spielzeit, Statusmeldungen, Übernahme durch eine zweite Spielleitung.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Aktion } from "../src/kern/ereignisse";
import { codeNormalisieren, neuerCode, teamnameVorschlag } from "../src/kern/sitzungen";
import { fingerabdruck } from "../src/kern/zustand";
import { Sicht } from "../src/sitzung/sicht";
import { Sitzung } from "../src/sitzung/sitzung";
import { LokalAdapter } from "../src/sync/lokal";
import { bis, inhalte, warte } from "./hilfen";

let fenster: Sitzung[] = [];

async function oeffne(code: string, art: "tt" | "sl" | "plenum", name?: string): Promise<Sitzung> {
  const s = new Sitzung(await inhalte(), new LokalAdapter(code), { art, name, takt: { statusMs: 200 } });
  fenster.push(s);
  await s.starten();
  return s;
}

async function neueSitzung(): Promise<{ code: string; sl: Sitzung }> {
  const inh = await inhalte();
  const code = await Sitzung.anlegen(inh, (c) => new LokalAdapter(c), "SL 1", neuerCode);
  expect(code).toMatch(/^[acefhjkmnprtvwxy34679]{3}$/);
  const sl = await oeffne(code!, "sl", "SL 1");
  await bis(() => sl.stand.istHost && sl.stand.infoGeladen && !!sl.stand.info, 3000, "SL steuert");
  return { code: code!, sl };
}

/** Sicht eines Team-Fensters (Zielbearbeitung). */
function sicht(s: Sitzung): Sicht {
  const sp = s.spiel(s.stand.ich.team)!;
  return new Sicht(s, sp, "zb", { nurLesen: !s.stand.ich.rechnet });
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  fenster.forEach((s) => s.stoppen());
  fenster = [];
});

describe("Codes und Namen", () => {
  it("Code-Eingabe verzeiht Schreibweisen (drei Zeichen, B2)", () => {
    expect(codeNormalisieren("K7P")).toBe("k7p");
    expect(codeNormalisieren(" k 7 p ")).toBe("k7p");
    expect(codeNormalisieren("k-7-p")).toBe("k7p");
    expect(codeNormalisieren("")).toBeNull();
    expect(codeNormalisieren("x")).toBeNull();
    expect(codeNormalisieren("K7PX")).toBeNull();
    expect(codeNormalisieren("O1L")).toBeNull(); // verwechselbare Zeichen gibt es nicht
  });

  it("Neue Codes: drei Zeichen ohne verwechselbare", () => {
    for (let i = 0; i < 300; i++) {
      const c = neuerCode();
      expect(c).toMatch(/^[ACEFHJKMNPRTVWXY34679]{3}$/);
      expect(codeNormalisieren(c)).toBe(c.toLowerCase());
    }
  });

  it("Würfel schlägt freie Namen vor", () => {
    const n = teamnameVorschlag(["Orion", "Sirius"], () => 0);
    expect(n).not.toBe("Orion");
    expect(n.length).toBeLessThanOrEqual(24);
  });
});

describe("Lobby (eine Rolle je Team)", () => {
  it("Team anlegen, zweites Fenster sieht zu, Team wechseln, Name im Team", async () => {
    const { code, sl } = await neueSitzung();
    const a = await oeffne(code, "tt");
    const b = await oeffne(code, "tt");
    await a.setzeName("Lt Anders, Lt Berg");
    const ta = await a.teamErstellen("Falke");
    expect(ta).toBeTruthy();
    await bis(() => b.stand.teams.length === 1 && sl.stand.teams.length === 1, 3000, "Team überall sichtbar");
    expect(b.stand.teams[0].spieler[0]).toMatchObject({ name: "Lt Anders, Lt Berg", rollen: ["zb"], online: true });
    expect(b.stand.teams[0].rechner).toBe(a.client);
    await bis(() => a.stand.ich.rechnet, 3000);

    // Doppelname wird abgewiesen
    expect(await b.teamErstellen("falke")).toBeNull();
    // B tritt Falke bei: A bleibt der Team-Laptop, B sieht nur zu
    expect(await b.teamBeitreten(ta!)).toBe(true);
    await bis(() => b.stand.ich.team === ta && a.team(ta)!.spieler.length === 2, 3000, "B im Team");
    expect(b.stand.ich).toMatchObject({ team: ta, rollen: ["zb"], rechnet: false });
    expect(a.stand.ich.rechnet).toBe(true);

    // B gründet ein eigenes Team und verlässt damit Falke
    const tb = await b.teamErstellen("Orion");
    await bis(() => a.stand.teams.length === 2 && a.team(ta)!.spieler.length === 1, 3000);
    expect(b.stand.ich).toMatchObject({ team: tb, rollen: ["zb"], rechnet: true });
    expect(a.stand.teams[0].farbe).not.toBe(a.stand.teams[1].farbe);

    // Wer das Fenster schließt, ist nicht mehr da: der Team-Laptop bleibt eingetragen, ist aber nicht verbunden
    b.stoppen();
    await bis(() => a.team(tb!)?.rechnerOnline === false, 3000, "Laptop nicht mehr verbunden");
    expect(a.team(tb!)?.rechner).toBe(b.client);
  });

  it("Spielleitung: umbenennen, Fenster verschieben und zuweisen, Team löschen", async () => {
    const { code, sl } = await neueSitzung();
    const a = await oeffne(code, "tt");
    const b = await oeffne(code, "tt");
    const ta = await a.teamErstellen("Falke");
    const tb = await b.teamErstellen("Orion");
    const c = await oeffne(code, "tt"); // noch ohne Team
    await bis(() => sl.stand.teams.length === 2 && sl.stand.teilnehmer.filter((t) => t.art === "tt").length === 3, 3000);

    expect(await sl.teamUmbenennen(ta!, "  Falke   Nord  ")).toBe(true);
    await bis(() => a.team(ta)?.name === "Falke Nord", 3000);

    // C (ohne Team) Falke zuweisen: A bleibt Team-Laptop; B nach Falke verschieben
    await sl.spielerSetzen(c.client, ta!);
    await sl.spielerSetzen(b.client, ta!);
    await bis(() => b.stand.ich.team === ta && c.stand.ich.team === ta, 3000, "B und C sehen ihr Team");
    expect(a.stand.ich.rechnet && !b.stand.ich.rechnet && !c.stand.ich.rechnet).toBe(true);
    expect(sl.team(tb)?.spieler).toEqual([]);

    await sl.teamLoeschen(ta!);
    await bis(() => c.stand.ich.team === null && a.stand.teams.length === 1, 3000, "Team weg");
  });
});

describe("7 Team-Laptops und Spielleitung", () => {
  it("jedes Team rechnet selbst: getrennte Spielstände, jede Aktion im Protokoll ihres Teams, Start für alle mit gleicher Uhr", async () => {
    const { code, sl } = await neueSitzung();
    const namen = ["Orion", "Sirius", "Wega", "Atlas", "Lyra", "Rigel", "Deneb"];
    const teams: { id: string; tt: Sitzung }[] = [];
    for (const n of namen) {
      const s = await oeffne(code, "tt", `${n} Laptop`);
      teams.push({ id: (await s.teamErstellen(n))!, tt: s });
    }
    expect(fenster).toHaveLength(8);
    await bis(() => sl.stand.teams.length === 7 && sl.stand.teams.every((t) => t.rechnerOnline), 3000, "alle Teams mit Laptop");

    // Spielleitung öffnet alle Spiele: jeder Team-Laptop legt sein Spiel an und lädt es hoch; die SL rechnet nichts
    expect(await sl.spielOeffnen(teams.map((t) => t.id))).toBe(true);
    await bis(() => teams.every((t) => t.tt.spiel(t.id)?.stand.rechnet && (t.tt.spiel(t.id)?.stand.zustand.seq ?? 0) >= 2), 4000, "Spiele offen");
    await bis(() => teams.every((t) => (sl.spiel(t.id)?.stand.zustand.seq ?? 0) >= 2), 4000, "SL liest mit");
    expect(teams.every((t) => !sl.spiel(t.id)!.hostAktiv)).toBe(true);
    expect(new Set(teams.map((t) => sl.team(t.id)!.lauf)).size).toBe(7);

    // Start für alle: ein Signal je Team, jede Engine rechnet die Uhr selbst – gleiche Spielzeit (H1.4)
    const uhrIds = sl.sendenAn(teams.map((t) => t.id), "uhr", { befehl: "start" });
    expect(uhrIds).toHaveLength(7);
    await bis(() => teams.every((t) => t.tt.spiel(t.id)!.stand.zustand.uhr.laeuft), 3000, "alle Uhren laufen");
    const zeiten = teams.map((t) => t.tt.spiel(t.id)!.spielzeit());
    expect(Math.max(...zeiten) - Math.min(...zeiten)).toBeLessThan(0.3);

    // Jedes Team arbeitet anders
    const gesendet = new Map<string, string[]>();
    for (const [i, t] of teams.entries()) {
      const zb = sicht(t.tt);
      const ids: string[] = [];
      ids.push(sl.sendenAn([t.id], "meldung_ausloesen", { meldung: "M01" })[0]);
      await bis(() => zb.stand.zustand.meldungen.M01?.stufe === "offen", 3000, `${t.id}: M01 im Eingang`);
      const entscheid = i % 3 === 0 ? "bekaempfen" : i % 3 === 1 ? "ablehnen" : "zurueckstellen";
      ids.push(zb.senden("entscheid", { meldung: "M01", entscheid, ...(entscheid === "bekaempfen" ? { wirkmittel: i === 0 ? "LM" : "MRS" } : {}) })!);
      ids.push(zb.senden("inject_quittiert", { inject: "I-01" })!); // I-01 ist noch nicht da → abgewiesen, steht aber im Protokoll
      gesendet.set(t.id, ids);
    }

    for (const t of teams) {
      const ids = gesendet.get(t.id)!;
      await bis(() => ids.every((id) => sl.spiel(t.id)!.stand.zustand.aktionen[id] !== undefined), 4000, `${t.id}: Aktionen bei der SL`);
      for (const andere of teams.filter((x) => x.id !== t.id)) {
        const z = sl.spiel(andere.id)!.stand.zustand;
        expect(ids.some((id) => z.aktionen[id] !== undefined)).toBe(false);
      }
      // gleicher Stand am Team-Laptop und bei der Spielleitung
      await bis(() => {
        const a = t.tt.spiel(t.id)!.stand.zustand;
        const b = sl.spiel(t.id)!.stand.zustand;
        return a.seq === b.seq && fingerabdruck(a) === fingerabdruck(b);
      }, 3000, `${t.id} synchron`);
      const prot = sl.spiel(t.id)!.stand.protokoll;
      expect(prot.map((e) => e.seq)).toEqual(prot.map((_, i) => i + 1));
      const clients = new Set([sl.client, t.tt.client]);
      for (const e of prot) if (e.von.client) expect(clients.has(e.von.client)).toBe(true);
      // Statusmeldung des Teams (H1.2)
      await bis(() => sl.stand.status[t.id]?.seq === t.tt.spiel(t.id)!.stand.zustand.seq, 3000, `${t.id} Status`);
    }

    const abdruecke = teams.map((t) => fingerabdruck(sl.spiel(t.id)!.stand.zustand));
    expect(new Set(abdruecke).size).toBeGreaterThanOrEqual(3);
    expect(sl.spiel(teams[0].id)!.stand.zustand.bestand.LM).toBeLessThan(20);
    expect(sl.spiel(teams[3].id)!.stand.zustand.bestand.MRS).toBe(11);
    expect(sl.spiel(teams[1].id)!.stand.zustand.meldungen.M01.ergebnis).toBe("abgelehnt");
    expect(sl.spiel(teams[2].id)!.stand.zustand.meldungen.M01.zurueckgestellt).toBe(true);

    // Aktionen der Spielleitung landen im Speicher nur unter dem eigenen Team; Entscheidungen gehen gar nicht über das Netz
    for (const t of teams) {
      const lauf = sl.team(t.id)!.lauf!;
      const gespeichert: Aktion[] = [];
      await new Promise<void>((ok) => {
        const ab = sl.adapter.aufAktionen(t.id, lauf, (a) => gespeichert.push(a));
        setTimeout(() => { ab(); ok(); }, 20);
      });
      expect(gespeichert.every((a) => a.von.rolle === "sl")).toBe(true);
      expect(gespeichert.some((a) => a.id === gesendet.get(t.id)![0])).toBe(true);
    }
  }, 30000);

  it("zweite Spielleitung übernimmt die Steuerung; neues Spiel für ein Team lässt die anderen unberührt", async () => {
    const { code, sl } = await neueSitzung();
    const ids: string[] = [];
    const tt: Sitzung[] = [];
    for (const n of ["Orion", "Wega", "Lyra"]) {
      const s = await oeffne(code, "tt");
      ids.push((await s.teamErstellen(n))!);
      tt.push(s);
    }
    await bis(() => sl.stand.teams.length === 3, 3000);
    await sl.spielOeffnen(ids);
    await bis(() => ids.every((id) => (sl.spiel(id)?.stand.zustand.seq ?? 0) >= 2), 3000);
    expect(tt.every((s, i) => s.spiel(ids[i])!.hostAktiv)).toBe(true);

    const sl2 = await oeffne(code, "sl", "SL 2");
    await bis(() => ids.every((id) => sl2.spiel(id)?.stand.geladen), 3000);
    await warte(50);
    expect(sl2.stand.istHost).toBe(false);
    await sl2.uebernehmen();
    await bis(() => sl2.stand.istHost && !sl.stand.istHost, 3000, "Übergabe");

    // Befehl der (alten) Spielleitung kommt trotzdem beim Team an
    const zb = sicht(tt[1]);
    sl.sendenAn([ids[1]], "meldung_ausloesen", { meldung: "M02" });
    await bis(() => zb.stand.zustand.meldungen.M02?.stufe === "offen", 3000, "Team verarbeitet");

    // Neues Spiel nur für Team 0
    const vorher = ids.map((id) => sl2.team(id)!.lauf);
    await sl2.neuesSpiel(ids[0]);
    await bis(() => sl2.team(ids[0])!.lauf !== vorher[0] && (tt[0].spiel(ids[0])!.stand.zustand.seq ?? 0) >= 2 && tt[0].spiel(ids[0])!.stand.lauf !== vorher[0], 3000, "neuer Lauf");
    expect(sl2.team(ids[1])!.lauf).toBe(vorher[1]);
    await bis(() => sl2.spiel(ids[1])!.stand.zustand.meldungen.M02 !== undefined, 3000);
  });
});
