// Effekte auf der Lagekarte: spielt die Effektliste (src/kern/effekte.ts) zur laufenden Spielzeit ab.
//
// Welche Animation wofür, steht im Asset-Manifest (effekte.zuordnung, Schritt 5b):
//   Wirkmittel  MRS: Einschlag explosion_mittel, danach krater · LM: Flug lm_flug, Einschlag explosion_klein,
//               danach krater · PZA: Flug leuchtspur, Einschlag treffer_direkt
//   Hintergrund feindartillerie: einschlag_artillerie, danach krater · panzerabwehr: leuchtspur, treffer_direkt
//               · rauch: Fläche aus mehreren nebel
//   Wrack       zerstoert: feuer und rauch · ausser_gefecht: nichts
//   feuert      kanone: muendungsblitz · moerser: muendungsblitz_steil
//   abschuss    (seit 2.1) danach Abschussrauch: abschussrauch · fahrt: staub hinter fahrenden Fahrzeugen
// Fehlt die Zuordnung (ältere Assets), gilt der Effekt aus katalog_wirkmittel.json (`effekt`) bzw. eine
// eingebaute Vorgabe. Anker je Rahmen kommen aus dem Atlas (Leuchtspur: Kopf, Rauch: Quelle, Blitz: Mündung).
//
// Zeit: Ort und Beginn kommen aus der Spielzeit (alle Fenster gleich). Kurze Animationen (Einschlag,
// Mündungsblitz, Leuchtspur) laufen in Echtzeit ab: Bei Tempo ×10 dauert ein Einschlag 10 s Spielzeit,
// sieht aber aus wie bei ×1. Die LM fliegt in Spielzeit (ihr Flug ist Teil der Regel). Schleifen (Feuer,
// Rauch, Nebel) laufen in Echtzeit weiter, auch wenn die Uhr steht.
import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import type { AssetManifest, EffektZuordnung } from "../assets/typen";
import type { Inhalte, Punkt } from "../inhalte/typen";
import type { Effekt, StaubWolke } from "../kern/effekte";
import { STAUB_N, STAUB_TAKT_S } from "../kern/effekte";

/** Mindestgröße auf dem Bildschirm (px, längste Seite), damit ein Effekt auch in der Gesamtansicht auffällt. */
const MIN_PX: Record<string, number> = {
  explosion_mittel: 34, explosion_klein: 24, treffer_direkt: 20, einschlag_artillerie: 36, feuer: 12, rauch: 26,
  krater: 7, lm_flug: 22, leuchtspur: 34, muendungsblitz: 16, muendungsblitz_steil: 20, nebel: 40,
  abschussrauch: 22, staub: 14,
};
/** Wie lange eine Schleife am Wrack läuft (Spielzeit, s); danach blendet sie aus. */
const WRACK_DAUER: Record<string, number> = { feuer: 150, rauch: 420 };
/** Ein- und Ausblenden von Flächen und Wrack-Schleifen (Spielzeit, s) */
const EIN_S = 5;
const AUS_S = 20;

/** Vorgabe, wenn das Manifest keine Zuordnung hat (Assets vor Schritt 5b). */
const VORGABE: EffektZuordnung = {
  wirkmittel: {},
  hintergrund: {
    feindartillerie: { einschlag: "explosion_mittel", danach: ["krater"] },
    panzerabwehr: { einschlag: "treffer_direkt" },
    rauch: { flaeche: "rauch" },
  },
  wrack: { zerstoert: ["feuer", "rauch"], ausser_gefecht: [] },
  feuert: {},
  abschuss: {},
};

interface Anim {
  name: string;
  bilder: Texture[];
  fps: number;
  /** Bildpunkte je Meter im Atlas */
  ppm: number;
  /** längste Seite im Atlas (px) */
  px: number;
  schleife: boolean;
}

/** Was ein Effekt konkret zeigt (einmal je Liste aufgelöst). */
interface Aufgeloest {
  e: Effekt;
  haupt?: Anim;
  /** nach dem Mündungsblitz: Abschussrauch (seit 2.1) */
  rauch?: Anim;
  danach: Anim[];
  /** Wrack-Schleifen mit Dauer */
  schleifen: { a: Anim; bis: number }[];
  /** Ende in Spielzeit, ab dem nichts mehr animiert (Infinity: bleibt, z. B. Krater) */
  aktivBis: (tempo: number) => number;
  aktivAb: (tempo: number) => number;
}

