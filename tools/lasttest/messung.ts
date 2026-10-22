// Messung des Lasttests. Bots und Host laufen in EINER Seite, jeder mit eigener Firebase-Verbindung, aber mit
// derselben Uhr (performance.now()). So lässt sich der Weg jeder Aktion genau zerlegen:
//
//   Klick (Bot ruft senden)  → Server bestätigt die Aktion (Schreiben des Bots fertig)
//                            → Host empfängt die Aktion (onChildAdded auf der Verbindung des Hosts)
//                            → Host schreibt das Ereignis ins Protokoll
//                            → Ereignis kommt im eigenen Fenster an (Verbindung des Bots)   = „Klick → Protokoll“
//                            → … und bei den beiden Teamkameraden (deren Verbindungen)
//
// Dazu für JEDES Ereignis (auch die des Zeitplans): Host schreibt → Ereignis bei jedem Bot des Teams.
// MessAdapter ist der echte FirebaseAdapter der App, nur mit Zeitstempeln an den Übergaben.
import type { Aktion, Ereignis } from "../../src/kern/ereignisse";
import type { Abmelden, Verbindung } from "../../src/sync/adapter";
import { FirebaseAdapter, type FirebaseEinstellungen } from "../../src/sync/firebase";

export type VerbindungsArt = "host" | "bot" | "beobachter";

export interface VerbindungsStand {
  kennung: string;
  art: VerbindungsArt;
  name: string;
  /** Team-Nummer 1…n (nur Bots) */
  teamNr?: number;
  rolle?: string;
  verbunden: boolean;
  warVerbunden: boolean;
  abbrueche: number;
  fehler: string[];
}

export interface AktionsMessung {
  id: string;
  typ: string;
  /** Kennung der Verbindung, die gesendet hat */
  sender: string;
  /** Team-Kennung (Pfad) */
  team: string;
  rolle?: string;
  meldung?: string;
  /** Spielzeit beim Klick und geplante Spielzeit (Bots) */
  tSpiel?: number;
  plan?: number;
  tKlick: number;
  tBestaetigt?: number;
  tHost?: number;
  /** erstes Ereignis zu dieser Aktion */
  seq?: number;
  tGeschrieben?: number;
  abgelehnt?: string;
  fehler?: string;
}

