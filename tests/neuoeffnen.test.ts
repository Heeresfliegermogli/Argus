// Liste K (11.11.2026): Spiele sauber schließen und wieder öffnen, keine hängenden Aktionen.
//  K1  derselbe Browser nimmt seine gemerkte Kennung wieder und rechnet sofort weiter; Tab-Wache (zwei Tabs)
//  K2  ein anderes Gerät übernimmt ein verwaistes Team, der alte Laptop stoppt beim Zurückkommen (nie zwei Hosts), Laptop freigeben
//  K3  höchstens 10 s „gesendet …“, Start erreicht spät verbundene Laptops, Start/Pause: nur der letzte gilt, Regelfehler zur SL
//  K4  Sitzung beenden, Team verlassen im Lauf
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Host } from "../src/engine/host";
import type { Aktion, Ereignis } from "../src/kern/ereignisse";
import { ENDE_TEAM, neuerCode } from "../src/kern/sitzungen";
import { Merker, gemerkteSitzungen } from "../src/sitzung/gemerkt";
import { Sitzung, type SitzungsOptionen, teamStaende } from "../src/sitzung/sitzung";
import { TabWache } from "../src/sitzung/tabwache";
import { UEBERNAHME_MS } from "../src/sync/adapter";
import { anwesenheitLesen, anwesenheitSchreiben } from "../src/sync/firebase";
import { LokalAdapter } from "../src/sync/lokal";
import { VerzugAdapter } from "../src/sync/verzug";
import { bis, inhalte, warte } from "./hilfen";
import { SpeicherAblage } from "./setup";

let fenster: Sitzung[] = [];

async function oeffne(code: string, art: "tt" | "sl" | "plenum", opt: Partial<SitzungsOptionen> & { adapter?: LokalAdapter | VerzugAdapter } = {}): Promise<Sitzung> {
  const { adapter, ...rest } = opt;
  const s = new Sitzung(await inhalte(), adapter ?? new LokalAdapter(code), { art, takt: { statusMs: 150 }, uebernahmeMs: 300, ...rest });
  fenster.push(s);
  await s.starten();
  return s;
}

async function neueSitzung(): Promise<{ code: string; sl: Sitzung }> {
  const code = await Sitzung.anlegen(await inhalte(), (c) => new LokalAdapter(c), "SL 1", neuerCode);
  const sl = await oeffne(code!, "sl", { name: "SL 1", zeitlimitMs: 400 });
  await bis(() => sl.stand.istHost && !!sl.stand.info, 3000, "SL steuert");
  return { code: code!, sl };
}

/** Tab schließen: Fenster stoppen (meldet sich ab), aus der Liste nehmen. */
function schliesse(s: Sitzung): void {
  s.stoppen();
  fenster = fenster.filter((x) => x !== s);
}

function hosts(...liste: Sitzung[]): number {
  return liste.filter((s) => s.spiel(s.stand.ich.team)?.hostAktiv).length;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  fenster.forEach((s) => s.stoppen());
  fenster = [];
});