export class EffektEbene {
  /** unter den Fahrzeugen: Krater */
  readonly unten = new Container();
  /** über Fahrzeugen und Zeichen: Einschläge, Feuer, Rauch, Nebel, LM, Leuchtspur, Mündungsblitz */
  readonly oben = new Container();
  private linien = new Graphics();
  private anims: Record<string, Anim> = {};
  private zu: EffektZuordnung = VORGABE;
  private liste: Aufgeloest[] = [];
  private roh: Effekt[] = [];
  private pool = new Map<string, Sprite>();
  private benutzt = new Set<string>();
  /** Animationen, die das letzte Bild gezeigt hat, und Zahl der Staubwolken (Tests, Fehlersuche) */
  gezeigt = new Set<string>();
  staubWolken = 0;

  constructor(private readonly inh: Inhalte) {
    this.oben.addChild(this.linien);
  }

  /** Texturen aus dem geladenen Effekt-Atlas übernehmen. */
  setzeTexturen(man: AssetManifest, effekte: Record<string, Texture> | null): void {
    if (effekte) {
      for (const [name, a] of Object.entries(man.effekte.animationen)) {
        const n = Math.max(1, a.bilder);
        const bilder = Array.from({ length: n }, (_, i) => effekte[`${name}_${String(i).padStart(2, "0")}`]).filter(Boolean);
        if (bilder.length) this.anims[name] = { name, bilder, fps: a.fps || 0, ppm: a.px_pro_m, px: Math.max(a.px, a.hoehe_px ?? 0), schleife: a.schleife };
      }
    }
    const z = man.effekte.zuordnung;
    if (z) this.zu = { ...VORGABE, ...z, hintergrund: { ...VORGABE.hintergrund, ...z.hintergrund }, wrack: { ...VORGABE.wrack, ...z.wrack } };
    this.aufloesen();
  }

  setze(liste: Effekt[]): void {
    this.roh = liste;
    this.aufloesen();
  }

  get anzahl(): number {
    return this.roh.length;
  }

  /** Namen der Animationen, die diese Ebene kennt (Tests und Fehlersuche). */
  get geladen(): string[] {
    return Object.keys(this.anims);
  }

  private anim(name: string | null | undefined): Anim | undefined {
    return name ? this.anims[name] : undefined;
  }

  /** Animationen je Effekt nach der Zuordnung bestimmen. */
  private aufloesen(): void {
    const kurz = (a: Anim | undefined) => (a && a.fps > 0 ? a.bilder.length / a.fps : 0);
    this.liste = this.roh.map((e): Aufgeloest => {
      const q = e.quelle;
      const zwm = q.wirkmittel ? this.zu.wirkmittel[q.wirkmittel] : undefined;
      const zhg = q.hintergrund ? this.zu.hintergrund[q.hintergrund] : undefined;
      switch (e.art) {
        case "einschlag": {
          const name = zwm?.einschlag ?? (q.wirkmittel ? this.inh.wirkmittel[q.wirkmittel]?.effekt : undefined) ?? zhg?.einschlag ?? "explosion_mittel";
          const haupt = this.anim(name);
          const danach = (zwm?.danach ?? zhg?.danach ?? (q.wirkmittel && (this.inh.wirkmittel[q.wirkmittel]?.wirkradius_m ?? 0) >= 10 ? ["krater"] : []))
            .map((n) => this.anim(n)).filter((a): a is Anim => !!a);
          return { e, haupt, danach, schleifen: [], aktivAb: () => e.t - 0.1, aktivBis: (tp) => e.t + (kurz(haupt) + 0.2) * tp };
        }
        case "flug": {
          const name = zwm ? zwm.flug : zhg?.flug ?? (e.echtzeit_s ? "leuchtspur" : "lm_flug");
          const haupt = this.anim(name);
          const ab = (tp: number) => (e.echtzeit_s ? e.t - e.echtzeit_s * tp : e.ab ?? e.t);
          return { e, haupt, danach: [], schleifen: [], aktivAb: (tp) => ab(tp) - 0.1, aktivBis: () => e.t + 0.05 };
        }
        case "muendung": {
          const haupt = this.anim(this.zu.feuert[q.feuert ?? ""] ?? "muendungsblitz");
          const rauch = this.anim(this.zu.abschuss?.[q.feuert ?? ""]);
          return { e, haupt, rauch, danach: [], schleifen: [], aktivAb: () => e.t - 0.1, aktivBis: (tp) => e.t + (Math.max(kurz(haupt), kurz(rauch)) + 0.1) * tp };
        }
        case "nebel": {
          const haupt = this.anim(zhg?.flaeche ?? "nebel") ?? this.anim("rauch");
          return { e, haupt, danach: [], schleifen: [], aktivAb: () => e.t, aktivBis: () => e.bis ?? e.t };
        }
        case "wrack": {
          const schleifen = (this.zu.wrack[q.folge ?? "zerstoert"] ?? []).map((n) => this.anim(n))
            .filter((a): a is Anim => !!a).map((a) => ({ a, bis: e.t + (WRACK_DAUER[a.name] ?? 300) }));
          return { e, danach: [], schleifen, aktivAb: () => e.t, aktivBis: () => Math.max(e.t, ...schleifen.map((s) => s.bis)) };
        }
      }
    });
  }

