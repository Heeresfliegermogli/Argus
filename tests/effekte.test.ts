// Effekte auf der Karte (Schritt 7): was wann wo zu sehen ist, wer es sehen darf, und dass jede Quelle eine
// Animation im Asset-Manifest hat (effekte.zuordnung aus Schritt 5b). Gespielt mit den Modellteams naiv und ideal.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AssetManifest } from "../src/assets/typen";
import { type Effekt, bekannteZiele, effekte } from "../src/kern/effekte";
import { weltFuer } from "../src/kern/lage";
import { ausserGefechtAb, lagebildKontrolle } from "../src/kern/lagebild";
import { inhalte } from "./hilfen";
import { type Modellteam, spieleDurch } from "./modellteam";

const man = JSON.parse(readFileSync(fileURLToPath(new URL("../public/assets/manifest.json", import.meta.url)), "utf-8")) as AssetManifest;

let teams: Modellteam[] | null = null;
async function lauf(): Promise<Modellteam[]> {
  if (teams) return teams;
  const inh = await inhalte();
  teams = spieleDurch(inh, [{ name: "naiv", opt: { team: "naiv" } }, { name: "ideal", opt: { team: "ideal" } }]);
  return teams;
}

const art = (l: Effekt[], a: string) => l.filter((e) => e.art === a);

