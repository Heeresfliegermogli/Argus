// Künstlicher Netzverzug um einen Sync-Adapter (Nachweis H1.6): Jeder Schreib- und Lesevorgang braucht `verzugMs` hin und
// `verzugMs` zurück, jede Benachrichtigung kommt `verzugMs` später an. `trennen(true)` simuliert einen Ausfall: Schreiben und Lesen
// schlagen fehl, Benachrichtigungen bleiben liegen und kommen nach dem Wiederverbinden (mit Verzug) nach.
// Im Spiel: …&verzug=5000 (ms) hängt den Verzug an den Adapter des Fensters (Tests und Vorführung, nicht für das Seminar).
import type { Aktion, Ereignis } from "../kern/ereignisse";
import type { TeamStatus } from "../kern/uebersicht";
import type {
  Abmelden, HostInfo, SitzungsInfo, SpielerEintrag, SyncAdapter, TeamDaten, TeamKopf, Teilnehmer, Verbindung,
} from "./adapter";

export class VerzugAdapter implements SyncAdapter {
  private getrennt = false;
  private liegen: (() => void)[] = [];
  private verbHoerer = new Set<(v: Verbindung) => void>();
  private letzteVerbindung: Verbindung = { verbunden: false, art: "" };

  constructor(private readonly a: SyncAdapter, public verzugMs: number) {}

  get art() {
    return this.a.art;
  }

  get sitzung() {
    return this.a.sitzung;
  }

  /** Verbindung trennen (true) oder wiederherstellen (false). */
  trennenSimuliert(ja: boolean): void {
    this.getrennt = ja;
    this.verbHoerer.forEach((cb) => cb(this.verbindung()));
    if (!ja) {
      const l = this.liegen;
      this.liegen = [];
      l.forEach((f) => this.liefern(f));
    }
  }

  get istGetrennt(): boolean {
    return this.getrennt;
  }

  private verbindung(): Verbindung {
    const v = this.letzteVerbindung;
    return this.getrennt ? { ...v, verbunden: false, fehler: "keine Verbindung (simuliert)" } : { ...v, art: `${v.art} · Verzug ${this.verzugMs} ms` };
  }

  private warte(): Promise<void> {
    return new Promise((ok) => setTimeout(ok, this.verzugMs));
  }

  /** Vorgang über das „Netz“: hin, ausführen, zurück. Getrennt: Fehler. */
  private async netz<T>(f: () => Promise<T>): Promise<T> {
    if (this.getrennt) throw new Error("keine Verbindung (simuliert)");
    await this.warte();
    if (this.getrennt) throw new Error("keine Verbindung (simuliert)");
    const erg = await f();
    await this.warte();
    return erg;
  }

  /** Benachrichtigung mit Verzug; getrennt bleibt sie liegen. */
  private liefern(f: () => void): void {
    if (this.getrennt) {
      this.liegen.push(f);
      return;
    }
    setTimeout(() => (this.getrennt ? this.liegen.push(f) : f()), this.verzugMs);
  }

  private hoer<T>(cb: (x: T) => void): (x: T) => void {
    return (x: T) => this.liefern(() => cb(x));
  }

  verbinden(): Promise<void> {
    return this.a.verbinden();
  }

  trennen(): void {
    this.a.trennen();
  }

  aufVerbindung(cb: (v: Verbindung) => void): Abmelden {
    this.verbHoerer.add(cb);
    const ab = this.a.aufVerbindung((v) => {
      this.letzteVerbindung = v;
      cb(this.verbindung());
    });
    return () => {
      this.verbHoerer.delete(cb);
      ab();
    };
  }

  serverJetzt(): number {
    return this.a.serverJetzt();
  }

  neueId(): string {
    return this.a.neueId();
  }

  legeAn(info: SitzungsInfo): Promise<boolean> {
    return this.netz(() => this.a.legeAn(info));
  }

  aufInfo(cb: (info: SitzungsInfo | null) => void): Abmelden {
    return this.a.aufInfo(this.hoer(cb));
  }

  aufTeams(cb: (teams: Record<string, TeamDaten>) => void): Abmelden {
    return this.a.aufTeams(this.hoer(cb));
  }

  setzeTeam(team: string, kopf: TeamKopf, spieler?: { client: string; eintrag: SpielerEintrag }): Promise<void> {
    return this.netz(() => this.a.setzeTeam(team, kopf, spieler));
  }

  aendereTeam(team: string, teil: Partial<Pick<TeamDaten, "name" | "farbe" | "lauf">>): Promise<void> {
    return this.netz(() => this.a.aendereTeam(team, teil));
  }

  loescheTeam(team: string): Promise<void> {
    return this.netz(() => this.a.loescheTeam(team));
  }

  setzeSpieler(team: string | null, client: string, eintrag: SpielerEintrag | null, ausTeams?: string[]): Promise<void> {
    return this.netz(() => this.a.setzeSpieler(team, client, eintrag, ausTeams));
  }

  ladeProtokoll(team: string, lauf: string): Promise<Ereignis[]> {
    return this.netz(() => this.a.ladeProtokoll(team, lauf));
  }

  aufProtokoll(team: string, lauf: string, abSeq: number, cb: (e: Ereignis) => void): Abmelden {
    return this.a.aufProtokoll(team, lauf, abSeq, this.hoer(cb));
  }

  schreibeEreignis(team: string, lauf: string, e: Ereignis): Promise<void> {
    return this.netz(() => this.a.schreibeEreignis(team, lauf, e));
  }

  schreibeEreignisse(team: string, lauf: string, liste: Ereignis[]): Promise<void> {
    return this.netz(() => this.a.schreibeEreignisse(team, lauf, liste));
  }

  sendeAktion(team: string, lauf: string, x: Aktion): Promise<void> {
    return this.netz(() => this.a.sendeAktion(team, lauf, x));
  }

  aufAktionen(team: string, lauf: string, cb: (x: Aktion) => void): Abmelden {
    return this.a.aufAktionen(team, lauf, this.hoer(cb));
  }

  schreibeStatus(team: string, s: TeamStatus): Promise<void> {
    return this.netz(() => this.a.schreibeStatus(team, s));
  }

  aufStatus(cb: (liste: Record<string, TeamStatus>) => void): Abmelden {
    return this.a.aufStatus(this.hoer(cb));
  }

  meldeAnwesenheit(t: Omit<Teilnehmer, "puls">): void {
    this.a.meldeAnwesenheit(t);
  }

  aufAnwesenheit(cb: (liste: Teilnehmer[]) => void): Abmelden {
    return this.a.aufAnwesenheit(this.hoer(cb));
  }

  beanspruche(host: Omit<HostInfo, "puls">, erzwingen: boolean): Promise<boolean> {
    return this.netz(() => this.a.beanspruche(host, erzwingen));
  }

  gibFrei(id: string): Promise<void> {
    return this.netz(() => this.a.gibFrei(id));
  }

  aufHost(cb: (h: HostInfo | null) => void): Abmelden {
    return this.a.aufHost(this.hoer(cb));
  }
}
