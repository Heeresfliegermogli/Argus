// Szenario 2.4 (Änderungsliste E vom 01.11.2026, „Ethik“, Teil E-a): Verstärkungsmenü per Schalter aus (E1), mehr Fahrzeuge
// und dichtere Meldungen, Verlustmodell neu kalibriert (E2), BEKÄMPFEN wirkt auf den ganzen Zug (E3), EloKa wirkt global (E4),
// vier neue Schlüsselfälle S5–S8 (E5), drei ARGUS-Klassen (E6.2), Merkmale im Bild statt Sensordaten (E6.3).
// Engine = Simulation prüft tests/durchlauf.test.ts (fünf Teams), die Zugregel je Einschlag tests/regeln.test.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { faellig } from "../src/engine/ablauf";
import { verarbeiteAktion, warnungen } from "../src/engine/aktionen";
import { argusFalsch, sollBekaempfen } from "../src/kern/auswertung";
import { argusBei, bildalter, elokaAktiv, elokaStoerung } from "../src/kern/eloka";
import type { Absender, Ereignis } from "../src/kern/ereignisse";
import { dist, position, vorhanden } from "../src/kern/geometrie";
import { einschlaege, einschlag, pruefeWirkmittel, stehende, vorhersage, wirkungBeimEinschlag } from "../src/kern/regeln";
import { zeitlinie } from "../src/kern/verluste";
import { anwenden, zustandAus } from "../src/kern/zustand";
import { inhalte } from "./hilfen";

const ref = JSON.parse(readFileSync(new URL("./referenz_durchlauf.json", import.meta.url), "utf-8")) as {
  laeufe: { team: string; einspielen: Record<string, number>; faelle: Record<string, boolean>; verluste: { panzer: Record<string, { zustand: number; ausgefallen: boolean }>; zug: { bereit: number; eingeschraenkt: number; ausgefallen: number } } }[];
};

const SYS: Absender = { rolle: "system" };
let seq = 0;
const e = (typ: Ereignis["typ"], daten: unknown, t_s = 0) => ({ seq: ++seq, typ, ts: 1_000_000 + t_s * 1000, t_s, von: SYS, daten }) as Ereignis;
const START = () => {
  seq = 0;
  return [
    e("spiel_neu", { lauf: "20261101-1200-test", szenario: "kraehe-01", version: "2.4", titel: "x" }),
    e("uhr", { befehl: "start", laeuft: true, t_s: 0, tempo: 1 }),
  ];
};
const NEU = ["S5", "S6", "S7", "S8"];

