// Prüft firebase/database.rules.json mit targaryen (Nachbildung der Firebase-Regelauswertung).
// Wichtigster Fall: Ein echter Testlauf mit zwei Team-Laptops (Lobby, Upload des Protokolls in Stücken, Statusmeldungen, Aktionen der
// Spielleitung) wird angenommen; Überschreiben, Löschen, fremde Pfade und eine Sitzungsliste werden abgewiesen. Dazu das ganze
// Drehbuch mit fünf Teams: jedes Ereignis und jede Aktion muss durch die Regeln gehen.
// Seit 2.6 (H1): neuer Pfad status/$team, Rolle „zb“ statt g1/g2/g3 – die Regeln müssen in der Konsole neu veröffentlicht werden.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Aktion, Ereignis } from "../src/kern/ereignisse";
import { bereinigt, EREIGNIS_TYPEN, protokollSchluessel } from "../src/kern/ereignisse";
import { neuerCode } from "../src/kern/sitzungen";
import { Sicht } from "../src/sitzung/sicht";
import { Sitzung } from "../src/sitzung/sitzung";
import type { SitzungsInfo, TeamDaten } from "../src/sync/adapter";
import type { TeamStatus } from "../src/kern/uebersicht";
import { LokalAdapter } from "../src/sync/lokal";
import { bis, inhalte } from "./hilfen";
import { type DrehbuchReferenz, type Modellteam, START_MS, drehbuchTeams, spieleDurch } from "./modellteam";

const require = createRequire(import.meta.url);
const targaryen = require("targaryen") as {
  database(rules: unknown, data: unknown): Db;
};
interface Ergebnis { allowed: boolean; info: string; newDatabase: Db }
interface Db {
  with(o: { debug: boolean }): Db;
  as(auth: unknown): Db;
  read(pfad: string): Ergebnis;
  write(pfad: string, wert: unknown, now?: number): Ergebnis;
  update(pfad: string, patch: Record<string, unknown>, now?: number): Ergebnis;
}
const regeln = require("../firebase/database.rules.json");

const S = "/argus/v1/sitzungen/k7p";
const TEAM = "tk3x9a";
const LAUF = "20261125-0930-abcd";
const P = `${S}/laeufe/${TEAM}/${LAUF}/protokoll`;
const A = `${S}/laeufe/${TEAM}/${LAUF}/aktionen`;
const leer = () => targaryen.database(regeln, {}).with({ debug: true }).as(null);

const info = (extra: Partial<SitzungsInfo> = {}) => ({
  code: "K7P", szenario: "kraehe-01", version: "1.3", titel: "ARGUS – Verteidigung Brücke ELSTER", erstellt: Date.now(), von: "SL 1", ...extra,
});
const team = (extra: Partial<TeamDaten> = {}) => ({ name: "Falke", farbe: "#e8839b", erstellt: Date.now(), ...extra });
const ereignis = (seq: number, extra: Partial<Ereignis> = {}) => ({
  seq, typ: "notiz", ts: Date.now(), t_s: 12.5, von: { rolle: "sl", client: "abc123", name: "SL 1" }, daten: { text: "x" }, ...extra,
});

