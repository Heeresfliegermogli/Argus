// Liste Q (16.11.2026): keine Personennamen mehr, nur noch der Teamname – und das Team kann sich umbenennen.
//  • Q1: Team-Fenster heißen nach ihrem Gerät („Laptop SU2A“) im Spieler-Eintrag, in der Anwesenheit und in jeder Anzeige; ein noch
//    gespeicherter Personenname (alte Sitzung, Fenster mit altem Stand, altes Protokoll) wird nicht gezeigt.
//  • Q2: Umbenennen aus dem Team (Lobby, bis zum Start) und durch die Spielleitung (jederzeit) mit derselben Prüfung; der neue Name
//    erscheint sofort bei Spielleitung und Plenum, Protokoll und Lauf hängen an der Team-Kennung.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { absenderText } from "../src/kern/beschreibung";
import type { Ereignis } from "../src/kern/ereignisse";
import { ENDE_NAME, TEAMNAME_GESPERRT, geraeteName, neuerCode, teamnamePruefen } from "../src/kern/sitzungen";
import { fingerabdruck } from "../src/kern/zustand";
import { Merker } from "../src/sitzung/gemerkt";
import { Sicht } from "../src/sitzung/sicht";
import { Sitzung, type SitzungsOptionen } from "../src/sitzung/sitzung";
import { LokalAdapter } from "../src/sync/lokal";
import { bis, inhalte, rohTeams, warte } from "./hilfen";

let fenster: Sitzung[] = [];

async function oeffne(code: string, art: "tt" | "sl" | "plenum", opt: Partial<SitzungsOptionen> = {}): Promise<Sitzung> {
  const s = new Sitzung(await inhalte(), new LokalAdapter(code), { art, takt: { statusMs: 200 }, ...opt });
  fenster.push(s);
  await s.starten();
  return s;
}

async function neueSitzung(): Promise<{ code: string; sl: Sitzung }> {
  const inh = await inhalte();
  const code = (await Sitzung.anlegen(inh, (c) => new LokalAdapter(c), "SL 1", neuerCode))!;
  const sl = await oeffne(code, "sl", { name: "SL 1" });
  await bis(() => sl.stand.istHost && sl.stand.infoGeladen && !!sl.stand.info, 3000, "SL steuert");
  return { code, sl };
}

/** Alle Hinweise eines Fensters ab jetzt (Texte). */
function hinweise(s: Sitzung): string[] {
  const texte: string[] = [];
  const gesehen = new Set<number>();
  const lesen = () => s.hinweise.liste.forEach((h) => {
    if (gesehen.has(h.id)) return;
    gesehen.add(h.id);
    texte.push(h.text);
  });
  lesen();
  s.hinweise.abonnieren(lesen);
  return texte;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  fenster.forEach((s) => s.stoppen());
  fenster = [];
});

describe("Q2.3 – Prüfung des Teamnamens (gemeinsam für Team und Spielleitung)", () => {
  it("bereinigt, nicht leer, kein doppelter Name (Groß-/Kleinschreibung egal), nicht „Sitzung beendet“", () => {
    expect(teamnamePruefen("  Wolf   Nord ", ["Orion"], "Orion")).toEqual({ ok: true, name: "Wolf Nord", gleich: false });
    expect(teamnamePruefen("x".repeat(30), [])).toMatchObject({ ok: true, name: "x".repeat(24) });
    expect(teamnamePruefen("   ", ["Orion"], "Orion")).toEqual({ ok: false, grund: "Der Teamname darf nicht leer sein – es bleibt bei „Orion“." });
    expect(teamnamePruefen("", [])).toEqual({ ok: false, grund: "Bitte einen Teamnamen eingeben (oder würfeln)." });
    expect(teamnamePruefen("wega", ["Orion", "Wega"], "Orion")).toEqual({ ok: false, grund: "Den Teamnamen „wega“ gibt es schon." });
    expect(teamnamePruefen(ENDE_NAME.toUpperCase(), [], "Orion")).toMatchObject({ ok: false });
    expect(teamnamePruefen("Orion", ["Wega"], "Orion")).toEqual({ ok: true, name: "Orion", gleich: true });
  });
});

