// Drehbuch für fünf Teams mit der echten Engine, verglichen mit tools/referenz/simuliere_durchlauf.py.
// Die fünf Läufe der Simulation (naiv, ideal, beide mit vier Verstärkungen, naiv mit fünf) laufen als fünf
// Teams parallel an einem Taktgeber (tests/modellteam.ts). Referenz: tests/referenz_durchlauf.json, erzeugt
// mit tools/referenz/erzeuge_durchlauf.py.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { durchgebrochen } from "../src/kern/durchbruch";
import { weltFuer } from "../src/kern/lage";
import type { MeldungsStand } from "../src/kern/zustand";
import { inhalte } from "./hilfen";
import { type Entscheidung, type Modellteam, spieleDurch, type Team } from "./modellteam";

interface RefMeldung {
  meldung: string; t_meld: number; ft: boolean; ende: string;
  t_g1: number | null; g1: string | null; t_g2: number | null; g2: string | null; t_g3: number | null; g3: string | null;
  wm: string | null; t_wirkung: number | null; ziel: string | null; pos: [number, number] | null; getroffen: string[]; verstoesse: string[];
}
interface RefLauf {
  team: Team; einspielen: Record<string, number>; fast_track_ab: number | null; meldungen: RefMeldung[];
  injects: { inject: string; t: number }[]; hintergrund: { id: string; t: number; wirkt: boolean | null }[];
  e01: ({ entfaellt: true } | { t: number; von: string; ziel: string })[]; rest: Record<string, number | string>;
  durchbruch: { gruppe: string; t: number; durch: boolean }[]; durchgebrochen: string[];
  treffer_schutz: string[]; faelle: Record<string, boolean>; log: string[];
}
const ref = JSON.parse(readFileSync(new URL("./referenz_durchlauf.json", import.meta.url), "utf-8")) as {
  zeiten: { G1: number; G2: number; G3: number; ft_nach_angebot: number }; reihenfolge_wirkmittel: string[]; laeufe: RefLauf[];
};

const NAH = 0.06;

/** Ausgang einer Meldung in den Begriffen der Simulation. */
export function ende(st: MeldungsStand | undefined, e: Entscheidung | undefined): string {
  if (!st) return "?";
  if (st.wirkung) return "Wirkung";
  if (e?.g3?.was === "ZURUECK") return "G3: Warnung zum Einschlag";
  if (st.ergebnis === "abgelehnt_g3") return "G3 lehnt ab";
  if (e?.g2?.wahl === "BEOBACHTEN") return "G2 beobachtet";
  if (st.ergebnis === "nicht_bekaempfen_g2") return "G2 nicht bekämpfen";
  if (st.ergebnis === "abgelehnt_g1") return "G1 lehnt ab";
  if (st.stufe === "entfallen") return "entfällt";
  if (st.stufe === "g1" || st.stufe === "g2" || st.stufe === "g3") return "Spielende";
  return st.stufe;
}

function simEnde(r: RefMeldung): string {
  if (r.ende.startsWith("entfällt")) return "entfällt";
  if (r.ende === "kein Wirkmittel") return "G2 nicht bekämpfen";
  return r.ende;
}

function code(v: string): string {
  const [regel, rest] = v.split(": ");
  return regel === "EB" ? "außerhalb" : rest.split(" ")[0];
}

let laeufe: Modellteam[] | null = null;
async function teams(): Promise<Modellteam[]> {
  if (laeufe) return laeufe;
  const inh = await inhalte();
  laeufe = spieleDurch(inh, ref.laeufe.map((l, i) => ({
    name: `team${i + 1}`,
    opt: { team: l.team, einspielen: l.einspielen, zeiten: ref.zeiten, ftNachAngebot: ref.zeiten.ft_nach_angebot, reihenfolge: ref.reihenfolge_wirkmittel },
  })));
  return laeufe;
}

