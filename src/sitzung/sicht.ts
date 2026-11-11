// Sicht: was eine Ansicht (Zielbearbeitung, Spielleitung, Plenum) bekommt – der Spielstand EINES Teams
// aus der Perspektive EINER Rolle. Die Ansichten kennen weder Sitzung noch Lobby noch Adapter-Details.
//   • Team-Laptop: Sicht „zb“ auf das eigene Spiel, das dieses Fenster selbst rechnet (seit 2.6).
//   • Spielleitung: Sicht „sl“ je Team; Zuschauen = Sicht „zb“ mit nurLesen (hochgeladenes Protokoll, mit Verzug).
//   • Aktionen gehen mit der Rolle dieser Sicht als Absender an den Host des Teams.
import type { Inhalte } from "../inhalte/typen";
import { weltFuer } from "../kern/lage";
import type { AktionsDaten, AktionsTyp, Ereignis, Rolle } from "../kern/ereignisse";
import type { GruppenRolle } from "../kern/sitzungen";
import type { Spielzustand } from "../kern/zustand";
import type { Abmelden, FensterArt, HostInfo, SyncAdapter, Verbindung } from "../sync/adapter";
import type { Hinweis } from "./hinweise";
import type { Sitzung } from "./sitzung";
import type { Spiel, UploadStand } from "./spiel";

export interface SichtTeilnehmer {
  client: string;
  art: FensterArt;
  name: string;
  /** Serverzeit des letzten Lebenszeichens */
  puls: number;
  /** Rollen im Team (Teilnehmer) */
  rollen: GruppenRolle[];
  /** seit Liste J: Fenstergröße „1536x730“ (Anwesenheit) */
  fenster?: string;
}

export interface SichtStand {
  rolle: Rolle;
  client: string;
  name: string;
  /** Code der Sitzung zur Anzeige */
  raum: string;
  team: string;
  teamName: string;
  teamFarbe: string;
  verbindung: Verbindung;
  lauf: string | null;
  geladen: boolean;
  zustand: Spielzustand;
  protokoll: Ereignis[];
  offen: Record<string, unknown>;
  /** Fenster dieses Teams, dazu Spielleitung und Plenum */
  teilnehmer: SichtTeilnehmer[];
  host: HostInfo | null;
  istHost: boolean;
  hinweise: Hinweis[];
  /** Zuschauen: nichts senden */
  nurLesen: boolean;
  /** dieses Fenster rechnet das Spiel des Teams (Team-Laptop) */
  rechnet: boolean;
  upload: UploadStand;
  /** Firebase-Regeln lehnen ab (Banner, H1.5) */
  regelFehler: boolean;
  /** Direktaufruf ohne Lobby (Test) */
  direkt: boolean;
  /** Name des Fensters, das das Spiel des Teams rechnet (Team-Fenster, das nur zusieht) */
  rechnerName: string | null;
  /** dieser Team-Laptop ist gerade verbunden */
  rechnerOnline: boolean;
  /** Liste K: Serverzeit, seit der der Team-Laptop nicht verbunden ist; ob dieses Fenster übernehmen darf (länger als 20 s weg) */
  rechnerWegSeit: number | null;
  uebernehmbar: boolean;
  /** K2.2: Dieses Fenster hat das Spiel gerechnet – jetzt führt es ein anderer Laptop weiter */
  abgeloest: boolean;
  /** K1.3: zweiter Tab desselben Browsers (sieht nur zu) */
  gast: boolean;
}

export class Sicht {
  private letzte: SichtStand | null = null;
  private schluessel = "";

  constructor(
    readonly sitzung: Sitzung,
    readonly spiel: Spiel,
    readonly rolle: Rolle,
    readonly opt: { nurLesen?: boolean } = {},
  ) {}

  /** Welt des Teams: Inhalte plus eingespielte Verstärkungen (gleiches Objekt, solange nichts dazukommt). */
  get inh(): Inhalte {
    return weltFuer(this.spiel.inh, this.spiel.stand.zustand);
  }

  /** Spielzeit, Tempo und ob die Uhr läuft – für die Bewegung auf der Karte (liest immer den neuesten Stand). */
  kartenUhr(): { t: number; tempo: number; laeuft: boolean } {
    const z = this.spiel.stand.zustand;
    const dauer = this.spiel.inh.szenario.spieluhr.dauer_s;
    return { t: Math.min(this.spiel.spielzeit(), dauer), tempo: z.uhr.tempo, laeuft: z.uhr.laeuft && !z.ende };
  }

  get adapter(): SyncAdapter {
    return this.sitzung.adapter;
  }

  get nurLesen(): boolean {
    return !!this.opt.nurLesen;
  }

  get stand(): SichtStand {
    const st = this.berechne();
    const k = this.vergleich(st);
    if (this.letzte && k === this.schluessel && this.letzte.zustand === st.zustand && this.letzte.offen === st.offen
      && this.letzte.hinweise === st.hinweise && this.letzte.host === st.host && this.letzte.upload === st.upload) return this.letzte;
    this.letzte = st;
    this.schluessel = k;
    return st;
  }

