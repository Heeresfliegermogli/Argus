// Sitzung: verbindet ein Browserfenster mit einer Sitzung (Code). Ein Adapter je Fenster.
//
// Seit 2.6 (Änderungen H) rechnet jeder Team-Laptop sein Spiel selbst; das Netz trägt nur noch Lobby, Start/Pause der Spielleitung,
// die Statusmeldungen der Teams und den Protokoll-Upload.
//  • Lobby: Teams (Name, Farbe) und wer an welchem Laptop sitzt, Anwesenheit. Keine Rollenwahl: Jedes Team ist die
//    Zielbearbeitung (zb).
//  • Team-Fenster: tritt einem Team bei. Das erste Fenster des Teams (frühestes „seit“) rechnet das Spiel (Host, Ablage, Upload,
//    Status); ein weiteres Fenster desselben Teams sieht nur zu und kann übernehmen, wenn der Team-Laptop weg ist.
//  • Spielleitung: sieht alle Teams (Statusmeldungen, hochgeladene Protokolle), öffnet Spiele (Lauf), startet und hält an. Die
//    steuernde Spielleitung ist eine (host in der Datenbank); fällt sie aus, übernimmt eine zweite. Sie rechnet kein Spiel.
//  • Plenum: sieht alle Teams, sendet nichts.
//
// Direktaufruf ohne Lobby (…/?rolle=zb&raum=…, …/?rolle=sl&raum=…): ein Team. Das Team-Fenster legt Sitzung, Team und Lauf an, wenn
// sie fehlen, und rechnet das Spiel; eine Spielleitung im selben Raum steuert und sieht zu.
import type { Inhalte } from "../inhalte/typen";
import { type Absender, type AktionsDaten, type AktionsTyp, type Rolle, neueLaufId, zufall } from "../kern/ereignisse";
import { fensterJetzt, fensterKennung } from "../kern/fenster";
import { ROLLEN_NAME } from "../kern/sichten";
import {
  DIREKT_TEAM, type GruppenRolle, SPIELERNAME_MAX, codeAnzeige, freieFarbe, neueTeamId, rollenAus, rollenText, teamnameBereinigt,
} from "../kern/sitzungen";
import type { TeamStatus } from "../kern/uebersicht";
import {
  type Abmelden, type FensterArt, type HostInfo, PULS_INTERVALL_MS, type SitzungsInfo, type SpielerEintrag, type SyncAdapter,
  type TeamDaten, type Teilnehmer, type Verbindung, istVeraltet, regelFehler, teamKanal,
} from "../sync/adapter";
import { SpeicherAblage, leseProtokollDatei } from "./ablage";
import { Hinweisgeber } from "./hinweise";
import { Spiel } from "./spiel";

export interface SpielerStand {
  client: string;
  name: string;
  rollen: GruppenRolle[];
  online: boolean;
  /** Serverzeit des Beitritts (das früheste anwesende Fenster eines Teams rechnet sein Spiel) */
  seit: number;
  /** seit Liste J (J2.4): Fenstergröße aus der Anwesenheit, „1536x730“ */
  fenster?: string;
}

export interface TeamStand {
  id: string;
  name: string;
  farbe: string;
  erstellt: number;
  lauf: string | null;
  spieler: SpielerStand[];
  /**
   * Fenster, das das Spiel des Teams rechnet (Team-Laptop): das früheste im Team (nach „seit“), ob verbunden oder nicht. Ein Laptop
   * ohne Netz spielt weiter (H1.3) – deshalb übernimmt kein anderes Fenster von selbst, nur von Hand („Spiel hier weiterführen“).
   */
  rechner: string | null;
  /** der Team-Laptop ist gerade verbunden (Anwesenheit frisch) */
  rechnerOnline: boolean;
}

