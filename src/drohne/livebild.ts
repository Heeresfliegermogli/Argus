// Live-Drohnenbild (Konzept v2, Abschnitt 6; Schritt 6b): setzt das Drohnenbild einer Meldung zur laufenden
// Spielzeit aus den Ebenen (Schritt 5b) zusammen – die Fahrzeuge fahren im Bild, Wracks brennen, Einschläge
// und die LM im Flug sind zu sehen. Referenz ist tools/assets/live.py; zur Meldezeit ergibt das Zusammensetzen
// das Standbild.
//
// Reihenfolge von unten (docs/ASSETS.md „Live-Drohnenbild“):
//   boden → Krater → Fahrzeuge mit Schatten (Sprite nach Zustand: intakt, Wrack, Kette ab, Luk offen)
//   → Feuer auf Wracks → Figuren mit Schatten → Figuren auf Fahrzeugen → kronen → Rauch der Wracks
//   → Einschläge, LM, Leuchtspur, Mündungsblitz, Nebel → stoerung → kamera → Rauschen/Zeilenversatz (M25)
//
// Positionen kommen aus der Engine: Routen der Welt des Teams (mit Verstärkungen), angehalten bei der
// Zerstörung (z.zerstoert) bzw. außer Gefecht (Hintergrundgefecht). Gezeichnet wird mit Canvas 2D: wenige
// Sprites auf wenigen Ebenen, in jeder Auflösung (Fenster am Ort, Vergrößerung, Lupe) dieselbe Funktion –
// die Lupe zeichnet die Szene stärker vergrößert, die Sprites kommen dabei scharf aus dem Atlas.
//
// Keine Darstellung getöteter Menschen: Personen, die eine Wirkung getroffen hat, und Personen an einem
// zerstörten Fahrzeug verschwinden aus dem Bild (wie in den Standbildern: Wracks ohne Besatzung).
//
// Kamera (Änderung B9, 25.10.2026): Die Drohne verfolgt das Ziel. Zur Meldezeit steht der Ausschnitt wie im Standbild,
// danach bleibt das verfolgte Fahrzeug an seiner Stelle im Bild und der Boden zieht darunter weg. Ca. 0,5 s nach der
// Zerstörung (bzw. wenn es den Raum verlässt) schwenkt die Kamera auf das nächste noch stehende Fahrzeug der Meldung,
// dazwischen kurzes Bildrauschen (Ausrichtung). Außerhalb des Bodens der Meldung zeigt das Bild das Luftbild des
// Kartenpakets (in Kamerafarbe, auf der Webseite mit den 0,25-m-Kacheln), weich an den Boden angesetzt.
import { atlas, assetUrl, kachelnVerfuegbar } from "../assets/assets";
import type { AssetManifest, BildZiel, Drohnenbild, EbenenFahrzeug, EbenenFigur } from "../assets/typen";
import type { Inhalte, Punkt, Ziel } from "../inhalte/typen";
import type { Effekt } from "../kern/effekte";
import { position, vorhanden } from "../kern/geometrie";
import { ausserGefechtAb } from "../kern/lagebild";
import type { Spielzustand } from "../kern/zustand";

// ---------------------------------------------------------------- Ressourcen

interface Rahmen {
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
}

interface LiveAtlas {
  /** Atlas in Kamerafarbe (Farbmatrix aus dem Manifest) */
  bild: CanvasImageSource;
  rahmen: Record<string, Rahmen>;
  animationen: Record<string, string[]>;
}

export interface LiveRessourcen {
  man: AssetManifest;
  fz: LiveAtlas;
  fx: LiveAtlas;
  kamera: HTMLImageElement;
  rauschen: HTMLCanvasElement;
  /** Luftbild des Kartenpakets in Kamerafarbe (Boden außerhalb der Ebenen einer Meldung, wenn die Kamera schwenkt) */
  luftbild: { bild: CanvasImageSource; m_pro_px: number } | null;
}

/** Luftbild-Kacheln (0,25 m/px, nur Webseite) in Kamerafarbe, je Fenster einmal geladen. */
const kacheln = new Map<string, CanvasImageSource | "laedt" | "fehlt">();

/** Kachel in Kamerafarbe; „laedt“, solange sie kommt, „fehlt“, wenn sie nicht zu laden ist (dann reicht das Luftbild). */
function kachel(man: AssetManifest, ix: number, iy: number): CanvasImageSource | "laedt" | "fehlt" {
  const k = man.karte.luftbild.kacheln;
  const pfad = k.muster.replace("{x}", String(ix)).replace("{y}", String(iy));
  const da = kacheln.get(pfad);
  if (da) return da;
  kacheln.set(pfad, "laedt");
  ladeBild(pfad).then((img) => kacheln.set(pfad, faerben(img, man.drohne_ebenen.farbmatrix))).catch(() => kacheln.set(pfad, "fehlt"));
  return "laedt";
}

export interface LiveEbenen {
  boden: HTMLImageElement;
  kronen: HTMLImageElement | null;
  stoerung: HTMLImageElement | null;
}

const bilder = new Map<string, Promise<HTMLImageElement>>();

/** Bild einmal laden und dekodieren (alle Live-Bilder teilen sich den Speicher). */
export function ladeBild(pfad: string): Promise<HTMLImageElement> {
  let p = bilder.get(pfad);
  if (!p) {
    p = (async () => {
      const img = new Image();
      img.decoding = "async";
      img.src = assetUrl(pfad);
      await img.decode();
      return img;
    })();
    p.catch(() => bilder.delete(pfad));
    bilder.set(pfad, p);
  }
  return p;
}

/** Farbmatrix (4 × 5, Werte 0…1 wie PixiJS ColorMatrixFilter) auf ein Bild anwenden – einmal je Atlas. */
function faerben(img: HTMLImageElement, m: number[][]): CanvasImageSource {
  try {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const a = d.data;
    const [r0, r1, r2] = m;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] === 0) continue;
      const r = a[i] / 255;
      const g = a[i + 1] / 255;
      const b = a[i + 2] / 255;
      a[i] = 255 * (r0[0] * r + r0[1] * g + r0[2] * b + r0[4]);
      a[i + 1] = 255 * (r1[0] * r + r1[1] * g + r1[2] * b + r1[4]);
      a[i + 2] = 255 * (r2[0] * r + r2[1] * g + r2[2] * b + r2[4]);
    }
    ctx.putImageData(d, 0, 0);
    return c;
  } catch (e) {
    // z. B. Bild aus fremder Quelle: dann ungefärbt
    console.warn("Live-Drohnenbild: Farbmatrix nicht angewendet", e);
    return img;
  }
}

