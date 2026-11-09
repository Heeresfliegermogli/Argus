import { describe, expect, it } from "vitest";
import { faellig } from "../src/engine/ablauf";
import { verarbeiteAktion } from "../src/engine/aktionen";
import { pruefeInhalte } from "../src/inhalte/pruefen";
import type { Absender, Aktion, Ereignis } from "../src/kern/ereignisse";
import { warteschlange, zielNummer } from "../src/kern/sichten";
import { spieluhrImText, spielzeit, uhrzeit } from "../src/kern/uhr";
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
    expect(inh.szenario.meldungen).toHaveLength(36); // seit 2.4: M31–M36 (E5)
    expect(Object.keys(inh.ziele)).toHaveLength(49); // seit 2.4: Z-38–Z-49 (E2, E5)
  });
});

describe("Spielstand aus dem Protokoll", () => {
  it("eine Entscheidung je Meldung (2.6): BEKÄMPFEN → Wirkung, Bestand, Zerstörung, Sekunden ab Eingang und ab Öffnen", async () => {
    const inh = await inhalte();
    seq = 0;
    const p: Ereignis[] = [
      e("spiel_neu", { lauf: "20261125-0930-test", szenario: "kraehe-01", version: "2.6", titel: "x" }),
      e("uhr", { befehl: "start", laeuft: true, t_s: 0, tempo: 1 }),
      e("meldung", { meldung: "M01" }, 60),
      e("entscheid", { meldung: "M01", entscheid: "bekaempfen", wirkmittel: "LM", warnungen: [], t_offen: 70, sek_eingang: 40, sek_offen: 30 }, 100, { aktion: "a1" }),
      e("wirkung", { meldung: "M01", wirkmittel: "LM", pos: [960, 215], t_freigabe: 100, getroffen: [{ ziel: "Z-01", was: "fahrzeug", kategorie: "feind" }] }, 220),
    ];
    const z = zustandAus(p, inh);
    expect(z.meldungen.M01.stufe).toBe("erledigt");
    expect(z.meldungen.M01.ergebnis).toBe("bekaempft");
    expect(z.meldungen.M01.freigabe?.wirkmittel).toBe("LM");
    expect(z.meldungen.M01.entscheid).toMatchObject({ entscheid: "bekaempfen", t_offen: 70, sek_eingang: 40, sek_offen: 30, t_s: 100 });
    expect(z.bestand.LM).toBe(inh.wirkmittel.LM.bestand! - 1); // ein Einschlag im Protokoll (ohne einschlaege): eine LM
    expect(z.zerstoert["Z-01"]).toBe(220);
    expect(z.aktionen).toEqual({ a1: 4 });
    expect(z.meldungen.M01.verlauf).toEqual([3, 4, 5]);
    expect(zielNummer(inh, inh.meldungen.M01)).toContain("1");
    expect(fingerabdruck(z)).toBe(fingerabdruck(zustandAus(p, inh)));
  });

  it("ABLEHNEN schließt ab, ZURÜCKSTELLEN bleibt offen und steht hinten im Eingang", async () => {
    const inh = await inhalte();
    seq = 0;
    const z = zustandAus([
      e("spiel_neu", { lauf: "l", szenario: "s", version: "v", titel: "t" }),
      e("meldung", { meldung: "M15" }, 960),
      e("meldung", { meldung: "M16" }, 1020),
      e("meldung", { meldung: "M17" }, 1055),
      e("entscheid", { meldung: "M15", entscheid: "ablehnen", sek_eingang: 70 }, 1030),
      e("entscheid", { meldung: "M16", entscheid: "zurueckstellen", sek_eingang: 40 }, 1060),
    ], inh);
    expect(z.meldungen.M15.stufe).toBe("erledigt");
    expect(z.meldungen.M15.ergebnis).toBe("abgelehnt");
    expect(z.meldungen.M16.stufe).toBe("offen");
    expect(z.meldungen.M16.zurueckgestellt).toBe(true);
    expect(warteschlange(z).map((m) => m.id)).toEqual(["M17", "M16"]);
  });

  it("Zug-Bekämpfung (2.4, E3): eine LM je Einschlag, die Wirkung steht fest, wenn alle Einschläge da sind", async () => {
    const inh = await inhalte();
    seq = 0;
    const p: Ereignis[] = [
      e("spiel_neu", { lauf: "20261125-0930-test", szenario: "kraehe-01", version: "2.4", titel: "x" }),
      e("meldung", { meldung: "M01" }, 20),
      e("entscheid", {
        meldung: "M01", entscheid: "bekaempfen", wirkmittel: "LM", warnungen: [], einschlag: { t: 140, pos: [900, 380], ziel: "Z-01" },
        einschlaege: [{ t: 140, x: 900, y: 380, ziel: "Z-01" }, { t: 143, x: 880, y: 390, ziel: "Z-02" }],
      }, 100, { aktion: "a3" }),
      e("wirkung", { meldung: "M01", wirkmittel: "LM", pos: [900, 380], t_freigabe: 100, t_einschlag: 140, ziel: "Z-01", nr: 0, anzahl: 2, getroffen: [{ ziel: "Z-01", was: "fahrzeug", kategorie: "feind" }] }, 140),
    ];
    const halb = zustandAus(p, inh);
    expect(halb.bestand.LM).toBe(inh.wirkmittel.LM.bestand! - 2);
    expect(halb.meldungen.M01.stufe).toBe("wirkung");
    expect(halb.meldungen.M01.wirkung).toBeUndefined();
    expect(halb.zerstoert).toEqual({ "Z-01": 140 });
    const z = zustandAus([...p, e("wirkung", {
      meldung: "M01", wirkmittel: "LM", pos: [880, 390], t_freigabe: 100, t_einschlag: 143, ziel: "Z-02", nr: 1, anzahl: 2,
      getroffen: [{ ziel: "Z-02", was: "fahrzeug", kategorie: "feind" }],
    }, 143)], inh);
    expect(z.meldungen.M01.stufe).toBe("erledigt");
    expect(z.meldungen.M01.wirkung?.getroffen.map((g) => g.ziel)).toEqual(["Z-01", "Z-02"]);
    expect(z.meldungen.M01.wirkung?.t_einschlag).toBe(140);
    expect(z.zerstoert).toEqual({ "Z-01": 140, "Z-02": 143 });
  });

  it("Lücke im Protokoll wird erkannt", async () => {
    const inh = await inhalte();
    seq = 0;
    const z = anwenden(anfangsZustand(inh), e("spiel_neu", { lauf: "l", szenario: "s", version: "v", titel: "t" }), inh);
    seq = 5;
    expect(() => anwenden(z, e("notiz", { text: "x" }), inh)).toThrow(ProtokollLuecke);
  });

  it("Startsignal mit Verzug (H1.4): die Uhr läuft ab der Serverzeit des Klicks (ab_ts)", async () => {
    const inh = await inhalte();
    seq = 0;
    const z = zustandAus([
      e("spiel_neu", { lauf: "l", szenario: "s", version: "v", titel: "t" }),
      e("uhr", { befehl: "start", laeuft: true, t_s: 0, tempo: 1, ab_ts: 985_000 }, 0),
    ], inh);
    // Ereignis geschrieben bei ts 1_000_000, Klick der Spielleitung 15 s früher: Die Uhr steht schon bei 15 s
    expect(z.uhr.ts).toBe(985_000);
    expect(spielzeit(z.uhr, 1_000_000)).toBe(15);
  });

  it("Spieluhr rechnet aus dem Uhrstand", () => {
    const uhr = { laeuft: true, t_s: 100, ts: 50_000, tempo: 2 };
    expect(spielzeit(uhr, 60_000)).toBe(120);
    expect(spielzeit({ ...uhr, laeuft: false }, 60_000)).toBe(100);
    // Spieluhr 00:00–25:00 (B4)
    expect(uhrzeit("10:00:00", 1245)).toBe("20:45");
    expect(uhrzeit("10:00:00", 1500)).toBe("25:00");
    expect(spieluhrImText("um 10:17:00 und bis 10:25, nicht 11:40 oder 8:58", "10:00:00", 1500)).toBe("um 17:00 und bis 25:00, nicht 11:40 oder 8:58");
    expect(spieluhrImText("keine seit Erstsichtung 09:52", "10:00:00", 1500)).toBe("keine seit Erstsichtung −08:00");
  });
});

