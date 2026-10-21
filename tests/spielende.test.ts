// Spielende und Stand der bedingten Injects (Schritt 6). Der Ablauf wird wie im Host gespielt:
// jeweils das erste fällige Ereignis schreiben, dann neu fragen.
import { describe, expect, it } from "vitest";
import { bedingtStand, faellig } from "../src/engine/ablauf";
import type { Absender, Ereignis } from "../src/kern/ereignisse";
import { anwenden, zustandAus, type Spielzustand } from "../src/kern/zustand";
import type { Inhalte } from "../src/inhalte/typen";
import { inhalte } from "./hilfen";

const SYS: Absender = { rolle: "system" };

function ereignisse(liste: [Ereignis["typ"], unknown, number][]): Ereignis[] {
  return liste.map(([typ, daten, t_s], i) => ({ seq: i + 1, typ, ts: 1_000_000 + t_s * 1000, t_s, von: SYS, daten }) as Ereignis);
}

/** Zeitplan bei Spielzeit t abarbeiten wie Host.takt(); gibt die geschriebenen Typen zurück. */
function abspielen(inh: Inhalte, z0: Spielzustand, t: number): { z: Spielzustand; typen: string[] } {
  let z = z0;
  const typen: string[] = [];
  for (let i = 0; i < 200; i++) {
    const n = faellig(inh, z, t)[0];
    if (!n) break;
    z = anwenden(z, { seq: z.seq + 1, typ: n.typ, ts: 0, t_s: n.t_geplant ?? t, von: SYS, daten: n.daten } as Ereignis, inh);
    typen.push(n.typ);
  }
  return { z, typen };
}

describe("Spielende", () => {
  it("hält die Uhr genau einmal an und schreibt das Spielende (kein Ereignis-Strom)", async () => {
    const inh = await inhalte();
    const z0 = zustandAus(ereignisse([
      ["spiel_neu", { lauf: "20261125-0930-test", szenario: "kraehe-01", version: "1.3", titel: "x" }, 0],
      ["uhr", { befehl: "start", laeuft: true, t_s: 1497, tempo: 1 }, 1497],
    ]), inh);
    const { z, typen } = abspielen(inh, z0, 1500);
    expect(z.ende).toBe(true);
    expect(z.uhr.laeuft).toBe(false);
    expect(typen.filter((x) => x === "uhr")).toHaveLength(1);
    expect(typen.filter((x) => x === "spielende")).toHaveLength(1);
    expect(typen.length).toBeLessThan(60);
    expect(faellig(inh, z, 1500)).toEqual([]);
  });

  it("auch wenn die Uhr bei Spielzeitende schon steht", async () => {
    const inh = await inhalte();
    const z0 = zustandAus(ereignisse([
      ["spiel_neu", { lauf: "20261125-0930-test", szenario: "kraehe-01", version: "1.3", titel: "x" }, 0],
      ["uhr", { befehl: "setzen", laeuft: false, t_s: 1500, tempo: 1 }, 1500],
    ]), inh);
    const { z, typen } = abspielen(inh, z0, 1500);
    expect(z.ende).toBe(true);
    expect(typen.filter((x) => x === "uhr")).toHaveLength(0);
  });
});

describe("Bedingte Injects für die Spielleitung", () => {
  const basis: [Ereignis["typ"], unknown, number][] = [
    ["spiel_neu", { lauf: "20261125-0930-test", szenario: "kraehe-01", version: "1.3", titel: "x" }, 0],
    ["meldung", { meldung: "M19" }, 1215],
    ["g1_entscheid", { meldung: "M19", entscheid: "annehmen" }, 1230],
    ["g2_empfehlung", { meldung: "M19", empfehlung: "bekaempfen", wirkmittel: "PZA" }, 1240],
  ];

  it("ohne Freigabe: I-08a wartet, I-08b und E-01 kommen zur festen Zeit, I-09 wartet", async () => {
    const inh = await inhalte();
    const st = Object.fromEntries(bedingtStand(inh, zustandAus(ereignisse(basis), inh), 1300).map((b) => [b.id, b]));
    expect(st["I-08a"].status).toBe("wartet");
    expect(st["I-08b"].status).toBe("wartet");
    expect(st["I-08b"].t).toBe(1480);
    expect(st["E-01"].art).toBe("ereignis");
    expect(st["I-09"].status).toBe("wartet");
  });

  it("Freigabe auf die PT-91: I-08a kommt 60 s später, I-08b und E-01 entfallen", async () => {
    const inh = await inhalte();
    const z = zustandAus(ereignisse([...basis, ["g3_entscheid", { meldung: "M19", entscheid: "freigabe", wirkmittel: "PZA" }, 1250]]), inh);
    const st = Object.fromEntries(bedingtStand(inh, z, 1260).map((b) => [b.id, b]));
    expect(st["I-08a"].status).toBe("erfuellt");
    expect(st["I-08a"].t).toBe(1310);
    expect(st["I-08b"].status).toBe("entfaellt");
    expect(st["E-01"].status).toBe("entfaellt");
  });

  it("I-09 entfällt, wenn die Freigabe auf den Mörser keine Zivilpersonen trifft", async () => {
    const inh = await inhalte();
    const z = zustandAus(ereignisse([
      ["spiel_neu", { lauf: "20261125-0930-test", szenario: "kraehe-01", version: "1.3", titel: "x" }, 0],
      ["meldung", { meldung: "M21" }, 1290],
      ["g1_entscheid", { meldung: "M21", entscheid: "annehmen" }, 1295],
      ["g2_empfehlung", { meldung: "M21", empfehlung: "bekaempfen", wirkmittel: "LM" }, 1300],
      ["g3_entscheid", { meldung: "M21", entscheid: "freigabe", wirkmittel: "LM" }, 1305],
    ]), inh);
    expect(bedingtStand(inh, z, 1310).find((b) => b.id === "I-09")!.status).toBe("entfaellt");
  });
});
