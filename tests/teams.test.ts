// Sitzung mit Code, Lobby und Teams (Schritt 4b) mit dem lokalen Adapter: 16 Fenster in einem Prozess.
//  • Lobby: Team erstellen, beitreten, Rolle wechseln, Doppelrolle, Spielleitung verwaltet.
//  • 5 Teams à 3 + Spielleitung: getrennte Spielstände, synchron je Team, jede Aktion im Protokoll
//    ihres Teams, Start für alle, Übernahme durch eine zweite Spielleitung.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Aktion } from "../src/kern/ereignisse";
import { type GruppenRolle, codeNormalisieren, neuerCode, teamnameVorschlag } from "../src/kern/sitzungen";
import { fingerabdruck } from "../src/kern/zustand";
import { Sicht } from "../src/sitzung/sicht";
import { Sitzung } from "../src/sitzung/sitzung";
import { LokalAdapter } from "../src/sync/lokal";
import { bis, inhalte, warte } from "./hilfen";

let fenster: Sitzung[] = [];

async function oeffne(code: string, art: "tt" | "sl" | "plenum", name?: string): Promise<Sitzung> {
  const s = new Sitzung(await inhalte(), new LokalAdapter(code), { art, name });
  fenster.push(s);
  await s.starten();
  return s;
}

async function neueSitzung(): Promise<{ code: string; sl: Sitzung }> {
  const inh = await inhalte();
  const code = await Sitzung.anlegen(inh, (c) => new LokalAdapter(c), "SL 1", neuerCode);
  expect(code).toMatch(/^kraehe-[a-z0-9]{2}$/);
  const sl = await oeffne(code!, "sl", "SL 1");
  await bis(() => sl.stand.istHost && sl.stand.infoGeladen && !!sl.stand.info, 3000, "SL steuert");
  return { code: code!, sl };
}

/** Sicht eines Teilnehmer-Fensters in seiner (ersten) Rolle. */
function sicht(s: Sitzung, rolle?: GruppenRolle): Sicht {
  const sp = s.spiel(s.stand.ich.team)!;
  return new Sicht(s, sp, rolle ?? s.stand.ich.rollen[0]);
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  fenster.forEach((s) => s.stoppen());
  fenster = [];
});

describe("Codes und Namen", () => {
  it("Code-Eingabe verzeiht Schreibweisen", () => {
    expect(codeNormalisieren("KRAEHE-7Q", "KRAEHE")).toBe("kraehe-7q");
    expect(codeNormalisieren(" kraehe 7q ", "KRAEHE")).toBe("kraehe-7q");
    expect(codeNormalisieren("KRÄHE-7Q", "KRAEHE")).toBe("kraehe-7q");
    expect(codeNormalisieren("kraehe7q", "KRAEHE")).toBe("kraehe-7q");
    expect(codeNormalisieren("7q", "KRAEHE")).toBe("kraehe-7q");
    expect(codeNormalisieren("", "KRAEHE")).toBeNull();
    expect(codeNormalisieren("x", "KRAEHE")).toBeNull();
  });

  it("Würfel schlägt freie Namen vor", () => {
    const n = teamnameVorschlag(["Orion", "Sirius"], () => 0);
    expect(n).not.toBe("Orion");
    expect(n.length).toBeLessThanOrEqual(24);
  });
});

