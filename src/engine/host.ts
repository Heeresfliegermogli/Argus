// Host: läuft nur im Fenster der steuernden Spielleitung und hält den einzigen gültigen Spielstand.
// Er nimmt Aktionen entgegen, prüft sie, vergibt Laufnummer und Zeiten und schreibt Ereignisse ins
// Protokoll. Dazu spielt er den Zeitplan des Szenarios ab. Fällt der Host aus, kann eine andere
// Spielleitung übernehmen: Der neue Host baut den Stand aus dem Protokoll auf und macht weiter;
// bereits verarbeitete Aktionen erkennt er an ihrer Kennung.
import type { Inhalte } from "../inhalte/typen";
import { type Absender, type Aktion, type Ereignis, bereinigt } from "../kern/ereignisse";
import { spielzeit } from "../kern/uhr";
import { type Spielzustand, anwenden, zustandAus } from "../kern/zustand";
import type { Abmelden, SyncAdapter } from "../sync/adapter";
import { faellig } from "./ablauf";
import { verarbeiteAktion } from "./aktionen";
import { type Entwurf, entwurf } from "./entwurf";

export interface HostOptionen {
  /** Schreiben fehlgeschlagen (z. B. zweiter Host): Host hat sich beendet. */
  beiFehler: (fehler: Error) => void;
  taktMs?: number;
}

const SYSTEM: Absender = { rolle: "system" };

export class Host {
  private z: Spielzustand;
  private letzteT = 0;
  private abmelden: Abmelden[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private gestoppt = false;
  private warteschlange: Aktion[] = [];

  constructor(
    private readonly inh: Inhalte,
    private readonly adapter: SyncAdapter,
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

  starten(): void {
    if (this.z.seq === 0) {
      const sz = this.inh.szenario;
      this.ausgeben(entwurf("spiel_neu", { lauf: this.lauf, szenario: sz.id, version: sz.version, titel: sz.titel }, { von: this.ich }));
      this.ausgeben(entwurf("uhr", { befehl: "setzen", laeuft: false, t_s: 0, tempo: sz.spieluhr.tempo || 1 }, { von: this.ich }));
    }
    this.abmelden.push(this.adapter.aufAktionen(this.lauf, (a) => this.aktion(a)));
    this.timer = setInterval(() => this.takt(), this.opt.taktMs ?? 250);
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
    return spielzeit(this.z.uhr, this.adapter.serverJetzt());
  }

  /** Nimmt eine Aktion an (auch doppelt zugestellte; die werden übersprungen). */
  aktion(a: Aktion): void {
    if (this.gestoppt || !a?.id) return;
    if (this.z.aktionen[a.id] !== undefined || this.warteschlange.some((x) => x.id === a.id)) return;
    this.warteschlange.push(a);
    this.abarbeiten();
  }

  private abarbeiten(): void {
    while (!this.gestoppt && this.warteschlange.length) {
      const a = this.warteschlange.shift()!;
      if (this.z.aktionen[a.id] !== undefined) continue;
      this.takt(); // Zeitplan erst nachziehen, damit die Aktion auf den aktuellen Stand trifft
      const jetzt = this.jetztT();
      // Spielzeit des Klicks (Serverzeit der Aktion), nie vor dem letzten Ereignis und nie in der Zukunft.
      const tKlick = Math.min(jetzt, Math.max(this.letzteT, spielzeit(this.z.uhr, Math.min(a.ts ?? 0, this.adapter.serverJetzt()))));
      // Uhr-Befehle wirken ab jetzt, sonst springt die Uhr um die Laufzeit der Nachricht zurück.
      const tAktion = a.typ === "uhr" ? jetzt : tKlick;
      const erg = verarbeiteAktion(this.inh, this.z, a, tAktion);
      const extra = { von: bereinigt(a.von), aktion: a.id, ts_aktion: a.ts, t_geplant: tAktion };
      if (!erg.ok) {
        this.ausgeben(entwurf("aktion_abgelehnt", { aktionstyp: String(a.typ), grund: erg.grund }, extra));
        continue;
      }
      erg.entwuerfe.forEach((e) => this.ausgeben({ ...e, ...extra } as Entwurf));
    }
  }

  /** Zeitplan abarbeiten: ein fälliges Ereignis nach dem anderen, jeweils auf dem neuen Stand. */
  private takt(): void {
    if (this.gestoppt) return;
    for (let i = 0; i < 200; i++) {
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
      ts: Math.round(this.adapter.serverJetzt()),
      t_s: Math.round(t * 10) / 10,
      von: e.von ?? SYSTEM,
      aktion: e.aktion,
      ts_aktion: e.ts_aktion,
      daten: e.daten,
    }) as Ereignis;
    this.z = anwenden(this.z, ereignis, this.inh);
    this.letzteT = ereignis.t_s;
    this.adapter.schreibeEreignis(this.lauf, ereignis).catch((err: Error) => {
      if (this.gestoppt) return;
      this.stoppen();
      this.opt.beiFehler(err);
    });
  }
}