describe("Firebase-Regeln: Sitzung, Teams, Spieler", () => {
  it("Sitzung lesbar, Sitzungsliste und fremde Pfade nicht", () => {
    expect(leer().read(`${S}/teams`).allowed).toBe(true);
    expect(leer().read(`${S}/info`).allowed).toBe(true);
    expect(leer().read("/argus/v1/sitzungen").allowed).toBe(false);
    expect(leer().read("/argus/v1").allowed).toBe(false);
    expect(leer().read("/").allowed).toBe(false);
    expect(leer().write("/irgendwas", 1).allowed).toBe(false);
    expect(leer().write(`${S}/fremd`, 1).allowed).toBe(false);
    expect(leer().read("/argus/v1/sitzungen/Gross Buchstaben/teams").allowed).toBe(false);
    expect(leer().write("/argus/v1/raeume/kraehe/aktuell", LAUF).allowed).toBe(false); // alter Raum-Bereich ist zu
  });

  it("kurze Codes (B2): drei Zeichen ohne verwechselbare, Räume des Tests ohne Lobby ab vier Zeichen", () => {
    expect(leer().read("/argus/v1/sitzungen/k7p/teams").allowed).toBe(true);
    expect(leer().read("/argus/v1/sitzungen/a3x/info").allowed).toBe(true);
    expect(leer().read("/argus/v1/sitzungen/o1l/teams").allowed).toBe(false); // 0/O, 1/I/L gibt es nicht
    expect(leer().read("/argus/v1/sitzungen/b8s/teams").allowed).toBe(false);
    expect(leer().read("/argus/v1/sitzungen/ab/teams").allowed).toBe(false);
    expect(leer().read("/argus/v1/sitzungen/bedientest/teams").allowed).toBe(true);
    expect(leer().write("/argus/v1/sitzungen/o1l/info", info({ code: "O1L" })).allowed).toBe(false);
    expect(leer().write("/argus/v1/sitzungen/a3x/info", info({ code: "A3X" })).allowed).toBe(true);
    expect(leer().write("/argus/v1/sitzungen/a3x/info", info({ code: "A3Y" })).allowed).toBe(false);
  });

  it("info: einmal anlegen, Code passt zum Schlüssel, danach unveränderlich", () => {
    const erst = leer().write(`${S}/info`, info());
    expect(erst.allowed).toBe(true);
    expect(erst.newDatabase.write(`${S}/info`, info({ von: "jemand" })).allowed).toBe(false);
    expect(erst.newDatabase.write(`${S}/info`, null).allowed).toBe(false);
    expect(leer().write(`${S}/info`, info({ code: "ANDERS-1X" })).allowed).toBe(false);
    expect(leer().write(`${S}/info`, { ...info(), extra: 1 }).allowed).toBe(false);
  });

  it("Teams: Form wird geprüft, Umbenennen, Lauf setzen und Löschen gehen", () => {
    const db = leer();
    const t = db.write(`${S}/teams/${TEAM}`, team({ spieler: { abc123: { name: "Lt Anders", rollen: "zb" } } }));
    expect(t.allowed, t.info.slice(-300)).toBe(true);
    const mit = t.newDatabase;
    expect(mit.update(`${S}/teams/${TEAM}`, { name: "Falke Nord" }).allowed).toBe(true);
    expect(mit.update(`${S}/teams/${TEAM}`, { lauf: LAUF }).allowed).toBe(true);
    expect(mit.update(`${S}/teams/${TEAM}`, { lauf: "gestern" }).allowed).toBe(false);
    expect(mit.update(`${S}/teams/${TEAM}`, { name: "x".repeat(25) }).allowed).toBe(false);
    expect(mit.update(`${S}/teams/${TEAM}`, { name: "" }).allowed).toBe(false);
    expect(mit.update(`${S}/teams/${TEAM}`, { farbe: "rot" }).allowed).toBe(false);
    expect(mit.update(`${S}/teams/${TEAM}`, { admin: true }).allowed).toBe(false);
    expect(mit.write(`${S}/teams/${TEAM}`, null).allowed).toBe(true);
    expect(db.write(`${S}/teams/Falke`, team()).allowed).toBe(false); // Kennung
    expect(db.write(`${S}/teams/t1`, team()).allowed).toBe(false);
    expect(db.write(`${S}/teams/${TEAM}`, { name: "Falke" }).allowed).toBe(false); // Kopf unvollständig
    // Spieler nur in ein bestehendes Team (sonst fehlt der Kopf)
    expect(db.write(`${S}/teams/${TEAM}/spieler/abc123`, { name: "x", rollen: "zb" }).allowed).toBe(false);
  });

  it("Spieler: eine Rolle (zb), Teamwechsel in einem Schreibvorgang", () => {
    let db = leer().write(`${S}/teams/${TEAM}`, team()).newDatabase;
    db = db.write(`${S}/teams/tz9y8x`, team({ name: "Orion", farbe: "#e3d36b" })).newDatabase;
    const sp = (rollen: string) => ({ name: "Lt Anders", rollen });
    expect(db.write(`${S}/teams/${TEAM}/spieler/abc123`, sp("zb")).allowed).toBe(true);
    // die alten Rollen G1–G3 gibt es seit 2.6 nicht mehr
    for (const r of ["", "g1", "g2,g3", "g1,g2,g3", "sl", "zb,zb", "zb;g1"]) expect(db.write(`${S}/teams/${TEAM}/spieler/abc123`, sp(r)).allowed, r).toBe(false);
    expect(db.write(`${S}/teams/${TEAM}/spieler/ABC`, sp("zb")).allowed).toBe(false);
    expect(db.write(`${S}/teams/${TEAM}/spieler/abc123`, { ...sp("zb"), admin: true }).allowed).toBe(false);
    // seit: Serverzeit des Beitritts (der früheste Laptop rechnet das Spiel des Teams)
    expect(db.write(`${S}/teams/${TEAM}/spieler/abc123`, { ...sp("zb"), seit: Date.now() }).allowed).toBe(true);
    for (const seit of ["gestern", -1, Date.now() + 3600000]) {
      expect(db.write(`${S}/teams/${TEAM}/spieler/abc123`, { ...sp("zb"), seit }).allowed, String(seit)).toBe(false);
    }
    db = db.write(`${S}/teams/${TEAM}/spieler/abc123`, sp("zb")).newDatabase;
    const wechsel = db.update(`${S}/teams`, { [`${TEAM}/spieler/abc123`]: null, "tz9y8x/spieler/abc123": sp("zb") });
    expect(wechsel.allowed, wechsel.info.slice(-300)).toBe(true);
    // In ein gelöschtes Team wechseln geht nicht
    expect(db.update(`${S}/teams`, { "tq0000/spieler/abc123": sp("zb") }).allowed).toBe(false);
  });

  it("Host und Anwesenheit", () => {
    const db = leer();
    expect(db.write(`${S}/host`, { id: "abc123", name: "SL 1", puls: Date.now() }).allowed).toBe(true);
    expect(db.write(`${S}/host`, { id: "abc123", name: "SL 1", puls: Date.now(), admin: true }).allowed).toBe(false);
    expect(db.write(`${S}/host`, null).allowed).toBe(true);
    const anw = { client: "abc123", art: "tt", name: "Lt Anders", puls: Date.now(), version: "0.7.0", team: TEAM };
    expect(db.write(`${S}/anwesenheit/abc123`, anw).allowed).toBe(true);
    expect(db.write(`${S}/anwesenheit/abc123`, { ...anw, art: "sl", team: undefined }).allowed).toBe(true);
    expect(db.write(`${S}/anwesenheit/abc123`, { ...anw, art: "g1" }).allowed).toBe(false);
    expect(db.write(`${S}/anwesenheit/abc123`, { ...anw, client: "xyz999" }).allowed).toBe(false);
    expect(db.write(`${S}/anwesenheit/abc123`, { ...anw, team: "irgendwas" }).allowed).toBe(false);
    expect(db.write(`${S}/anwesenheit/abc123`, null).allowed).toBe(true);
    expect(db.write(`${S}/anwesenheit/ABC`, anw).allowed).toBe(false);
  });

  it("Protokoll: nur anhängen, nicht überschreiben oder löschen; Form wird geprüft", () => {
    const db = leer();
    const erst = db.write(`${P}/e000001`, ereignis(1));
    expect(erst.allowed, erst.info.slice(-300)).toBe(true);
    const mit = erst.newDatabase;
    expect(mit.write(`${P}/e000001`, ereignis(1, { t_s: 99 })).allowed).toBe(false);
    expect(mit.write(`${P}/e000001`, null).allowed).toBe(false);
    expect(mit.write(P, null).allowed).toBe(false);
    expect(mit.write(`${S}/laeufe/${TEAM}`, null).allowed).toBe(false);
    expect(db.write(`${P}/x000001`, ereignis(1)).allowed).toBe(false);
    expect(db.write(`${P}/e000001`, { ...ereignis(1), extra: 1 }).allowed).toBe(false);
    expect(db.write(`${P}/e000001`, { ...ereignis(1), typ: "DROP TABLE" }).allowed).toBe(false);
    expect(db.write(`${P}/e000001`, { ...ereignis(1), daten: { text: "x".repeat(601) } }).allowed).toBe(false);
    expect(db.write(`${P}/e000001`, { ...ereignis(1), von: { rolle: "admin" } }).allowed).toBe(false);
    expect(db.write(`${S}/laeufe/${TEAM}/kein-lauf/protokoll/e000001`, ereignis(1)).allowed).toBe(false);
    expect(db.write(`${S}/laeufe/teamX/${LAUF}/protokoll/e000001`, ereignis(1)).allowed).toBe(false);
    // Rollen im Protokoll: zb, sl, plenum, system – keine G1–G3 mehr
    for (const rolle of ["zb", "sl", "system"]) expect(db.write(`${P}/e000001`, ereignis(1, { von: { rolle } as Ereignis["von"] })).allowed, rolle).toBe(true);
    for (const rolle of ["g1", "g3", "tt"]) expect(db.write(`${P}/e000001`, ereignis(1, { von: { rolle } as unknown as Ereignis["von"] })).allowed, rolle).toBe(false);
  });

  it("Upload in Stücken (H1.2): mehrere Ereignisse in einem Schreibvorgang – ganz oder gar nicht", () => {
    const stueck = Object.fromEntries([1, 2, 3].map((n) => [protokollSchluessel(n), ereignis(n)]));
    const erst = leer().update(P, stueck);
    expect(erst.allowed, erst.info.slice(-300)).toBe(true);
    const mit = erst.newDatabase;
    // das nächste Stück hängt an
    expect(mit.update(P, Object.fromEntries([4, 5].map((n) => [protokollSchluessel(n), ereignis(n)]))).allowed).toBe(true);
    // ein Stück, das ein vorhandenes Ereignis enthält, wird ganz abgewiesen (der Laptop gleicht dann ab)
    expect(mit.update(P, Object.fromEntries([3, 4].map((n) => [protokollSchluessel(n), ereignis(n)]))).allowed).toBe(false);
    expect(mit.update(P, { [protokollSchluessel(2)]: null }).allowed).toBe(false);
    expect(leer().update(P, { [protokollSchluessel(1)]: ereignis(1), x000002: ereignis(2) }).allowed).toBe(false);
  });

  it("Status je Team (H1.2): flache Felder, überschreibbar, Form wird geprüft", () => {
    const st = {
      client: "abc123", lauf: LAUF, seq: 120, hoch: 118, ts: Date.now(), t_s: 754.5, laeuft: true, tempo: 1, ende: false,
      eingang: 3, zurueck: 1, meldungen: 14, wirkungen: 9, fehl: 1, faelle: "S1:falsch,S2:offen,N3:richtig", panzer: "100,96,88,72", bereit: 4, verwundete: 0,
    };
    const db = leer();
    const erst = db.write(`${S}/status/${TEAM}`, st);
    expect(erst.allowed, erst.info.slice(-300)).toBe(true);
    expect(erst.newDatabase.write(`${S}/status/${TEAM}`, { ...st, seq: 140, t_s: 790 }).allowed).toBe(true);
    expect(erst.newDatabase.write(`${S}/status/${TEAM}`, null).allowed).toBe(true);
    expect(leer().read(`${S}/status`).allowed).toBe(true);
    // nur der Kopf ist Pflicht
    const { eingang, zurueck, meldungen, wirkungen, fehl, faelle, panzer, bereit, verwundete, ...kopf } = st;
    void [eingang, zurueck, meldungen, wirkungen, fehl, faelle, panzer, bereit, verwundete];
    expect(db.write(`${S}/status/${TEAM}`, kopf).allowed).toBe(true);
    expect(db.write(`${S}/status/${TEAM}`, { ...kopf, lauf: undefined }).allowed).toBe(false);
    expect(db.write(`${S}/status/${TEAM}`, { ...st, extra: 1 }).allowed).toBe(false);
    expect(db.write(`${S}/status/${TEAM}`, { ...st, faelle: "x".repeat(201) }).allowed).toBe(false);
    expect(db.write(`${S}/status/${TEAM}`, { ...st, panzer: { pz1: 100 } }).allowed).toBe(false);
    expect(db.write(`${S}/status/${TEAM}`, { ...st, laeuft: "ja" }).allowed).toBe(false);
    expect(db.write(`${S}/status/${TEAM}`, { ...st, client: "ABC" }).allowed).toBe(false);
    expect(db.write(`${S}/status/Falke`, st).allowed).toBe(false);
    expect(db.write(`${S}/status`, { [TEAM]: st }).allowed).toBe(false); // nur je Team, nicht die ganze Liste
  });

  it("Sync-Test (rooms/…) funktioniert weiter, aber nur in seiner Form", () => {
    const db = leer();
    const T = "/rooms/test1";
    expect(db.write(`${T}/peers/abc123`, { name: "Dienst-PC", modus: "lp", ua: "Edge", t: Date.now() }).allowed).toBe(true);
    expect(db.write(`${T}/pings/abc123/k3x9a_0`, { t: Date.now() }).allowed).toBe(true);
    expect(db.write(`${T}/pongs/abc123/k3x9a_0_xyz789`, { by: "xyz789", name: "Handy", modus: "auto" }).allowed).toBe(true);
    expect(db.write(`${T}/markers/abc123`, { x: 0.4, y: 0.5, name: "Dienst-PC", t: Date.now() }).allowed).toBe(true);
    expect(db.write(`${T}/beliebig`, { a: 1 }).allowed).toBe(false);
  });
});

