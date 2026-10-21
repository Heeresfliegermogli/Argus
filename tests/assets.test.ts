// Prüft die Assets aus Schritt 5 gegen die Spieldaten (Fertig-Kriterium: jedes Ziel im Drehbuch
// hat Bild und Sprite) und gegen die Leitplanken (schnell ladbar, Sichtstörungen wie beschrieben,
// Schlüsselfälle gut sichtbar). Die Bilder erzeugt tools/assets/gen_assets.py.
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AssetManifest } from "../src/assets/typen";
import { inhalte } from "./hilfen";

const ASSETS = fileURLToPath(new URL("../public/assets/", import.meta.url));
const man = JSON.parse(readFileSync(ASSETS + "manifest.json", "utf-8")) as AssetManifest;
const datei = (p: string) => ASSETS + p;

function bildGroesse(pfad: string): [number, number] {
  const b = readFileSync(pfad);
  if (b.toString("ascii", 1, 4) === "PNG") return [b.readUInt32BE(16), b.readUInt32BE(20)];
  expect(b.toString("ascii", 0, 4)).toBe("RIFF");
  expect(b.toString("ascii", 8, 12)).toBe("WEBP");
  const art = b.toString("ascii", 12, 16);
  if (art === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (art === "VP8L") {
    const v = b.readUInt32LE(21);
    return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)];
  }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