export interface SitzungsStand {
  /** Pfadschlüssel, z. B. k7p */
  sitzung: string;
  /** Anzeige, z. B. K7P */
  code: string;
  art: FensterArt;
  client: string;
  name: string;
  verbindung: Verbindung;
  info: SitzungsInfo | null;
  infoGeladen: boolean;
  teamsGeladen: boolean;
  /** nach Erstellung sortiert */
  teams: TeamStand[];
  teilnehmer: Teilnehmer[];
  /** steuernde Spielleitung */
  host: HostInfo | null;
  /** dieses Fenster steuert (Spielleitung) */
  istHost: boolean;
  /** eigenes Team (Team-Fenster) und ob dieses Fenster das Spiel des Teams rechnet */
  ich: { team: string | null; rollen: GruppenRolle[]; rechnet: boolean };
  /** Statusmeldungen der Teams (Spielleitung, Plenum) */
  status: Record<string, TeamStatus>;
  /** Firebase-Regeln lehnen ab (H1.5: in der Konsole neu veröffentlichen) */
  regelFehler: boolean;
  /** Direktaufruf ohne Lobby (ein Team) */
  direkt: boolean;
}

export interface SitzungsOptionen {
  art: FensterArt;
  /** Kennung des Fensters (Teilnehmer: aus der Adresse, damit Neuladen ins Team zurückführt) */
  client?: string;
  name?: string;
  /** Direktaufruf ohne Lobby: Rolle des Fensters (zb, sl oder plenum) */
  direkt?: { rolle: Rolle };
  /** Tests: Takt des Hosts und der Statusmeldung (Standard 250 ms und 5 s) */
  takt?: { hostMs?: number; statusMs?: number; uploadMs?: number };
  /** Tests: Speicher für die Ablage des Spiels (Standard localStorage) */
  speicher?: Storage;
}

/** Teams mit Anwesenheit zusammenführen (reine Funktion, auch für Tests). */
export function teamStaende(teams: Record<string, TeamDaten>, teilnehmer: Teilnehmer[]): TeamStand[] {
  const online = new Map(teilnehmer.map((t) => [t.client, t]));
  return Object.entries(teams)
    .filter(([, d]) => d && typeof d.name === "string")
    .map(([id, d]) => {
      const spieler = Object.entries(d.spieler ?? {})
        .map(([client, s]) => {
          const anw = online.get(client);
          return { client, name: s.name, rollen: rollenAus(s.rollen), online: !!anw, seit: s.seit ?? 0, ...(anw?.fenster ? { fenster: anw.fenster } : {}) };
        })
        .filter((s) => s.rollen.length > 0)
        .sort((a, b) => a.seit - b.seit || a.client.localeCompare(b.client));
      const rechner = spieler[0]?.client ?? null;
      return { id, name: d.name, farbe: d.farbe, erstellt: d.erstellt ?? 0, lauf: d.lauf ?? null, spieler, rechner, rechnerOnline: !!spieler[0]?.online };
    })
    .sort((a, b) => a.erstellt - b.erstellt || a.id.localeCompare(b.id));
}

export class Sitzung {
  readonly client: string;
  readonly hinweise = new Hinweisgeber();
  private s: SitzungsStand;
  private hoerer = new Set<() => void>();
  private abos: Abmelden[] = [];
  private timer: ReturnType<typeof setInterval>[] = [];
  private spiele = new Map<string, Spiel>();
  private spielAbos = new Map<string, Abmelden>();
  private rohTeams: Record<string, TeamDaten> = {};
  private bewirbt = false;
  private direktErledigt = false;
  private gestartet = false;
  private ablage: SpeicherAblage | undefined;

  constructor(
    readonly inh: Inhalte,
    readonly adapter: SyncAdapter,
    private readonly opt: SitzungsOptionen,
  ) {
    this.client = opt.client ?? zufall(6);
    const rolleName = opt.direkt ? ROLLEN_NAME[opt.direkt.rolle] : opt.art === "sl" ? ROLLEN_NAME.sl : opt.art === "plenum" ? ROLLEN_NAME.plenum : "";
    this.s = {
      sitzung: adapter.sitzung,
      code: codeAnzeige(adapter.sitzung),
      art: opt.art,
      client: this.client,
      name: (opt.name?.trim() || rolleName).slice(0, SPIELERNAME_MAX),
      verbindung: { verbunden: false, art: adapter.art },
      info: null,
      infoGeladen: false,
      teamsGeladen: false,
      teams: [],
      teilnehmer: [],
      host: null,
      istHost: false,
      ich: { team: null, rollen: [], rechnet: false },
      status: {},
      regelFehler: false,
      direkt: !!opt.direkt,
    };
    // Ablage des eigenen Spiels nur im Team-Fenster mit Netz (lokal liegt das Protokoll ohnehin auf diesem Rechner)
    if (opt.art === "tt" && adapter.art === "firebase") {
      try {
        this.ablage = new SpeicherAblage(adapter.sitzung, opt.speicher ?? globalThis.localStorage);
      } catch {
        this.ablage = undefined;
      }
    }
  }

