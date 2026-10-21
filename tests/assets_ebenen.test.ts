// Prüft die Assets aus Schritt 5b (Konzept v2): Drohnenbilder als Ebenen für das Live-Drohnenbild,
// Bilder der Verstärkungen V-1 … V-5, Wracks aus dem Hintergrundgefecht, neue Effekte, Größenbudget.
// Fertig-Kriterium 5b: Jede Meldung und Verstärkung hat ihre Ebenen, die Schlüsselfälle bleiben erkennbar
// (Rotes Kreuz, Kinder, weißes Tuch), das Größenbudget ist eingehalten. Erzeugt mit tools/assets/gen_assets.py.
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AssetManifest, Drohnenbild } from "../src/assets/typen";

const ASSETS = fileURLToPath(new URL("../public/assets/", import.meta.url));
const DATEN = fileURLToPath(new URL("../public/daten/", import.meta.url));
const man = JSON.parse(readFileSync(ASSETS + "manifest.json", "utf-8")) as AssetManifest;
const datei = (p: string) => ASSETS + p;

// Rohdaten des Szenarios (nur die Felder, die hier gebraucht werden)
interface RohMeldung { id: string; t_s?: number; dt_s?: number; ziele: string[]; fall?: string; bild: { datei: string; sicht: { art: string; lage: string }[] } }
interface RohZiel { id: string; typ: string }
interface RohSzenario {
  ziele: RohZiel[];
  meldungen: RohMeldung[];
  nebenfaelle: { id: string; meldung: string }[];
  hintergrund: { ereignisse: { id: string; t_s: number; art: string; ziel?: string; folge?: string }[] };
  verstaerkungen: { gruppen: { id: string; ziele: RohZiel[]; meldungen: RohMeldung[] }[] };
}
const sz = JSON.parse(readFileSync(DATEN + "szenario_kraehe_01.json", "utf-8")) as RohSzenario;
const wm = JSON.parse(readFileSync(DATEN + "katalog_wirkmittel.json", "utf-8")) as { wirkmittel: { id: string; effekt: string }[] };
const fzKatalog = JSON.parse(readFileSync(DATEN + "katalog_fahrzeuge.json", "utf-8")) as
  { fahrzeuge: { id: string; sprite: string | null; sprite_wrack: string | null }[] };
const atlas = JSON.parse(readFileSync(datei(man.fahrzeuge.json), "utf-8")) as { frames: Record<string, unknown> };
const effektAtlas = JSON.parse(readFileSync(datei(man.effekte.json), "utf-8")) as
  { frames: Record<string, { anchor?: { x: number; y: number } }>; animations: Record<string, string[]> };

const vMeldungen = sz.verstaerkungen.gruppen.flatMap((g) => g.meldungen.map((m) => ({ g, m })));
const alleMeldungen: RohMeldung[] = [...sz.meldungen, ...vMeldungen.map((v) => v.m)];

function bildGroesse(pfad: string): [number, number] {
  const b = readFileSync(pfad);
  expect(b.toString("ascii", 0, 4)).toBe("RIFF");
  const art = b.toString("ascii", 12, 16);
  if (art === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (art === "VP8L") {
    const v = b.readUInt32LE(21);
    return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)];
  }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

function ebenen(id: string) {
  const b = man.drohne[id] as Drohnenbild;
  expect(b, id).toBeDefined();
  expect(b.ebenen, `${id} ohne Ebenen`).toBeDefined();
  return { b, e: b.ebenen! };
}

