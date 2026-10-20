// Lokaler Sync-Adapter (Variante C): mehrere Fenster bzw. Bildschirme an EINEM Rechner.
// Ablage im localStorage (überlebt Neuladen), Benachrichtigung über BroadcastChannel.
// Funktioniert auch mit der Offline-Datei per Doppelklick (file://), siehe Netztest vom 19.10.
import type { Aktion, Ereignis } from "../kern/ereignisse";
import { protokollSchluessel, zufall } from "../kern/ereignisse";
import {
  type Abmelden, type HostInfo, PULS_INTERVALL_MS, type SyncAdapter, type Teilnehmer, type Verbindung, istVeraltet,
} from "./adapter";

type Nachricht =
  | { t: "p"; lauf: string; e: Ereignis }
  | { t: "a"; lauf: string; a: Aktion }
  | { t: "aktuell"; lauf: string }
  | { t: "anw" }
  | { t: "host" };

export interface KanalFabrik {
  (name: string): { postMessage(m: unknown): void; onmessage: ((ev: { data: unknown }) => void) | null; close(): void };
}

const MAX_LAEUFE = 6;

export class LokalAdapter implements SyncAdapter {
  readonly art = "lokal" as const;
  private readonly p: string;
  private kanal: ReturnType<KanalFabrik> | null = null;
  private protokollHoerer = new Set<{ lauf: string; cb: (e: Ereignis) => void }>();
  private aktionsHoerer = new Set<{ lauf: string; cb: (a: Aktion) => void }>();
  private aktuellHoerer = new Set<(lauf: string | null) => void>();
  private anwHoerer = new Set<(l: Teilnehmer[]) => void>();
  private hostHoerer = new Set<(h: HostInfo | null) => void>();
  private timer: ReturnType<typeof setInterval>[] = [];
  private anwesenheit: Omit<Teilnehmer, "puls"> | null = null;
  private hostId: string | null = null;
  private zaehler = 0;
  private readonly kennung = zufall(4);

  constructor(
    readonly raum: string,
    private readonly ablage: Storage = globalThis.localStorage,
    private readonly kanalFabrik: KanalFabrik = (n) => new BroadcastChannel(n) as unknown as ReturnType<KanalFabrik>,
  ) {
    this.p = `argus:v1:${raum}:`;
  }

  async verbinden(): Promise<void> {
    this.kanal = this.kanalFabrik(`argus:v1:${this.raum}`);
    this.kanal.onmessage = (ev) => this.empfange(ev.data as Nachricht);
    this.timer.push(setInterval(() => this.pulsen(), PULS_INTERVALL_MS));
    this.timer.push(setInterval(() => { this.meldeAnw(); this.meldeHost(); }, 2000));
    if (typeof window !== "undefined") window.addEventListener("pagehide", () => this.trennen());
  }

  trennen(): void {
    if (this.anwesenheit) this.ablage.removeItem(`${this.p}anw:${this.anwesenheit.client}`);
    if (this.hostId) void this.gibFrei(this.hostId);
    this.senden({ t: "anw" });
    this.timer.forEach(clearInterval);
    this.timer = [];
    this.kanal?.close();
    this.kanal = null;
  }

  aufVerbindung(cb: (v: Verbindung) => void): Abmelden {
    cb({ verbunden: true, art: "lokal · dieser PC" });
    return () => {};
  }

  serverJetzt(): number {
    return Date.now();
  }

  neueId(): string {
    this.zaehler += 1;
    return `${Date.now().toString(36).padStart(9, "0")}-${this.kennung}-${this.zaehler.toString(36)}`;
  }

  // ---------------------------------------------------------------- Lauf

  aufAktuellenLauf(cb: (lauf: string | null) => void): Abmelden {
    this.aktuellHoerer.add(cb);
    cb(this.ablage.getItem(`${this.p}aktuell`));
    return () => this.aktuellHoerer.delete(cb);
  }

  async setzeAktuellenLauf(lauf: string): Promise<void> {
    this.ablage.setItem(`${this.p}aktuell`, lauf);
    this.aufraeumen(lauf);
    this.aktuellHoerer.forEach((cb) => cb(lauf));
    this.senden({ t: "aktuell", lauf });
  }

  // ---------------------------------------------------------------- Protokoll

  async ladeProtokoll(lauf: string): Promise<Ereignis[]> {
    return this.lies<Ereignis>(`${this.p}lauf:${lauf}:p:`).sort((a, b) => a.seq - b.seq);
  }

  aufProtokoll(lauf: string, abSeq: number, cb: (e: Ereignis) => void): Abmelden {
    const h = { lauf, cb };
    this.protokollHoerer.add(h);
    queueMicrotask(() => {
      if (!this.protokollHoerer.has(h)) return;
      for (const e of this.lies<Ereignis>(`${this.p}lauf:${lauf}:p:`).sort((a, b) => a.seq - b.seq)) {
        if (e.seq > abSeq) cb(e);
      }
    });
    return () => this.protokollHoerer.delete(h);
  }

  async schreibeEreignis(lauf: string, e: Ereignis): Promise<void> {
    const key = `${this.p}lauf:${lauf}:p:${protokollSchluessel(e.seq)}`;
    if (this.ablage.getItem(key) !== null) throw new Error(`seq ${e.seq} ist schon belegt (zweiter Host?)`);
    this.ablage.setItem(key, JSON.stringify(e));
    this.protokollHoerer.forEach((h) => h.lauf === lauf && h.cb(e));
    this.senden({ t: "p", lauf, e });
  }

  // ---------------------------------------------------------------- Aktionen