describe("Szenario 2.4: Daten (E1, E2, E6)", () => {
  it("E1: das Menü „Verstärkung“ ist per Schalter in den Regeln aus", async () => {
    const inh = await inhalte();
    expect(["2.4", "2.5"]).toContain(inh.szenario.version); // 2.5 baut auf 2.4 auf (F)
    expect(inh.regeln.spielleitung?.verstaerkung_menue).toBe(false);
    // die Verstärkungen bleiben in den Daten (Schalter, kein Löschen)
    expect(inh.szenario.verstaerkungen?.gruppen.length).toBeGreaterThan(0);
  });

  it("E2: +30–50 % Fahrzeuge, vor allem im Hauptangriff und in der Krise; dichtere Meldungen", async () => {
    const inh = await inhalte();
    const sz = inh.szenario;
    // 2.3: 37 Ziele, 30 Meldungen
    expect(sz.ziele.length / 37).toBeGreaterThanOrEqual(1.3);
    expect(sz.ziele.length / 37).toBeLessThanOrEqual(1.5);
    expect(sz.meldungen).toHaveLength(36);
    // die neuen Fahrzeuge (Z-38–Z-49) gehören zu Meldungen ab dem Hauptangriff (Phase 4, ab 14:00)
    const erste = (id: string) => sz.meldungen.find((m) => m.ziele.includes(id))?.t_s;
    const neu = sz.ziele.filter((z) => Number(z.id.slice(2)) >= 38);
    expect(neu).toHaveLength(12);
    const gemeldet = neu.filter((z) => erste(z.id) !== undefined);
    expect(gemeldet.length).toBeGreaterThanOrEqual(10);
    for (const z of gemeldet) expect(erste(z.id)!, z.id).toBeGreaterThanOrEqual(840);
    // Hauptangriff und Krise (14:00–25:00) mit mehr Meldungen je Minute als die ersten 14 min
    const rate = (von: number, bis: number) => sz.meldungen.filter((m) => m.t_s >= von && m.t_s < bis).length / ((bis - von) / 60);
    expect(rate(840, 1500)).toBeGreaterThan(rate(0, 840));
    // höchstens 40 s zwischen zwei Meldungen im Hauptangriff
    const t = sz.meldungen.map((m) => m.t_s).filter((x) => x >= 840).sort((a, b) => a - b);
    expect(Math.max(...t.slice(1).map((x, i) => x - t[i]))).toBeLessThanOrEqual(45);
  });

  it("E6.2: ARGUS kennt nur Panzer, Fahrzeug, Infanterie (Katalog: Klasse je Typ, Zeichen je Klasse); S3 bleibt „Panzer · Feind 96 %“", async () => {
    const inh = await inhalte();
    expect(Object.keys(inh.klassen ?? {}).sort()).toEqual(["Fahrzeug", "Infanterie", "Panzer"]);
    for (const f of Object.values(inh.fahrzeuge)) if (f.argus_klasse) expect(Object.keys(inh.klassen!), f.id).toContain(f.argus_klasse);
    for (const m of inh.szenario.meldungen) {
      expect(["Panzer", "Fahrzeug", "Infanterie"], m.id).toContain(m.argus.klasse);
      expect(["Feind", "unbekannt"], m.id).toContain(m.argus.zugehoerigkeit);
    }
    expect(inh.meldungen.M20.argus).toMatchObject({ klasse: "Panzer", zugehoerigkeit: "Feind", konfidenz: 96, empfehlung: "BEKÄMPFEN" });
    expect(inh.fahrzeuge.kpz_pt91.argus_klasse).toBe("Panzer");
    expect(inh.fahrzeuge.san_rad.argus_klasse).toBe("Panzer"); // S2: ARGUS sieht einen Radpanzer, nicht das Rote Kreuz
    expect(inh.fahrzeuge.pkw_presse.argus_klasse).toBe("Fahrzeug");
  });

  it("E6.3: keine Sensordaten für die Spieler – die Merkmale stehen im Bild", async () => {
    const inh = await inhalte();
    for (const m of inh.szenario.meldungen) expect(m.sensor.hinweis, m.id).toMatch(/nur Spielleitung/);
    // jede Meldung eines Schlüsselfalls hat Merkmale, jedes an einem Ziel des Falls (geprüft im Bild: tools/assets/drohne_probe.py)
    for (const f of inh.szenario.schluesselfaelle) {
      const m = inh.meldungen[f.meldung];
      expect(m.bild.merkmale?.length, f.id).toBeGreaterThan(0);
      for (const mk of m.bild.merkmale ?? []) if (mk.ziel) expect([...m.ziele, ...f.ziele], `${f.id} ${mk.art}`).toContain(mk.ziel);
    }
    const arten = new Set(inh.szenario.meldungen.flatMap((m) => (m.bild.merkmale ?? []).map((x) => x.art)));
    for (const a of ["tarnung", "rotes_kreuz", "attrappe", "zivilpersonen", "press", "verwundete", "beobachter", "weisses_tuch", "mast"]) expect([...arten], a).toContain(a);
  });
});

