// Drehbuch für fünf Teams mit der echten Engine, verglichen mit tools/referenz/simuliere_durchlauf.py (seit 2.3 mit den
// Verlusten der eigenen Kompanie und ihren Druckmeldungen, seit 2.6 eine Rolle je Team mit einer Entscheidung je Meldung).
// Die fünf Läufe der Simulation (naiv, ideal, beide mit vier Verstärkungen, naiv mit fünf) laufen als fünf Teams parallel, jedes mit
// seiner eigenen lokalen Engine wie am Team-Laptop (tests/modellteam.ts). Referenz: tests/referenz_durchlauf.json, erzeugt mit
// tools/referenz/erzeuge_durchlauf.py.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { durchgebrochen } from "../src/kern/durchbruch";
import { weltFuer } from "../src/kern/lage";
import { verlustLage, verlustStand, verlustVerlauf } from "../src/kern/verluste";
import { type MeldungsStand, zustandAus } from "../src/kern/zustand";
import { inhalte } from "./hilfen";
import { type Entscheidung, type Modellteam, spieleDurch, type Team } from "./modellteam";

interface RefMeldung {
  meldung: string; t_meld: number; ende: string;
  t_offen: number | null; t_entscheid: number | null; entscheid: string | null; sek_eingang: number | null; sek_offen: number | null;
  wm: string | null; t_wirkung: number | null; ziel: string | null; pos: [number, number] | null; getroffen: string[]; verstoesse: string[];
}
interface RefLauf {
  team: Team; einspielen: Record<string, number>; meldungen: RefMeldung[];
  injects: { inject: string; t: number }[]; hintergrund: { id: string; t: number; wirkt: boolean | null }[];
  e01: ({ entfaellt: true } | { t: number; von: string; ziel: string })[]; rest: Record<string, number | string>;
  durchbruch: { gruppe: string; t: number; durch: boolean }[]; durchgebrochen: string[];
  treffer_schutz: string[]; faelle: Record<string, boolean>; log: string[];
  verluste: {
    panzer: Record<string, { zustand: number; roh: number; stufe: string; treffer: number; verwundete: number; ausgefallen: boolean }>;
    zug: { bereit: number; gesamt: number; eingeschraenkt: number; ausgefallen: number; verwundete: number };
    ereignisse: number; zeitlinie: [number, string, string, string, number, string, number, number, boolean, [number, number]][];
    meldungen: { inject: string; t: number; zug: string; stufe: number; text: string }[];
    texte: Record<string, string>; verlauf: [number, number[], number, number][];
  } | null;
}
const ref = JSON.parse(readFileSync(new URL("./referenz_durchlauf.json", import.meta.url), "utf-8")) as {
  zeiten: Record<Team, number>; reihenfolge_wirkmittel: string[]; laeufe: RefLauf[];
};

const NAH = 0.06;

/** Ausgang einer Meldung in den Begriffen der Simulation. */
export function ende(st: MeldungsStand | undefined, e: Entscheidung | undefined): string {
  if (!st) return "?";
  if (st.wirkung) return "Wirkung";
  if (st.ergebnis === "abgelehnt") return "abgelehnt";
  // zurückgestellt bleibt zurückgestellt – auch wenn das Fahrzeug später wegfällt (die Simulation schaut nicht mehr hin)
  if (st.entscheid?.entscheid === "zurueckstellen" || e?.entscheid === "ZURÜCKSTELLEN") return "zurückgestellt";
  if (st.stufe === "entfallen") return "entfällt";
  if (st.stufe === "offen") return "Spielende";
  return st.stufe;
}

