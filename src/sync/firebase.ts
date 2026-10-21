// Sync-Adapter für Firebase Realtime Database (Variante A).
// Offizielles SDK; WebSocket ist im Hörsaalnetz gesperrt, deshalb standardmäßig Long-Polling
// (Sync-Test 19.10.: Median 449 ms, max. 596 ms). Eigene REST-Aufrufe werden nicht verwendet,
// weil der Proxy HTTP-DELETE blockiert.
// Pfad je Sitzung: argus/v1/sitzungen/<sitzung>/ (Aufbau siehe adapter.ts).
import { type FirebaseApp, deleteApp, initializeApp } from "firebase/app";
import {
  type Database, type DatabaseReference, type Unsubscribe, forceLongPolling, getDatabase, onChildAdded,
  onDisconnect, onValue, orderByKey, push, query, ref, runTransaction, serverTimestamp, set, startAfter, update,
} from "firebase/database";
import type { Aktion, Ereignis } from "../kern/ereignisse";
import { bereinigt, protokollSchluessel, zufall } from "../kern/ereignisse";
import {
  type Abmelden, type HostInfo, PULS_INTERVALL_MS, type SitzungsInfo, type SpielerEintrag, type SyncAdapter,
  type TeamDaten, type TeamKopf, type Teilnehmer, type Verbindung, istVeraltet,
} from "./adapter";

export interface FirebaseEinstellungen {
  /** z. B. https://argus-sync-e9fbc-default-rtdb.firebaseio.com */
  databaseURL: string;
  /** "lp" = immer Long-Polling (Standard), "auto" = SDK entscheidet (WebSocket, sonst Long-Polling) */
  transport: "lp" | "auto";
}

export class FirebaseAdapter implements SyncAdapter {
  readonly art = "firebase" as const;
  private app: FirebaseApp | null = null;
  private db: Database | null = null;
  private readonly b: string;
  private versatz = 0;
  private verbindung: Verbindung;
  private verbHoerer = new Set<(v: Verbindung) => void>();
  private abos: Unsubscribe[] = [];
  private timer: ReturnType<typeof setInterval>[] = [];
  private anwRef: DatabaseReference | null = null;
  private anwTimer: ReturnType<typeof setInterval> | null = null;
  private hostId: string | null = null;
  private hostTimer: ReturnType<typeof setInterval> | null = null;

  constructor(readonly sitzung: string, private readonly cfg: FirebaseEinstellungen) {
    this.b = `argus/v1/sitzungen/${sitzung}`;
    this.verbindung = { verbunden: false, art: this.artText() };
  }

  private artText(): string {
    return `Firebase · ${this.cfg.transport === "lp" ? "Long-Polling" : "automatisch"}`;
  }

  private get d(): Database {
    if (!this.db) throw new Error("Firebase nicht verbunden");
    return this.db;
  }

  private r(pfad: string): DatabaseReference {
    return ref(this.d, `${this.b}/${pfad}`);
  }

  async verbinden(): Promise<void> {
    if (this.cfg.transport === "lp") forceLongPolling();
    this.app = initializeApp({ databaseURL: this.cfg.databaseURL }, `argus-${this.sitzung}-${zufall(4)}`);
    this.db = getDatabase(this.app);
    this.abos.push(onValue(ref(this.db, ".info/serverTimeOffset"), (s) => { this.versatz = Number(s.val()) || 0; }));
    this.abos.push(onValue(ref(this.db, ".info/connected"), (s) => {
      this.verbindung = { verbunden: !!s.val(), art: this.artText() };
      this.verbHoerer.forEach((cb) => cb(this.verbindung));
    }));
  }

  trennen(): void {
    this.abos.forEach((u) => u());
    this.abos = [];
    this.timer.forEach(clearInterval);
    this.timer = [];
    if (this.anwTimer) clearInterval(this.anwTimer);
    this.anwTimer = null;
    if (this.hostTimer) clearInterval(this.hostTimer);
    if (this.app) void deleteApp(this.app);
    this.app = null;
    this.db = null;
  }

  aufVerbindung(cb: (v: Verbindung) => void): Abmelden {
    this.verbHoerer.add(cb);
    cb(this.verbindung);
    return () => this.verbHoerer.delete(cb);
  }

