// Welt eines Teams: die Inhalte des Szenarios plus die Verstärkungen, die die Spielleitung in diesem
// Lauf eingespielt hat. Verstärkungen sind vorbereitete Feindgruppen mit Zeiten relativ zum Einspielen
// (Route [dt_s, x, y], Meldung dt_s); eingespielt um t0 werden daraus gewöhnliche Ziele und Meldungen
// mit absoluten Zeiten (wie argus_lib.verstaerkung_ziel und simuliere_durchlauf.mit_verstaerkung).
//
// Seit Szenario 2.1 (A4) kommen die Durchbrüche dazu: Fahrzeuge einer Gruppe, die nicht aufgehalten wurde, fahren ab
// ihrem Angriffszeitpunkt die Durchbruch-Route (kern/durchbruch.ts).
//
// Die Welt hat dieselbe Form wie die Inhalte (Typ Inhalte). Engine, Lagebild und Ansichten rechnen
// deshalb ohne Sonderfälle mit ihr: inh.meldungen["V1-M1"], inh.szenario.ziele usw. Reine Funktion,
// je Inhalte und Liste nur einmal gebaut (gleiche Liste ⇒ dasselbe Objekt, damit useMemo greift).
import type { Inhalte, Meldung, Verstaerkung, VerstaerkungsMeldung, Ziel } from "../inhalte/typen";
import { durchbruchGruppen, durchbruchZiel } from "./durchbruch";

export interface Eingespielt {
  gruppe: string;
  t0: number;
}

/** Ziel einer Verstärkung mit absoluter Zeit: Route und ab_s/bis_s um t0 verschoben. */
export function verstaerkungZiel(z: Ziel, t0: number): Ziel {
  const neu = JSON.parse(JSON.stringify(z)) as Ziel;
  const r = neu.bewegung?.route;
  if (r) neu.bewegung!.route = r.map(([t, x, y]) => [t + t0, x, y]);
  if (neu.ab_s !== undefined && neu.ab_s !== null) neu.ab_s += t0;
  if (neu.bis_s !== undefined && neu.bis_s !== null) neu.bis_s += t0;
  for (const p of neu.personen ?? []) {
    if (p.ab_s !== undefined && p.ab_s !== null) p.ab_s += t0;
    if (p.bis_s !== undefined && p.bis_s !== null) p.bis_s += t0;
  }
  for (const f of neu.feuert ?? []) {
    f.von_s += t0;
    f.bis_s += t0;
  }
  if (neu.ab_s === undefined && !r) neu.ab_s = t0;
  return neu;
}

/** Meldung einer Verstärkung mit absoluter Zeit (Phase nach der Uhrzeit). */
export function verstaerkungMeldung(inh: Inhalte, g: Verstaerkung, m: VerstaerkungsMeldung, t0: number): Meldung {
  const t = t0 + m.dt_s;
  const phase = inh.szenario.phasen.find((p) => p.von_s <= t && t < p.bis_s)?.nr ?? m.phase ?? 0;
  const { dt_s: _dt, ...rest } = m;
  return { ...rest, t_s: t, phase, verstaerkung: g.id } as Meldung;
}

export function verstaerkungen(inh: Inhalte): Verstaerkung[] {
  return (inh.basis ?? inh).szenario.verstaerkungen?.gruppen ?? [];
}

const CACHE = new WeakMap<Inhalte, Map<string, Inhalte>>();

/**
 * Welt aus den Inhalten, den eingespielten Verstärkungen (Reihenfolge wie im Protokoll) und den Gruppen, die
 * durchgebrochen sind (durch: Kennungen der Durchbruch-Gruppen, D-01 … oder V-2/V-3).
 */
export function welt(inh: Inhalte, eingespielt: readonly Eingespielt[], durch: readonly string[] = []): Inhalte {
  const basis = inh.basis ?? inh;
  if (!eingespielt.length && !durch.length) return basis;
  const schl = `${eingespielt.map((e) => `${e.gruppe}@${e.t0}`).join(",")}|${durch.join(",")}`;
  let cache = CACHE.get(basis);
  if (!cache) CACHE.set(basis, (cache = new Map()));
  const alt = cache.get(schl);
  if (alt) return alt;

  const gruppen = new Map(verstaerkungen(basis).map((g) => [g.id, g]));
  const ziele = [...basis.szenario.ziele];
  const meldungen = [...basis.szenario.meldungen];
  for (const e of eingespielt) {
    const g = gruppen.get(e.gruppe);
    if (!g) continue;
    ziele.push(...g.ziele.map((z) => verstaerkungZiel(z, e.t0)));
    meldungen.push(...g.meldungen.map((m) => verstaerkungMeldung(basis, g, m, e.t0)));
  }
  meldungen.sort((a, b) => a.t_s - b.t_s);
  if (durch.length) {
    const routen = new Map<string, NonNullable<Ziel["bewegung"]>["route"]>();
    for (const g of durchbruchGruppen(basis, eingespielt)) {
      if (!durch.includes(g.id)) continue;
      for (const [zid, r] of Object.entries(g.routen)) routen.set(zid, r);
    }
    ziele.forEach((z, i) => {
      const r = routen.get(z.id);
      if (r) ziele[i] = durchbruchZiel(z, r);
    });
  }
  const neu: Inhalte = {
    ...basis,
    szenario: { ...basis.szenario, ziele, meldungen },
    ziele: Object.fromEntries(ziele.map((z) => [z.id, z])),
    meldungen: Object.fromEntries(meldungen.map((m) => [m.id, m])),
    basis,
    eingespielt: eingespielt.map((e) => ({ ...e })),
    durchgebrochen: [...durch],
  };
  if (cache.size > 64) cache.clear();
  cache.set(schl, neu);
  return neu;
}

/** Darf die Gruppe zur Spielzeit t eingespielt werden? Gesperrt in den Fenstern `nicht_einspielen`. */
export function einspielSperre(inh: Inhalte, gruppe: string, t: number): { gesperrt: boolean; bis?: number } {
  const g = verstaerkungen(inh).find((x) => x.id === gruppe);
  const f = g?.nicht_einspielen?.find(([von, bis]) => von <= t && t <= bis);
  return f ? { gesperrt: true, bis: f[1] } : { gesperrt: false };
}

export interface VerstaerkungStand {
  id: string;
  name: string;
  kurz: string;
  zweck: string;
  /** schon eingespielt (Einspielzeit) */
  eingespielt?: number;
  /** jetzt gesperrt (nicht_einspielen), wieder frei ab */
  gesperrtBis?: number;
}

/** Stand der Verstärkungen für ein Team zur Spielzeit t (Menü der Spielleitung). */
export function verstaerkungStand(inh: Inhalte, eingespielt: readonly Eingespielt[], t: number): VerstaerkungStand[] {
  return verstaerkungen(inh).map((g) => {
    const da = eingespielt.find((e) => e.gruppe === g.id);
    const sperre = einspielSperre(inh, g.id, t);
    return {
      id: g.id, name: g.name, kurz: g.kurz, zweck: g.zweck,
      eingespielt: da?.t0,
      gesperrtBis: !da && sperre.gesperrt ? sperre.bis! + 1 : undefined,
    };
  });
}