describe("K1 – derselbe Laptop findet sein Spiel wieder", () => {
  it("Merker: Kennung und Team je Sitzung, je „Gerät“ getrennt, alte Einträge verschwinden", () => {
    const sp = new SpeicherAblage();
    const m = new Merker("p9p", null, sp);
    expect(m.lies()).toBeNull();
    m.schreibe({ client: "abc123", team: "tk3x9", teamName: "Adler", rechnete: true, sync: "lokal" });
    expect(m.lies()).toMatchObject({ sitzung: "p9p", client: "abc123", team: "tk3x9", teamName: "Adler", rechnete: true });
    expect(sp.getItem("argus:ich:p9p")).toBeTruthy();
    // zweites „Gerät“ im selben Browser (…&geraet=b): eigener Merkbereich
    const b = new Merker("p9p", "b", sp);
    expect(b.lies()).toBeNull();
    b.schreibe({ client: "zzz999", team: null, teamName: null, rechnete: false, sync: "lokal" });
    expect(gemerkteSitzungen(null, sp).map((g) => g.client)).toEqual(["abc123"]);
    expect(gemerkteSitzungen("b", sp).map((g) => g.client)).toEqual(["zzz999"]);
    // älter als 7 Tage: weg
    sp.setItem("argus:ich:k7p", JSON.stringify({ sitzung: "k7p", client: "alt000", team: null, teamName: null, rechnete: false, sync: "lokal", zeit: Date.now() - 8 * 24 * 3600 * 1000 }));
    expect(gemerkteSitzungen(null, sp).map((g) => g.sitzung)).toEqual(["p9p"]);
    expect(sp.getItem("argus:ich:k7p")).toBeNull();
    m.vergiss();
    expect(m.lies()).toBeNull();
  });

  it("Tab schließen und neu öffnen: gleiche Kennung aus dem Merker, dasselbe Team rechnet sofort weiter – ohne Zutun der Spielleitung", async () => {
    const { code, sl } = await neueSitzung();
    const speicher = new SpeicherAblage();
    const merker = () => new Merker(code, null, speicher);
    let a = await oeffne(code, "tt", { merker: merker(), name: "Lt Anders" });
    const client = a.client;
    const team = (await a.teamErstellen("Adler"))!;
    await bis(() => a.stand.ich.rechnet && sl.stand.teams.length === 1, 3000);
    expect(merker().lies()).toMatchObject({ client, team, teamName: "Adler" });
    await sl.spielOeffnen([team]);
    await bis(() => !!a.spiel(team)?.hostAktiv && a.spiel(team)!.stand.zustand.seq >= 2, 3000, "Team rechnet");
    sl.sendenAn([team], "uhr", { befehl: "start" });
    await bis(() => a.spiel(team)!.stand.zustand.uhr.laeuft, 3000, "Uhr läuft");
    const seqVorher = a.spiel(team)!.stand.zustand.seq;

    // Tab schließen (ohne „Team verlassen“)
    schliesse(a);
    await bis(() => !sl.team(team)!.rechnerOnline, 3000, "SL sieht: Laptop nicht verbunden");
    expect(sl.team(team)!.rechner).toBe(client);

    // neu öffnen über Startseite + Code: Kennung kommt aus dem Merker (main.tsx: e.ich ?? merker.lies().client)
    const gemerkt = merker().lies()!;
    expect(gemerkt.client).toBe(client);
    a = await oeffne(code, "tt", { merker: merker(), client: gemerkt.client });
    await bis(() => a.stand.ich.team === team && a.stand.ich.rechnet && !!a.spiel(team)?.hostAktiv, 3000, "derselbe Laptop rechnet wieder");
    await bis(() => a.spiel(team)!.stand.geladen && a.spiel(team)!.stand.zustand.seq >= seqVorher, 3000, "Protokoll wieder da");
    expect(a.spiel(team)!.stand.zustand.uhr.laeuft).toBe(true);
    expect(a.stand.ich.abgeloest).toBe(false);
    await bis(() => sl.team(team)!.rechnerOnline, 3000, "SL sieht den Laptop wieder");
    // und das Team entscheidet wie vorher (Aktion geht ohne Netz an den Host)
    sl.sendenAn([team], "uhr", { befehl: "pause" });
    await bis(() => !a.spiel(team)!.stand.zustand.uhr.laeuft, 3000, "Pause der SL kommt an");
    expect(sl.spiel(team)!.wartetAuf("uhr")).toBe(false);
  });

  it("Tab-Wache: der zweite Tab erfährt, dass die Kennung schon lebt; „hierher holen“ gibt sauber ab; gleichzeitig öffnen: genau einer", async () => {
    const sp = new SpeicherAblage();
    const eins = new TabWache("p9p:abc123", undefined, sp);
    const zwei = new TabWache("p9p:abc123", undefined, sp);
    try {
      expect(await eins.beanspruchen(150)).toBe(true);
      expect(await zwei.beanspruchen(150)).toBe(false);
      expect(eins.inhaber).toBe(true);
      // andere Kennung, andere Sitzung: unabhängig
      const fremd = new TabWache("p9p:zzz999", undefined, sp);
      expect(await fremd.beanspruchen(150)).toBe(true);
      fremd.stoppen();
      // hierher holen: der Inhaber wird gerufen, hört auf und meldet frei
      let verloren = 0;
      eins.aufVerlust(() => { verloren += 1; });
      await zwei.holen(1000);
      expect(verloren).toBe(1);
      expect(eins.inhaber).toBe(false);
      expect(await zwei.beanspruchen(150)).toBe(true);
      // der erste Tab holt es zurück
      await eins.holen(1000);
      expect(zwei.inhaber).toBe(false);
      expect(await eins.beanspruchen(150)).toBe(true);
    } finally {
      eins.stoppen();
      zwei.stoppen();
    }
    // geschlossener Tab blockiert nichts
    const drei = new TabWache("p9p:abc123", undefined, sp);
    expect(await drei.beanspruchen(150)).toBe(true);
    drei.stoppen();
    // zwei Tabs fragen gleichzeitig (Browser stellt Tabs wieder her): genau einer wird Inhaber
    const a = new TabWache("k7p:abc123", undefined, sp);
    const b = new TabWache("k7p:abc123", undefined, sp);
    const erg = await Promise.all([a.beanspruchen(200), b.beanspruchen(200)]);
    expect(erg.filter(Boolean).length).toBe(1);
    a.stoppen();
    b.stoppen();
  });

  it("zweiter Tab (Gast): sieht dem Team der Kennung zu, steht nicht im Team, rechnet nie", async () => {
    const { code, sl } = await neueSitzung();
    const a = await oeffne(code, "tt", { name: "Lt Anders" });
    const team = (await a.teamErstellen("Adler"))!;
    await sl.spielOeffnen([team]);
    await bis(() => !!a.spiel(team)?.hostAktiv && a.spiel(team)!.stand.zustand.seq >= 2, 3000);
    const gast = await oeffne(code, "tt", { gastVon: a.client });
    await bis(() => gast.stand.ich.team === team && !!gast.spiel(team)?.stand.geladen, 3000, "Gast sieht das Team");
    expect(gast.stand.gast).toBe(true);
    expect(gast.stand.ich.rechnet).toBe(false);
    expect(gast.spiel(team)!.hostAktiv).toBe(false);
    await warte(300);
    expect(sl.team(team)!.spieler.map((x) => x.client)).toEqual([a.client]);
    expect(sl.stand.teilnehmer.some((t) => t.client === gast.client)).toBe(false);
    expect(await gast.teamUebernehmen(team)).toBe(false);
    expect(hosts(a, gast)).toBe(1);
  });
});

