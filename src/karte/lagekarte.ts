// Lagekarte mit PixiJS (2D-WebGL, Rückfall Canvas) und taktischen Zeichen (milsymbol).
//
// Aufbau: Das Hintergrundbild (Topo-Karte oder Luftbild, bei starkem Zoom Luftbild-Kacheln) liegt
// in Weltkoordinaten (Meter, x Ost, y Süd) und wird skaliert. Alles andere – Raster, Zonen, Namen,
// Zeichen, Wirkradius – wird in Bildschirmkoordinaten gezeichnet, damit Linien und Schrift bei jedem
// Zoom scharf und gleich groß bleiben. Inhalte kommen nur aus den Daten (Karte, Szenario, Katalog)
// und aus dem Lagebild (src/kern/lagebild.ts).
//
// Gezeichnet wird in zwei Ebenen: Raster, Zonen, Namen und Kräfte nur bei Änderungen der Ansicht
// (Zoom, Verschieben, Größe, Vorschau); Objekte, Wirkungen und Effekte bei Änderungen des Lagebilds und –
// seit Schritt 7 – in jedem Bild, solange die Uhr läuft oder ein Effekt spielt (Bewegung entlang der
// Routen, Einschläge, LM im Flug, Leuchtspur, Rauch). Die Spielzeit kommt über setzeUhr().
import ms from "milsymbol";
import { Application, CanvasTextMetrics, Container, Graphics, Sprite, Spritesheet, type SpritesheetData, Text, TextStyle, type TextStyleOptions, Texture } from "pixi.js";
import { atlas, assetUrl, kachelnVerfuegbar, type AssetManifest } from "../assets/assets";
import type { Inhalte, Punkt } from "../inhalte/typen";
import type { Effekt } from "../kern/effekte";
import type { KartenObjekt, Lagebild, PersonenMarke, WirkungsMarke } from "../kern/lagebild";
import { LEER, bahnLage } from "../kern/lagebild";
import { bildrateMax } from "./bildrate";
import { EffektEbene } from "./effektebene";
import { zeichenKraft } from "./zeichen";

/** Spielzeit für die Karte (Bewegung und Effekte). */
export interface KartenUhr {
  t: number;
  tempo: number;
  laeuft: boolean;
}

export type Hintergrund = "topo" | "luftbild";

/** Wirkradius-Vorschau (G2) bzw. empfohlenes Wirkmittel (G3). */
export interface Vorschau {
  /** Einschlagort (vorausberechnet für eine Freigabe jetzt) */
  pos: Punkt;
  /** wo das Ziel jetzt ist (gestrichelte Linie zum Einschlagort) */
  von?: Punkt;
  radius_m: number;
  /** keine Warnung */
  ok: boolean;
  /** berührte Zonen mit Verstoß (werden hervorgehoben) */
  zonen: string[];
  /** Grenze des Einsatzbereichs (x in m), wenn verletzt oder zur Information */
  grenzeX?: number;
  grenzeVerletzt?: boolean;
  /** Beschriftung der Einsatzgrenze (aus dem Wirkmittelkatalog) */
  grenzeText?: string;
  text: string;
}

export interface KartenInfo {
  x: number;
  y: number;
  titel: string;
  zeilen: string[];
}

/** Bildschirm-Rechteck [x0, y0, x1, y1] */
export type Rechteck = [number, number, number, number];

/**
 * Nach jedem Bild (Schritt 6b): wo die Marken stehen. Die Ansicht legt dort Knöpfe aus HTML über die Leinwand
 * (Meldungsmarker, Uhrzeit des Einschlags) und führt die Linie vom Drohnenbild zum Ziel.
 */
export interface KartenBild {
  /** Rechteck der Beschriftung je Marke (Meldung oder geplante Wirkung „W-M01“) – frei von anderen Beschriftungen */
  rechtecke: Map<string, Rechteck>;
  /** Bildschirmpunkt des Zeichens je Marke und der gewählten Meldung */
  punkte: Map<string, Punkt>;
  breite: number;
  hoehe: number;
}

export interface KartenOptionen {
  hintergrund: Hintergrund;
  /** Fahrzeug-Sprites beim Hineinzoomen (nur Kontrollkarte: zeigen den echten Typ) */
  sprites?: boolean;
  /** Größe der taktischen Zeichen (milsymbol size) */
  zeichenGroesse?: number;
  onKlick?: (o: KartenObjekt) => void;
  onInfo?: (i: KartenInfo | null) => void;
  onZoom?: (faktor: number) => void;
  /** nach jedem gezeichneten Bild: Lage der Marken (siehe setzeMarken) */
  onBild?: (b: KartenBild) => void;
}

const FARBE = {
  ns: 0xd8443a,
  ez: 0xe58a24,
  ok: 0x2f9e5b,
  verstoss: 0xe0453b,
  auswahl: 0xf0b13d,
  eigen: 0x2f6fc4,
  wirkung: 0x5a5f66,
  wirkungFehl: 0xc0392b,
  geplant: 0xd8443a,
};

const SCHRIFT = "Barlow Semi Condensed, Segoe UI, Arial, sans-serif";
/** ab diesem Maßstab (Bildpunkte je Meter) Luftbild-Kacheln laden */
const KACHELN_AB = 2;
/** ab diesem Maßstab Fahrzeug-Sprites statt Zeichen (Kontrollkarte) */
const SPRITES_AB = 2.6;
const ZOOM_MAX = 8;
/** Abstand zwischen zwei Marken am selben Zeichen (Text, den die Karte als Lücke misst) */
const MARKEN_ABSTAND = "  ";

async function bildTextur(url: string): Promise<Texture> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  return Texture.from(img);
}

