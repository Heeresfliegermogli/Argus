// Liste L (14.11.2026): Testraum entschärfen, Laptop abmelden, Notbremse.
//  L1  Testraum: alte Laptop-Einträge verfallen (2 h), „Testraum leeren“, Gerätenamen statt „Zielbearbeitung“
//  L2  bleibender Grund am Knopf, „Laptop abmelden“ auch bei verbundenem Laptop (nie zwei rechnende Fenster), zwei Verläufe
//  L3  „Alle Sitzungen beenden“ über die globale Marke; mit den alten Regeln bricht nichts
//  L4/L5/L6  Programmstand in der Anwesenheit, Merker 12 h, Diagnose
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Ereignis } from "../src/kern/ereignisse";
import { protokollSchluessel } from "../src/kern/ereignisse";
import { DIREKT_TEAM, geraeteName, laptopText, neuerCode } from "../src/kern/sitzungen";
import { diagnoseText } from "../src/sitzung/diagnose";
import { MERKER_MAX_ALTER_MS, Merker, gemerkteSitzungen, selberTag, vergissAlleSitzungen } from "../src/sitzung/gemerkt";
import { Sitzung, type SitzungsOptionen, resetEinmal } from "../src/sitzung/sitzung";
import { anwesenheitLesen, anwesenheitSchreiben } from "../src/sync/firebase";
import { LokalAdapter, RESET_SCHLUESSEL } from "../src/sync/lokal";
import { bis, inhalte, warte } from "./hilfen";
import { SpeicherAblage } from "./setup";

let fenster: Sitzung[] = [];

type Opt = Partial<SitzungsOptionen> & { adapter?: LokalAdapter };

async function oeffne(code: string, art: "tt" | "sl" | "plenum", opt: Opt = {}): Promise<Sitzung> {
  const { adapter, ...rest } = opt;
  const s = new Sitzung(await inhalte(), adapter ?? new LokalAdapter(code), { art, takt: { statusMs: 150 }, uebernahmeMs: 300, zeitlimitMs: 300, ...rest });
  fenster.push(s);
  await s.starten();
  return s;
}

/** Test ohne Lobby: Team-Fenster bzw. Spielleitung im Raum. */
const raumTT = (raum: string, opt: Opt = {}) => oeffne(raum, "tt", { direkt: { rolle: "zb" }, ...opt });
const raumSL = (raum: string, opt: Opt = {}) => oeffne(raum, "sl", { direkt: { rolle: "sl" }, ...opt });

async function neueSitzung(): Promise<{ code: string; sl: Sitzung }> {
  const code = await Sitzung.anlegen(await inhalte(), (c) => new LokalAdapter(c), "SL 1", neuerCode);
  const sl = await oeffne(code!, "sl", { name: "SL 1" });
  await bis(() => sl.stand.istHost && !!sl.stand.info, 3000, "SL steuert");
  return { code: code!, sl };
}

function schliesse(s: Sitzung): void {
  s.stoppen();
  fenster = fenster.filter((x) => x !== s);
}

function hosts(...liste: Sitzung[]): number {
  return liste.filter((s) => [DIREKT_TEAM, s.stand.ich.team].some((t) => s.spiel(t)?.hostAktiv)).length;
}

const rechnet = (s: Sitzung) => !!s.spiel(s.stand.ich.team)?.hostAktiv;
const laeuft = (s: Sitzung, team = s.stand.ich.team) => !!s.spiel(team)?.stand.zustand.uhr.laeuft;

/** Alter Eintrag im Testraum, wie im Export vom 12.11. (alle hießen „Zielbearbeitung“). */
function alterEintrag(raum: string, client: string, seit: number): void {
  localStorage.setItem(`argus:v1:s:${raum}:team:${DIREKT_TEAM}:sp:${client}`, JSON.stringify({ name: "Zielbearbeitung", rollen: "zb", seit }));
}

/** Schlüssel des nachgebildeten localStorage (Object.keys geht dort nicht). */
function schluessel(): string[] {
  return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!);
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  fenster.forEach((s) => s.stoppen());
  fenster = [];
});