  serverJetzt(): number {
    return Date.now() + this.versatz;
  }

  neueId(): string {
    // push() ohne Wert erzeugt nur einen zeitlich sortierbaren Schlüssel, schreibt nichts.
    return push(this.r("ids")).key!;
  }

  private abo(u: Unsubscribe): Abmelden {
    this.abos.push(u);
    return () => {
      u();
      this.abos = this.abos.filter((x) => x !== u);
    };
  }

  // ---------------------------------------------------------------- Sitzung

  async legeAn(info: SitzungsInfo): Promise<boolean> {
    try {
      const erg = await runTransaction(this.r("info"), (alt: SitzungsInfo | null) => (alt ? undefined : bereinigt(info)));
      return erg.committed;
    } catch (e) {
      // Gibt es den Code schon, lehnt die Regel „nur anlegen“ den ersten Versuch ab, bevor der
      // Vergleich mit dem Bestand greift. Dann ist der Code eben vergeben.
      const da = await new Promise<boolean>((ok) => onValue(this.r("info"), (s) => ok(s.exists()), () => ok(false), { onlyOnce: true }));
      if (da) return false;
      throw e;
    }
  }

  aufInfo(cb: (info: SitzungsInfo | null) => void): Abmelden {
    return this.abo(onValue(this.r("info"), (s) => cb((s.val() as SitzungsInfo | null) ?? null), (e) => this.fehler(e)));
  }

  // ---------------------------------------------------------------- Teams

  aufTeams(cb: (teams: Record<string, TeamDaten>) => void): Abmelden {
    return this.abo(onValue(this.r("teams"), (s) => cb((s.val() ?? {}) as Record<string, TeamDaten>), (e) => this.fehler(e)));
  }

  async setzeTeam(team: string, kopf: TeamKopf, spieler?: { client: string; eintrag: SpielerEintrag }): Promise<void> {
    // update statt set: legt an oder ergänzt, ohne vorhandene Spieler zu überschreiben.
    const werte: Record<string, unknown> = { name: kopf.name, farbe: kopf.farbe, erstellt: kopf.erstellt };
    if (spieler) werte[`spieler/${spieler.client}`] = bereinigt(spieler.eintrag);
    await update(this.r(`teams/${team}`), werte);
  }

  async aendereTeam(team: string, teil: Partial<Pick<TeamDaten, "name" | "farbe" | "lauf">>): Promise<void> {
    await update(this.r(`teams/${team}`), bereinigt(teil));
  }

  async loescheTeam(team: string): Promise<void> {
    await set(this.r(`teams/${team}`), null);
  }

  async setzeSpieler(team: string | null, client: string, eintrag: SpielerEintrag | null, ausTeams: string[] = []): Promise<void> {
    // Mehrere Pfade in einem Schreibvorgang: Teamwechsel ist entweder ganz oder gar nicht passiert.
    const werte: Record<string, unknown> = {};
    for (const t of ausTeams) if (t !== team) werte[`${t}/spieler/${client}`] = null;
    if (team) werte[`${team}/spieler/${client}`] = eintrag ? bereinigt(eintrag) : null;
    if (Object.keys(werte).length) await update(this.r("teams"), werte);
  }

  // ---------------------------------------------------------------- Protokoll

  async ladeProtokoll(team: string, lauf: string): Promise<Ereignis[]> {
    // onValue mit onlyOnce statt get(): gleiches Ergebnis, funktioniert auch mit älteren Test-Servern.
    const v = await new Promise<Record<string, Ereignis> | null>((ok, fehler) => {
      onValue(this.r(`laeufe/${team}/${lauf}/protokoll`), (s) => ok(s.val() as Record<string, Ereignis> | null), fehler, { onlyOnce: true });
    });
    return Object.values(v ?? {}).sort((a, b) => a.seq - b.seq);
  }

  aufProtokoll(team: string, lauf: string, abSeq: number, cb: (e: Ereignis) => void): Abmelden {
    const q = query(this.r(`laeufe/${team}/${lauf}/protokoll`), orderByKey(), startAfter(protokollSchluessel(abSeq)));
    return this.abo(onChildAdded(q, (s) => cb(s.val() as Ereignis), (e) => this.fehler(e)));
  }