describe("K2 – ein anderes Gerät übernimmt, wenn der Laptop weg ist", () => {
  it("teamStaende: „nicht verbunden seit“ und übernehmbar erst nach 20 s", () => {
    const teams = { tk3x9: { name: "Adler", farbe: "#e8839b", erstellt: 1, spieler: { abc123: { name: "A", rollen: "zb", seit: 10 } } } };
    const weg = (jetzt: number) => ({ jetzt, wegSeit: () => 100_000 });
    const frisch = teamStaende(teams, [], weg(100_000 + UEBERNAHME_MS - 1))[0];
    expect(frisch).toMatchObject({ rechner: "abc123", rechnerOnline: false, rechnerWegSeit: 100_000, uebernehmbar: false });
    expect(teamStaende(teams, [], weg(100_000 + UEBERNAHME_MS))[0].uebernehmbar).toBe(true);
    const da = teamStaende(teams, [{ client: "abc123", art: "tt", name: "A", puls: 1 }], weg(999_999))[0];
    expect(da).toMatchObject({ rechnerOnline: true, rechnerWegSeit: null, uebernehmbar: false });
    // die Marke „Sitzung beendet“ ist kein Team
    expect(teamStaende({ ...teams, [ENDE_TEAM]: { name: "Sitzung beendet", farbe: "#000000", erstellt: 5 } }, []).map((t) => t.id)).toEqual(["tk3x9"]);
  });

  it("verwaistes Team: nicht solange der Laptop verbunden ist, danach sichtbar übernehmen; der alte Laptop kommt zurück und rechnet nicht mehr", async () => {
    const { code, sl } = await neueSitzung();
    const speicher = new SpeicherAblage();
    let a = await oeffne(code, "tt", { name: "Lt Anders", merker: new Merker(code, null, speicher) });
    const clientA = a.client;
    const team = (await a.teamErstellen("Adler"))!;
    await sl.spielOeffnen([team]);
    await bis(() => !!a.spiel(team)?.hostAktiv && a.spiel(team)!.stand.zustand.seq >= 2, 3000);
    sl.sendenAn([team], "uhr", { befehl: "start" });
    await bis(() => a.spiel(team)!.stand.zustand.uhr.laeuft, 3000);

    const b = await oeffne(code, "tt", { name: "Lt Berg" });
    await bis(() => b.stand.teams.length === 1 && b.team(team)!.rechnerOnline, 3000);
    // solange der Laptop verbunden ist: keine Übernahme
    expect(b.team(team)!.uebernehmbar).toBe(false);
    expect(await b.teamUebernehmen(team)).toBe(false);
    expect(b.stand.ich.team).toBeNull();

    schliesse(a);
    await bis(() => !b.team(team)!.rechnerOnline, 3000, "Laptop weg");
    expect(b.team(team)!.rechnerWegSeit).not.toBeNull();
    await bis(() => b.team(team)!.uebernehmbar, 3000, "nach der Wartezeit übernehmbar");
    await bis(() => !!sl.team(team)!.rechnerWegSeit && !sl.team(team)!.rechnerOnline, 3000, "SL: nicht verbunden seit …");
    const seqNetz = (await sl.adapter.ladeProtokoll(team, sl.team(team)!.lauf!)).length;

    expect(await b.teamUebernehmen(team)).toBe(true);
    await bis(() => b.stand.ich.rechnet && !!b.spiel(team)?.hostAktiv, 3000, "B rechnet");
    await bis(() => b.spiel(team)!.stand.zustand.seq >= seqNetz, 3000, "ab dem hochgeladenen Protokoll");
    expect(b.spiel(team)!.stand.zustand.uhr.laeuft).toBe(true);
    await bis(() => sl.team(team)!.rechner === b.client && sl.team(team)!.rechnerOnline, 3000, "SL sieht den neuen Laptop");

    // der alte Laptop kommt zurück (gleiche Kennung aus dem Merker): Zuschauer, „abgelöst“, kein Host
    a = await oeffne(code, "tt", { client: clientA, merker: new Merker(code, null, speicher) });
    await bis(() => a.stand.ich.team === team && !!a.spiel(team)?.stand.geladen, 3000, "A wieder im Team");
    await warte(300);
    expect(a.stand.ich.rechnet).toBe(false);
    expect(a.stand.ich.abgeloest).toBe(true);
    expect(a.spiel(team)!.hostAktiv).toBe(false);
    expect(hosts(a, b)).toBe(1);
    // B entscheidet weiter, A folgt
    const seq = b.spiel(team)!.stand.zustand.seq;
    sl.sendenAn([team], "uhr", { befehl: "pause" });
    await bis(() => b.spiel(team)!.stand.zustand.seq > seq && !a.spiel(team)!.stand.zustand.uhr.laeuft, 3000, "A sieht, was B rechnet");
  });

  it("Test mit Trennung: der Laptop spielt ohne Netz weiter, ein anderer übernimmt – beim Wiederverbinden stoppt der alte sofort (nie zwei verbundene Hosts)", async () => {
    const { code, sl } = await neueSitzung();
    const netzA = new VerzugAdapter(new LokalAdapter(code), 20);
    const a = await oeffne(code, "tt", { name: "Lt Anders", adapter: netzA });
    const team = (await a.teamErstellen("Adler"))!;
    await bis(() => sl.stand.teams.length === 1, 3000);
    await sl.spielOeffnen([team]);
    await bis(() => !!a.spiel(team)?.hostAktiv && a.spiel(team)!.stand.zustand.seq >= 2, 3000);
    sl.sendenAn([team], "uhr", { befehl: "start" });
    await bis(() => a.spiel(team)!.stand.zustand.uhr.laeuft, 3000);
    const b = await oeffne(code, "tt", { name: "Lt Berg" });

    // Netz von A weg: A rechnet weiter (H1.3), für die anderen ist A nicht verbunden
    netzA.trennenSimuliert(true);
    await bis(() => !b.team(team)?.rechnerOnline && !!b.team(team)?.uebernehmbar, 4000, "A gilt als weg");
    expect(a.spiel(team)!.hostAktiv).toBe(true);
    expect(await b.teamUebernehmen(team)).toBe(true);
    await bis(() => !!b.spiel(team)?.hostAktiv, 3000, "B rechnet");
    // jetzt rechnen zwei – aber nur einer ist verbunden
    const verbundeneHosts = () => (a.spiel(team)?.hostAktiv && !netzA.istGetrennt ? 1 : 0) + (b.spiel(team)?.hostAktiv ? 1 : 0);
    expect(verbundeneHosts()).toBe(1);

    // A bekommt wieder Netz: sieht, dass B das früheste Fenster ist, und stoppt
    netzA.trennenSimuliert(false);
    await bis(() => !a.spiel(team)?.hostAktiv, 3000, "A stoppt seinen Host");
    expect(a.stand.ich.rechnet).toBe(false);
    expect(a.stand.ich.abgeloest).toBe(true);
    expect(verbundeneHosts()).toBe(1);
    // B kann weiter hochladen: das Netzprotokoll ist lückenlos und B folgt ihm
    sl.sendenAn([team], "uhr", { befehl: "pause" });
    await bis(() => !b.spiel(team)!.stand.zustand.uhr.laeuft, 4000, "Pause bei B");
    await bis(() => b.spiel(team)!.stand.upload.hoch === b.spiel(team)!.stand.zustand.seq, 4000, "B ganz im Netz");
    const netz = await sl.adapter.ladeProtokoll(team, sl.team(team)!.lauf!);
    expect(netz.map((e) => e.seq)).toEqual(netz.map((_, i) => i + 1));
    expect(b.spiel(team)!.stand.upload.fremd).toBeFalsy();
    await bis(() => sl.spiel(team)!.stand.zustand.seq === b.spiel(team)!.stand.zustand.seq, 3000, "SL hat denselben Stand");
  });

  it("Spielleitung gibt den Laptop frei: ein Zuschauer rechnet weiter; ohne Zuschauer rechnet, wer neu beitritt", async () => {
    const { code, sl } = await neueSitzung();
    const a = await oeffne(code, "tt", { name: "Lt Anders" });
    const team = (await a.teamErstellen("Adler"))!;
    const z = await oeffne(code, "tt", { name: "Lt Zuschauer" });
    await bis(() => z.stand.teams.length === 1, 3000);
    // Beitritt in derselben Millisekunde wie das Anlegen: dann entscheidet die Kennung, wer rechnet (genau einer) – hier soll es A sein
    await warte(5);
    await z.teamBeitreten(team);
    await bis(() => sl.team(team)?.spieler.length === 2 && sl.team(team)!.rechner === a.client, 3000, "A ist der Team-Laptop, Z sieht zu");
    expect(await sl.spielOeffnen([team])).toBe(true);
    await bis(() => !!a.spiel(team)?.hostAktiv, 3000, "A rechnet");
    expect(z.stand.ich.rechnet).toBe(false);
    schliesse(a);
    await bis(() => !sl.team(team)!.rechnerOnline, 3000);
    await warte(200);
    expect(z.stand.ich.rechnet).toBe(false); // nichts von selbst
    expect(await sl.laptopFreigeben(team)).toBe(true);
    await bis(() => z.stand.ich.rechnet && !!z.spiel(team)?.hostAktiv, 3000, "Zuschauer rechnet nach der Freigabe");
    expect(sl.team(team)!.spieler.map((x) => x.client)).toEqual([z.client]);

    // jetzt auch dieser weg, freigeben: Team ohne Laptop – ein neues Fenster tritt bei und rechnet
    schliesse(z);
    await bis(() => !sl.team(team)!.rechnerOnline, 3000);
    expect(await sl.laptopFreigeben(team)).toBe(true);
    await bis(() => sl.team(team)!.rechner === null, 3000);
    const n = await oeffne(code, "tt", { name: "Lt Neu" });
    await bis(() => n.stand.teams.length === 1, 3000);
    expect(await n.teamBeitreten(team)).toBe(true);
    await bis(() => n.stand.ich.rechnet && !!n.spiel(team)?.hostAktiv, 3000, "neues Fenster rechnet");
  });
});