describe("Zeitplan und Aktionen", () => {
  it("I-08b kommt nur ohne Freigabe auf die PT-91, I-08a nach Freigabe +60 s", async () => {
    const inh = await inhalte();
    seq = 0;
    const basis = [
      e("spiel_neu", { lauf: "l", szenario: "s", version: "v", titel: "t" }),
      e("meldung", { meldung: "M20" }, 1215),
    ];
    const ohne = zustandAus(basis, inh);
    const injectsOhne = faellig(inh, ohne, 1490).filter((x) => x.typ === "inject").map((x) => (x.daten as { inject: string }).inject);
    expect(injectsOhne).toContain("I-08b");
    expect(injectsOhne).not.toContain("I-08a");

    const mit = zustandAus([...basis, e("entscheid", { meldung: "M20", entscheid: "bekaempfen", wirkmittel: "PZA", warnungen: [] }, 1250)], inh);
    const injectsMit = faellig(inh, mit, 1311).filter((x) => x.typ === "inject").map((x) => (x.daten as { inject: string }).inject);
    expect(injectsMit).toContain("I-08a");
    expect(faellig(inh, mit, 1490).some((x) => x.typ === "inject" && x.daten.inject === "I-08b")).toBe(false);
  });

  it("I-09 nur, wenn die Wirkung auf den Mörser im Hof RABE beim Einschlag Zivilpersonen trifft", async () => {
    const inh = await inhalte();
    // M18 um 10:18:15: Zivilpersonen keine 10 m neben dem Mörser, auch LM trifft sie. Ab 10:21:40 fliehen sie nach
    // Westen; Freigabe der Folgemeldung M23 um 10:22:00: beim Einschlag (10:22:35 bzw. 10:22:41) sind sie gut 81 m weg,
    // weder LM noch Mörser (80 m) trifft sie (bis Szenario 1.3 zählte die Lage bei der Freigabe, da traf der Mörser noch).
    const faelle = [["M18", 1095, "LM", true], ["M18", 1095, "MRS", true], ["M23", 1305, "LM", false], ["M23", 1305, "MRS", false]] as const;
    for (const [mid, t, wm, erwartet] of faelle) {
      seq = 0;
      let z = zustandAus([
        e("spiel_neu", { lauf: "l", szenario: "s", version: "v", titel: "t" }),
        e("meldung", { meldung: mid }, t),
        e("entscheid", { meldung: mid, entscheid: "bekaempfen", wirkmittel: wm, warnungen: [] }, t + 15),
      ], inh);
      // Zeitplan bis 60 s nach der Freigabe abarbeiten wie der Host (Einschlag zuerst, dann der bedingte Inject)
      for (let i = 0; i < 200; i++) {
        const n = faellig(inh, z, t + 76).find((x) => x.typ === "wirkung" || x.typ === "inject");
        if (!n) break;
        z = anwenden(z, { seq: z.seq + 1, typ: n.typ, ts: 0, t_s: n.t_geplant ?? t + 76, von: SYS, daten: n.daten } as Ereignis, inh);
      }
      expect(z.meldungen[mid].wirkung, `${mid} ${wm} Einschlag`).toBeDefined();
      expect(!!z.injects["I-09"], `${mid} ${wm}`).toBe(erwartet);
    }
  });

  it("Aktionen werden nach Rolle geprüft, Warnungen und Sekunden kommen vom Host (H2.4)", async () => {
    const inh = await inhalte();
    seq = 0;
    const z = zustandAus([
      e("spiel_neu", { lauf: "l", szenario: "s", version: "v", titel: "t" }),
      e("meldung", { meldung: "M12" }, 795),
    ], inh);
    const von = (rolle: Absender["rolle"]): Absender => ({ rolle, client: "c" });
    const a = (typ: Aktion["typ"], daten: unknown, rolle: Absender["rolle"]) => ({ id: "x", typ, von: von(rolle), ts: 0, daten }) as Aktion;
    // nur die Zielbearbeitung entscheidet
    expect(verarbeiteAktion(inh, z, a("entscheid", { meldung: "M12", entscheid: "ablehnen" }, "sl"), 801).ok).toBe(false);
    expect(verarbeiteAktion(inh, z, a("entscheid", { meldung: "M12", entscheid: "bekaempfen" }, "zb"), 801)).toEqual({ ok: false, grund: "Wirkmittel fehlt" });
    const mrs = verarbeiteAktion(inh, z, a("entscheid", { meldung: "M12", entscheid: "bekaempfen", wirkmittel: "MRS", t_offen: 798 }, "zb"), 801);
    expect(mrs.ok && mrs.entwuerfe[0].typ === "entscheid" && mrs.entwuerfe[0].daten.warnungen?.some((w) => w.startsWith("R2"))).toBe(true);
    expect(mrs.ok && mrs.entwuerfe[0].typ === "entscheid" && mrs.entwuerfe[0].daten).toMatchObject({ sek_eingang: 6, sek_offen: 3, t_offen: 798 });
    const lm = verarbeiteAktion(inh, z, a("entscheid", { meldung: "M12", entscheid: "bekaempfen", wirkmittel: "LM" }, "zb"), 801);
    expect(lm.ok && lm.entwuerfe[0].typ === "entscheid" && lm.entwuerfe[0].daten.warnungen).toEqual([]);
    // Öffnen vor dem Eingang zählt ab Eingang
    const frueh = verarbeiteAktion(inh, z, a("entscheid", { meldung: "M12", entscheid: "ablehnen", t_offen: 500 }, "zb"), 801);
    expect(frueh.ok && frueh.entwuerfe[0].daten).toMatchObject({ t_offen: 795, sek_offen: 6, sek_eingang: 6 });
    // zweimal zurückstellen geht nicht, nach einer Entscheidung ist die Meldung zu
    const zur = zustandAus([...[
      e("spiel_neu", { lauf: "l", szenario: "s", version: "v", titel: "t" }),
      e("meldung", { meldung: "M12" }, 795),
    ].map((x, i) => ({ ...x, seq: i + 1 })), { seq: 3, typ: "entscheid", ts: 0, t_s: 801, von: SYS, daten: { meldung: "M12", entscheid: "zurueckstellen" } } as Ereignis], inh);
    expect(verarbeiteAktion(inh, zur, a("entscheid", { meldung: "M12", entscheid: "zurueckstellen" }, "zb"), 802)).toEqual({ ok: false, grund: "Meldung M12 ist schon zurückgestellt" });
    expect(verarbeiteAktion(inh, zur, a("entscheid", { meldung: "M12", entscheid: "ablehnen" }, "zb"), 802).ok).toBe(true);
  });
});