describe("Szenario 2.4: BEKÄMPFEN wirkt auf den Zug (E3)", () => {
  it("LM: je stehendem Fahrzeug eine LM, nacheinander; reicht der Bestand nicht: „nur k von n“", async () => {
    const inh = await inhalte();
    const m = inh.meldungen.M07; // drei Fahrzeuge
    const t = m.t_s + 60;
    expect(stehende(inh, m.ziele, t)).toHaveLength(3);
    const v = vorhersage(inh, m, "LM", t, {}, 20);
    expect([v.n, v.k, v.teile.length]).toEqual([3, 3, 3]);
    expect(v.teile.map((x) => x.einschlag.ziel)).toEqual(m.ziele);
    // die i-te LM startet abstand_s · i nach der Freigabe (die Flugzeit hängt vom Ziel ab)
    const ab = inh.wirkmittel.LM.zug!.abstand_s!;
    for (let i = 0; i < 3; i++) expect(v.teile[i].einschlag).toEqual(einschlag(inh, [m.ziele[i]], "LM", t + ab * i));
    // Bestand 2: nur zwei Fahrzeuge bekämpft, Warnung an G2/G3
    const knapp = vorhersage(inh, m, "LM", t, {}, 2);
    expect([knapp.n, knapp.k, knapp.teile.length]).toEqual([3, 2, 2]);
    const z = { ...zustandAus(START(), inh) };
    const w = warnungen(inh, { ...z, bestand: { ...z.bestand, LM: 2 } }, "M07", "LM", t);
    expect(w).toContain("nur 2 von 3 Fahrzeugen – Bestand LM reicht nicht");
    // ein schon zerstörtes Fahrzeug bekommt keine LM
    const ohne = vorhersage(inh, m, "LM", t, { [m.ziele[0]]: t - 10 }, 20);
    expect([ohne.n, ohne.k]).toEqual([2, 2]);
    expect(ohne.teile.map((x) => x.einschlag.ziel)).toEqual(m.ziele.slice(1));
  });

  it("PzAbw: ein Schuss je Fahrzeug, nacheinander; Mörser: eine Fläche", async () => {
    const inh = await inhalte();
    const m = inh.meldungen.M15; // drei Fahrzeuge
    const t = m.t_s + 40;
    const pza = einschlaege(inh, m.ziele, "PZA", t);
    expect(pza.map((x) => x.ziel)).toEqual(stehende(inh, m.ziele, t).map((x) => x));
    expect(pza[1].t - pza[0].t).toBeCloseTo(inh.wirkmittel.PZA.zug!.abstand_s!, 0);
    const mrs = einschlaege(inh, m.ziele, "MRS", t);
    expect(mrs).toHaveLength(1);
    expect(inh.wirkmittel.MRS.zug?.art).toBe("flaeche");
    // der Bestand ist neu bemessen: genug LM für die Präzisionsziele eines Laufs, aber nicht unbegrenzt
    expect(inh.wirkmittel.LM.bestand).toBe(20);
  });

  it("Engine: Freigabe schreibt alle Einschläge, Bestand je Einschlag, die Wirkung kommt je Einschlag; erledigt mit dem letzten", async () => {
    const inh = await inhalte();
    const m = inh.meldungen.M07;
    let z = zustandAus([...START(), e("meldung", { meldung: "M07" }, m.t_s), e("g1_entscheid", { meldung: "M07", entscheid: "annehmen" }, m.t_s + 20),
      e("g2_empfehlung", { meldung: "M07", empfehlung: "bekaempfen", wirkmittel: "LM" }, m.t_s + 40)], inh);
    const t = m.t_s + 60;
    const r = verarbeiteAktion(inh, z, { id: "a1", typ: "g3_entscheid", von: { rolle: "g3", client: "c1" }, ts: 0, daten: { meldung: "M07", entscheid: "freigabe" } }, t);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = r.entwuerfe[0].daten as { einschlaege: { t: number; ziel: string }[]; einschlag: { t: number; ziel: string } };
    expect(d.einschlaege.map((x) => x.ziel)).toEqual(m.ziele);
    expect(d.einschlag.ziel).toBe(m.ziele[0]);
    z = anwenden(z, { seq: z.seq + 1, typ: "g3_entscheid", ts: 0, t_s: t, von: { rolle: "g3", client: "c1" }, daten: r.entwuerfe[0].daten } as Ereignis, inh);
    expect(z.bestand.LM).toBe(20 - 3);
    // Host-Takt bis nach dem letzten Einschlag
    const bis = d.einschlaege[2].t + 1;
    for (let i = 0; i < 200; i++) {
      const n = faellig(inh, z, bis)[0];
      if (!n) break;
      z = anwenden(z, { seq: z.seq + 1, typ: n.typ, ts: 0, t_s: n.t_geplant ?? bis, von: SYS, daten: n.daten } as Ereignis, inh);
    }
    expect(z.meldungen.M07.stufe).toBe("erledigt");
    expect(Object.keys(z.zerstoert).sort()).toEqual([...m.ziele].sort());
    expect(z.meldungen.M07.wirkung?.getroffen.filter((g) => g.was === "fahrzeug").map((g) => g.ziel).sort()).toEqual([...m.ziele].sort());
  });
});