describe("K3 – keine hängenden „gesendet …“", () => {
  it("nach dem Zeitlimit kein „gesendet …“ mehr: Hinweis „antwortet nicht“, die Aktion steht aus; Start erreicht den spät verbundenen Laptop", async () => {
    const { code, sl } = await neueSitzung();
    const speicher = new SpeicherAblage();
    let a = await oeffne(code, "tt", { name: "Lt Anders", merker: new Merker(code, null, speicher) });
    const client = a.client;
    const team = (await a.teamErstellen("Adler"))!;
    await bis(() => sl.stand.teams.length === 1, 3000);
    await sl.spielOeffnen([team]);
    await bis(() => !!a.spiel(team)?.hostAktiv && a.spiel(team)!.stand.zustand.seq >= 2, 3000);
    await bis(() => sl.spiel(team)!.stand.zustand.seq >= 2, 3000);
    schliesse(a);
    await bis(() => !sl.team(team)!.rechnerOnline, 3000);

    const t0 = Date.now();
    sl.sendenAn([team], "uhr", { befehl: "start" });
    expect(sl.spiel(team)!.wartetAuf("uhr")).toBe(true);
    await bis(() => !sl.spiel(team)!.wartetAuf("uhr"), 2000, "Zeitlimit");
    expect(Date.now() - t0).toBeLessThan(1500); // im Test 400 ms, im Spiel 10 s (ZEITLIMIT_MS)
    expect(sl.hinweise.liste.some((h) => /Team Adler antwortet nicht – Laptop nicht verbunden/.test(h.text))).toBe(true);
    // die Aktion steht aus: „Start wartet auf Laptop“
    expect(sl.spiel(team)!.ausstehendeUhr()).toBe("start");
    expect(sl.spiel(team)!.stand.zustand.uhr.laeuft).toBe(false);

    // zweite Spielleitung (neu geöffnet) sieht dasselbe aus dem Kanal
    const sl2 = await oeffne(code, "sl", { name: "SL 2" });
    await bis(() => sl2.spiel(team)?.ausstehendeUhr() === "start", 3000, "SL 2 sieht den wartenden Start");

    // Laptop kommt wieder: Start wird ausgeführt, Uhr ab Startzeit (H1.4)
    await warte(300);
    a = await oeffne(code, "tt", { client, merker: new Merker(code, null, speicher) });
    await bis(() => !!a.spiel(team)?.hostAktiv && a.spiel(team)!.stand.zustand.uhr.laeuft, 3000, "Start kommt beim Wiederverbinden an");
    const uhr = a.spiel(team)!.stand.protokoll.filter((e) => e.typ === "uhr").at(-1)!;
    expect((uhr.daten as { ab_ts?: number }).ab_ts).toBeTypeOf("number");
    expect(a.spiel(team)!.spielzeit()).toBeGreaterThan(0.3);
    await bis(() => sl.spiel(team)!.ausstehendeUhr() === null && sl2.spiel(team)!.ausstehendeUhr() === null, 3000, "nichts steht mehr aus");
    expect(sl.spiel(team)!.stand.ueberfaellig).toEqual({});
  });

  it("Spiel öffnen für ein Team ohne verbundenen Laptop: Hinweis statt stillem Nichts; das Spiel startet, sobald einer beitritt", async () => {
    const { code, sl } = await neueSitzung();
    const a = await oeffne(code, "tt", { name: "Lt Anders" });
    const team = (await a.teamErstellen("Adler"))!;
    await bis(() => sl.stand.teams.length === 1, 3000);
    schliesse(a);
    await bis(() => !sl.team(team)!.rechnerOnline, 3000);
    expect(await sl.spielOeffnen([team])).toBe(true);
    expect(sl.hinweise.liste.some((h) => /Team Adler: kein Laptop verbunden – das Spiel startet, sobald einer beitritt/.test(h.text))).toBe(true);
    await sl.laptopFreigeben(team);
    const n = await oeffne(code, "tt", { name: "Lt Neu" });
    await bis(() => n.stand.teams.length === 1, 3000);
    await n.teamBeitreten(team);
    await bis(() => !!n.spiel(team)?.hostAktiv && n.spiel(team)!.stand.zustand.seq >= 2, 3000, "Spiel startet beim Beitritt");
  });

  it("Host: alter Start, auf den schon ein Anhalten folgt, ist überholt – nur der letzte Befehl gilt; frische Aktionen sofort", async () => {
    const inh = await inhalte();
    let jetzt = 1_000_000;
    const aus: Ereignis[] = [];
    let liefere: (a: Aktion) => void = () => {};
    const kanal = { serverJetzt: () => jetzt, aufAktionen: (_l: string, cb: (a: Aktion) => void) => { liefere = cb; return () => {}; } };
    const host = new Host(inh, kanal, "20261111-2000-abcd", [], { rolle: "zb", client: "abc123" }, { taktMs: 0, ausgabe: (e) => aus.push(e) });
    host.starten();
    const uhr = (id: string, befehl: "start" | "pause", ts: number): Aktion => ({ id, typ: "uhr", von: { rolle: "sl", client: "sl0001" }, ts, daten: { befehl } }) as Aktion;
    // Laptop war weg: Start vor 40 s, Anhalten vor 20 s – beide kommen beim Verbinden auf einmal
    liefere(uhr("a-start-0000001", "start", jetzt - 40_000));
    liefere(uhr("a-pause-0000002", "pause", jetzt - 20_000));
    expect(host.zustand.uhr.laeuft).toBe(false); // gesammelt, noch nicht ausgeführt
    await warte(5);
    expect(host.zustand.uhr.laeuft).toBe(false);
    expect(host.jetztT()).toBe(0);
    const abgelehnt = aus.filter((e) => e.typ === "aktion_abgelehnt");
    expect(abgelehnt.length).toBe(1);
    expect(abgelehnt[0].aktion).toBe("a-start-0000001");
    expect(String((abgelehnt[0].daten as { grund: string }).grund)).toMatch(/überholt/);
    expect(host.zustand.aktionen["a-pause-0000002"]).toBeDefined();
    // Start, Anhalten, Start: der letzte Start gilt, Uhr ab seiner Zeit
    liefere(uhr("a-start-0000003", "start", jetzt - 10_000));
    await warte(5);
    expect(host.zustand.uhr.laeuft).toBe(true);
    expect(host.jetztT()).toBeGreaterThanOrEqual(9.9);
    // frische Aktion: sofort, ohne Warten
    jetzt += 5000;
    liefere(uhr("a-pause-0000004", "pause", jetzt));
    expect(host.zustand.uhr.laeuft).toBe(false);
    host.stoppen();
  });

  it("Regelfehler eines Team-Fensters reist in der Anwesenheit zur Spielleitung (Firebase: im Feld version, höchstens 20 Zeichen)", () => {
    const t = { client: "abc123", art: "tt" as const, name: "Lt Anders", version: "0.9.0", fenster: "1536x730", regeln: true };
    const roh = anwesenheitSchreiben(t);
    expect(roh).toEqual({ client: "abc123", art: "tt", name: "Lt Anders", version: "0.9.0 !R 1536x730" });
    expect((roh.version ?? "").length).toBeLessThanOrEqual(20);
    expect(anwesenheitLesen({ ...roh, puls: 1 } as never)).toMatchObject({ version: "0.9.0", fenster: "1536x730", regeln: true });
    // ohne Fehler wie seit Liste J
    expect(anwesenheitSchreiben({ ...t, regeln: undefined }).version).toBe("0.9.0 1536x730");
    expect(anwesenheitLesen({ client: "abc123", art: "tt", name: "", puls: 1, version: "0.9.0 1536x730" })).toMatchObject({ version: "0.9.0", fenster: "1536x730" });
    expect(anwesenheitLesen({ client: "abc123", art: "tt", name: "", puls: 1, version: "0.9.0" }).regeln).toBeUndefined();
    // zu lang: erst ohne Fenster – das Zeichen bleibt
    expect(anwesenheitSchreiben({ ...t, version: "0.10.12-beta", fenster: "1920x1080" }).version).toBe("0.10.12-beta !R");
  });
});