  get stand(): SitzungsStand {
    return this.s;
  }

  abonnieren(cb: () => void): Abmelden {
    this.hoerer.add(cb);
    return () => this.hoerer.delete(cb);
  }

  private aendern(teil: Partial<SitzungsStand>): void {
    this.s = { ...this.s, ...teil };
    this.hoerer.forEach((cb) => cb());
  }

  hinweis(art: "info" | "warnung" | "fehler", text: string): void {
    this.hinweise.hinweis(art, text);
  }

  /** Absender für Aktionen dieses Fensters in einer Rolle. */
  absender(rolle: Rolle): Absender {
    return { rolle, client: this.client, name: this.s.name || ROLLEN_NAME[rolle] };
  }

  async starten(): Promise<void> {
    await this.adapter.verbinden();
    this.gestartet = true;
    this.abos.push(this.adapter.aufVerbindung((v) => this.verbindungGeaendert(v)));
    this.meldeAnwesenheit();
    // seit Liste J (J2.4): Fenstergröße neu melden, wenn das Fenster größer oder kleiner gezogen wird
    if (typeof window !== "undefined") {
      window.addEventListener("resize", this.fensterGeaendert);
      this.abos.push(() => {
        window.removeEventListener("resize", this.fensterGeaendert);
        if (this.fensterTimer) clearTimeout(this.fensterTimer);
      });
    }
    this.abos.push(this.adapter.aufAnwesenheit((liste) => {
      this.aendern({ teilnehmer: liste });
      this.teamsNeu();
    }));
    this.abos.push(this.adapter.aufInfo((info) => {
      this.aendern({ info, infoGeladen: true });
      void this.direktPruefen();
    }));
    this.abos.push(this.adapter.aufTeams((t) => {
      this.rohTeams = t ?? {};
      this.aendern({ teamsGeladen: true });
      this.teamsNeu();
    }));
    this.abos.push(this.adapter.aufHost((h) => this.hostGeaendert(h)));
    if (this.s.art !== "tt") this.abos.push(this.adapter.aufStatus((st) => this.aendern({ status: st ?? {} })));
    if (this.s.art === "sl") this.timer.push(setInterval(() => this.hostPruefen(), PULS_INTERVALL_MS));
    if (this.opt.direkt && this.s.art === "tt") void this.direktBeitreten();
  }

  stoppen(): void {
    this.spiele.forEach((sp) => sp.stoppen());
    this.spiele.clear();
    this.spielAbos.forEach((ab) => ab());
    this.spielAbos.clear();
    this.abos.forEach((a) => a());
    this.abos = [];
    this.timer.forEach(clearInterval);
    this.timer = [];
    if (this.gestartet) this.adapter.trennen();
    this.gestartet = false;
  }

  private verbindungGeaendert(v: Verbindung): void {
    const regel = !!v.fehler && regelFehler(v.fehler);
    this.aendern({ verbindung: v, ...(regel ? { regelFehler: true } : {}) });
  }

  private meldeAnwesenheit(): void {
    const f = fensterJetzt();
    this.gemeldetesFenster = f.breite && f.hoehe ? fensterKennung(f) : "";
    this.adapter.meldeAnwesenheit({
      client: this.client, art: this.s.art, name: this.s.name, version: __ARGUS_VERSION__,
      ...(this.s.ich.team ? { team: this.s.ich.team } : {}),
      ...(this.gemeldetesFenster ? { fenster: this.gemeldetesFenster } : {}),
    });
  }