export interface EreignisMessung {
  team: string;
  seq: number;
  typ: string;
  t_s: number;
  aktion?: string;
  /** nur auf dem Gerät mit Host bekannt */
  tGeschrieben?: number;
  tBestaetigt?: number;
  /** Kennung → Ankunftszeit */
  ankunft: Map<string, number>;
}

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
  readonly aktionen = new Map<string, AktionsMessung>();
  readonly ereignisse = new Map<string, EreignisMessung>();
  /** Verzug der Ereignisschleife dieser Seite: [Zeit seit Messbeginn ms, Verzug ms] */
  readonly schleife: [number, number][] = [];
  /** Zeiten, in denen die Seite verdeckt war (Zeitgeber werden dann gedrosselt) */
  verdecktMs = 0;
  private verdecktSeit: number | null = null;
  private schleifenTimer: ReturnType<typeof setInterval> | null = null;
  private beginn = jetzt();

  private schluessel(team: string, seq: number): string {
    return `${team}|${seq}`;
  }

  anmelden(v: Omit<VerbindungsStand, "verbunden" | "warVerbunden" | "abbrueche" | "fehler">): void {
    this.verbindungen.set(v.kennung, { ...v, verbunden: false, warVerbunden: false, abbrueche: 0, fehler: [] });
  }

  verbindungsStand(kennung: string, v: Verbindung): void {
    const s = this.verbindungen.get(kennung);
    if (!s) return;
    if (s.verbunden && !v.verbunden) s.abbrueche += 1;
    s.verbunden = v.verbunden;
    if (v.verbunden) s.warVerbunden = true;
    if (v.fehler && !s.fehler.includes(v.fehler)) s.fehler.push(v.fehler);
  }

  // ---------------------------------------------------------------- Aktionen

  aktionGesendet(kennung: string, team: string, a: Aktion): void {
    if (this.aktionen.has(a.id)) return;
    const d = a.daten as { meldung?: string };
    this.aktionen.set(a.id, { id: a.id, typ: a.typ, sender: kennung, team, rolle: a.von.rolle, meldung: d.meldung, tKlick: jetzt() });
  }

  aktionBestaetigt(id: string): void {
    const m = this.aktionen.get(id);
    if (m && m.tBestaetigt === undefined) m.tBestaetigt = jetzt();
  }

  aktionFehler(id: string, text: string): void {
    const m = this.aktionen.get(id);
    if (m) m.fehler = text;
  }

  /** Planangaben des Bots zur Aktion (Spielzeit beim Klick, geplante Zeit). */
  notiere(id: string, extra: Pick<AktionsMessung, "tSpiel" | "plan">): void {
    const m = this.aktionen.get(id);
    if (m) Object.assign(m, extra);
  }

  aktionBeimHost(a: Aktion): void {
    const m = this.aktionen.get(a?.id);
    if (m && m.tHost === undefined) m.tHost = jetzt();
  }

  // ---------------------------------------------------------------- Ereignisse

  private ereignis(team: string, e: Ereignis): EreignisMessung {
    const k = this.schluessel(team, e.seq);
    let x = this.ereignisse.get(k);
    if (!x) {
      x = { team, seq: e.seq, typ: e.typ, t_s: e.t_s, aktion: e.aktion, ankunft: new Map() };
      this.ereignisse.set(k, x);
    }
    return x;
  }

  /** Erstes Ereignis zu einer eigenen Aktion merken (auf jedem Gerät, auch ohne Host). */
  private verknuepfe(e: Ereignis, t?: number): void {
    if (!e.aktion) return;
    const m = this.aktionen.get(e.aktion);
    if (!m || (m.seq !== undefined && m.seq <= e.seq)) return;
    m.seq = e.seq;
    if (t !== undefined) m.tGeschrieben = t;
    if (e.typ === "aktion_abgelehnt") m.abgelehnt = (e.daten as { grund: string }).grund;
  }

  ereignisGeschrieben(team: string, e: Ereignis): void {
    const x = this.ereignis(team, e);
    if (x.tGeschrieben !== undefined) return;
    x.tGeschrieben = jetzt();
    this.verknuepfe(e, x.tGeschrieben);
  }

  ereignisBestaetigt(team: string, seq: number): void {
    const x = this.ereignisse.get(this.schluessel(team, seq));
    if (x && x.tBestaetigt === undefined) x.tBestaetigt = jetzt();
  }

  ereignisEmpfangen(kennung: string, team: string, e: Ereignis, t = jetzt()): void {
    if (!e || typeof e.seq !== "number") return;
    const x = this.ereignis(team, e);
    if (!x.ankunft.has(kennung)) x.ankunft.set(kennung, t);
    this.verknuepfe(e);
  }

  // ---------------------------------------------------------------- Auswertung je Aktion

  /** Zeit, zu der das Ereignis der Aktion im Fenster des Senders ankam. */
  zurueck(m: AktionsMessung): number | undefined {
    if (m.seq === undefined) return undefined;
    return this.ereignisse.get(this.schluessel(m.team, m.seq))?.ankunft.get(m.sender);
  }

  /** Spätester Eingang bei den Teamkameraden (nur wenn alle es haben). */
  beiTeam(m: AktionsMessung, kameraden: string[]): number | undefined {
    if (m.seq === undefined || !kameraden.length) return undefined;
    const x = this.ereignisse.get(this.schluessel(m.team, m.seq));
    if (!x) return undefined;
    let spaet = -Infinity;
    for (const k of kameraden) {
      const t = x.ankunft.get(k);
      if (t === undefined) return undefined;
      spaet = Math.max(spaet, t);
    }
    return spaet;
  }

  // ---------------------------------------------------------------- Seite selbst

  starteSeitenMessung(): void {
    this.beginn = jetzt();
    let letzte = jetzt();
    const takt = 100;
    this.schleifenTimer = setInterval(() => {
      const t = jetzt();
      this.schleife.push([Math.round(t - this.beginn), Math.max(0, Math.round(t - letzte - takt))]);
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
 * Der Firebase-Adapter der App mit Zeitstempeln an den Übergaben. Jede Instanz ist eine eigene
 * Firebase-App und damit eine eigene Verbindung (bei transport "lp" Long-Polling wie im Hörsaal).
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

  override async sendeAktion(team: string, lauf: string, a: Aktion): Promise<void> {
    this.mess.aktionGesendet(this.kennung, team, a);
    try {
      await super.sendeAktion(team, lauf, a);
      this.mess.aktionBestaetigt(a.id);
    } catch (e) {
      this.mess.aktionFehler(a.id, (e as Error).message);
      throw e;
    }
  }

  override aufAktionen(team: string, lauf: string, cb: (a: Aktion) => void): Abmelden {
    return super.aufAktionen(team, lauf, (a) => {
      this.mess.aktionBeimHost(a);
      cb(a);
    });
  }

  override async schreibeEreignis(team: string, lauf: string, e: Ereignis): Promise<void> {
    this.mess.ereignisGeschrieben(team, e);
    await super.schreibeEreignis(team, lauf, e);
    this.mess.ereignisBestaetigt(team, e.seq);
  }

  override async ladeProtokoll(team: string, lauf: string): Promise<Ereignis[]> {
    const liste = await super.ladeProtokoll(team, lauf);
    const t = performance.now();
    for (const e of liste) this.mess.ereignisEmpfangen(this.kennung, team, e, t);
    return liste;
  }

  override aufProtokoll(team: string, lauf: string, abSeq: number, cb: (e: Ereignis) => void): Abmelden {
    return super.aufProtokoll(team, lauf, abSeq, (e) => {
      this.mess.ereignisEmpfangen(this.kennung, team, e);
      cb(e);
    });
  }
}
