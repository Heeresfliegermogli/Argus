// Messung des Lasttests (seit 2.6, H1.6). Alle Fenster laufen in EINER Seite, jedes mit eigener Firebase-Verbindung, aber mit
// derselben Uhr (performance.now()). Gemessen wird, was die Änderung H1 verspricht:
//
//   • Spiel des Teams flüssig: Klick (Bot entscheidet am Team-Laptop) → Ereignis im eigenen Spielstand. Ohne Netz, daher
//     Millisekunden – auch bei Verzug und Trennung. Dazu der Verzug der Ereignisschleife dieser Seite (Rechenzeit).
//   • SL-Übersicht holt auf: je Ereignis die Zeit vom Entstehen am Team-Laptop (ts, Serverzeit) bis es bei der Spielleitung
//     (und beim Plenum) im Protokoll steht; alle 500 ms das Alter der letzten Statusmeldung und der Rückstand des Protokolls.
//   • Start für alle: Klick der Spielleitung → Uhr läuft am Team-Laptop, und die Spanne der Spielzeiten danach (H1.4).
//
// Gemessen wird an den Spielständen (Spiel.abonnieren) – also mit dem künstlichen Verzug, den VerzugAdapter um die Verbindung legt.
// MessAdapter ist der echte FirebaseAdapter der App; er merkt sich nur, wann die Verbindung stand oder abriss.
import type { Abmelden } from "../../src/sync/adapter";
import { FirebaseAdapter, type FirebaseEinstellungen } from "../../src/sync/firebase";

export type VerbindungsArt = "sl" | "laptop" | "plenum";

export interface VerbindungsStand {
  kennung: string;
  art: VerbindungsArt;
  name: string;
  /** Team-Nummer 1…n (nur Team-Laptops) */
  teamNr?: number;
  verbunden: boolean;
  warVerbunden: boolean;
  abbrueche: number;
  fehler: string[];
}

export interface KlickMessung {
  nr: number;
  id: string;
  typ: string;
  meldung?: string;
  /** Spielzeit beim Klick und geplante Spielzeit */
  tSpiel: number;
  plan: number;
  tKlick: number;
  /** Ereignis zur Aktion im eigenen Spielstand (performance.now()) */
  tLokal?: number;
  abgelehnt?: string;
}

/** Probe je Team: [s seit Start der Uhren (Echtzeit), Alter der Statusmeldung s, Rückstand Protokoll SL s, Rückstand Plenum s] */
export type Probe = [number, number | null, number | null, number | null];

export interface Kennzahlen {
  n: number;
  median: number | null;
  p95: number | null;
  max: number | null;
}

/** Median, 95-%-Wert (nächster Rang) und Höchstwert. */
export function kennzahlen(werte: number[]): Kennzahlen {
  const w = werte.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!w.length) return { n: 0, median: null, p95: null, max: null };
  const rang = (p: number) => w[Math.min(w.length - 1, Math.max(0, Math.ceil(p * w.length) - 1))];
  const mitte = w.length % 2 ? w[(w.length - 1) / 2] : (w[w.length / 2 - 1] + w[w.length / 2]) / 2;
  return { n: w.length, median: mitte, p95: rang(0.95), max: w[w.length - 1] };
}

const jetzt = () => performance.now();

export class Messung {
  readonly verbindungen = new Map<string, VerbindungsStand>();
  /** Team-Nr → seq → performance.now(), als das Ereignis am Team-Laptop entstand (nur Teams dieses Geräts) */
  readonly lokal = new Map<number, Map<number, number>>();
  /** "sl" | "plenum" → Team-Nr → seq → ms vom Entstehen (ts) bis zur Ankunft (Serverzeit des Empfängers) */
  readonly ankunft = new Map<string, Map<number, Map<number, number>>>();
  readonly klicks: KlickMessung[] = [];
  readonly proben = new Map<number, Probe[]>();
  /** Startsignal: ms vom Klick der Spielleitung bis die Uhr am Team-Laptop läuft */
  readonly start = new Map<number, number>();
  /** größte Differenz der Spielzeiten der Teams dieses Geräts kurz nach dem Start (s) */
  startSpanne: number | null = null;
  /** Echtzeit (s seit Start der Uhren) der simulierten Trennung */
  trennung: { von: number; bis: number | null } | null = null;
  /** Verzug der Ereignisschleife dieser Seite: [performance.now() ms, Verzug ms] */
  readonly schleife: [number, number][] = [];
  verdecktMs = 0;
  private verdecktSeit: number | null = null;
  private schleifenTimer: ReturnType<typeof setInterval> | null = null;

