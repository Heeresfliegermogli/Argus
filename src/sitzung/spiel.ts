// Spiel: die Verbindung eines Fensters zum Spielstand EINES Teams.
// Hält das Protokoll des aktuellen Laufs, berechnet daraus den Spielstand und schickt Aktionen.
// Im Fenster der steuernden Spielleitung führt es zusätzlich den Host dieses Teams (setzeHost).
// Welcher Lauf aktuell ist, sagt die Sitzung (teams/<team>/lauf); das Spiel folgt ihm.
import { Host } from "../engine/host";
import type { Taktgeber } from "../engine/taktgeber";
import type { Inhalte } from "../inhalte/typen";
import type { Absender, Aktion, AktionsDaten, AktionsTyp, Ereignis } from "../kern/ereignisse";
import { spielzeit } from "../kern/uhr";
import { type Spielzustand, anfangsZustand, anwenden } from "../kern/zustand";
import type { Abmelden, TeamKanal } from "../sync/adapter";
import type { Hinweisgeber } from "./hinweise";

export interface SpielStand {
  team: string;
  lauf: string | null;
  /** true, sobald das Protokoll des aktuellen Laufs geladen ist (oder es keinen Lauf gibt) */
  geladen: boolean;
  zustand: Spielzustand;
  protokoll: Ereignis[];
  /** gesendet, aber noch nicht im Protokoll */
  offen: Record<string, Aktion>;
}

export interface SpielOptionen {
  hinweise: Hinweisgeber;
  /** Absender der Host-Ereignisse (spiel_neu, erste Uhr) */
  hostAbsender: () => Absender;
  /** gemeinsamer Takt aller Team-Hosts; ohne: eigener Takt je Host */
  taktgeber?: Taktgeber;
  /** Schreiben des Hosts fehlgeschlagen (z. B. zweiter Host) */
  beiHostFehler?: (team: string, fehler: Error) => void;
}

export class Spiel {
  private s: SpielStand;
  private hoerer = new Set<() => void>();
  private protokollAbo: Abmelden | null = null;
  private puffer = new Map<number, Ereignis>();
  private lueckenTimer: ReturnType<typeof setTimeout> | null = null;
  private host: Host | null = null;
  private hostErlaubt = false;
  private laufWechsel = 0;
  private gestoppt = false;

  constructor(
    readonly inh: Inhalte,
    readonly kanal: TeamKanal,
    private readonly opt: SpielOptionen,
  ) {
    this.s = {
      team: kanal.team,
      lauf: null,
      geladen: false,
      zustand: anfangsZustand(inh),
      protokoll: [],
      offen: {},
    };
  }

  get team(): string {
    return this.kanal.team;
  }

  get stand(): SpielStand {
    return this.s;
  }

  abonnieren(cb: () => void): Abmelden {
    this.hoerer.add(cb);
    return () => this.hoerer.delete(cb);
  }

  private aendern(teil: Partial<SpielStand>): void {
    this.s = { ...this.s, ...teil };
    this.hoerer.forEach((cb) => cb());
  }

  spielzeit(): number {
    return spielzeit(this.s.zustand.uhr, this.kanal.serverJetzt());
  }

  stoppen(): void {
    this.gestoppt = true;
    this.hostStoppen();
    this.protokollAbo?.();
    this.protokollAbo = null;
    if (this.lueckenTimer) clearTimeout(this.lueckenTimer);
    this.hoerer.clear();
  }

  // ---------------------------------------------------------------- Aktionen

  /** Schickt eine Aktion an den Host. Gibt die Kennung zurück (für „gesendet …“-Anzeigen). */
  senden<T extends AktionsTyp>(typ: T, daten: AktionsDaten[T], von: Absender): string | null {
    const lauf = this.s.lauf;
    if (!lauf) {
      this.opt.hinweise.hinweis("warnung", "Noch kein Spiel aktiv – die Spielleitung muss es starten.");
      return null;
    }
    const a = { id: this.kanal.neueId(), typ, von, ts: Math.round(this.kanal.serverJetzt()), daten } as Aktion;
    this.aendern({ offen: { ...this.s.offen, [a.id]: a } });
    this.kanal.sendeAktion(lauf, a).catch((e: Error) => {
      const { [a.id]: _weg, ...rest } = this.s.offen;
      this.aendern({ offen: rest });
      this.opt.hinweise.hinweis("fehler", `Senden fehlgeschlagen: ${e.message}`);
    });
    return a.id;
  }

  /** Ist eine Aktion dieses Typs (optional zu dieser Meldung/diesem Inject) noch unterwegs? */
  wartetAuf(typ: AktionsTyp, bezug?: string): boolean {
    return Object.values(this.s.offen).some((a) => {
      if (a.typ !== typ) return false;
      if (bezug === undefined) return true;
      const d = a.daten as { meldung?: string; inject?: string };
      return d.meldung === bezug || d.inject === bezug;
    });
  }

