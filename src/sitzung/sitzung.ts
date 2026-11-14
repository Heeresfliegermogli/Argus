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
// Seit Liste K (11.11.2026) – Spiele sauber schließen und wieder öffnen:
//  • K1: Das Team-Fenster merkt sich Kennung und Team je Sitzung (Merker, localStorage). Derselbe Browser ist nach Tab-Schließen
//    sofort wieder der Laptop seines Teams. Ein zweiter Tab desselben Browsers sieht als Gast zu (Tab-Wache in main.tsx).
//  • K2: Ist der Laptop eines Teams länger als 20 s nicht verbunden, kann ein anderes Fenster sichtbar übernehmen
//    (teamUebernehmen). Kommt der alte Laptop zurück, ist er nicht mehr das früheste Fenster und stoppt seinen Host („abgelöst“).
//    Die Spielleitung kann ein totes Fenster aus dem Team nehmen (laptopFreigeben).
//  • K3: Aktionen der Spielleitung gelten höchstens 10 s als „gesendet …“; Start/Pause stehen im Kanal und wirken beim
//    Wiederverbinden. Regelfehler eines Team-Fensters reisen in der Anwesenheit zur Spielleitung.
//  • K4: „Sitzung beenden“ setzt eine Marke unter teams/ (ENDE_TEAM); Team-Fenster schließen ab und vergessen die Sitzung.
//
// Direktaufruf ohne Lobby (…/?rolle=zb&raum=…, …/?rolle=sl&raum=…): ein Team. Das Team-Fenster legt Sitzung, Team und Lauf an, wenn
// sie fehlen, und rechnet das Spiel; eine Spielleitung im selben Raum steuert und sieht zu.
import type { Inhalte } from "../inhalte/typen";
import { type Absender, type AktionsDaten, type AktionsTyp, type Rolle, neueLaufId, zufall } from "../kern/ereignisse";
import { fensterJetzt, fensterKennung } from "../kern/fenster";
import { ROLLEN_NAME } from "../kern/sichten";
import {
  DIREKT_TEAM, ENDE_NAME, ENDE_TEAM, type GruppenRolle, SPIELERNAME_MAX, TESTRAUM_VERFALL_MS, codeAnzeige, freieFarbe, geraeteName, laptopText, neueTeamId,
  rollenAus, rollenText, teamnameBereinigt,
} from "../kern/sitzungen";
import { mmss } from "../kern/uhr";
import type { TeamStatus } from "../kern/uebersicht";
import {
  type Abmelden, type FensterArt, type HostInfo, PULS_INTERVALL_MS, type SitzungsInfo, type SpielerEintrag, type SyncAdapter,
  type TeamDaten, type Teilnehmer, UEBERNAHME_MS, type Verbindung, istVeraltet, regelFehler, teamKanal,
} from "../sync/adapter";
import { SpeicherAblage, leseProtokollDatei } from "./ablage";
import { type Merker, vergissAlleSitzungen } from "./gemerkt";
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
  /** seit Liste L (L4.2): Programmstand (Commit) des Fensters und ob sein Tab im Hintergrund liegt – aus der Anwesenheit */
  version?: string;
  hintergrund?: boolean;
  /** seit Liste L (L2.4): Das Fenster meldet zwei Verläufe im Lauf (kann nicht hochladen) */
  zwei?: boolean;
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
  /** K2: Serverzeit (ms), seit der der Team-Laptop nicht verbunden ist (soweit dieses Fenster es weiß); null, wenn verbunden oder kein Laptop */
  rechnerWegSeit: number | null;
  /** K2.1: Der Team-Laptop ist länger als 20 s nicht verbunden – ein anderes Fenster darf das Spiel sichtbar übernehmen */
  uebernehmbar: boolean;
  /** L2.1: Serverzeit des letzten Lebenszeichens des Team-Laptops (Puls oder Statusmeldung), soweit dieses Fenster es weiß */
  rechnerZuletzt: number | null;
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
  /**
   * eigenes Team (Team-Fenster) und ob dieses Fenster das Spiel des Teams rechnet. `abgeloest` (K2.2): Dieses Fenster hat das Spiel
   * gerechnet, jetzt führt es ein anderer Laptop weiter.
   */
  ich: { team: string | null; rollen: GruppenRolle[]; rechnet: boolean; abgeloest: boolean; entfernt: Entfernt | null };
  /** K1.3: zweiter Tab desselben Browsers – sieht dem eigenen Team nur zu, steht nicht im Team */
  gast: boolean;
  /** K4.1: Serverzeit, zu der die Spielleitung die Sitzung beendet hat (sonst null) */
  beendet: number | null;
  /** K3.4: Namen der Team-Fenster, bei denen die Firebase-Regeln ablehnen (aus der Anwesenheit) */
  regelFehlerBei: string[];
  /** Statusmeldungen der Teams (Spielleitung, Plenum) */
  status: Record<string, TeamStatus>;
  /** Firebase-Regeln lehnen ab (H1.5: in der Konsole neu veröffentlichen) */
  regelFehler: boolean;
  /** Direktaufruf ohne Lobby (ein Team) */
  direkt: boolean;
  /**
   * Liste L (L3): globale Marke „Alle Sitzungen beendet“. `ts` Serverzeit oder null; `lesbar` false = die Datenbank lässt sie nicht
   * lesen (alte Firebase-Regeln) – dann gilt „keine Marke“; `geladen`, sobald die erste Antwort da ist.
   */
  reset: { ts: number | null; lesbar: boolean; geladen: boolean };
  /** L3.2: Die Marke kam, während dieses Fenster offen war – es hat abgeschlossen und geht zur Startseite */
  alleBeendet: boolean;
  /** L3.4: „Alle Sitzungen beenden“ wurde von den (alten) Firebase-Regeln abgelehnt */
  resetRegelFehler: boolean;
}

/** L2.3 / L1.1: Dieses Team-Fenster wurde von der Spielleitung aus dem Team genommen bzw. der Testraum wurde geleert. */
export type Entfernt = "abgemeldet" | "geleert";

