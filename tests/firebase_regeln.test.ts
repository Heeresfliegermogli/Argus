// Prüft firebase/database.rules.json mit targaryen (Nachbildung der Firebase-Regelauswertung).
// Wichtigster Fall: Ein echter Testlauf mit zwei Teams (Lobby, alle Ereignistypen, alle Aktionen)
// wird angenommen; Überschreiben, Löschen, fremde Pfade und eine Sitzungsliste werden abgewiesen.
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Aktion, Ereignis } from "../src/kern/ereignisse";
import { protokollSchluessel } from "../src/kern/ereignisse";
import { neuerCode } from "../src/kern/sitzungen";
import { Sicht } from "../src/sitzung/sicht";
import { Sitzung } from "../src/sitzung/sitzung";
import type { SitzungsInfo, TeamDaten } from "../src/sync/adapter";
import { LokalAdapter } from "../src/sync/lokal";
import { bis, inhalte } from "./hilfen";

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

const S = "/argus/v1/sitzungen/kraehe-7q";
const TEAM = "tk3x9a";
const LAUF = "20261125-0930-abcd";
const P = `${S}/laeufe/${TEAM}/${LAUF}/protokoll`;
const A = `${S}/laeufe/${TEAM}/${LAUF}/aktionen`;
const leer = () => targaryen.database(regeln, {}).with({ debug: true }).as(null);