  /** zuletzt gemeldete Fenstergröße; ändert sie sich (1 s Ruhe nach dem Ziehen), meldet das Fenster sich neu (J2.4) */
  private gemeldetesFenster = "";
  private fensterTimer: ReturnType<typeof setTimeout> | null = null;
  private fensterGeaendert = (): void => {
    if (this.fensterTimer) clearTimeout(this.fensterTimer);
    this.fensterTimer = setTimeout(() => {
      this.fensterTimer = null;
      if (this.gestartet && fensterKennung(fensterJetzt()) !== this.gemeldetesFenster) this.meldeAnwesenheit();
    }, 1000);
  };

  // ---------------------------------------------------------------- Teams und Spiele

  team(id: string | null | undefined): TeamStand | undefined {
    return id ? this.s.teams.find((t) => t.id === id) : undefined;
  }

  /** Spielstand eines Teams in diesem Fenster (Team-Fenster: nur das eigene Team). */
  spiel(team: string | null | undefined): Spiel | null {
    return team ? this.spiele.get(team) ?? null : null;
  }

  /** Teams neu zusammenstellen (nach Änderung der Teams oder der Anwesenheit). */
  private teamsNeu(): void {
    const teams = teamStaende(this.rohTeams, this.s.teilnehmer);
    const eigen = teams.find((t) => t.spieler.some((x) => x.client === this.client));
    const meinEintrag = eigen?.spieler.find((x) => x.client === this.client);
    // Das früheste Fenster des Teams rechnet – auch ohne Netz (H1.3). Kein anderes übernimmt von selbst: Ein Laptop ohne Netz
    // spielt weiter, ein zweites Fenster würde sonst einen zweiten Spielstand anfangen. Übernehmen nur von Hand (uebernehmenTeam).
    const ich = { team: eigen?.id ?? null, rollen: meinEintrag?.rollen ?? [], rechnet: !!eigen && eigen.spieler[0]?.client === this.client };
    const teamWechsel = ich.team !== this.s.ich.team;
    if (meinEintrag && this.s.art === "tt" && meinEintrag.name !== this.s.name && !this.opt.direkt) {
      // Name aus dem Team übernehmen (z. B. nach Neuladen)
      this.s = { ...this.s, name: meinEintrag.name };
    }
    this.aendern({ teams, ich });
    if (teamWechsel) this.meldeAnwesenheit();
    this.spieleAbgleichen();
    void this.direktPruefen();
    if (this.s.istHost) void this.farbenPruefen();
  }

  /** Welche Teams dieses Fenster als Spiel braucht: Spielleitung und Plenum alle (folgen), Team-Fenster das eigene. */
  private spieleAbgleichen(): void {
    const noetig = new Set(this.s.art === "tt" ? (this.s.ich.team ? [this.s.ich.team] : []) : this.s.teams.map((t) => t.id));
    for (const [id, sp] of this.spiele) {
      if (noetig.has(id)) continue;
      sp.stoppen();
      this.spiele.delete(id);
      this.spielAbos.get(id)?.();
      this.spielAbos.delete(id);
    }
    for (const id of noetig) {
      let sp = this.spiele.get(id);
      if (!sp) {
        sp = new Spiel(this.inh, teamKanal(this.adapter, id), {
          hinweise: this.hinweise,
          hostAbsender: () => this.absender(this.s.art === "tt" ? "zb" : "sl"),
          client: this.client,
          ablage: this.s.art === "tt" ? this.ablage : undefined,
          taktMs: this.opt.takt?.hostMs,
          statusMs: this.opt.takt?.statusMs,
          upload: this.opt.takt?.uploadMs !== undefined ? { warteMs: this.opt.takt.uploadMs } : undefined,
        });
        this.spiele.set(id, sp);
        this.spielAbos.set(id, sp.abonnieren(() => {
          if (sp!.stand.upload.regeln && !this.s.regelFehler) this.aendern({ regelFehler: true });
          this.hoerer.forEach((cb) => cb());
        }));
      }
      // Team-Fenster: das früheste anwesende Fenster des Teams rechnet das Spiel
      sp.setzeHost(this.s.art === "tt" && this.s.ich.team === id && this.s.ich.rechnet);
      sp.folgeLauf(this.team(id)?.lauf ?? null);
    }
  }

  // ---------------------------------------------------------------- Lobby (Team-Fenster)