  /**
   * Gibt es zur Spielzeit t etwas zu animieren? kurz: nur Einschläge, Flüge und Blitze (dann zeichnet die
   * Karte jedes Bild); sonst zählen auch Schleifen (Feuer, Rauch, Nebel), die bei stehender Uhr langsamer laufen.
   */
  aktiv(t: number, tempo: number, nurKurz = false): boolean {
    const tp = Math.max(tempo, 0.25);
    return this.liste.some((x) => {
      if (nurKurz && (x.e.art === "nebel" || x.e.art === "wrack")) return false;
      return t >= x.aktivAb(tp) && t <= x.aktivBis(tp);
    });
  }

  private sprite(schl: string, tex: Texture, ebene: Container): Sprite {
    let sp = this.pool.get(schl);
    if (!sp) {
      sp = new Sprite(tex);
      this.pool.set(schl, sp);
      ebene.addChild(sp);
    }
    sp.texture = tex;
    const a = tex.defaultAnchor;
    sp.anchor.set(a?.x ?? 0.5, a?.y ?? 0.5);
    sp.visible = true;
    sp.alpha = 1;
    sp.rotation = 0;
    sp.tint = 0xffffff;
    this.benutzt.add(schl);
    return sp;
  }

  /** Maßstab: wahre Größe (s Bildpunkte je Meter), mindestens MIN_PX auf dem Bildschirm. */
  private massstab(a: Anim, s: number, faktor = 1): number {
    return Math.max(s / a.ppm, (MIN_PX[a.name] ?? 0) / a.px) * faktor;
  }