  async schreibeEreignis(team: string, lauf: string, e: Ereignis): Promise<void> {
    await set(this.r(`laeufe/${team}/${lauf}/protokoll/${protokollSchluessel(e.seq)}`), bereinigt(e));
  }

  // ---------------------------------------------------------------- Aktionen

  async sendeAktion(team: string, lauf: string, a: Aktion): Promise<void> {
    await set(this.r(`laeufe/${team}/${lauf}/aktionen/${a.id}`), bereinigt(a));
  }

  aufAktionen(team: string, lauf: string, cb: (a: Aktion) => void): Abmelden {
    const q = query(this.r(`laeufe/${team}/${lauf}/aktionen`), orderByKey());
    return this.abo(onChildAdded(q, (s) => cb(s.val() as Aktion), (e) => this.fehler(e)));
  }

  // ---------------------------------------------------------------- Anwesenheit

  meldeAnwesenheit(t: Omit<Teilnehmer, "puls">): void {
    this.anwRef = this.r(`anwesenheit/${t.client}`);
    const r = this.anwRef;
    // Ganzer Eintrag bei jedem Puls (nicht nur puls): kommt auch nach einem Verbindungsabbruch wieder.
    const schreiben = () => set(r, bereinigt({ ...t, puls: serverTimestamp() })).catch((e: Error) => this.fehler(e));
    onDisconnect(r).remove().catch(() => {});
    void schreiben();
    if (this.anwTimer) clearInterval(this.anwTimer);
    this.anwTimer = setInterval(() => void schreiben(), PULS_INTERVALL_MS);
  }

  aufAnwesenheit(cb: (liste: Teilnehmer[]) => void): Abmelden {
    let letzte: Record<string, Teilnehmer> = {};
    const melden = () => cb(Object.values(letzte).filter((t) => !istVeraltet(t.puls, this.serverJetzt())));
    const t = setInterval(melden, PULS_INTERVALL_MS);
    const ab = this.abo(onValue(this.r("anwesenheit"), (s) => {
      letzte = (s.val() ?? {}) as Record<string, Teilnehmer>;
      melden();
    }));
    return () => {
      clearInterval(t);
      ab();
    };
  }

  // ---------------------------------------------------------------- Host

  async beanspruche(host: Omit<HostInfo, "puls">, erzwingen: boolean): Promise<boolean> {
    const r = this.r("host");
    const erg = await runTransaction(r, (alt: HostInfo | null) => {
      const jetzt = this.serverJetzt();
      if (alt && alt.id !== host.id && !erzwingen && !istVeraltet(alt.puls, jetzt)) return undefined;
      return { id: host.id, name: host.name, puls: jetzt };
    });
    if (!erg.committed) return false;
    this.hostId = host.id;
    // Nicht abwarten: Die Registrierung läuft in Reihenfolge mit den übrigen Schreibvorgängen.
    onDisconnect(r).remove().catch(() => {});
    if (this.hostTimer) clearInterval(this.hostTimer);
    this.hostTimer = setInterval(() => {
      void runTransaction(r, (alt: HostInfo | null) =>
        alt && alt.id === this.hostId ? { ...alt, puls: this.serverJetzt() } : undefined);
    }, PULS_INTERVALL_MS);
    return true;
  }

  async gibFrei(id: string): Promise<void> {
    const r = this.r("host");
    if (this.hostTimer) clearInterval(this.hostTimer);
    this.hostTimer = null;
    this.hostId = null;
    onDisconnect(r).cancel().catch(() => {});
    await runTransaction(r, (alt: HostInfo | null) => (alt && alt.id === id ? null : undefined));
  }

  aufHost(cb: (h: HostInfo | null) => void): Abmelden {
    return this.abo(onValue(this.r("host"), (s) => cb((s.val() as HostInfo | null) ?? null)));
  }

  private fehler(e: Error): void {
    this.verbindung = { ...this.verbindung, fehler: e.message };
    this.verbHoerer.forEach((cb) => cb(this.verbindung));
  }
}
