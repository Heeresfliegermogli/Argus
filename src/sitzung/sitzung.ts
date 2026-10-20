// Sitzung: verbindet ein Browserfenster (eine Rolle) mit dem Sync-Adapter.
// Sie hält das Protokoll des aktuellen Laufs, berechnet daraus den Spielstand und schickt Aktionen.
// In Fenstern der Spielleitung bewirbt sie sich um die Host-Rolle und startet bei Erfolg den Host.
import { Host } from "../engine/host";
import type { Inhalte } from "../inhalte/typen";
import {
  type Absender, type Aktion, type AktionsDaten, type AktionsTyp, type Ereignis, type Rolle, neueLaufId, zufall,
} from "../kern/ereignisse";
import { ROLLEN_NAME } from "../kern/sichten";
import { spielzeit } from "../kern/uhr";
import { type Spielzustand, anfangsZustand, anwenden } from "../kern/zustand";
import {
  type Abmelden, type HostInfo, PULS_INTERVALL_MS, type SyncAdapter, type Teilnehmer, type Verbindung, istVeraltet,
} from "../sync/adapter";

export interface Hinweis {
  id: number;
  art: "info" | "warnung" | "fehler";
  text: string;
}

export interface SitzungsStand {
  rolle: Rolle;
  client: string;
  name: string;
  raum: string;
  verbindung: Verbindung;
  lauf: string | null;
  /** true, sobald das Protokoll des aktuellen Laufs geladen ist */
  geladen: boolean;
  zustand: Spielzustand;
  protokoll: Ereignis[];
  teilnehmer: Teilnehmer[];
  host: HostInfo | null;
  istHost: boolean;
  /** gesendet, aber noch nicht im Protokoll */
  offen: Record<string, Aktion>;
  hinweise: Hinweis[];
}

export class Sitzung {
  readonly client = zufall(6);
  private s: SitzungsStand;
  private hoerer = new Set<() => void>();
  private abos: Abmelden[] = [];
  private protokollAbo: Abmelden | null = null;
  private puffer = new Map<number, Ereignis>();
  private lueckenTimer: ReturnType<typeof setTimeout> | null = null;
  private host: Host | null = null;
  private timer: ReturnType<typeof setInterval>[] = [];
  private hinweisNr = 0;
  private laufWechsel = 0;

  constructor(
    readonly inh: Inhalte,
    readonly adapter: SyncAdapter,
    rolle: Rolle,
    name?: string,
  ) {
    this.s = {
      rolle,
      client: this.client,
      name: name?.trim() || ROLLEN_NAME[rolle],
      raum: adapter.raum,
      verbindung: { verbunden: false, art: adapter.art },
      lauf: null,
      geladen: false,
      zustand: anfangsZustand(inh),
      protokoll: [],
      teilnehmer: [],
      host: null,
      istHost: false,
      offen: {},
      hinweise: [],
    };
  }

  get stand(): SitzungsStand {
    return this.s;
  }

  get ich(): Absender {
    return { rolle: this.s.rolle, client: this.client, name: this.s.name };
  }

  abonnieren(cb: () => void): Abmelden {
    this.hoerer.add(cb);
    return () => this.hoerer.delete(cb);
  }

  private aendern(teil: Partial<SitzungsStand>): void {
    this.s = { ...this.s, ...teil };
    this.hoerer.forEach((cb) => cb());
  }

  spielzeit(): number {
    return spielzeit(this.s.zustand.uhr, this.adapter.serverJetzt());
  }

  async starten(): Promise<void> {
    await this.adapter.verbinden();
    this.abos.push(this.adapter.aufVerbindung((v) => this.aendern({ verbindung: v })));
    this.adapter.meldeAnwesenheit({ client: this.client, rolle: this.s.rolle, name: this.s.name, version: __ARGUS_VERSION__ });
    this.abos.push(this.adapter.aufAnwesenheit((liste) => this.aendern({ teilnehmer: liste })));
    this.abos.push(this.adapter.aufHost((h) => this.hostGeaendert(h)));
    this.abos.push(this.adapter.aufAktuellenLauf((lauf) => void this.wechsleLauf(lauf)));
    if (this.s.rolle === "sl") this.timer.push(setInterval(() => this.hostPruefen(), PULS_INTERVALL_MS));
  }

  stoppen(): void {
    this.host?.stoppen();
    this.host = null;
    this.protokollAbo?.();
    this.abos.forEach((a) => a());
    this.timer.forEach(clearInterval);
    this.adapter.trennen();
  }

  // ---------------------------------------------------------------- Aktionen