describe("Drehbuch mit fünf Teams wie simuliere_durchlauf.py", () => {
  it("alle fünf Teams spielen bis zum Spielende, getrennte Protokolle, jede Aktion verarbeitet", async () => {
    const liste = await teams();
    expect(liste).toHaveLength(5);
    for (const m of liste) {
      expect(m.z.ende, m.name).toBe(true);
      expect(m.z.uhr.t_s).toBe(1500);
      expect(m.kanal.protokoll.length).toBe(m.z.seq);
      expect(m.kanal.protokoll.every((e, i) => e.seq === i + 1)).toBe(true);
      const abgelehnt = m.z.abgelehnt.map((a) => `${a.aktionstyp}: ${a.grund}`);
      expect(abgelehnt, m.name).toEqual([]);
    }
  });

  ref.laeufe.forEach((r, nr) => {
    const name = `${r.team}${Object.keys(r.einspielen).length ? ` + ${Object.entries(r.einspielen).map(([g, t]) => `${g}@${t}`).join(" ")}` : ""}`;
    it(`Team ${nr + 1} ${name}: jede Meldung mit Ausgang, Zeiten, Wirkmittel, Einschlag und Treffern`, async () => {
      const m = (await teams())[nr];
      const z = m.z;
      const inh = weltFuer(m.inh, z);
      expect(z.reihenfolge).toEqual(r.meldungen.map((x) => x.meldung));
      for (const s of r.meldungen) {
        const st = z.meldungen[s.meldung];
        const e = m.entscheidungen.get(s.meldung);
        const ort = `${name} ${s.meldung}`;
        expect(ende(st, e), `${ort} Ausgang`).toBe(simEnde(s));
        expect(st.fastTrack, `${ort} Fast-Track`).toBe(s.ft);
        expect(st.erschienen.t_s, `${ort} Meldezeit`).toBeCloseTo(s.t_meld, 1);
        // entfällt die Meldung während der Bearbeitung (letztes Fahrzeug weg), hat die Engine keine Entscheidung mehr
        if (s.t_g1 !== null && s.t_g1 <= 1500 && simEnde(s) !== "entfällt") expect(st.g1?.t_s, `${ort} G1`).toBeCloseTo(s.t_g1, 1);
        if (s.g2 && s.t_g2 !== null && s.t_g2 <= 1500 && simEnde(s) !== "entfällt") expect(e?.g2?.t, `${ort} G2`).toBeCloseTo(s.t_g2, 1);
        if (s.ende === "Wirkung") {
          const w = st.wirkung!;
          expect(w.wirkmittel, `${ort} Wirkmittel`).toBe(s.wm);
          expect(st.g3!.t_s, `${ort} Freigabe`).toBeCloseTo(s.t_g3!, 1);
          expect(Math.abs(w.t_einschlag - s.t_wirkung!), `${ort} Einschlag ${w.t_einschlag} / ${s.t_wirkung}`).toBeLessThan(NAH);
          expect(w.ziel, `${ort} bekämpftes Fahrzeug`).toBe(s.ziel);
          expect(Math.hypot(w.pos[0] - s.pos![0], w.pos[1] - s.pos![1]), `${ort} Einschlagort`).toBeLessThan(0.2);
          expect(w.getroffen.map((g) => `${g.ziel}|${g.kategorie}`).sort(), `${ort} Treffer`).toEqual(s.getroffen);
          expect(w.verstoesse.map(code), `${ort} Verstöße beim Einschlag`).toEqual(s.verstoesse);
        }
      }
      // keine Meldung zu viel
      expect(Object.keys(z.meldungen).length).toBe(r.meldungen.length);
      expect(inh.szenario.meldungen.length).toBe(r.meldungen.length);
    });

    it(`Team ${nr + 1} ${name}: Injects, Hintergrundgefecht, E-01, Bestand und Fälle`, async () => {
      const m = (await teams())[nr];
      const z = m.z;
      const injects = z.injectReihenfolge.map((id) => ({ inject: id, t: z.injects[id].erschienen.t_s })).sort((a, b) => a.t - b.t || a.inject.localeCompare(b.inject));
      expect(injects.map((i) => i.inject), `${name} Injects`).toEqual(r.injects.map((i) => i.inject));
      injects.forEach((i, k) => expect(i.t, `${name} ${i.inject}`).toBeCloseTo(r.injects[k].t, 1));

      for (const h of r.hintergrund) {
        expect(z.hintergrund[h.id], `${name} ${h.id}`).toBeDefined();
        expect(z.hintergrund[h.id].t_s).toBeCloseTo(h.t, 1);
        if (h.wirkt !== null) expect(!!z.hintergrund[h.id].wirkt, `${name} ${h.id} wirkt`).toBe(h.wirkt);
      }

      const e01 = z.ereignisse["E-01"];
      if (r.e01.some((x) => "entfaellt" in x)) {
        expect(e01?.entfaellt, `${name} E-01 entfällt`).toBeDefined();
      } else {
        const ist = Object.entries(e01?.wirkungen ?? {}).filter(([, w]) => w.wirkt).map(([nrW, w]) => {
          const plan = m.inh.szenario.ereignisse[0].wirkungen[Number(nrW)];
          return `${plan.von}>${plan.ziel}@${w.t_s}`;
        });
        expect(ist, `${name} E-01`).toEqual(r.e01.map((x) => { const y = x as { t: number; von: string; ziel: string }; return `${y.von}>${y.ziel}@${y.t}`; }));
      }

      for (const [wm, rest] of Object.entries(r.rest)) expect(z.bestand[wm] ?? "∞", `${name} Bestand ${wm}`).toBe(rest);

      // Durchbruch (seit 2.1): jede Gruppe nach ihrem Angriffszeitpunkt entschieden wie in der Simulation
      expect(Object.keys(z.durchbrueche).sort(), `${name} Durchbruch-Gruppen`).toEqual(r.durchbruch.map((d) => d.gruppe).sort());
      for (const d of r.durchbruch) {
        expect(z.durchbrueche[d.gruppe].durch, `${name} ${d.gruppe} bricht durch`).toBe(d.durch);
        expect(z.durchbrueche[d.gruppe].t_ab, `${name} ${d.gruppe} t_ab`).toBeCloseTo(d.t, 1);
      }
      expect(durchgebrochen(weltFuer(m.inh, z), z.durchbrueche, z.zerstoert, z.verstaerkungen).fahrzeuge, `${name} durchgebrochen`).toEqual(r.durchgebrochen);

      const sz = weltFuer(m.inh, z).szenario;
      for (const f of [...sz.schluesselfaelle, ...sz.nebenfaelle]) {
        const st = z.meldungen[f.meldung];
        const a = ende(st, m.entscheidungen.get(f.meldung));
        const erreicht = a !== "Spielende" && a !== "?" && !a.startsWith("entfällt");
        expect(erreicht, `${name} ${f.id}`).toBe(r.faelle[f.id]);
      }
    });
  });
});
