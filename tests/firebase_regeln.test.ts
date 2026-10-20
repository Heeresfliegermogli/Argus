// Prüft firebase/database.rules.json mit targaryen (Nachbildung der Firebase-Regelauswertung).
// Wichtigster Fall: Ein echtes Protokoll mit allen Ereignistypen und alle Aktionen eines
// Testlaufs werden angenommen; Überschreiben, Löschen und fremde Pfade werden abgewiesen.
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Aktion, Ereignis } from "../src/kern/ereignisse";
import { protokollSchluessel } from "../src/kern/ereignisse";
import { Sitzung } from "../src/sitzung/sitzung";
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
}
const regeln = require("../firebase/database.rules.json");

const R = "/argus/v1/raeume/kraehe";
const LAUF = "20261125-0930-abcd";
const P = `${R}/laeufe/${LAUF}/protokoll`;
const A = `${R}/laeufe/${LAUF}/aktionen`;
const leer = () => targaryen.database(regeln, {}).with({ debug: true }).as(null);

const ereignis = (seq: number, extra: Partial<Ereignis> = {}) => ({
  seq, typ: "notiz", ts: Date.now(), t_s: 12.5, von: { rolle: "sl", client: "abc123", name: "SL 1" }, daten: { text: "x" }, ...extra,
});

describe("Firebase-Regeln: Grundsätze", () => {
  it("Raum lesbar, Raumliste und fremde Pfade nicht", () => {
    expect(leer().read(`${R}/aktuell`).allowed).toBe(true);
    expect(leer().read("/argus/v1/raeume").allowed).toBe(false);
    expect(leer().read("/").allowed).toBe(false);
    expect(leer().write("/irgendwas", 1).allowed).toBe(false);
    expect(leer().write(`${R}/fremd`, 1).allowed).toBe(false);
    expect(leer().read("/argus/v1/raeume/Gross Buchstaben/aktuell").allowed).toBe(false);
  });

  it("aktuell nur als Lauf-Kennung", () => {
    expect(leer().write(`${R}/aktuell`, LAUF).allowed).toBe(true);
    expect(leer().write(`${R}/aktuell`, "irgendwas").allowed).toBe(false);
    expect(leer().write(`${R}/aktuell`, 5).allowed).toBe(false);
  });

  it("Protokoll: nur anhängen, nicht überschreiben oder löschen", () => {
    const db = leer();
    const erst = db.write(`${P}/e000001`, ereignis(1));
    expect(erst.allowed).toBe(true);
    const mit = erst.newDatabase;
    expect(mit.write(`${P}/e000001`, ereignis(1, { t_s: 99 })).allowed).toBe(false);
    expect(mit.write(`${P}/e000001`, null).allowed).toBe(false);
    expect(mit.write(P, null).allowed).toBe(false);
    expect(mit.write(`${R}/laeufe/${LAUF}`, null).allowed).toBe(false);
  });

  it("Protokoll: Form wird geprüft", () => {
    const db = leer();
    expect(db.write(`${P}/x000001`, ereignis(1)).allowed).toBe(false);
    expect(db.write(`${P}/e000001`, { ...ereignis(1), extra: 1 }).allowed).toBe(false);
    expect(db.write(`${P}/e000001`, { ...ereignis(1), typ: "DROP TABLE" }).allowed).toBe(false);
    expect(db.write(`${P}/e000001`, { ...ereignis(1), daten: { text: "x".repeat(601) } }).allowed).toBe(false);
    expect(db.write(`${P}/e000001`, { ...ereignis(1), daten: { a: [{ b: { c: 1 } }] } }).allowed).toBe(false);
    expect(db.write(`${P}/e000001`, { ...ereignis(1), von: { rolle: "admin" } }).allowed).toBe(false);
    expect(db.write(`${P}/e000001`, { ...ereignis(1), ts: 1000 }).allowed).toBe(false);
    expect(db.write(`${R}/laeufe/kein-lauf/protokoll/e000001`, ereignis(1)).allowed).toBe(false);
  });

  it("Host und Anwesenheit", () => {
    const db = leer();
    expect(db.write(`${R}/host`, { id: "abc123", name: "SL 1", puls: Date.now() }).allowed).toBe(true);
    expect(db.write(`${R}/host`, { id: "abc123", name: "SL 1", puls: Date.now(), admin: true }).allowed).toBe(false);
    expect(db.write(`${R}/host`, null).allowed).toBe(true);
    const anw = { client: "abc123", rolle: "g1", name: "G1 Aufklärung", puls: Date.now(), version: "0.4.0" };
    expect(db.write(`${R}/anwesenheit/abc123`, anw).allowed).toBe(true);
    expect(db.write(`${R}/anwesenheit/abc123`, { ...anw, client: "xyz999" }).allowed).toBe(false);
    expect(db.write(`${R}/anwesenheit/abc123`, null).allowed).toBe(true);
    expect(db.write(`${R}/anwesenheit/ABC`, anw).allowed).toBe(false);
  });

  it("Sync-Test (rooms/…) funktioniert weiter, aber nur in seiner Form", () => {
    const db = leer();
    const T = "/rooms/test1";
    expect(db.write(`${T}/peers/abc123`, { name: "Dienst-PC", modus: "lp", ua: "Edge", t: Date.now() }).allowed).toBe(true);
    expect(db.write(`${T}/pings/abc123/k3x9a_0`, { t: Date.now() }).allowed).toBe(true);
    expect(db.write(`${T}/pings/abc123`, null).allowed).toBe(true);
    expect(db.write(`${T}/pongs/abc123/k3x9a_0_xyz789`, { by: "xyz789", name: "Handy", modus: "auto" }).allowed).toBe(true);
    expect(db.write(`${T}/markers/abc123`, { x: 0.4, y: 0.5, name: "Dienst-PC", t: Date.now() }).allowed).toBe(true);
    expect(db.write(`${T}/beliebig`, { a: 1 }).allowed).toBe(false);
    expect(db.write(`${T}/markers/abc123`, { x: 0.4, y: 0.5, groß: "x" }).allowed).toBe(false);
  });
});

