// Lokaler Sync-Adapter (Variante C): mehrere Fenster bzw. Bildschirme an EINEM Rechner.
// Ablage im localStorage (überlebt Neuladen), Benachrichtigung über BroadcastChannel.
// Funktioniert auch mit der Offline-Datei per Doppelklick (file://), siehe Netztest vom 19.10.
//
// Schlüssel je Sitzung (p = argus:v1:s:<sitzung>:):
//   p info · p host · p anw:<client>
//   p team:<team>:kopf · p team:<team>:lauf · p team:<team>:sp:<client>
//   p lauf:<team>:<lauf>:p:e000001 · p lauf:<team>:<lauf>:a:<id>
// Kopf, Lauf und jeder Spieler liegen unter eigenen Schlüsseln, damit zwei Fenster gleichzeitig
// schreiben können, ohne sich zu überschreiben (localStorage ist je Schlüssel atomar).
//
// Benachrichtigung auf zwei Wegen: BroadcastChannel ist schnell und trägt Ereignisse und Aktionen
// selbst mit. Für alles, was neu gelesen werden muss (Teams, Info, Anwesenheit, Host), ist das
// storage-Ereignis maßgeblich: Chromium gleicht localStorage zwischen Tabs verzögert ab, eine
// Nachricht kann also vor den Daten ankommen (Befund Lobby-Probe 21.10.: ein Fenster sah den Lauf
// seines Teams nicht). Das storage-Ereignis kommt erst, wenn die Änderung im Fenster lesbar ist.
import type { Aktion, Ereignis } from "../kern/ereignisse";
import { protokollSchluessel, zufall } from "../kern/ereignisse";
import {
  type Abmelden, type HostInfo, PULS_INTERVALL_MS, type SitzungsInfo, type SpielerEintrag, type SyncAdapter,
  type TeamDaten, type TeamKopf, type Teilnehmer, type Verbindung, istVeraltet,
} from "./adapter";

type Nachricht =
  | { t: "p"; team: string; lauf: string; e: Ereignis }
  | { t: "a"; team: string; lauf: string; a: Aktion }
  | { t: "teams" }
  | { t: "info" }
  | { t: "anw" }
  | { t: "host" };

export interface KanalFabrik {
  (name: string): { postMessage(m: unknown): void; onmessage: ((ev: { data: unknown }) => void) | null; close(): void };
}

/** Läufe je Team und Sitzungen, die im localStorage bleiben (ca. 5 MB Platz). */
const MAX_LAEUFE = 4;
const MAX_SITZUNGEN = 4;

export class LokalAdapter implements SyncAdapter {
  readonly art = "lokal" as const;
  private readonly p: string;
  private kanal: ReturnType<KanalFabrik> | null = null;
  private protokollHoerer = new Set<{ team: string; lauf: string; cb: (e: Ereignis) => void }>();
  private aktionsHoerer = new Set<{ team: string; lauf: string; cb: (a: Aktion) => void }>();
  private teamHoerer = new Set<(t: Record<string, TeamDaten>) => void>();
  private infoHoerer = new Set<(i: SitzungsInfo | null) => void>();
  private anwHoerer = new Set<(l: Teilnehmer[]) => void>();
  private hostHoerer = new Set<(h: HostInfo | null) => void>();
  private timer: ReturnType<typeof setInterval>[] = [];
  private anwesenheit: Omit<Teilnehmer, "puls"> | null = null;
  private hostId: string | null = null;
  private zaehler = 0;
  private readonly kennung = zufall(4);
  private beiSchliessen = () => this.trennen();
  private beiSpeicher = (ev: StorageEvent) => this.speicherGeaendert(ev);

  constructor(
    readonly sitzung: string,
    private readonly ablage: Storage = globalThis.localStorage,
    private readonly kanalFabrik: KanalFabrik = (n) => new BroadcastChannel(n) as unknown as ReturnType<KanalFabrik>,
  ) {
    this.p = `argus:v1:s:${sitzung}:`;
  }