  /** Eintrag dieses Fensters im Team. `seit` nur beim Beitritt neu, sonst bleibt der alte Wert. */
  private eintrag(neu = true, seit?: number): SpielerEintrag {
    const alt = this.team(this.s.ich.team)?.spieler.find((x) => x.client === this.client)?.seit;
    return { name: this.s.name || "Team", rollen: rollenText(["zb"]), seit: seit ?? (neu || !alt ? Math.round(this.adapter.serverJetzt()) : alt) };
  }

  /** Teams, in denen dieses Fenster eingetragen ist (normalerweise höchstens eines). */
  private meineTeams(client = this.client): string[] {
    return Object.entries(this.rohTeams).filter(([, d]) => d?.spieler?.[client]).map(([id]) => id);
  }

  /** Name ändern (Lobby). Steht man schon in einem Team, wird der Eintrag dort nachgezogen. */
  async setzeName(name: string): Promise<void> {
    const n = name.replace(/\s+/g, " ").trim().slice(0, SPIELERNAME_MAX);
    this.aendern({ name: n });
    this.meldeAnwesenheit();
    const { team } = this.s.ich;
    if (team) await this.schreibe(() => this.adapter.setzeSpieler(team, this.client, this.eintrag(false)));
  }

  /** Neues Team anlegen und beitreten (dieser Laptop wird der Team-Laptop). Gibt die Team-Kennung zurück. */
  async teamErstellen(name: string): Promise<string | null> {
    const n = teamnameBereinigt(name);
    if (!n) {
      this.hinweis("warnung", "Bitte einen Teamnamen eingeben (oder würfeln).");
      return null;
    }
    if (this.s.teams.some((t) => t.name.toLowerCase() === n.toLowerCase())) {
      this.hinweis("warnung", `Den Teamnamen „${n}“ gibt es schon.`);
      return null;
    }
    const id = neueTeamId();
    const farbe = freieFarbe(this.s.teams.map((t) => t.farbe));
    const alt = this.meineTeams();
    const ok = await this.schreibe(async () => {
      await this.adapter.setzeTeam(id, { name: n, farbe, erstellt: Math.round(this.adapter.serverJetzt()) }, { client: this.client, eintrag: this.eintrag() });
      if (alt.length) await this.adapter.setzeSpieler(null, this.client, null, alt);
    });
    return ok ? id : null;
  }

  /**
   * Einem Team beitreten. Hat das Team schon einen Laptop, sieht dieses Fenster nur zu (und kann übernehmen, wenn der Team-Laptop weg
   * ist); sonst rechnet es das Spiel des Teams.
   */
  async teamBeitreten(team: string): Promise<boolean> {
    const t = this.team(team);
    if (!t) return false;
    if (this.s.ich.team === team) return true;
    return this.schreibe(() => this.adapter.setzeSpieler(team, this.client, this.eintrag(), this.meineTeams()));
  }

  /** Das Spiel des eigenen Teams an diesem Fenster weiterführen (der bisherige Team-Laptop ist weg). */
  async uebernehmenTeam(): Promise<boolean> {
    const t = this.team(this.s.ich.team);
    if (!t) return false;
    const frueheste = Math.min(...t.spieler.filter((x) => x.client !== this.client).map((x) => x.seit), Math.round(this.adapter.serverJetzt()));
    return this.schreibe(() => this.adapter.setzeSpieler(t.id, this.client, this.eintrag(false, Math.max(0, frueheste - 1))));
  }

  async teamVerlassen(): Promise<boolean> {
    const alt = this.meineTeams();
    if (!alt.length) return true;
    return this.schreibe(() => this.adapter.setzeSpieler(null, this.client, null, alt));
  }

  // ---------------------------------------------------------------- Spielleitung: Teams verwalten

  async teamUmbenennen(team: string, name: string): Promise<boolean> {
    const n = teamnameBereinigt(name);
    if (!n) return false;
    return this.schreibe(() => this.adapter.aendereTeam(team, { name: n }));
  }

  async teamLoeschen(team: string): Promise<boolean> {
    return this.schreibe(() => this.adapter.loescheTeam(team));
  }

