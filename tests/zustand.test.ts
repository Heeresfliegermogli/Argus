import { describe, expect, it } from "vitest";
import { faellig } from "../src/engine/ablauf";
import { verarbeiteAktion } from "../src/engine/aktionen";
import { pruefeInhalte } from "../src/inhalte/pruefen";
import type { Absender, Aktion, Ereignis } from "../src/kern/ereignisse";
import { warteschlange, zielmeldung } from "../src/kern/sichten";
import { spielzeit, uhrzeit } from "../src/kern/uhr";
import { ProtokollLuecke, anfangsZustand, anwenden, fingerabdruck, zustandAus } from "../src/kern/zustand";
import { inhalte } from "./hilfen";

const SYS: Absender = { rolle: "system" };
let seq = 0;
const e = (typ: Ereignis["typ"], daten: unknown, t_s = 0, extra: Partial<Ereignis> = {}) =>
  ({ seq: ++seq, typ, ts: 1_000_000 + t_s * 1000, t_s, von: SYS, daten, ...extra }) as Ereignis;

describe("Inhalte", () => {
  it("Szenario KRÄHE-01 ist konsistent", async () => {
    const inh = await inhalte();
    const b = pruefeInhalte(inh);
    expect(b.fehler).toEqual([]);
    expect(inh.szenario.meldungen).toHaveLength(27);
    expect(Object.keys(inh.ziele)).toHaveLength(36);
  });
});

describe("Spielstand aus dem Protokoll", () => {
  it("Kette G1 → G2 → G3 → Wirkung, Bestand und Zerstörung", async () => {
    const inh = await inhalte();
    seq = 0;
    const p: Ereignis[] = [
      e("spiel_neu", { lauf: "20261125-0930-test", szenario: "kraehe-01", version: "1.3", titel: "x" }),
      e("uhr", { befehl: "start", laeuft: true, t_s: 0, tempo: 1 }),
      e("meldung", { meldung: "M01" }, 60),
      e("g1_entscheid", { meldung: "M01", entscheid: "annehmen", vermerk: "heiß, fährt" }, 75, { aktion: "a1" }),
      e("g2_empfehlung", { meldung: "M01", empfehlung: "bekaempfen", wirkmittel: "LM" }, 90, { aktion: "a2" }),
      e("g3_entscheid", { meldung: "M01", entscheid: "freigabe", wirkmittel: "LM" }, 100, { aktion: "a3" }),
      e("wirkung", { meldung: "M01", wirkmittel: "LM", pos: [960, 215], t_freigabe: 100, getroffen: [{ ziel: "Z-01", was: "fahrzeug", kategorie: "feind" }] }, 220),
    ];
    const z = zustandAus(p, inh);
    expect(z.meldungen.M01.stufe).toBe("erledigt");
    expect(z.meldungen.M01.ergebnis).toBe("bekaempft");
    expect(z.bestand.LM).toBe(10);
    expect(z.zerstoert["Z-01"]).toBe(220);
    expect(z.aktionen).toEqual({ a1: 4, a2: 5, a3: 6 });
    expect(z.meldungen.M01.verlauf).toEqual([3, 4, 5, 6, 7]);
    expect(zielmeldung(inh, z, "M01").vermerkG1).toBe("heiß, fährt");
    expect(fingerabdruck(z)).toBe(fingerabdruck(zustandAus(p, inh)));
  });

  it("Lücke im Protokoll wird erkannt", async () => {
    const inh = await inhalte();
    seq = 0;
    const z = anwenden(anfangsZustand(inh), e("spiel_neu", { lauf: "l", szenario: "s", version: "v", titel: "t" }), inh);
    seq = 5;
    expect(() => anwenden(z, e("notiz", { text: "x" }), inh)).toThrow(ProtokollLuecke);
  });

  it("BEOBACHTEN hält die Meldung bei G2, zurückgestellte stehen hinten", async () => {
    const inh = await inhalte();
    seq = 0;
    const z = zustandAus([
      e("spiel_neu", { lauf: "l", szenario: "s", version: "v", titel: "t" }),
      e("meldung", { meldung: "M15" }, 990),
      e("meldung", { meldung: "M16" }, 1095),
      e("meldung", { meldung: "M17" }, 1140),
      e("g1_entscheid", { meldung: "M16", entscheid: "annehmen" }, 1100),
      e("g1_entscheid", { meldung: "M17", entscheid: "annehmen" }, 1145),
      e("g2_empfehlung", { meldung: "M16", empfehlung: "beobachten" }, 1150),
    ], inh);
    expect(warteschlange(z, "g2").map((m) => m.id)).toEqual(["M17", "M16"]);
    expect(warteschlange(z, "g1").map((m) => m.id)).toEqual(["M15"]);
  });

  it("Spieluhr rechnet aus dem Uhrstand", () => {
    const uhr = { laeuft: true, t_s: 100, ts: 50_000, tempo: 2 };
    expect(spielzeit(uhr, 60_000)).toBe(120);
    expect(spielzeit({ ...uhr, laeuft: false }, 60_000)).toBe(100);
    expect(uhrzeit("10:00:00", 1245)).toBe("10:20:45");
  });
});