describe("Assets Raum KRÄHE", () => {
  it("passen zur Szenario-Version", async () => {
    const inh = await inhalte();
    expect(man.szenario.id).toBe(inh.szenario.id);
    expect(man.szenario.version).toBe(inh.szenario.version);
  });

  it("jedes Ziel im Drehbuch hat Bild, Sprite und Wrack (Fertig-Kriterium Schritt 5)", async () => {
    const inh = await inhalte();
    const atlas = JSON.parse(readFileSync(datei(man.fahrzeuge.json), "utf-8")) as { frames: Record<string, unknown> };
    for (const z of inh.szenario.ziele) {
      const e = man.ziele[z.id];
      expect(e, z.id).toBeDefined();
      expect(e.bilder.length, `${z.id} ohne Bild`).toBeGreaterThan(0);
      const f = inh.fahrzeuge[z.typ];
      for (const s of [f.sprite, f.sprite_wrack]) {
        expect(s, `${z.id} ohne Sprite`).toBeTruthy();
        expect(atlas.frames[s!], `${s} fehlt im Atlas`).toBeDefined();
      }
      for (const b of e.bilder) expect(existsSync(datei((man.drohne[b] ?? man.zielbilder[b]).datei))).toBe(true);
    }
    const katalog = JSON.parse(readFileSync(fileURLToPath(new URL("../public/daten/katalog_fahrzeuge.json", import.meta.url)), "utf-8")) as
      { personen: { id: string; sprite?: string }[] };
    for (const p of inh.szenario.ziele.flatMap((z) => z.personen ?? [])) {
      const kat = katalog.personen.find((k) => k.id === p.art);
      expect(kat?.sprite && atlas.frames[kat.sprite], `Sprite für Personen ${p.art}`).toBeTruthy();
    }
  });

  it("jede Meldung hat ein Drohnenbild 1024 × 640, höchstens 150 KB", async () => {
    const inh = await inhalte();
    for (const m of inh.szenario.meldungen) {
      const b = man.drohne[m.id];
      expect(b, m.id).toBeDefined();
      expect(b.datei).toBe(m.bild.datei);
      expect(bildGroesse(datei(b.datei))).toEqual([b.breite, b.hoehe]);
      expect([b.breite, b.hoehe]).toEqual([1024, 640]);
      expect(statSync(datei(b.datei)).size).toBeLessThanOrEqual(150_000);
      expect(b.ziele.map((z) => z.id)).toEqual(m.ziele);
      for (const z of b.ziele) {
        const [x, y, w, h] = z.box;
        expect(x >= 0 && y >= 0 && x + w <= b.breite && y + h <= b.hoehe, `${m.id} ${z.id} Rahmen im Bild`).toBe(true);
      }
    }
  });

  it("Sichtstörungen entsprechen bild.sicht (gemessener Anteil)", async () => {
    const inh = await inhalte();
    let gestoert = 0;
    for (const m of inh.szenario.meldungen) {
      const b = man.drohne[m.id];
      expect(b.sicht.length).toBe(m.bild.sicht.length);
      if (m.bild.sicht.length) gestoert++;
      m.bild.sicht.forEach((sv, i) => {
        const ist = b.sicht[i];
        expect(ist.art).toBe(sv.art);
        expect(Math.abs((ist.anteil_ist ?? -1) - sv.anteil), `${m.id} ${sv.art} ${sv.lage}`).toBeLessThanOrEqual(0.08);
        if (sv.ziel_anteil !== undefined) expect(Math.abs((ist.ziel_ist ?? -1) - sv.ziel_anteil), `${m.id} Ziel`).toBeLessThanOrEqual(0.12);
      });
      // ohne verdeckende Störung am Ziel bleibt das Ziel frei
      const amZiel = m.bild.sicht.some((sv) => sv.lage === "Ziel" && sv.art !== "unschaerfe") || m.bild.sicht.some((sv) => sv.ziel_anteil);
      if (!amZiel) for (const z of b.ziele) expect(z.verdeckt, `${m.id} ${z.id} frei`).toBeLessThan(0.05);
    }
    expect(gestoert).toBe(19);
  });

  it("Schlüsselfälle bleiben erkennbar", async () => {
    const inh = await inhalte();
    const fall = (f: string) => inh.szenario.meldungen.filter((m) => m.fall === f).map((m) => man.drohne[m.id]);
    for (const b of [...fall("S1"), ...fall("S3")]) for (const z of b.ziele) expect(z.verdeckt).toBeLessThan(0.05);
    const s2 = fall("S2")[0].ziele[0];
    expect(s2.kennzeichen_verdeckt).toBeDefined();
    expect(s2.kennzeichen_verdeckt!).toBeLessThan(0.05);                                  // Rotes Kreuz frei
    for (const b of fall("S4")) {
      const zivil = b.personen.find((p) => p.art === "zivil");
      expect(zivil?.anzahl).toBe(4);
      expect(zivil!.verdeckt).toBeLessThan(0.1);                                           // Zivilpersonen sichtbar
    }
    const n2 = man.drohne[inh.szenario.nebenfaelle.find((f) => f.id === "N2")!.meldung];
    expect(n2.personen.find((p) => p.art === "besatzung_ergibt_sich")?.anzahl).toBe(3);
  });

  it("ungemeldete Ziele erscheinen nur in Bildern der Spielleitung", async () => {
    const inh = await inhalte();
    const ungemeldet = inh.szenario.ziele.filter((z) => z.ungemeldet).map((z) => z.id);
    for (const b of Object.values(man.drohne)) {
      for (const o of [...b.ziele, ...b.objekte]) expect(ungemeldet).not.toContain(o.id);
    }
    for (const id of ungemeldet) expect(man.ziele[id].bilder.every((b) => man.zielbilder[b]?.nur_spielleitung)).toBe(true);
  });

  it("Effekte für alle Wirkmittel, Atlas-Bilder passen zu den JSON-Dateien", async () => {
    const inh = await inhalte();
    for (const w of Object.values(inh.wirkmittel)) expect(man.effekte.animationen[w.effekt], w.effekt).toBeDefined();
    for (const a of [man.fahrzeuge, man.effekte]) {
      const j = JSON.parse(readFileSync(datei(a.json), "utf-8")) as { meta: { image: string; size: { w: number; h: number } }; frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>; animations?: Record<string, string[]> };
      expect(bildGroesse(datei(a.bild))).toEqual([j.meta.size.w, j.meta.size.h]);
      expect(a.bild.endsWith(j.meta.image)).toBe(true);
      for (const [name, f] of Object.entries(j.frames)) {
        expect(f.frame.x + f.frame.w <= j.meta.size.w && f.frame.y + f.frame.h <= j.meta.size.h, name).toBe(true);
      }
      for (const [name, bilder] of Object.entries(j.animations ?? {})) {
        expect(bilder.length, name).toBe(man.effekte.animationen[name].bilder);
        for (const b of bilder) expect(j.frames[b]).toBeDefined();
      }
    }
  });

  it("Kartenpaket vollständig, Karte verweist auf vorhandene Bilder", async () => {
    const inh = await inhalte();
    const k = man.karte;
    expect(k.ausdehnung_m).toEqual(inh.karte.ausdehnung_m);
    for (const s of [...k.luftbild.stufen, k.topo, k.lagekarte]) {
      expect(bildGroesse(datei(s.datei))).toEqual([s.breite, s.hoehe]);
      expect(Math.abs(s.breite * s.m_pro_px - k.ausdehnung_m.breite)).toBeLessThan(1);
    }
    for (let y = 0; y < k.luftbild.kacheln.zeilen; y++) {
      for (let x = 0; x < k.luftbild.kacheln.spalten; x++) {
        expect(existsSync(datei(k.luftbild.kacheln.muster.replace("{x}", String(x)).replace("{y}", String(y))))).toBe(true);
      }
    }
    expect(existsSync(datei(inh.karte.bilder.luftbild))).toBe(true);
    expect(existsSync(datei(inh.karte.bilder.lagekarte))).toBe(true);
  });

  it("schnell ladbar: Bilder fürs Spiel zusammen unter 6 MB", () => {
    const g = man.groessen_bytes;
    const spiel = g.drohne + g.zielbilder + g.karte_start + g.fahrzeuge + g.effekte;
    expect(spiel).toBeLessThan(6_000_000);
  });
});