describe("L1 – Test ohne Lobby entschärfen", () => {
  it("Gerätename: „Laptop SU2A“ aus der Kennung; im Testraum heißt kein Fenster mehr „Zielbearbeitung“", async () => {
    expect(geraeteName("su2a26")).toBe("Laptop SU2A");
    expect(laptopText("su2a26", "Zielbearbeitung")).toBe("Laptop SU2A");
    expect(laptopText("su2a26", "Lt Anders")).toBe("Laptop SU2A (Lt Anders)");
    const a = await raumTT("kraehe", { client: "su2a26" });
    await bis(() => rechnet(a), 3000, "A rechnet");
    expect(a.stand.name).toBe("Laptop SU2A");
    expect(a.team(DIREKT_TEAM)!.spieler[0].name).toBe("Laptop SU2A");
  });

  it("Testraum mit vier alten Einträgen (wie im Export): wer öffnet, rechnet sofort – die verfallenen Einträge verschwinden", async () => {
    const raum = "kraehe";
    const vorTagen = Date.now() - 4 * 24 * 3600 * 1000;
    // Raum besteht seit dem 24.10.: Kopf, alter Lauf, vier Laptop-Einträge vom 10.11.
    const alt = await raumTT(raum, { client: "alt000" });
    await bis(() => rechnet(alt), 3000);
    schliesse(alt);
    localStorage.removeItem(`argus:v1:s:${raum}:team:${DIREKT_TEAM}:sp:alt000`);
    ["su2a26", "faj4jn", "hevmvq", "s6cahd"].forEach((c, i) => alterEintrag(raum, c, vorTagen + i));

    const neu = await raumTT(raum, { client: "neu111" });
    await bis(() => rechnet(neu), 3000, "das neue Fenster rechnet sofort, ohne Klick");
    expect(neu.team(DIREKT_TEAM)!.rechner).toBe("neu111");
    expect(neu.team(DIREKT_TEAM)!.spieler.map((x) => x.client)).toEqual(["neu111"]);
    // … und nimmt die verfallenen Einträge auch aus der Datenbank
    await bis(() => !localStorage.getItem(`argus:v1:s:${raum}:team:${DIREKT_TEAM}:sp:su2a26`), 3000, "alte Einträge entfernt");
    expect(schluessel().filter((k) => k.includes(":sp:")).length).toBe(1);
  });

  it("Ein Eintrag, der jünger als 2 h ist, zählt weiter: das zweite Fenster sieht nur zu (kein Übernehmen von selbst)", async () => {
    const raum = "kraehe";
    const a = await raumTT(raum, { client: "aaaaaa" });
    await bis(() => rechnet(a), 3000);
    schliesse(a);
    const b = await raumTT(raum, { client: "bbbbbb" });
    await bis(() => b.stand.ich.team === DIREKT_TEAM && b.stand.teams.length === 1, 3000);
    await warte(400);
    expect(rechnet(b)).toBe(false);
    expect(b.team(DIREKT_TEAM)!.rechner).toBe("aaaaaa");
    // mit kurzem Verfall (Test): derselbe Eintrag zählt nicht mehr
    schliesse(b);
    const c = await raumTT(raum, { client: "cccccc", verfallMs: 50 });
    await bis(() => rechnet(c), 3000, "nach dem Verfall rechnet das neue Fenster");
  });

  it("Befund 5 im Testraum: A rechnet, A zu, B öffnet, „Neues Spiel“ → „Start“: der Grund bleibt stehen und nennt den Laptop; „Laptop abmelden“ → B rechnet, Uhr läuft", async () => {
    const raum = "kraehe";
    const a = await raumTT(raum, { client: "su2a26" });
    const sl = await raumSL(raum);
    await bis(() => rechnet(a) && sl.stand.istHost && !!sl.spiel(DIREKT_TEAM)?.stand.geladen, 3000, "A rechnet, SL steuert");
    await bis(() => sl.spiel(DIREKT_TEAM)!.stand.zustand.seq >= 2, 3000);
    schliesse(a);
    const b = await raumTT(raum, { client: "faj4jn" });
    await bis(() => b.stand.ich.team === DIREKT_TEAM && !sl.team(DIREKT_TEAM)!.rechnerOnline, 3000, "B ist da, A nicht verbunden");
    expect(rechnet(b)).toBe(false);

    await sl.neuesSpiel(DIREKT_TEAM);
    await bis(() => sl.spiel(DIREKT_TEAM)!.stand.geladen && sl.spiel(DIREKT_TEAM)!.stand.zustand.seq === 0, 3000, "neuer Lauf");
    sl.sendenAn([DIREKT_TEAM], "uhr", { befehl: "start" });
    expect(sl.spiel(DIREKT_TEAM)!.wartetAuf("uhr")).toBe(true);
    expect(sl.uhrGrund(DIREKT_TEAM)).toBeNull(); // noch „gesendet …“
    await bis(() => !sl.spiel(DIREKT_TEAM)!.wartetAuf("uhr"), 2000, "Zeitlimit");
    // der Grund bleibt am Knopf stehen – auch Sekunden später, und nennt den Laptop beim Namen
    const g = sl.uhrGrund(DIREKT_TEAM)!;
    expect(g.befehl).toBe("start");
    expect(g.text).toMatch(/^Start nicht ausgeführt – Laptop SU2A rechnet nicht \(zuletzt vor \d+:\d\d\)\. Fenster an einem Laptop öffnen oder hier „Laptop abmelden“\.$/);
    expect(g.kurz).toBe("Start wartet auf Laptop SU2A");
    await warte(500);
    expect(sl.uhrGrund(DIREKT_TEAM)?.kurz).toBe("Start wartet auf Laptop SU2A");
    expect(laeuft(sl, DIREKT_TEAM)).toBe(false);

    // Spielleitung greift ein
    const t0 = Date.now();
    expect(await sl.laptopAbmelden(DIREKT_TEAM)).toBe(true);
    await bis(() => rechnet(b) && laeuft(b), 3000, "B rechnet, der wartende Start wird ausgeführt");
    await bis(() => laeuft(sl, DIREKT_TEAM) && sl.uhrGrund(DIREKT_TEAM) === null, 3000, "Uhr läuft bei der SL, der Grund ist weg");
    expect(Date.now() - t0).toBeLessThan(10000);
    expect(sl.team(DIREKT_TEAM)!.rechner).toBe("faj4jn");
  });

  it("„Testraum leeren“: offene Team-Fenster halten an („Testraum geleert – neu laden“), neuer Lauf, das nächste Fenster rechnet und Start läuft", async () => {
    const raum = "kraehe";
    const a = await raumTT(raum, { client: "su2a26" });
    const sl = await raumSL(raum);
    await bis(() => rechnet(a) && sl.stand.istHost && !!sl.team(DIREKT_TEAM)?.lauf, 3000);
    const b = await raumTT(raum, { client: "faj4jn" });
    await bis(() => b.stand.ich.team === DIREKT_TEAM, 3000);
    const laufAlt = sl.team(DIREKT_TEAM)!.lauf;

    expect(await sl.testraumLeeren()).toBe(true);
    await bis(() => a.stand.ich.entfernt === "geleert" && b.stand.ich.entfernt === "geleert", 3000, "beide Fenster: Testraum geleert");
    expect(hosts(a, b)).toBe(0);
    expect(a.stand.ich.team).toBeNull();
    await bis(() => sl.team(DIREKT_TEAM)!.spieler.length === 0 && sl.team(DIREKT_TEAM)!.lauf !== laufAlt, 3000, "keine Einträge, neuer Lauf");

    // neu laden = neues Fenster mit derselben Kennung
    schliesse(b);
    const b2 = await raumTT(raum, { client: "faj4jn" });
    await bis(() => rechnet(b2), 3000, "das nächste Fenster rechnet");
    await bis(() => !!sl.spiel(DIREKT_TEAM)?.stand.geladen && sl.team(DIREKT_TEAM)!.rechnerOnline, 3000);
    sl.sendenAn([DIREKT_TEAM], "uhr", { befehl: "start" });
    await bis(() => laeuft(b2) && laeuft(sl, DIREKT_TEAM), 3000, "Uhr läuft");
    expect(hosts(a, b2)).toBe(1);
  });
});