  /** Spielleitung: ein Fenster in ein Team setzen, verschieben oder herausnehmen (team = null). */
  async spielerSetzen(client: string, team: string | null): Promise<boolean> {
    const bisher = this.s.teams.flatMap((t) => t.spieler).find((x) => x.client === client);
    const name = bisher?.name ?? this.s.teilnehmer.find((x) => x.client === client)?.name ?? "Team";
    const alt = this.meineTeams(client);
    if (!team) return this.schreibe(() => this.adapter.setzeSpieler(null, client, null, alt));
    return this.schreibe(() => this.adapter.setzeSpieler(team, client, { name: name || "Team", rollen: rollenText(["zb"]), seit: Math.round(this.adapter.serverJetzt()) }, alt));
  }

  /** Steuernde Spielleitung: Spiel für diese Teams öffnen (Lauf anlegen; Ansicht und Einweisung erscheinen am Team-Laptop). */
  async spielOeffnen(teams: string[]): Promise<boolean> {
    if (!this.s.istHost && !(this.opt.direkt && this.s.art === "tt")) {
      this.hinweis("warnung", "Nur die steuernde Spielleitung kann Spiele öffnen.");
      return false;
    }
    return this.schreibe(async () => {
      await Promise.all(teams.map((t) => this.adapter.aendereTeam(t, { lauf: neueLaufId() })));
    });
  }

  /** Steuernde Spielleitung: neuen Lauf für ein Team beginnen. Der alte Lauf bleibt gespeichert. */
  async neuesSpiel(team: string): Promise<boolean> {
    return this.spielOeffnen([team]);
  }

  /** Spielleitung: dieselbe Aktion an mehrere Teams (z. B. Start für alle) – geht über das Netz an die Team-Laptops. */
  sendenAn<T extends AktionsTyp>(teams: string[], typ: T, daten: AktionsDaten[T]): string[] {
    const ids: string[] = [];
    for (const t of teams) {
      const sp = this.spiele.get(t);
      if (!sp?.stand.lauf) continue;
      const id = sp.senden(typ, daten, this.absender(this.s.art === "tt" ? "zb" : "sl"));
      if (id) ids.push(id);
    }
    return ids;
  }

  /** Spielleitung (H1.3): Protokoll eines Teams aus einer Datei laden (wenn der Upload nicht ging). */
  async protokollLaden(text: string): Promise<{ ok: boolean; text: string }> {
    let d;
    try {
      d = leseProtokollDatei(text);
    } catch (e) {
      return { ok: false, text: (e as Error).message };
    }
    const t = (d.team_id && this.team(d.team_id)) || this.s.teams.find((x) => x.name === d.team) || this.s.teams.find((x) => x.lauf === d.lauf);
    if (!t) return { ok: false, text: `Team „${d.team}“ gibt es in dieser Sitzung nicht.` };
    const sp = this.spiele.get(t.id);
    if (!sp) return { ok: false, text: `Team „${t.name}“ hat noch kein Spiel.` };
    if (d.lauf && t.lauf && d.lauf !== t.lauf) return { ok: false, text: `Die Datei gehört zu einem anderen Lauf von „${t.name}“ (${d.lauf}).` };
    const erg = await sp.ausDatei(d.protokoll, d.lauf);
    return { ...erg, text: `${t.name}: ${erg.text}` };
  }

  private async schreibe(f: () => Promise<void>): Promise<boolean> {
    try {
      await f();
      return true;
    } catch (e) {
      if (regelFehler(e)) this.aendern({ regelFehler: true });
      this.hinweis("fehler", `Nicht gespeichert: ${(e as Error).message}`);
      return false;
    }
  }

  // ---------------------------------------------------------------- Steuerung (nur Spielleitung)

  private hostGeaendert(h: HostInfo | null): void {
    const warIch = this.s.istHost;
    const binIch = !!h && h.id === this.client;
    this.aendern({ host: h });
    if (warIch && !binIch) {
      this.aendern({ istHost: false });
      this.hinweis("warnung", h ? `Steuerung liegt jetzt bei „${h.name}“.` : "Steuerung freigegeben.");
    }
    if (this.s.art === "sl" && !binIch && (!h || istVeraltet(h.puls, this.adapter.serverJetzt()))) void this.bewerben(false);
  }