describe("Q1 – keine Personennamen", () => {
  it("Team-Fenster heißt nach seinem Gerät – auch wenn ein Name übergeben wird; Anwesenheit und Spieler-Eintrag ebenso", async () => {
    const { code, sl } = await neueSitzung();
    const a = await oeffne(code, "tt", { client: "su2a26", name: "Lt Anders" });
    expect(a.stand.name).toBe("Laptop SU2A");
    const ta = (await a.teamErstellen("Adler"))!;
    await bis(() => !!sl.team(ta)?.rechnerOnline, 3000);
    expect((await rohTeams(a))[ta].spieler!.su2a26.name).toBe("Laptop SU2A");
    expect(sl.team(ta)!.spieler[0].name).toBe("Laptop SU2A");
    expect(sl.stand.teilnehmer.find((x) => x.client === "su2a26")?.name).toBe("Laptop SU2A");
    // die Spielleitung behält ihre Kennung
    expect(sl.stand.name).toBe("SL 1");
  });

  it("gespeicherte Personennamen (alte Sitzung, Fenster mit altem Stand, altes Protokoll) werden nicht gezeigt", async () => {
    const { code, sl } = await neueSitzung();
    const a = await oeffne(code, "tt", { client: "su2a26" });
    const ta = (await a.teamErstellen("Adler"))!;
    await bis(() => a.stand.ich.rechnet, 3000);
    const seit = (await rohTeams(a))[ta].spieler!.su2a26.seit;
    // so stand es bis Liste P in der Datenbank: Personenname im Eintrag
    await a.adapter.setzeSpieler(ta, "su2a26", { name: "Lt Altname", rollen: "zb", seit });
    // Anzeige: nur der Gerätename; der eigene Eintrag wird einmal mit dem Gerätenamen überschrieben, „seit“ bleibt
    await bis(() => !!sl.team(ta)?.spieler.length, 3000);
    expect(sl.team(ta)?.spieler[0].name).toBe("Laptop SU2A");
    for (let i = 0; i < 30 && (await rohTeams(sl))[ta].spieler!.su2a26.name !== "Laptop SU2A"; i++) await warte(100);
    const roh = (await rohTeams(sl))[ta].spieler!.su2a26;
    expect(roh).toEqual({ name: "Laptop SU2A", rollen: "zb", seit });
    expect(a.stand.ich.rechnet).toBe(true);

    // ein Fenster mit altem Stand meldet noch einen Personennamen in der Anwesenheit
    const alt = new LokalAdapter(code);
    await alt.verbinden();
    alt.meldeAnwesenheit({ client: "abc123", art: "tt", name: "Lt Altname", version: "alt" });
    await bis(() => sl.stand.teilnehmer.some((x) => x.client === "abc123"), 3000);
    expect(sl.stand.teilnehmer.find((x) => x.client === "abc123")!.name).toBe("Laptop ABC1");
    expect(JSON.stringify(sl.stand.teilnehmer)).not.toContain("Lt Altname");
    expect(JSON.stringify(sl.stand.teams)).not.toContain("Lt Altname");
    alt.trennen();

    // altes Protokoll: der Absender eines Teams heißt nach seinem Gerät
    const e = { seq: 1, typ: "notiz", ts: 0, t_s: 0, von: { rolle: "zb", client: "su2a26", name: "Lt Altname" }, daten: { text: "x" } } as unknown as Ereignis;
    expect(absenderText(e)).toBe("Laptop SU2A");
    expect(absenderText({ ...e, von: { rolle: "sl", client: "sl0001", name: "SL 1" } } as Ereignis)).toBe("SL 1");
  });

  it("Spielleitung setzt ein Fenster in ein Team: der Eintrag trägt den Gerätenamen", async () => {
    const { code, sl } = await neueSitzung();
    const a = await oeffne(code, "tt");
    const b = await oeffne(code, "tt", { client: "kx7m2a" });
    const ta = (await a.teamErstellen("Adler"))!;
    await bis(() => sl.stand.teilnehmer.some((x) => x.client === "kx7m2a"), 3000);
    expect(await sl.spielerSetzen("kx7m2a", ta)).toBe(true);
    await bis(() => b.stand.ich.team === ta, 3000);
    expect((await rohTeams(sl))[ta].spieler!.kx7m2a.name).toBe("Laptop KX7M");
  });
});