describe("Szenario 2.4: EloKa wirkt global (E4)", () => {
  it("solange das EloKa-Fahrzeug steht: alle Bilder gestört, ARGUS unsicherer; zerstört: sofort wieder klar", async () => {
    const inh = await inhalte();
    const el = inh.szenario.eloka!;
    const z23 = inh.ziele[el.ziel];
    expect(elokaAktiv(inh, {}, 590)).toBe(false);
    expect(elokaAktiv(inh, {}, 700)).toBe(true);
    expect(elokaAktiv(inh, {}, z23.bis_s! + 1)).toBe(false); // fährt ab
    expect(elokaAktiv(inh, { [el.ziel]: 690 }, 700)).toBe(false);
    expect(elokaStoerung(inh, {}, 700)).toBe(el.bildstoerung);
    // M11 (92 % BEKÄMPFEN) zur EloKa-Zeit: 72 %, BEKÄMPFEN bleibt nur, wenn die Schwelle es hergibt
    const m11 = argusBei(inh, inh.meldungen.M11, true);
    expect(m11.konfidenz).toBe(inh.meldungen.M11.argus.konfidenz - el.konfidenz_minus);
    expect(m11.klasse).toBe("Panzer");
    expect(m11.empfehlung).toBe("PRÜFEN");
    expect(argusBei(inh, inh.meldungen.M11, false)).toEqual(inh.meldungen.M11.argus);
    expect(bildalter(inh, inh.meldungen.M11, true) - bildalter(inh, inh.meldungen.M11, false)).toBe(el.bildalter_plus_s);
    // eine Warnung NICHT BEKÄMPFEN bleibt auch gestört
    expect(argusBei(inh, inh.meldungen.M18, true).empfehlung).toBe("NICHT BEKÄMPFEN");
  });

  it("der Stand zur Meldezeit steht im Protokoll (gestoert); bekämpft vor der Meldung: ungestört", async () => {
    const inh = await inhalte();
    const t = inh.meldungen.M11.t_s;
    const z = zustandAus(START(), inh);
    const f = faellig(inh, z, t).find((x) => x.typ === "meldung" && (x.daten as { meldung: string }).meldung === "M11")!;
    expect(f.daten).toEqual({ meldung: "M11", gestoert: true });
    const g = faellig(inh, { ...z, zerstoert: { "Z-23": 700 } }, t).find((x) => x.typ === "meldung" && (x.daten as { meldung: string }).meldung === "M11");
    expect(g?.daten).toEqual({ meldung: "M11" });
  });

  it("E4.2 bewusst entschieden: EloKa liegt zwischen S1 und S2 – keine Meldung eines Falls ist gestört (ohne Bekämpfung)", async () => {
    const inh = await inhalte();
    const fallMeldungen = inh.szenario.meldungen.filter((m) => m.fall);
    for (const m of fallMeldungen) expect(elokaAktiv(inh, {}, m.t_s), `${m.id} (${m.fall})`).toBe(false);
    const gestoert = inh.szenario.meldungen.filter((m) => elokaAktiv(inh, {}, m.t_s)).map((m) => m.id);
    expect(gestoert).toEqual(["M09", "M25", "M10", "M11"]);
    // die eigene Meldung des EloKa-Fahrzeugs: gestört „unbekannt“, UNKLAR
    expect(argusBei(inh, inh.meldungen.M25, true)).toMatchObject({ klasse: "unbekannt", zugehoerigkeit: "unbekannt", empfehlung: "UNKLAR" });
  });
});

