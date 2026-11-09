// Spiel: die Verbindung eines Fensters zum Spielstand EINES Teams.
//
// Seit 2.6 (Änderungen H1) gibt es zwei Arten:
//  • rechnen (Team-Laptop): Das Fenster führt den Host des Teams. Entscheidungen gehen ohne Netz an den Host, jedes Ereignis liegt
//    sofort in der Ablage dieses Rechners (src/sitzung/ablage.ts) und geht danach in Stücken ins Netz (Upload). Etwa alle 5 s eine
//    Statusmeldung an die Spielleitung. Fällt das Netz aus, spielt das Team weiter; der Upload holt nach, sobald es wieder geht.
//  • folgen (Spielleitung, Plenum): liest das hochgeladene Protokoll (mit Verzug) und schickt Aktionen über das Netz an den
//    Team-Laptop (Start, Pause, Reserve, Notiz).
// Welcher Lauf aktuell ist, sagt die Sitzung (teams/<team>/lauf); das Spiel folgt ihm.
import { Host } from "../engine/host";
import type { Inhalte } from "../inhalte/typen";
import type { Absender, Aktion, AktionsDaten, AktionsTyp, Ereignis } from "../kern/ereignisse";
import { teamStatus } from "../kern/uebersicht";
import { spielzeit } from "../kern/uhr";
import { type Spielzustand, anfangsZustand, anwenden } from "../kern/zustand";
import { type Abmelden, type TeamKanal, regelFehler } from "../sync/adapter";
import { type SpielAblage, keineAblage } from "./ablage";
import type { Hinweisgeber } from "./hinweise";

export interface UploadStand {
  /** so weit ist das Protokoll im Netz (seq) */
  hoch: number;
  /** letzter Fehler beim Hochladen (Netz weg, Regeln) */
  fehler?: string;
  /** Firebase-Regeln lehnen ab (alte Regeln, H1.5) */
  regeln?: boolean;
  /** ein anderes Fenster hat dieses Spiel weitergeführt – kein Upload mehr, nur noch Datei */
  fremd?: boolean;
}

export interface SpielStand {
  team: string;
  lauf: string | null;
  /** true, sobald das Protokoll des aktuellen Laufs geladen ist (oder es keinen Lauf gibt) */
  geladen: boolean;
  zustand: Spielzustand;
  protokoll: Ereignis[];
  /** gesendet, aber noch nicht im Protokoll (nur beim Folgen; beim Rechnen ist jede Aktion sofort verarbeitet) */
  offen: Record<string, Aktion>;
  /** dieses Fenster rechnet das Spiel (Team-Laptop) */
  rechnet: boolean;
  upload: UploadStand;
  /** Protokoll aus einer Datei geladen (Spielleitung, H1.3) – folgt dann nicht mehr dem Netz */
  ausDatei?: boolean;
}

export interface SpielOptionen {
  hinweise: Hinweisgeber;
  /** Absender der Host-Ereignisse (spiel_neu, erste Uhr) */
  hostAbsender: () => Absender;
  /** Ablage auf diesem Rechner (Team-Laptop); ohne: keine (lokaler Modus) */
  ablage?: SpielAblage;
  /** Kennung des Fensters (Statusmeldung) */
  client: string;
  /** Statusmeldung alle … ms (Standard 5000; 0 = keine) */
  statusMs?: number;
  /** Takt des Hosts in ms (Standard 250; 0 = Tests rufen takt() selbst) */
  taktMs?: number;
  /** Upload: höchstens so viele Ereignisse je Schreibvorgang, frühestens alle … ms */
  upload?: { stueck?: number; warteMs?: number };
}

/**
 * Höchstens so viele Ereignisse je Schreibvorgang. Ein Lauf hat 300–500 Ereignisse; bei 15 s Verzug (H1.6) dauert ein Schreibvorgang
 * hin und zurück 30 s – 100 je Stück holt auch einen Rückstand nach einer Trennung in wenigen Schritten auf (ca. 30 KB je Stück).
 */