/** L2.1: Warum ein Start- oder Pause-Befehl der Spielleitung noch nicht ausgeführt ist. */
export interface UhrGrund {
  befehl: "start" | "pause";
  /** ganzer Satz für den Knopf der Teamansicht */
  text: string;
  /** kurz für die Zeile der Übersicht: „Start wartet auf Laptop SU2A“ */
  kurz: string;
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
  /** K1.1: Merker des Team-Fensters (Kennung und Team je Sitzung im localStorage) */
  merker?: Merker;
  /** K1.3: zweiter Tab desselben Browsers – sieht dem Team dieser Kennung zu, ohne beizutreten */
  gastVon?: string;
  /** Tests: Zeitlimit für „gesendet …“ (Standard 10 s) und Wartezeit bis zur Übernahme (Standard 20 s) */
  zeitlimitMs?: number;
  uebernahmeMs?: number;
  /** Tests: Verfall eines Laptop-Eintrags im Testraum (Standard 2 h, L1.2) */
  verfallMs?: number;
}

/** Was teamStaende über „wie lange weg“ wissen muss (K2). */
export interface WegAngaben {
  jetzt: number;
  /** Serverzeit, seit der das Fenster nicht verbunden ist */
  wegSeit: (client: string, team: string) => number;
  uebernahmeMs?: number;
  /** L1.2/L3.2: Zählt dieser Eintrag (noch)? Im Testraum verfallen alte Einträge. Ohne: alle zählen. */
  gilt?: (client: string, team: string, eintrag: SpielerEintrag) => boolean;
  /** L2.1: letztes Lebenszeichen eines Fensters (Serverzeit) oder null */
  zuletzt?: (client: string, team: string) => number | null;
}