describe("Szenario 2.4: neue Schlüsselfälle S5–S8 (E5)", () => {
  it("jeder Fall mit Ground Truth, ARGUS-Ausgabe, Lösung, Rechtsbezug, Leitfragen und Bildmerkmalen; zuschaltbar im Replay", async () => {
    const inh = await inhalte();
    for (const id of NEU) {
      const f = inh.szenario.schluesselfaelle.find((x) => x.id === id)!;
      expect(f.zuschaltbar, id).toBe(true);
      expect(f.kern.length, id).toBeGreaterThan(40);
      expect(f.gut.length, id).toBeGreaterThan(10);
      expect(f.leitfragen.length, id).toBeGreaterThanOrEqual(2);
      expect(f.bezuege.length, id).toBeGreaterThanOrEqual(1);
      const m = inh.meldungen[f.meldung];
      expect(m.fall).toBe(id);
      expect(Object.keys(m.loesung ?? {}), id).toEqual(expect.arrayContaining(["G1", "G2", "G3"]));
      expect(m.bild.merkmale?.length, id).toBeGreaterThan(0);
      for (const zid of f.ziele) expect(inh.ziele[zid].gt.text.length, `${id} ${zid}`).toBeGreaterThan(20);
    }
    expect(inh.szenario.auswertung.replay).toMatchObject({ standard: ["S3", "S2", "S1", "S4"], zuschaltbar: NEU, budget_s: 720 });
    // ARGUS: in S6 und S8 (Presse) falsch, in S5 und S7 liegt es richtig – die Frage ist dort das Wann und das Wie
    expect(argusFalsch(inh, inh.meldungen.M35)).toBe(true);
    expect(argusFalsch(inh, inh.meldungen.M33)).toBe(true);
    expect(argusFalsch(inh, inh.meldungen.M32)).toBe(false);
    expect(argusFalsch(inh, inh.meldungen.M31)).toBe(false);
    expect(sollBekaempfen(inh.meldungen.M32)).toBe(false); // erst, wenn die Bewohner weg sind (M36)
    expect(sollBekaempfen(inh.meldungen.M36)).toBe(true);
  });

  it("die Spitze hat mehr Sonderfälle als die Routine; die Simulation erreicht alle alten und neuen Fälle (naiv und ideal)", async () => {
    const inh = await inhalte();
    const phasen = inh.szenario.phasen;
    const routine = phasen.filter((p) => p.bis_s <= 840).map((p) => p.nr);
    const fallIn = (ids: unknown[]) => inh.szenario.meldungen.filter((m) => m.fall && ids.includes(m.phase)).length;
    const spitze = phasen.filter((p) => p.von_s >= 840).map((p) => p.nr);
    expect(fallIn(spitze)).toBeGreaterThan(2 * fallIn(routine));
    for (const l of ref.laeufe.filter((x) => Object.keys(x.einspielen ?? {}).length === 0)) {
      expect(Object.entries(l.faelle).filter(([, ok]) => !ok).map(([f]) => f), l.team).toEqual([]);
      expect(Object.keys(l.faelle).sort(), l.team).toEqual(["N1", "N2", "N3", "N4", "S1", "S2", "S3", "S4", ...NEU].sort());
    }
  });

  it("S5 Schutzschilde: LM auf den SPz trifft die Bewohner, solange sie davorstehen; Rückmeldung I-14 an G3", async () => {
    const inh = await inhalte();
    const z41 = inh.ziele["Z-41"];
    const frueh = wirkungBeimEinschlag(inh, { t: 1000, pos: position(z41, 1000), ziel: "Z-41" }, "LM");
    expect(frueh.getroffen.some((g) => g.was === "personen" && g.kategorie === "zivil")).toBe(true);
    const spaet = wirkungBeimEinschlag(inh, { t: 1240, pos: position(z41, 1240), ziel: "Z-41" }, "LM");
    expect(spaet.getroffen.some((g) => g.was === "personen")).toBe(false);
    expect(spaet.getroffen.map((g) => g.ziel)).toEqual(["Z-41"]);
    expect(inh.szenario.injects.find((i) => i.id === "I-14")?.bedingung).toMatchObject({ typ: "freigabe_mit_zivil", ziele: ["Z-41"] });
  });

  it("S6 Verwundete: erscheinen am Wrack ihres SPz, sind außer Gefecht; ARGUS meldet Infanterie 92 % BEKÄMPFEN", async () => {
    const inh = await inhalte();
    const z45 = inh.ziele["Z-45"];
    expect(z45.gt.kategorie).toBe("ausser_gefecht");
    expect(z45.herkunft).toBe("Z-34");
    expect(dist(z45.pos, position(inh.ziele["Z-34"], inh.meldungen.M35.t_s))).toBeLessThanOrEqual(25);
    expect(inh.meldungen.M35.argus).toMatchObject({ klasse: "Infanterie", konfidenz: 92, empfehlung: "BEKÄMPFEN" });
    expect(inh.fahrzeuge[z45.typ].feuer_effekt).toBe("keiner");
  });

  it("S7 Kirchturm: legitimes Ziel im Kulturgut – Mörser verstößt (Ortschaft), LM nicht; gelenktes Feuer auf 1/2, bis er bekämpft ist", async () => {
    const inh = await inhalte();
    const z42 = inh.ziele["Z-42"];
    expect(z42.im_gebaeude).toBe("kirchturm");
    expect(vorhanden(z42, 800)).toBe(false); // steigt erst um 14:00 auf (kein Zufallstreffer durch einen frühen Mörser)
    const t = inh.meldungen.M31.t_s + 60;
    expect(pruefeWirkmittel(inh, z42.pos, "MRS", t).verstoesse.map((v) => v.regel)).toContain("R3");
    expect(pruefeWirkmittel(inh, z42.pos, "LM", t).verstoesse).toEqual([]);
    expect(inh.meldungen.M31.loesung?.wirkmittel).toEqual(["LM"]);
    const ohne = zeitlinie(inh, {}, null, []).filter((x) => x.quelle === "Z-42");
    expect(ohne.length).toBeGreaterThan(10);
    // seit 2.5 (F2.8): Beobachter Kirchturm → 1/2; ist 1/2 schon ausgefallen (ohne jede Bekämpfung: Mörser Z-06 um 10:10), auf den nächsten
    expect(zeitlinie(inh, { "Z-06": 400 }, null, []).filter((x) => x.quelle === "Z-42")[0].panzer).toBe("pz2");
    expect(ohne[0].panzer).not.toBe("pz2");
    expect(new Set(ohne.map((x) => x.art))).toEqual(new Set(["beobachter"]));
    const mit = zeitlinie(inh, { "Z-42": 1000 }, null, []).filter((x) => x.quelle === "Z-42");
    expect(mit.length).toBeLessThan(ohne.length / 3);
    expect(Math.max(...mit.map((x) => x.t))).toBeLessThanOrEqual(1000 + inh.regeln.verluste!.verzug_s.beobachter!);
  });

  it("S5 und S7 kosten Verluste, solange sie stehen (E2.4)", async () => {
    const inh = await inhalte();
    const alle = zeitlinie(inh, {}, null, []);
    for (const id of ["Z-41", "Z-42"]) {
      const ev = alle.filter((x) => x.quelle === id);
      expect(ev.length, id).toBeGreaterThan(5);
      // durchgehend: keine Lücke über 60 s zwischen erstem und letztem Schaden
      const t = ev.map((x) => x.t).sort((a, b) => a - b);
      expect(Math.max(...t.slice(1).map((x, i) => x - t[i])), id).toBeLessThanOrEqual(60);
      expect(t[t.length - 1], id).toBeGreaterThan(1400);
    }
    // bekämpft um 16:40: weniger Schaden an 1/1 (S5) und 1/2 (S7)
    const frueh = zeitlinie(inh, { "Z-41": 1000, "Z-42": 1000 }, null, []);
    const summe = (ev: typeof alle) => ev.filter((x) => x.quelle === "Z-41" || x.quelle === "Z-42").reduce((a, x) => a + x.schaden, 0);
    expect(summe(frueh)).toBeLessThan(summe(alle) / 5);
  });

  it("S8 Presse und Familie: das Pressefahrzeug ist zivil, die Familie im Pkw wird nie gemeldet; Treffer bringen I-15 / I-16", async () => {
    const inh = await inhalte();
    expect(inh.ziele["Z-43"].gt.kategorie).toBe("zivil");
    expect(inh.ziele["Z-44"].gt.kategorie).toBe("zivil");
    expect(inh.ziele["Z-44"].nur_kontakt).toBeTruthy();
    expect(inh.szenario.meldungen.some((m) => m.ziele.includes("Z-44"))).toBe(false);
    expect(inh.ziele["Z-44"].personen?.every((p) => p.im_fahrzeug)).toBe(true);
    expect(inh.meldungen.M33.argus).toMatchObject({ klasse: "Fahrzeug", empfehlung: "BEKÄMPFEN" });
    expect(inh.meldungen.M34.loesung?.wirkmittel).toEqual(["LM"]); // Mörser träfe die Presse daneben
    // Mörser auf die Kolonne trifft die Presse
    const k = inh.meldungen.M34;
    const mrs = wirkungBeimEinschlag(inh, einschlaege(inh, k.ziele, "MRS", k.t_s + 60)[0], "MRS");
    expect(mrs.getroffen.some((g) => g.ziel === "Z-43")).toBe(true);
    // Treffer auf das Pressefahrzeug → I-15 nach der Verzögerung
    const i15 = inh.szenario.injects.find((i) => i.id === "I-15")!;
    expect(i15.bedingung).toMatchObject({ typ: "treffer", ziele: ["Z-43"] });
    const z = zustandAus([...START(), e("meldung", { meldung: "M33" }, 1125), e("wirkung", {
      meldung: "M33", wirkmittel: "MRS", pos: inh.ziele["Z-43"].pos, t_freigabe: 1260, t_einschlag: 1300, ziel: "Z-43",
      getroffen: [{ ziel: "Z-43", was: "fahrzeug", kategorie: "zivil" }],
    }, 1300)], inh);
    const v = (i15.bedingung as { verzoegerung_s?: number }).verzoegerung_s ?? 0;
    expect(faellig(inh, z, 1300 + v - 1).some((x) => x.typ === "inject" && (x.daten as { inject: string }).inject === "I-15")).toBe(false);
    expect(faellig(inh, z, 1300 + v).some((x) => x.typ === "inject" && (x.daten as { inject: string }).inject === "I-15")).toBe(true);
  });
});

describe("Kalibrierung (seit 2.5 je Panzer, F2.9; vorher E2.3)", () => {
  it("ideal endet spürbar schlechter als naiv (ideal ≥ 1 Panzer ausgefallen, naiv keiner), die Untergrenze hält in allen Läufen", () => {
    const naiv = ref.laeufe[0];
    const ideal = ref.laeufe[1];
    expect([naiv.team, ideal.team]).toEqual(["naiv", "ideal"]);
    expect(naiv.verluste.zug.ausgefallen).toBe(0);
    expect(ideal.verluste.zug.ausgefallen).toBeGreaterThanOrEqual(1);
    expect(ideal.verluste.zug.ausgefallen * 10 + ideal.verluste.zug.eingeschraenkt).toBeGreaterThan(naiv.verluste.zug.ausgefallen * 10 + naiv.verluste.zug.eingeschraenkt);
    for (const l of ref.laeufe) {
      expect(l.verluste.zug.ausgefallen, l.team).toBeLessThanOrEqual(2);
      for (const [pz, s] of Object.entries(l.verluste.panzer)) if (!s.ausgefallen) expect(s.zustand, `${l.team} ${pz}`).toBeGreaterThanOrEqual(40);
    }
  });
});