describe("L2 – Laptop abmelden, zwei Verläufe", () => {
  it("Lobby: verbundenen, rechnenden Laptop abmelden – er hält an („abgemeldet“), der Zuschauer rechnet ab dem hochgeladenen Protokoll; nie zwei rechnende Fenster", async () => {
    const { code, sl } = await neueSitzung();
    const speicher = new SpeicherAblage();
    const a = await oeffne(code, "tt", { name: "Lt Anders", merker: new Merker(code, null, speicher) });
    const team = (await a.teamErstellen("Adler"))!;
    const b = await oeffne(code, "tt", { name: "Lt Berg" });
    await bis(() => b.stand.teams.length === 1, 3000);
    // nicht in derselben Millisekunde wie A beitreten – sonst entscheidet die Kennung, wer rechnet (genau einer, aber nicht sicher A)
    await warte(5);
    await b.teamBeitreten(team);
    await sl.spielOeffnen([team]);
    await bis(() => rechnet(a) && a.spiel(team)!.stand.zustand.seq >= 2 && !!b.spiel(team)?.stand.geladen, 3000, "A rechnet, B sieht zu").catch((e) => {
      throw new Error(`${(e as Error).message} ${JSON.stringify({ a: a.stand.ich, b: b.stand.ich, t: a.stand.teams, seq: a.spiel(team)?.stand.zustand.seq, bg: b.spiel(team)?.stand.geladen, bl: b.spiel(team)?.stand.lauf })}`);
    });
    sl.sendenAn([team], "uhr", { befehl: "start" });
    await bis(() => laeuft(a) && laeuft(sl, team), 3000);
    const seqA = a.spiel(team)!.stand.zustand.seq;
    expect(sl.team(team)!.rechnerOnline).toBe(true);

    let max = 0;
    const zaehler = setInterval(() => { max = Math.max(max, [a, b].filter((x) => x.spiel(team)?.hostAktiv).length); }, 5);
    const altesSpiel = a.spiel(team)!;
    expect(await sl.laptopAbmelden(team)).toBe(true);
    await bis(() => a.stand.ich.entfernt === "abgemeldet" && !altesSpiel.hostAktiv, 3000, "A hält an und zeigt „abgemeldet“");
    await bis(() => rechnet(b), 3000, "B rechnet");
    clearInterval(zaehler);
    expect(max).toBe(1);
    expect(a.spiel(team)).toBeNull();
    expect(a.stand.ich.team).toBeNull();
    // die Sitzung ist an A vergessen
    expect(new Merker(code, null, speicher).lies()).toBeNull();
    // B rechnet ab dem, was A hochgeladen hat, die Uhr läuft weiter
    expect(b.spiel(team)!.stand.zustand.seq).toBeGreaterThanOrEqual(seqA);
    expect(laeuft(b)).toBe(true);
    expect(sl.team(team)!.rechner).toBe(b.client);
    // „neu beitreten“: zurück in die Lobby, als Zuschauer wieder ins Team
    a.neuBeitreten();
    expect(a.stand.ich.entfernt).toBeNull();
    await a.teamBeitreten(team);
    await bis(() => a.stand.ich.team === team, 3000);
    await warte(200);
    expect(rechnet(a)).toBe(false);
    expect(hosts(a, b)).toBe(1);
  });

  it("In der Lobby (noch kein Spiel) aus dem Team genommen: wie bisher zurück in die Lobby, kein „abgemeldet“", async () => {
    const { code, sl } = await neueSitzung();
    const a = await oeffne(code, "tt", { name: "Lt Anders" });
    const team = (await a.teamErstellen("Adler"))!;
    await bis(() => sl.stand.teams.length === 1, 3000);
    await sl.spielerSetzen(a.client, null);
    await bis(() => a.stand.ich.team === null, 3000);
    expect(a.stand.ich.entfernt).toBeNull();
    // und wer selbst geht, ist nicht „abgemeldet“
    await a.teamBeitreten(team);
    await bis(() => a.stand.ich.team === team, 3000);
    await sl.spielOeffnen([team]);
    await bis(() => rechnet(a), 3000);
    await a.teamVerlassen();
    await bis(() => a.stand.ich.team === null, 3000);
    expect(a.stand.ich.entfernt).toBeNull();
  });

  it("Zwei Verläufe (L2.4): ein anderes Fenster hat Plätze belegt, die dieser Laptop schon anders gefüllt hat – er meldet es statt endlos zu versuchen, die Spielleitung sieht es", async () => {
    const { code, sl } = await neueSitzung();
    // Upload gebündelt (wie über das Netz): erst spielen, dann hochladen
    const a = await oeffne(code, "tt", { name: "Lt Anders", takt: { statusMs: 150, uploadMs: 300 } });
    const team = (await a.teamErstellen("Adler"))!;
    await sl.spielOeffnen([team]);
    await bis(() => rechnet(a) && a.spiel(team)!.stand.zustand.seq >= 2 && a.spiel(team)!.stand.upload.hoch === a.spiel(team)!.stand.zustand.seq, 3000, "A rechnet, Protokoll im Netz");
    const lauf = a.team(team)!.lauf!;
    const sp = a.spiel(team)!;
    const n = sp.stand.zustand.seq;
    // das Team spielt drei Einträge weiter (noch nicht hochgeladen) …
    for (const tempo of [2, 1, 2]) sl.sendenAn([team], "uhr", { befehl: "tempo", tempo });
    await bis(() => sp.stand.zustand.seq >= n + 3, 3000, "drei eigene Einträge");
    expect(sp.stand.upload.hoch).toBe(n);
    // … und ein anderes Fenster hat im selben Lauf den Platz n+3 schon belegt (wie am 11./12.11.: zwei Fenster rechneten)
    const fremd: Ereignis = { ...sp.stand.protokoll[n - 1], seq: n + 3, ts: Date.now() - 5000 };
    localStorage.setItem(`argus:v1:s:${code}:lauf:${team}:${lauf}:p:${protokollSchluessel(fremd.seq)}`, JSON.stringify(fremd));
    await bis(() => !!sp.stand.upload.zwei, 8000, "der Team-Laptop erkennt zwei Verläufe");
    expect(sp.hostAktiv).toBe(true); // er spielt weiter
    expect(sp.stand.upload.hoch).toBe(n);
    expect(a.hinweise.liste.some((h) => /Lauf hat zwei Verläufe – Neues Spiel empfohlen/.test(h.text))).toBe(true);
    await bis(() => sl.zweiVerlaeufe(team), 3000, "die Spielleitung sieht es");
    await bis(() => sl.hinweise.liste.some((h) => /Team Adler: Lauf hat zwei Verläufe – Neues Spiel empfohlen/.test(h.text)), 3000);
    // Abhilfe: neues Spiel – sauberer Lauf, kein Hinweis mehr
    await sl.neuesSpiel(team);
    await bis(() => a.team(team)!.lauf !== lauf && rechnet(a) && !a.spiel(team)!.stand.upload.zwei, 3000, "neuer Lauf ohne zwei Verläufe");
    await bis(() => !sl.zweiVerlaeufe(team), 3000);
  }, 20000);

  it("Einträge eines anderen Fensters weiter hinten, die dieser Laptop noch nicht erreicht hat: er lädt bis davor hoch (kein Hängen, kein Fehlalarm)", async () => {
    const { code, sl } = await neueSitzung();
    const a = await oeffne(code, "tt", { name: "Lt Anders", takt: { statusMs: 150, uploadMs: 20 } });
    const team = (await a.teamErstellen("Adler"))!;
    await sl.spielOeffnen([team]);
    await bis(() => rechnet(a) && a.spiel(team)!.stand.upload.hoch >= 2, 3000);
    const lauf = a.team(team)!.lauf!;
    const sp = a.spiel(team)!;
    const n = sp.stand.zustand.seq;
    const fremd: Ereignis = { ...sp.stand.protokoll[n - 1], seq: n + 3, typ: "notiz", ts: Date.now() - 5000, daten: { text: "anderes Fenster" } } as Ereignis;
    localStorage.setItem(`argus:v1:s:${code}:lauf:${team}:${lauf}:p:${protokollSchluessel(n + 3)}`, JSON.stringify(fremd));
    for (const tempo of [2, 1, 2, 1]) {
      sl.sendenAn([team], "uhr", { befehl: "tempo", tempo });
      await warte(60);
    }
    // am belegten Platz übernimmt er den Netzstand (K Festlegung 4) und rechnet weiter
    await bis(() => sp.stand.protokoll.some((e) => e.seq === n + 3 && e.typ === "notiz"), 10000, "Netzstand übernommen");
    expect(sp.stand.upload.zwei).toBeFalsy();
    await bis(() => sp.hostAktiv && sp.stand.upload.hoch === sp.stand.zustand.seq, 5000, "rechnet und lädt wieder hoch");
  }, 20000);

  it("K Festlegung 4 deckt den Fall „anderer, lückenloser Verlauf im Netz“ (Upload 10 von 122): der Laptop übernimmt ihn, kein Hängen", async () => {
    const { code, sl } = await neueSitzung();
    const a = await oeffne(code, "tt", { name: "Lt Anders", takt: { statusMs: 150, uploadMs: 20 } });
    const team = (await a.teamErstellen("Adler"))!;
    await sl.spielOeffnen([team]);
    await bis(() => rechnet(a) && a.spiel(team)!.stand.upload.hoch >= 2, 3000);
    const lauf = a.team(team)!.lauf!;
    const sp = a.spiel(team)!;
    const n = sp.stand.zustand.seq;
    // lückenlos direkt dahinter: Eintrag eines anderen Fensters
    const fremd: Ereignis = { ...sp.stand.protokoll[n - 1], seq: n + 1, typ: "notiz", ts: Date.now() - 5000, daten: { text: "anderes Fenster" } } as Ereignis;
    localStorage.setItem(`argus:v1:s:${code}:lauf:${team}:${lauf}:p:${protokollSchluessel(n + 1)}`, JSON.stringify(fremd));
    sl.sendenAn([team], "uhr", { befehl: "tempo", tempo: 2 });
    await bis(() => sp.stand.protokoll.some((e) => e.seq === n + 1 && e.typ === "notiz"), 8000, "Netzstand übernommen");
    expect(sp.stand.upload.zwei).toBeFalsy();
    await bis(() => sp.hostAktiv && sp.stand.upload.hoch === sp.stand.zustand.seq, 5000, "rechnet und lädt wieder hoch");
  }, 20000);
});