describe("Lobby", () => {
  it("Team erstellen, beitreten, Doppelrolle, Rolle abgeben, Team wechseln", async () => {
    const { code, sl } = await neueSitzung();
    const a = await oeffne(code, "tt");
    const b = await oeffne(code, "tt");
    await a.setzeName("Lt Anders");
    const ta = await a.teamErstellen("Falke", "g1");
    expect(ta).toBeTruthy();
    await bis(() => b.stand.teams.length === 1 && sl.stand.teams.length === 1, 3000, "Team überall sichtbar");
    expect(b.stand.teams[0]).toMatchObject({ name: "Falke", frei: ["g2", "g3"] });
    expect(b.stand.teams[0].spieler[0]).toMatchObject({ name: "Lt Anders", rollen: ["g1"], online: true });

    // Doppelname wird abgewiesen, besetzte Rolle auch
    expect(await b.teamErstellen("falke", "g2")).toBeNull();
    expect(await b.rolleWaehlen(ta!, "g1")).toBe(false);

    // B tritt als G2 bei und nimmt G3 dazu (Doppelrolle)
    expect(await b.rolleWaehlen(ta!, "g2")).toBe(true);
    expect(await b.rolleWaehlen(ta!, "g3")).toBe(true);
    await bis(() => a.stand.teams[0]?.frei.length === 0, 3000, "alle Rollen besetzt");
    expect(b.stand.ich).toEqual({ team: ta, rollen: ["g2", "g3"] });

    // B gibt G3 ab, gründet dann ein eigenes Team und verlässt damit Falke
    await b.rolleAbgeben("g3");
    await bis(() => a.stand.teams[0].frei.includes("g3"), 3000);
    const tb = await b.teamErstellen("Orion", "g3");
    await bis(() => a.stand.teams.length === 2, 3000);
    expect(a.team(ta)?.spieler.map((x) => x.client)).toEqual([a.client]);
    expect(b.stand.ich).toEqual({ team: tb, rollen: ["g3"] });
    expect(a.stand.teams[0].farbe).not.toBe(a.stand.teams[1].farbe);

    // Wer das Fenster schließt, gibt seine Rolle frei (Anwesenheit)
    b.stoppen();
    await bis(() => a.team(tb!)?.frei.includes("g3") === true, 3000, "Rolle wieder frei");
  });

  it("gleichzeitig dieselbe Rolle: genau einer behält sie, der andere gibt sie von selbst ab", async () => {
    const { code } = await neueSitzung();
    const a = await oeffne(code, "tt", "Lt A");
    const ta = (await a.teamErstellen("Falke", "g1"))!;
    const b = await oeffne(code, "tt", "Lt B");
    const c = await oeffne(code, "tt", "Lt C");
    await bis(() => !!b.team(ta) && !!c.team(ta), 3000);
    // Beide klicken, bevor sie voneinander wissen: beide Schreibvorgänge gehen durch …
    const [ob, oc] = await Promise.all([b.rolleWaehlen(ta, "g2"), c.rolleWaehlen(ta, "g2")]);
    expect(ob && oc).toBe(true);
    // … danach hat genau einer G2, der andere ist wieder ohne Team und bekommt einen Hinweis
    await bis(() => a.team(ta)!.spieler.filter((x) => x.rollen.includes("g2")).length === 1
      && [b, c].filter((s) => s.stand.ich.team === ta).length === 1, 3000, "genau einer hat G2");
    const verlierer = b.stand.ich.team === ta ? c : b;
    expect(verlierer.stand.ich).toEqual({ team: null, rollen: [] });
    expect(verlierer.hinweise.liste.some((h) => h.text.includes("schon genommen"))).toBe(true);
  });

  it("verwaiste Rolle übernehmen; die Spielleitung setzt jemanden auf eine besetzte Rolle", async () => {
    const { code, sl } = await neueSitzung();
    const a = await oeffne(code, "tt", "Lt A");
    const ta = (await a.teamErstellen("Falke", "g1"))!;
    const b = await oeffne(code, "tt", "Lt B");
    await bis(() => !!b.team(ta), 3000);
    // A schließt das Fenster: G1 gilt als frei, B übernimmt – A steht danach nicht mehr im Team
    a.stoppen();
    await bis(() => b.team(ta)?.frei.includes("g1") === true, 3000, "G1 frei");
    expect(await b.rolleWaehlen(ta, "g1")).toBe(true);
    await bis(() => b.team(ta)!.spieler.length === 1 && b.stand.ich.rollen[0] === "g1", 3000, "nur B im Team");
    // Die Spielleitung setzt C auf G1: B gibt G1 ab (die Spielleitung entscheidet)
    const c = await oeffne(code, "tt", "Lt C");
    await bis(() => sl.stand.teilnehmer.some((t) => t.client === c.client), 3000);
    expect(await sl.spielerSetzen(c.client, ta, ["g1"])).toBe(true);
    await bis(() => c.stand.ich.team === ta && b.stand.ich.team === null, 3000, "C hat G1, B ist frei");
  });

  it("Spielleitung: umbenennen, Spieler verschieben und zuweisen, Team löschen", async () => {
    const { code, sl } = await neueSitzung();
    const a = await oeffne(code, "tt");
    const b = await oeffne(code, "tt");
    const ta = await a.teamErstellen("Falke", "g1");
    const tb = await b.teamErstellen("Orion", "g1");
    const c = await oeffne(code, "tt"); // noch ohne Team
    await bis(() => sl.stand.teams.length === 2 && sl.stand.teilnehmer.filter((t) => t.art === "tt").length === 3, 3000);

    expect(await sl.teamUmbenennen(ta!, "  Falke   Nord  ")).toBe(true);
    await bis(() => a.team(ta)?.name === "Falke Nord", 3000);

    // B nach Falke als G2 verschieben, C (ohne Team) Orion als G1 und G2 zuweisen
    await sl.spielerSetzen(b.client, ta!, ["g2"]);
    await sl.spielerSetzen(c.client, tb!, ["g1", "g2"]);
    await bis(() => b.stand.ich.team === ta && c.stand.ich.team === tb, 3000, "B und C sehen ihr Team");
    expect(c.stand.ich.rollen).toEqual(["g1", "g2"]);
    expect(sl.team(tb)?.spieler.map((x) => x.client)).toEqual([c.client]);

    await sl.teamLoeschen(tb!);
    await bis(() => c.stand.ich.team === null && a.stand.teams.length === 1, 3000, "Team weg");
  });
});