  async verbinden(): Promise<void> {
    this.kanal = this.kanalFabrik(`argus:v1:s:${this.sitzung}`);
    this.kanal.onmessage = (ev) => this.empfange(ev.data as Nachricht);
    this.timer.push(setInterval(() => this.pulsen(), PULS_INTERVALL_MS));
    this.timer.push(setInterval(() => { this.meldeAnw(); this.meldeHost(); }, 2000));
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", this.beiSchliessen);
      window.addEventListener("storage", this.beiSpeicher);
    }
  }

  trennen(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("pagehide", this.beiSchliessen);
      window.removeEventListener("storage", this.beiSpeicher);
    }
    if (this.anwesenheit) this.ablage.removeItem(`${this.p}anw:${this.anwesenheit.client}`);
    this.anwesenheit = null;
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

  // ---------------------------------------------------------------- Sitzung

  async legeAn(info: SitzungsInfo): Promise<boolean> {
    if (this.ablage.getItem(`${this.p}info`) !== null) return false;
    this.altesAufraeumen();
    this.ablage.setItem(`${this.p}info`, JSON.stringify(info));
    this.meldeInfo();
    this.senden({ t: "info" });
    return true;
  }

  aufInfo(cb: (info: SitzungsInfo | null) => void): Abmelden {
    this.infoHoerer.add(cb);
    cb(this.infoLesen());
    return () => this.infoHoerer.delete(cb);
  }

  // ---------------------------------------------------------------- Teams

  aufTeams(cb: (teams: Record<string, TeamDaten>) => void): Abmelden {
    this.teamHoerer.add(cb);
    cb(this.teamsLesen());
    return () => this.teamHoerer.delete(cb);
  }

  async setzeTeam(team: string, kopf: TeamKopf, spieler?: { client: string; eintrag: SpielerEintrag }): Promise<void> {
    const alt = this.json<TeamKopf>(`${this.p}team:${team}:kopf`);
    this.ablage.setItem(`${this.p}team:${team}:kopf`, JSON.stringify({ ...alt, ...kopf }));
    if (spieler) this.ablage.setItem(`${this.p}team:${team}:sp:${spieler.client}`, JSON.stringify(spieler.eintrag));
    this.teamsGeaendert();
  }

  async aendereTeam(team: string, teil: Partial<Pick<TeamDaten, "name" | "farbe" | "lauf">>): Promise<void> {
    const kopf = this.json<TeamKopf>(`${this.p}team:${team}:kopf`);
    if (!kopf) throw new Error(`Team ${team} gibt es nicht`);
    const { lauf, ...rest } = teil;
    if (Object.keys(rest).length) this.ablage.setItem(`${this.p}team:${team}:kopf`, JSON.stringify({ ...kopf, ...rest }));
    if (lauf) {
      this.ablage.setItem(`${this.p}team:${team}:lauf`, lauf);
      this.laeufeAufraeumen(team, lauf);
    }
    this.teamsGeaendert();
  }

  async loescheTeam(team: string): Promise<void> {
    this.entferne(`${this.p}team:${team}:`);
    this.teamsGeaendert();
  }

  async setzeSpieler(team: string | null, client: string, eintrag: SpielerEintrag | null, ausTeams: string[] = []): Promise<void> {
    for (const t of ausTeams) if (t !== team) this.ablage.removeItem(`${this.p}team:${t}:sp:${client}`);
    if (team) {
      const key = `${this.p}team:${team}:sp:${client}`;
      if (eintrag === null) this.ablage.removeItem(key);
      else {
        if (this.ablage.getItem(`${this.p}team:${team}:kopf`) === null) throw new Error("Das Team gibt es nicht mehr");
        this.ablage.setItem(key, JSON.stringify(eintrag));
      }
    }
    this.teamsGeaendert();
  }

  // ---------------------------------------------------------------- Protokoll

  async ladeProtokoll(team: string, lauf: string): Promise<Ereignis[]> {
    return this.lies<Ereignis>(`${this.p}lauf:${team}:${lauf}:p:`).sort((a, b) => a.seq - b.seq);
  }

  aufProtokoll(team: string, lauf: string, abSeq: number, cb: (e: Ereignis) => void): Abmelden {
    const h = { team, lauf, cb };
    this.protokollHoerer.add(h);
    queueMicrotask(() => {
      if (!this.protokollHoerer.has(h)) return;
      for (const e of this.lies<Ereignis>(`${this.p}lauf:${team}:${lauf}:p:`).sort((a, b) => a.seq - b.seq)) {
        if (e.seq > abSeq) cb(e);
      }
    });
    return () => this.protokollHoerer.delete(h);
  }

  async schreibeEreignis(team: string, lauf: string, e: Ereignis): Promise<void> {
    const key = `${this.p}lauf:${team}:${lauf}:p:${protokollSchluessel(e.seq)}`;
    if (this.ablage.getItem(key) !== null) throw new Error(`seq ${e.seq} ist schon belegt (zweiter Host?)`);
    this.ablage.setItem(key, JSON.stringify(e));
    this.protokollHoerer.forEach((h) => h.team === team && h.lauf === lauf && h.cb(e));
    this.senden({ t: "p", team, lauf, e });
  }

  // ---------------------------------------------------------------- Aktionen

  async sendeAktion(team: string, lauf: string, a: Aktion): Promise<void> {
    this.ablage.setItem(`${this.p}lauf:${team}:${lauf}:a:${a.id}`, JSON.stringify(a));
    this.aktionsHoerer.forEach((h) => h.team === team && h.lauf === lauf && h.cb(a));
    this.senden({ t: "a", team, lauf, a });
  }

  aufAktionen(team: string, lauf: string, cb: (a: Aktion) => void): Abmelden {
    const h = { team, lauf, cb };
    this.aktionsHoerer.add(h);
    queueMicrotask(() => {
      if (!this.aktionsHoerer.has(h)) return;
      for (const a of this.lies<Aktion>(`${this.p}lauf:${team}:${lauf}:a:`).sort((x, y) => (x.id < y.id ? -1 : 1))) cb(a);
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
        this.protokollHoerer.forEach((h) => h.team === n.team && h.lauf === n.lauf && h.cb(n.e));
        break;
      case "a":
        this.aktionsHoerer.forEach((h) => h.team === n.team && h.lauf === n.lauf && h.cb(n.a));
        break;
      case "teams":
        this.meldeTeams();
        break;
      case "info":
        this.meldeInfo();
        break;
      case "anw":
        this.meldeAnw();
        break;
      case "host":
        this.meldeHost();
        break;
    }
  }

  /** Änderung aus einem anderen Fenster, jetzt in diesem lesbar. */
  private speicherGeaendert(ev: StorageEvent): void {
    if (ev.storageArea && ev.storageArea !== this.ablage) return;
    if (ev.key === null) {
      // ganzer Speicher geleert
      this.meldeTeams();
      this.meldeInfo();
      this.meldeAnw();
      this.meldeHost();
      return;
    }
    if (!ev.key.startsWith(this.p)) return;
    const rest = ev.key.slice(this.p.length);
    if (rest.startsWith("team:")) this.meldeTeams();
    else if (rest === "info") this.meldeInfo();
    else if (rest.startsWith("anw:")) this.meldeAnw();
    else if (rest === "host") this.meldeHost();
    else if (rest.startsWith("lauf:") && ev.newValue) {
      // Rückfallweg für Ereignisse und Aktionen (doppelte Zustellung ist erlaubt und wird übergangen)
      const [, team, lauf, art] = rest.split(":");
      try {
        if (art === "p") this.empfange({ t: "p", team, lauf, e: JSON.parse(ev.newValue) as Ereignis });
        else if (art === "a") this.empfange({ t: "a", team, lauf, a: JSON.parse(ev.newValue) as Aktion });
      } catch {
        /* unvollständiger Eintrag */
      }
    }
  }

  private senden(n: Nachricht): void {
    try {
      this.kanal?.postMessage(n);
    } catch {
      /* Fenster wird gerade geschlossen */
    }
  }

  private teamsGeaendert(): void {
    this.meldeTeams();
    this.senden({ t: "teams" });
  }

  private teamsLesen(): Record<string, TeamDaten> {
    const praefix = `${this.p}team:`;
    const out: Record<string, TeamDaten> = {};
    const laeufe: Record<string, string> = {};
    const spieler: Record<string, Record<string, SpielerEintrag>> = {};
    for (let i = 0; i < this.ablage.length; i++) {
      const k = this.ablage.key(i);
      if (!k || !k.startsWith(praefix)) continue;
      const [team, art, client] = k.slice(praefix.length).split(":");
      const roh = this.ablage.getItem(k);
      if (!roh || !team) continue;
      if (art === "kopf") out[team] = { ...(JSON.parse(roh) as TeamKopf) };
      else if (art === "lauf") laeufe[team] = roh;
      else if (art === "sp" && client) (spieler[team] ??= {})[client] = JSON.parse(roh) as SpielerEintrag;
    }
    for (const [team, d] of Object.entries(out)) {
      if (laeufe[team]) d.lauf = laeufe[team];
      if (spieler[team]) d.spieler = spieler[team];
    }
    return out;
  }

  private meldeTeams(): void {
    if (!this.teamHoerer.size) return;
    const t = this.teamsLesen();
    this.teamHoerer.forEach((cb) => cb(t));
  }

  private infoLesen(): SitzungsInfo | null {
    return this.json<SitzungsInfo>(`${this.p}info`);
  }

  private meldeInfo(): void {
    const i = this.infoLesen();
    this.infoHoerer.forEach((cb) => cb(i));
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
    if (!this.anwHoerer.size) return;
    const liste = this.anwListe();
    this.anwHoerer.forEach((cb) => cb(liste));
  }

  private hostLesen(): HostInfo | null {
    const h = this.json<HostInfo>(`${this.p}host`);
    if (!h) return null;
    return istVeraltet(h.puls, Date.now()) && h.id !== this.hostId ? null : h;
  }

  private meldeHost(): void {
    const h = this.hostLesen();
    this.hostHoerer.forEach((cb) => cb(h));
  }

  private json<T>(key: string): T | null {
    const roh = this.ablage.getItem(key);
    if (roh === null) return null;
    try {
      return JSON.parse(roh) as T;
    } catch {
      return null;
    }
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

  private entferne(praefix: string | ((k: string) => boolean)): void {
    const weg: string[] = [];
    for (let i = 0; i < this.ablage.length; i++) {
      const k = this.ablage.key(i);
      if (k && (typeof praefix === "string" ? k.startsWith(praefix) : praefix(k))) weg.push(k);
    }
    weg.forEach((k) => this.ablage.removeItem(k));
  }

  /** Hält höchstens MAX_LAEUFE Läufe je Team im Speicher. */
  private laeufeAufraeumen(team: string, aktuell: string): void {
    const praefix = `${this.p}lauf:${team}:`;
    const laeufe = new Set<string>();
    for (let i = 0; i < this.ablage.length; i++) {
      const k = this.ablage.key(i);
      if (k?.startsWith(praefix)) laeufe.add(k.slice(praefix.length).split(":")[0]);
    }
    const alt = [...laeufe].filter((l) => l !== aktuell).sort().reverse().slice(MAX_LAEUFE - 1);
    for (const l of alt) this.entferne(`${praefix}${l}:`);
  }

  /** Beim Anlegen einer Sitzung: ältere Sitzungen und den Speicher der Raum-Version (bis Schritt 6) entfernen. */
  private altesAufraeumen(): void {
    this.entferne((k) => k.startsWith("argus:v1:") && !k.startsWith("argus:v1:s:"));
    const sitzungen: { code: string; erstellt: number }[] = [];
    for (let i = 0; i < this.ablage.length; i++) {
      const m = this.ablage.key(i)?.match(/^argus:v1:s:([a-z0-9-]+):info$/);
      if (m) sitzungen.push({ code: m[1], erstellt: this.json<SitzungsInfo>(`argus:v1:s:${m[1]}:info`)?.erstellt ?? 0 });
    }
    sitzungen.sort((a, b) => b.erstellt - a.erstellt).slice(MAX_SITZUNGEN - 1)
      .forEach((s) => this.entferne(`argus:v1:s:${s.code}:`));
  }
}