describe("Assets Schritt 5b: Live-Drohnenbild, Verstärkungen, Hintergrundgefecht", () => {
  it("jede Meldung und jede Verstärkung hat Standbild und Ebenen (Boden, Kronen, Störung)", () => {
    expect(alleMeldungen.length).toBe(sz.meldungen.length + 5);
    for (const m of alleMeldungen) {
      const { b, e } = ebenen(m.id);
      expect(b.datei).toBe(m.bild.datei);
      expect(existsSync(datei(b.datei))).toBe(true);
      expect(e.boden).toBeTruthy();
      for (const p of [e.boden, e.kronen, e.stoerung]) {
        if (!p) continue;
        expect(existsSync(datei(p)), p).toBe(true);
        expect(bildGroesse(datei(p)), p).toEqual([1024, 640]);
      }
      // verdeckende Sichtstörung ⇒ Ebene Störung vorhanden
      const verdeckend = m.bild.sicht.some((s) => ["wolke", "rauch", "dunst", "tarnnetz", "stoerung"].includes(s.art));
      if (verdeckend) expect(e.stoerung, `${m.id} Störung`).toBeTruthy();
      // jedes Hauptziel steht in der Fahrzeugliste, jeder Sprite und jede Figur liegt im Atlas
      expect(e.fahrzeuge.filter((f) => f.hauptziel).map((f) => f.id).sort()).toEqual([...m.ziele].sort());
      for (const f of e.fahrzeuge) expect(atlas.frames[f.sprite], `${m.id} ${f.sprite}`).toBeDefined();
      for (const f of e.figuren) expect(atlas.frames[f.sprite], `${m.id} ${f.sprite}`).toBeDefined();
    }
    expect(existsSync(datei(man.drohne_ebenen.kamera))).toBe(true);
    expect(man.drohne_ebenen.farbmatrix).toHaveLength(4);
  });

  it("Ebenen messen dieselbe Verdeckung wie das Standbild", () => {
    for (const m of alleMeldungen) {
      const { b, e } = ebenen(m.id);
      for (const z of b.ziele) expect(Math.abs(e.verdeckt[z.id] - z.verdeckt), `${m.id} ${z.id}`).toBeLessThanOrEqual(0.05);
    }
  });

  it("Schlüsselfälle bleiben in den Ebenen erkennbar (Rotes Kreuz, Kinder, weißes Tuch)", () => {
    const fall = (f: string) => sz.meldungen.filter((m) => m.fall === f).map((m) => ebenen(m.id));
    for (const { e } of [...fall("S1"), ...fall("S3")]) for (const v of Object.values(e.verdeckt)) expect(v).toBeLessThan(0.05);
    const s2 = fall("S2")[0].e;
    expect(s2.kennzeichen_verdeckt!).toBeLessThan(0.05);                                     // Rotes Kreuz frei
    expect(s2.fahrzeuge.find((f) => f.hauptziel)?.sprite).toBe("san_rad.png");
    expect(s2.figuren.filter((f) => f.art === "sanitaet")).toHaveLength(2);
    for (const { e } of fall("S4")) {
      const zivil = e.figuren.filter((f) => f.art === "zivil");
      expect(zivil).toHaveLength(4);
      expect(zivil.filter((f) => f.klein && f.sprite.includes("_kind_"))).toHaveLength(2);    // zwei Kinder
      expect(e.figuren_verdeckt[`${zivil[0].bei}/zivil`]).toBeLessThan(0.1);
    }
    const n2 = ebenen(sz.nebenfaelle.find((f) => f.id === "N2")!.meldung).e;
    const besatzung = n2.figuren.filter((f) => f.art === "besatzung_ergibt_sich");
    expect(besatzung).toHaveLength(3);
    expect(besatzung.filter((f) => f.tuch && f.sprite.includes("_tuch_"))).toHaveLength(1);    // weißes Tuch
    expect(besatzung.every((f) => f.haende_hoch)).toBe(true);
    expect(n2.figuren_verdeckt[`${besatzung[0].bei}/besatzung_ergibt_sich`]).toBeLessThan(0.1);
    expect(n2.fahrzeuge.find((f) => f.hauptziel)?.sprite).toBe("kpz_t72_kette_ab.png");      // außer Gefecht
  });

  it("Verstärkungen zeigen nur ihre eigenen Fahrzeuge, Zeit relativ zum Einspielen", () => {
    for (const { g, m } of vMeldungen) {
      const { b, e } = ebenen(m.id);
      const eigene = new Set(g.ziele.map((z) => z.id));
      expect(b.relativ).toBe(true);
      expect(b.verstaerkung).toBe(g.id);
      expect(b.uhr).toBeNull();
      expect(b.t_s).toBe(m.dt_s);
      for (const o of [...b.ziele, ...b.objekte, ...e.fahrzeuge]) expect(eigene.has(o.id), `${m.id}: ${o.id}`).toBe(true);
      for (const z of b.ziele) expect(z.verdeckt, `${m.id} ${z.id}`).toBeLessThan(m.bild.sicht.some((s) => s.lage === "Ziel") ? 0.5 : 0.05);
      for (const z of g.ziele) {
        expect(man.ziele[z.id]?.verstaerkung).toBe(g.id);
        expect(man.ziele[z.id].bilder).toContain(m.id);
      }
    }
  });

  it("vom Hintergrundgefecht getroffene Fahrzeuge erscheinen danach als Wrack bzw. außer Gefecht", () => {
    const treffer = new Map<string, { t: number; folge: string }>();
    for (const ev of [...sz.hintergrund.ereignisse].sort((a, b) => a.t_s - b.t_s)) {
      if (ev.art === "panzerabwehr" && ev.ziel && !treffer.has(ev.ziel)) treffer.set(ev.ziel, { t: ev.t_s, folge: ev.folge ?? "zerstoert" });
    }
    for (const [zid, tr] of treffer) expect(man.ziele[zid].hintergrund, zid).toEqual({ t_s: tr.t, folge: tr.folge });
    const typ = new Map(sz.ziele.map((z) => [z.id, z.typ]));
    const wrackSprite = new Map(fzKatalog.fahrzeuge.map((f) => [f.id, f.sprite_wrack]));
    let wracks = 0;
    for (const m of sz.meldungen) {
      const { b, e } = ebenen(m.id);
      for (const f of e.fahrzeuge) {
        const tr = treffer.get(f.id);
        if (!tr || tr.t > b.t_s) {
          expect(f.zustand, `${m.id} ${f.id}`).toBe("intakt");
          continue;
        }
        expect(f.zustand, `${m.id} ${f.id}`).toBe(tr.folge);
        if (tr.folge === "zerstoert") {
          wracks++;
          expect(f.sprite).toBe(wrackSprite.get(typ.get(f.id)!));
          expect(f.effekte).toEqual(man.effekte.zuordnung.wrack.zerstoert);
          expect(b.objekte.find((o) => o.id === f.id)?.zustand).toBe("zerstoert");
        }
      }
    }
    expect(wracks).toBeGreaterThanOrEqual(1);
    const m12 = ebenen("M12").e.fahrzeuge.find((f) => f.id === "Z-11");                        // Beispiel aus dem Auftrag
    expect(m12?.zustand).toBe("zerstoert");
    expect(m12?.sprite).toBe("spz_bmp2_wrack.png");
  });

  it("Effekte: LM im Flug, Leuchtspur, Mündungsblitz, Feindartillerie, Rauch – mit Zuordnung", () => {
    const an = man.effekte.animationen;
    for (const n of ["lm_flug", "leuchtspur", "muendungsblitz", "muendungsblitz_steil", "einschlag_artillerie", "nebel", "rauch", "feuer", "krater"]) {
      expect(an[n], n).toBeDefined();
      expect(effektAtlas.animations[n]).toHaveLength(an[n].bilder);
    }
    const z = man.effekte.zuordnung;
    for (const w of wm.wirkmittel) {
      expect(z.wirkmittel[w.id], w.id).toBeDefined();
      expect(z.wirkmittel[w.id].einschlag).toBe(w.effekt);
    }
    expect(z.wirkmittel.LM.flug).toBe("lm_flug");
    expect(z.wirkmittel.PZA.flug).toBe("leuchtspur");
    for (const ev of sz.hintergrund.ereignisse) expect(z.hintergrund[ev.art], ev.art).toBeDefined();
    const namen = (o: unknown): string[] => (typeof o === "string" ? [o] : Array.isArray(o) ? o.flatMap(namen) : o && typeof o === "object" ? Object.values(o).flatMap(namen) : []);
    for (const n of namen(z)) expect(an[n], `Zuordnung ${n}`).toBeDefined();
    // Anker: Leuchtspur am Kopf, Mündungsblitz an der Mündung, Rauch an der Quelle
    expect(effektAtlas.frames[effektAtlas.animations.leuchtspur[0]].anchor?.x).toBeGreaterThan(0.9);
    expect(effektAtlas.frames[effektAtlas.animations.muendungsblitz[0]].anchor?.x).toBeLessThan(0.2);
    expect(effektAtlas.frames[effektAtlas.animations.rauch[0]].anchor?.x).toBeLessThan(0.3);
  });

  it("kein Fahrzeug fährt durch ein erzeugtes Haus (Live-Lage, auch Verstärkungen)", () => {
    const g = JSON.parse(readFileSync(datei(man.karte.gelaende.datei), "utf-8")) as
      { haeuser: { mitte: [number, number]; laenge: number; breite: number; winkel: number }[] };
    const groesse = new Map((JSON.parse(readFileSync(DATEN + "katalog_fahrzeuge.json", "utf-8")) as
      { fahrzeuge: { id: string; groesse_m: [number, number] }[] }).fahrzeuge.map((f) => [f.id, f.groesse_m]));
    // Abstand eines Punkts zum gedrehten Rechteck (Hausgrundriss), 0 innen
    const abstand = (p: [number, number], h: (typeof g.haeuser)[number]) => {
      const w = (-h.winkel * Math.PI) / 180;
      const dx = p[0] - h.mitte[0], dy = p[1] - h.mitte[1];
      const lx = dx * Math.cos(w) - dy * Math.sin(w), ly = dx * Math.sin(w) + dy * Math.cos(w);
      return Math.hypot(Math.max(0, Math.abs(lx) - h.laenge / 2), Math.max(0, Math.abs(ly) - h.breite / 2));
    };
    const ziele = [...sz.ziele, ...sz.verstaerkungen.gruppen.flatMap((v) => v.ziele)] as (RohZiel & { bewegung?: { route?: [number, number, number][] } })[];
    expect(g.haeuser.length).toBeGreaterThan(30);
    for (const z of ziele) {
      const r = z.bewegung?.route;
      if (!r) continue;
      const halb = groesse.get(z.typ)![1] / 2;
      for (let i = 1; i < r.length; i++) {
        const [, xa, ya] = r[i - 1], [, xb, yb] = r[i];
        const n = Math.max(1, Math.floor(Math.hypot(xb - xa, yb - ya) / 2));
        for (let k = 0; k <= n; k++) {
          const p: [number, number] = [xa + (k / n) * (xb - xa), ya + (k / n) * (yb - ya)];
          for (const h of g.haeuser) expect(abstand(p, h), `${z.id} bei ${p.map(Math.round)}`).toBeGreaterThanOrEqual(halb);
        }
      }
    }
  });

  it("Größenbudget: Standbilder ≤ 150 KB, Ebenen je Meldung ≤ 200 KB, Spiel und Live-Ebenen je unter 6 MB", () => {
    const budget = man.drohne_ebenen.budget_bytes;
    let ebenenSumme = statSync(datei(man.drohne_ebenen.kamera)).size;
    for (const m of alleMeldungen) {
      const { b, e } = ebenen(m.id);
      expect(statSync(datei(b.datei)).size).toBeLessThanOrEqual(150_000);
      let summe = 0;
      for (const [k, p] of [["boden", e.boden], ["kronen", e.kronen], ["stoerung", e.stoerung]] as const) {
        if (!p) continue;
        const n = statSync(datei(p)).size;
        expect(n, `${m.id} ${k}`).toBeLessThanOrEqual(budget.je_ebene[k]);
        summe += n;
      }
      expect(summe).toBe(e.bytes);
      expect(summe, m.id).toBeLessThanOrEqual(budget.je_meldung);
      ebenenSumme += summe;
    }
    const g = man.groessen_bytes;
    expect(g.drohne_ebenen).toBe(ebenenSumme);
    expect(ebenenSumme).toBeLessThan(6_000_000);
    expect(g.drohne + g.zielbilder + g.karte_start + g.fahrzeuge + g.effekte).toBeLessThan(6_000_000);
  });
});