  anmelden(v: Omit<VerbindungsStand, "verbunden" | "warVerbunden" | "abbrueche" | "fehler">): void {
    this.verbindungen.set(v.kennung, { ...v, verbunden: false, warVerbunden: false, abbrueche: 0, fehler: [] });
  }

  verbindungsStand(kennung: string, v: { verbunden: boolean; fehler?: string }): void {
    const s = this.verbindungen.get(kennung);
    if (!s) return;
    if (s.verbunden && !v.verbunden) s.abbrueche += 1;
    s.verbunden = v.verbunden;
    if (v.verbunden) s.warVerbunden = true;
    if (v.fehler && !s.fehler.includes(v.fehler) && s.fehler.length < 5) s.fehler.push(v.fehler);
  }

  /** Neues Ereignis im Spielstand des Team-Laptops (Teams dieses Geräts). */
  lokalesEreignis(nr: number, seq: number, aktion: string | undefined, abgelehnt: string | undefined, t = jetzt()): void {
    let m = this.lokal.get(nr);
    if (!m) this.lokal.set(nr, (m = new Map()));
    if (!m.has(seq)) m.set(seq, t);
    if (!aktion) return;
    const k = this.klicks.find((x) => x.id === aktion);
    if (k && k.tLokal === undefined) {
      k.tLokal = t;
      if (abgelehnt) k.abgelehnt = abgelehnt;
    }
  }

  /** Ereignis kommt bei der Spielleitung oder beim Plenum an: Verzug vom Entstehen (ts) bis jetzt (Serverzeit). */
  angekommen(wer: "sl" | "plenum", nr: number, seq: number, ms: number): void {
    let w = this.ankunft.get(wer);
    if (!w) this.ankunft.set(wer, (w = new Map()));
    let m = w.get(nr);
    if (!m) w.set(nr, (m = new Map()));
    if (!m.has(seq)) m.set(seq, Math.max(0, ms));
  }

  probe(nr: number, p: Probe): void {
    let l = this.proben.get(nr);
    if (!l) this.proben.set(nr, (l = []));
    l.push(p);
  }

  // ---------------------------------------------------------------- Seite selbst

  starteSeitenMessung(): void {
    let letzte = jetzt();
    const takt = 100;
    this.schleifenTimer = setInterval(() => {
      const t = jetzt();
      this.schleife.push([Math.round(t), Math.max(0, Math.round(t - letzte - takt))]);
      letzte = t;
    }, takt);
    document.addEventListener("visibilitychange", this.sichtbarkeit);
    this.sichtbarkeit();
  }

  stoppeSeitenMessung(): void {
    if (this.schleifenTimer) clearInterval(this.schleifenTimer);
    this.schleifenTimer = null;
    document.removeEventListener("visibilitychange", this.sichtbarkeit);
    if (this.verdecktSeit !== null) this.verdecktMs += jetzt() - this.verdecktSeit;
    this.verdecktSeit = null;
  }

  private sichtbarkeit = (): void => {
    if (document.visibilityState === "hidden") {
      this.verdecktSeit ??= jetzt();
    } else if (this.verdecktSeit !== null) {
      this.verdecktMs += jetzt() - this.verdecktSeit;
      this.verdecktSeit = null;
    }
  };

  get verdecktGesamt(): number {
    return this.verdecktMs + (this.verdecktSeit !== null ? jetzt() - this.verdecktSeit : 0);
  }
}

/**
 * Der Firebase-Adapter der App, der sich nur den Verbindungsstand merkt. Jede Instanz ist eine eigene Firebase-App und damit
 * eine eigene Verbindung (bei transport "lp" Long-Polling wie im Hörsaal).
 */
export class MessAdapter extends FirebaseAdapter {
  private abVerbindung: Abmelden | null = null;

  constructor(sitzung: string, cfg: FirebaseEinstellungen, private readonly mess: Messung, readonly kennung: string) {
    super(sitzung, cfg);
  }

  override async verbinden(): Promise<void> {
    await super.verbinden();
    this.abVerbindung = this.aufVerbindung((v) => this.mess.verbindungsStand(this.kennung, v));
  }

  override trennen(): void {
    this.abVerbindung?.();
    this.abVerbindung = null;
    super.trennen();
  }
}