/** Abstand Punkt–Strecke in Bildpunkten (für Treffer beim Zeigen). */
function nahe(a: Punkt, b: Punkt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

interface ZeichenTextur {
  tex: Texture;
  ax: number;
  ay: number;
  breite: number;
  hoehe: number;
}

/** Sprite zur Spielzeit t: Wrack ab der Zerstörung, Zustand (z. B. Kette ab) ab dem Treffer, sonst intakt. */
function spriteZur(sp: NonNullable<KartenObjekt["sprite"]>, t: number, atlas: Record<string, Texture> | null): string {
  if (sp.wrack && sp.wrackAb !== undefined && t >= sp.wrackAb) return sp.wrack;
  if (sp.zustand && sp.zustandAb !== undefined && t >= sp.zustandAb) {
    const name = sp.name.replace(/\.png$/, `_${sp.zustand}.png`);
    if (!atlas || atlas[name]) return name;
  }
  return sp.name;
}

export class Lagekarte {
  private app = new Application();
  private welt = new Container();
  private grund = new Sprite();
  private kachelEbene = new Container();
  private vektor = new Graphics();
  /** Wirkungen und Vorschau (unter den Zeichen, aber dynamisch) */
  private dynUnten = new Graphics();
  private effekte: EffektEbene;
  private spriteEbene = new Container();
  private zeichenEbene = new Container();
  private ueber = new Graphics();
  private textEbene = new Container();

  private lb: Lagebild = LEER;
  private vorschau: Vorschau | null = null;
  private gewaehlt: string | null = null;
  /** Marken (Meldung bzw. „W-M01“ → Text): die Karte hält ihnen den Platz frei, die Ansicht zeichnet sie als HTML */
  private marken = new Map<string, string>();
  private bildRechtecke = new Map<string, Rechteck>();
  private bildPunkte = new Map<string, Punkt>();
  private hintergrund: Hintergrund;
  private grundStufe = -1;

  private breite = 0;
  private hoehe = 0;
  /** Bildschirm = Welt · s + (x, y) */
  private s = 1;
  private x = 0;
  private y = 0;
  private fit = 1;
  private zoomFaktor = 1;
  private zentrum: Punkt;

  private texte = new Map<string, Text>();
  private stilSchluessel = new Map<string, string>();
  private uhr: (() => KartenUhr) | null = null;
  /** Position je Objekt im zuletzt gezeichneten Bild (für Zeigen und Klicken) */
  private posJetzt = new Map<string, Punkt>();
  private statischUngueltig = true;
  private benutztStatisch = new Set<string>();
  private belegtStatisch: [number, number, number, number][] = [];
  private effektTexturen: Record<string, Texture> | null = null;
  /** Flächen bereits gesetzter Beschriftungen (Bildschirm), damit Zeichen-Beschriftungen ausweichen */
  private belegt: [number, number, number, number][] = [];
  private benutzt = new Set<string>();
  private zeichenCache = new Map<string, ZeichenTextur>();
  private zeichenSprites = new Map<string, Sprite>();
  private fahrzeugSprites = new Map<string, Sprite>();
  private schattenSprites = new Map<string, Sprite>();
  private schattenEbene = new Container();
  private kacheln = new Map<string, Sprite | "laedt">();
  private atlasTexturen: Record<string, Texture> | null = null;
  private zeichnenAngefordert = false;
  private beobachter: ResizeObserver | null = null;
  private zerstoert = false;
  private ziehen: { x: number; y: number; px: number; py: number; bewegt: boolean } | null = null;
  private aufraeumen: (() => void)[] = [];
  /** Renderer, der tatsächlich läuft (webgl oder canvas) */
  renderer = "";

  private constructor(
    private host: HTMLElement,
    private inh: Inhalte,
    private man: AssetManifest | null,
    private opt: KartenOptionen,
  ) {
    this.hintergrund = opt.hintergrund;
    this.zentrum = [inh.karte.ausdehnung_m.breite / 2, inh.karte.ausdehnung_m.hoehe / 2];
    this.effekte = new EffektEbene(inh);
    // Fehlersuche und Tests: die Karte am Element erreichbar (z. B. Bilder je Sekunde, Effekte)
    (host as unknown as { argusKarte?: Lagekarte }).argusKarte = this;
  }

  /** Für Tests: Anzahl Effekte und ob die Atlanten geladen sind. */
  get diagnose(): {
    effekte: number; effektAtlas: boolean; spriteAtlas: boolean; renderer: string; fps: number; animationen: string[];
    /** Zeichenzeit je Bild in ms (Mittel und Höchstwert der letzten Sekunde, mit Rendern) */
    bildMs: { mittel: number; max: number };
    } {
    return {
      effekte: this.effekte.anzahl, effektAtlas: !!this.effektTexturen, spriteAtlas: !!this.atlasTexturen, renderer: this.renderer,
      fps: this.bilderProSekunde, animationen: this.effekte.geladen, bildMs: this.bildMs,
    };
  }

  static async erzeugen(host: HTMLElement, inh: Inhalte, man: AssetManifest | null, opt: KartenOptionen): Promise<Lagekarte> {
    const k = new Lagekarte(host, inh, man, opt);
    await k.starten();
    return k;
  }

  private async starten(): Promise<void> {
    const w = Math.max(50, this.host.clientWidth);
    const h = Math.max(50, this.host.clientHeight);
    await this.app.init({
      width: w,
      height: h,
      background: this.hintergrund === "topo" ? "#e7e2d6" : "#3a3f35",
      antialias: true,
      autoStart: false,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
      preference: ["webgl", "canvas"],
    });
    this.renderer = this.app.renderer.name;
    this.app.ticker.stop();
    const c = this.app.canvas;
    c.style.display = "block";
    c.setAttribute("data-renderer", this.renderer);
    this.host.appendChild(c);
    this.welt.addChild(this.grund, this.kachelEbene);
    // Krater unter den Fahrzeugen; Explosion, Feuer, Rauch und LM über Fahrzeugen und Zeichen (sonst verdeckt
    // das taktische Zeichen den Einschlag), Beschriftungen ganz oben
    this.app.stage.addChild(this.welt, this.vektor, this.dynUnten, this.effekte.unten, this.schattenEbene, this.spriteEbene,
      this.zeichenEbene, this.effekte.oben, this.ueber, this.textEbene);
    this.groesse(w, h);
    this.ereignisse(c);
    this.beobachter = new ResizeObserver(() => {
      const nw = this.host.clientWidth;
      const nh = this.host.clientHeight;
      if (nw > 10 && nh > 10 && (nw !== this.breite || nh !== this.hoehe)) this.groesse(nw, nh);
    });
    this.beobachter.observe(this.host);
    await document.fonts?.ready;
    void this.ladeGrund();
    if (this.man) void this.ladeAtlas();
    // Takt für Bewegung und Effekte: zeichnet nur, solange sich etwas bewegt (höchstens 30 Bilder/s)
    this.app.ticker.maxFPS = 30;
    this.app.ticker.add(() => this.takt());
    this.app.ticker.start();
    this.zeichnen();
  }

  zerstoeren(): void {
    this.zerstoert = true;
    this.app.ticker.stop();
    this.effekte.zerstoeren();
    this.beobachter?.disconnect();
    this.aufraeumen.forEach((f) => f());
    for (const z of this.zeichenCache.values()) z.tex.destroy(true);
    this.app.destroy(true, { children: true });
  }

  // ---------------------------------------------------------------- öffentliche Schnittstelle

  setzeLagebild(lb: Lagebild): void {
    this.lb = lb;
    this.zeichnen(true);
  }

  setzeVorschau(v: Vorschau | null): void {
    this.vorschau = v;
    this.zeichnen();
  }

  setzeGewaehlt(id: string | null): void {
    this.gewaehlt = id;
    this.zeichnen(true);
  }

  /**
   * Marken als HTML über der Karte (Schritt 6b): Für jede Meldung (bzw. geplante Wirkung „W-M01“) in der Liste
   * setzt die Karte ihre Beschriftung unsichtbar mit diesem Text – so weichen sich Marken und Beschriftungen aus –
   * und meldet nach jedem Bild Rechteck und Zeichenpunkt (onBild).
   */
  setzeMarken(m: Map<string, string>): void {
    this.marken = m;
    this.zeichnen(true);
  }

  /** Bildschirmpunkt des Zeichens einer Meldung im zuletzt gezeichneten Bild (Tests, Fehlersuche). */
  punktVon(meldung: string): Punkt | null {
    const o = this.lb.objekte.find((x) => x.id === meldung || x.meldungen?.includes(meldung));
    const p = o && this.posJetzt.get(o.id);
    return p ? this.bs(p) : null;
  }

  /** Spielzeit für Bewegung und Effekte (ohne: Standbild an den Positionen des Lagebilds). */
  setzeUhr(uhr: (() => KartenUhr) | null): void {
    this.uhr = uhr;
    this.zeichnen(true);
  }

  setzeEffekte(liste: Effekt[]): void {
    this.effekte.setze(liste);
    this.zeichnen(true);
  }

  /** Bilder je Sekunde der letzten Sekunde (für Tests und die Fehlersuche). */
  bilderProSekunde = 0;
  /** Zeichenzeit je Bild (ms) der letzten Sekunde */
  bildMs = { mittel: 0, max: 0 };
  private bildZaehler = { n: 0, ab: 0, summe: 0, max: 0 };
  private letztesBild = 0;

  /**
   * Takt (PixiJS-Ticker): so viele Bilder, wie die Lage braucht.
   *  • Einschlag, Mündungsblitz, LM oder Leuchtspur unterwegs: 30 Bilder/s.
   *  • Uhr läuft (Fahrzeuge fahren): 12–30 Bilder/s je nach Tempo und Zoom (bei ×1 in der Gesamtansicht
   *    bewegt sich ein Fahrzeug nur wenige Bildpunkte je Sekunde).
   *  • Uhr steht, nur Schleifen (Feuer, Rauch, Nebel): 12 Bilder/s; sonst nur bei Änderungen.
   * Höchstens `fps` aus der Adresszeile (schwache Rechner, Variante C mit vielen Fenstern an einem PC).
   */
  private takt(): void {
    if (this.zerstoert || !this.uhr || !this.breite) return;
    const u = this.uhr();
    const jetzt = performance.now();
    let ziel: number;
    if (this.effekte.aktiv(u.t, u.tempo, true)) ziel = 30;
    else if (u.laeuft) ziel = Math.min(30, Math.max(12, 6 * u.tempo * Math.max(1, this.s)));
    else if (this.effekte.aktiv(u.t, u.tempo)) ziel = 12;
    else return;
    ziel = Math.min(ziel, bildrateMax());
    if (jetzt - this.letztesBild < 1000 / ziel - 6) return;
    this.letztesBild = jetzt;
    this.allesZeichnen();
    this.app.render();
    const dauer = performance.now() - jetzt;
    const b = this.bildZaehler;
    b.n += 1;
    b.summe += dauer;
    b.max = Math.max(b.max, dauer);
    if (jetzt - b.ab >= 1000) {
      this.bilderProSekunde = Math.round((b.n * 1000) / (jetzt - b.ab));
      this.bildMs = { mittel: Math.round((b.summe / b.n) * 10) / 10, max: Math.round(b.max * 10) / 10 };
      this.bildZaehler = { n: 0, ab: jetzt, summe: 0, max: 0 };
      this.host.dataset.fps = String(this.bilderProSekunde);
    }
  }

  setzeHintergrund(h: Hintergrund): void {
    if (h === this.hintergrund) return;
    this.hintergrund = h;
    this.grundStufe = -1;
    this.app.renderer.background.color = h === "topo" ? 0xe7e2d6 : 0x3a3f35;
    void this.ladeGrund();
    this.zeichnen();
  }

  zoom(faktor: number, um?: Punkt): void {
    const neu = Math.max(1, Math.min(ZOOM_MAX, this.zoomFaktor * faktor));
    const p = um ?? [this.breite / 2, this.hoehe / 2];
    const welt: Punkt = [(p[0] - this.x) / this.s, (p[1] - this.y) / this.s];
    this.zoomFaktor = neu;
    this.s = this.fit * neu;
    this.x = p[0] - welt[0] * this.s;
    this.y = p[1] - welt[1] * this.s;
    this.begrenzen();
    this.opt.onZoom?.(neu);
    this.zeichnen();
  }

  ganzeKarte(): void {
    this.zoomFaktor = 1;
    this.s = this.fit;
    this.begrenzen();
    this.opt.onZoom?.(1);
    this.zeichnen();
  }

  /** Fokus, der wartet, bis die Leinwand ihre Größe hat (Replay der Auswertung öffnet die Karte mit Ausschnitt). */
  private fokusAusstehend: { pos: Punkt; faktor: number } | null = null;

  /** Auf einen Punkt zoomen (z. B. gewählte Meldung). Hat die Leinwand noch keine Größe, gilt der Fokus ab der ersten. */
  zeigeAuf(pos: Punkt, faktor = 3): void {
    if (!this.breite || !this.hoehe) {
      this.fokusAusstehend = { pos, faktor };
      return;
    }
    this.fokusAusstehend = null;
    this.zoomFaktor = Math.max(1, Math.min(ZOOM_MAX, faktor));
    this.s = this.fit * this.zoomFaktor;
    this.x = this.breite / 2 - pos[0] * this.s;
    this.y = this.hoehe / 2 - pos[1] * this.s;
    this.begrenzen();
    this.opt.onZoom?.(this.zoomFaktor);
    this.zeichnen();
  }

  // ---------------------------------------------------------------- Ansicht

  private groesse(w: number, h: number): void {
    const welt: Punkt = this.breite ? [(this.breite / 2 - this.x) / this.s, (this.hoehe / 2 - this.y) / this.s] : this.zentrum;
    this.breite = w;
    this.hoehe = h;
    this.app.renderer.resize(w, h);
    const k = this.inh.karte.ausdehnung_m;
    this.fit = Math.min(w / k.breite, h / k.hoehe);
    this.s = this.fit * this.zoomFaktor;
    this.x = w / 2 - welt[0] * this.s;
    this.y = h / 2 - welt[1] * this.s;
    this.begrenzen();
    this.zeichnen();
    if (this.fokusAusstehend && w && h) this.zeigeAuf(this.fokusAusstehend.pos, this.fokusAusstehend.faktor);
  }

  private begrenzen(): void {
    const k = this.inh.karte.ausdehnung_m;
    const bw = k.breite * this.s;
    const bh = k.hoehe * this.s;
    this.x = bw <= this.breite ? (this.breite - bw) / 2 : Math.min(0, Math.max(this.breite - bw, this.x));
    // passt die Karte in der Höhe, liegt sie oben; unten bleibt Platz für die Legende
    this.y = bh <= this.hoehe ? 0 : Math.min(0, Math.max(this.hoehe - bh, this.y));
  }

  private bs(p: Punkt): Punkt {
    return [p[0] * this.s + this.x, p[1] * this.s + this.y];
  }

  private ereignisse(c: HTMLCanvasElement): void {
    const an = <K extends keyof HTMLElementEventMap>(typ: K, f: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => {
      c.addEventListener(typ, f as EventListener, o);
      this.aufraeumen.push(() => c.removeEventListener(typ, f as EventListener, o));
    };
    const lokal = (e: PointerEvent | WheelEvent | MouseEvent): Punkt => {
      const r = c.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    an("wheel", (e) => {
      e.preventDefault();
      this.zoom(e.deltaY < 0 ? 1.25 : 0.8, lokal(e));
    }, { passive: false });
    an("pointerdown", (e) => {
      const [px, py] = lokal(e);
      this.ziehen = { x: this.x, y: this.y, px, py, bewegt: false };
      c.setPointerCapture(e.pointerId);
    });
    an("pointermove", (e) => {
      const p = lokal(e);
      if (this.ziehen) {
        const dx = p[0] - this.ziehen.px;
        const dy = p[1] - this.ziehen.py;
        if (Math.hypot(dx, dy) > 4) this.ziehen.bewegt = true;
        if (this.ziehen.bewegt && this.zoomFaktor > 1) {
          this.x = this.ziehen.x + dx;
          this.y = this.ziehen.y + dy;
          this.begrenzen();
          this.zeichnen();
          c.style.cursor = "grabbing";
          this.opt.onInfo?.(null);
          return;
        }
      }
      this.zeigen(p);
    });
    an("pointerup", (e) => {
      const z = this.ziehen;
      this.ziehen = null;
      c.style.cursor = "";
      if (z && !z.bewegt) {
        const o = this.objektBei(lokal(e));
        if (o?.meldung && this.opt.onKlick) this.opt.onKlick(o);
      }
    });
    an("pointerleave", () => {
      this.opt.onInfo?.(null);
      c.style.cursor = "";
    });
    an("dblclick", (e) => {
      if (this.zoomFaktor > 1) this.ganzeKarte();
      else this.zoom(2.5, lokal(e));
    });
  }

  private objektBei(p: Punkt): KartenObjekt | null {
    let best: KartenObjekt | null = null;
    let d = 18;
    for (const o of this.lb.objekte) {
      const pos = this.posJetzt.get(o.id);
      if (!pos) continue;
      const dd = nahe(this.bs(pos), p);
      if (dd < d) {
        d = dd;
        best = o;
      }
    }
    return best;
  }

  private zeigen(p: Punkt): void {
    const c = this.app.canvas;
    const o = this.objektBei(p);
    if (o) {
      c.style.cursor = o.meldung && this.opt.onKlick ? "pointer" : "default";
      const [sx, sy] = this.bs(this.posJetzt.get(o.id) ?? o.pos);
      this.opt.onInfo?.({ x: sx, y: sy, titel: o.titel, zeilen: o.zeilen });
      return;
    }
    c.style.cursor = this.zoomFaktor > 1 ? "grab" : "";
    const pers = this.lb.personen.find((q) => nahe(this.bs(this.posJetzt.get(q.id) ?? q.pos), p) < 10);
    if (pers) {
      const [sx, sy] = this.bs(this.posJetzt.get(pers.id) ?? pers.pos);
      this.opt.onInfo?.({ x: sx, y: sy, titel: pers.titel, zeilen: pers.getroffen ? ["getroffen"] : [] });
      return;
    }
    const w = this.lb.wirkungen.find((q) => nahe(this.bs(q.pos), p) < Math.max(10, q.radius_m * this.s));
    if (w) {
      const [sx, sy] = this.bs(w.pos);
      this.opt.onInfo?.({ x: sx, y: sy, titel: w.text, zeilen: w.zeilen });
      return;
    }
    this.opt.onInfo?.(null);
  }

  // ---------------------------------------------------------------- Bilder laden

  private async ladeGrund(): Promise<void> {
    const man = this.man;
    if (!man) return;
    const stufen = this.hintergrund === "topo" ? [man.karte.topo] : man.karte.luftbild.stufen;
    const soll = this.hintergrund;
    for (let i = 0; i < stufen.length; i++) {
      try {
        const tex = await bildTextur(assetUrl(stufen[i].datei));
        if (this.zerstoert || soll !== this.hintergrund) return;
        if (i < this.grundStufe) continue;
        this.grundStufe = i;
        this.grund.texture = tex;
        this.grund.scale.set(stufen[i].m_pro_px);
        this.zeichnen();
      } catch (e) {
        console.warn("Karte: Bild nicht geladen", stufen[i].datei, e);
      }
    }
  }

  private async ladeAtlas(): Promise<void> {
    const laden = async (welcher: "fahrzeuge" | "effekte") => {
      const a = await atlas(this.man!, welcher);
      const tex = await bildTextur(a.bildUrl);
      const sheet = new Spritesheet(tex, a.json as SpritesheetData);
      await sheet.parse();
      return sheet.textures as Record<string, Texture>;
    };
    const [fz, ef] = await Promise.allSettled([laden("fahrzeuge"), laden("effekte")]);
    if (this.zerstoert) return;
    if (fz.status === "fulfilled") this.atlasTexturen = fz.value;
    else console.warn("Karte: Sprite-Atlas nicht geladen", fz.reason);
    if (ef.status === "fulfilled") this.effektTexturen = ef.value;
    else console.warn("Karte: Effekt-Atlas nicht geladen", ef.reason);
    this.effekte.setzeTexturen(this.man!, this.effektTexturen);
    this.zeichnen(true);
  }

  private kachelnPruefen(): void {
    const man = this.man;
    const zeigen = !!man && this.hintergrund === "luftbild" && this.s >= KACHELN_AB && kachelnVerfuegbar();
    this.kachelEbene.visible = zeigen;
    if (!zeigen || !man) return;
    const k = man.karte.luftbild.kacheln;
    const m = k.kachel_px * k.m_pro_px;
    const x0 = Math.max(0, Math.floor(-this.x / this.s / m));
    const y0 = Math.max(0, Math.floor(-this.y / this.s / m));
    const x1 = Math.min(k.spalten - 1, Math.floor((this.breite - this.x) / this.s / m));
    const y1 = Math.min(k.zeilen - 1, Math.floor((this.hoehe - this.y) / this.s / m));
    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        const schl = `${ix}_${iy}`;
        if (this.kacheln.has(schl)) continue;
        this.kacheln.set(schl, "laedt");
        const pfad = k.muster.replace("{x}", String(ix)).replace("{y}", String(iy));
        bildTextur(assetUrl(pfad)).then((tex) => {
          if (this.zerstoert) return;
          const sp = new Sprite(tex);
          sp.position.set(ix * m, iy * m);
          sp.scale.set(k.m_pro_px);
          this.kachelEbene.addChild(sp);
          this.kacheln.set(schl, sp);
          this.zeichnen();
        }).catch(() => this.kacheln.delete(schl));
      }
    }
  }

  // ---------------------------------------------------------------- Zeichnen

  /** Neu zeichnen, höchstens einmal je Bild. nurDynamisch: Ansicht unverändert (Lagebild, Auswahl, Effekte). */
  zeichnen(nurDynamisch = false): void {
    if (!nurDynamisch) this.statischUngueltig = true;
    if (this.zeichnenAngefordert || this.zerstoert) return;
    this.zeichnenAngefordert = true;
    requestAnimationFrame(() => {
      this.zeichnenAngefordert = false;
      if (this.zerstoert || !this.breite) return;
      this.allesZeichnen();
      this.app.render();
    });
  }

  private hell(): boolean {
    return this.hintergrund === "topo";
  }

  private text(schluessel: string, inhalt: string, stil: TextStyleOptions, x: number, y: number, ax = 0.5, ay = 0.5, rot = 0): Text {
    let t = this.texte.get(schluessel);
    const stilSchl = `${stil.fontSize}|${stil.fontWeight}|${stil.fontStyle}|${String(stil.fill)}|${JSON.stringify(stil.stroke)}`;
    if (!t) {
      t = new Text({ text: inhalt, style: stil });
      this.texte.set(schluessel, t);
      this.stilSchluessel.set(schluessel, stilSchl);
      this.textEbene.addChild(t);
    } else {
      if (t.text !== inhalt) t.text = inhalt;
      // Stil nur setzen, wenn er sich ändert: sonst rendert PixiJS die Schrift in jedem Bild neu
      if (this.stilSchluessel.get(schluessel) !== stilSchl) {
        Object.assign(t.style, stil);
        this.stilSchluessel.set(schluessel, stilSchl);
      }
    }
    t.anchor.set(ax, ay);
    t.position.set(Math.round(x), Math.round(y));
    t.rotation = rot;
    t.visible = true;
    this.benutzt.add(schluessel);
    return t;
  }

  private rechteck(t: Text): [number, number, number, number] {
    const w = t.width;
    const h = t.height;
    return [t.x - w * t.anchor.x, t.y - h * t.anchor.y, t.x + w * (1 - t.anchor.x), t.y + h * (1 - t.anchor.y)];
  }

  private frei(r: [number, number, number, number]): boolean {
    return !this.belegt.some((b) => r[0] < b[2] && r[2] > b[0] && r[1] < b[3] && r[3] > b[1])
      && r[0] >= 0 && r[1] >= 0 && r[2] <= this.breite && r[3] <= this.hoehe;
  }

  private belegen(t: Text): void {
    this.belegt.push(this.rechteck(t));
  }

  private stil(groesse: number, gewicht: "400" | "500" | "600" | "700" = "600", farbe?: number, kursiv = false): TextStyleOptions {
    const hell = this.hell();
    return {
      fontFamily: SCHRIFT,
      fontSize: groesse,
      fontWeight: gewicht,
      fontStyle: kursiv ? "italic" : "normal",
      fill: farbe ?? (hell ? 0x1d252c : 0xf4f6f8),
      stroke: { color: hell ? 0xf6f3ea : 0x0d1114, width: 3, join: "round" },
    };
  }

  private strich(g: Graphics, pts: Punkt[], lang: number, luecke: number, zu = false): void {
    const liste = zu ? [...pts, pts[0]] : pts;
    for (let i = 0; i < liste.length - 1; i++) {
      const [ax, ay] = liste[i];
      const [bx, by] = liste[i + 1];
      const l = Math.hypot(bx - ax, by - ay);
      for (let d = 0; d < l; d += lang + luecke) {
        const e = Math.min(l, d + lang);
        g.moveTo(ax + ((bx - ax) * d) / l, ay + ((by - ay) * d) / l).lineTo(ax + ((bx - ax) * e) / l, ay + ((by - ay) * e) / l);
      }
    }
  }

  private allesZeichnen(): void {
    this.welt.position.set(this.x, this.y);
    this.welt.scale.set(this.s);
    if (this.statischUngueltig) {
      this.kachelnPruefen();
      this.benutzt = new Set();
      this.belegt = [];
      const g = this.vektor;
      g.clear();
      this.rahmenUndRaster(g);
      this.zonen(g);
      this.namen();
      this.kraefte(g);
      this.benutztStatisch = this.benutzt;
      this.belegtStatisch = [...this.belegt];
      this.statischUngueltig = false;
    }
    // dynamisch: Wirkungen, Vorschau, Objekte, Personen, Effekte zur aktuellen Spielzeit
    this.benutzt = new Set();
    this.belegt = [...this.belegtStatisch];
    const u = this.ueber;
    const d = this.dynUnten;
    d.clear();
    u.clear();
    const uhr = this.uhr?.() ?? null;
    this.bildRechtecke = new Map();
    this.bildPunkte = new Map();
    this.wirkungen(d, this.lb.wirkungen);
    this.vorschauZeichnen(d);
    this.objekte(u, this.lb.objekte, uhr?.t ?? null);
    this.personen(u, this.lb.personen, uhr?.t ?? null);
    if (uhr) this.effekte.zeichnen(uhr.t, uhr.tempo, (p) => this.bs(p), this.s, performance.now(), this.breite, this.hoehe);
    for (const [k, t] of this.texte) if (!this.benutzt.has(k) && !this.benutztStatisch.has(k)) t.visible = false;
    this.opt.onBild?.({ rechtecke: this.bildRechtecke, punkte: this.bildPunkte, breite: this.breite, hoehe: this.hoehe });
  }

  /** Stil einer Marke (Platzhalter in der Größe des HTML-Knopfs, unsichtbar). */
  private markenStil(): TextStyleOptions {
    return { ...this.stil(13, "700"), stroke: { color: 0x000000, width: 10, join: "round" } };
  }

  private rahmenUndRaster(g: Graphics): void {
    const k = this.inh.karte;
    const r = k.raster;
    const hell = this.hell();
    const linie = hell ? 0x33404c : 0xffffff;
    const alpha = hell ? 0.22 : 0.3;
    const [x0, y0] = this.bs([0, 0]);
    const [x1, y1] = this.bs([k.ausdehnung_m.breite, k.ausdehnung_m.hoehe]);
    for (let i = 1; i < r.spalten.length; i++) {
      const [x] = this.bs([i * r.zelle_m, 0]);
      g.moveTo(x, y0).lineTo(x, y1);
    }
    const zeilen = Math.round(k.ausdehnung_m.hoehe / r.zelle_m);
    for (let j = 1; j < zeilen; j++) {
      const [, y] = this.bs([0, j * r.zelle_m]);
      g.moveTo(x0, y).lineTo(x1, y);
    }
    g.stroke({ width: 1, color: linie, alpha, pixelLine: true });
    g.rect(x0, y0, x1 - x0, y1 - y0).stroke({ width: 1.5, color: hell ? 0x33404c : 0xffffff, alpha: 0.6 });
    const st = this.stil(12, "700");
    const oben = Math.max(y0, 0) + 4;
    const links = Math.max(x0, 0) + 5;
    for (let i = 0; i < r.spalten.length; i++) {
      const [x] = this.bs([(i + 0.5) * r.zelle_m, 0]);
      if (x > -20 && x < this.breite + 20) this.text(`sp-${i}`, r.spalten[i], st, x, oben, 0.5, 0);
    }
    for (let j = 0; j < zeilen; j++) {
      const [, y] = this.bs([0, (j + 0.5) * r.zelle_m]);
      if (y > -20 && y < this.hoehe + 20) this.text(`ze-${j}`, String(j + (r.zeilen_ab ?? 1)), st, links, y, 0, 0.5);
    }
  }

  private zonen(g: Graphics): void {
    const verletzt = new Set(this.vorschau?.zonen ?? []);
    for (const z of this.inh.szenario.zonen) {
      const teile = z.geometrie.typ === "polygon" ? [z.geometrie.punkte] : z.geometrie.typ === "polygone" ? z.geometrie.teile : [];
      const farbe = z.typ === "no_strike" ? FARBE.ns : FARBE.ez;
      const hervor = verletzt.has(z.id);
      for (const teil of teile) {
        const pts = teil.map((p) => this.bs(p));
        const flach = pts.flat();
        g.poly(flach, true).fill({ color: farbe, alpha: hervor ? 0.34 : z.typ === "no_strike" ? 0.2 : 0.1 });
        if (z.typ === "no_strike") {
          g.poly(flach, true).stroke({ width: hervor ? 4 : 2.5, color: farbe, alpha: 0.95 });
        } else {
          this.strich(g, pts, 9, 5, true);
          g.stroke({ width: hervor ? 3.5 : 2, color: farbe, alpha: 0.95 });
        }
      }
      if (z.geometrie.typ === "kreis") {
        const [cx, cy] = this.bs(z.geometrie.mitte);
        g.circle(cx, cy, z.geometrie.radius_m * this.s).fill({ color: farbe, alpha: 0.18 }).stroke({ width: 2, color: farbe });
      }
      const pos = z.beschriftung ?? this.zonenBeschriftung(z.typ, teile);
      if (pos) {
        const [lx, ly] = this.bs(pos);
        const kurz = z.typ === "no_strike" ? `${z.id} ${z.name.split(" ")[0]}` : `${z.id} ≤ ${z.max_wirkradius_m ?? "?"} m`;
        this.belegen(this.text(`zone-${z.id}`, kurz, { ...this.stil(12.5, "700", farbe === FARBE.ns ? 0xb5281f : 0xb35f0a), stroke: { color: 0xfffbf2, width: 3.5, join: "round" } }, lx, ly));
      }
    }
  }

  private zonenBeschriftung(typ: string, teile: Punkt[][]): Punkt | null {
    if (!teile.length) return null;
    const pts = teile[0];
    if (typ === "no_strike") {
      const n = pts.length;
      return [pts.reduce((a, p) => a + p[0], 0) / n, pts.reduce((a, p) => a + p[1], 0) / n - 18];
    }
    // Einschränkungsgebiet: am nördlichsten Rand (dort ist die Karte meist frei), etwas nach innen
    const minY = Math.min(...pts.map((p) => p[1]));
    const oben = pts.filter((p) => p[1] - minY < 1);
    const x = oben.reduce((a, p) => a + p[0], 0) / oben.length;
    return [x, minY + 40];
  }

  private namen(): void {
    const k = this.inh.karte;
    const gross = this.stil(13.5, "700");
    for (const n of k.namen) {
      const [x, y] = this.bs(n.pos);
      this.belegen(this.text(`name-${n.text}`, n.text, gross, x, y));
    }
    const namenText = new Set(k.namen.map((n) => n.text));
    for (const p of k.punkte) {
      if (namenText.has(p.name)) continue;
      const [x, y] = this.bs(p.pos);
      this.belegen(this.text(`punkt-${p.id}`, p.name, this.stil(12, "600"), x + 8, y, 0, 0.5));
    }
    // Straßen- und Wegenamen entlang der Linie (z. B. „Feldweg Süd“ für den Lagehinweis von G3)
    for (const l of k.linien) {
      if (l.art !== "strasse" && l.art !== "feldweg") continue;
      const lage = this.linienMitte(l.punkte);
      if (!lage) continue;
      const [x, y] = this.bs(lage.p);
      this.text(`linie-${l.id}`, l.name, this.stil(11.5, "500", undefined, true), x, y, 0.5, 1.15, lage.winkel);
    }
  }

  private linienMitte(pts: Punkt[]): { p: Punkt; winkel: number } | null {
    if (pts.length < 2) return null;
    const laengen = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
    const gesamt = laengen.reduce((a, b) => a + b, 0);
    // Beschriftung bei 40 % der Länge, aber nur innerhalb der Karte
    let rest = gesamt * 0.4;
    for (let i = 0; i < laengen.length; i++) {
      if (rest <= laengen[i]) {
        const f = rest / laengen[i];
        const a = pts[i];
        const b = pts[i + 1];
        let w = Math.atan2(b[1] - a[1], b[0] - a[0]);
        if (w > Math.PI / 2) w -= Math.PI;
        if (w < -Math.PI / 2) w += Math.PI;
        const p: Punkt = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        const k = this.inh.karte.ausdehnung_m;
        if (p[0] < 20 || p[1] < 20 || p[0] > k.breite - 20 || p[1] > k.hoehe - 20) return null;
        return { p, winkel: w };
      }
      rest -= laengen[i];
    }
    return null;
  }

  private kraefte(g: Graphics): void {
    for (const k of this.inh.szenario.kraefte) {
      if (!k.ausserhalb) continue;
      const y = k.pfeil_y ?? k.pos[1];
      const [sx, sy] = this.bs([0, y]);
      const links = Math.max(sx, 2);
      g.moveTo(links + 44, sy).lineTo(links + 12, sy).stroke({ width: 3, color: FARBE.eigen });
      g.poly([links + 2, sy, links + 14, sy - 7, links + 14, sy + 7], true).fill({ color: FARBE.eigen });
      this.zeichenSprite(`kraft-${k.id}`, zeichenKraft(this.inh, k.typ, k.zugehoerigkeit), 15, links + 62, sy, 1);
      this.belegen(this.text(`kraft-${k.id}`, `${k.name} · ${k.text ?? "außerhalb"}`, this.stil(11.5, "600", this.hell() ? 0x1f4f99 : 0xdbe9ff), links + 78, sy, 0, 0.5));
    }
  }

  private wirkungen(g: Graphics, liste: WirkungsMarke[]): void {
    for (const w of liste) {
      const [x, y] = this.bs(w.pos);
      const r = Math.max(5, w.radius_m * this.s);
      if (w.geplant) {
        // freigegeben, Einschlag steht aus: gestrichelter Umriss in Rot, Uhrzeit des Einschlags
        const rr = Math.max(r, 9);
        this.strich(g, this.kreisPunkte(x, y, rr), 7, 4, true);
        g.stroke({ width: 2.2, color: FARBE.geplant, alpha: 0.95 });
        const marke = this.marken.get(w.id);
        const t = this.beschriften(`geplant-${w.id}`, marke ?? `Einschlag ${w.text.split(" · ").pop()}`,
          marke ? this.markenStil() : { ...this.stil(11.5, "700", 0xb5281f), stroke: { color: 0xfffbf2, width: 3.5, join: "round" } }, [
            [x, y - rr - 3, 0.5, 1], [x, y + rr + 3, 0.5, 0], [x + rr + 4, y, 0, 0.5], [x - rr - 4, y, 1, 0.5],
          ]);
        t.alpha = marke ? 0 : 1;
        if (marke) {
          this.bildRechtecke.set(w.id, this.rechteck(t));
          this.bildPunkte.set(w.id, [x, y]);
        }
        continue;
      }
      const farbe = w.fehl ? FARBE.wirkungFehl : FARBE.wirkung;
      g.circle(x, y, r).fill({ color: farbe, alpha: 0.18 });
      this.strich(g, this.kreisPunkte(x, y, r), 5, 4, true);
      g.stroke({ width: 1.6, color: farbe, alpha: 0.9 });
      const k = 5;
      g.moveTo(x - k, y - k).lineTo(x + k, y + k).moveTo(x + k, y - k).lineTo(x - k, y + k).stroke({ width: 2, color: farbe });
    }
  }

  private kreisPunkte(x: number, y: number, r: number): Punkt[] {
    const n = Math.max(16, Math.min(96, Math.round(r / 2)));
    return Array.from({ length: n }, (_, i) => [x + r * Math.cos((i / n) * Math.PI * 2), y + r * Math.sin((i / n) * Math.PI * 2)] as Punkt);
  }

  private vorschauZeichnen(g: Graphics): void {
    const v = this.vorschau;
    if (!v) return;
    const farbe = v.ok ? FARBE.ok : FARBE.verstoss;
    if (v.grenzeX !== undefined) {
      const [gx] = this.bs([v.grenzeX, 0]);
      const [, y0] = this.bs([0, 0]);
      const [, y1] = this.bs([0, this.inh.karte.ausdehnung_m.hoehe]);
      this.strich(g, [[gx, y0], [gx, y1]], 10, 6);
      g.stroke({ width: v.grenzeVerletzt ? 3 : 2, color: v.grenzeVerletzt ? FARBE.verstoss : FARBE.eigen, alpha: 0.9 });
      this.text("grenze", v.grenzeText ?? "Einsatzgrenze", this.stil(11.5, "700", v.grenzeVerletzt ? 0xb5281f : 0x1f4f99), gx - 6, Math.max(y0, 0) + 22, 1, 0);
    }
    const [x, y] = this.bs(v.pos);
    const r = v.radius_m * this.s;
    if (v.von && Math.hypot(v.von[0] - v.pos[0], v.von[1] - v.pos[1]) > 2) {
      // Weg des Ziels bis zum Einschlag
      const [vx, vy] = this.bs(v.von);
      this.strich(g, [[vx, vy], [x, y]], 6, 4);
      g.stroke({ width: 2, color: farbe, alpha: 0.9 });
      g.circle(vx, vy, 3).fill({ color: farbe });
    }
    g.circle(x, y, Math.max(r, 3)).fill({ color: farbe, alpha: 0.22 }).stroke({ width: 2.5, color: farbe, alpha: 1 });
    if (r < 14) {
      // kleiner Wirkradius: Fadenkreuz, damit die Vorschau sichtbar bleibt
      g.moveTo(x - 22, y).lineTo(x - 8, y).moveTo(x + 8, y).lineTo(x + 22, y)
        .moveTo(x, y - 22).lineTo(x, y - 8).moveTo(x, y + 8).lineTo(x, y + 22).stroke({ width: 2, color: farbe });
    }
    const rr = Math.max(r, 22);
    this.beschriften("vorschau", v.text, { ...this.stil(12.5, "700", v.ok ? 0x1d6b3e : 0xb5281f), stroke: { color: 0xfffbf2, width: 4, join: "round" } }, [
      [x, y + rr + 4, 0.5, 0],
      [x + rr * 0.72 + 6, y - rr * 0.72 - 4, 0, 1],
      [x - rr * 0.72 - 6, y - rr * 0.72 - 4, 1, 1],
      [x + rr + 6, y, 0, 0.5],
      [x - rr - 6, y, 1, 0.5],
      [x, y - rr - 4, 0.5, 1],
      [x + rr * 0.72 + 6, y + rr * 0.72 + 4, 0, 0],
      [x - rr * 0.72 - 6, y + rr * 0.72 + 4, 1, 0],
      [x, y + rr + 22, 0.5, 0],
    ]);
  }

  private zeichenTextur(code: string, groesse: number, menge?: number): ZeichenTextur {
    const schl = `${code}|${groesse}|${menge ?? ""}`;
    let z = this.zeichenCache.get(schl);
    if (!z) {
      const faktor = 2;
      const sym = new ms.Symbol(code, { size: groesse, colorMode: "Medium", outlineColor: "rgba(255,255,255,0.85)", outlineWidth: 3, quantity: menge ? String(menge) : undefined, infoColor: "#1d252c" });
      const canvas = sym.asCanvas(faktor);
      const a = sym.getAnchor();
      const sz = sym.getSize();
      z = { tex: Texture.from(canvas), ax: a.x / sz.width, ay: a.y / sz.height, breite: sz.width, hoehe: sz.height };
      this.zeichenCache.set(schl, z);
    }
    return z;
  }

  private zeichenSprite(schl: string, code: string, groesse: number, x: number, y: number, alpha: number, menge?: number): ZeichenTextur {
    const z = this.zeichenTextur(code, groesse, menge);
    let sp = this.zeichenSprites.get(schl);
    if (!sp) {
      sp = new Sprite(z.tex);
      this.zeichenSprites.set(schl, sp);
      this.zeichenEbene.addChild(sp);
    }
    sp.texture = z.tex;
    sp.anchor.set(z.ax, z.ay);
    sp.scale.set(0.5);
    sp.position.set(Math.round(x), Math.round(y));
    sp.alpha = alpha;
    sp.visible = true;
    this.benutzt.add(`zs:${schl}`);
    return z;
  }

  /** Beschriftung an der ersten freien Stelle der Kandidaten setzen (sonst an der ersten). */
  private beschriften(schl: string, inhalt: string, stil: TextStyleOptions, kandidaten: [number, number, number, number][]): Text {
    let t: Text | null = null;
    for (const [x, y, ax, ay] of kandidaten) {
      t = this.text(schl, inhalt, stil, x, y, ax, ay);
      if (this.frei(this.rechteck(t))) break;
      t = null;
    }
    if (!t) {
      const [x, y, ax, ay] = kandidaten[0];
      t = this.text(schl, inhalt, stil, x, y, ax, ay);
    }
    this.belegen(t);
    return t;
  }

  private objekte(u: Graphics, liste: KartenObjekt[], t: number | null): void {
    const groesse = this.opt.zeichenGroesse ?? 20;
    const spritesZeigen = !!this.opt.sprites && !!this.atlasTexturen && this.s >= SPRITES_AB;
    const k = this.inh.karte.ausdehnung_m;
    const istGewaehlt = (o: KartenObjekt) => !!this.gewaehlt && (o.id === this.gewaehlt || !!o.meldungen?.includes(this.gewaehlt));
    // gewählte zuletzt zeichnen (liegen oben), aber zuerst beschriften (bekommen den besten Platz)
    const sortiert = [...liste].sort((a, b) => Number(istGewaehlt(a)) - Number(istGewaehlt(b)));
    const marken: { o: KartenObjekt; x: number; y: number; links: number; rechts: number; oben: number; unten: number; gew: boolean; alpha: number }[] = [];
    this.posJetzt.clear();
    for (const o of sortiert) {
      // Position zur laufenden Spielzeit aus der Bahn (Bewegung), sonst die des Lagebilds
      const lage = o.bahn && t !== null ? bahnLage(o.bahn, t) : { pos: o.pos, hdg: o.sprite?.hdg ?? 0 };
      if (!lage) continue;
      const pos = lage.pos;
      if (pos[0] < -5 || pos[1] < -5 || pos[0] > k.breite + 5 || pos[1] > k.hoehe + 5) continue;
      this.posJetzt.set(o.id, pos);
      const [x, y] = this.bs(pos);
      if (x < -40 || y < -40 || x > this.breite + 40 || y > this.hoehe + 40) continue;
      const gew = istGewaehlt(o);
      const alpha = o.zustand === "erledigt" ? 0.42 : 1;
      const spriteName = o.sprite && t !== null ? spriteZur(o.sprite, t, this.atlasTexturen) : o.sprite?.name;
      if (spritesZeigen && o.sprite && spriteName && this.atlasTexturen?.[spriteName]) {
        const tex = this.atlasTexturen[spriteName];
        let sp = this.fahrzeugSprites.get(o.id);
        if (!sp) {
          sp = new Sprite(tex);
          sp.anchor.set(0.5);
          this.fahrzeugSprites.set(o.id, sp);
          this.spriteEbene.addChild(sp);
        }
        sp.texture = tex;
        sp.scale.set(this.s / (this.man?.fahrzeuge.px_pro_m ?? 12));
        sp.rotation = ((o.bahn && t !== null ? lage.hdg : o.sprite.hdg) * Math.PI) / 180;
        sp.position.set(x, y);
        sp.visible = true;
        sp.alpha = o.zustand === "erledigt" ? 0.75 : 1;
        // Schatten: derselbe Sprite schwarz, Alpha 0,45, 1,2 m nach Südost (docs/ASSETS.md)
        let sch = this.schattenSprites.get(o.id);
        if (!sch) {
          sch = new Sprite(tex);
          sch.anchor.set(0.5);
          sch.tint = 0x000000;
          sch.alpha = 0.45;
          this.schattenSprites.set(o.id, sch);
          this.schattenEbene.addChild(sch);
        }
        sch.texture = tex;
        sch.scale.copyFrom(sp.scale);
        sch.rotation = sp.rotation;
        sch.position.set(x + 1.2 * this.s, y + 1.2 * this.s);
        sch.visible = true;
        this.benutzt.add(`fs:${o.id}`);
        const h = 3.5 * this.s;
        if (gew) u.circle(x, y, 6 * this.s).stroke({ width: 3, color: FARBE.auswahl });
        if (o.zustand === "bekaempft") u.circle(x, y, 5 * this.s).stroke({ width: 2, color: 0x7a1b14, alpha: 0.8 });
        if (o.schutz) this.schutzMarke(u, o.schutz, x + h * 0.9, y - h * 0.9);
        marken.push({ o, x, y, links: h, rechts: h, oben: h, unten: h, gew, alpha });
        continue;
      }
      if (gew) u.circle(x, y, groesse * 0.95).fill({ color: FARBE.auswahl, alpha: 0.25 }).stroke({ width: 3, color: FARBE.auswahl });
      const z = this.zeichenSprite(`obj-${o.id}`, o.sidc, groesse, x, y, alpha, o.menge);
      if (o.zustand === "bekaempft") {
        const d = groesse * 0.55;
        u.moveTo(x - d, y - d).lineTo(x + d, y + d).moveTo(x + d, y - d).lineTo(x - d, y + d).stroke({ width: 3, color: 0x7a1b14, alpha: 0.9 });
      }
      if (o.ungemeldet) u.circle(x, y, groesse * 0.95).stroke({ width: 2, color: 0x7c3aed, alpha: 0.9 });
      if (o.schutz) this.schutzMarke(u, o.schutz, x + z.breite * (1 - z.ax) * 0.5 + 3, y - z.hoehe * z.ay * 0.5 - 3);
      const m = { o, x, y, links: z.breite * z.ax, rechts: z.breite * (1 - z.ax), oben: z.hoehe * z.ay, unten: z.hoehe * (1 - z.ay), gew, alpha };
      marken.push(m);
      this.belegt.push([x - m.links, y - m.oben, x + m.rechts, y + m.unten]);
    }
    for (const m of [...marken].reverse()) {
      // Marken als HTML (Schritt 6b): Platz freihalten, Beschriftung unsichtbar. Mehrere offene Meldungen zum selben
      // Ziel (Folgemeldung) stehen nebeneinander.
      const ids = (m.o.meldungen ?? [m.o.id]).filter((id) => this.marken.has(id));
      const st = ids.length ? this.markenStil()
        : m.gew ? { ...this.stil(12.5, "700", 0x5a3a00), stroke: { color: 0xffe2a0, width: 4, join: "round" as const } } : this.stil(11.5, m.o.zustand === "erledigt" ? "500" : "700");
      const t = this.beschriften(`obj-${m.o.id}`, ids.length ? ids.map((id) => this.marken.get(id)!).join(MARKEN_ABSTAND) : m.o.text, st, [
        [m.x, m.y + m.unten + 1, 0.5, 0],
        [m.x, m.y - m.oben - 1, 0.5, 1],
        [m.x + m.rechts + 3, m.y, 0, 0.5],
        [m.x - m.links - 3, m.y, 1, 0.5],
        [m.x + m.rechts + 2, m.y + m.unten, 0, 0],
        [m.x - m.links - 2, m.y - m.oben, 1, 1],
      ]);
      t.alpha = ids.length ? 0 : m.alpha < 1 ? 0.7 : 1;
      if (ids.length) {
        const r = this.rechteck(t);
        if (ids.length === 1) this.bildRechtecke.set(ids[0], r);
        else {
          // Rechteck nach der Breite der einzelnen Texte aufteilen
          const breiten = ids.map((id) => CanvasTextMetrics.measureText(this.marken.get(id)!, new TextStyle(st)).width);
          const luecke = CanvasTextMetrics.measureText(MARKEN_ABSTAND, new TextStyle(st)).width;
          const f = (r[2] - r[0]) / (breiten.reduce((a, b) => a + b, 0) + luecke * (ids.length - 1) || 1);
          let x0 = r[0];
          ids.forEach((id, i) => {
            const w = breiten[i] * f;
            this.bildRechtecke.set(id, [x0, r[1], x0 + w, r[3]]);
            x0 += w + luecke * f;
          });
        }
        for (const id of ids) this.bildPunkte.set(id, [m.x, m.y]);
      }
      if (m.gew && this.gewaehlt) this.bildPunkte.set(this.gewaehlt, [m.x, m.y]);
    }
    const da = (k: string) => this.benutzt.has(k) || this.benutztStatisch.has(k);
    for (const [schl, sp] of this.zeichenSprites) if (!da(`zs:${schl}`)) sp.visible = false;
    for (const [schl, sp] of this.fahrzeugSprites) if (!da(`fs:${schl}`)) sp.visible = false;
    for (const [schl, sp] of this.schattenSprites) if (!da(`fs:${schl}`)) sp.visible = false;
  }

  /** Schutzzeichen am taktischen Zeichen: Rotes Kreuz (Sanität) oder allgemein „geschützt“. */
  private schutzMarke(u: Graphics, art: "rotes_kreuz" | "geschuetzt", x: number, y: number): void {
    const a = 7;
    u.rect(x - a, y - a, 2 * a, 2 * a).fill({ color: 0xffffff }).stroke({ width: 1.2, color: 0x1d252c });
    if (art === "rotes_kreuz") {
      u.rect(x - 1.8, y - 5, 3.6, 10).fill({ color: 0xd0201a });
      u.rect(x - 5, y - 1.8, 10, 3.6).fill({ color: 0xd0201a });
    } else {
      u.poly([x, y - 5, x + 5, y, x, y + 5, x - 5, y], true).fill({ color: 0x2f6fc4 });
    }
  }

  private personen(u: Graphics, liste: PersonenMarke[], t: number | null): void {
    const farbe: Record<string, number> = { zivil: 0xffffff, soldat: 0xb3261e, besatzung_ergibt_sich: 0xffffff };
    for (const p of liste) {
      const lage = p.bahn && t !== null ? bahnLage(p.bahn, t) : { pos: p.pos };
      if (!lage) continue;
      this.posJetzt.set(p.id, lage.pos);
      const [x, y] = this.bs(lage.pos);
      const r = 4.5;
      u.circle(x, y, r + 1.5).fill({ color: 0x111111, alpha: 0.8 });
      u.circle(x, y, r).fill({ color: farbe[p.art] ?? 0xdddddd });
      if (p.art === "besatzung_ergibt_sich") u.circle(x, y, r + 3).stroke({ width: 1.5, color: 0x2f6fc4 });
      if (p.getroffen) u.moveTo(x - 6, y - 6).lineTo(x + 6, y + 6).moveTo(x + 6, y - 6).lineTo(x - 6, y + 6).stroke({ width: 2.5, color: 0xd8443a });
      const text = `${p.anzahl}${p.klein ? ` · ${p.klein} Kinder` : ""}`;
      this.beschriften(`pers-${p.id}`, text, this.stil(11, "700"), [[x + 8, y, 0, 0.5], [x - 8, y, 1, 0.5], [x, y + 7, 0.5, 0], [x, y - 7, 0.5, 1]]);
    }
  }
}