describe("Q2 – das Team benennt sich um", () => {
  it("in der Lobby: wirkt sofort bei Spielleitung und Plenum, Hinweis an die Spielleitung, auch aus dem zuschauenden Fenster", async () => {
    const { code, sl } = await neueSitzung();
    const plenum = await oeffne(code, "plenum");
    const a = await oeffne(code, "tt", { merker: new Merker(code, "a") });
    const b = await oeffne(code, "tt");
    const ta = (await a.teamErstellen("Orion"))!;
    await bis(() => !!b.team(ta), 3000);
    expect(await b.teamBeitreten(ta)).toBe(true);
    await bis(() => b.stand.ich.team === ta && sl.team(ta)?.spieler.length === 2 && plenum.team(ta)?.name === "Orion", 3000);
    const slHinweise = hinweise(sl);
    expect(a.teamnameAenderbar(ta) && b.teamnameAenderbar(ta)).toBe(true);
    expect(plenum.teamnameAenderbar(ta)).toBe(false);

    expect(await a.teamUmbenennen(ta, "  Wolf ")).toBe(true);
    await bis(() => sl.team(ta)?.name === "Wolf" && plenum.team(ta)?.name === "Wolf" && b.team(ta)?.name === "Wolf", 3000, "überall Wolf");
    await bis(() => slHinweise.includes("Team Orion heißt jetzt Wolf."), 3000, "Hinweis an die SL");
    // der Merker des Team-Laptops kennt den neuen Namen (Startseite „zuletzt im Team …“)
    await bis(() => new Merker(code, "a").lies()?.teamName === "Wolf", 3000, "Merker");

    // das zuschauende Fenster darf auch
    expect(await b.teamUmbenennen(ta, "Wolf Nord")).toBe(true);
    await bis(() => sl.team(ta)?.name === "Wolf Nord", 3000);
    // Kennung bleibt
    expect(sl.stand.teams.map((t) => t.id)).toEqual([ta]);
  });

  it("doppelter, leerer und reservierter Name werden abgelehnt (Team und Spielleitung); gleicher Name schreibt nichts", async () => {
    const { code, sl } = await neueSitzung();
    const a = await oeffne(code, "tt");
    const c = await oeffne(code, "tt");
    const ta = (await a.teamErstellen("Orion"))!;
    const tc = (await c.teamErstellen("Wega"))!;
    await bis(() => a.stand.teams.length === 2 && sl.stand.teams.length === 2, 3000);
    const ah = hinweise(a);
    const sh = hinweise(sl);

    expect(await a.teamUmbenennen(ta, "WEGA")).toBe(false);
    expect(ah).toContain("Den Teamnamen „WEGA“ gibt es schon.");
    expect(await a.teamUmbenennen(ta, "   ")).toBe(false);
    expect(ah).toContain("Der Teamname darf nicht leer sein – es bleibt bei „Orion“.");
    expect(await a.teamUmbenennen(ta, ENDE_NAME)).toBe(false);
    // ein Team-Fenster benennt nur sein eigenes Team um
    expect(await a.teamUmbenennen(tc, "Fremd")).toBe(false);
    // die Spielleitung prüft ebenso (bis Liste P ging dort ein doppelter Name durch)
    expect(await sl.teamUmbenennen(tc, " orion ")).toBe(false);
    expect(sh).toContain("Den Teamnamen „orion“ gibt es schon.");
    expect(await sl.teamUmbenennen(tc, "")).toBe(false);
    await warte(100);
    expect(sl.stand.teams.map((t) => t.name).sort()).toEqual(["Orion", "Wega"]);

    // gleicher Name: nichts schreiben
    let geschrieben = 0;
    const aendere = a.adapter.aendereTeam.bind(a.adapter);
    a.adapter.aendereTeam = async (...x) => {
      geschrieben++;
      return aendere(...x);
    };
    expect(await a.teamUmbenennen(ta, " Orion ")).toBe(true);
    expect(geschrieben).toBe(0);
    // ein eigener Name, der sich nur in der Schreibweise ändert, ist erlaubt
    expect(await a.teamUmbenennen(ta, "ORION")).toBe(true);
    expect(geschrieben).toBe(1);
  });

  it("bis zum Start im Team-Fenster, danach nur die Spielleitung; Protokoll, Lauf und Spiel laufen unverändert weiter", async () => {
    const { code, sl } = await neueSitzung();
    const plenum = await oeffne(code, "plenum");
    const a = await oeffne(code, "tt");
    const ta = (await a.teamErstellen("Orion"))!;
    await bis(() => !!sl.team(ta)?.rechnerOnline, 3000);
    expect(await sl.spielOeffnen([ta])).toBe(true);
    await bis(() => (a.spiel(ta)?.stand.zustand.seq ?? 0) >= 2 && (sl.spiel(ta)?.stand.zustand.seq ?? 0) >= 2, 4000, "Spiel offen");
    const lauf = sl.team(ta)!.lauf;

    // Einweisung / „Warten auf Start“: das Team darf noch
    expect(a.spielBegonnen(ta)).toBe(false);
    expect(a.teamnameAenderbar(ta)).toBe(true);
    expect(await a.teamUmbenennen(ta, "Wolf")).toBe(true);
    await bis(() => sl.team(ta)?.name === "Wolf" && plenum.team(ta)?.name === "Wolf", 3000);

    // Start: ab jetzt nur noch die Spielleitung
    sl.sendenAn([ta], "uhr", { befehl: "start" });
    await bis(() => a.spiel(ta)!.stand.zustand.uhr.laeuft, 3000, "Uhr läuft");
    expect(a.spielBegonnen(ta)).toBe(true);
    expect(a.teamnameAenderbar(ta)).toBe(false);
    const ah = hinweise(a);
    expect(await a.teamUmbenennen(ta, "Falke")).toBe(false);
    expect(ah).toContain(`${TEAMNAME_GESPERRT}.`);
    expect(sl.teamnameAenderbar(ta)).toBe(true);

    // Sicht des Teams vor dem Umbenennen durch die Spielleitung
    const zb = new Sicht(a, a.spiel(ta)!, "zb");
    const vorher = a.spiel(ta)!.stand.zustand.seq;
    expect(await sl.teamUmbenennen(ta, "Falke")).toBe(true);
    await bis(() => a.team(ta)?.name === "Falke" && plenum.team(ta)?.name === "Falke" && zb.stand.teamName === "Falke", 3000, "Falke überall");

    // Lauf, Protokoll, Status hängen an der Kennung – das Spiel läuft weiter, beide Seiten gleich
    expect(sl.team(ta)!.lauf).toBe(lauf);
    sl.sendenAn([ta], "meldung_ausloesen", { meldung: "M01" });
    await bis(() => zb.stand.zustand.meldungen.M01?.stufe === "offen", 3000, "M01 im Eingang");
    expect(zb.senden("entscheid", { meldung: "M01", entscheid: "ablehnen" })).toBeTruthy();
    await bis(() => sl.spiel(ta)!.stand.zustand.meldungen.M01?.ergebnis === "abgelehnt", 4000, "Entscheidung bei der SL");
    await bis(() => {
      const x = a.spiel(ta)!.stand.zustand;
      const y = sl.spiel(ta)!.stand.zustand;
      return x.seq === y.seq && fingerabdruck(x) === fingerabdruck(y);
    }, 3000, "gleicher Stand");
    const prot = sl.spiel(ta)!.stand.protokoll;
    expect(prot.length).toBeGreaterThan(vorher);
    expect(prot.map((e) => e.seq)).toEqual(prot.map((_, i) => i + 1));
    expect(a.spiel(ta)!.stand.zustand.uhr.laeuft).toBe(true);
    await bis(() => sl.stand.status[ta]?.lauf === lauf && sl.stand.status[ta]?.seq === a.spiel(ta)!.stand.zustand.seq, 3000, "Status unter der Kennung");
  });

  it("der zweite Tab (Gast) und eine beendete Sitzung benennen nicht um", async () => {
    const { code, sl } = await neueSitzung();
    const a = await oeffne(code, "tt", { client: "su2a26" });
    const ta = (await a.teamErstellen("Orion"))!;
    const gast = await oeffne(code, "tt", { gastVon: "su2a26" });
    await bis(() => gast.stand.ich.team === ta, 3000);
    expect(gast.teamnameAenderbar(ta)).toBe(false);
    expect(await gast.teamUmbenennen(ta, "Wolf")).toBe(false);
    expect(await sl.sitzungBeenden()).toBe(true);
    await bis(() => a.stand.beendet !== null, 3000);
    expect(await a.teamUmbenennen(ta, "Wolf")).toBe(false);
    expect(sl.team(ta)?.name).toBe("Orion");
    expect(geraeteName(a.client)).toBe("Laptop SU2A");
  });
});