describe("L3 – Notbremse „Alle Sitzungen beenden“", () => {
  it("2 Lobby-Sitzungen, Testraum, 6 Fenster: alle schließen ab und gehen zur Startseite; alte Sitzungen sind beendet; eine neue läuft sofort", async () => {
    const eins = await neueSitzung();
    const zwei = await neueSitzung();
    const speicher = new SpeicherAblage();
    const a = await oeffne(eins.code, "tt", { name: "Lt Anders", merker: new Merker(eins.code, null, speicher) });
    const teamA = (await a.teamErstellen("Adler"))!;
    const b = await oeffne(zwei.code, "tt", { name: "Lt Berg" });
    const teamB = (await b.teamErstellen("Bussard"))!;
    const plenum = await oeffne(eins.code, "plenum");
    const rt = await raumTT("kraehe", { client: "su2a26" });
    const rsl = await raumSL("kraehe");
    await eins.sl.spielOeffnen([teamA]);
    await zwei.sl.spielOeffnen([teamB]);
    await bis(() => rechnet(a) && rechnet(b) && rechnet(rt) && rsl.stand.istHost, 3000, "drei Teams rechnen");
    eins.sl.sendenAn([teamA], "uhr", { befehl: "start" });
    await bis(() => laeuft(a), 3000);
    const spielA = a.spiel(teamA)!;
    localStorage.setItem("argus:einst:letzte_sitzung", JSON.stringify({ code: eins.code, sync: "lokal", zeit: Date.now() }));
    localStorage.setItem(`argus:ich:${zwei.code}`, JSON.stringify({ sitzung: zwei.code, client: "abc123", team: null, teamName: null, rechnete: false, sync: "lokal", zeit: Date.now() }));
    const raumLaufAlt = rsl.team(DIREKT_TEAM)!.lauf;
    const alle = [eins.sl, zwei.sl, a, b, plenum, rt, rsl];
    expect(alle.every((s) => s.stand.reset.geladen && s.stand.reset.ts === null && !s.stand.alleBeendet)).toBe(true);

    const t0 = Date.now();
    expect(await zwei.sl.alleBeenden()).toBe("ok");
    await bis(() => alle.every((s) => s.stand.alleBeendet), 10000, "alle Fenster: alle Sitzungen beendet");
    expect(Date.now() - t0).toBeLessThan(10000);
    expect(hosts(a, b, rt)).toBe(0);
    expect(spielA.hostAktiv).toBe(false);
    expect(spielA.stand.upload.hoch).toBe(spielA.stand.protokoll.length); // Rest hochgeladen
    // alle gemerkten Sitzungen vergessen
    expect(new Merker(eins.code, null, speicher).lies()).toBeNull();
    expect(localStorage.getItem("argus:einst:letzte_sitzung")).toBeNull();
    expect(schluessel().filter((k) => k.startsWith("argus:ich:"))).toEqual([]);
    // Testraum wie mit „Testraum leeren“: keine Einträge, neuer Lauf
    const raum = new LokalAdapter("kraehe");
    const teams = await new Promise<Record<string, { lauf?: string; spieler?: object }>>((ok) => raum.aufTeams(ok));
    expect(Object.keys(teams[DIREKT_TEAM].spieler ?? {})).toEqual([]);
    expect(teams[DIREKT_TEAM].lauf).not.toBe(raumLaufAlt);
    alle.forEach(schliesse);

    // wer die alte Sitzung jetzt öffnet: beendet (Team-Fenster), die Spielleitung kommt noch an die Auswertung
    const spaet = await oeffne(eins.code, "tt", {});
    await bis(() => spaet.stand.beendet !== null, 3000, "alter Code: Sitzung beendet");
    expect(spaet.stand.alleBeendet).toBe(false);
    expect(await spaet.teamErstellen("Zu spät")).toBeNull();
    const slSpaet = await oeffne(eins.code, "sl", { name: "SL 1" });
    await bis(() => slSpaet.stand.beendet !== null && !!slSpaet.spiel(teamA)?.stand.geladen, 3000);
    expect(slSpaet.spiel(teamA)!.stand.zustand.seq).toBeGreaterThan(0);
    expect(slSpaet.stand.alleBeendet).toBe(false);

    // neue Sitzung: läuft sofort
    const drei = await neueSitzung();
    expect(drei.sl.stand.info!.erstellt).toBeGreaterThan(drei.sl.stand.reset.ts!);
    const c = await oeffne(drei.code, "tt", { name: "Lt Clausen" });
    const teamC = (await c.teamErstellen("Condor"))!;
    await drei.sl.spielOeffnen([teamC]);
    await bis(() => rechnet(c) && c.spiel(teamC)!.stand.zustand.seq >= 2, 3000);
    drei.sl.sendenAn([teamC], "uhr", { befehl: "start" });
    await bis(() => laeuft(c) && laeuft(drei.sl, teamC), 3000, "neue Sitzung: Uhr läuft");
    expect(drei.sl.stand.beendet).toBeNull();
    // und der Testraum: neu öffnen rechnet sofort
    const rt2 = await raumTT("kraehe", { client: "neu111" });
    await bis(() => rechnet(rt2), 3000, "Testraum nach der Notbremse: neues Fenster rechnet");
  });

  it("Testraum: Einträge von vor der Marke zählen nicht – auch wenn ihr Fenster beim Reset zu war", async () => {
    const raum = "kraehe";
    const a = await raumTT(raum, { client: "su2a26" });
    await bis(() => rechnet(a), 3000);
    const laufAlt = a.team(DIREKT_TEAM)!.lauf;
    schliesse(a); // Tab zu – der Eintrag bleibt stehen
    await warte(5);
    await new LokalAdapter("kraehe").setzeReset();
    const b = await raumTT(raum, { client: "faj4jn" });
    await bis(() => rechnet(b), 3000, "B rechnet sofort");
    expect(b.team(DIREKT_TEAM)!.spieler.map((x) => x.client)).toEqual(["faj4jn"]);
    await bis(() => b.team(DIREKT_TEAM)!.lauf !== laufAlt, 3000, "neuer Lauf nach der Marke");
    expect(b.stand.alleBeendet).toBe(false);
  });

  it("Alte Firebase-Regeln (Marke nicht les- und schreibbar): nichts bricht, der Knopf meldet den Regelfehler", async () => {
    class AlteRegeln extends LokalAdapter {
      override aufReset(cb: (ts: number | null, lesbar: boolean) => void) {
        queueMicrotask(() => cb(null, false));
        return () => {};
      }
      override async setzeReset(): Promise<void> {
        throw new Error("PERMISSION_DENIED: Permission denied");
      }
    }
    const code = (await Sitzung.anlegen(await inhalte(), (c) => new AlteRegeln(c), "SL 1", neuerCode))!;
    const sl = await oeffne(code, "sl", { name: "SL 1", adapter: new AlteRegeln(code) });
    const a = await oeffne(code, "tt", { name: "Lt Anders", adapter: new AlteRegeln(code) });
    const team = (await a.teamErstellen("Adler"))!;
    await bis(() => sl.stand.istHost && sl.stand.teams.length === 1, 3000);
    await sl.spielOeffnen([team]);
    await bis(() => rechnet(a), 3000);
    sl.sendenAn([team], "uhr", { befehl: "start" });
    await bis(() => laeuft(a) && laeuft(sl, team), 3000, "Spiel läuft mit den alten Regeln");
    expect(sl.stand.reset).toEqual({ ts: null, lesbar: false, geladen: true });

    expect(await sl.alleBeenden()).toBe("regeln");
    expect(sl.stand.resetRegelFehler).toBe(true);
    // kein allgemeiner Regelfehler (roter Balken), kein Fenster beendet, das Spiel läuft weiter
    expect(sl.stand.regelFehler).toBe(false);
    expect(a.stand.regelFehler).toBe(false);
    expect(sl.stand.alleBeendet || a.stand.alleBeendet).toBe(false);
    expect(sl.stand.beendet).toBeNull();
    expect(laeuft(a)).toBe(true);
    // Testraum mit alten Regeln
    const rt = await oeffne("kraehe", "tt", { direkt: { rolle: "zb" }, adapter: new AlteRegeln("kraehe") });
    await bis(() => rechnet(rt), 3000, "Testraum rechnet mit den alten Regeln");
  });

  it("resetEinmal: Marke lesen; Sitzung.anlegen legt die neue Sitzung sicher nach der Marke an", async () => {
    expect(await resetEinmal(new LokalAdapter("kraehe"))).toBeNull();
    // Marke „in der Zukunft“ dieses Rechners (Uhr geht nach): die neue Sitzung liegt trotzdem danach
    localStorage.setItem(RESET_SCHLUESSEL, String(Date.now() + 30000));
    const marke = await resetEinmal(new LokalAdapter("kraehe"));
    expect(marke).toBeGreaterThan(Date.now());
    const { sl } = await neueSitzung();
    expect(sl.stand.info!.erstellt).toBe(marke! + 1);
    await bis(() => sl.stand.reset.geladen, 1000);
    expect(sl.stand.beendet).toBeNull();
  });
});