/** Teams mit Anwesenheit zusammenführen (reine Funktion, auch für Tests). */
export function teamStaende(teams: Record<string, TeamDaten>, teilnehmer: Teilnehmer[], weg?: WegAngaben): TeamStand[] {
  const online = new Map(teilnehmer.map((t) => [t.client, t]));
  return Object.entries(teams)
    .filter(([id, d]) => id !== ENDE_TEAM && d && typeof d.name === "string")
    .map(([id, d]) => {
      const spieler: SpielerStand[] = Object.entries(d.spieler ?? {})
        .filter(([client, s]) => !weg?.gilt || weg.gilt(client, id, s))
        .map(([client, s]) => {
          const anw = online.get(client);
          return {
            client, name: s.name, rollen: rollenAus(s.rollen), online: !!anw, seit: s.seit ?? 0, ...(anw?.fenster ? { fenster: anw.fenster } : {}),
            ...(anw?.version ? { version: anw.version } : {}), ...(anw?.hintergrund ? { hintergrund: true } : {}), ...(anw?.zwei ? { zwei: true } : {}),
          };
        })
        .filter((s) => s.rollen.length > 0)
        .sort((a, b) => a.seit - b.seit || a.client.localeCompare(b.client));
      const rechner = spieler[0]?.client ?? null;
      const rechnerOnline = !!spieler[0]?.online;
      const rechnerWegSeit = rechner && !rechnerOnline && weg ? weg.wegSeit(rechner, id) : null;
      const uebernehmbar = rechnerWegSeit !== null && weg!.jetzt - rechnerWegSeit >= (weg!.uebernahmeMs ?? UEBERNAHME_MS);
      const rechnerZuletzt = rechner ? weg?.zuletzt?.(rechner, id) ?? null : null;
      return { id, name: d.name, farbe: d.farbe, erstellt: d.erstellt ?? 0, lauf: d.lauf ?? null, spieler, rechner, rechnerOnline, rechnerWegSeit, uebernehmbar, rechnerZuletzt };
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
  // K2: wann welches Fenster zuletzt verbunden war (Serverzeit), und seit wann dieses Fenster die Anwesenheit kennt
  private zuletztOnline = new Map<string, number>();
  private beobachtetAb = 0;
  private statusAbo: Abmelden | null = null;
  // K2.2: Dieses Fenster hat das Spiel dieses Teams gerechnet (in diesem Tab oder laut Merker)
  private rechneteTeam: string | null = null;
  // Liste L
  /** L2.3: von der Spielleitung aus dem Team genommen / Testraum geleert (bis „neu beitreten“) */
  private entfernt: Entfernt | null = null;
  /** dieses Fenster verlässt sein Team gerade selbst (dann ist das Verschwinden des Eintrags keine Abmeldung) */
  private selbstRaus = false;
  /** Testraum: Stand („geleert um“) des Teams, als dieses Fenster zuerst darin stand */
  private raumStandBeiBeitritt: number | null = null;
  /** Testraum: verfallene Einträge, die dieses Fenster schon weggeräumt hat */
  private weggeraeumt = new Set<string>();
  /** L3: Marke beim Öffnen des Fensters (undefined = noch keine Antwort) */
  private resetBeiStart: number | null | undefined = undefined;
  private zweiGemeldet = new Set<string>();

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
      // L1.3: Im Test ohne Lobby hießen alle Team-Fenster „Zielbearbeitung“ – jetzt trägt jedes seinen Gerätenamen („Laptop SU2A“)
      name: (opt.name?.trim() || (opt.direkt?.rolle === "zb" ? geraeteName(this.client) : rolleName)).slice(0, SPIELERNAME_MAX),
      verbindung: { verbunden: false, art: adapter.art },
      info: null,
      infoGeladen: false,
      teamsGeladen: false,
      teams: [],
      teilnehmer: [],
      host: null,
      istHost: false,
      ich: { team: null, rollen: [], rechnet: false, abgeloest: false, entfernt: null },
      gast: !!opt.gastVon,
      beendet: null,
      regelFehlerBei: [],
      status: {},
      regelFehler: false,
      direkt: !!opt.direkt,
      reset: { ts: null, lesbar: true, geladen: false },
      alleBeendet: false,
      resetRegelFehler: false,
    };
    // Ablage des eigenen Spiels nur im Team-Fenster mit Netz (lokal liegt das Protokoll ohnehin auf diesem Rechner)
    const g = opt.merker?.lies();
    if (g?.rechnete && g.client === this.client) this.rechneteTeam = g.team;
    if (opt.art === "tt" && adapter.art === "firebase" && !opt.gastVon) {
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
    // K1.1: Kennung gleich merken – auch wer den Tab schon in der Lobby schließt, kommt als dasselbe Fenster wieder
    if (this.opt.merker && this.opt.merker.lies()?.client !== this.client) this.merken(null);
    // seit Liste J (J2.4): Fenstergröße neu melden, wenn das Fenster größer oder kleiner gezogen wird
    if (typeof window !== "undefined") {
      window.addEventListener("resize", this.fensterGeaendert);
      this.abos.push(() => {
        window.removeEventListener("resize", this.fensterGeaendert);
        if (this.fensterTimer) clearTimeout(this.fensterTimer);
      });
    }
    this.abos.push(this.adapter.aufAnwesenheit((liste) => {
      const jetzt = this.adapter.serverJetzt();
      if (!this.beobachtetAb) this.beobachtetAb = jetzt;
      // „nicht verbunden seit“ zählt ab dem letzten Lebenszeichen (Puls, alle 5 s) – auch wenn der Eintrag erst später als veraltet gilt
      for (const t of liste) this.zuletztOnline.set(t.client, typeof t.puls === "number" ? Math.min(t.puls, jetzt) : jetzt);
      const bei = liste.filter((t) => t.regeln).map((t) => t.name || "Team-Laptop");
      this.aendern({ teilnehmer: liste, ...(bei.join("|") !== this.s.regelFehlerBei.join("|") ? { regelFehlerBei: bei } : {}) });
      this.teamsNeu();
    }));
    this.abos.push(this.adapter.aufInfo((info) => {
      this.aendern({ info, infoGeladen: true });
      // L3.3: Eine Sitzung, die vor der Marke angelegt wurde, gilt als beendet
      if (this.s.teamsGeladen) this.teamsNeu();
      void this.direktPruefen();
    }));
    // Liste L (L3): globale Marke „Alle Sitzungen beendet“. Bleibt die Antwort aus (kein Netz), gilt nach 3 s „keine Marke“.
    this.abos.push(this.adapter.aufReset((ts, lesbar) => this.resetGeaendert(ts, lesbar)));
    const resetFrist = setTimeout(() => { if (!this.s.reset.geladen) this.resetGeaendert(null, true, true); }, 3000);
    this.abos.push(() => clearTimeout(resetFrist));
    // L4.2: Tab im Hintergrund – in der Anwesenheit melden
    if (typeof document !== "undefined") {
      // nicht mehr, wenn die Seite gerade geschlossen wird (pagehide kommt vor visibilitychange) – sonst trüge sich das Fenster
      // beim Schließen noch einmal als „verbunden“ ein
      let geht = false;
      const weg = () => { geht = true; };
      const da = () => { geht = false; };
      const sicht = () => { if (this.gestartet && !geht) this.meldeAnwesenheit(); };
      window.addEventListener("pagehide", weg);
      window.addEventListener("pageshow", da);
      document.addEventListener("visibilitychange", sicht);
      this.abos.push(() => {
        document.removeEventListener("visibilitychange", sicht);
        window.removeEventListener("pagehide", weg);
        window.removeEventListener("pageshow", da);
      });
    }
    this.abos.push(this.adapter.aufTeams((t) => {
      this.rohTeams = t ?? {};
      this.aendern({ teamsGeladen: true });
      this.teamsNeu();
    }));
    this.abos.push(this.adapter.aufHost((h) => this.hostGeaendert(h)));
    this.statusAbgleichen();
    if (this.s.art === "sl") this.timer.push(setInterval(() => this.hostPruefen(), PULS_INTERVALL_MS));
    // K2: „länger als 20 s nicht verbunden“ wird ohne neues Ereignis wahr – jede Sekunde nachsehen, solange ein Laptop fehlt
    this.timer.push(setInterval(() => {
      if (this.s.teams.some((t) => t.rechner && !t.rechnerOnline)) this.teamsNeu();
    }, 1000));
  }

  stoppen(): void {
    this.spiele.forEach((sp) => sp.stoppen());
    this.spiele.clear();
    this.spielAbos.forEach((ab) => ab());
    this.spielAbos.clear();
    this.abos.forEach((a) => a());
    this.abos = [];
    this.statusAbo?.();
    this.statusAbo = null;
    this.timer.forEach(clearInterval);
    this.timer = [];
    if (this.gestartet) this.adapter.trennen();
    this.gestartet = false;
  }

  private verbindungGeaendert(v: Verbindung): void {
    const regel = !!v.fehler && regelFehler(v.fehler);
    if (regel && !this.s.regelFehler) this.setzeRegelFehler();
    this.aendern({ verbindung: v });
  }

  /** Die Firebase-Regeln lehnen ab: Balken in diesem Fenster und – über die Anwesenheit – bei der Spielleitung (K3.4). */
  private setzeRegelFehler(): void {
    if (this.s.regelFehler) return;
    this.aendern({ regelFehler: true });
    if (this.gestartet) this.meldeAnwesenheit();
  }

  private meldeAnwesenheit(): void {
    // K1.3: Ein Gast (zweiter Tab) steht in keinem Team und meldet sich nicht an – die Spielleitung sähe sonst ein „Fenster ohne Team“
    if (this.opt.gastVon) return;
    const f = fensterJetzt();
    this.gemeldetesFenster = f.breite && f.hoehe ? fensterKennung(f) : "";
    this.gemeldetZwei = this.s.art === "tt" && !!this.spiel(this.s.ich.team)?.stand.upload.zwei;
    this.adapter.meldeAnwesenheit({
      // seit Liste L (L4.2): Programmstand (Commit) statt der Versionsnummer – die Spielleitung sieht, wer noch alten Code hat
      client: this.client, art: this.s.art, name: this.s.name, version: __ARGUS_COMMIT__,
      ...(this.s.ich.team ? { team: this.s.ich.team } : {}),
      ...(this.gemeldetesFenster ? { fenster: this.gemeldetesFenster } : {}),
      ...(this.s.regelFehler && this.s.art === "tt" ? { regeln: true } : {}),
      ...(this.gemeldetZwei ? { zwei: true } : {}),
      ...(typeof document !== "undefined" && document.hidden ? { hintergrund: true } : {}),
    });
  }
  private gemeldetZwei = false;

  /** L2.1: letztes Lebenszeichen eines Fensters – Puls der Anwesenheit oder seine Statusmeldung. */
  private zuletzt(client: string, team: string): number | null {
    const st = this.s.status[team];
    const ts = Math.max(this.zuletztOnline.get(client) ?? 0, st && st.client === client && typeof st.ts === "number" ? st.ts : 0);
    return ts > 0 ? ts : null;
  }

  /**
   * L1.2 / L3.2: Zählt ein Laptop-Eintrag im Testraum noch? Nicht, wenn er vor der Marke „Alle Sitzungen beendet“ entstand, und nicht,
   * wenn er länger als 2 h kein Lebenszeichen gab (Beitritt, Puls, Statusmeldung). In Sitzungen mit Lobby zählen alle Einträge.
   */
  private gilt(client: string, team: string, e: SpielerEintrag): boolean {
    if (!this.opt.direkt || team !== DIREKT_TEAM) return true;
    const seit = e.seit ?? 0;
    // vor der Marke oder vor dem letzten „Testraum leeren“ (teams/traum/erstellt) beigetreten: zählt nicht – auch der eigene Eintrag
    // (<=: ein Beitritt in derselben Millisekunde zählt als davor; neue Beitritte liegen immer mindestens 1 ms danach, nachMarke)
    if ((this.s.reset.ts && seit <= this.s.reset.ts) || seit <= (this.rohTeams[DIREKT_TEAM]?.erstellt ?? -1)) return false;
    if (client === this.client) return true;
    // erst urteilen, wenn die Anwesenheit da ist – sonst gälte ein lebendiger Laptop kurz als verfallen (zwei rechnende Fenster)
    if (!this.beobachtetAb) return true;
    if (this.s.teilnehmer.some((t) => t.client === client)) return true;
    return this.adapter.serverJetzt() - Math.max(seit, this.zuletzt(client, team) ?? 0) <= (this.opt.verfallMs ?? TESTRAUM_VERFALL_MS);
  }

  /** Statusmeldungen: Spielleitung und Plenum immer; ein Team-Fenster nur, solange es nicht selbst rechnet (für „seit wann weg“, K2). */
  private statusAbgleichen(): void {
    const noetig = this.gestartet && (this.s.art !== "tt" || !this.s.ich.rechnet);
    if (noetig && !this.statusAbo) {
      this.statusAbo = this.adapter.aufStatus((st) => {
        this.aendern({ status: st ?? {} });
        // Testraum (L1.2): ob ein Eintrag verfallen ist, hängt auch an der letzten Statusmeldung
        if (this.opt.direkt && this.statusAbo) this.teamsNeu();
      });
    }
    else if (!noetig && this.statusAbo) {
      this.statusAbo();
      this.statusAbo = null;
    }
  }

  /** K2: Serverzeit, seit der ein Fenster nicht verbunden ist – zuletzt gesehen, sonst seine letzte Statusmeldung, sonst seit dieses Fenster zusieht. */
  private wegSeit(client: string, team: string): number {
    const gesehen = this.zuletztOnline.get(client);
    if (gesehen) return gesehen;
    const st = this.s.status[team];
    if (st && st.client === client && typeof st.ts === "number") return st.ts;
    return this.beobachtetAb || this.adapter.serverJetzt();
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
    const teams = teamStaende(this.rohTeams, this.s.teilnehmer, {
      jetzt: this.adapter.serverJetzt(), wegSeit: (c, t) => this.wegSeit(c, t), uebernahmeMs: this.opt.uebernahmeMs,
      gilt: (c, t, e) => this.gilt(c, t, e), zuletzt: (c, t) => this.zuletzt(c, t),
    });
    // K1.3: Der Gast (zweiter Tab) sieht dem Team der eigentlichen Kennung zu
    const wer = this.opt.gastVon ?? this.client;
    const eigen = teams.find((t) => t.spieler.some((x) => x.client === wer));
    const meinEintrag = eigen?.spieler.find((x) => x.client === wer);
    // Das früheste Fenster des Teams rechnet – auch ohne Netz (H1.3). Kein anderes übernimmt von selbst: Ein Laptop ohne Netz
    // spielt weiter, ein zweites Fenster würde sonst einen zweiten Spielstand anfangen. Übernehmen nur von Hand (teamUebernehmen).
    const rechnet = !this.opt.gastVon && !!eigen && eigen.spieler[0]?.client === this.client && this.s.beendet === null;
    if (rechnet) this.rechneteTeam = eigen!.id;
    // K2.2: Dieses Fenster hat gerechnet, jetzt ist ein anderes das früheste – ein anderer Laptop führt das Spiel weiter
    const abgeloest = !this.opt.gastVon && !!eigen && !rechnet && this.rechneteTeam === eigen.id && eigen.rechner !== this.client;
    // Liste L (L2.3, L1.1): Dieses Fenster stand in einem Team und steht ohne eigenes Zutun in keinem mehr – die Spielleitung hat es
    // abgemeldet („Laptop abmelden“, „aus dem Team nehmen“, Team gelöscht) oder den Testraum geleert.
    const vorher = this.s.ich.team;
    if (eigen) {
      this.selbstRaus = false;
      if (this.opt.direkt && this.raumStandBeiBeitritt === null) this.raumStandBeiBeitritt = this.rohTeams[eigen.id]?.erstellt ?? 0;
    } else if (vorher && this.s.art === "tt" && !this.opt.gastVon && this.s.beendet === null && !this.s.alleBeendet) {
      if (this.selbstRaus) this.selbstRaus = false;
      else {
        const alt = this.s.teams.find((t) => t.id === vorher);
        const geleert = !!this.opt.direkt && (this.rohTeams[DIREKT_TEAM]?.erstellt ?? 0) > (this.raumStandBeiBeitritt ?? 0);
        if (this.opt.direkt || alt?.lauf) {
          this.entfernt = geleert ? "geleert" : "abgemeldet";
          this.hinweis("warnung", geleert ? "Die Spielleitung hat den Testraum geleert – dieses Fenster rechnet nicht mehr." : "Die Spielleitung hat diesen Laptop abgemeldet – er rechnet nicht mehr.");
        } else this.hinweis("warnung", "Die Spielleitung hat dieses Fenster aus dem Team genommen.");
        this.beiEntfernt(vorher);
      }
    }
    const ich = { team: eigen?.id ?? null, rollen: meinEintrag?.rollen ?? [], rechnet, abgeloest, entfernt: eigen ? null : this.entfernt };
    if (eigen) this.entfernt = null;
    const teamWechsel = ich.team !== this.s.ich.team;
    const geaendert = teamWechsel || rechnet !== this.s.ich.rechnet || abgeloest !== this.s.ich.abgeloest || ich.entfernt !== this.s.ich.entfernt;
    if (abgeloest && !this.s.ich.abgeloest) this.hinweis("warnung", "Das Spiel wird an einem anderen Laptop weitergeführt – dieser rechnet nicht mehr.");
    if (meinEintrag && this.s.art === "tt" && meinEintrag.name !== this.s.name && !this.opt.direkt && !this.opt.gastVon) {
      // Name aus dem Team übernehmen (z. B. nach Neuladen)
      this.s = { ...this.s, name: meinEintrag.name };
    }
    // K4.1: Marke „Sitzung beendet“
    // L3.3: Eine Sitzung mit Lobby, die vor der Marke „Alle Sitzungen beendet“ angelegt wurde, gilt ebenfalls als beendet
    const ende = this.rohTeams[ENDE_TEAM];
    const marke = this.s.reset.ts;
    const vorMarke = !this.opt.direkt && marke !== null && !!this.s.info && this.s.info.erstellt < marke;
    const beendet = ende ? ende.erstellt || 1 : vorMarke ? marke : null;
    const neuBeendet = beendet !== null && this.s.beendet === null;
    this.aendern({ teams, ich, beendet });
    if (teamWechsel) this.meldeAnwesenheit();
    if ((geaendert && !ich.entfernt) || (eigen && this.opt.merker?.lies()?.teamName !== eigen.name)) this.merken(eigen ?? null);
    this.statusAbgleichen();
    this.zweiPruefen();
    if (neuBeendet) {
      void this.beiBeendet();
      return;
    }
    // beendet: Team-Fenster haben abgeschlossen; Spielleitung und Plenum lesen die Protokolle weiter (Auswertung)
    if (this.s.beendet !== null && this.s.art === "tt") return;
    if (this.s.alleBeendet) return;
    this.spieleAbgleichen();
    void this.direktPruefen();
    this.testraumAufraeumen();
    if (this.s.istHost) void this.farbenPruefen();
  }

  /**
   * L2.3: Dieses Fenster ist nicht mehr im Team. Host sofort anhalten (kein Ereignis mehr), den Rest hochladen, die Sitzung vergessen.
   * Das Spiel des alten Teams gehört diesem Fenster danach nicht mehr.
   */
  private beiEntfernt(team: string): void {
    const sp = this.spiele.get(team);
    this.rechneteTeam = null;
    if (this.entfernt) this.opt.merker?.vergiss();
    if (!sp) return;
    this.spiele.delete(team);
    this.spielAbos.get(team)?.();
    this.spielAbos.delete(team);
    void sp.abschliessen().catch(() => false).then(() => sp.stoppen());
  }

  /** L2.3: nach „Von der Spielleitung abgemeldet“ zurück in die Lobby („neu beitreten“). */
  neuBeitreten(): void {
    this.entfernt = null;
    this.aendern({ ich: { ...this.s.ich, entfernt: null } });
    this.merken(null);
  }

  /**
   * Testraum (L1.2, L3.2): Das rechnende Team-Fenster nimmt Einträge, die nicht mehr zählen (verfallen, älter als die Marke), auch aus
   * der Datenbank – sonst sammeln sie sich wie zwischen dem 24.10. und dem 12.11. („vier Laptops, alle heißen Zielbearbeitung“).
   */
  private testraumAufraeumen(): void {
    if (!this.opt.direkt || !((this.s.art === "tt" && this.s.ich.rechnet) || (this.s.art === "sl" && this.s.istHost))) return;
    if (!this.beobachtetAb || !this.s.reset.geladen) return;
    const roh = this.rohTeams[DIREKT_TEAM]?.spieler ?? {};
    const zaehlt = new Set(this.team(DIREKT_TEAM)?.spieler.map((x) => x.client));
    for (const client of Object.keys(roh)) {
      if (zaehlt.has(client) || this.weggeraeumt.has(client)) continue;
      this.weggeraeumt.add(client);
      void this.adapter.setzeSpieler(null, client, null, [DIREKT_TEAM]).catch(() => {});
    }
  }

  /** L2.4: zwei Verläufe – eigener Befund (Spiel) in die Anwesenheit; Spielleitung: Hinweis je Team einmal. */
  private zweiPruefen(): void {
    if (this.s.art === "tt") {
      if (!!this.spiel(this.s.ich.team)?.stand.upload.zwei !== this.gemeldetZwei && this.gestartet) this.meldeAnwesenheit();
      return;
    }
    if (this.s.art !== "sl") return;
    for (const t of this.s.teams) {
      const schl = `${t.id}:${t.lauf ?? ""}`;
      if (!this.zweiVerlaeufe(t.id) || this.zweiGemeldet.has(schl)) continue;
      this.zweiGemeldet.add(schl);
      this.hinweis("fehler", `Team ${t.name}: Lauf hat zwei Verläufe – Neues Spiel empfohlen.`);
    }
  }

  /** L2.4: Hat der aktuelle Lauf dieses Teams zwei Verläufe (meldet der Team-Laptop oder sieht dieses Fenster selbst)? */
  zweiVerlaeufe(team: string): boolean {
    const t = this.team(team);
    if (!t?.lauf) return false;
    return !!this.spiele.get(team)?.stand.upload.zwei || !!t.spieler.find((x) => x.client === t.rechner)?.zwei;
  }

  /**
   * L2.1: Warum ist Start oder Pause für dieses Team noch nicht ausgeführt? Bleibt stehen, bis der Befehl im Protokoll steht oder die
   * Spielleitung neu klickt (dann wieder höchstens 10 s „gesendet …“). null: nichts steht aus.
   */
  uhrGrund(team: string): UhrGrund | null {
    const sp = this.spiele.get(team);
    const t = this.team(team);
    if (!sp || !t || !t.lauf || sp.stand.lauf !== t.lauf || sp.stand.zustand.ende) return null;
    const befehl = sp.ausstehendeUhr();
    if (!befehl || sp.wartetAuf("uhr")) return null;
    const was = befehl === "start" ? "Start" : "Anhalten";
    const jetzt = this.adapter.serverJetzt();
    const r = t.spieler.find((x) => x.client === t.rechner);
    if (!r) {
      return { befehl, kurz: `${was} wartet auf Laptop`, text: `${was} nicht ausgeführt – im Team ist kein Laptop. Das Fenster des Teams an einem Laptop öffnen; der Befehl wird dann ausgeführt.` };
    }
    const laptop = geraeteName(r.client);
    const vor = t.rechnerZuletzt ? `zuletzt vor ${mmss(Math.max(0, Math.round((jetzt - t.rechnerZuletzt) / 1000)))}` : "noch kein Lebenszeichen";
    if (!t.rechnerOnline) {
      return {
        befehl, kurz: `${was} wartet auf ${laptop}`,
        text: `${was} nicht ausgeführt – ${laptop} rechnet nicht (${vor}). Fenster an einem Laptop öffnen oder hier „Laptop abmelden“.`,
      };
    }
    return {
      befehl, kurz: `${was} wartet auf Antwort von ${laptop}`,
      text: `${was} nicht ausgeführt – ${laptop} ist verbunden, antwortet aber nicht (${vor}). Dort neu laden oder hier „Laptop abmelden“.`,
    };
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
          zeitlimitMs: this.opt.zeitlimitMs,
          aktionenLesen: this.s.art === "sl",
          beiUeberfaellig: () => this.antwortetNicht(id),
        });
        this.spiele.set(id, sp);
        this.spielAbos.set(id, sp.abonnieren(() => {
          if (sp!.stand.upload.regeln && !this.s.regelFehler) this.setzeRegelFehler();
          if (sp!.stand.upload.zwei) this.zweiPruefen();
          this.hoerer.forEach((cb) => cb());
        }));
      }
      // Team-Fenster: das früheste anwesende Fenster des Teams rechnet das Spiel
      sp.setzeHost(this.s.art === "tt" && this.s.ich.team === id && this.s.ich.rechnet);
      sp.folgeLauf(this.team(id)?.lauf ?? null);
    }
  }

  /** K1.1: Kennung und Team im Merker festhalten (nur Team-Fenster einer Sitzung mit Lobby, nicht der Gast). */
  private merken(eigen: TeamStand | null): void {
    const m = this.opt.merker;
    if (!m || this.s.art !== "tt" || this.opt.gastVon || this.s.beendet !== null || this.s.alleBeendet) return;
    m.schreibe({
      client: this.client, team: eigen?.id ?? null, teamName: eigen?.name ?? null,
      rechnete: !!eigen && this.rechneteTeam === eigen.id, sync: this.adapter.art,
    });
  }

  /** K3.1: Eine Aktion der Spielleitung steht nach 10 s nicht im Protokoll – sagen, warum (statt dauerhaft „gesendet …“). */
  private antwortetNicht(team: string): void {
    const t = this.team(team);
    if (!t) return;
    const grund = !t.rechner ? "kein Laptop im Team" : !t.rechnerOnline ? `${geraeteName(t.rechner)} nicht verbunden` : `${geraeteName(t.rechner)} verbunden, die Antwort fehlt noch`;
    this.hinweis("warnung", `Team ${t.name} antwortet nicht – ${grund}. Der Befehl bleibt stehen und wird ausgeführt, sobald der Laptop rechnet.`);
  }

  /**
   * K4.1: Die Spielleitung hat die Sitzung beendet. Team-Fenster: Host anhalten, Rest hochladen, Sitzung vergessen. Alle Fenster
   * behalten, was sie haben (Protokolle bleiben für die Auswertung).
   */
  private async beiBeendet(): Promise<void> {
    if (this.s.art === "tt") {
      this.opt.merker?.vergiss();
      await Promise.all([...this.spiele.values()].map((sp) => sp.abschliessen()));
      this.aendern({ ich: { ...this.s.ich, rechnet: false } });
    }
  }

  // ---------------------------------------------------------------- Lobby (Team-Fenster)

  /** Eintrag dieses Fensters im Team. `seit` nur beim Beitritt neu, sonst bleibt der alte Wert. */
  private eintrag(neu = true, seit?: number): SpielerEintrag {
    const alt = this.team(this.s.ich.team)?.spieler.find((x) => x.client === this.client)?.seit;
    // L3.2: ein neuer Beitritt liegt immer nach der Marke „Alle Sitzungen beendet“ (auch wenn die Uhr dieses Rechners nachgeht)
    return { name: this.s.name || "Team", rollen: rollenText(["zb"]), seit: seit ?? (neu || !alt ? this.nachMarke() : alt) };
  }

  /** Serverzeit jetzt, aber sicher nach der Marke „Alle Sitzungen beendet“. */
  private nachMarke(): number {
    const raum = this.opt.direkt ? this.rohTeams[DIREKT_TEAM]?.erstellt ?? 0 : 0;
    return Math.max(Math.round(this.adapter.serverJetzt()), (this.s.reset.ts ?? 0) + 1, raum + 1);
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
    if (this.nichtMehr()) return null;
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
    if (this.nichtMehr()) return false;
    const t = this.team(team);
    if (!t) return false;
    if (this.s.ich.team === team) return true;
    return this.schreibe(() => this.adapter.setzeSpieler(team, this.client, this.eintrag(), this.meineTeams()));
  }

  /** Gast (zweiter Tab) und beendete Sitzung schreiben nichts in die Lobby. */
  private nichtMehr(): boolean {
    if (this.s.beendet !== null) this.hinweis("warnung", "Die Sitzung ist beendet.");
    return this.s.beendet !== null || !!this.opt.gastVon;
  }

  /**
   * K2.1: Das Spiel eines Teams an diesem Fenster weiterführen, weil sein Laptop weg ist – aus der Lobby (tritt dabei bei) oder als
   * Zuschauer im Team. Geht nur, solange der bisherige Laptop NICHT verbunden ist: nie zwei rechnende Fenster. Kommt er zurück, ist
   * er nicht mehr das früheste Fenster, stoppt seinen Host und zeigt „wird an einem anderen Laptop weitergeführt“ (K2.2).
   */
  async teamUebernehmen(team: string | null = this.s.ich.team): Promise<boolean> {
    if (this.nichtMehr()) return false;
    const t = this.team(team);
    if (!t) return false;
    if (t.rechner === this.client) return true;
    if (t.rechner && t.rechnerOnline) {
      this.hinweis("warnung", `Der Laptop von Team ${t.name} ist verbunden und rechnet – hier nur zuschauen.`);
      return false;
    }
    const frueheste = Math.min(...t.spieler.filter((x) => x.client !== this.client).map((x) => x.seit), Math.round(this.adapter.serverJetzt()));
    const ok = await this.schreibe(() => this.adapter.setzeSpieler(t.id, this.client, this.eintrag(false, Math.max(0, frueheste - 1)), this.meineTeams().filter((x) => x !== t.id)));
    if (ok) this.hinweis("info", `Dieser Laptop führt das Spiel von Team ${t.name} weiter.`);
    return ok;
  }

  /** wie teamUebernehmen für das eigene Team (Name seit 2.6). */
  async uebernehmenTeam(): Promise<boolean> {
    return this.teamUebernehmen(this.s.ich.team);
  }

  /**
   * Team verlassen – seit Liste K (K4.2) auch während eines Laufs: Rechnet dieses Fenster, hält es den Host an und lädt den Rest des
   * Protokolls hoch, bevor es geht. Danach rechnet das nächste Fenster des Teams oder eines, das neu beitritt.
   */
  async teamVerlassen(): Promise<boolean> {
    const alt = this.meineTeams();
    if (!alt.length) return true;
    const sp = this.spiel(this.s.ich.team);
    if (sp?.hostAktiv) {
      const ganz = await sp.abschliessen();
      if (!ganz) this.hinweis("warnung", "Das Protokoll ist nicht ganz im Netz – es bleibt auf diesem Laptop gespeichert.");
    }
    this.selbstRaus = true;
    const ok = await this.schreibe(() => this.adapter.setzeSpieler(null, this.client, null, alt));
    if (ok) this.rechneteTeam = null;
    else {
      this.selbstRaus = false;
      sp?.wiederAufnehmen();
    }
    return ok;
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

  /** K2.3: Spielleitung gibt den Laptop eines Teams frei (totes Fenster aus dem Team; das nächste oder ein neu beitretendes rechnet). */
  async laptopFreigeben(team: string): Promise<boolean> {
    const t = this.team(team);
    if (!t?.rechner) return false;
    const naechster = t.spieler[1];
    const ok = await this.spielerSetzen(t.rechner, null);
    if (ok) this.hinweis("info", naechster ? `Team ${t.name}: ${geraeteName(t.rechner)} abgemeldet – jetzt rechnet ${laptopText(naechster.client, naechster.name)}.` : `Team ${t.name}: ${geraeteName(t.rechner)} abgemeldet – das nächste Fenster, das beitritt, rechnet.`);
    return ok;
  }

  /**
   * L2.2: „Laptop abmelden“ – wie laptopFreigeben, aber auch wenn der Laptop verbunden ist und rechnet (die Ansicht fragt nach). Der
   * Eintrag verschwindet aus teams/<team>/spieler; das abgemeldete Fenster hält an und lädt den Rest hoch (L2.3), das nächste Fenster
   * des Teams rechnet ab dem hochgeladenen Protokoll. Ohne Regeländerung.
   */
  async laptopAbmelden(team: string): Promise<boolean> {
    return this.laptopFreigeben(team);
  }

  /**
   * L1.1: Testraum leeren (Spielleitung im Test ohne Lobby). Nimmt alle Laptop-Einträge aus „Team 1“ und legt einen neuen Lauf an;
   * offene Team-Fenster halten an („Testraum geleert – neu laden“), das nächste Team-Fenster, das (neu) öffnet, rechnet. Der Stand
   * „geleert um“ steht in teams/traum/erstellt – ohne Regeländerung.
   */
  async testraumLeeren(still = false): Promise<boolean> {
    if (!this.opt.direkt) return false;
    if (this.s.art === "sl" && !this.s.istHost) {
      if (!still) this.hinweis("warnung", "Nur die steuernde Spielleitung kann den Testraum leeren.");
      return false;
    }
    const roh = this.rohTeams[DIREKT_TEAM];
    const clients = Object.keys(roh?.spieler ?? {});
    // „geleert um“: nach jedem bisherigen Beitritt (auch wenn die Uhr eines Laptops vorgeht). Der Stand allein macht alle bisherigen
    // Einträge ungültig (gilt()) – alle offenen Fenster halten im selben Augenblick an; das Entfernen danach räumt nur auf.
    const um = Math.max(this.nachMarke(), ...Object.values(roh?.spieler ?? {}).map((e) => (e.seit ?? 0) + 1));
    const ok = await this.schreibe(async () => {
      await this.adapter.setzeTeam(DIREKT_TEAM, { ...this.direktKopf(), erstellt: um });
      await this.adapter.aendereTeam(DIREKT_TEAM, { lauf: neueLaufId() });
      await Promise.all(clients.map((c) => this.adapter.setzeSpieler(null, c, null, [DIREKT_TEAM])));
    });
    if (ok && !still) this.hinweis("info", `Testraum geleert${clients.length ? ` (${clients.length} ${clients.length === 1 ? "Laptop-Eintrag" : "Laptop-Einträge"} entfernt)` : ""}, neuer Lauf angelegt. Das nächste Team-Fenster, das (neu) öffnet, rechnet.`);
    return ok;
  }

  // ---------------------------------------------------------------- Notbremse (Liste L, L3)

  /**
   * L3.1: „Alle Sitzungen beenden“ – setzt die globale Marke argus/v1/reset. Jedes offene Fenster jeder Sitzung (und des Testraums)
   * schließt ab und geht zur Startseite. Mit den alten Firebase-Regeln lehnt die Datenbank ab: „regeln“ (sonst bricht nichts).
   */
  async alleBeenden(): Promise<"ok" | "regeln" | "fehler"> {
    try {
      await this.adapter.setzeReset();
      return "ok";
    } catch (e) {
      if (regelFehler(e)) {
        this.aendern({ resetRegelFehler: true });
        return "regeln";
      }
      this.hinweis("fehler", `Nicht gesendet: ${(e as Error).message}`);
      return "fehler";
    }
  }

  /** Die Marke hat sich geändert (oder die erste Antwort ist da). `ersatz`: keine Antwort nach 3 s – weiter ohne Marke. */
  private resetGeaendert(ts: number | null, lesbar: boolean, ersatz = false): void {
    const erste = this.resetBeiStart === undefined;
    if (erste && !ersatz) this.resetBeiStart = ts;
    this.aendern({ reset: { ts, lesbar, geladen: true } });
    // jünger als das Öffnen dieses Fensters: abschließen und zur Startseite (L3.2)
    if (!erste && !ersatz && ts !== null && ts > (this.resetBeiStart ?? 0) && !this.s.alleBeendet) {
      void this.beiAlleBeendet();
      return;
    }
    if (this.s.teamsGeladen) this.teamsNeu();
    void this.direktPruefen();
  }

  /**
   * L3.2: wie „Sitzung beendet“ (K4.1), für alle Sitzungen: Host anhalten, Rest hochladen, ALLE gemerkten Sitzungen vergessen; im
   * Testraum nimmt das Team-Fenster seinen Eintrag heraus, die steuernde Spielleitung leert den Raum. Danach zeigt main.tsx die
   * Startseite mit „Die Spielleitung hat alle Sitzungen beendet“.
   */
  private async beiAlleBeendet(): Promise<void> {
    vergissAlleSitzungen();
    this.opt.merker?.vergiss();
    const spiele = [...this.spiele.values()];
    // sofort: kein Fenster rechnet mehr
    const fertig = this.s.art === "tt" ? Promise.all(spiele.map((sp) => sp.abschliessen(3000).catch(() => false))) : Promise.resolve([]);
    this.aendern({ ich: { ...this.s.ich, rechnet: false } });
    try {
      await fertig;
      if (this.opt.direkt && this.s.art === "tt" && this.meineTeams().length) {
        this.selbstRaus = true;
        await this.adapter.setzeSpieler(null, this.client, null, this.meineTeams()).catch(() => {});
      }
      if (this.opt.direkt && this.s.art === "sl" && this.s.istHost) await this.testraumLeeren(true);
    } finally {
      this.aendern({ alleBeendet: true });
    }
  }

  /** Steuernde Spielleitung: Spiel für diese Teams öffnen (Lauf anlegen; Ansicht und Einweisung erscheinen am Team-Laptop). */
  async spielOeffnen(teams: string[]): Promise<boolean> {
    if (!this.s.istHost && !(this.opt.direkt && this.s.art === "tt")) {
      this.hinweis("warnung", "Nur die steuernde Spielleitung kann Spiele öffnen.");
      return false;
    }
    if (this.s.beendet !== null) {
      this.hinweis("warnung", "Die Sitzung ist beendet.");
      return false;
    }
    const ok = await this.schreibe(async () => {
      await Promise.all(teams.map((t) => this.adapter.aendereTeam(t, { lauf: neueLaufId() })));
    });
    // K3.3: Team ohne rechnenden Laptop – sagen, was passiert, statt still nichts zu tun
    if (ok && this.s.art === "sl") {
      const ohne = teams.map((t) => this.team(t)).filter((t): t is TeamStand => !!t && !t.rechnerOnline);
      if (ohne.length) {
        this.hinweis("warnung", `${ohne.length === 1 ? `Team ${ohne[0].name}` : `${ohne.length} Teams (${ohne.map((t) => t.name).join(", ")})`}: kein Laptop verbunden – das Spiel startet, sobald einer beitritt.`);
      }
    }
    return ok;
  }

  /**
   * K4.1: Sitzung beenden (steuernde Spielleitung). Setzt die Marke unter teams/; Team-Fenster halten an, laden den Rest hoch und
   * vergessen die Sitzung, das Plenum geht zur Startseite. Die Protokolle bleiben für die Auswertung.
   */
  async sitzungBeenden(): Promise<boolean> {
    if (this.s.art !== "sl" || !this.s.istHost) {
      this.hinweis("warnung", "Nur die steuernde Spielleitung kann die Sitzung beenden.");
      return false;
    }
    if (this.s.beendet !== null) return true;
    return this.schreibe(() => this.adapter.setzeTeam(ENDE_TEAM, { name: ENDE_NAME, farbe: "#000000", erstellt: Math.round(this.adapter.serverJetzt()) }));
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
      if (regelFehler(e)) this.setzeRegelFehler();
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
      if (regelFehler(e)) this.setzeRegelFehler();
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

  /**
   * Test ohne Lobby: Das Team-Fenster trägt sich in „Team 1“ ein – seit Liste L erst, wenn Teams und Marke geladen sind, damit der
   * Beitritt sicher nach „Alle Sitzungen beenden“ und nach dem letzten „Testraum leeren“ liegt (nachMarke).
   */
  private direktBeigetreten = false;
  private async direktBeitreten(): Promise<void> {
    if (this.opt.direkt?.rolle !== "zb" || this.s.art !== "tt" || this.direktBeigetreten) return;
    if (!this.s.teamsGeladen || !this.s.reset.geladen || this.s.alleBeendet) return;
    this.direktBeigetreten = true;
    await this.schreibe(() => this.adapter.setzeTeam(DIREKT_TEAM, this.direktKopf(), { client: this.client, eintrag: this.eintrag() }));
  }

  private direktKopf() {
    // erstellt = Stand „geleert um“ des Testraums (L1.1) – beim Beitreten nicht zurücksetzen
    return { name: "Team 1", farbe: freieFarbe([]), erstellt: this.rohTeams[DIREKT_TEAM]?.erstellt ?? 0 };
  }

  /**
   * Direktaufruf: Sitzung, Team und Lauf anlegen, wenn sie fehlen – die steuernde Spielleitung, sonst das Team-Fenster selbst
   * (dann ohne Spielleitung: Test allein an einem Rechner).
   */
  private async direktPruefen(): Promise<void> {
    void this.direktBeitreten();
    if (!this.opt.direkt || this.direktErledigt || !this.s.infoGeladen || !this.s.teamsGeladen || !this.s.reset.geladen || this.s.alleBeendet) return;
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
    // L3.2: Der Raum stammt von vor der Marke „Alle Sitzungen beendet“ – wie „Testraum leeren“: neuer Stand, neuer Lauf (die alten
    // Einträge zählen ohnehin nicht mehr, siehe gilt())
    const marke = this.s.reset.ts;
    const raum = this.rohTeams[DIREKT_TEAM];
    if (marke && raum && (raum.erstellt ?? 0) < marke) {
      await this.schreibe(async () => {
        // Stand = die Marke selbst (nicht „jetzt“): Einträge bis zur Marke zählen ohnehin nicht, der eigene Beitritt liegt danach
        await this.adapter.setzeTeam(DIREKT_TEAM, { ...this.direktKopf(), erstellt: marke });
        if (raum.lauf) await this.adapter.aendereTeam(DIREKT_TEAM, { lauf: neueLaufId() });
      });
    }
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
        // L3.3: Die neue Sitzung muss nach der Marke „Alle Sitzungen beendet“ liegen – auch wenn die Uhr dieses Rechners nachgeht
        const marke = await resetEinmal(a);
        const ok = await a.legeAn({ code, szenario: sz.id, version: sz.version, titel: sz.titel, erstellt: Math.max(Math.round(a.serverJetzt()), (marke ?? 0) + 1), von: name });
        if (ok) return a.sitzung;
      } finally {
        a.trennen();
      }
    }
    return null;
  }
}

/** L3: Marke „Alle Sitzungen beendet“ einmal lesen (höchstens `ms` warten; nicht lesbar oder keine Antwort = keine Marke). */
export function resetEinmal(a: SyncAdapter, ms = 3000): Promise<number | null> {
  return new Promise((ok) => {
    let ab: Abmelden | null = null;
    let fertig = false;
    const ende = (ts: number | null) => {
      if (fertig) return;
      fertig = true;
      clearTimeout(frist);
      queueMicrotask(() => ab?.());
      ok(ts);
    };
    const frist = setTimeout(() => ende(null), ms);
    ab = a.aufReset((ts) => ende(ts));
  });
}