  /**
   * Zeichnet alle Effekte zur Spielzeit t. bs: Welt → Bildschirm, s: Bildpunkte je Meter, realMs: Echtzeit
   * für Schleifen; nur was im Bild liegt, wird gezeichnet.
   */
  zeichnen(t: number, tempo: number, bs: (p: Punkt) => Punkt, s: number, realMs: number, breite: number, hoehe: number,
    staub: { id: string; wolken: StaubWolke[] }[] = []): void {
    this.benutzt.clear();
    this.gezeigt = new Set();
    this.staubWolken = 0;
    const g = this.linien;
    g.clear();
    const tp = Math.max(tempo, 0.25);
    const imBild = (p: Punkt, rand = 60) => p[0] > -rand && p[1] > -rand && p[0] < breite + rand && p[1] < hoehe + rand;
    const schleifenBild = (a: Anim, versatz: number) => Math.floor((realMs / 1000) * a.fps + versatz) % a.bilder.length;
    for (const x of this.liste) {
      const { e } = x;
      // Krater und andere „danach“-Bilder bleiben stehen
      if (e.art === "einschlag" && t >= e.t + 0.3) {
        x.danach.forEach((a, i) => {
          if (a.fps > 0 && a.schleife) return;
          const p = bs(e.pos);
          if (!imBild(p)) return;
          const sp = this.sprite(`${e.id}-d${i}`, a.bilder[(e.nr ?? 0) % a.bilder.length], this.unten);
          sp.position.set(p[0], p[1]);
          sp.scale.set(this.massstab(a, s));
          sp.alpha = 0.85;
        });
      }
      if (t < x.aktivAb(tp) || t > x.aktivBis(tp)) continue;
      switch (e.art) {
        case "einschlag":
        case "muendung": {
          if (t < e.t) break;
          const p = bs(e.pos);
          if (!imBild(p)) break;
          // Abschussrauch unter dem Blitz: quillt auf und zieht ab (Echtzeit wie der Blitz)
          const r = x.rauch;
          if (r) {
            const rb = Math.floor(((t - e.t) / tp) * r.fps);
            if (rb < r.bilder.length) {
              const sr = this.sprite(`${e.id}-r`, r.bilder[rb], this.oben);
              this.gezeigt.add(r.name);
              sr.position.set(p[0], p[1]);
              sr.scale.set(this.massstab(r, s, e.quelle.feuert === "kanone" ? 0.7 : 1));
              sr.alpha = 0.9;
            }
          }
          const a = x.haupt;
          if (!a) break;
          const bild = Math.floor(((t - e.t) / tp) * a.fps);
          if (bild >= a.bilder.length) break;
          const sp = this.sprite(e.id, a.bilder[bild], this.oben);
          this.gezeigt.add(a.name);
          sp.position.set(p[0], p[1]);
          sp.scale.set(this.massstab(a, s));
          if (e.richtung !== undefined) sp.rotation = (e.richtung * Math.PI) / 180;
          break;
        }
        case "flug": {
          if (!e.von || t > e.t) break;
          const ab = e.echtzeit_s ? e.t - e.echtzeit_s * tp : e.ab ?? e.t;
          if (t < ab) break;
          const f = Math.max(0, Math.min(1, (t - ab) / Math.max(0.01, e.t - ab)));
          const welt: Punkt = [e.von[0] + (e.pos[0] - e.von[0]) * f, e.von[1] + (e.pos[1] - e.von[1]) * f];
          const p = bs(welt);
          const q = bs(e.pos);
          const winkel = Math.atan2(e.pos[1] - e.von[1], e.pos[0] - e.von[0]);
          if (!e.echtzeit_s && welt[0] > 0) {
            // Kondensstreifen ab dem Kartenrand (LM)
            const fr = e.von[0] < 0 ? -e.von[0] / ((e.pos[0] - e.von[0]) || 1) : 0;
            const rand = bs([e.von[0] + (e.pos[0] - e.von[0]) * fr, e.von[1] + (e.pos[1] - e.von[1]) * fr]);
            // dunkler Saum und heller Kern: sichtbar auf Luftbild und topografischer Karte
            g.moveTo(rand[0], rand[1]).lineTo(p[0], p[1]).stroke({ width: 3.5, color: 0x1d2328, alpha: 0.22 });
            g.moveTo(rand[0], rand[1]).lineTo(p[0], p[1]).stroke({ width: 1.5, color: 0xfff4d0, alpha: 0.65 });
          }
          if (!imBild(p) && !imBild(q, 0)) break;
          const a = x.haupt;
          if (a) {
            const bild = schleifenBild(a, 0);
            if (!e.echtzeit_s) {
              // Schatten wie bei Fahrzeugen, 4 m versetzt
              const sch = this.sprite(`${e.id}-sch`, a.bilder[bild], this.oben);
              const ps = bs([welt[0] + 2.8, welt[1] + 2.8]);
              sch.position.set(ps[0], ps[1]);
              sch.rotation = winkel;
              sch.scale.set(this.massstab(a, s));
              sch.tint = 0x000000;
              sch.alpha = 0.3;
            }
            const sp = this.sprite(e.id, a.bilder[bild], this.oben);
            sp.position.set(p[0], p[1]);
            sp.rotation = winkel;
            sp.scale.set(this.massstab(a, s));
          } else {
            // ohne Atlas: Strich mit hellem Kopf
            const schweif = bs([welt[0] - Math.cos(winkel) * 20, welt[1] - Math.sin(winkel) * 20]);
            g.moveTo(schweif[0], schweif[1]).lineTo(p[0], p[1]).stroke({ width: 4, color: 0xffb020, alpha: 0.35 });
            g.moveTo(schweif[0], schweif[1]).lineTo(p[0], p[1]).stroke({ width: 1.5, color: 0xfff2a8, alpha: 1 });
          }
          break;
        }
        case "nebel": {
          const a = x.haupt;
          if (!a || t < e.t || t > (e.bis ?? e.t)) break;
          const r = e.radius_m ?? 30;
          const alpha = Math.max(0, Math.min(1, (t - e.t) / EIN_S, ((e.bis ?? e.t) - t) / AUS_S));
          // Schwaden über die Fläche: Mitte und ein Ring (bei großer Fläche zwei)
          const groesse = a.px / a.ppm;
          const ringe = r > groesse ? [0.5, 0.95] : [0.55];
          const orte: [number, number][] = [[0, 0]];
          ringe.forEach((rr, k) => {
            const n = k === 0 ? 6 : 9;
            for (let i = 0; i < n; i++) {
              const w = (i / n) * Math.PI * 2 + k * 0.35;
              orte.push([Math.cos(w) * r * rr, Math.sin(w) * r * rr * 0.85]);
            }
          });
          orte.forEach(([dx, dy], i) => {
            const p = bs([e.pos[0] + dx, e.pos[1] + dy]);
            if (!imBild(p, 160)) return;
            const sp = this.sprite(`${e.id}-${i}`, a.bilder[schleifenBild(a, i * 2.7)], this.oben);
            sp.position.set(p[0], p[1]);
            sp.scale.set(this.massstab(a, s, i === 0 ? 1.15 : 0.95));
            sp.alpha = alpha * 0.85;
          });
          break;
        }
        case "wrack": {
          const p = bs(e.pos);
          if (!imBild(p, 100)) break;
          x.schleifen.forEach(({ a, bis }, i) => {
            if (t < e.t || t > bis) return;
            const sp = this.sprite(`${e.id}-${i}`, a.bilder[schleifenBild(a, (e.nr ?? 0) * 3 + i * 5)], this.oben);
            sp.position.set(p[0], p[1]);
            sp.scale.set(this.massstab(a, s));
            sp.alpha = Math.max(0, Math.min(1, (t - e.t) / 2, (bis - t) / AUS_S)) * (a.name === "rauch" ? 0.8 : 1);
          });
          break;
        }
      }
    }
    this.staubZeichnen(staub, bs, s, imBild);
    for (const [schl, sp] of this.pool) if (!this.benutzt.has(schl)) sp.visible = false;
  }