describe("5 Teams à 3 und Spielleitung", () => {
  it("getrennte Spielstände, synchron je Team, jede Aktion im Protokoll ihres Teams", async () => {
    const { code, sl } = await neueSitzung();
    const namen = ["Orion", "Sirius", "Wega", "Atlas", "Lyra"];
    const teams: { id: string; tt: Sitzung[] }[] = [];
    for (const n of namen) {
      const g1 = await oeffne(code, "tt", `${n} G1`);
      const id = (await g1.teamErstellen(n, "g1"))!;
      const g2 = await oeffne(code, "tt", `${n} G2`);
      const g3 = await oeffne(code, "tt", `${n} G3`);
      await bis(() => !!g2.team(id) && !!g3.team(id), 3000);
      expect(await g2.rolleWaehlen(id, "g2")).toBe(true);
      expect(await g3.rolleWaehlen(id, "g3")).toBe(true);
      teams.push({ id, tt: [g1, g2, g3] });
    }
    expect(fenster).toHaveLength(16);
    await bis(() => sl.stand.teams.length === 5 && sl.stand.teams.every((t) => t.frei.length === 0), 3000, "alle Rollen besetzt");

    // Spielleitung öffnet alle Spiele und startet alle Uhren
    expect(await sl.spielOeffnen(teams.map((t) => t.id))).toBe(true);
    await bis(() => teams.every((t) => t.tt.every((s) => (s.spiel(t.id)?.stand.zustand.seq ?? 0) >= 2)), 4000, "Spiele offen");
    const laeufe = new Set(teams.map((t) => sl.team(t.id)!.lauf));
    expect(laeufe.size).toBe(5);
    const uhrIds = sl.sendenAn(teams.map((t) => t.id), "uhr", { befehl: "start" });
    expect(uhrIds).toHaveLength(5);
    await bis(() => teams.every((t) => sl.spiel(t.id)!.stand.zustand.uhr.laeuft), 3000, "alle Uhren laufen");
    const startTs = teams.map((t) => sl.spiel(t.id)!.stand.zustand.uhr.ts);
    expect(Math.max(...startTs) - Math.min(...startTs)).toBeLessThan(200);

    // Jedes Team arbeitet anders: Team i löst M01 aus und entscheidet unterschiedlich
    const gesendet = new Map<string, string[]>();
    for (const [i, t] of teams.entries()) {
      const [g1, g2, g3] = t.tt.map((s) => sicht(s));
      const ids: string[] = [];
      ids.push(sl.sendenAn([t.id], "meldung_ausloesen", { meldung: "M01" })[0]);
      await bis(() => g1.stand.zustand.meldungen.M01?.stufe === "g1", 3000, `${t.id}: M01 bei G1`);
      if (i % 2 === 0) {
        ids.push(g1.senden("g1_entscheid", { meldung: "M01", entscheid: "annehmen", vermerk: `Team ${i}` })!);
        await bis(() => g2.stand.zustand.meldungen.M01?.stufe === "g2", 3000);
        ids.push(g2.senden("g2_empfehlung", { meldung: "M01", empfehlung: "bekaempfen", wirkmittel: i === 0 ? "LM" : "MRS" })!);
        await bis(() => g3.stand.zustand.meldungen.M01?.stufe === "g3", 3000);
        ids.push(g3.senden("g3_entscheid", { meldung: "M01", entscheid: i === 4 ? "ablehnen" : "freigabe" })!);
      } else {
        ids.push(g1.senden("g1_entscheid", { meldung: "M01", entscheid: "ablehnen" })!);
        ids.push(g3.senden("fast_track", { an: true })!);
      }
      ids.push(g3.senden("lagehinweis", { text: `Hinweis von Team ${i}`, an: ["g1"] })!);
      gesendet.set(t.id, ids);
    }

    // Jede Aktion steht im Protokoll IHRES Teams, in keinem anderen
    for (const t of teams) {
      const ids = gesendet.get(t.id)!;
      const alle = [sl, ...t.tt];
      await bis(() => alle.every((s) => ids.every((id) => s.spiel(t.id)!.stand.zustand.aktionen[id] !== undefined)), 4000, `${t.id}: Aktionen im Protokoll`);
      for (const andere of teams.filter((x) => x.id !== t.id)) {
        const z = sl.spiel(andere.id)!.stand.zustand;
        expect(ids.some((id) => z.aktionen[id] !== undefined)).toBe(false);
      }
      // gleicher Stand in allen vier Fenstern des Teams (drei Teilnehmer + Spielleitung)
      await bis(() => new Set(alle.map((s) => { const z = s.spiel(t.id)!.stand.zustand; return `${z.seq}:${fingerabdruck(z)}`; })).size === 1, 3000, `${t.id} synchron`);
      // Protokoll lückenlos, Absender aus diesem Team
      const prot = sl.spiel(t.id)!.stand.protokoll;
      expect(prot.map((e) => e.seq)).toEqual(prot.map((_, i) => i + 1));
      const clients = new Set([sl.client, ...t.tt.map((s) => s.client)]);
      for (const e of prot) if (e.von.client) expect(clients.has(e.von.client)).toBe(true);
    }

    // Die Teams unterscheiden sich (getrennte Spielstände)
    const abdruecke = teams.map((t) => fingerabdruck(sl.spiel(t.id)!.stand.zustand));
    expect(new Set(abdruecke).size).toBe(5);
    expect(sl.spiel(teams[0].id)!.stand.zustand.bestand.LM).toBe(10); // 11 im Katalog, eine Freigabe
    expect(sl.spiel(teams[2].id)!.stand.zustand.bestand.MRS).toBe(11);
    expect(sl.spiel(teams[1].id)!.stand.zustand.fastTrack).toBe(true);
    expect(sl.spiel(teams[4].id)!.stand.zustand.meldungen.M01.ergebnis).toBe("abgelehnt_g3");

    // Aktionen landen im Speicher nur unter dem eigenen Team
    for (const t of teams) {
      const lauf = sl.team(t.id)!.lauf!;
      const ids = new Set(gesendet.get(t.id)!);
      const gespeichert: Aktion[] = [];
      await new Promise<void>((ok) => {
        const ab = sl.adapter.aufAktionen(t.id, lauf, (a) => gespeichert.push(a));
        setTimeout(() => { ab(); ok(); }, 20);
      });
      expect(gespeichert.filter((a) => ids.has(a.id))).toHaveLength(ids.size);
    }
  }, 30000);

  it("zweite Spielleitung übernimmt alle Teams; neues Spiel für ein Team lässt die anderen unberührt", async () => {
    const { code, sl } = await neueSitzung();
    const ids: string[] = [];
    const tt: Sitzung[] = [];
    for (const n of ["Orion", "Wega", "Lyra"]) {
      const s = await oeffne(code, "tt");
      ids.push((await s.teamErstellen(n, "g1"))!);
      tt.push(s);
    }
    await bis(() => sl.stand.teams.length === 3, 3000);
    await sl.spielOeffnen(ids);
    await bis(() => ids.every((id) => (sl.spiel(id)?.stand.zustand.seq ?? 0) >= 2), 3000);
    expect(ids.every((id) => sl.spiel(id)!.hostAktiv)).toBe(true);

    const sl2 = await oeffne(code, "sl", "SL 2");
    await bis(() => ids.every((id) => sl2.spiel(id)?.stand.geladen), 3000);
    await warte(50);
    expect(sl2.stand.istHost).toBe(false);
    await sl2.uebernehmen();
    await bis(() => sl2.stand.istHost && !sl.stand.istHost, 3000, "Übergabe");
    await bis(() => ids.every((id) => sl2.spiel(id)!.hostAktiv && !sl.spiel(id)!.hostAktiv), 3000, "alle Hosts gewechselt");

    // Aktion aus dem Teilnehmer-Fenster geht an den neuen Host
    const g1 = sicht(tt[1]);
    sl.sendenAn([ids[1]], "meldung_ausloesen", { meldung: "M02" });
    await bis(() => g1.stand.zustand.meldungen.M02?.stufe === "g1", 3000, "neuer Host verarbeitet");

    // Neues Spiel nur für Team 0
    const vorher = ids.map((id) => sl2.team(id)!.lauf);
    await sl2.neuesSpiel(ids[0]);
    await bis(() => sl2.team(ids[0])!.lauf !== vorher[0] && (sl2.spiel(ids[0])!.stand.zustand.seq ?? 0) >= 2, 3000, "neuer Lauf");
    expect(sl2.team(ids[1])!.lauf).toBe(vorher[1]);
    expect(sl2.spiel(ids[1])!.stand.zustand.meldungen.M02).toBeDefined();
  });
});