describe("L4, L5, L6 – Programmstand, Merker, Diagnose", () => {
  it("Anwesenheit: Programmstand, Zeichen und Fenstergröße in version (höchstens 20 Zeichen, Regeln unverändert)", () => {
    const t = { client: "abc123", art: "tt" as const, name: "Lt Anders", version: "90b7bef", fenster: "1536x730" };
    expect(anwesenheitSchreiben(t).version).toBe("90b7bef 1536x730");
    expect(anwesenheitLesen({ ...anwesenheitSchreiben(t), puls: 1 } as never)).toMatchObject({ version: "90b7bef", fenster: "1536x730" });
    // Tab im Hintergrund: großes X
    const h = anwesenheitSchreiben({ ...t, hintergrund: true });
    expect(h.version).toBe("90b7bef 1536X730");
    expect(anwesenheitLesen({ ...h, puls: 1 } as never)).toMatchObject({ version: "90b7bef", fenster: "1536x730", hintergrund: true });
    // zwei Verläufe, Regelfehler
    const z = anwesenheitSchreiben({ ...t, zwei: true, hintergrund: true });
    expect(z.version).toBe("90b7bef !2 1536X730");
    expect(anwesenheitLesen({ ...z, puls: 1 } as never)).toMatchObject({ version: "90b7bef", zwei: true, hintergrund: true, fenster: "1536x730" });
    const rz = anwesenheitSchreiben({ ...t, zwei: true, regeln: true });
    expect(rz.version).toBe("90b7bef !R2 1536x730");
    expect(anwesenheitLesen({ ...rz, puls: 1 } as never)).toMatchObject({ regeln: true, zwei: true });
    // zu lang: erst ohne Fenster
    const lang = anwesenheitSchreiben({ ...t, fenster: "1920x1080", zwei: true, regeln: true });
    expect(lang.version).toBe("90b7bef !R2");
    for (const x of [t, h, z, rz, lang]) expect((("version" in x ? x.version : "") ?? "").length).toBeLessThanOrEqual(20);
    // keine eigenen Felder (die Regeln kennen sie nicht)
    expect(Object.keys(z).sort()).toEqual(["art", "client", "name", "version"]);
    // alter Stand (bis K) bleibt lesbar
    expect(anwesenheitLesen({ client: "abc123", art: "tt", name: "", puls: 1, version: "0.9.0 !R 1536x730" })).toMatchObject({ version: "0.9.0", regeln: true, fenster: "1536x730" });
  });

  it("Spielleitung sieht Programmstand und Gerät je Laptop (aus der Anwesenheit)", async () => {
    const { code, sl } = await neueSitzung();
    const a = await oeffne(code, "tt", { name: "Lt Anders", client: "su2a26" });
    const team = (await a.teamErstellen("Adler"))!;
    await bis(() => !!sl.team(team)?.rechnerOnline, 3000);
    const r = sl.team(team)!.spieler[0];
    expect(r.version).toBe(__ARGUS_COMMIT__);
    expect(sl.team(team)!.rechnerZuletzt).toBeGreaterThan(0);
    const text = diagnoseText(sl);
    expect(text).toContain(`Sitzung ${sl.stand.code}`);
    expect(text).toContain("Laptop SU2A");
    expect(text).toContain("Team Adler");
    expect(text).toMatch(/Serverzeit − Uhr dieses Rechners: -?\d+ ms/);
    expect(text).toMatch(/rechnet ja/);
    expect(text).toContain("Ausstehend: nichts");
    expect(text).not.toContain("Lt Anders"); // keine Namen der Teilnehmer
  });

  it("Nach dem Trennen (Tab zu) trägt sich ein Fenster nicht noch einmal als verbunden ein (visibilitychange feuert nach pagehide)", async () => {
    const a = new LokalAdapter("kraehe");
    await a.verbinden();
    a.meldeAnwesenheit({ client: "abc123", art: "tt", name: "Laptop ABC1", version: "90b7bef" });
    expect(schluessel().some((k) => k.endsWith(":anw:abc123"))).toBe(true);
    a.trennen();
    expect(schluessel().some((k) => k.endsWith(":anw:abc123"))).toBe(false);
    a.meldeAnwesenheit({ client: "abc123", art: "tt", name: "Laptop ABC1", version: "90b7bef", hintergrund: true });
    expect(schluessel().some((k) => k.endsWith(":anw:abc123"))).toBe(false);
  });

  it("Merker gilt 12 h (statt 7 Tage); „vergiss alle“; selber Tag", () => {
    const sp = new SpeicherAblage();
    const m = new Merker("p9p", null, sp);
    m.schreibe({ client: "abc123", team: "tk3x9", teamName: "Adler", rechnete: true, sync: "lokal" });
    expect(m.lies()?.client).toBe("abc123");
    const alt = (h: number) => JSON.stringify({ sitzung: "p9p", client: "abc123", team: null, teamName: null, rechnete: false, sync: "lokal", zeit: Date.now() - h * 3600 * 1000 });
    sp.setItem("argus:ich:p9p", alt(11));
    expect(m.lies()).not.toBeNull();
    expect(gemerkteSitzungen(null, sp)).toHaveLength(1);
    sp.setItem("argus:ich:p9p", alt(13));
    expect(m.lies()).toBeNull();
    expect(gemerkteSitzungen(null, sp)).toHaveLength(0);
    expect(MERKER_MAX_ALTER_MS).toBe(12 * 3600 * 1000);
    sp.setItem("argus:ich:k7p", alt(1).replace("p9p", "k7p"));
    sp.setItem("argus:ich:k7p@b", alt(1).replace("p9p", "k7p"));
    sp.setItem("argus:einst:letzte_sitzung", "{}");
    sp.setItem("argus:einst:sync", "lokal");
    vergissAlleSitzungen(sp);
    expect(sp.length).toBe(1);
    expect(sp.getItem("argus:einst:sync")).toBe("lokal");
    expect(selberTag(Date.now())).toBe(true);
    expect(selberTag(Date.now() - 36 * 3600 * 1000)).toBe(false);
  });
});
