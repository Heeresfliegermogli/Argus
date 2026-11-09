// Host: hält den einzigen gültigen Spielstand EINES Teams. Seit 2.6 (Änderungen H1) läuft er im Browser des Team-Laptops: Er nimmt
// die Entscheidungen des Teams direkt entgegen (ohne Netz), dazu über das Netz die Aktionen der Spielleitung (Start, Pause, Tempo,
// Reserve, Notiz), prüft sie, vergibt Laufnummer und Zeiten und gibt Ereignisse aus. Dazu spielt er den Zeitplan des Szenarios ab.
// Ablage und Upload der Ereignisse macht das Spiel (src/sitzung/spiel.ts) – der Host rechnet nur.
//
// Start mit Verzug (H1.4): Das Startsignal der Spielleitung trägt ihre Serverzeit. Kommt es verspätet an, läuft die Uhr ab dieser
// Zeit (ab_ts, höchstens 60 s nachgeholt) – alle Teams haben dieselbe Spielzeit, auch wenn das Netz trödelt.
import type { Inhalte } from "../inhalte/typen";
import { type Absender, type Aktion, type Ereignis, bereinigt } from "../kern/ereignisse";
import { spielzeit } from "../kern/uhr";
import { type Spielzustand, anwenden, zustandAus } from "../kern/zustand";
import type { Abmelden } from "../sync/adapter";
import { faellig } from "./ablauf";
import { verarbeiteAktion } from "./aktionen";
import { type Entwurf, entwurf } from "./entwurf";

/** Was der Host vom Netz braucht: Serverzeit und die Aktionen der Spielleitung. */
export interface HostKanal {
  serverJetzt(): number;
  aufAktionen(lauf: string, cb: (a: Aktion) => void): Abmelden;
}

export interface HostOptionen {
  /** neues Ereignis (schon im Spielstand des Hosts) – das Spiel legt es ab und lädt es hoch */
  ausgabe: (e: Ereignis) => void;
  /** eigener Takt in ms (Standard 250); 0 = kein eigener Zeitgeber, takt() ruft jemand anderes auf (Tests) */
  taktMs?: number;
}

/** So viel Verzug beim Startsignal holt die Uhr höchstens nach. */
export const NACHHOLEN_MAX_MS = 60000;

const SYSTEM: Absender = { rolle: "system" };

