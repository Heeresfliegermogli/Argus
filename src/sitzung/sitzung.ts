// Sitzung: verbindet ein Browserfenster mit einer Sitzung (Code). Ein Adapter je Fenster.
//
//  • Lobby: Teams und Spieler (wer sitzt in welchem Team mit welcher Rolle), Anwesenheit.
//  • Teilnehmer-Fenster: bilden Teams, wählen Rollen (auch zwei oder drei) und spielen dann im
//    Spielstand ihres Teams (ein Spiel).
//  • Spielleitung: sieht alle Teams (je Team ein Spiel), verwaltet sie und bewirbt sich um die
//    Steuerung. Das steuernde Fenster führt für jedes Team einen Host mit gemeinsamem Takt.
//    Fällt es aus, übernimmt eine zweite Spielleitung (von Hand oder nach 20 s ohne Puls).
//  • Plenum: sieht alle Teams, sendet nichts.
//
// Direktaufruf (…/?rolle=g1&raum=…): ein Team ohne Lobby wie bis Schritt 6. Die Spielleitung legt
// Sitzung, Team und Lauf dann selbst an, die Gruppenfenster treten dem Team mit ihrer Rolle bei.
import { Taktgeber } from "../engine/taktgeber";
import type { Inhalte } from "../inhalte/typen";
import { type Absender, type AktionsDaten, type AktionsTyp, type Rolle, neueLaufId, zufall } from "../kern/ereignisse";
import { ROLLEN_NAME } from "../kern/sichten";
import {
  DIREKT_TEAM, GRUPPEN_ROLLEN, type GruppenRolle, SPIELERNAME_MAX, codeAnzeige, freieFarbe, neueTeamId,
  rollenAus, rollenText, teamnameBereinigt,
} from "../kern/sitzungen";
import {
  type Abmelden, type FensterArt, type HostInfo, PULS_INTERVALL_MS, type SitzungsInfo, type SpielerEintrag, type SyncAdapter,
  type TeamDaten, type Teilnehmer, type Verbindung, istVeraltet, teamKanal,
} from "../sync/adapter";
import { Hinweisgeber } from "./hinweise";
import { Spiel } from "./spiel";

export interface SpielerStand {
  client: string;
  name: string;
  rollen: GruppenRolle[];
  online: boolean;
  /** Serverzeit der letzten Rollenwahl (entscheidet, wer bei gleichzeitigem Zugriff die Rolle behält) */
  seit: number;
}

export interface TeamStand {
  id: string;
  name: string;
  farbe: string;
  erstellt: number;
  lauf: string | null;
  spieler: SpielerStand[];
  /** Rollen ohne anwesenden Spieler (wer weg ist, gibt seine Rolle frei) */
  frei: GruppenRolle[];
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
  host: HostInfo | null;
  istHost: boolean;
  /** eigenes Team und eigene Rollen (Teilnehmer-Fenster) */
  ich: { team: string | null; rollen: GruppenRolle[] };
  /** Direktaufruf ohne Lobby (ein Team) */
  direkt: boolean;
}

export interface SitzungsOptionen {
  art: FensterArt;
  /** Kennung des Fensters (Teilnehmer: aus der Adresse, damit Neuladen in Team und Rolle zurückführt) */
  client?: string;
  name?: string;
  /** Direktaufruf ohne Lobby: Rolle des Fensters (bei Teilnehmern g1–g3) */
  direkt?: { rolle: Rolle };
}

