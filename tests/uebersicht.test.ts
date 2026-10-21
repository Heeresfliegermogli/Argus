// Übersicht der Spielleitung: Eingang je Stufe und Schlüsselfälle live (wartet/offen/richtig/falsch).
import { describe, expect, it } from "vitest";
import type { Ereignis } from "../src/kern/ereignisse";
import { teamUebersicht } from "../src/kern/uebersicht";
import { zustandAus } from "../src/kern/zustand";
import { inhalte } from "./hilfen";

const von = { rolle: "system" as const };
function protokoll(teile: [string, Record<string, unknown>, number?][]): Ereignis[] {
  const basis: [string, Record<string, unknown>, number?][] = [
    ["spiel_neu", { lauf: "20261125-0930-abcd", szenario: "kraehe-01", version: "1.3", titel: "x" }],
    ["uhr", { befehl: "setzen", laeuft: false, t_s: 0, tempo: 1 }],
  ];
  return [...basis, ...teile].map(([typ, daten, t], i) => ({ seq: i + 1, typ, ts: 1, t_s: t ?? 600, von, daten }) as Ereignis);
}
const fall = (u: ReturnType<typeof teamUebersicht>, id: string) => u.faelle.find((f) => f.id === id)!;

describe("Übersicht der Spielleitung", () => {
  it("vor der Meldung wartet ein Fall, in der Kette ist er offen, Eingang je Stufe", async () => {
    const inh = await inhalte();
    const u = teamUebersicht(inh, zustandAus(protokoll([["meldung", { meldung: "M08" }], ["meldung", { meldung: "M01" }]]), inh));
    expect(fall(u, "S1").status).toBe("offen");
    expect(fall(u, "S2").status).toBe("wartet");
    expect(u.eingang).toEqual({ g1: 2, g2: 0, g3: 0 });
    expect(u.faelle.map((f) => f.id)).toEqual(["S1", "S2", "S3", "S4"]);
  });

  it("S1: G1 lehnt die Attrappe ab → richtig; Freigabe auf die Attrappe → falsch, schon vor dem Einschlag", async () => {
    const inh = await inhalte();
    const gut = teamUebersicht(inh, zustandAus(protokoll([["meldung", { meldung: "M08" }], ["g1_entscheid", { meldung: "M08", entscheid: "ablehnen" }]]), inh));
    expect(fall(gut, "S1").status).toBe("richtig");
    expect(gut.fehltreffer).toBe(0);
    const schlecht = teamUebersicht(inh, zustandAus(protokoll([
      ["meldung", { meldung: "M08" }],
      ["g1_entscheid", { meldung: "M08", entscheid: "annehmen" }],
      ["g2_empfehlung", { meldung: "M08", empfehlung: "bekaempfen", wirkmittel: "LM" }],
      ["g3_entscheid", { meldung: "M08", entscheid: "freigabe", wirkmittel: "LM" }],
    ]), inh));
    expect(fall(schlecht, "S1").status).toBe("falsch");
    expect(schlecht.fehltreffer).toBe(1);
  });

  it("S4: zurückgestellt und Folgemeldung erledigt → richtig", async () => {
    const inh = await inhalte();
    const z = zustandAus(protokoll([
      ["meldung", { meldung: "M18" }, 1095],
      ["g1_entscheid", { meldung: "M18", entscheid: "annehmen" }, 1105],
      ["g2_empfehlung", { meldung: "M18", empfehlung: "beobachten" }, 1115],
      ["meldung", { meldung: "M23" }, 1320],
      ["g1_entscheid", { meldung: "M23", entscheid: "annehmen" }, 1325],
      ["g2_empfehlung", { meldung: "M23", empfehlung: "nicht_bekaempfen" }, 1330],
    ]), inh);
    const u = teamUebersicht(inh, z);
    expect(fall(u, "S4").status).toBe("richtig");
    expect(u.zurueckgestellt).toBe(1);
  });
});
