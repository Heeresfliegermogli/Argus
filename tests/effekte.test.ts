// Effekte auf der Karte (Schritt 7): was wann wo zu sehen ist, wer es sehen darf, und dass jede Quelle eine
// Animation im Asset-Manifest hat (effekte.zuordnung aus Schritt 5b). Gespielt mit den Modellteams naiv und ideal.
import { panzer, verlustLage } from "../src/kern/verluste";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AssetManifest } from "../src/assets/typen";
import { ENDANFLUG_AB, type Effekt, bekannteZiele, effekte, flugOrt } from "../src/kern/effekte";
import { position } from "../src/kern/geometrie";
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
        expect(f!.ab).toBeCloseTo(st.freigabe!.t_s + (wm.flug.vorbereitung_s ?? 0), 2);
        expect(f!.t).toBeCloseTo(w.t_einschlag, 2);
        expect(f!.echtzeit_s).toBeUndefined();
        // H5.2: Die LM fliegt auf den vorausberechneten Einschlagort, im Endanflug auf das Fahrzeug; am Einschlag genau dort
        expect(f!.ziel).toBe(w.ziel);
        const z0 = inh.ziele[f!.ziel!];
        const amZiel = position(z0, Math.min(f!.t, f!.zielHalt ?? Infinity));
        const ende = flugOrt(f!, f!.t);
        expect(Math.hypot(ende[0] - amZiel[0], ende[1] - amZiel[1]), `${id} trifft das Fahrzeug`).toBeLessThan(0.5);
        const mitte = flugOrt(f!, f!.ab! + (f!.t - f!.ab!) * (ENDANFLUG_AB / 2));
        expect(Number.isFinite(mitte[0]) && Number.isFinite(mitte[1])).toBe(true);
      } else if (wm.einsatzbereich) {
        expect(f?.echtzeit_s).toBeGreaterThan(0);
        // seit 2.5 (F1.5): Kanone eines Panzers der 1. Kp (Mündung ≤ 6 m vor dem Panzer); 2.3/2.4 aus der Stellung eines Zuges
        const vonPanzer = panzer(inh).some((p) => Math.hypot(p.pos[0] - f!.von![0], p.pos[1] - f!.von![1]) < 6);
        expect(vonPanzer, id).toBe(true);
      } else {
        expect(f).toBeUndefined();
      }
    }
  });

  it("Hintergrundgefecht: 23 Einschläge Feindartillerie, Nebel H-03, Leuchtspur nur, wo die eigene PzAbw wirkt", async () => {
    const [naiv] = await lauf();
    const inh = weltFuer(naiv.inh, naiv.z);
    const fx = effekte(inh, naiv.z, "alle");
    // ohne die Treffer des Verlustmodells an den Stellungen (V-…, seit 2.3)
    const ari = art(fx, "einschlag").filter((e) => e.quelle.hintergrund === "feindartillerie" && !e.id.startsWith("V-"));
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
        // seit 2.5 (F1.5): Leuchtspur aus der Kanone des vorgesehenen Panzers (h.von, ≤ 6 m vor ihm), ist er ausgefallen, des nächsten
        const pl = panzer(inh);
        expect(pl.some((p) => p.id === h.von), h.id).toBe(true);
        expect(Math.min(...pl.map((p) => Math.hypot(p.pos[0] - spur.von![0], p.pos[1] - spur.von![1]))), h.id).toBeLessThan(6);
        const aus = verlustLage(naiv.inh, naiv.z).ereignisse.some((v) => v.panzer === h.von && v.ausgefallen && v.t <= h.t_s);
        if (!aus) {
          const p = pl.find((x) => x.id === h.von)!;
          expect(Math.hypot(p.pos[0] - spur.von![0], p.pos[1] - spur.von![1]), h.id).toBeLessThan(6);
        }
      }
    }
  });

  it("Feindfeuer auf die 1. Kp (seit 2.5, F2.6): Fehlschuss neben dem Panzer, Treffer am Panzer, ausgefallen = Rauch am Panzer", async () => {
    for (const m of await lauf()) {
      const inh = weltFuer(m.inh, m.z);
      const v = verlustLage(m.inh, m.z).ereignisse;
      const pl = new Map(panzer(inh).map((p) => [p.id, p]));
      expect(v.length).toBeGreaterThan(20);
      for (const sicht of ["alle", "umgebung", new Set<string>()] as const) {
        const fx = effekte(inh, m.z, sicht);
        const eigen = fx.filter((e) => e.id.startsWith("V-") && !e.id.endsWith("-e"));
        // je Schuss ein Einschlag; Feindartillerie daneben steht schon im Hintergrundgefecht
        expect(eigen.length, String(sicht)).toBe(v.filter((e) => e.ergebnis === "treffer" || e.art !== "artillerie").length);
        for (const e of eigen) {
          const ev = v.find((x) => `V-${x.art}-${x.quelle}-${x.nr}-${x.panzer}` === e.id)!;
          expect(ev, e.id).toBeDefined();
          const p = pl.get(ev.panzer)!;
          if (ev.ergebnis === "treffer") {
            expect(e.quelle.hintergrund, e.id).toBe("treffer_panzer");
            expect(e.pos, e.id).toEqual(p.pos);
          } else {
            expect(e.quelle.hintergrund, e.id).toBe(ev.art === "direkt" ? "fehlschuss" : "feindartillerie");
            const d = Math.hypot(e.pos[0] - p.pos[0], e.pos[1] - p.pos[1]);
            expect(d, e.id).toBeGreaterThan(3); // daneben: nicht am Panzer …
            expect(d, e.id).toBeLessThan(120); // … aber sichtbar in seiner Nähe (Steilfeuer daneben bis ca. 85 m)
          }
          expect(e.t).toBe(ev.t);
        }
        // Steilfeuer, Beobachter und Attrappe treffen: zusätzlich der Einschlag wie Feindartillerie
        const steil = v.filter((x) => x.ergebnis === "treffer" && ["steil", "beobachter", "attrappe"].includes(x.art));
        expect(fx.filter((e) => e.id.startsWith("V-") && e.id.endsWith("-e")).length).toBe(steil.length);
        // ausgefallene Panzer: Rauch am Panzer ab dem Ausfall, keine Wrackflammen
        const aus = new Map<string, number>();
        for (const x of v) if (x.ausgefallen && !aus.has(x.panzer)) aus.set(x.panzer, x.t);
        const rauch = art(fx, "wrack").filter((e) => e.quelle.folge === "eigen_ausgefallen");
        expect(rauch.map((e) => [e.id, e.t, e.pos])).toEqual([...aus].map(([pid, t]) => [`${pid}-aus`, t, pl.get(pid)!.pos]));
      }
    }
  });

  it("Wracks: jedes zerstörte Fahrzeug brennt am Ort des Treffers, Z-24 ist nur außer Gefecht (kein Brand)", async () => {
    for (const m of await lauf()) {
      const inh = weltFuer(m.inh, m.z);
      const fx = effekte(inh, m.z, "alle");
      const wracks = art(fx, "wrack").filter((e) => e.quelle.folge !== "eigen_ausgefallen"); // eigene Panzer: Test oben
      // seit 2.4: Personen-Gruppen (Beobachter Z-42, Verwundete Z-45; feuer_effekt „keiner“) brennen nicht
      const brennt = (id: string) => inh.fahrzeuge[inh.ziele[id].typ]?.feuer_effekt !== "keiner";
      expect(wracks.filter((e) => e.quelle.folge === "zerstoert").map((e) => e.id.slice(0, -2)).sort()).toEqual(Object.keys(m.z.zerstoert).filter(brennt).sort());
      for (const w of wracks) if (w.quelle.folge === "zerstoert" || brennt(w.id.slice(0, -2)) === false) expect(w.t).toBe(m.z.zerstoert[w.id.slice(0, -2)] ?? w.t);
      for (const id of Object.keys(m.z.zerstoert).filter((x) => !brennt(x))) expect(wracks.find((e) => e.id === `${id}-w`)?.quelle.folge).toBe("ausser_gefecht");
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

  it("Sichtbarkeit: das Team sieht nichts zu ungemeldeten Zielen, das Plenum nur Feindartillerie, Nebel und Feuer auf die 1. Kp", async () => {
    for (const m of await lauf()) {
      const inh = weltFuer(m.inh, m.z);
      const ungemeldet = new Set(inh.szenario.ziele.filter((z) => z.ungemeldet).map((z) => z.id));
      const kennt = bekannteZiele(inh, m.z);
      for (const u of ungemeldet) expect(kennt.has(u)).toBe(false);
      const fx = effekte(inh, m.z, kennt);
      for (const e of fx) {
        const ziel = e.id.match(/^(Z-\d+|V\d-\d)-[wsx]$/)?.[1];
        if (ziel) expect(kennt.has(ziel), e.id).toBe(true);
      }
      // E-01 auf Z-27/Z-28 (ungemeldet): kein Treffer, keine Leuchtspur beim Team
      expect(fx.some((e) => e.id.startsWith("E-01-0-") && e.art !== "muendung")).toBe(false);
      const pl = effekte(inh, m.z, "umgebung");
      // seit 2.3 auch Feuer auf die eigene Truppe (V-…, seit 2.5 je Panzer, Rauch an ausgefallenen Panzern): verrät kein Ziel
      const erlaubt = (e: Effekt) =>
        e.quelle.hintergrund === "feindartillerie" || e.art === "nebel" || e.id.startsWith("V-") || e.quelle.folge === "eigen_ausgefallen";
      expect(pl.filter((e) => !erlaubt(e)).map((e) => e.id)).toEqual([]);
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