const STUECK = 100;

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
  private ablage: SpielAblage;
  // Upload
  private hochTimer: ReturnType<typeof setTimeout> | null = null;
  private hochLaeuft = false;
  private hochWarte = 0;
  private statusTimer: ReturnType<typeof setInterval> | null = null;
  private statusLaeuft = false;
  private letzterStatus = "";

  constructor(
    readonly inh: Inhalte,
    readonly kanal: TeamKanal,
    private readonly opt: SpielOptionen,
  ) {
    this.ablage = opt.ablage ?? keineAblage;
    this.s = {
      team: kanal.team,
      lauf: null,
      geladen: false,
      zustand: anfangsZustand(inh),
      protokoll: [],
      offen: {},
      rechnet: false,
      upload: { hoch: 0 },
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

  /**
   * Schickt eine Aktion: Rechnet dieses Fenster das Spiel, geht sie direkt an den Host (sofort im Spielstand, ohne Netz), sonst
   * über das Netz an den Team-Laptop. Gibt die Kennung zurück.
   */
  senden<T extends AktionsTyp>(typ: T, daten: AktionsDaten[T], von: Absender): string | null {
    const lauf = this.s.lauf;
    if (!lauf) {
      this.opt.hinweise.hinweis("warnung", "Noch kein Spiel aktiv – die Spielleitung muss es öffnen.");
      return null;
    }
    const a = { id: this.kanal.neueId(), typ, von, ts: Math.round(this.kanal.serverJetzt()), daten } as Aktion;
    if (this.host) {
      this.host.aktion(a);
      return a.id;
    }
    if (this.s.ausDatei) {
      this.opt.hinweise.hinweis("warnung", "Protokoll aus einer Datei – hier wird nichts gesendet.");
      return null;
    }
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
    if (this.gestoppt || this.s.ausDatei || (lauf === this.s.lauf && (this.s.geladen || this.laufWechsel > 0))) return;
    void this.wechsleLauf(lauf);
  }

  private async wechsleLauf(lauf: string | null): Promise<void> {
    const nr = ++this.laufWechsel;
    this.protokollAbo?.();
    this.protokollAbo = null;
    this.hostStoppen();
    this.puffer.clear();
    this.aendern({ lauf, geladen: false, zustand: anfangsZustand(this.inh), protokoll: [], offen: {}, upload: { hoch: 0 } });
    if (!lauf) {
      this.aendern({ geladen: true });
      return;
    }
    // Team-Laptop: eigene Ablage und Netz vergleichen, das längere (gültige) Protokoll gewinnt
    const lokal = this.hostErlaubt ? this.ablage.lade(this.team, lauf) : [];
    let netz: Ereignis[] = [];
    try {
      netz = await this.ladeNetz(lauf, lokal.length > 0);
    } catch (e) {
      if (!lokal.length) this.opt.hinweise.hinweis("warnung", `Protokoll nicht geladen: ${(e as Error).message}`);
    }
    if (nr !== this.laufWechsel || this.gestoppt) return; // inzwischen anderer Lauf
    const gueltigNetz = this.gueltig(netz);
    const gemeinsam = this.gemeinsam(lokal, gueltigNetz);
    const basis = gueltigNetz.length > lokal.length && gemeinsam === lokal.length ? gueltigNetz : lokal.length ? lokal : gueltigNetz;
    let z = anfangsZustand(this.inh);
    for (const e of basis) z = anwenden(z, e, this.inh);
    // was im Netz schon steht (gleich wie hier), muss nicht noch einmal hoch
    const hoch = basis === gueltigNetz ? gueltigNetz.length : gemeinsam;
    if (basis === gueltigNetz && gueltigNetz.length > lokal.length) this.ablage.anhaengen(this.team, lauf, gueltigNetz.slice(lokal.length));
    const fremd = this.hostErlaubt && gueltigNetz.length > gemeinsam && basis === lokal && lokal.length > 0;
    this.aendern({ zustand: z, protokoll: basis, geladen: true, upload: { hoch, ...(fremd ? { fremd: true, fehler: "Im Netz steht ein anderer Spielstand" } : {}) } });
    this.pruefeSzenario(z);
    if (this.hostErlaubt) this.hostStarten();
    else this.folgen(lauf, z.seq);
  }

  /** Netzprotokoll laden; beim Team-Laptop mit eigener Ablage höchstens 8 s warten (Netz weg: mit der Ablage weiterspielen). */
  private ladeNetz(lauf: string, eilig: boolean): Promise<Ereignis[]> {
    const laden = this.kanal.ladeProtokoll(lauf);
    if (!eilig) return laden;
    return Promise.race([laden, new Promise<Ereignis[]>((_, nein) => setTimeout(() => nein(new Error("Netz antwortet nicht")), 8000))]);
  }

  private gueltig(liste: Ereignis[]): Ereignis[] {
    const out: Ereignis[] = [];
    for (const e of [...liste].sort((a, b) => a.seq - b.seq)) {
      if (e.seq !== out.length + 1) break;
      out.push(e);
    }
    return out;
  }

  /** Länge des gemeinsamen Anfangs zweier Protokolle (gleiche seq, typ, ts). */
  private gemeinsam(a: Ereignis[], b: Ereignis[]): number {
    let i = 0;
    while (i < a.length && i < b.length && a[i].seq === b[i].seq && a[i].typ === b[i].typ && a[i].ts === b[i].ts) i++;
    return i;
  }

  private folgen(lauf: string, abSeq: number): void {
    this.protokollAbo?.();
    this.protokollAbo = this.kanal.aufProtokoll(lauf, abSeq, (e) => this.empfange(e));
  }

  private empfange(e: Ereignis): void {
    if (this.host || !e || typeof e.seq !== "number" || e.seq <= this.s.zustand.seq) return;
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
          if (this.puffer.size && !this.gestoppt && !this.host) void this.wechsleLauf(this.s.lauf);
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
    this.aendern({ zustand: z, protokoll: [...this.s.protokoll, ...neu], offen, upload: { hoch: z.seq } });
  }

  private pruefeSzenario(z: Spielzustand): void {
    const sz = this.inh.szenario;
    if (z.szenario && (z.szenario !== sz.id || z.version !== sz.version)) {
      this.opt.hinweise.hinweis("warnung", `Lauf wurde mit ${z.szenario} v${z.version} gestartet, geladen ist ${sz.id} v${sz.version}.`);
    }
  }

  /**
   * Spielleitung (H1.3): Protokoll eines Teams aus einer Datei übernehmen, wenn der Upload nicht geklappt hat. Ist es länger als das
   * hochgeladene (und passt dazu), zeigt dieses Fenster es und lädt den Rest hoch, damit Plenum und zweite Spielleitung es auch haben.
   */
  async ausDatei(protokoll: Ereignis[], lauf: string | null): Promise<{ ok: boolean; text: string }> {
    const liste = this.gueltig(protokoll);
    if (!liste.length) return { ok: false, text: "Die Datei enthält kein Protokoll." };
    const da = this.s.protokoll;
    const gemeinsam = this.gemeinsam(da, liste);
    if (gemeinsam < da.length) return { ok: false, text: "Die Datei passt nicht zum hochgeladenen Protokoll dieses Teams (anderer Lauf?)." };
    if (liste.length === da.length) return { ok: true, text: "Das Protokoll ist schon vollständig da." };
    this.protokollAbo?.();
    this.protokollAbo = null;
    let z = anfangsZustand(this.inh);
    for (const e of liste) z = anwenden(z, e, this.inh);
    const zielLauf = lauf ?? this.s.lauf;
    this.aendern({ zustand: z, protokoll: liste, geladen: true, ausDatei: true, lauf: zielLauf, offen: {} });
    let text = `${liste.length - da.length} Ereignisse aus der Datei übernommen.`;
    if (zielLauf) {
      try {
        for (let i = gemeinsam; i < liste.length; i += 200) await this.kanal.schreibeEreignisse(zielLauf, liste.slice(i, i + 200));
        text += " Auch hochgeladen.";
      } catch (e) {
        text += ` Hochladen nicht möglich (${(e as Error).message}) – hier ist es trotzdem in der Auswertung.`;
      }
    }
    return { ok: true, text };
  }

  // ---------------------------------------------------------------- Host (Team-Laptop)

  /** Die Sitzung schaltet den Host ein (dieses Fenster rechnet das Spiel des Teams) oder aus. */
  setzeHost(ja: boolean): void {
    if (ja === this.hostErlaubt) return;
    this.hostErlaubt = ja;
    this.hostStoppen();
    // neu laden: der Team-Laptop braucht Ablage und Netz, das Folgen nur das Netz
    if (this.s.lauf && !this.gestoppt) void this.wechsleLauf(this.s.lauf);
  }

  private hostStarten(): void {
    if (!this.hostErlaubt || this.host || !this.s.lauf || !this.s.geladen || this.gestoppt) return;
    const lauf = this.s.lauf;
    const h = new Host(this.inh, this.kanal, lauf, this.s.protokoll, this.opt.hostAbsender(), {
      taktMs: this.opt.taktMs,
      ausgabe: (e) => this.lokalesEreignis(lauf, e),
    });
    this.host = h;
    this.aendern({ rechnet: true });
    h.starten();
    if (this.s.upload.hoch < this.s.zustand.seq) this.hochladenBald(0);
    const ms = this.opt.statusMs ?? 5000;
    if (ms > 0) {
      this.statusTimer = setInterval(() => void this.statusSenden(), ms);
      void this.statusSenden();
    }
  }

  private hostStoppen(): void {
    if (this.statusTimer) clearInterval(this.statusTimer);
    this.statusTimer = null;
    if (this.hochTimer) clearTimeout(this.hochTimer);
    this.hochTimer = null;
    if (!this.host) return;
    this.host.stoppen();
    this.host = null;
    this.aendern({ rechnet: false });
  }

  /** Für Tests und Anzeige: rechnet dieses Fenster gerade das Spiel dieses Teams? */
  get hostAktiv(): boolean {
    return !!this.host;
  }

  /** Tests: Zeitplan des Hosts von Hand weiterschalten. */
  takt(): void {
    this.host?.takt();
  }

  /** Neues Ereignis des eigenen Hosts: sofort im Spielstand und in der Ablage, dann (gebündelt) ins Netz. */
  private lokalesEreignis(lauf: string, e: Ereignis): void {
    if (this.gestoppt || lauf !== this.s.lauf) return;
    const z = anwenden(this.s.zustand, e, this.inh);
    this.ablage.anhaengen(this.team, lauf, [e]);
    if (e.typ === "aktion_abgelehnt" && e.von.rolle !== "sl") this.opt.hinweise.hinweis("warnung", `Nicht ausgeführt: ${e.daten.grund}`);
    this.aendern({ zustand: z, protokoll: [...this.s.protokoll, e] });
    // Spielende sofort hoch (vollständig), sonst gebündelt
    this.hochladenBald(e.typ === "spielende" ? 0 : this.opt.upload?.warteMs ?? (this.kanal.art === "lokal" ? 0 : 1000));
    if (e.typ === "spielende" || e.typ === "uhr") void this.statusSenden();
  }

  // ---------------------------------------------------------------- Upload und Status

  private hochladenBald(ms: number): void {
    if (this.gestoppt || !this.s.lauf || this.s.upload.fremd) return;
    if (this.hochLaeuft) return; // läuft gerade; nimmt danach den Rest mit
    if (this.hochTimer) {
      if (ms > 0) return;
      clearTimeout(this.hochTimer);
    }
    this.hochTimer = setTimeout(() => {
      this.hochTimer = null;
      void this.hochladen();
    }, ms);
  }

  private async hochladen(): Promise<void> {
    const lauf = this.s.lauf;
    if (!lauf || this.hochLaeuft || this.gestoppt || this.s.upload.fremd) return;
    this.hochLaeuft = true;
    try {
      const stueck = this.opt.upload?.stueck ?? STUECK;
      while (!this.gestoppt && lauf === this.s.lauf && this.s.upload.hoch < this.s.protokoll.length) {
        const teil = this.s.protokoll.slice(this.s.upload.hoch, this.s.upload.hoch + stueck);
        await this.kanal.schreibeEreignisse(lauf, teil);
        if (lauf !== this.s.lauf) return;
        this.hochWarte = 0;
        this.aendern({ upload: { hoch: teil[teil.length - 1].seq } });
      }
    } catch (e) {
      if (lauf !== this.s.lauf || this.gestoppt) return;
      const regeln = regelFehler(e);
      this.aendern({ upload: { ...this.s.upload, fehler: (e as Error).message, regeln } });
      // Netz weg oder seq schon belegt: nach einer Pause neu abgleichen, was im Netz steht, und weitermachen
      this.hochWarte = Math.min(30000, Math.max(2000, this.hochWarte * 2));
      setTimeout(() => void this.abgleichen(lauf), this.hochWarte);
    } finally {
      this.hochLaeuft = false;
    }
    if (!this.gestoppt && lauf === this.s.lauf && !this.s.upload.fehler && this.s.upload.hoch < this.s.protokoll.length) this.hochladenBald(0);
  }

  /** Nach einem Fehler: Was steht im Netz? Passt es zum eigenen Protokoll, geht es dort weiter; sonst kein Upload mehr. */
  private async abgleichen(lauf: string): Promise<void> {
    if (this.gestoppt || lauf !== this.s.lauf || !this.host) return;
    let netz: Ereignis[];
    try {
      netz = this.gueltig(await this.ladeNetz(lauf, true));
    } catch {
      this.hochWarte = Math.min(30000, Math.max(2000, this.hochWarte * 2));
      setTimeout(() => void this.abgleichen(lauf), this.hochWarte);
      return;
    }
    if (this.gestoppt || lauf !== this.s.lauf) return;
    const gemeinsam = this.gemeinsam(this.s.protokoll, netz);
    if (netz.length > gemeinsam) {
      this.aendern({ upload: { hoch: gemeinsam, fremd: true, fehler: "Im Netz steht ein anderer Spielstand" } });
      this.opt.hinweise.hinweis("fehler", "Ein anderes Fenster hat das Spiel dieses Teams weitergeführt. Bitte „Protokoll speichern“ und der Spielleitung geben.");
      return;
    }
    this.aendern({ upload: { hoch: gemeinsam } });
    void this.hochladen();
  }

  /** Statusmeldung an die Spielleitung (H1.2); nur bei Änderung oder alle 5 s als Lebenszeichen. */
  private async statusSenden(): Promise<void> {
    const lauf = this.s.lauf;
    if (!lauf || !this.host || this.statusLaeuft || this.gestoppt) return;
    const st = teamStatus(this.inh, this.s.zustand, this.kanal.serverJetzt(), { client: this.opt.client, lauf, hoch: this.s.upload.hoch });
    this.statusLaeuft = true;
    try {
      await this.kanal.schreibeStatus(st);
      this.letzterStatus = `${st.seq}|${st.hoch}`;
    } catch (e) {
      if (regelFehler(e) && !this.s.upload.regeln) this.aendern({ upload: { ...this.s.upload, regeln: true, fehler: (e as Error).message } });
    } finally {
      this.statusLaeuft = false;
    }
  }

  /** Für Tests: letzter gesendeter Status (seq|hoch). */
  get statusGesendet(): string {
    return this.letzterStatus;
  }
}