  /** Schickt eine Aktion an den Host. Gibt die Kennung zurück (für „gesendet …“-Anzeigen). */
  senden<T extends AktionsTyp>(typ: T, daten: AktionsDaten[T]): string | null {
    const lauf = this.s.lauf;
    if (!lauf) {
      this.hinweis("warnung", "Noch kein Spiel aktiv – die Spielleitung muss es starten.");
      return null;
    }
    const a = { id: this.adapter.neueId(), typ, von: this.ich, ts: Math.round(this.adapter.serverJetzt()), daten } as Aktion;
    this.aendern({ offen: { ...this.s.offen, [a.id]: a } });
    this.adapter.sendeAktion(lauf, a).catch((e: Error) => {
      const { [a.id]: _weg, ...rest } = this.s.offen;
      this.aendern({ offen: rest });
      this.hinweis("fehler", `Senden fehlgeschlagen: ${e.message}`);
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

  hinweis(art: Hinweis["art"], text: string): void {
    const h = { id: ++this.hinweisNr, art, text };
    this.aendern({ hinweise: [...this.s.hinweise.slice(-4), h] });
    setTimeout(() => this.aendern({ hinweise: this.s.hinweise.filter((x) => x.id !== h.id) }), art === "fehler" ? 9000 : 6000);
  }

  // ---------------------------------------------------------------- Protokoll

  private async wechsleLauf(lauf: string | null): Promise<void> {
    const nr = ++this.laufWechsel;
    this.protokollAbo?.();
    this.protokollAbo = null;
    this.host?.stoppen();
    this.host = null;
    this.puffer.clear();
    this.aendern({ lauf, geladen: false, zustand: anfangsZustand(this.inh), protokoll: [], offen: {} });
    if (!lauf) {
      this.aendern({ geladen: true });
      if (this.s.istHost) await this.neuesSpiel();
      return;
    }
    const liste = await this.adapter.ladeProtokoll(lauf);
    if (nr !== this.laufWechsel) return; // inzwischen anderer Lauf
    let z = anfangsZustand(this.inh);
    const gueltig: Ereignis[] = [];
    for (const e of liste) {
      if (e.seq !== z.seq + 1) break;
      z = anwenden(z, e, this.inh);
      gueltig.push(e);
    }
    this.aendern({ zustand: z, protokoll: gueltig, geladen: true });
    this.pruefeSzenario(z);
    this.protokollAbo = this.adapter.aufProtokoll(lauf, z.seq, (e) => this.empfange(e));
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
          if (this.puffer.size) void this.wechsleLauf(this.s.lauf);
        }, 2000);
      }
      return;
    }
    let offen = this.s.offen;
    for (const n of neu) {
      if (n.aktion && offen[n.aktion]) {
        const { [n.aktion]: _erledigt, ...rest } = offen;
        offen = rest;
        if (n.typ === "aktion_abgelehnt") this.hinweis("warnung", `Nicht ausgeführt: ${n.daten.grund}`);
      }
    }
    this.aendern({ zustand: z, protokoll: [...this.s.protokoll, ...neu], offen });
  }

  private pruefeSzenario(z: Spielzustand): void {
    const sz = this.inh.szenario;
    if (z.szenario && (z.szenario !== sz.id || z.version !== sz.version)) {
      this.hinweis("warnung", `Lauf wurde mit ${z.szenario} v${z.version} gestartet, geladen ist ${sz.id} v${sz.version}.`);
    }
  }

  // ---------------------------------------------------------------- Host (nur Spielleitung)

  private hostGeaendert(h: HostInfo | null): void {
    const warIch = this.s.istHost;
    const binIch = !!h && h.id === this.client;
    this.aendern({ host: h });
    if (warIch && !binIch) {
      this.host?.stoppen();
      this.host = null;
      this.aendern({ istHost: false });
      this.hinweis("warnung", h ? `Steuerung liegt jetzt bei „${h.name}“.` : "Steuerung freigegeben.");
    }
    if (this.s.rolle === "sl" && !binIch && (!h || istVeraltet(h.puls, this.adapter.serverJetzt()))) void this.bewerben(false);
  }

  private hostPruefen(): void {
    const h = this.s.host;
    if (!this.s.istHost && (!h || istVeraltet(h.puls, this.adapter.serverJetzt()))) void this.bewerben(false);
  }

  private bewirbt = false;

  private async bewerben(erzwingen: boolean): Promise<void> {
    if (this.s.rolle !== "sl" || this.s.istHost || this.bewirbt) return;
    this.bewirbt = true;
    try {
      const ok = await this.adapter.beanspruche({ id: this.client, name: this.s.name }, erzwingen);
      if (!ok || this.s.istHost) return;
      this.aendern({ istHost: true });
      if (this.s.geladen && !this.s.lauf) await this.neuesSpiel();
      else this.hostStarten();
    } catch (e) {
      this.hinweis("fehler", `Steuerung nicht möglich: ${(e as Error).message}`);
    } finally {
      this.bewirbt = false;
    }
  }

  /** Spielleitung: Steuerung von einem anderen Fenster übernehmen. */
  async uebernehmen(): Promise<void> {
    await this.bewerben(true);
  }

  private hostStarten(): void {
    if (!this.s.istHost || this.host || !this.s.lauf || !this.s.geladen) return;
    this.host = new Host(this.inh, this.adapter, this.s.lauf, this.s.protokoll, this.ich, {
      beiFehler: (e) => {
        this.host = null;
        this.aendern({ istHost: false });
        void this.adapter.gibFrei(this.client);
        this.hinweis("fehler", `Steuerung beendet: ${e.message}`);
        void this.wechsleLauf(this.s.lauf);
      },
    });
    this.host.starten();
  }

  /** Spielleitung (Host): neuen Lauf beginnen. Der alte Lauf bleibt gespeichert. */
  async neuesSpiel(): Promise<void> {
    if (!this.s.istHost) {
      this.hinweis("warnung", "Nur die steuernde Spielleitung kann ein neues Spiel beginnen.");
      return;
    }
    this.host?.stoppen();
    this.host = null;
    await this.adapter.setzeAktuellenLauf(neueLaufId());
  }

  /** Für Tests und Anzeige: hält dieses Fenster gerade die Steuerung? */
  get hostAktiv(): boolean {
    return !!this.host;
  }
}