const info = (extra: Partial<SitzungsInfo> = {}) => ({
  code: "KRAEHE-7Q", szenario: "kraehe-01", version: "1.3", titel: "ARGUS – Verteidigung Brücke ELSTER", erstellt: Date.now(), von: "SL 1", ...extra,
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
    const t = db.write(`${S}/teams/${TEAM}`, team({ spieler: { abc123: { name: "Lt Anders", rollen: "g1" } } }));
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
    expect(db.write(`${S}/teams/${TEAM}/spieler/abc123`, { name: "x", rollen: "g1" }).allowed).toBe(false);
  });

  it("Spieler: Rollen als Text, Doppelrolle, Teamwechsel in einem Schreibvorgang", () => {
    let db = leer().write(`${S}/teams/${TEAM}`, team()).newDatabase;
    db = db.write(`${S}/teams/tz9y8x`, team({ name: "Orion", farbe: "#e3d36b" })).newDatabase;
    const sp = (rollen: string) => ({ name: "Lt Anders", rollen });
    for (const r of ["g1", "g2,g3", "g1,g2,g3"]) expect(db.write(`${S}/teams/${TEAM}/spieler/abc123`, sp(r)).allowed, r).toBe(true);
    for (const r of ["", "g4", "sl", "g1,g1,g1,g1", "g1;g2"]) expect(db.write(`${S}/teams/${TEAM}/spieler/abc123`, sp(r)).allowed, r).toBe(false);
    expect(db.write(`${S}/teams/${TEAM}/spieler/ABC`, sp("g1")).allowed).toBe(false);
    expect(db.write(`${S}/teams/${TEAM}/spieler/abc123`, { ...sp("g1"), admin: true }).allowed).toBe(false);
    // seit: Serverzeit der Rollenwahl (entscheidet bei gleichzeitigem Zugriff)
    expect(db.write(`${S}/teams/${TEAM}/spieler/abc123`, { ...sp("g1"), seit: Date.now() }).allowed).toBe(true);
    for (const seit of ["gestern", -1, Date.now() + 3600000]) {
      expect(db.write(`${S}/teams/${TEAM}/spieler/abc123`, { ...sp("g1"), seit }).allowed, String(seit)).toBe(false);
    }
    db = db.write(`${S}/teams/${TEAM}/spieler/abc123`, sp("g1")).newDatabase;
    const wechsel = db.update(`${S}/teams`, { [`${TEAM}/spieler/abc123`]: null, "tz9y8x/spieler/abc123": sp("g2") });
    expect(wechsel.allowed, wechsel.info.slice(-300)).toBe(true);
    // In ein gelöschtes Team wechseln geht nicht
    expect(db.update(`${S}/teams`, { "tq0000/spieler/abc123": sp("g2") }).allowed).toBe(false);
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

describe("Firebase-Regeln: echter Testlauf mit zwei Teams", () => {
  let code = "";
  let infoDaten: SitzungsInfo | null = null;
  let teamsDaten: Record<string, TeamDaten> = {};
  const protokolle = new Map<string, { lauf: string; e: Ereignis[] }>();
  const aktionen = new Map<string, Aktion[]>();
  const sitzungen: Sitzung[] = [];

  beforeAll(async () => {
    localStorage.clear();
    const inh = await inhalte();
    code = (await Sitzung.anlegen(inh, (c) => new LokalAdapter(c), "SL 1", neuerCode))!;
    const neu = async (art: "sl" | "tt", name?: string) => {
      const s = new Sitzung(inh, new LokalAdapter(code), { art, name });
      sitzungen.push(s);
      await s.starten();
      return s;
    };
    const sl = await neu("sl", "SL 1");
    await bis(() => sl.stand.istHost);
    const ids: (string | null)[] = [];
    const teamIds: string[] = [];
    for (const n of ["Falke „Nord“ äöü", "Orion"]) {
      const g1 = await neu("tt", `${n} G1`);
      const id = (await g1.teamErstellen(n, "g1"))!;
      const g23 = await neu("tt", "Lt Doppel");
      await bis(() => !!g23.team(id));
      await g23.rolleWaehlen(id, "g2");
      await g23.rolleWaehlen(id, "g3");
      teamIds.push(id);
    }
    await bis(() => sl.stand.teams.length === 2 && sl.stand.teams.every((t) => t.frei.length === 0));
    await sl.spielOeffnen(teamIds);
    await bis(() => teamIds.every((id) => (sl.spiel(id)?.stand.zustand.seq ?? 0) >= 2));
    const tt = (id: string) => sitzungen.filter((s) => s.stand.ich.team === id);
    const id0 = teamIds[0];
    const [g1s, g23s] = tt(id0);
    const g1 = new Sicht(g1s, g1s.spiel(id0)!, "g1");
    const g2 = new Sicht(g23s, g23s.spiel(id0)!, "g2");
    const g3 = new Sicht(g23s, g23s.spiel(id0)!, "g3");
    const slv = new Sicht(sl, sl.spiel(id0)!, "sl");
    await bis(() => g1.stand.geladen && g2.stand.geladen);
    const sende = (x: Sicht, ...args: Parameters<Sicht["senden"]>) => ids.push(x.senden(...args));
    for (const m of ["M18", "M20"]) sende(slv, "meldung_ausloesen", { meldung: m });
    sende(slv, "inject_ausloesen", { inject: "I-04" });
    sende(slv, "uhr", { befehl: "tempo", tempo: 5 });
    sende(slv, "notiz", { text: "Beobachtung „mit Anführungszeichen“ & Umlauten äöü" });
    await bis(() => g1.stand.zustand.meldungen.M20?.stufe === "g1");
    sende(g1, "g1_entscheid", { meldung: "M18", entscheid: "annehmen", vermerk: "4 Zivilpersonen" });
    sende(g1, "g1_entscheid", { meldung: "M20", entscheid: "annehmen" });
    await bis(() => g2.stand.zustand.meldungen.M20?.stufe === "g2");
    sende(g2, "g2_empfehlung", { meldung: "M18", empfehlung: "bekaempfen", wirkmittel: "MRS", begruendung: "3. Kp unter Feuer" });
    sende(g2, "g2_empfehlung", { meldung: "M20", empfehlung: "beobachten" });
    await bis(() => g3.stand.zustand.meldungen.M18?.stufe === "g3");
    sende(g3, "g3_entscheid", { meldung: "M18", entscheid: "freigabe" });
    sende(g3, "inject_quittiert", { inject: "I-04" });
    sende(g3, "lagehinweis", { text: "Feuerverbot Feldweg Süd", an: ["g1", "g2"] });
    sende(g3, "fast_track", { an: true });
    sende(g3, "g3_entscheid", { meldung: "M20", entscheid: "freigabe" }); // wird abgewiesen
    await bis(() => ids.every((id) => id && slv.stand.zustand.aktionen[id] !== undefined), 5000, "G3-Aktionen im Protokoll");
    sende(slv, "uhr", { befehl: "setzen", t_s: 1300 });
    sende(slv, "uhr", { befehl: "start" });
    sl.sendenAn([teamIds[1]], "meldung_ausloesen", { meldung: "M01" });
    await bis(() => slv.stand.zustand.meldungen.M18?.stufe === "erledigt" && slv.stand.zustand.injects["I-09"] !== undefined
      && ids.every((id) => id && slv.stand.zustand.aktionen[id] !== undefined), 5000, "Wirkung, I-09 und alle Aktionen");
    await bis(() => sl.spiel(teamIds[1])!.stand.zustand.meldungen.M01 !== undefined);
    infoDaten = await new Promise((ok) => { const ab = sl.adapter.aufInfo((i) => { ok(i); queueMicrotask(() => ab()); }); });
    teamsDaten = await new Promise((ok) => { const ab = sl.adapter.aufTeams((t) => { ok(t); queueMicrotask(() => ab()); }); });
    for (const id of teamIds) {
      const sp = sl.spiel(id)!;
      protokolle.set(id, { lauf: sp.stand.lauf!, e: sp.stand.protokoll });
      const liste: Aktion[] = [];
      const ab = sl.adapter.aufAktionen(id, sp.stand.lauf!, (a) => liste.push(a));
      await new Promise((ok) => setTimeout(ok, 20));
      ab();
      aktionen.set(id, liste);
    }
  }, 20000);

  afterAll(() => sitzungen.forEach((s) => s.stoppen()));

  it("Sitzung und Teams des Laufs werden angenommen (anlegen, Spieler, Lauf)", () => {
    const B = `/argus/v1/sitzungen/${code}`;
    let db = leer();
    const i = db.write(`${B}/info`, infoDaten);
    expect(i.allowed, i.info.slice(-300)).toBe(true);
    db = i.newDatabase;
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

  it("alle Ereignistypen beider Teams werden angenommen", () => {
    const B = `/argus/v1/sitzungen/${code}`;
    const typen = new Set([...protokolle.values()].flatMap((p) => p.e.map((e) => e.typ)));
    for (const t of ["spiel_neu", "uhr", "meldung", "g1_entscheid", "g2_empfehlung", "g3_entscheid", "wirkung", "inject", "inject_quittiert", "lagehinweis", "fast_track", "notiz", "aktion_abgelehnt"]) {
      expect(typen.has(t as Ereignis["typ"]), `${t} fehlt`).toBe(true);
    }
    let db = leer();
    for (const [id, p] of protokolle) {
      for (const e of p.e) {
        const erg = db.write(`${B}/laeufe/${id}/${p.lauf}/protokoll/${protokollSchluessel(e.seq)}`, e);
        expect(erg.allowed, `${id} ${e.seq} ${e.typ}: ${erg.info.slice(-400)}`).toBe(true);
        db = erg.newDatabase;
      }
    }
  });

  it("alle Aktionen beider Teams werden angenommen (mit Firebase-Schlüsseln)", () => {
    const B = `/argus/v1/sitzungen/${code}`;
    let db = leer();
    let n = 0;
    for (const [id, liste] of aktionen) {
      const lauf = protokolle.get(id)!.lauf;
      for (const a of liste) {
        const key = `-OdQ${String(n++).padStart(4, "0")}xyzABCDEFGH`;
        const erg = db.write(`${B}/laeufe/${id}/${lauf}/aktionen/${key}`, { ...a, id: key, von: { ...a.von, client: "abc123" } });
        expect(erg.allowed, `${a.typ}: ${erg.info.slice(-400)}`).toBe(true);
        db = erg.newDatabase;
      }
    }
    expect(n).toBeGreaterThanOrEqual(16);
    expect(leer().write(`${A}/-OdQ0000xyzABCDEFGH`, { ...aktionen.values().next().value![0], id: "anders123456" }).allowed).toBe(false);
  });
});