describe("Effekte (kern/effekte.ts)", () => {
  it("eigene Wirkungen: LM fliegt in Spielzeit von flug.start zum Einschlagort, PzAbw als Leuchtspur, Einschlag am Einschlagort", async () => {
    const [naiv] = await lauf();
    const inh = weltFuer(naiv.inh, naiv.z);
    const fx = effekte(inh, naiv.z, "alle");
    const wirkungen = naiv.z.reihenfolge.filter((id) => naiv.z.meldungen[id].wirkung);
    expect(wirkungen.length).toBeGreaterThan(10);
    for (const id of wirkungen) {
      const st = naiv.z.meldungen[id];
      const w = st.wirkung!;
      const x = fx.find((e) => e.id === `${id}-x`)!;
      expect(x, id).toBeDefined();
      expect(x.art).toBe("einschlag");
      expect(x.quelle.wirkmittel).toBe(w.wirkmittel);
      expect(x.t).toBeCloseTo(w.t_einschlag, 2);
      expect(x.pos).toEqual(w.pos);
      const f = fx.find((e) => e.id === `${id}-f`);
      const wm = inh.wirkmittel[w.wirkmittel];
      if (wm.flug) {
        expect(f?.art).toBe("flug");
        expect(f!.von).toEqual(wm.flug.start);
        expect(f!.ab).toBeCloseTo(st.g3!.t_s + (wm.flug.vorbereitung_s ?? 0), 2);
        expect(f!.t).toBeCloseTo(w.t_einschlag, 2);
        expect(f!.echtzeit_s).toBeUndefined();
      } else if (wm.einsatzbereich) {
        expect(f?.echtzeit_s).toBeGreaterThan(0);
        expect(f!.von![0]).toBeLessThan(0);
      } else {
        expect(f).toBeUndefined();
      }
    }
  });

  it("Hintergrundgefecht: 23 Einschläge Feindartillerie, Nebel H-03, Leuchtspur nur, wo die eigene PzAbw wirkt", async () => {
    const [naiv] = await lauf();
    const inh = weltFuer(naiv.inh, naiv.z);
    const fx = effekte(inh, naiv.z, "alle");
    const ari = art(fx, "einschlag").filter((e) => e.quelle.hintergrund === "feindartillerie");
    const soll = inh.szenario.hintergrund!.ereignisse.flatMap((h) => (h.art === "feindartillerie" ? h.einschlaege : []));
    expect(ari.length).toBe(soll.length);
    expect(ari.every((e) => e.pos[0] < 400)).toBe(true); // Westrand und Westufer
    const nebel = art(fx, "nebel");
    expect(nebel.map((e) => [e.id, e.t, e.bis, e.radius_m])).toEqual([["H-03", 582, 762, 75]]);
    for (const h of inh.szenario.hintergrund!.ereignisse) {
      if (h.art !== "panzerabwehr") continue;
      const spur = fx.find((e) => e.id === `${h.id}-s`);
      expect(!!spur, h.id).toBe(!!naiv.z.hintergrund[h.id]?.wirkt);
      if (spur) {
        expect(spur.von![0]).toBeLessThan(0);
        expect(spur.von![1]).toBe(inh.szenario.kraefte.find((k) => k.id === h.von)!.pfeil_y);
      }
    }
  });

  it("Wracks: jedes zerstörte Fahrzeug brennt am Ort des Treffers, Z-24 ist nur außer Gefecht (kein Brand)", async () => {
    for (const m of await lauf()) {
      const inh = weltFuer(m.inh, m.z);
      const fx = effekte(inh, m.z, "alle");
      const wracks = art(fx, "wrack");
      expect(wracks.filter((e) => e.quelle.folge === "zerstoert").map((e) => e.id.slice(0, -2)).sort()).toEqual(Object.keys(m.z.zerstoert).sort());
      for (const w of wracks) if (w.quelle.folge === "zerstoert") expect(w.t).toBe(m.z.zerstoert[w.id.slice(0, -2)]);
      const ag = ausserGefechtAb(inh, m.z, "Z-24");
      if (m.z.zerstoert["Z-24"] === undefined && ag !== undefined) {
        expect(wracks.find((e) => e.id === "Z-24-w")?.quelle.folge).toBe("ausser_gefecht");
        const z24 = lagebildKontrolle(inh, m.z, 1300).objekte.find((o) => o.id === "Z-24")!;
        expect(z24.sprite).toMatchObject({ zustand: "kette_ab", zustandAb: 1170 });
      }
    }
  });

  it("E-01 (ideal): Mündungsblitz an den PT-91, Leuchtspur und Treffer auf die letzten Feindkräfte", async () => {
    const [, ideal] = await lauf();
    const inh = weltFuer(ideal.inh, ideal.z);
    const fx = effekte(inh, ideal.z, "alle");
    const e01 = inh.szenario.ereignisse[0];
    const getroffen = Object.entries(ideal.z.ereignisse["E-01"]?.wirkungen ?? {}).filter(([, w]) => w.wirkt).map(([nr]) => Number(nr));
    expect(getroffen.length).toBeGreaterThan(0);
    for (const nr of getroffen) {
      const m = fx.find((e) => e.id === `E-01-${nr}-m`)!;
      expect(m.art).toBe("muendung");
      expect(m.quelle.feuert).toBe("kanone");
      expect(m.richtung).toBeTypeOf("number");
      expect(fx.find((e) => e.id === `E-01-${nr}-x`)?.t).toBe(e01.wirkungen[nr].t_s);
    }
  });

  it("Sichtbarkeit: G2/G3 sehen nichts zu ungemeldeten Zielen, das Plenum nur Feindartillerie und Nebel", async () => {
    for (const m of await lauf()) {
      const inh = weltFuer(m.inh, m.z);
      const ungemeldet = new Set(inh.szenario.ziele.filter((z) => z.ungemeldet).map((z) => z.id));
      for (const rolle of ["g1", "g2", "g3"] as const) {
        const kennt = bekannteZiele(inh, m.z, rolle);
        for (const u of ungemeldet) expect(kennt.has(u)).toBe(false);
        const fx = effekte(inh, m.z, kennt);
        for (const e of fx) {
          const ziel = e.id.match(/^(Z-\d+|V\d-\d)-[wsx]$/)?.[1];
          if (ziel) expect(kennt.has(ziel), `${rolle} ${e.id}`).toBe(true);
        }
        // E-01 auf Z-27/Z-28 (ungemeldet): kein Treffer, keine Leuchtspur bei den Rollen
        expect(fx.some((e) => e.id.startsWith("E-01-0-") && e.art !== "muendung")).toBe(false);
      }
      const pl = effekte(inh, m.z, "umgebung");
      expect(pl.every((e) => e.quelle.hintergrund === "feindartillerie" || e.art === "nebel")).toBe(true);
    }
  });

  it("jede Quelle hat eine Animation im Asset-Manifest (effekte.zuordnung, Schritt 5b)", async () => {
    const inh = await inhalte();
    const anim = man.effekte.animationen;
    const zu = man.effekte.zuordnung;
    for (const w of Object.values(inh.wirkmittel)) {
      const z = zu.wirkmittel[w.id];
      expect(z, w.id).toBeDefined();
      expect(anim[z.einschlag], `${w.id} Einschlag`).toBeDefined();
      if (w.flug || w.einsatzbereich) expect(anim[z.flug ?? ""], `${w.id} Flug`).toBeDefined();
      for (const d of z.danach) expect(anim[d], `${w.id} danach ${d}`).toBeDefined();
    }
    for (const h of inh.szenario.hintergrund!.ereignisse) {
      const z = zu.hintergrund[h.art];
      expect(z, h.art).toBeDefined();
      for (const n of [z.einschlag, z.flug, z.flaeche, ...(z.danach ?? [])].filter(Boolean)) expect(anim[n!], `${h.art} ${n}`).toBeDefined();
    }
    for (const n of zu.wrack.zerstoert) expect(anim[n]).toBeDefined();
    expect(zu.wrack.ausser_gefecht).toEqual([]);
    expect(anim[zu.feuert.kanone]).toBeDefined();
    // Zustands-Sprite für „außer Gefecht“ im Fahrzeug-Atlas
    const atlas = JSON.parse(readFileSync(fileURLToPath(new URL("../public/assets/sprites/fahrzeuge.json", import.meta.url)), "utf-8")) as { frames: Record<string, unknown> };
    expect(atlas.frames["kpz_t72_kette_ab.png"]).toBeDefined();
  });
});