  /** Staub hinter fahrenden Fahrzeugen (seit 2.1): Wolken wachsen mit dem Alter und blenden aus, unter den Fahrzeugen. */
  private staubZeichnen(staub: { id: string; wolken: StaubWolke[] }[], bs: (p: Punkt) => Punkt, s: number, imBild: (p: Punkt, rand?: number) => boolean): void {
    const a = this.anim(this.zu.fahrt ?? "staub");
    if (!a || !staub.length) return;
    const dauer = STAUB_TAKT_S * STAUB_N;
    for (const { id, wolken } of staub) {
      for (const w of wolken) {
        const p = bs(w.pos);
        if (!imBild(p, 30)) continue;
        const f = Math.max(0, Math.min(1, w.alter / dauer));
        const sp = this.sprite(`staub-${id}-${Math.round((w.pos[0] + w.pos[1]) * 10)}`, a.bilder[w.nr % a.bilder.length], this.unten);
        this.gezeigt.add(a.name);
        this.staubWolken += 1;
        // Wind nach Südost: die Wolke zieht mit dem Alter ab
        const q = bs([w.pos[0] + 0.6 * w.alter, w.pos[1] + 0.6 * w.alter]);
        sp.position.set(q[0], q[1]);
        sp.scale.set(this.massstab(a, s, 0.55 + 0.9 * f));
        sp.alpha = 0.85 * (1 - f) * Math.min(1, w.alter / 0.4 + 0.3);
      }
    }
  }

  zerstoeren(): void {
    this.pool.clear();
  }
}