  private hostPruefen(): void {
    const h = this.s.host;
    if (!this.s.istHost && (!h || istVeraltet(h.puls, this.adapter.serverJetzt()))) void this.bewerben(false);
  }

  private async bewerben(erzwingen: boolean): Promise<void> {
    if (this.s.art !== "sl" || this.s.istHost || this.bewirbt) return;
    this.bewirbt = true;
    try {
      const ok = await this.adapter.beanspruche({ id: this.client, name: this.s.name }, erzwingen);
      if (!ok || this.s.istHost) return;
      this.aendern({ istHost: true });
      void this.direktPruefen();
      void this.farbenPruefen();
    } catch (e) {
      if (regelFehler(e)) this.aendern({ regelFehler: true });
      this.hinweis("fehler", `Steuerung nicht möglich: ${(e as Error).message}`);
    } finally {
      this.bewirbt = false;
    }
  }

  /** Spielleitung: Steuerung von einem anderen Fenster übernehmen. */
  async uebernehmen(): Promise<void> {
    await this.bewerben(true);
  }

  /** Teams mit gleicher Farbe (gleichzeitig angelegt): das spätere bekommt eine freie Farbe. */
  private async farbenPruefen(): Promise<void> {
    const gesehen = new Set<string>();
    for (const t of this.s.teams) {
      if (!gesehen.has(t.farbe)) {
        gesehen.add(t.farbe);
        continue;
      }
      const neu = freieFarbe([...gesehen, ...this.s.teams.map((x) => x.farbe)]);
      gesehen.add(neu);
      await this.schreibe(() => this.adapter.aendereTeam(t.id, { farbe: neu }));
    }
  }

  // ---------------------------------------------------------------- Direktaufruf ohne Lobby

  private async direktBeitreten(): Promise<void> {
    if (this.opt.direkt?.rolle !== "zb") return;
    await this.schreibe(() => this.adapter.setzeTeam(DIREKT_TEAM, this.direktKopf(), { client: this.client, eintrag: this.eintrag() }));
  }

  private direktKopf() {
    return { name: "Team 1", farbe: freieFarbe([]), erstellt: 0 };
  }

  /**
   * Direktaufruf: Sitzung, Team und Lauf anlegen, wenn sie fehlen – die steuernde Spielleitung, sonst das Team-Fenster selbst
   * (dann ohne Spielleitung: Test allein an einem Rechner).
   */
  private async direktPruefen(): Promise<void> {
    if (!this.opt.direkt || this.direktErledigt || !this.s.infoGeladen || !this.s.teamsGeladen) return;
    const zb = this.s.art === "tt" && this.opt.direkt.rolle === "zb";
    if (!(this.s.art === "sl" && this.s.istHost) && !zb) return;
    this.direktErledigt = true;
    const sz = this.inh.szenario;
    if (!this.s.info) {
      await this.adapter.legeAn({
        code: this.s.code, szenario: sz.id, version: sz.version, titel: sz.titel,
        erstellt: Math.round(this.adapter.serverJetzt()), von: this.s.name,
      }).catch(() => false);
    }
    if (!this.rohTeams[DIREKT_TEAM]) await this.schreibe(() => this.adapter.setzeTeam(DIREKT_TEAM, this.direktKopf()));
    if (!this.rohTeams[DIREKT_TEAM]?.lauf) {
      await this.schreibe(() => this.adapter.aendereTeam(DIREKT_TEAM, { lauf: neueLaufId() }));
    }
  }

  /** Neue Sitzung anlegen (Startseite der Spielleitung). Gibt den Pfadschlüssel zurück oder null. */
  static async anlegen(inh: Inhalte, adapterFuer: (sitzung: string) => SyncAdapter, name: string, codeFabrik: () => string): Promise<string | null> {
    const sz = inh.szenario;
    for (let versuch = 0; versuch < 8; versuch++) {
      const code = codeFabrik();
      const a = adapterFuer(code.toLowerCase());
      await a.verbinden();
      try {
        const ok = await a.legeAn({ code, szenario: sz.id, version: sz.version, titel: sz.titel, erstellt: Math.round(a.serverJetzt()), von: name });
        if (ok) return a.sitzung;
      } finally {
        a.trennen();
      }
    }
    return null;
  }
}