export class Host {
  private z: Spielzustand;
  private letzteT = 0;
  private abmelden: Abmelden[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private gestoppt = false;
  private warteschlange: Aktion[] = [];
  private arbeitet = false;

  constructor(
    private readonly inh: Inhalte,
    private readonly kanal: HostKanal,
    readonly lauf: string,
    protokoll: Ereignis[],
    private readonly ich: Absender,
    private readonly opt: HostOptionen,
  ) {
    this.z = zustandAus(protokoll, inh);
    this.letzteT = protokoll.length ? protokoll[protokoll.length - 1].t_s : 0;
  }

  get zustand(): Spielzustand {
    return this.z;
  }

  get aktiv(): boolean {
    return !this.gestoppt;
  }

  starten(): void {
    if (this.z.seq === 0) {
      const sz = this.inh.szenario;
      this.ausgeben(entwurf("spiel_neu", { lauf: this.lauf, szenario: sz.id, version: sz.version, titel: sz.titel }, { von: this.ich }));
      this.ausgeben(entwurf("uhr", { befehl: "setzen", laeuft: false, t_s: 0, tempo: sz.spieluhr.tempo || 1 }, { von: this.ich }));
    }
    this.abmelden.push(this.kanal.aufAktionen(this.lauf, (a) => this.aktion(a)));
    const takt = this.opt.taktMs ?? 250;
    if (takt > 0) this.timer = setInterval(() => this.takt(), takt);
    this.takt();
  }

  stoppen(): void {
    this.gestoppt = true;
    this.abmelden.forEach((ab) => ab());
    this.abmelden = [];
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Aktuelle Spielzeit nach dem Stand des Hosts. */
  jetztT(): number {
    return spielzeit(this.z.uhr, this.kanal.serverJetzt());
  }

  /** Nimmt eine Aktion an – vom Team direkt oder von der Spielleitung über das Netz (doppelt zugestellte werden übersprungen). */
  aktion(a: Aktion): void {
    if (this.gestoppt || !a?.id) return;
    if (this.z.aktionen[a.id] !== undefined || this.warteschlange.some((x) => x.id === a.id)) return;
    this.warteschlange.push(a);
    this.abarbeiten();
  }

  private abarbeiten(): void {
    if (this.arbeitet) return; // eine Ausgabe löst eine Aktion aus (Tests): erst die laufende fertig machen
    this.arbeitet = true;
    try {
      while (!this.gestoppt && this.warteschlange.length) {
        const a = this.warteschlange.shift()!;
        if (this.z.aktionen[a.id] !== undefined) continue;
        this.takt(); // Zeitplan erst nachziehen, damit die Aktion auf den aktuellen Stand trifft
        const jetzt = this.jetztT();
        const server = this.kanal.serverJetzt();
        // Spielzeit des Klicks (Serverzeit der Aktion), nie vor dem letzten Ereignis und nie in der Zukunft.
        const tKlick = Math.min(jetzt, Math.max(this.letzteT, spielzeit(this.z.uhr, Math.min(a.ts ?? 0, server))));
        // Uhr-Befehle wirken ab jetzt (eine laufende Uhr springt nicht zurück)
        const tAktion = a.typ === "uhr" ? jetzt : tKlick;
        const erg = verarbeiteAktion(this.inh, this.z, a, tAktion);
        const extra = { von: bereinigt(a.von), aktion: a.id, ts_aktion: a.ts, t_geplant: tAktion };
        if (!erg.ok) {
          this.ausgeben(entwurf("aktion_abgelehnt", { aktionstyp: String(a.typ), grund: erg.grund }, extra));
          continue;
        }
        for (const e of erg.entwuerfe) {
          // Startsignal mit Verzug: Uhr läuft ab der Serverzeit des Klicks (H1.4), höchstens NACHHOLEN_MAX_MS nachgeholt
          if (e.typ === "uhr" && a.typ === "uhr" && a.daten.befehl === "start" && typeof a.ts === "number") {
            const ab = Math.max(a.ts, server - NACHHOLEN_MAX_MS);
            if (server - ab > 250) (e.daten as { ab_ts?: number }).ab_ts = Math.round(ab);
          }
          this.ausgeben({ ...e, ...extra } as Entwurf);
        }
        this.takt(); // nachgeholte Zeit sofort abarbeiten
      }
    } finally {
      this.arbeitet = false;
    }
  }

  /** Zeitplan abarbeiten: ein fälliges Ereignis nach dem anderen, jeweils auf dem neuen Stand. */
  takt(): void {
    if (this.gestoppt) return;
    for (let i = 0; i < 400; i++) {
      const naechstes = faellig(this.inh, this.z, this.jetztT())[0];
      if (!naechstes) return;
      this.ausgeben({ ...naechstes, von: SYSTEM });
    }
  }

  private ausgeben(e: Entwurf): void {
    if (this.gestoppt) return;
    const jetzt = this.jetztT();
    const t = Math.min(jetzt, Math.max(this.letzteT, e.t_geplant ?? jetzt));
    const ereignis = bereinigt({
      seq: this.z.seq + 1,
      typ: e.typ,
      ts: Math.round(this.kanal.serverJetzt()),
      t_s: Math.round(t * 10) / 10,
      von: e.von ?? SYSTEM,
      aktion: e.aktion,
      ts_aktion: e.ts_aktion,
      daten: e.daten,
    }) as Ereignis;
    this.z = anwenden(this.z, ereignis, this.inh);
    this.letzteT = ereignis.t_s;
    this.opt.ausgabe(ereignis);
  }
}