describe("Firebase-Regeln: echter Testlauf mit zwei Team-Laptops", () => {
  let code = "";
  let infoDaten: SitzungsInfo | null = null;
  let teamsDaten: Record<string, TeamDaten> = {};
  let statusDaten: Record<string, TeamStatus> = {};
  const protokolle = new Map<string, { lauf: string; e: Ereignis[] }>();
  const aktionen = new Map<string, Aktion[]>();
  const sitzungen: Sitzung[] = [];

  beforeAll(async () => {
    localStorage.clear();
    const inh = await inhalte();
    code = (await Sitzung.anlegen(inh, (c) => new LokalAdapter(c), "SL 1", neuerCode))!;
    const neu = async (art: "sl" | "tt", name?: string) => {
      const s = new Sitzung(inh, new LokalAdapter(code), { art, name, takt: { statusMs: 100 } });
      sitzungen.push(s);
      await s.starten();
      return s;
    };
    const sl = await neu("sl", "SL 1");
    await bis(() => sl.stand.istHost);
    const teamIds: string[] = [];
    const laptops: Sitzung[] = [];
    for (const n of ["Falke „Nord“ äöü", "Orion"]) {
      const tt = await neu("tt", `${n} Laptop`);
      teamIds.push((await tt.teamErstellen(n))!);
      laptops.push(tt);
    }
    // ein zweites Fenster sieht bei Team 1 zu (zweiter Spieler im Team)
    const zu = await neu("tt", "Lt Doppel");
    await bis(() => !!zu.team(teamIds[0]), 3000);
    await zu.teamBeitreten(teamIds[0]);
    await bis(() => sl.stand.teams.length === 2 && sl.team(teamIds[0])!.spieler.length === 2, 3000, "Lobby");
    await sl.spielOeffnen(teamIds);
    await bis(() => teamIds.every((id, i) => (laptops[i].spiel(id)?.stand.zustand.seq ?? 0) >= 2), 4000, "Spiele offen");
    const id0 = teamIds[0];
    const zb = new Sicht(laptops[0], laptops[0].spiel(id0)!, "zb");
    await bis(() => zb.stand.geladen, 3000);
    const ids: string[] = [];
    const sl0 = (...args: Parameters<Sitzung["sendenAn"]> extends [unknown, ...infer R] ? R : never) => ids.push(...sl.sendenAn([id0], ...(args as [never, never])));
    // Spielzeit wie im Drehbuch (der Mörser Z-19 steht ab ca. 18:15 im Hof RABE)
    sl0("uhr", { befehl: "setzen", t_s: 1095 });
    for (const m of ["M18", "M20", "M21"]) sl0("meldung_ausloesen", { meldung: m });
    sl0("inject_ausloesen", { inject: "I-04" });
    sl0("uhr", { befehl: "tempo", tempo: 5 });
    sl0("notiz", { text: "Beobachtung „mit Anführungszeichen“ & Umlauten äöü", fall: "S3" });
    await bis(() => zb.stand.zustand.meldungen.M20?.stufe === "offen" && zb.stand.zustand.injects["I-04"] !== undefined, 4000, "Meldungen im Eingang");
    const eigene: string[] = [];
    const team = (...args: Parameters<Sicht["senden"]>) => eigene.push(zb.senden(...args)!);
    team("entscheid", { meldung: "M18", entscheid: "bekaempfen", wirkmittel: "MRS", t_offen: 1096 });
    team("entscheid", { meldung: "M20", entscheid: "zurueckstellen", t_offen: 1097 });
    team("inject_quittiert", { inject: "I-04" });
    team("entscheid", { meldung: "M20", entscheid: "ablehnen", t_offen: 1098 });
    team("entscheid", { meldung: "M21", entscheid: "bekaempfen", wirkmittel: "PZA" });
    team("entscheid", { meldung: "M99", entscheid: "ablehnen" }); // gibt es nicht → abgewiesen, steht im Protokoll
    await bis(() => eigene.every((id) => zb.stand.zustand.aktionen[id] !== undefined), 4000, "Entscheidungen im Protokoll");
    sl0("uhr", { befehl: "setzen", t_s: 1300 });
    sl0("uhr", { befehl: "start" });
    ids.push(...sl.sendenAn([teamIds[1]], "meldung_ausloesen", { meldung: "M01" }));
    const sp0 = () => laptops[0].spiel(id0)!.stand.zustand;
    await bis(() => sp0().meldungen.M18?.stufe === "erledigt" && ids.every((id) => sp0().aktionen[id] !== undefined || laptops[1].spiel(teamIds[1])!.stand.zustand.aktionen[id] !== undefined),
      6000, "Wirkung und alle Aktionen");
    // die Spielleitung liest das hochgeladene Protokoll und den Status
    for (const [i, id] of teamIds.entries()) {
      await bis(() => sl.spiel(id)!.stand.zustand.seq === laptops[i].spiel(id)!.stand.zustand.seq && sl.stand.status[id]?.seq === laptops[i].spiel(id)!.stand.zustand.seq,
        4000, `${id} hochgeladen`);
    }
    infoDaten = await new Promise((ok) => { const ab = sl.adapter.aufInfo((i) => { ok(i); queueMicrotask(() => ab()); }); });
    teamsDaten = await new Promise((ok) => { const ab = sl.adapter.aufTeams((t) => { ok(t); queueMicrotask(() => ab()); }); });
    statusDaten = await new Promise((ok) => { const ab = sl.adapter.aufStatus((t) => { ok(t); queueMicrotask(() => ab()); }); });
    for (const id of teamIds) {
      const sp = sl.spiel(id)!;
      protokolle.set(id, { lauf: sp.stand.lauf!, e: sp.stand.protokoll });
      const liste: Aktion[] = [];
      const ab = sl.adapter.aufAktionen(id, sp.stand.lauf!, (a) => liste.push(a));
      await new Promise((ok) => setTimeout(ok, 20));
      ab();
      aktionen.set(id, liste);
    }
  }, 30000);

  afterAll(() => sitzungen.forEach((s) => s.stoppen()));

  it("Sitzung und Teams des Laufs werden angenommen (anlegen, Spieler, Lauf)", () => {
    const B = `/argus/v1/sitzungen/${code}`;
    let db = leer();
    const i = db.write(`${B}/info`, infoDaten);
    expect(i.allowed, i.info.slice(-300)).toBe(true);
    db = i.newDatabase;
    expect(Object.values(teamsDaten).flatMap((t) => Object.values(t.spieler ?? {})).length).toBe(3);
    for (const [id, t] of Object.entries(teamsDaten)) {
      const { spieler, lauf, ...kopf } = t;
      // wie FirebaseAdapter.setzeTeam/setzeSpieler/aendereTeam
      const erst = Object.entries(spieler ?? {})[0];
      const a = db.update(`${B}/teams/${id}`, { ...kopf, [`spieler/${erst[0]}`]: erst[1] });
      expect(a.allowed, a.info.slice(-300)).toBe(true);
      db = a.newDatabase;
      for (const [client, sp] of Object.entries(spieler ?? {}).slice(1)) {
        const b = db.update(`${B}/teams`, { [`${id}/spieler/${client}`]: sp });
        expect(b.allowed, b.info.slice(-300)).toBe(true);
        db = b.newDatabase;
      }
      const c = db.update(`${B}/teams/${id}`, { lauf });
      expect(c.allowed, c.info.slice(-300)).toBe(true);
      db = c.newDatabase;
    }
  });

  it("alle Ereignistypen beider Teams werden angenommen – in Stücken hochgeladen wie vom Team-Laptop", () => {
    const B = `/argus/v1/sitzungen/${code}`;
    const typen = new Set([...protokolle.values()].flatMap((p) => p.e.map((e) => e.typ)));
    for (const t of ["spiel_neu", "uhr", "meldung", "entscheid", "wirkung", "inject", "inject_quittiert", "notiz", "aktion_abgelehnt"]) {
      expect(typen.has(t as Ereignis["typ"]), `${t} fehlt`).toBe(true);
    }
    let db = leer();
    for (const [id, p] of protokolle) {
      for (let i = 0; i < p.e.length; i += 7) {
        const stueck = Object.fromEntries(p.e.slice(i, i + 7).map((e) => [protokollSchluessel(e.seq), bereinigt(e)]));
        const erg = db.update(`${B}/laeufe/${id}/${p.lauf}/protokoll`, stueck);
        expect(erg.allowed, `${id} ab ${i + 1}: ${erg.info.slice(-400)}`).toBe(true);
        db = erg.newDatabase;
      }
      // und jedes Ereignis einzeln (Resync nach Abbruch)
      let einzeln = leer();
      for (const e of p.e) {
        const erg = einzeln.write(`${B}/laeufe/${id}/${p.lauf}/protokoll/${protokollSchluessel(e.seq)}`, bereinigt(e));
        expect(erg.allowed, `${id} ${e.seq} ${e.typ}: ${erg.info.slice(-400)}`).toBe(true);
        einzeln = erg.newDatabase;
      }
    }
  });

  it("Entscheidungen gehen nicht über das Netz; die Aktionen der Spielleitung werden angenommen (mit Firebase-Schlüsseln)", () => {
    const B = `/argus/v1/sitzungen/${code}`;
    let db = leer();
    let n = 0;
    for (const [id, liste] of aktionen) {
      expect(liste.every((a) => a.von.rolle === "sl"), id).toBe(true);
      const lauf = protokolle.get(id)!.lauf;
      for (const a of liste) {
        const key = `-OdQ${String(n++).padStart(4, "0")}xyzABCDEFGH`;
        const erg = db.write(`${B}/laeufe/${id}/${lauf}/aktionen/${key}`, bereinigt({ ...a, id: key, von: { ...a.von, client: "abc123" } }));
        expect(erg.allowed, `${a.typ}: ${erg.info.slice(-400)}`).toBe(true);
        db = erg.newDatabase;
      }
    }
    expect(n).toBeGreaterThanOrEqual(10);
    // auch eine Entscheidung (Test ohne Lobby, Fenster ohne eigenes Spiel) hätte die Form
    const ent = { id: "-OdQ9999xyzABCDEFGH", typ: "entscheid", ts: Date.now(), von: { rolle: "zb", client: "abc123", name: "Falke" }, daten: { meldung: "M20", entscheid: "ablehnen", t_offen: 1098 } };
    expect(leer().write(`${A}/${ent.id}`, ent).allowed).toBe(true);
    expect(leer().write(`${A}/${ent.id}`, { ...ent, von: { ...ent.von, rolle: "g3" } }).allowed).toBe(false);
    expect(leer().write(`${A}/-OdQ0000xyzABCDEFGH`, { ...ent, id: "anders123456" }).allowed).toBe(false);
  });

  it("die Statusmeldungen beider Teams werden angenommen", () => {
    const B = `/argus/v1/sitzungen/${code}`;
    expect(Object.keys(statusDaten).sort()).toEqual([...protokolle.keys()].sort());
    let db = leer();
    for (const [id, st] of Object.entries(statusDaten)) {
      const erg = db.write(`${B}/status/${id}`, bereinigt(st));
      expect(erg.allowed, `${id}: ${JSON.stringify(st)} ${erg.info.slice(-400)}`).toBe(true);
      db = erg.newDatabase;
    }
  });
});