async function ladeAtlas(man: AssetManifest, welcher: "fahrzeuge" | "effekte"): Promise<LiveAtlas> {
  const a = await atlas(man, welcher);
  const img = await ladeBild(man[welcher].bild);
  const j = a.json as { frames: Record<string, { frame: { x: number; y: number; w: number; h: number }; anchor?: { x: number; y: number } }>; animations?: Record<string, string[]> };
  const rahmen: Record<string, Rahmen> = {};
  for (const [n, f] of Object.entries(j.frames)) rahmen[n] = { ...f.frame, ax: f.anchor?.x ?? 0.5, ay: f.anchor?.y ?? 0.5 };
  return { bild: faerben(img, man.drohne_ebenen.farbmatrix), rahmen, animationen: j.animations ?? {} };
}

function rauschBild(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 192;
  const ctx = c.getContext("2d")!;
  const d = ctx.createImageData(c.width, c.height);
  let s = 1234567;
  for (let i = 0; i < d.data.length; i += 4) {
    s = (s * 1103515245 + 12345) >>> 0;
    const v = (s >>> 16) & 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 255;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

let ressourcen: { man: AssetManifest; p: Promise<LiveRessourcen> } | null = null;

/** Atlanten (in Kamerafarbe), Kamera-Ebene und Rauschen – einmal je Fenster. */
export function ladeLiveRessourcen(man: AssetManifest): Promise<LiveRessourcen> {
  if (ressourcen?.man === man) return ressourcen.p;
  const p = (async () => {
    const stufe = [...(man.karte?.luftbild?.stufen ?? [])].sort((a, b) => a.m_pro_px - b.m_pro_px)[0];
    const [fz, fx, kamera, lb] = await Promise.all([ladeAtlas(man, "fahrzeuge"), ladeAtlas(man, "effekte"), ladeBild(man.drohne_ebenen.kamera),
      stufe ? ladeBild(stufe.datei).catch(() => null) : Promise.resolve(null)]);
    const luftbild = lb && stufe ? { bild: faerben(lb, man.drohne_ebenen.farbmatrix), m_pro_px: stufe.m_pro_px } : null;
    return { man, fz, fx, kamera, rauschen: rauschBild(), luftbild };
  })();
  p.catch(() => {
    ressourcen = null;
  });
  ressourcen = { man, p };
  return p;
}

/** Ebenen einer Meldung (Boden, Kronen, Störung). */
export async function ladeEbenen(db: Drohnenbild): Promise<LiveEbenen | null> {
  const e = db.ebenen;
  if (!e) return null;
  const [boden, kronen, stoerung] = await Promise.all([ladeBild(e.boden), e.kronen ? ladeBild(e.kronen) : null, e.stoerung ? ladeBild(e.stoerung) : null]);
  return { boden, kronen, stoerung };
}

// ---------------------------------------------------------------- Szene zur Spielzeit

/** Lage, aus der das Bild entsteht: Welt des Teams, Spielstand, Effekte (was diese Rolle sehen darf). */
export interface LiveLage {
  inh: Inhalte;
  z: Spielzustand;
  effekte: Effekt[];
}

interface SzeneFahrzeug {
  id: string;
  sprite: string;
  /** Bildpunkte (px im Drohnenbild) */
  px: Punkt;
  hdg: number;
  wrack: boolean;
  /** Rauchstärke über dem Wrack (0…1) */
  rauch: number;
  /** feuert (Mündungsblitz in Abständen) */
  feuert: boolean;
  unschaerfe?: { laenge_px: number; winkel: number };
}

interface SzeneFigur {
  fg: EbenenFigur;
  px: Punkt;
}

/** ARGUS-Markierung im Live-Bild: Rahmen (px) am Fahrzeug zur Spielzeit. */
export interface LiveMarke {
  id: string;
  box: [number, number, number, number];
}

export interface Szene {
  t: number;
  fahrzeuge: SzeneFahrzeug[];
  figuren: SzeneFigur[];
  marken: LiveMarke[];
  /** Ist mindestens ein gemeldetes Fahrzeug im Bild? */
  zielImBild: boolean;
  /** Kamera zur Spielzeit (Versatz gegenüber dem Standbild, verfolgtes Fahrzeug, Ausrichtung) */
  kamera: LiveKamera;
}

/** Kamera: Versatz des Ausschnitts in m gegenüber der Meldezeit, verfolgtes Fahrzeug, Bildrauschen beim Schwenk (0…1). */
export interface LiveKamera {
  dx: number;
  dy: number;
  ziel: string | null;
  rauschen: number;
}

const KAMERA_STEHT: LiveKamera = { dx: 0, dy: 0, ziel: null, rauschen: 0 };

/** Zusammengesetzter Grund beim Schwenk (Leinwand im Maßstab der Anzeige; x, y, w, h in px des Drohnenbilds). */
interface GrundSpeicher {
  c: HTMLCanvasElement;
  w: number;
  h: number;
  x: number;
  y: number;
  voll: boolean;
  zeit: number;
}
/** Nach der Zerstörung bleibt die Kamera so lange (Echtzeit, s) auf dem Wrack, dann schwenkt sie. */
export const SCHWENK_VERZUG_S = 0.5;
/** Dauer des Bildrauschens beim Schwenk (Echtzeit, s) */
export const SCHWENK_RAUSCHEN_S = 0.45;

/** Transformation Drohnenbild (px) → Leinwand (px): x' = x · s + ox */
export interface LiveTransform {
  s: number;
  ox: number;
  oy: number;
}

/**
 * Fahrtrichtung wie in den Standbildern (tools/assets/daten.py `fahrtrichtung`): Richtung des aktuellen
 * Routenabschnitts; beim Halt die Ausrichtung aus den Daten (hdg). So deckt sich das Live-Bild zur Meldezeit
 * mit dem Standbild.
 */
export function fahrtrichtungBild(ziel: Pick<Ziel, "bewegung" | "hdg">, t: number): number {
  const r = ziel.bewegung?.route;
  if (!r || r.length < 2) return ziel.hdg ?? 0;
  let a = r[0];
  let b = r[1];
  let gefunden = false;
  for (let i = 0; i < r.length - 1; i++) {
    if (r[i][0] <= t && t < r[i + 1][0]) {
      a = r[i];
      b = r[i + 1];
      gefunden = true;
      break;
    }
  }
  if (!gefunden && t >= r[r.length - 1][0]) {
    a = r[r.length - 2];
    b = r[r.length - 1];
  }
  if (Math.abs(b[1] - a[1]) + Math.abs(b[2] - a[2]) < 1e-6) return ziel.hdg ?? 0;
  return (Math.atan2(b[2] - a[2], b[1] - a[1]) * 180) / Math.PI;
}

function faehrt(ziel: Pick<Ziel, "bewegung">, t: number): boolean {
  const r = ziel.bewegung?.route;
  if (!r) return false;
  for (let i = 0; i < r.length - 1; i++) {
    if (r[i][0] <= t && t < r[i + 1][0]) return r[i][1] !== r[i + 1][1] || r[i][2] !== r[i + 1][2];
  }
  return false;
}

/** Lokale Punkte (vorwärts, rechts) in m um mitte drehen (hdg 0 = Osten, im Uhrzeigersinn). */
function drehe([lx, ly]: [number, number], mitte: Punkt, hdg: number): Punkt {
  const w = (hdg * Math.PI) / 180;
  const c = Math.cos(w);
  const s = Math.sin(w);
  return [mitte[0] + lx * c - ly * s, mitte[1] + lx * s + ly * c];
}

/** Wie lange ein Fahrzeug mit `feuert` nach der Meldezeit weiterschießt (Spielzeit, s), solange es steht. */
const FEUERT_S = 90;

export class LiveDrohnenbild {
  readonly breite: number;
  readonly hoehe: number;
  private bekannt: Map<string, EbenenFahrzeug>;
  /** Bildpunkte je Meter */
  private ppm: number;
  /** Rauchstärke der Wracks im Standbild (weniger, wo der Rauch ein Ziel verdecken würde) */
  private rauchStaerke: Map<string, number>;
  bildMs = { mittel: 0, max: 0, n: 0 };
  /** Effekte (Namen im Atlas), die das letzte Bild gezeigt hat – für Tests */
  gezeigt = new Set<string>();
  /** Kamera der zuletzt berechneten Szene (px() rechnet mit ihr) */
  private kam: LiveKamera = KAMERA_STEHT;
  private bodenWeichBild: HTMLCanvasElement | null = null;
  /**
   * Grund beim Schwenk, einmal zusammengesetzt (Luftbild, Kacheln, Boden der Meldung) für den Ausschnitt mit Rand
   * GRUND_RAND px, **in der Größe, in der er gezeichnet wird** (Maßstab s je Leinwand: Fenster am Ort, Vergrößerung):
   * Je Bild ist das dann eine Kopie 1 : 1 – ohne Grafikkarte wäre jedes verkleinerte oder vergrößerte Bild eine neue
   * Umrechnung (ca. 4–27 ms je Bild und Fenster). Neu gebaut, wenn die Kamera den Rand erreicht, sich der Maßstab
   * ändert oder Kacheln nachgeladen sind. x, y, w, h in px des Bodens der Meldung.
   */
  private grundCache = new Map<number, GrundSpeicher>();
  /** Diagnose: wie oft der Grund neu zusammengesetzt wurde, Dauer zuletzt und höchstens (ms) */
  grundBau = { n: 0, ms: 0, max: 0 };

  constructor(
    readonly res: LiveRessourcen,
    readonly id: string,
    readonly db: Drohnenbild,
    readonly eb: LiveEbenen,
    /** Standbild zur Meldezeit („Aufnahme“): gezeigt, wenn das Ziel den Ausschnitt verlassen hat */
    readonly standbild: HTMLImageElement | null = null,
  ) {
    this.breite = db.breite;
    this.hoehe = db.hoehe;
    this.ppm = 1 / db.m_pro_px;
    this.bekannt = new Map((db.ebenen?.fahrzeuge ?? []).map((f) => [f.id, f]));
    this.rauchStaerke = new Map((db.wracks ?? []).map((w) => [w.id, w.staerke]));
  }

  /** Welt (m) → Drohnenbild (px), mit dem Versatz der Kamera */
  px(p: Punkt): Punkt {
    const a = this.db.ausschnitt_m;
    return [(p[0] - a.x - this.kam.dx) * this.ppm, (p[1] - a.y - this.kam.dy) * this.ppm];
  }

  /** Bildpunkt eines Weltpunkts im Standbild (ohne Kamera) */
  private pxStandbild(p: Punkt): Punkt {
    const a = this.db.ausschnitt_m;
    return [(p[0] - a.x) * this.ppm, (p[1] - a.y) * this.ppm];
  }

  /**
   * Kamera zur Spielzeit t (B9): folgt dem ersten Fahrzeug der Meldung, das noch steht. Endet es (zerstört oder aus
   * dem Raum), bleibt die Kamera SCHWENK_VERZUG_S darauf und schwenkt dann mit kurzem Rauschen zum nächsten; gibt es
   * keines mehr, bleibt sie beim letzten. Zeiten in Echtzeit: bei Tempo ×10 ist der Verzug 5 s Spielzeit.
   */
  kamera(lage: LiveLage, t: number, tempo = 1): LiveKamera {
    const { inh, z } = lage;
    const tM = this.meldezeit(inh);
    const ids = (inh.meldungen[this.id]?.ziele ?? (this.db.ziele as BildZiel[]).map((x) => x.id)).filter((id) => inh.ziele[id]);
    if (!ids.length || t <= tM) return KAMERA_STEHT;
    const k = Math.max(1, tempo);
    const verzug = SCHWENK_VERZUG_S * k;
    const rausch = SCHWENK_RAUSCHEN_S * k;
    const ende = ids.map((id) => Math.min(z.zerstoert[id] ?? Infinity, inh.ziele[id].bis_s ?? Infinity));
    let letzter = 0;
    ende.forEach((e, i) => { if (e > ende[letzter]) letzter = i; });
    const zielBei = (x: number) => {
      for (let i = 0; i < ids.length; i++) if (x < ende[i] + verzug + rausch / 2) return i;
      return letzter;
    };
    const i = zielBei(t);
    const erster = zielBei(tM);
    // Rauschen während des Schwenks von j zum nächsten Ziel
    let rauschen = 0;
    for (let j = 0; j < ids.length; j++) {
      const s0 = ende[j] + verzug;
      if (t < s0 || t >= s0 + rausch || zielBei(s0) !== j || zielBei(s0 + rausch) === j) continue;
      const f = (t - s0) / rausch;
      rauschen = Math.max(rauschen, Math.min(1, Math.min(f, 1 - f) * 6));
    }
    const ziel = inh.ziele[ids[i]];
    const jetzt = position(ziel, Math.min(t, ende[i]));
    // Bildpunkt, an dem das Ziel stehen soll: das erste wie im Standbild, die folgenden zur Mitte hin
    let anker = this.pxStandbild(position(ziel, tM));
    if (i !== erster) anker = [Math.max(this.breite * 0.25, Math.min(this.breite * 0.75, anker[0])), Math.max(this.hoehe * 0.25, Math.min(this.hoehe * 0.75, anker[1]))];
    const a = this.db.ausschnitt_m;
    const dx = jetzt[0] - a.x - anker[0] / this.ppm;
    const dy = jetzt[1] - a.y - anker[1] / this.ppm;
    return { dx: Math.abs(dx) < 1e-3 ? 0 : dx, dy: Math.abs(dy) < 1e-3 ? 0 : dy, ziel: ids[i], rauschen };
  }

  private imBild(q: Punkt, rand = 80): boolean {
    return q[0] > -rand && q[1] > -rand && q[0] < this.breite + rand && q[1] < this.hoehe + rand;
  }

  /** Meldezeit in der Welt des Teams (bei Verstärkungen absolut, im Manifest relativ zum Einspielen). */
  meldezeit(inh: Inhalte): number {
    return inh.meldungen[this.id]?.t_s ?? this.db.t_s;
  }

  /**
   * Aufnahme zur Meldezeit (Standbild) zeichnen – die Kamera steht, fahrende Ziele verlassen den Ausschnitt oft
   * schon nach 15–40 s; dann zeigt die Ansicht das Bild, das ARGUS ausgewertet hat.
   */
  zeichneAufnahme(ctx: CanvasRenderingContext2D, tr: LiveTransform, w: number, h: number): void {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0b0e10";
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(tr.s, 0, 0, tr.s, tr.ox, tr.oy);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (this.standbild) ctx.drawImage(this.standbild, 0, 0, this.breite, this.hoehe);
    else ctx.drawImage(this.eb.boden, 0, 0, this.breite, this.hoehe);
    ctx.restore();
  }

  /** Was zur Spielzeit t im Bild ist: Fahrzeuge (mit Zustand), Figuren, ARGUS-Markierung; die Kamera folgt dem Ziel. */
  szene(lage: LiveLage, t: number, tempo = 1): Szene {
    const { inh, z } = lage;
    this.kam = this.kamera(lage, t, tempo);
    const eb = this.db.ebenen;
    const tMeldung = this.meldezeit(inh);
    const katalog = inh.fahrzeuge;
    const frames = this.res.fz.rahmen;
    // getroffene Personengruppen (Ziel:Art → Einschlagzeit): verschwinden ab dem Einschlag aus dem Bild
    const getroffen = new Map<string, number>();
    for (const id of z.reihenfolge) {
      const w = z.meldungen[id].wirkung;
      if (!w) continue;
      for (const g of w.getroffen) {
        if (g.was !== "personen") continue;
        const k = `${g.ziel}:${g.kategorie}`;
        getroffen.set(k, Math.min(getroffen.get(k) ?? Infinity, w.t_einschlag));
      }
    }
    const fahrzeuge: SzeneFahrzeug[] = [];
    const figuren: SzeneFigur[] = [];
    const lagen = new Map<string, { px: Punkt; da: boolean }>();
    for (const ziel of inh.szenario.ziele) {
      if (ziel.ungemeldet && !this.bekannt.has(ziel.id)) continue;
      const tz = z.zerstoert[ziel.id];
      const ag = ausserGefechtAb(inh, z, ziel.id);
      const halt = Math.min(tz ?? Infinity, ag ?? Infinity);
      const liegt = halt <= t;
      if (!liegt && !vorhanden(ziel, t)) continue;
      const tt = Math.min(t, halt);
      const p = position(ziel, tt);
      const q = this.px(p);
      if (!this.imBild(q)) continue;
      const hdg = fahrtrichtungBild(ziel, liegt ? halt - 0.01 : t);
      const f = katalog[ziel.typ];
      const wrack = tz !== undefined && tz <= t;
      const bek = this.bekannt.get(ziel.id);
      let sprite = f?.sprite ?? "";
      if (wrack && f?.sprite_wrack) sprite = f.sprite_wrack;
      else if (bek && (bek.darstellung === "luk_offen" || bek.darstellung === "kette_ab") && frames[bek.sprite]) sprite = bek.sprite;
      else if (ag !== undefined && ag <= t && frames[sprite.replace(/\.png$/, "_kette_ab.png")]) sprite = sprite.replace(/\.png$/, "_kette_ab.png");
      if (!frames[sprite]) continue;
      const steht = !faehrt(ziel, t) || liegt;
      fahrzeuge.push({
        id: ziel.id, sprite, px: q, hdg, wrack,
        rauch: this.rauchStaerke.get(ziel.id) ?? 1,
        feuert: !!bek?.effekte?.some((n) => n.startsWith("muendungsblitz")) && !wrack && steht && t - tMeldung < FEUERT_S,
        unschaerfe: eb?.unschaerfe?.ziel === ziel.id && !wrack ? { laenge_px: eb.unschaerfe.laenge_px, winkel: eb.unschaerfe.winkel } : undefined,
      });
      lagen.set(ziel.id, { px: q, da: true });
      // Figuren dieses Fahrzeugs (Liste aus dem Manifest, Lage zur Spielzeit)
      for (const fg of eb?.figuren ?? []) {
        if (fg.bei !== ziel.id) continue;
        const gruppe = fg.gruppe !== undefined ? ziel.personen?.[fg.gruppe] : undefined;
        if (gruppe && !vorhanden(gruppe, t, ziel)) continue;
        const art = gruppe?.art ?? fg.art;
        const tg = getroffen.get(`${ziel.id}:${art}`);
        if (tg !== undefined && t >= tg) continue;
        let w: Punkt;
        if (fg.bezug === "gruppe" && gruppe) {
          const g = position(gruppe, t);
          w = [g[0] + fg.versatz_m[0], g[1] + fg.versatz_m[1]];
        } else {
          // am Fahrzeug: nicht am Wrack, und während der Fahrt aufgesessen
          if (wrack || (!steht && !fg.oben)) continue;
          w = drehe(fg.versatz_m, p, hdg);
        }
        figuren.push({ fg, px: this.px(w) });
      }
    }
    // ARGUS-Markierung folgt dem Fahrzeug (Rahmen wie zur Meldezeit, versetzt um die Fahrt)
    const marken: LiveMarke[] = [];
    let zielImBild = false;
    for (const bz of this.db.ziele as BildZiel[]) {
      const l = lagen.get(bz.id);
      if (!l) continue;
      const [bx, by, bw, bh] = bz.box;
      const x = l.px[0] + (bx + bw / 2 - bz.mitte[0]) - bw / 2;
      const y = l.px[1] + (by + bh / 2 - bz.mitte[1]) - bh / 2;
      if (x + bw < 0 || y + bh < 0 || x > this.breite || y > this.hoehe) continue;
      zielImBild = true;
      marken.push({ id: bz.id, box: [x, y, bw, bh] });
    }
    return { t, fahrzeuge, figuren, marken, zielImBild, kamera: this.kam };
  }

  // ---------------------------------------------------------------- Zeichnen

  private sprite(ctx: CanvasRenderingContext2D, a: LiveAtlas, name: string, q: Punkt, k: number, hdg = 0, alpha = 1, anker?: [number, number]): void {
    const r = a.rahmen[name];
    if (!r) return;
    ctx.save();
    ctx.translate(q[0], q[1]);
    if (hdg) ctx.rotate((hdg * Math.PI) / 180);
    if (alpha < 1) ctx.globalAlpha *= alpha;
    const ax = anker?.[0] ?? r.ax;
    const ay = anker?.[1] ?? r.ay;
    ctx.drawImage(a.bild, r.x, r.y, r.w, r.h, -ax * r.w * k, -ay * r.h * k, r.w * k, r.h * k);
    ctx.restore();
  }

  /** Maßstab eines Fahrzeug- oder Figurenrahmens im Drohnenbild (px je Atlas-px). */
  private massFz(name: string): number {
    const r = this.res.man.fahrzeuge.rahmen[name];
    const ppm = r?.px_pro_m ?? this.res.man.fahrzeuge.px_pro_m;
    return (this.ppm / ppm) * (r?.person ? this.res.man.drohne_ebenen.person_ueberhoehung : 1);
  }

  private anim(name: string): { bilder: string[]; fps: number; px: number; ppm: number } | null {
    const a = this.res.man.effekte.animationen[name];
    const bilder = this.res.fx.animationen[name];
    if (!a || !bilder?.length) return null;
    return { bilder, fps: a.fps || 8, px: a.px, ppm: a.px_pro_m };
  }

  private effektBild(ctx: CanvasRenderingContext2D, name: string, nr: number, q: Punkt, kMeter: number | null, hdg = 0, alpha = 1): void {
    const a = this.anim(name);
    if (!a) return;
    this.gezeigt.add(name);
    const fr = a.bilder[((nr % a.bilder.length) + a.bilder.length) % a.bilder.length];
    // wahre Größe: Atlas px_pro_m → Bild px_pro_m; kMeter überschreibt (Breite in m)
    const k = kMeter !== null ? (kMeter * this.ppm) / a.px : this.ppm / a.ppm;
    this.sprite(ctx, this.res.fx, fr, q, k, hdg, alpha);
  }

  /**
   * Zeichnet die Szene in ctx (Transformation tr: Drohnenbild-px → Leinwand-px). realMs: Echtzeit für Schleifen
   * (Feuer, Rauch, Rauschen), tempo: für kurze Animationen (laufen in Echtzeit, wie auf der Karte).
   */
  zeichne(ctx: CanvasRenderingContext2D, sz: Szene, lage: LiveLage, tempo: number, realMs: number, tr: LiveTransform, w: number, h: number): void {
    const t0 = performance.now();
    this.gezeigt = new Set();
    const { eb, res } = this;
    const info = res.man.drohne_ebenen;
    const t = sz.t;
    const tp = Math.max(tempo, 0.25);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0b0e10";
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(tr.s, 0, 0, tr.s, tr.ox, tr.oy);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // Ebenen der Meldung liegen in der Welt: Die Kamera verschiebt sie (dx, dy in m → px)
    this.kam = sz.kamera;
    const ox = -sz.kamera.dx * this.ppm;
    const oy = -sz.kamera.dy * this.ppm;
    const steht = ox === 0 && oy === 0;
    if (steht) ctx.drawImage(eb.boden, 0, 0, this.breite, this.hoehe);
    else this.grund(ctx, ox, oy);

    // Krater (nach Einschlägen, unter den Fahrzeugen)
    const zu = res.man.effekte.zuordnung;
    for (const e of lage.effekte) {
      if (e.art !== "einschlag" || t < e.t + 0.3) continue;
      const danach = e.quelle.wirkmittel ? zu.wirkmittel[e.quelle.wirkmittel]?.danach : e.quelle.hintergrund ? zu.hintergrund[e.quelle.hintergrund]?.danach : undefined;
      for (const n of danach ?? []) {
        const a = res.man.effekte.animationen[n];
        if (!a || (a.fps > 0 && a.schleife)) continue;
        const q = this.px(e.pos);
        if (this.imBild(q, 60)) this.effektBild(ctx, n, e.nr ?? 0, q, null, 0, 0.85);
      }
    }

    // Fahrzeuge mit Schatten (Schattenversatz gilt im Leinwandmaß, unabhängig von der Drehung)
    const sch = info.schatten;
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${sch.alpha})`;
    ctx.shadowBlur = Math.max(0, sch.unschaerfe_m * this.ppm * tr.s * 2);
    ctx.shadowOffsetX = ctx.shadowOffsetY = sch.fahrzeug_m * this.ppm * tr.s;
    for (const f of sz.fahrzeuge) {
      const k = this.massFz(f.sprite);
      if (f.unschaerfe) {
        // Bewegungsunschärfe (M26): Sprite entlang der Fahrt verwischt
        const n = 6;
        const wr = (f.unschaerfe.winkel * Math.PI) / 180;
        for (let i = 0; i < n; i++) {
          const d = (i / (n - 1) - 0.5) * f.unschaerfe.laenge_px;
          this.sprite(ctx, res.fz, f.sprite, [f.px[0] + Math.cos(wr) * d, f.px[1] + Math.sin(wr) * d], k, f.hdg, i === 0 ? 0.55 : 0.32);
        }
      } else {
        this.sprite(ctx, res.fz, f.sprite, f.px, k, f.hdg);
      }
    }
    ctx.restore();

    // Feuer auf Wracks, Mündungsblitz feuernder Fahrzeuge
    const feuer = this.anim("feuer");
    for (const f of sz.fahrzeuge) {
      if (f.wrack && feuer) this.effektBild(ctx, "feuer", Math.floor((realMs / 1000) * feuer.fps), f.px, (res.man.effekte.animationen.feuer.groesse_m ?? 6) * 0.6, 0, 0.8);
      if (f.feuert) {
        const a = this.anim("muendungsblitz");
        const periode = 4.5;
        const phase = ((realMs / 1000 + (f.id.charCodeAt(f.id.length - 1) % 3)) % periode);
        if (a && phase < a.bilder.length / a.fps) {
          const mu = drehe([4.6, 0], [0, 0], f.hdg);
          this.effektBild(ctx, "muendungsblitz", Math.floor(phase * a.fps), [f.px[0] + mu[0] * this.ppm, f.px[1] + mu[1] * this.ppm], null, f.hdg);
        }
      }
    }

    // Figuren: am Boden mit Schatten, dann auf Fahrzeugen
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.32)";
    ctx.shadowBlur = Math.max(0, sch.unschaerfe_m * this.ppm * tr.s * 1.5);
    ctx.shadowOffsetX = ctx.shadowOffsetY = sch.person_m * this.ppm * tr.s;
    for (const f of sz.figuren) if (!f.fg.oben) this.sprite(ctx, res.fz, f.fg.sprite, f.px, this.massFz(f.fg.sprite), f.fg.hdg);
    ctx.restore();
    for (const f of sz.figuren) if (f.fg.oben) this.sprite(ctx, res.fz, f.fg.sprite, f.px, this.massFz(f.fg.sprite), f.fg.hdg);

    if (eb.kronen) ctx.drawImage(eb.kronen, ox, oy, this.breite, this.hoehe);

    // Rauch der Wracks (Fahne nach Südost, ca. 30 m)
    const rauch = this.anim("rauch");
    if (rauch) {
      for (const f of sz.fahrzeuge) {
        if (!f.wrack || f.rauch <= 0) continue;
        this.effektBild(ctx, "rauch", Math.floor((realMs / 1000) * rauch.fps + f.px[0]), f.px, 30, 0, f.rauch);
      }
    }

    this.effekteZeichnen(ctx, lage.effekte, t, tp, realMs);

    if (eb.stoerung) ctx.drawImage(eb.stoerung, ox, oy, this.breite, this.hoehe);
    ctx.drawImage(res.kamera, 0, 0, this.breite, this.hoehe);
    ctx.restore();

    const stoerung = this.db.ebenen?.bildstoerung;
    if (stoerung) this.bildstoerung(ctx, stoerung, realMs, tr, w, h);
    // Schwenk zum nächsten Ziel: kurzes, starkes Bildrauschen (Ausrichtung)
    if (sz.kamera.rauschen > 0) this.bildstoerung(ctx, 1.5 + 2 * sz.kamera.rauschen, realMs, tr, w, h, sz.kamera.rauschen);
    // Messen (Tests): Zeichenbefehle sofort ausführen lassen, damit die Zeit das Rastern enthält
    if ((globalThis as { __argusLiveMessen?: boolean }).__argusLiveMessen) ctx.getImageData(0, 0, 1, 1);

    const ms = performance.now() - t0;
    const b = this.bildMs;
    b.n += 1;
    b.mittel += (ms - b.mittel) / Math.min(b.n, 30);
    b.max = Math.max(b.max * 0.98, ms);
  }

  /** Einschläge, LM im Flug, Leuchtspur, Mündungsblitz und Nebel im Bild (wie die Karte, im Maßstab des Bildes). */
  private effekteZeichnen(ctx: CanvasRenderingContext2D, liste: Effekt[], t: number, tp: number, realMs: number): void {
    const zu = this.res.man.effekte.zuordnung;
    for (const e of liste) {
      const q = e.quelle;
      const zwm = q.wirkmittel ? zu.wirkmittel[q.wirkmittel] : undefined;
      const zhg = q.hintergrund ? zu.hintergrund[q.hintergrund] : undefined;
      switch (e.art) {
        case "einschlag":
        case "muendung": {
          const name = e.art === "muendung" ? zu.feuert[q.feuert ?? ""] ?? "muendungsblitz" : zwm?.einschlag ?? zhg?.einschlag ?? "explosion_mittel";
          const a = this.anim(name);
          if (!a || t < e.t) break;
          const bild = Math.floor(((t - e.t) / tp) * a.fps);
          if (bild >= a.bilder.length) break;
          const p = this.px(e.pos);
          if (this.imBild(p, 200)) this.effektBild(ctx, name, bild, p, null, e.richtung ?? 0);
          break;
        }
        case "flug": {
          if (!e.von || t > e.t) break;
          const ab = e.echtzeit_s ? e.t - e.echtzeit_s * tp : e.ab ?? e.t;
          if (t < ab) break;
          const f = Math.max(0, Math.min(1, (t - ab) / Math.max(0.01, e.t - ab)));
          const welt: Punkt = [e.von[0] + (e.pos[0] - e.von[0]) * f, e.von[1] + (e.pos[1] - e.von[1]) * f];
          const p = this.px(welt);
          if (!this.imBild(p, 120)) break;
          const winkel = (Math.atan2(e.pos[1] - e.von[1], e.pos[0] - e.von[0]) * 180) / Math.PI;
          const name = zwm ? zwm.flug : zhg?.flug ?? (e.echtzeit_s ? "leuchtspur" : "lm_flug");
          if (!name) break;
          const a = this.anim(name);
          if (!a) break;
          const nr = Math.floor((realMs / 1000) * a.fps);
          if (!e.echtzeit_s) {
            // Kondensstreifen und Schatten (4 m versetzt) wie auf der Karte
            const wr = (winkel * Math.PI) / 180;
            const hinten = this.px([welt[0] - Math.cos(wr) * 45, welt[1] - Math.sin(wr) * 45]);
            ctx.save();
            const g = ctx.createLinearGradient(hinten[0], hinten[1], p[0], p[1]);
            g.addColorStop(0, "rgba(255,244,208,0)");
            g.addColorStop(1, "rgba(255,244,208,0.55)");
            ctx.strokeStyle = g;
            ctx.lineWidth = 0.9 * this.ppm;
            ctx.beginPath();
            ctx.moveTo(hinten[0], hinten[1]);
            ctx.lineTo(p[0], p[1]);
            ctx.stroke();
            ctx.restore();
            ctx.save();
            ctx.filter = "brightness(0)";
            this.effektBild(ctx, name, nr, this.px([welt[0] + 2.8, welt[1] + 2.8]), null, winkel, 0.3);
            ctx.restore();
          }
          this.effektBild(ctx, name, nr, p, null, winkel);
          break;
        }
        case "nebel": {
          const name = zhg?.flaeche ?? "nebel";
          const a = this.anim(name);
          if (!a || t < e.t || t > (e.bis ?? e.t)) break;
          const r = e.radius_m ?? 30;
          const alpha = Math.max(0, Math.min(1, (t - e.t) / 5, ((e.bis ?? e.t) - t) / 20));
          const orte: Punkt[] = [[0, 0]];
          for (const [k, rr] of [[0, 0.5], [1, 0.95]] as const) {
            const n = k === 0 ? 6 : 9;
            for (let i = 0; i < n; i++) {
              const w = (i / n) * Math.PI * 2 + k * 0.35;
              orte.push([Math.cos(w) * r * rr, Math.sin(w) * r * rr * 0.85]);
            }
          }
          orte.forEach(([dx, dy], i) => {
            const p = this.px([e.pos[0] + dx, e.pos[1] + dy]);
            if (!this.imBild(p, 400)) return;
            this.effektBild(ctx, name, Math.floor((realMs / 1000) * a.fps + i * 2.7), p, null, 0, alpha * 0.85);
          });
          break;
        }
        default:
          break; // Wracks: Feuer und Rauch kommen vom Zustand des Fahrzeugs
      }
    }
  }

  /**
   * Boden, wenn die Kamera schwenkt: Luftbild des Kartenpakets (Kacheln, sonst 0,5 m/px) für den ganzen Ausschnitt,
   * darauf der Boden der Meldung an seiner Stelle in der Welt mit weichen Rändern. Außerhalb der Karte dunkles Gelände.
   * Aus dem Zwischenspeicher (grundCache), damit das Bild so schnell bleibt wie mit stehender Kamera.
   */
  private grund(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const vx = -ox;
    const vy = -oy;
    // Maßstab Drohnenbild-px → Leinwand-px; stark vergrößert (Lupe, kleine Fläche) aus dem Speicher in Originalgröße
    const sRoh = ctx.getTransform().a;
    const s = sRoh > 1.5 ? 1 : Math.round(sRoh * 100) / 100;
    if (!(s > 0)) return; // Leinwand ohne Größe (verdeckt, noch nicht gemessen)
    const g0 = this.grundCache.get(s);
    const jetzt = performance.now();
    const passt = g0 && vx >= g0.x && vy >= g0.y && vx + this.breite <= g0.x + g0.w && vy + this.hoehe <= g0.y + g0.h;
    const g = passt && (g0.voll || jetzt - g0.zeit < 500) ? g0 : this.baueGrund(vx, vy, s, jetzt);
    if (!g) return;
    if (g !== g0) {
      const ms = performance.now() - jetzt;
      this.grundBau = { n: this.grundBau.n + 1, ms, max: Math.max(this.grundBau.max, ms) };
    }
    // 1 : 1 kopiert (bis auf Bruchteile eines Bildpunkts): bilinear genügt und kostet fast nichts
    const eins = Math.abs(sRoh - s) < 0.02;
    if (eins) ctx.imageSmoothingQuality = "low";
    ctx.drawImage(g.c, (vx - g.x) * s, (vy - g.y) * s, this.breite * s, this.hoehe * s, 0, 0, this.breite, this.hoehe);
    if (eins) ctx.imageSmoothingQuality = "high";
  }

  private static readonly GRUND_RAND = 384;

  private baueGrund(vx: number, vy: number, s: number, jetzt: number): GrundSpeicher | null {
    const R = LiveDrohnenbild.GRUND_RAND;
    const w = this.breite + 2 * R;
    const h = this.hoehe + 2 * R;
    const cw = Math.ceil(w * s);
    const ch = Math.ceil(h * s);
    const alt = this.grundCache.get(s)?.c;
    const c = alt && alt.width === cw && alt.height === ch ? alt : Object.assign(document.createElement("canvas"), { width: cw, height: ch });
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const gx = Math.round(vx - R);
    const gy = Math.round(vy - R);
    const { res, db } = this;
    const mpp = db.m_pro_px;
    // Bereich des Zwischenspeichers in m
    const wx = db.ausschnitt_m.x + gx * mpp;
    const wy = db.ausschnitt_m.y + gy * mpp;
    const ww = w * mpp;
    const wh = h * mpp;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#3d4536";
    ctx.fillRect(0, 0, w, h);
    let voll = true;
    const zeichne = (bild: CanvasImageSource, bx: number, by: number, bm: number, bw: number, bh: number) => {
      // Bild bei (bx, by) m mit bm m/px; nur der Teil im Bereich
      const x0 = Math.max(wx, bx);
      const y0 = Math.max(wy, by);
      const x1 = Math.min(wx + ww, bx + bw * bm);
      const y1 = Math.min(wy + wh, by + bh * bm);
      if (x1 <= x0 || y1 <= y0) return;
      ctx.drawImage(bild, (x0 - bx) / bm, (y0 - by) / bm, (x1 - x0) / bm, (y1 - y0) / bm,
        (x0 - wx) / mpp, (y0 - wy) / mpp, (x1 - x0) / mpp, (y1 - y0) / mpp);
    };
    const lb = res.luftbild;
    if (lb) {
      const k = res.man.karte.ausdehnung_m;
      zeichne(lb.bild, 0, 0, lb.m_pro_px, k.breite / lb.m_pro_px, k.hoehe / lb.m_pro_px);
    }
    const kk = res.man.karte?.luftbild?.kacheln;
    if (kk && kachelnVerfuegbar()) {
      const m = kk.kachel_px * kk.m_pro_px;
      for (let ix = Math.max(0, Math.floor(wx / m)); ix <= Math.min(kk.spalten - 1, Math.floor((wx + ww) / m)); ix++) {
        for (let iy = Math.max(0, Math.floor(wy / m)); iy <= Math.min(kk.zeilen - 1, Math.floor((wy + wh) / m)); iy++) {
          const b = kachel(res.man, ix, iy);
          if (b === "fehlt") continue;
          if (b === "laedt") {
            voll = false;
            continue;
          }
          zeichne(b, ix * m, iy * m, kk.m_pro_px, (b as HTMLCanvasElement).width, (b as HTMLCanvasElement).height);
        }
      }
    }
    ctx.drawImage(this.bodenWeich(), -gx, -gy, this.breite, this.hoehe);
    const g: GrundSpeicher = { c, w, h, x: gx, y: gy, voll, zeit: jetzt };
    // höchstens drei Maßstäbe behalten (Fenster am Ort, Vergrößerung, Lupe)
    if (!this.grundCache.has(s) && this.grundCache.size >= 3) this.grundCache.delete(this.grundCache.keys().next().value!);
    this.grundCache.set(s, g);
    return g;
  }

  /** Boden der Meldung mit weichen Rändern (einmal je Meldung gerechnet), damit der Übergang zum Luftbild nicht auffällt. */
  private bodenWeich(): CanvasImageSource {
    if (this.bodenWeichBild) return this.bodenWeichBild;
    const c = document.createElement("canvas");
    c.width = this.breite;
    c.height = this.hoehe;
    const g = c.getContext("2d");
    if (!g) return this.eb.boden;
    g.drawImage(this.eb.boden, 0, 0, c.width, c.height);
    // Maske: Rechteck mit Abstand r zum Rand, weichgezeichnet (ohne filter: harte Kante). In 1/8 der Größe gerechnet
    // und hochskaliert – der Weichzeichner kostet ohne Grafikkarte sonst 50–100 ms je Meldung und Fenster.
    const k = 8;
    const r = 36 / k;
    const mw = Math.ceil(c.width / k);
    const mh = Math.ceil(c.height / k);
    const roh = Object.assign(document.createElement("canvas"), { width: mw, height: mh });
    const rg = roh.getContext("2d")!;
    rg.fillStyle = "#000";
    rg.fillRect(r, r, mw - 2 * r, mh - 2 * r);
    const maske = Object.assign(document.createElement("canvas"), { width: mw, height: mh });
    const m = maske.getContext("2d")!;
    m.filter = `blur(${r / 2}px)`;
    m.drawImage(roh, 0, 0);
    g.globalCompositeOperation = "destination-in";
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(m.filter === "none" ? roh : maske, 0, 0, c.width, c.height);
    this.bodenWeichBild = c;
    return c;
  }

  /** Bildstörung (M25): Rauschen und Zeilenversatz, die sich bewegen (12 Wechsel je Sekunde); `alpha` beim Schwenk. */
  private bildstoerung(ctx: CanvasRenderingContext2D, staerke: number, realMs: number, tr: LiveTransform, w: number, h: number, voll = 0): void {
    const takt = Math.floor(realMs / 83);
    let s = (takt * 2654435761) >>> 0;
    const zufall = () => {
      s = (s * 1103515245 + 12345) >>> 0;
      return (s >>> 8) / 16777216;
    };
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Bereich des Bildes auf der Leinwand
    const x0 = Math.max(0, tr.ox);
    const y0 = Math.max(0, tr.oy);
    const x1 = Math.min(w, tr.ox + this.breite * tr.s);
    const y1 = Math.min(h, tr.oy + this.hoehe * tr.s);
    if (x1 <= x0 || y1 <= y0) {
      ctx.restore();
      return;
    }
    // Zeilenversatz: einige Streifen seitlich verschoben
    const streifen = 2 + Math.floor(zufall() * 4);
    for (let i = 0; i < streifen; i++) {
      const sh = Math.max(2, Math.round((3 + zufall() * 16) * tr.s));
      const sy = Math.round(y0 + zufall() * (y1 - y0 - sh));
      const dx = Math.round((zufall() - 0.5) * 28 * staerke * tr.s);
      if (dx) ctx.drawImage(ctx.canvas, x0, sy, x1 - x0, sh, x0 + dx, sy, x1 - x0, sh);
    }
    // Rauschen (beim Schwenk fast deckend)
    ctx.globalAlpha = voll > 0 ? 0.35 + 0.6 * voll : Math.min(0.5, 0.28 * staerke + 0.04);
    ctx.globalCompositeOperation = voll > 0 ? "source-over" : "overlay";
    const pat = ctx.createPattern(this.res.rauschen, "repeat");
    if (pat) {
      pat.setTransform(new DOMMatrix([1, 0, 0, 1, Math.floor(zufall() * 192), Math.floor(zufall() * 192)]));
      ctx.fillStyle = pat;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    ctx.restore();
  }
}

/**
 * Prüfung wie tools/assets/live.py `pruefe_ebenen`: das Live-Bild zur Meldezeit in Bildgröße zusammensetzen und
 * mit dem Standbild vergleichen (mittlere Abweichung in Graustufen 0…255, je Kanal). Dazu die Lage der Figuren
 * im Vergleich zum Manifest (px zur Meldezeit). Für Tests und die Fehlersuche (argusLive.vergleich()).
 */
export async function vergleicheMitStandbild(b: LiveDrohnenbild, lage: LiveLage): Promise<{ abweichung: number; figuren: { sprite: string; soll: Punkt; ist: Punkt }[]; fahrzeuge: { id: string; soll: Punkt; ist: Punkt }[] }> {
  const c = document.createElement("canvas");
  c.width = b.breite;
  c.height = b.hoehe;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const sz = b.szene(lage, b.db.t_s);
  b.zeichne(ctx, sz, { ...lage, effekte: [] }, 1, 0, { s: 1, ox: 0, oy: 0 }, b.breite, b.hoehe);
  const a = ctx.getImageData(0, 0, b.breite, b.hoehe).data;
  const st = await ladeBild(b.db.datei);
  const c2 = document.createElement("canvas");
  c2.width = b.breite;
  c2.height = b.hoehe;
  const ctx2 = c2.getContext("2d", { willReadFrequently: true })!;
  ctx2.drawImage(st, 0, 0, b.breite, b.hoehe);
  const s = ctx2.getImageData(0, 0, b.breite, b.hoehe).data;
  let summe = 0;
  for (let i = 0; i < a.length; i += 4) summe += Math.abs(a[i] - s[i]) + Math.abs(a[i + 1] - s[i + 1]) + Math.abs(a[i + 2] - s[i + 2]);
  const figuren = sz.figuren.map((f) => ({ sprite: f.fg.sprite, soll: f.fg.px, ist: [Math.round(f.px[0] * 10) / 10, Math.round(f.px[1] * 10) / 10] as Punkt }));
  const soll = new Map((b.db.ebenen?.fahrzeuge ?? []).map((f) => [f.id, f.mitte]));
  const fahrzeuge = sz.fahrzeuge.filter((f) => soll.has(f.id)).map((f) => ({ id: f.id, soll: soll.get(f.id)!, ist: [Math.round(f.px[0] * 10) / 10, Math.round(f.px[1] * 10) / 10] as Punkt }));
  return { abweichung: Math.round((summe / (a.length * 0.75)) * 10) / 10, figuren, fahrzeuge };
}

/** Ein Live-Bild je Meldung (Ressourcen und Ebenen geladen); null, wenn die Meldung keine Ebenen hat. */
export async function erzeugeLiveBild(man: AssetManifest, id: string): Promise<LiveDrohnenbild | null> {
  const db = man.drohne[id];
  if (!db?.ebenen) return null;
  const [res, eb, standbild] = await Promise.all([ladeLiveRessourcen(man), ladeEbenen(db), ladeBild(db.datei).catch(() => null)]);
  if (!eb) return null;
  return new LiveDrohnenbild(res, id, db, eb, standbild);
}