  // ---------------------------------------------------------------- Protokoll

  /** Folgt dem aktuellen Lauf des Teams (von der Sitzung aufgerufen; gleicher Lauf = nichts zu tun). */
  folgeLauf(lauf: string | null): void {
    if (this.gestoppt || (lauf === this.s.lauf && (this.s.geladen || this.laufWechsel > 0))) return;
    void this.wechsleLauf(lauf);
  }

  private async wechsleLauf(lauf: string | null): Promise<void> {
    const nr = ++this.laufWechsel;
    this.protokollAbo?.();
    this.protokollAbo = null;
    this.hostStoppen();
    this.puffer.clear();
    this.aendern({ lauf, geladen: false, zustand: anfangsZustand(this.inh), protokoll: [], offen: {} });
    if (!lauf) {
      this.aendern({ geladen: true });
      return;
    }
    const liste = await this.kanal.ladeProtokoll(lauf);
    if (nr !== this.laufWechsel || this.gestoppt) return; // inzwischen anderer Lauf
    let z = anfangsZustand(this.inh);
    const gueltig: Ereignis[] = [];
    for (const e of liste) {
      if (e.seq !== z.seq + 1) break;
      z = anwenden(z, e, this.inh);
      gueltig.push(e);
    }
    this.aendern({ zustand: z, protokoll: gueltig, geladen: true });
    this.pruefeSzenario(z);
    this.protokollAbo = this.kanal.aufProtokoll(lauf, z.seq, (e) => this.empfange(e));
    this.hostStarten();
  }

  private empfange(e: Ereignis): void {
    if (!e || typeof e.seq !== "number" || e.seq <= this.s.zustand.seq) return;
    this.puffer.set(e.seq, e);
    let z = this.s.zustand;
    const neu: Ereignis[] = [];
    while (this.puffer.has(z.seq + 1)) {
      const n = this.puffer.get(z.seq + 1)!;
      this.puffer.delete(n.seq);
      z = anwenden(z, n, this.inh);
      neu.push(n);
    }
    if (!neu.length) {
      // Lücke: kurz warten, dann Protokoll neu laden (sollte praktisch nie nötig sein).
      if (!this.lueckenTimer) {
        this.lueckenTimer = setTimeout(() => {
          this.lueckenTimer = null;
          if (this.puffer.size && !this.gestoppt) void this.wechsleLauf(this.s.lauf);
        }, 2000);
      }
      return;
    }
    let offen = this.s.offen;
    for (const n of neu) {
      if (n.aktion && offen[n.aktion]) {
        const { [n.aktion]: _erledigt, ...rest } = offen;
        offen = rest;
        if (n.typ === "aktion_abgelehnt") this.opt.hinweise.hinweis("warnung", `Nicht ausgeführt: ${n.daten.grund}`);
      }
    }
    this.aendern({ zustand: z, protokoll: [...this.s.protokoll, ...neu], offen });
  }

  private pruefeSzenario(z: Spielzustand): void {
    const sz = this.inh.szenario;
    if (z.szenario && (z.szenario !== sz.id || z.version !== sz.version)) {
      this.opt.hinweise.hinweis("warnung", `Lauf wurde mit ${z.szenario} v${z.version} gestartet, geladen ist ${sz.id} v${sz.version}.`);
    }
  }

  // ---------------------------------------------------------------- Host (nur steuernde Spielleitung)

  /** Die Sitzung schaltet den Host ein (dieses Fenster steuert) oder aus. */
  setzeHost(ja: boolean): void {
    this.hostErlaubt = ja;
    if (ja) this.hostStarten();
    else this.hostStoppen();
  }

  private hostStarten(): void {
    if (!this.hostErlaubt || this.host || !this.s.lauf || !this.s.geladen || this.gestoppt) return;
    const tg = this.opt.taktgeber;
    const h: Host = new Host(this.inh, this.kanal, this.s.lauf, this.s.protokoll, this.opt.hostAbsender(), {
      taktMs: tg ? 0 : undefined,
      beiFehler: (e) => {
        tg?.abmelden(h);
        this.host = null;
        this.hostErlaubt = false;
        this.opt.beiHostFehler?.(this.team, e);
        void this.wechsleLauf(this.s.lauf);
      },
    });
    this.host = h;
    h.starten();
    tg?.anmelden(h);
  }

  private hostStoppen(): void {
    if (!this.host) return;
    this.opt.taktgeber?.abmelden(this.host);
    this.host.stoppen();
    this.host = null;
  }

  /** Für Tests und Anzeige: führt dieses Fenster gerade den Host dieses Teams? */
  get hostAktiv(): boolean {
    return !!this.host;
  }
}