describe("Firebase-Regeln: Drehbuch mit fünf Teams", () => {
  const ref = JSON.parse(readFileSync(new URL("./referenz_durchlauf.json", import.meta.url), "utf-8")) as DrehbuchReferenz;
  let teams: Modellteam[] = [];
  beforeAll(async () => {
    const inh = await inhalte();
    teams = spieleDurch(inh, drehbuchTeams(ref));
  }, 30000);

  it("jedes Ereignis aller fünf Protokolle wird angenommen (alle Ereignistypen)", () => {
    const typen = new Set(teams.flatMap((m) => m.kanal.protokoll.map((e) => e.typ)));
    // aktion_abgelehnt und notiz kommen im Drehbuch nicht vor (siehe Testlauf oben)
    const ohne = ["aktion_abgelehnt", "notiz"];
    expect(EREIGNIS_TYPEN.filter((t) => !ohne.includes(t) && !typen.has(t))).toEqual([]);
    // Serverzeit der Modellläufe (START_MS) auf jetzt verschoben: die Regeln prüfen ts gegen now
    const jetzt = Date.now() - 3_600_000;
    teams.forEach((m, nr) => {
      let db = leer();
      const team = `tdreh${nr + 1}`;
      for (const e of m.kanal.protokoll) {
        const erg = db.write(`${S}/laeufe/${team}/${LAUF}/protokoll/${protokollSchluessel(e.seq)}`, bereinigt({ ...e, ts: e.ts - START_MS + jetzt }));
        expect(erg.allowed, `${m.name} ${e.seq} ${e.typ} ${JSON.stringify(e.daten)}: ${erg.info.slice(-400)}`).toBe(true);
        db = erg.newDatabase;
      }
    });
  });

  it("jede Aktion aller fünf Teams wird angenommen (auch Verstärkung)", () => {
    const typen = new Set(teams.flatMap((m) => m.kanal.gesendet.map((a) => a.typ)));
    expect(typen.has("verstaerkung_einspielen")).toBe(true);
    let n = 0;
    teams.forEach((m, nr) => {
      let db = leer();
      for (const a of m.kanal.gesendet) {
        const key = `-OdQ${String(n++).padStart(4, "0")}xyzABCDEFGH`;
        const erg = db.write(`${S}/laeufe/tdreh${nr + 1}/${LAUF}/aktionen/${key}`, bereinigt({ ...a, id: key, von: { ...a.von, client: "abc123" } }));
        expect(erg.allowed, `${m.name} ${a.typ} ${JSON.stringify(a.daten)}: ${erg.info.slice(-400)}`).toBe(true);
        db = erg.newDatabase;
      }
    });
  });
});
