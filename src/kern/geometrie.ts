// Geometrie, Raster und Bewegung. Portiert aus argus_lib.py (Referenz in tools/referenz/),
// gleiche Ergebnisse prüft tests/regeln.test.ts. Koordinaten in Metern, x Ost, y Süd.
import type { Geometrie, GroundTruth, Karte, Person, Punkt, Ziel, Zone } from "../inhalte/typen";

export function dist(a: Punkt, b: Punkt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function distSegment(p: Punkt, a: Punkt, b: Punkt): number {
  const [ax, ay] = a;
  const dx = b[0] - ax;
  const dy = b[1] - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2));
  return Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy));
}

export function imPolygon(p: Punkt, poly: Punkt[]): boolean {
  const [x, y] = p;
  let innen = false;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    if (y1 > y !== y2 > y) {
      const xs = x1 + ((y - y1) * (x2 - x1)) / (y2 - y1);
      if (x < xs) innen = !innen;
    }
  }
  return innen;
}

/** 0, wenn innen; sonst kürzester Abstand zum Rand. */
export function abstandPolygon(p: Punkt, poly: Punkt[]): number {
  if (imPolygon(p, poly)) return 0;
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) min = Math.min(min, distSegment(p, poly[i], poly[(i + 1) % poly.length]));
  return min;
}

export function abstandGeometrie(p: Punkt, g: Geometrie): number {
  switch (g.typ) {
    case "polygon":
      return abstandPolygon(p, g.punkte);
    case "polygone":
      return Math.min(...g.teile.map((t) => abstandPolygon(p, t)));
    case "kreis":
      return Math.max(0, dist(p, g.mitte) - g.radius_m);
  }
}

export function abstandZone(p: Punkt, zone: Zone): number {
  return abstandGeometrie(p, zone.geometrie);
}

// ---------------------------------------------------------------- Raster

/** Planquadrat, z. B. x=476, y=612 → E7 */
export function pq(p: Punkt, karte: Karte): string {
  const r = karte.raster;
  const i = Math.min(Math.max(Math.floor(p[0] / r.zelle_m), 0), r.spalten.length - 1);
  const j = Math.floor(p[1] / r.zelle_m) + (r.zeilen_ab ?? 1);
  return `${r.spalten[i]}${j}`;
}

/** Planquadrat plus Meter ab seiner Nordwestecke nach Ost und Süd, z. B. „F4 · 48/86“. */
export function feinlage(p: Punkt, karte: Karte): string {
  const z = karte.raster.zelle_m;
  const mod = (v: number) => ((Math.round(v) % z) + z) % z;
  return `${pq(p, karte)} · ${String(mod(p[0])).padStart(2, "0")}/${String(mod(p[1])).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- Bewegung

type Beweglich = Pick<Ziel, "pos" | "bewegung"> | Pick<Person, "pos" | "bewegung">;
type Zeitlich = { ab_s?: number; bis_s?: number; bewegung?: { route: [number, number, number][] } };

/** Position zur Spielzeit t (lineare Interpolation entlang der Route). */
export function position(obj: Beweglich, t: number): Punkt {
  const r = obj.bewegung?.route;
  if (!r || !r.length) return [obj.pos[0], obj.pos[1]];
  if (t <= r[0][0]) return [r[0][1], r[0][2]];
  for (let i = 0; i < r.length - 1; i++) {
    const [t0, x0, y0] = r[i];
    const [t1, x1, y1] = r[i + 1];
    if (t0 <= t && t <= t1) {
      const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
      return [x0 + f * (x1 - x0), y0 + f * (y1 - y0)];
    }
  }
  const letzter = r[r.length - 1];
  return [letzter[1], letzter[2]];
}

/** Ground Truth zur Zeit t (wie argus_lib.gt_bei): gt gilt ab gt.ab_s, davor gt.vorher. */
export function gtBei(ziel: Pick<Ziel, "gt">, t: number): GroundTruth {
  const gt = ziel.gt;
  if (gt.vorher && t < (gt.ab_s ?? 0)) return gt.vorher;
  return gt;
}

/** Ab wann ein Objekt im Raum ist: ab_s, sonst Routenbeginn, sonst wie das Elternobjekt, sonst 0. */
export function abS(obj: Zeitlich, eltern?: Zeitlich): number {
  if (obj.ab_s !== undefined && obj.ab_s !== null) return obj.ab_s;
  const r = obj.bewegung?.route;
  if (r && r.length) return r[0][0];
  return eltern ? abS(eltern) : 0;
}

export function vorhanden(obj: Zeitlich, t: number, eltern?: Zeitlich): boolean {
  return abS(obj, eltern) <= t && t < (obj.bis_s ?? 1e9);
}