describe("K4 – Spiele und Sitzungen sauber beenden", () => {
  it("Team verlassen während des Laufs: Host hält an, Protokoll ganz im Netz; ein anderer Laptop tritt bei und führt weiter", async () => {
    const { code, sl } = await neueSitzung();
    const a = await oeffne(code, "tt", { name: "Lt Anders" });
    const team = (await a.teamErstellen("Adler"))!;
    await bis(() => sl.stand.teams.length === 1, 3000);
    await sl.spielOeffnen([team]);
    await bis(() => !!a.spiel(team)?.hostAktiv && a.spiel(team)!.stand.zustand.seq >= 2, 3000);
    sl.sendenAn([team], "uhr", { befehl: "start" });
    await bis(() => a.spiel(team)!.stand.zustand.uhr.laeuft, 3000);
    const seq = a.spiel(team)!.stand.zustand.seq;
    const lauf = sl.team(team)!.lauf!;
    expect(await a.teamVerlassen()).toBe(true);
    await bis(() => a.stand.ich.team === null && sl.team(team)!.spieler.length === 0, 3000, "A ist raus");
    expect(a.spiel(team)).toBeNull();
    expect((await sl.adapter.ladeProtokoll(team, lauf)).length).toBe(seq);
    const b = await oeffne(code, "tt", { name: "Lt Berg" });
    await bis(() => b.stand.teams.length === 1, 3000);
    expect(await b.teamBeitreten(team)).toBe(true);
    await bis(() => b.stand.ich.rechnet && !!b.spiel(team)?.hostAktiv && b.spiel(team)!.stand.zustand.seq >= seq, 3000, "B führt weiter");
    expect(b.spiel(team)!.stand.zustand.uhr.laeuft).toBe(true);
    expect(hosts(a, b)).toBe(1);
  });

  it("Sitzung beenden: Team-Fenster halten an, laden hoch und vergessen die Sitzung; Protokolle bleiben; danach eine neue Sitzung ohne Reste", async () => {
    const { code, sl } = await neueSitzung();
    const speicher = new SpeicherAblage();
    const a = await oeffne(code, "tt", { name: "Lt Anders", merker: new Merker(code, null, speicher) });
    const plenum = await oeffne(code, "plenum");
    const team = (await a.teamErstellen("Adler"))!;
    await bis(() => sl.stand.teams.length === 1, 3000);
    await sl.spielOeffnen([team]);
    await bis(() => !!a.spiel(team)?.hostAktiv && a.spiel(team)!.stand.zustand.seq >= 2, 3000);
    sl.sendenAn([team], "uhr", { befehl: "start" });
    await bis(() => a.spiel(team)!.stand.zustand.uhr.laeuft, 3000);
    expect(new Merker(code, null, speicher).lies()).not.toBeNull();
    const lauf = sl.team(team)!.lauf!;

    // nur die steuernde Spielleitung
    expect(await plenum.sitzungBeenden()).toBe(false);
    expect(await sl.sitzungBeenden()).toBe(true);
    await bis(() => a.stand.beendet !== null && plenum.stand.beendet !== null && sl.stand.beendet !== null, 3000, "alle wissen es");
    await bis(() => !a.spiel(team)?.hostAktiv, 3000, "Team-Laptop rechnet nicht mehr");
    expect(a.stand.ich.rechnet).toBe(false);
    expect(new Merker(code, null, speicher).lies()).toBeNull();
    const seq = a.spiel(team)!.stand.zustand.seq;
    await warte(400);
    expect(a.spiel(team)!.stand.zustand.seq).toBe(seq); // kein Ereignis mehr
    // die Marke ist kein Team; Protokoll bleibt für die Auswertung
    expect(sl.stand.teams.map((t) => t.id)).toEqual([team]);
    expect((await sl.adapter.ladeProtokoll(team, lauf)).length).toBe(seq);
    expect(sl.spiel(team)!.stand.zustand.seq).toBe(seq);
    // nach dem Ende: nichts mehr anlegen, öffnen, beitreten
    expect(await a.teamErstellen("Nachzügler")).toBeNull();
    expect(await sl.spielOeffnen([team])).toBe(false);
    // eine später geöffnete Spielleitung kommt noch an die Auswertung
    const sl3 = await oeffne(code, "sl", { name: "SL 3" });
    await bis(() => sl3.stand.beendet !== null && sl3.spiel(team)?.stand.zustand.seq === seq, 3000, "SL 3 liest das Protokoll");

    // neue Sitzung: neuer Code, keine Teams, kein Merker, derselbe Laptop legt neu an und rechnet
    const neu = await neueSitzung();
    expect(neu.code).not.toBe(code);
    expect(neu.sl.stand.teams).toEqual([]);
    expect(neu.sl.stand.beendet).toBeNull();
    const m2 = new Merker(neu.code, null, speicher);
    expect(m2.lies()).toBeNull();
    const a2 = await oeffne(neu.code, "tt", { name: "Lt Anders", merker: m2 });
    const t2 = (await a2.teamErstellen("Adler"))!;
    await bis(() => neu.sl.stand.teams.length === 1, 3000);
    await neu.sl.spielOeffnen([t2]);
    await bis(() => !!a2.spiel(t2)?.hostAktiv && a2.spiel(t2)!.stand.zustand.seq >= 2, 3000, "neue Sitzung läuft");
    expect(gemerkteSitzungen(null, speicher).map((g) => g.sitzung)).toEqual([neu.code]);
  });
});