describe("Firebase-Regeln: echter Testlauf", () => {
  let protokoll: Ereignis[] = [];
  let aktionen: Aktion[] = [];
  const sitzungen: Sitzung[] = [];

  beforeAll(async () => {
    localStorage.clear();
    const inh = await inhalte();
    const neu = async (rolle: "sl" | "g1" | "g2" | "g3") => {
      const s = new Sitzung(inh, new LokalAdapter("regeltest"), rolle);
      sitzungen.push(s);
      await s.starten();
      return s;
    };
    const sl = await neu("sl");
    await bis(() => sl.stand.zustand.seq >= 2);
    const [g1, g2, g3] = [await neu("g1"), await neu("g2"), await neu("g3")];
    await bis(() => [g1, g2, g3].every((s) => s.stand.geladen));
    const ids: (string | null)[] = [];
    const sende = (x: Sitzung, ...args: Parameters<Sitzung["senden"]>) => ids.push(x.senden(...args));
    for (const m of ["M16", "M19"]) sende(sl, "meldung_ausloesen", { meldung: m });
    sende(sl, "inject_ausloesen", { inject: "I-04" });
    sende(sl, "uhr", { befehl: "tempo", tempo: 5 });
    sende(sl, "notiz", { text: "Beobachtung „mit Anführungszeichen“ & Umlauten äöü" });
    await bis(() => g1.stand.zustand.meldungen.M19?.stufe === "g1");
    sende(g1, "g1_entscheid", { meldung: "M16", entscheid: "annehmen", vermerk: "4 Zivilpersonen" });
    sende(g1, "g1_entscheid", { meldung: "M19", entscheid: "annehmen" });
    await bis(() => g2.stand.zustand.meldungen.M19?.stufe === "g2");
    sende(g2, "g2_empfehlung", { meldung: "M16", empfehlung: "bekaempfen", wirkmittel: "MRS", begruendung: "3. Kp unter Feuer" });
    sende(g2, "g2_empfehlung", { meldung: "M19", empfehlung: "beobachten" });
    await bis(() => g3.stand.zustand.meldungen.M16?.stufe === "g3");
    sende(g3, "g3_entscheid", { meldung: "M16", entscheid: "freigabe" });
    sende(g3, "inject_quittiert", { inject: "I-04" });
    sende(g3, "lagehinweis", { text: "Feuerverbot Feldweg Süd", an: ["g1", "g2"] });
    sende(g3, "fast_track", { an: true });
    sende(g3, "g3_entscheid", { meldung: "M19", entscheid: "freigabe" }); // wird abgewiesen
    await bis(() => ids.every((id) => id && sl.stand.zustand.aktionen[id] !== undefined), 5000, "G3-Aktionen im Protokoll");
    sende(sl, "uhr", { befehl: "setzen", t_s: 1300 });
    sende(sl, "uhr", { befehl: "start" });
    await bis(() => sl.stand.zustand.meldungen.M16?.stufe === "erledigt" && sl.stand.zustand.injects["I-09"] !== undefined
      && ids.every((id) => id && sl.stand.zustand.aktionen[id] !== undefined), 5000, "Wirkung, I-09 und alle Aktionen");
    protokoll = sl.stand.protokoll;
    aktionen = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.includes(":a:")) aktionen.push(JSON.parse(localStorage.getItem(k)!));
    }
  }, 15000);

  afterAll(() => sitzungen.forEach((s) => s.stoppen()));

  it("alle Ereignistypen des Laufs werden angenommen", () => {
    const typen = new Set(protokoll.map((e) => e.typ));
    for (const t of ["spiel_neu", "uhr", "meldung", "g1_entscheid", "g2_empfehlung", "g3_entscheid", "wirkung", "inject", "inject_quittiert", "lagehinweis", "fast_track", "notiz", "aktion_abgelehnt"]) {
      expect(typen.has(t as Ereignis["typ"]), `${t} fehlt: ${protokoll.map((e) => `${e.seq}:${e.typ}:${JSON.stringify(e.daten).slice(0, 60)}`).join(" | ")}`).toBe(true);
    }
    let db = leer();
    for (const e of protokoll) {
      const erg = db.write(`${P}/${protokollSchluessel(e.seq)}`, e);
      expect(erg.allowed, `${e.seq} ${e.typ}: ${erg.info.slice(-400)}`).toBe(true);
      db = erg.newDatabase;
    }
  });

  it("alle Aktionen des Laufs werden angenommen (mit Firebase-Schlüsseln)", () => {
    expect(aktionen.length).toBeGreaterThanOrEqual(15);
    let db = leer();
    aktionen.forEach((a, i) => {
      const id = `-OdQ${String(i).padStart(4, "0")}xyzABCDEFGH`;
      const erg = db.write(`${A}/${id}`, { ...a, id, von: { ...a.von, client: "abc123" } });
      expect(erg.allowed, `${a.typ}: ${erg.info.slice(-400)}`).toBe(true);
      db = erg.newDatabase;
    });
    expect(db.write(`${A}/-OdQ0000xyzABCDEFGH`, null).allowed).toBe(false);
    expect(leer().write(`${A}/-OdQ0000xyzABCDEFGH`, { ...aktionen[0], id: "anders123456" }).allowed).toBe(false);
  });
});
