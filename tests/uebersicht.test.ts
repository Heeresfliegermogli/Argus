// Übersicht der Spielleitung: Eingang und Schlüsselfälle live (wartet/offen/richtig/falsch), seit 2.6 als Statusmeldung des
// Team-Laptops (H1.2): klein, flach, mit Panzern und Uhr – und ohne Netz aus dem Protokoll gerechnet gleich.
import { describe, expect, it } from "vitest";
import type { Ereignis } from "../src/kern/ereignisse";
import { statusFaelle, statusPanzer, statusUhr, teamStatus, teamUebersicht } from "../src/kern/uebersicht";
import { zustandAus } from "../src/kern/zustand";
import { inhalte } from "./hilfen";

const von = { rolle: "system" as const };
function protokoll(teile: [string, Record<string, unknown>, number?][]): Ereignis[] {
  const basis: [string, Record<string, unknown>, number?][] = [
    ["spiel_neu", { lauf: "20261125-0930-abcd", szenario: "kraehe-01", version: "2.6", titel: "x" }],
    ["uhr", { befehl: "setzen", laeuft: false, t_s: 0, tempo: 1 }],
  ];
  return [...basis, ...teile].map(([typ, daten, t], i) => ({ seq: i + 1, typ, ts: 1, t_s: t ?? 600, von, daten }) as Ereignis);
}
const fall = (u: ReturnType<typeof teamUebersicht>, id: string) => u.faelle.find((f) => f.id === id)!;

describe("Übersicht der Spielleitung", () => {
  it("vor der Meldung wartet ein Fall, im Eingang ist er offen", async () => {
    const inh = await inhalte();
    const u = teamUebersicht(inh, zustandAus(protokoll([["meldung", { meldung: "M08" }], ["meldung", { meldung: "M01" }]]), inh));
    expect(fall(u, "S1").status).toBe("offen");
    expect(fall(u, "S2").status).toBe("wartet");
    expect(u.eingang).toBe(2);
    expect(u.faelle.map((f) => f.id)).toEqual(["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"]);
  });

  it("S1: ABLEHNEN der Attrappe → richtig; BEKÄMPFEN der Attrappe → falsch, schon vor dem Einschlag", async () => {
    const inh = await inhalte();
    const gut = teamUebersicht(inh, zustandAus(protokoll([["meldung", { meldung: "M08" }], ["entscheid", { meldung: "M08", entscheid: "ablehnen" }]]), inh));
    expect(fall(gut, "S1").status).toBe("richtig");
    expect(gut.fehltreffer).toBe(0);
    const schlecht = teamUebersicht(inh, zustandAus(protokoll([
      ["meldung", { meldung: "M08" }],
      ["entscheid", { meldung: "M08", entscheid: "bekaempfen", wirkmittel: "LM", warnungen: [] }],
    ]), inh));
    expect(fall(schlecht, "S1").status).toBe("falsch");
    expect(schlecht.fehltreffer).toBe(1);
  });

  it("S4: zurückgestellt und Folgemeldung erledigt → richtig", async () => {
    const inh = await inhalte();
    const z = zustandAus(protokoll([
      ["meldung", { meldung: "M18" }, 1095],
      ["entscheid", { meldung: "M18", entscheid: "zurueckstellen" }, 1115],
      ["meldung", { meldung: "M23" }, 1320],
      ["entscheid", { meldung: "M23", entscheid: "ablehnen" }, 1330],
    ]), inh);
    const u = teamUebersicht(inh, z);
    expect(fall(u, "S4").status).toBe("richtig");
    expect(u.zurueckgestellt).toBe(1);
  });

  it("Statusmeldung (H1.2): flach, Fälle und Panzer als Text, Uhr läuft aus der letzten Meldung weiter", async () => {
    const inh = await inhalte();
    const z = zustandAus(protokoll([
      ["uhr", { befehl: "start", laeuft: true, t_s: 600, tempo: 1 }, 600],
      ["meldung", { meldung: "M08" }, 600],
      ["entscheid", { meldung: "M08", entscheid: "ablehnen" }, 610],
    ]).map((e) => ({ ...e, ts: e.typ === "uhr" && e.daten.befehl === "start" ? 1_000_000 : 1 })), inh);
    const st = teamStatus(inh, z, 1_010_000, { client: "abc123", lauf: "20261125-0930-abcd", hoch: 4 });
    expect(st).toMatchObject({ client: "abc123", seq: 5, hoch: 4, laeuft: true, tempo: 1, ende: false, eingang: 0, fehl: 0, t_s: 610 });
    expect(Object.values(st).every((v) => typeof v !== "object")).toBe(true); // flach (Firebase-Regeln)
    expect(statusFaelle(inh, st).find((f) => f.id === "S1")?.status).toBe("richtig");
    expect(statusPanzer(st)).toHaveLength(4);
    expect(statusPanzer(st).every((p) => p.zustand >= 0 && p.zustand <= 100)).toBe(true);
    // 5 s nach der Meldung: Uhr steht 5 s weiter; angehalten bleibt sie stehen
    expect(statusUhr(st, 1_015_000, 1500)).toBe(615);
    expect(statusUhr({ ...st, laeuft: false }, 1_015_000, 1500)).toBe(610);
  });
});
