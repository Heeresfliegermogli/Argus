// Änderungen B3, B4, B7 (25.10.2026): Rollen ohne G-Nummern, Spieluhr 00:00–25:00, „Ziel 7“ statt M07 – nur Anzeige,
// Kennungen in Daten und Protokoll bleiben.
import { describe, expect, it } from "vitest";
import { rollenImText } from "../src/kern/anzeige";
import { beschreibe } from "../src/kern/beschreibung";
import type { Ereignis } from "../src/kern/ereignisse";
import { welt } from "../src/kern/welt";
import { zielName, zielNr, zielNummern } from "../src/kern/zielnummern";
import { zustandAus } from "../src/kern/zustand";
import { inhalte } from "./hilfen";

let seq = 0;
const e = (typ: string, daten: unknown, t_s = 0): Ereignis => ({ seq: ++seq, typ, ts: t_s * 1000, t_s, von: { rolle: "system" }, daten } as Ereignis);

describe("Rollen in Texten (B3)", () => {
  it("G1/G2/G3 werden Aufklärung/Zielprüfung/Führung, mit Artikel nach Präpositionen", () => {
    expect(rollenImText("G1 Aufklärung prüft jede ARGUS-Meldung.")).toBe("Aufklärung prüft jede ARGUS-Meldung.");
    expect(rollenImText("die Meldung geht als Ziel an G2")).toBe("die Meldung geht als Ziel an die Zielprüfung");
    expect(rollenImText("Ohne Freigabe von G3 wird nichts bekämpft.")).toBe("Ohne Freigabe von der Führung wird nichts bekämpft.");
    expect(rollenImText("G2 und G3 sehen nur deine Zielmeldung")).toBe("Die Zielprüfung und Führung sehen nur deine Zielmeldung");
    expect(rollenImText("G3: Wann habt ihr I-04 gelesen?")).toBe("Führung: Wann habt ihr I-04 gelesen?");
    expect(rollenImText("Weg zu G1 und G2")).toBe("Weg zur Aufklärung und Zielprüfung");
    expect(rollenImText("gibst ZURÜCK AN G2")).toBe("gibst ZURÜCK AN ZIELPRÜFUNG");
    expect(rollenImText("nur G3 (Inject I-04)")).toBe("nur die Führung (Inject I-04)");
    expect(rollenImText("ohne G-Nummer")).toBe("ohne G-Nummer");
  });

  it("geladene Inhalte: Texte umgeschrieben, Kennungen unverändert", async () => {
    const inh = await inhalte();
    const alle = JSON.stringify([Object.values(inh.szenario.lage), inh.szenario.injects.map((i) => i.text), inh.szenario.schluesselfaelle]);
    expect(alle).not.toMatch(/\bG[123]\b/);
    expect(alle).not.toMatch(/\b(09|10):[0-5]\d\b/);
    // Empfänger der Injects bleiben Kennungen (der Code verteilt danach)
    expect(new Set(inh.szenario.injects.map((i) => i.an))).toEqual(new Set(["G3", ...(inh.szenario.injects.some((i) => i.an === "alle") ? ["alle"] : [])]));
    expect(inh.szenario.spieluhr.start).toBe("10:00:00");
    expect(inh.szenario.lage.G1.absaetze.join(" ")).toMatch(/Zielprüfung/);
    expect(inh.meldungen.M20.id).toBe("M20");
  });
});

describe("Zielnummern (B7)", () => {
  it("Meldungen des Szenarios: Platz in der Zeitleiste, für alle Teams gleich", async () => {
    const inh = await inhalte();
    expect(zielNr(inh, null, "M01")).toBe("1");
    expect(zielNr(inh, null, "M20")).toBe("20");
    expect(zielName(inh, null, "M01")).toBe(`Ziel 1${inh.meldungen.M01.ziele.length > 1 ? ` (${inh.meldungen.M01.ziele.length} Fz)` : ""}`);
    expect(zielName(inh, null, "M01", false)).toBe("Ziel 1");
  });

  it("Verstärkungen bekommen die Nummer der letzten Meldung mit Buchstaben", async () => {
    const basis = await inhalte();
    const g = basis.szenario.verstaerkungen!.gruppen[0];
    seq = 0;
    const p = [
      e("spiel_neu", { lauf: "20261125-0930-test", szenario: "kraehe-01", version: "2.0", titel: "x" }),
      e("meldung", { meldung: "M01" }, 20),
      e("verstaerkung", { gruppe: g.id, t_ab: 30 }, 30),
    ];
    const w = welt(basis, [{ gruppe: g.id, t0: 30 }]);
    const vIds = g.meldungen.map((m) => w.meldungen[m.id] ? m.id : null).filter((x): x is string => !!x);
    for (const id of vIds) p.push(e("meldung", { meldung: id }, 40));
    p.push(e("meldung", { meldung: "M02" }, 75));
    const z = zustandAus(p, w);
    const n = zielNummern(w, z);
    expect(n.get("M01")).toBe("1");
    expect(n.get(vIds[0])).toBe("1a");
    expect(n.get("M02")).toBe("2");
  });
});

describe("Protokoll der Spielleitung (B3, B7)", () => {
  it("Ziel n mit interner Kennung, Empfänger als Rollenname", async () => {
    const inh = await inhalte();
    seq = 0;
    const m = e("meldung", { meldung: "M03" }, 240);
    expect(beschreibe(m, inh)).toMatch(/^ARGUS Ziel 3 \(M03\): /);
    const g1 = e("g1_entscheid", { meldung: "M03", entscheid: "annehmen" }, 250);
    expect(beschreibe(g1, inh)).toMatch(/^Ziel 3 \(M03\) /);
    const i = inh.szenario.injects.find((x) => x.an === "G3")!;
    const inj = e("inject", { inject: i.id }, i.t_s ?? 30);
    expect(beschreibe(inj, inh)).toContain(`Inject ${i.id} an Führung`);
    expect(beschreibe(inj, inh)).not.toMatch(/\bG[123]\b/);
  });
});