describe("Zeitplan und Aktionen", () => {
  it("Fast-Track schickt M20 (96 %) an G1 vorbei, M19 (89 %) nicht", async () => {
    const inh = await inhalte();
    seq = 0;
    const z = zustandAus([
      e("spiel_neu", { lauf: "l", szenario: "s", version: "v", titel: "t" }),
      e("fast_track", { an: true }, 870),
    ], inh);
    const f = faellig(inh, z, 1216).filter((x) => x.typ === "meldung");
    const m19 = f.find((x) => x.typ === "meldung" && x.daten.meldung === "M19")!;
    const m20 = f.find((x) => x.typ === "meldung" && x.daten.meldung === "M20")!;
    expect(m19.daten).toEqual({ meldung: "M19" });
    expect(m20.daten).toEqual({ meldung: "M20", fast_track: true });
  });

  it("I-08b kommt nur ohne Freigabe auf die PT-91, I-08a nach Freigabe +60 s", async () => {
    const inh = await inhalte();
    seq = 0;
    const basis = [
      e("spiel_neu", { lauf: "l", szenario: "s", version: "v", titel: "t" }),
      e("meldung", { meldung: "M20" }, 1215),
      e("g1_entscheid", { meldung: "M20", entscheid: "annehmen" }, 1230),
      e("g2_empfehlung", { meldung: "M20", empfehlung: "bekaempfen", wirkmittel: "PZA" }, 1240),
    ];
    const ohne = zustandAus(basis, inh);
    const injectsOhne = faellig(inh, ohne, 1490).filter((x) => x.typ === "inject").map((x) => (x.daten as { inject: string }).inject);
    expect(injectsOhne).toContain("I-08b");
    expect(injectsOhne).not.toContain("I-08a");

    const mit = zustandAus([...basis, e("g3_entscheid", { meldung: "M20", entscheid: "freigabe", wirkmittel: "PZA" }, 1250)], inh);
    const injectsMit = faellig(inh, mit, 1311).filter((x) => x.typ === "inject").map((x) => (x.daten as { inject: string }).inject);
    expect(injectsMit).toContain("I-08a");
    expect(faellig(inh, mit, 1490).some((x) => x.typ === "inject" && x.daten.inject === "I-08b")).toBe(false);
  });

  it("I-09 nur, wenn die Freigabe auf den Mörser im Hof RABE Zivilpersonen trifft", async () => {
    const inh = await inhalte();
    // M18 um 10:18:15: Zivilpersonen keine 10 m neben dem Mörser, auch LM trifft sie. Ab 10:21:40 fliehen sie nach
    // Westen; Freigabe der Folgemeldung M23 um 10:22:00: gut 50 m weg, LM trifft sie nicht mehr, der Mörser (80 m) schon.
    const faelle = [["M18", 1095, "LM", true], ["M18", 1095, "MRS", true], ["M23", 1305, "LM", false], ["M23", 1305, "MRS", true]] as const;
    for (const [mid, t, wm, erwartet] of faelle) {
      seq = 0;
      const z = zustandAus([
        e("spiel_neu", { lauf: "l", szenario: "s", version: "v", titel: "t" }),
        e("meldung", { meldung: mid }, t),
        e("g1_entscheid", { meldung: mid, entscheid: "annehmen" }, t + 5),
        e("g2_empfehlung", { meldung: mid, empfehlung: "bekaempfen", wirkmittel: wm }, t + 10),
        e("g3_entscheid", { meldung: mid, entscheid: "freigabe", wirkmittel: wm }, t + 15),
      ], inh);
      const i09 = faellig(inh, z, t + 76).some((x) => x.typ === "inject" && x.daten.inject === "I-09");
      expect(i09, `${mid} ${wm}`).toBe(erwartet);
    }
  });

  it("Aktionen werden nach Rolle und Stufe geprüft, Warnungen kommen vom Host", async () => {
    const inh = await inhalte();
    seq = 0;
    const z = zustandAus([
      e("spiel_neu", { lauf: "l", szenario: "s", version: "v", titel: "t" }),
      e("meldung", { meldung: "M12" }, 795),
      e("g1_entscheid", { meldung: "M12", entscheid: "annehmen" }, 800),
    ], inh);
    const von = (rolle: Absender["rolle"]): Absender => ({ rolle, client: "c" });
    const a = (typ: Aktion["typ"], daten: unknown, rolle: Absender["rolle"]) => ({ id: "x", typ, von: von(rolle), ts: 0, daten }) as Aktion;
    expect(verarbeiteAktion(inh, z, a("g1_entscheid", { meldung: "M12", entscheid: "annehmen" }, "g1"), 801))
      .toEqual({ ok: false, grund: "Meldung M12 ist nicht (mehr) bei G1" });
    expect(verarbeiteAktion(inh, z, a("g2_empfehlung", { meldung: "M12", empfehlung: "bekaempfen", wirkmittel: "LM" }, "g3"), 801).ok).toBe(false);
    const mrs = verarbeiteAktion(inh, z, a("g2_empfehlung", { meldung: "M12", empfehlung: "bekaempfen", wirkmittel: "MRS" }, "g2"), 801);
    expect(mrs.ok && mrs.entwuerfe[0].typ === "g2_empfehlung" && mrs.entwuerfe[0].daten.warnungen?.some((w) => w.startsWith("R2"))).toBe(true);
    const lm = verarbeiteAktion(inh, z, a("g2_empfehlung", { meldung: "M12", empfehlung: "bekaempfen", wirkmittel: "LM" }, "g2"), 801);
    expect(lm.ok && lm.entwuerfe[0].typ === "g2_empfehlung" && lm.entwuerfe[0].daten.warnungen).toEqual([]);
  });
});