function simEnde(r: RefMeldung): string {
  if (r.ende.startsWith("entfällt")) return "entfällt";
  if (r.ende === "kein Wirkmittel") return "zurückgestellt";
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
    opt: { team: l.team, einspielen: l.einspielen, dauer: ref.zeiten[l.team], reihenfolge: ref.reihenfolge_wirkmittel },
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
      // eine Rolle (seit 2.6): Entscheidungen nur von der Zielbearbeitung, Uhr und Verstärkungen von der Spielleitung
      expect(m.kanal.protokoll.filter((e) => e.typ === "entscheid").every((e) => e.von.rolle === "zb")).toBe(true);
      expect(m.kanal.protokoll.every((e, i) => e.seq === i + 1)).toBe(true);
      const abgelehnt = m.z.abgelehnt.map((a) => `${a.aktionstyp}: ${a.grund}`);
      expect(abgelehnt, m.name).toEqual([]);
    }
  }, 60000); // seit 2.4 (mehr Ziele, Einschlag je Fahrzeug) unter Last länger als die 5 s Vorgabe

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
        expect(st.erschienen.t_s, `${ort} Meldezeit`).toBeCloseTo(s.t_meld, 1);
        // eine Entscheidung je Meldung mit Sekunden ab Eingang und ab Öffnen (H2.4); entfällt die Meldung während der Bearbeitung,
        // hat die Engine keine Entscheidung mehr
        if (s.entscheid && s.t_entscheid !== null && s.t_entscheid <= 1500 && simEnde(s) !== "entfällt") {
          const ent = st.entscheid!;
          expect(ent, `${ort} Entscheidung`).toBeDefined();
          expect(ent.t_s, `${ort} Zeit der Entscheidung`).toBeCloseTo(s.t_entscheid, 1);
          expect({ bekaempfen: "BEKÄMPFEN", zurueckstellen: "ZURÜCKSTELLEN", ablehnen: "ABLEHNEN" }[ent.entscheid], `${ort} Entscheidung`).toBe(s.entscheid);
          expect(ent.t_offen!, `${ort} geöffnet`).toBeCloseTo(s.t_offen!, 1);
          expect(ent.sek_eingang!, `${ort} Sekunden ab Eingang`).toBeCloseTo(s.sek_eingang!, 1);
          expect(ent.sek_offen!, `${ort} Sekunden ab Öffnen`).toBeCloseTo(s.sek_offen!, 1);
        }
        if (s.ende === "Wirkung") {
          const w = st.wirkung!;
          expect(w.wirkmittel, `${ort} Wirkmittel`).toBe(s.wm);
          expect(st.freigabe!.t_s, `${ort} Freigabe`).toBeCloseTo(s.t_entscheid!, 1);
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

      // Verluste der eigenen Truppe (seit 2.3; seit 2.5 je Panzer, F2): gleiche Zeitlinie Schuss für Schuss (Einschießen, Ergebnis,
      // Zustand, Einschlagort), gleicher Stand je Panzer und der Kp, gleiche Druckmeldungen mit Text und Stufe, gleiche Texte der
      // Lagemeldungen mit Platzhaltern; deterministisch, höchstens zwei Panzer ausgefallen, die übrigen ≥ Untergrenze
      if (r.verluste) {
        const v = r.verluste;
        const vr = m.inh.regeln.verluste!;
        const lage = verlustLage(m.inh, z);
        expect(lage.ereignisse.length, `${name} Schüsse auf den Zug`).toBe(v.ereignisse);
        expect(lage.ereignisse.map((e) => [e.t, e.panzer, e.quelle, e.art, e.k, e.ergebnis, e.schaden, e.zustand, e.ausgefallen, e.pos]), `${name} Zeitlinie`)
          .toEqual(v.zeitlinie);
        const st = verlustStand(m.inh, z, 1500)!;
        for (const [pz, soll] of Object.entries(v.panzer)) {
          expect(st.panzer[pz], `${name} ${pz}`).toEqual(soll);
          if (!soll.ausgefallen) expect(st.panzer[pz].zustand, `${name} ${pz} Untergrenze`).toBeGreaterThanOrEqual(vr.untergrenze_prozent);
        }
        expect(st.zug, `${name} Zug`).toEqual(v.zug);
        expect(st.zug.ausgefallen, `${name} höchstens ${vr.hoechstens_ausgefallen} ausgefallen`).toBeLessThanOrEqual(vr.hoechstens_ausgefallen);
        const km = z.injectReihenfolge.map((id) => z.injects[id]).filter((i) => i.stufe !== undefined);
        expect(km.map((i) => [i.id, i.zug, i.stufe, i.text]), `${name} Druckmeldungen`).toEqual(v.meldungen.map((k) => [k.inject, k.zug, k.stufe, k.text]));
        km.forEach((i, k) => expect(i.erschienen.t_s, `${name} ${i.id}`).toBeCloseTo(v.meldungen[k].t, 1));
        for (const [id, text] of Object.entries(v.texte)) expect(z.injects[id]?.text, `${name} ${id} Text`).toBe(text);
        expect(verlustVerlauf(m.inh, z), `${name} Verlauf`).toEqual(v.verlauf);
        // deterministisch: aus dem Protokoll neu gerechnet dasselbe
        const neu = zustandAus(m.kanal.protokoll, m.inh);
        expect(verlustStand(m.inh, neu, 1500), `${name} neu gerechnet`).toEqual(st);
      }

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