  private berechne(): SichtStand {
    const ss = this.sitzung.stand;
    const sp = this.spiel.stand;
    const team = this.sitzung.team(sp.team);
    const rollenVon = new Map(team?.spieler.map((x) => [x.client, x.rollen]) ?? []);
    const teilnehmer = ss.teilnehmer
      .filter((t) => t.art !== "tt" || rollenVon.has(t.client))
      .map((t) => ({ client: t.client, art: t.art, name: t.name, puls: t.puls, rollen: rollenVon.get(t.client) ?? [], ...(t.fenster ? { fenster: t.fenster } : {}) }));
    return {
      rolle: this.rolle,
      client: ss.client,
      name: ss.name,
      raum: ss.code,
      team: sp.team,
      teamName: team?.name ?? sp.team,
      teamFarbe: team?.farbe ?? "#9aa5b1",
      verbindung: ss.verbindung,
      lauf: sp.lauf,
      geladen: sp.geladen,
      zustand: sp.zustand,
      protokoll: sp.protokoll,
      offen: sp.offen,
      teilnehmer,
      host: ss.host,
      istHost: ss.istHost,
      hinweise: this.sitzung.hinweise.liste,
      nurLesen: this.nurLesen,
      rechnet: sp.rechnet,
      upload: sp.upload,
      regelFehler: ss.regelFehler,
      direkt: ss.direkt,
      rechnerName: team?.rechner ? team.spieler.find((x) => x.client === team.rechner)?.name ?? null : null,
      rechnerOnline: !!team?.rechnerOnline,
      rechnerWegSeit: team?.rechnerWegSeit ?? null,
      uebernehmbar: !!team?.uebernehmbar,
      abgeloest: ss.ich.abgeloest && ss.ich.team === sp.team,
      gast: ss.gast,
    };
  }

  /** Nur bei sichtbaren Änderungen neu zeichnen (Puls-Meldungen der Anwesenheit allein reichen nicht). */
  private vergleich(st: SichtStand): string {
    return [
      st.lauf, st.geladen ? 1 : 0, st.istHost ? 1 : 0, st.host?.id ?? "", st.verbindung.verbunden ? 1 : 0, st.verbindung.fehler ?? "",
      st.teamName, st.teamFarbe, st.name, st.teilnehmer.map((t) => `${t.client}${t.rollen.join("")}`).join(","),
      st.rechnet ? 1 : 0, st.regelFehler ? 1 : 0, st.rechnerName ?? "", st.rechnerOnline ? 1 : 0,
      st.rechnerOnline ? "" : Math.floor((this.sitzung.adapter.serverJetzt() - (st.rechnerWegSeit ?? 0)) / 1000), st.uebernehmbar ? 1 : 0, st.abgeloest ? 1 : 0, st.gast ? 1 : 0,
    ].join("|");
  }

  /** Abonniert Spiel, Sitzung und Hinweise; meldet nur, wenn sich der Stand dieser Sicht ändert. */
  abonnieren(cb: () => void): Abmelden {
    let alt = this.stand;
    const pruefen = () => {
      const neu = this.stand;
      if (neu !== alt) {
        alt = neu;
        cb();
      }
    };
    const ab = [this.spiel.abonnieren(pruefen), this.sitzung.abonnieren(pruefen), this.sitzung.hinweise.abonnieren(pruefen)];
    return () => ab.forEach((f) => f());
  }

  spielzeit(): number {
    return this.spiel.spielzeit();
  }

  hinweis(art: "info" | "warnung" | "fehler", text: string): void {
    this.sitzung.hinweis(art, text);
  }

  /** Schickt eine Aktion mit der Rolle dieser Sicht. Beim Zuschauen wird nichts gesendet. */
  senden<T extends AktionsTyp>(typ: T, daten: AktionsDaten[T]): string | null {
    if (this.nurLesen) {
      this.hinweis("warnung", "Zuschauen – hier wird nichts gesendet.");
      return null;
    }
    return this.spiel.senden(typ, daten, this.sitzung.absender(this.rolle));
  }

  wartetAuf(typ: AktionsTyp, bezug?: string): boolean {
    return this.spiel.wartetAuf(typ, bezug);
  }

  /** Spielleitung: Steuerung übernehmen (für alle Teams der Sitzung). */
  async uebernehmen(): Promise<void> {
    await this.sitzung.uebernehmen();
  }

  /** Spielleitung: neuen Lauf für dieses Team beginnen. */
  async neuesSpiel(): Promise<void> {
    await this.sitzung.neuesSpiel(this.spiel.team);
  }

  /** Team-Fenster, das nur zusieht: das Spiel hier weiterführen (der Team-Laptop ist weg). */
  async uebernehmenTeam(): Promise<void> {
    await this.sitzung.uebernehmenTeam();
  }

  /** K4.2: Team verlassen, auch während eines Laufs (hält den Host an und lädt den Rest hoch). */
  async teamVerlassen(): Promise<void> {
    await this.sitzung.teamVerlassen();
  }
}