/** Teams mit Anwesenheit zusammenführen (reine Funktion, auch für Tests). */
export function teamStaende(teams: Record<string, TeamDaten>, teilnehmer: Teilnehmer[]): TeamStand[] {
  const online = new Set(teilnehmer.map((t) => t.client));
  return Object.entries(teams)
    .filter(([, d]) => d && typeof d.name === "string")
    .map(([id, d]) => {
      const spieler = Object.entries(d.spieler ?? {})
        .map(([client, s]) => ({ client, name: s.name, rollen: rollenAus(s.rollen), online: online.has(client), seit: s.seit ?? 0 }))
        .filter((s) => s.rollen.length > 0)
        .sort((a, b) => GRUPPEN_ROLLEN.indexOf(a.rollen[0]) - GRUPPEN_ROLLEN.indexOf(b.rollen[0]) || a.name.localeCompare(b.name));
      const frei = GRUPPEN_ROLLEN.filter((r) => !spieler.some((s) => s.online && s.rollen.includes(r)));
      return { id, name: d.name, farbe: d.farbe, erstellt: d.erstellt ?? 0, lauf: d.lauf ?? null, spieler, frei };
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
  private readonly taktgeber = new Taktgeber();
  private bewirbt = false;
  private konflikt = false;
  private direktErledigt = false;
  private gestartet = false;

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
      ich: { team: null, rollen: [] },
      direkt: !!opt.direkt,
    };
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
    this.abos.push(this.adapter.aufVerbindung((v) => this.aendern({ verbindung: v })));
    this.meldeAnwesenheit();
    this.abos.push(this.adapter.aufAnwesenheit((liste) => {
      this.aendern({ teilnehmer: liste, teams: teamStaende(this.rohTeams, liste) });
    }));
    this.abos.push(this.adapter.aufInfo((info) => {
      this.aendern({ info, infoGeladen: true });
      void this.direktPruefen();
    }));
    this.abos.push(this.adapter.aufTeams((t) => this.teamsGeaendert(t)));
    this.abos.push(this.adapter.aufHost((h) => this.hostGeaendert(h)));
    if (this.s.art === "sl") this.timer.push(setInterval(() => this.hostPruefen(), PULS_INTERVALL_MS));
    if (this.opt.direkt && this.s.art === "tt") void this.direktBeitreten();
  }

  stoppen(): void {
    this.taktgeber.stoppen();
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

  private meldeAnwesenheit(): void {
    this.adapter.meldeAnwesenheit({
      client: this.client, art: this.s.art, name: this.s.name, version: __ARGUS_VERSION__,
      ...(this.s.ich.team ? { team: this.s.ich.team } : {}),
    });
  }

  // ---------------------------------------------------------------- Teams und Spiele

  team(id: string | null | undefined): TeamStand | undefined {
    return id ? this.s.teams.find((t) => t.id === id) : undefined;
  }

  /** Spielstand eines Teams in diesem Fenster (Teilnehmer: nur das eigene Team). */
  spiel(team: string | null | undefined): Spiel | null {
    return team ? this.spiele.get(team) ?? null : null;
  }

  private teamsGeaendert(roh: Record<string, TeamDaten>): void {
    this.rohTeams = roh ?? {};
    const teams = teamStaende(this.rohTeams, this.s.teilnehmer);
    const eigen = teams.find((t) => t.spieler.some((x) => x.client === this.client));
    const meinEintrag = eigen?.spieler.find((x) => x.client === this.client);
    const ich = { team: eigen?.id ?? null, rollen: meinEintrag?.rollen ?? [] };
    const teamWechsel = ich.team !== this.s.ich.team;
    if (meinEintrag && this.s.art === "tt" && meinEintrag.name !== this.s.name && !this.opt.direkt) {
      // Name aus dem Team übernehmen (z. B. nach Neuladen)
      this.s = { ...this.s, name: meinEintrag.name };
    }
    this.aendern({ teams, teamsGeladen: true, ich });
    if (teamWechsel) this.meldeAnwesenheit();
    void this.rollenKonfliktPruefen();
    this.spieleAbgleichen();
    void this.direktPruefen();
    if (this.s.istHost) void this.farbenPruefen();
  }

  /** Welche Teams dieses Fenster als Spiel braucht: Spielleitung und Plenum alle, Teilnehmer das eigene. */
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
          hostAbsender: () => this.absender("sl"),
          taktgeber: this.taktgeber,
          beiHostFehler: (team, e) => this.hostFehler(team, e),
        });
        this.spiele.set(id, sp);
        this.spielAbos.set(id, sp.abonnieren(() => this.hoerer.forEach((cb) => cb())));
        if (this.s.istHost) sp.setzeHost(true);
      }
      sp.folgeLauf(this.team(id)?.lauf ?? null);
    }
  }

  // ---------------------------------------------------------------- Lobby (Teilnehmer)

  /** Eintrag dieses Fensters im Team. `seit` nur bei neuer Rollenwahl neu, sonst bleibt der alte Wert. */
  private eintrag(rollen: GruppenRolle[], neueWahl = true): SpielerEintrag {
    const alt = this.team(this.s.ich.team)?.spieler.find((x) => x.client === this.client)?.seit;
    const seit = neueWahl || !alt ? Math.round(this.adapter.serverJetzt()) : alt;
    return { name: this.s.name || ROLLEN_NAME[rollen[0]], rollen: rollenText(rollen), seit };
  }

  /**
   * Haben zwei Fenster gleichzeitig dieselbe Rolle genommen, behält sie das frühere (seit, bei
   * Gleichstand die kleinere Kennung). Das spätere gibt sie hier von selbst ab – jedes Fenster
   * entscheidet nach denselben Daten, also bleibt genau eines.
   */
  private async rollenKonfliktPruefen(): Promise<void> {
    if (this.s.art !== "tt" || this.opt.direkt || this.konflikt) return;
    const t = this.team(this.s.ich.team);
    const ich = t?.spieler.find((x) => x.client === this.client);
    if (!t || !ich) return;
    const frueher = (x: SpielerStand) => x.seit < ich.seit || (x.seit === ich.seit && x.client < ich.client);
    const verloren = ich.rollen.filter((r) => t.spieler.some((x) => x.client !== this.client && x.online && x.rollen.includes(r) && frueher(x)));
    if (!verloren.length) return;
    this.konflikt = true;
    try {
      const rest = ich.rollen.filter((r) => !verloren.includes(r));
      const wer = t.spieler.find((x) => x.client !== this.client && x.online && x.rollen.includes(verloren[0]))?.name ?? "jemand";
      await this.schreibe(() => this.adapter.setzeSpieler(t.id, this.client, rest.length ? this.eintrag(rest, false) : null));
      this.hinweis("warnung", `${verloren.map((r) => ROLLEN_NAME[r]).join(" und ")} in Team ${t.name} hat ${wer} schon genommen – bitte eine andere Rolle wählen.`);
    } finally {
      this.konflikt = false;
    }
  }

  /** Nimmt diesen Fenstern die Rollen in einem Team weg (Übernahme einer verwaisten Rolle, Verschieben durch die SL). */
  private async rollenWegnehmen(team: string, rollen: GruppenRolle[], ausser: string, nurAbwesende: boolean): Promise<void> {
    const t = this.team(team);
    if (!t) return;
    for (const x of t.spieler) {
      if (x.client === ausser || (nurAbwesende && x.online) || !x.rollen.some((r) => rollen.includes(r))) continue;
      const rest = x.rollen.filter((r) => !rollen.includes(r));
      await this.adapter.setzeSpieler(team, x.client, rest.length ? { name: x.name, rollen: rollenText(rest), seit: x.seit } : null);
    }
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
    const { team, rollen } = this.s.ich;
    if (team && rollen.length) await this.schreibe(() => this.adapter.setzeSpieler(team, this.client, this.eintrag(rollen, false)));
  }

  /** Neues Team anlegen und mit einer Rolle beitreten. Gibt die Team-Kennung zurück. */
  async teamErstellen(name: string, rolle: GruppenRolle): Promise<string | null> {
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
      await this.adapter.setzeTeam(id, { name: n, farbe, erstellt: Math.round(this.adapter.serverJetzt()) }, { client: this.client, eintrag: this.eintrag([rolle]) });
      if (alt.length) await this.adapter.setzeSpieler(null, this.client, null, alt);
    });
    return ok ? id : null;
  }

  /**
   * Freie Rolle in einem Team übernehmen. Im eigenen Team kommt sie dazu (Doppelrolle), in einem
   * anderen Team wechselt man dorthin.
   */
  async rolleWaehlen(team: string, rolle: GruppenRolle): Promise<boolean> {
    const t = this.team(team);
    if (!t) return false;
    const besetzt = t.spieler.find((x) => x.online && x.client !== this.client && x.rollen.includes(rolle));
    if (besetzt) {
      this.hinweis("warnung", `${ROLLEN_NAME[rolle]} in Team ${t.name} hat schon ${besetzt.name}.`);
      return false;
    }
    const eigen = this.s.ich.team === team;
    const rollen = eigen ? [...new Set([...this.s.ich.rollen, rolle])] : [rolle];
    // Wer die Rolle hatte und nicht mehr verbunden ist, gibt sie ab (sonst stünde sie doppelt im Team).
    return this.schreibe(async () => {
      await this.rollenWegnehmen(team, [rolle], this.client, true);
      await this.adapter.setzeSpieler(team, this.client, this.eintrag(rollen), this.meineTeams());
    });
  }

  /** Eigene Rolle abgeben; war es die letzte, verlässt man das Team. */
  async rolleAbgeben(rolle: GruppenRolle): Promise<boolean> {
    const { team, rollen } = this.s.ich;
    if (!team) return false;
    const rest = rollen.filter((r) => r !== rolle);
    return this.schreibe(() => this.adapter.setzeSpieler(team, this.client, rest.length ? this.eintrag(rest, false) : null));
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

  /**
   * Spielleitung: einen Spieler in ein Team setzen, verschieben oder herausnehmen (team = null).
   * Geht auch mit Teilnehmern, die noch in keinem Team sind (Name aus der Anwesenheit). Wer die
   * Zielrolle bisher hatte, gibt sie ab – die Spielleitung entscheidet.
   */
  async spielerSetzen(client: string, team: string | null, rollen: GruppenRolle[]): Promise<boolean> {
    const bisher = this.s.teams.flatMap((t) => t.spieler).find((x) => x.client === client);
    const name = bisher?.name ?? this.s.teilnehmer.find((x) => x.client === client)?.name ?? "Teilnehmer";
    const alt = this.meineTeams(client);
    if (!team || !rollen.length) return this.schreibe(() => this.adapter.setzeSpieler(null, client, null, alt));
    return this.schreibe(async () => {
      await this.rollenWegnehmen(team, rollen, client, false);
      await this.adapter.setzeSpieler(team, client, { name: name || ROLLEN_NAME[rollen[0]], rollen: rollenText(rollen), seit: Math.round(this.adapter.serverJetzt()) }, alt);
    });
  }

  /** Steuernde Spielleitung: Spiel für diese Teams öffnen (Lauf anlegen; Ansichten und Einweisung erscheinen). */
  async spielOeffnen(teams: string[]): Promise<boolean> {
    if (!this.s.istHost) {
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

  /** Spielleitung: dieselbe Aktion an mehrere Teams (z. B. Uhr starten für alle). */
  sendenAn<T extends AktionsTyp>(teams: string[], typ: T, daten: AktionsDaten[T]): string[] {
    const ids: string[] = [];
    for (const t of teams) {
      const sp = this.spiele.get(t);
      if (!sp?.stand.lauf) continue;
      const id = sp.senden(typ, daten, this.absender("sl"));
      if (id) ids.push(id);
    }
    return ids;
  }

  private async schreibe(f: () => Promise<void>): Promise<boolean> {
    try {
      await f();
      return true;
    } catch (e) {
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
      this.hostAbgeben();
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
      this.spiele.forEach((sp) => sp.setzeHost(true));
      void this.direktPruefen();
      void this.farbenPruefen();
    } catch (e) {
      this.hinweis("fehler", `Steuerung nicht möglich: ${(e as Error).message}`);
    } finally {
      this.bewirbt = false;
    }
  }

  private hostAbgeben(): void {
    this.spiele.forEach((sp) => sp.setzeHost(false));
    this.aendern({ istHost: false });
  }

  private hostFehler(team: string, e: Error): void {
    if (!this.s.istHost) return;
    this.hostAbgeben();
    void this.adapter.gibFrei(this.client);
    this.hinweis("fehler", `Steuerung beendet (Team ${this.team(team)?.name ?? team}): ${e.message}`);
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
    const rolle = this.opt.direkt?.rolle;
    if (!rolle || (rolle !== "g1" && rolle !== "g2" && rolle !== "g3")) return;
    await this.schreibe(() => this.adapter.setzeTeam(DIREKT_TEAM, this.direktKopf(), { client: this.client, eintrag: this.eintrag([rolle]) }));
  }

  private direktKopf() {
    return { name: "Team 1", farbe: freieFarbe([]), erstellt: 0 };
  }

  /** Spielleitung im Direktaufruf: Sitzung, Team und Lauf anlegen, sobald sie steuert. */
  private async direktPruefen(): Promise<void> {
    if (!this.opt.direkt || this.s.art !== "sl" || !this.s.istHost || this.direktErledigt) return;
    if (!this.s.infoGeladen || !this.s.teamsGeladen) return;
    this.direktErledigt = true;
    const sz = this.inh.szenario;
    if (!this.s.info) {
      await this.adapter.legeAn({
        code: this.s.code, szenario: sz.id, version: sz.version, titel: sz.titel,
        erstellt: Math.round(this.adapter.serverJetzt()), von: this.s.name,
      }).catch(() => false);
    }
    if (!this.rohTeams[DIREKT_TEAM]) await this.schreibe(() => this.adapter.setzeTeam(DIREKT_TEAM, this.direktKopf()));
    if (!this.rohTeams[DIREKT_TEAM]?.lauf) await this.spielOeffnen([DIREKT_TEAM]);
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
