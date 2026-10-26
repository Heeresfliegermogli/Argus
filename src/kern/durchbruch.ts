// Durchbruch (seit Szenario 2.1, Änderung A4): Wird eine Feindgruppe bis zu ihrem Angriffszeitpunkt t_s nicht
// aufgehalten (kein Fahrzeug zerstört oder außer Gefecht), setzt sie über Brücke oder Furt und fährt westlich aus
// dem Bild. Späher und Unterstützung (Mörser, Lkw, EloKa) brechen nicht durch; das steht in den Daten
// (szenario.durchbruch, verstaerkungen.gruppen[].durchbruch).
//
// Der Host schreibt nach t_s das Ereignis `durchbruch {gruppe, t_ab, durch, grund}`; die Welt des Teams
// (kern/welt.ts) ersetzt dann die Route jedes Fahrzeugs der Gruppe ab t_s durch die Durchbruch-Route (bis_s =
// Ausfahrt am Westrand). Lagemeldung I-13 (bedingung.typ „durchbruch“) kommt verzoegerung_s nach dem ersten
// Fahrzeug über dem Bach, wenn es dann noch steht. In der Auswertung eine Kennzahl, keine Wertung: Das Gefecht
// ist weiter nicht zu „verlieren“. Gleiche Logik wie tools/referenz/argus_lib.py (durchbruch_*).
import type { DurchbruchGruppe, Inhalte, RoutenPunkt, Ziel } from "../inhalte/typen";
import { abS, vorhanden } from "./geometrie";

/** Durchbruch-Gruppe mit absoluten Zeiten (aus dem Szenario oder einer eingespielten Verstärkung). */
export interface DurchbruchAbs extends DurchbruchGruppe {
  /** Gruppe einer Verstärkung (Zeiten ab dem Einspielen verschoben) */
  verstaerkung?: boolean;
}

/** Ziel mit Durchbruch: Standardroute bis zum Beginn der Durchbruch-Route, danach diese; bis_s = Ausfahrt am Westrand. */
export function durchbruchZiel(z: Ziel, route: RoutenPunkt[]): Ziel {
  const neu = JSON.parse(JSON.stringify(z)) as Ziel;
  const tS = route[0][0];
  const alt: RoutenPunkt[] = neu.bewegung?.route?.length ? neu.bewegung.route : [[abS(neu), neu.pos[0], neu.pos[1]]];
  neu.bewegung = { route: [...alt.filter((p) => p[0] < tS), ...route.map((p) => [p[0], p[1], p[2]] as RoutenPunkt)] };
  neu.bis_s = route[route.length - 1][0];
  return neu;
}

/** Alle Durchbruch-Gruppen dieses Laufs: aus dem Szenario und aus eingespielten Verstärkungen ({gruppe, t0}). */
export function durchbruchGruppen(inh: Inhalte, eingespielt: readonly { gruppe: string; t0: number }[] = inh.eingespielt ?? []): DurchbruchAbs[] {
  const sz = (inh.basis ?? inh).szenario;
  const out: DurchbruchAbs[] = (sz.durchbruch?.gruppen ?? []).map((g) => ({ ...g }));
  for (const g of sz.verstaerkungen?.gruppen ?? []) {
    const db = g.durchbruch;
    const e = eingespielt.find((x) => x.gruppe === g.id);
    if (!db || !e) continue;
    const t0 = e.t0;
    out.push({
      id: g.id, name: g.name, ziele: g.ziele.map((z) => z.id), t_s: db.t_s + t0, ueber: db.ueber, zweck: g.zweck,
      routen: Object.fromEntries(Object.entries(db.routen).map(([k, r]) => [k, r.map(([t, x, y]) => [t + t0, x, y] as RoutenPunkt)])),
      ueber_s: Object.fromEntries(Object.entries(db.ueber_s).map(([k, v]) => [k, v + t0])),
      verstaerkung: true,
    });
  }
  return out;
}

/**
 * Bricht die Gruppe zu ihrem Zeitpunkt t_s durch? Aufgehalten, wenn bis t_s ein Fahrzeug zerstört oder außer Gefecht
 * ist; nichts zu tun, wenn keines mehr im Raum ist. inh: Welt des Teams (Verstärkungen eingespielt).
 */
export function durchbruchStand(
  g: DurchbruchAbs, inh: Inhalte, zerstoert: Record<string, number>, ausserGefecht: Record<string, number> = {},
): { durch: boolean; grund?: string } {
  for (const x of g.ziele) {
    if ((zerstoert[x] ?? Infinity) <= g.t_s) return { durch: false, grund: `${x} zerstört` };
    if ((ausserGefecht[x] ?? Infinity) <= g.t_s) return { durch: false, grund: `${x} außer Gefecht` };
  }
  if (!g.ziele.some((x) => inh.ziele[x] && vorhanden(inh.ziele[x], g.t_s))) return { durch: false, grund: "nicht mehr im Raum" };
  return { durch: true };
}

/**
 * Wer ist durchgebrochen (Kennzahl) und wann war das erste Fahrzeug über dem Bach (Lagemeldung I-13)? Zählt jedes
 * Fahrzeug einer durchgebrochenen Gruppe, das bis Spielende über den Bach kommt und bis dahin nicht zerstört ist.
 */
export function durchgebrochen(
  inh: Inhalte, durchbrueche: Record<string, { durch: boolean }>, zerstoert: Record<string, number>,
  eingespielt: readonly { gruppe: string; t0: number }[] = inh.eingespielt ?? [],
): { fahrzeuge: string[]; gruppen: string[]; erstesUeber: number | null } {
  const dauer = (inh.basis ?? inh).szenario.spieluhr.dauer_s;
  const fahrzeuge: string[] = [];
  const gruppen: string[] = [];
  let erstes: number | null = null;
  for (const g of durchbruchGruppen(inh, eingespielt)) {
    if (!durchbrueche[g.id]?.durch) continue;
    let dabei = false;
    for (const zid of g.ziele) {
      const tc = g.ueber_s[zid];
      if (tc === undefined || tc > dauer || (zerstoert[zid] ?? Infinity) <= tc) continue;
      fahrzeuge.push(zid);
      dabei = true;
      erstes = erstes === null ? tc : Math.min(erstes, tc);
    }
    if (dabei) gruppen.push(g.id);
  }
  return { fahrzeuge: fahrzeuge.sort(), gruppen, erstesUeber: erstes };
}