  async sendeAktion(lauf: string, a: Aktion): Promise<void> {
    this.ablage.setItem(`${this.p}lauf:${lauf}:a:${a.id}`, JSON.stringify(a));
    this.aktionsHoerer.forEach((h) => h.lauf === lauf && h.cb(a));
    this.senden({ t: "a", lauf, a });
  }

  aufAktionen(lauf: string, cb: (a: Aktion) => void): Abmelden {
    const h = { lauf, cb };
    this.aktionsHoerer.add(h);
    queueMicrotask(() => {
      if (!this.aktionsHoerer.has(h)) return;
      for (const a of this.lies<Aktion>(`${this.p}lauf:${lauf}:a:`).sort((x, y) => (x.id < y.id ? -1 : 1))) cb(a);
    });
    return () => this.aktionsHoerer.delete(h);
  }

  // ---------------------------------------------------------------- Anwesenheit

  meldeAnwesenheit(t: Omit<Teilnehmer, "puls">): void {
    this.anwesenheit = t;
    this.pulsen();
  }

  aufAnwesenheit(cb: (liste: Teilnehmer[]) => void): Abmelden {
    this.anwHoerer.add(cb);
    cb(this.anwListe());
    return () => this.anwHoerer.delete(cb);
  }

  // ---------------------------------------------------------------- Host

  async beanspruche(host: Omit<HostInfo, "puls">, erzwingen: boolean): Promise<boolean> {
    const alt = this.hostLesen();
    if (alt && alt.id !== host.id && !erzwingen && !istVeraltet(alt.puls, Date.now())) return false;
    this.ablage.setItem(`${this.p}host`, JSON.stringify({ ...host, puls: Date.now() }));
    this.hostId = host.id;
    this.meldeHost();
    this.senden({ t: "host" });
    return true;
  }

  async gibFrei(id: string): Promise<void> {
    if (this.hostLesen()?.id === id) this.ablage.removeItem(`${this.p}host`);
    if (this.hostId === id) this.hostId = null;
    this.meldeHost();
    this.senden({ t: "host" });
  }

  aufHost(cb: (h: HostInfo | null) => void): Abmelden {
    this.hostHoerer.add(cb);
    cb(this.hostLesen());
    return () => this.hostHoerer.delete(cb);
  }

  // ---------------------------------------------------------------- intern

  private empfange(n: Nachricht): void {
    switch (n.t) {
      case "p":
        this.protokollHoerer.forEach((h) => h.lauf === n.lauf && h.cb(n.e));
        break;
      case "a":
        this.aktionsHoerer.forEach((h) => h.lauf === n.lauf && h.cb(n.a));
        break;
      case "aktuell":
        this.aktuellHoerer.forEach((cb) => cb(n.lauf));
        break;
      case "anw":
        this.meldeAnw();
        break;
      case "host":
        this.meldeHost();
        break;
    }
  }

  private senden(n: Nachricht): void {
    try {
      this.kanal?.postMessage(n);
    } catch {
      /* Fenster wird gerade geschlossen */
    }
  }

  private pulsen(): void {
    const jetzt = Date.now();
    if (this.anwesenheit) {
      this.ablage.setItem(`${this.p}anw:${this.anwesenheit.client}`, JSON.stringify({ ...this.anwesenheit, puls: jetzt }));
      this.meldeAnw();
      this.senden({ t: "anw" });
    }
    if (this.hostId) {
      const h = this.hostLesen();
      if (h?.id === this.hostId) this.ablage.setItem(`${this.p}host`, JSON.stringify({ ...h, puls: jetzt }));
    }
  }

  private anwListe(): Teilnehmer[] {
    const jetzt = Date.now();
    return this.lies<Teilnehmer>(`${this.p}anw:`).filter((t) => !istVeraltet(t.puls, jetzt));
  }

  private meldeAnw(): void {
    const liste = this.anwListe();
    this.anwHoerer.forEach((cb) => cb(liste));
  }

  private hostLesen(): HostInfo | null {
    const roh = this.ablage.getItem(`${this.p}host`);
    if (!roh) return null;
    const h = JSON.parse(roh) as HostInfo;
    return istVeraltet(h.puls, Date.now()) && h.id !== this.hostId ? null : h;
  }

  private meldeHost(): void {
    const h = this.hostLesen();
    this.hostHoerer.forEach((cb) => cb(h));
  }

  private lies<T>(praefix: string): T[] {
    const out: T[] = [];
    for (let i = 0; i < this.ablage.length; i++) {
      const k = this.ablage.key(i);
      if (k && k.startsWith(praefix)) {
        const roh = this.ablage.getItem(k);
        if (roh) out.push(JSON.parse(roh) as T);
      }
    }
    return out;
  }

  /** Hält höchstens MAX_LAEUFE Läufe im Speicher (localStorage ist auf ca. 5 MB begrenzt). */
  private aufraeumen(aktuell: string): void {
    const laeufe = new Set<string>();
    const muster = new RegExp(`^${this.p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}lauf:([^:]+):`);
    for (let i = 0; i < this.ablage.length; i++) {
      const m = this.ablage.key(i)?.match(muster);
      if (m) laeufe.add(m[1]);
    }
    const alt = [...laeufe].filter((l) => l !== aktuell).sort().reverse().slice(MAX_LAEUFE - 1);
    if (!alt.length) return;
    const weg: string[] = [];
    for (let i = 0; i < this.ablage.length; i++) {
      const k = this.ablage.key(i);
      const m = k?.match(muster);
      if (k && m && alt.includes(m[1])) weg.push(k);
    }
    weg.forEach((k) => this.ablage.removeItem(k));
  }
}
