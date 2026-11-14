// Spiel: die Verbindung eines Fensters zum Spielstand EINES Teams.
//
// Seit 2.6 (Änderungen H1) gibt es zwei Arten:
//  • rechnen (Team-Laptop): Das Fenster führt den Host des Teams. Entscheidungen gehen ohne Netz an den Host, jedes Ereignis liegt
//    sofort in der Ablage dieses Rechners (src/sitzung/ablage.ts) und geht danach in Stücken ins Netz (Upload). Etwa alle 5 s eine
//    Statusmeldung an die Spielleitung. Fällt das Netz aus, spielt das Team weiter; der Upload holt nach, sobald es wieder geht.
//  • folgen (Spielleitung, Plenum): liest das hochgeladene Protokoll (mit Verzug) und schickt Aktionen über das Netz an den
//    Team-Laptop (Start, Pause, Reserve, Notiz).
// Welcher Lauf aktuell ist, sagt die Sitzung (teams/<team>/lauf); das Spiel folgt ihm.
//
// Seit Liste K (11.11.2026):
//  • Eine gesendete Aktion der Spielleitung gilt höchstens 10 s als „gesendet …“ (K3.1). Danach meldet das Spiel sie als überfällig
//    (Hinweis „Team … antwortet nicht“); sie bleibt im Kanal des Teams und wird ausgeführt, sobald der Laptop wieder rechnet (K3.2).
//  • Die Spielleitung liest den Kanal der Aktionen mit: Was dort steht und noch nicht im Protokoll ist, steht aus – auch nach
//    Neuladen und für die zweite Spielleitung („Start wartet auf Laptop“).
//  • abschliessen(): Host anhalten und den Rest hochladen (Team verlassen, Sitzung beendet).
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
  /**
   * Liste L (L2.4): Der Lauf hat zwei Verläufe, die sich nicht zusammenführen lassen – im Netz stehen hinter einer Lücke Einträge
   * eines anderen Fensters. Der Team-Laptop kann nicht hochladen (und spielt weiter), die Spielleitung kann nicht folgen. Abhilfe:
   * „Neues Spiel“.
   */
  zwei?: boolean;
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
  /** gesendete Aktionen, die nach 10 s noch nicht im Protokoll stehen (K3.1) – kein „gesendet …“ mehr, sie stehen aber noch aus */
  ueberfaellig: Record<string, true>;
  /** Aktionen im Kanal des Teams, die noch nicht im Protokoll stehen (nur beim Folgen mit `aktionenLesen`, K3.2) */
  ausstehend: Aktion[];
  /** abgeschlossen (Team verlassen, Sitzung beendet): rechnet nicht mehr */
  abgeschlossen?: boolean;
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
  /** K3.1: so lange gilt eine gesendete Aktion als „gesendet …“ (Standard 10 000 ms) */
  zeitlimitMs?: number;
  /** K3.1: eine gesendete Aktion ist nach dem Zeitlimit nicht im Protokoll – die Sitzung meldet es mit Teamnamen */
  beiUeberfaellig?: (a: Aktion) => void;
  /** K3.2: beim Folgen den Kanal der Aktionen mitlesen (Spielleitung) */
  aktionenLesen?: boolean;
}

/** L2.4: Text für Team-Fenster und Spielleitung. */
export const ZWEI_TEXT = "Lauf hat zwei Verläufe – Neues Spiel empfohlen.";

/** K3.1: Kein Knopf der Spielleitung bleibt länger als 10 s auf „gesendet …“. */
export const ZEITLIMIT_MS = 10000;

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
  // K3: Zeitlimit je gesendeter Aktion, mitgelesene Aktionen des Kanals
  private fristen = new Map<string, ReturnType<typeof setTimeout>>();
  private aktionenAbo: Abmelden | null = null;
  private imKanal = new Map<string, Aktion>();
  private abschluss = false;

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
      ueberfaellig: {},
      ausstehend: [],
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
    this.aktionenAbo?.();
    this.aktionenAbo = null;
    this.fristen.forEach(clearTimeout);
    this.fristen.clear();
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
    this.ausstehendNeu();
    // K3.1: höchstens 10 s „gesendet …“ – danach überfällig (die Aktion bleibt im Kanal und wird später ausgeführt, K3.2)
    this.fristen.set(a.id, setTimeout(() => {
      this.fristen.delete(a.id);
      if (this.gestoppt || !this.s.offen[a.id]) return;
      this.aendern({ ueberfaellig: { ...this.s.ueberfaellig, [a.id]: true } });
      this.opt.beiUeberfaellig?.(a);
    }, this.opt.zeitlimitMs ?? ZEITLIMIT_MS));
    this.kanal.sendeAktion(lauf, a).catch((e: Error) => {
      const { [a.id]: _weg, ...rest } = this.s.offen;
      this.fristAus(a.id);
      this.imKanal.delete(a.id);
      this.aendern({ offen: rest });
      this.ausstehendNeu();
      this.opt.hinweise.hinweis("fehler", `Senden fehlgeschlagen: ${e.message}`);
    });
    return a.id;
  }

  private fristAus(id: string): void {
    const t = this.fristen.get(id);
    if (t) clearTimeout(t);
    this.fristen.delete(id);
  }

  /**
   * Ist eine Aktion dieses Typs (optional zu dieser Meldung/diesem Inject) noch unterwegs? Höchstens 10 s nach dem Senden (K3.1) –
   * danach zeigt kein Knopf mehr „gesendet …“; ob sie noch aussteht, sagt `ausstehend`.
   */
  wartetAuf(typ: AktionsTyp, bezug?: string): boolean {
    return Object.values(this.s.offen).some((a) => {
      if (a.typ !== typ || this.s.ueberfaellig[a.id]) return false;
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
    if (lauf !== this.s.lauf) this.zweiGemeldet = false;
    this.protokollAbo?.();
    this.protokollAbo = null;
    this.hostStoppen();
    this.puffer.clear();
    this.hochGrenze = Infinity;
    this.aktionenAbo?.();
    this.aktionenAbo = null;
    this.imKanal.clear();
    this.fristen.forEach(clearTimeout);
    this.fristen.clear();
    this.aendern({ lauf, geladen: false, zustand: anfangsZustand(this.inh), protokoll: [], offen: {}, upload: { hoch: 0 }, ueberfaellig: {}, ausstehend: [] });
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

    // Liste K (K2.2): Steht im Netz ein anderer Spielstand (ein anderer Laptop hat weitergeführt), übernimmt ihn der Laptop, der
    // jetzt rechnet – das Netz ist nur zum Anhängen, sonst käme er mit seinem Stand nie wieder hinein.
    const anders = lokal.length > gemeinsam && gueltigNetz.length > gemeinsam;
    const basis = anders || (gueltigNetz.length > lokal.length && gemeinsam === lokal.length) ? gueltigNetz : lokal.length ? lokal : gueltigNetz;
    let z = anfangsZustand(this.inh);
    for (const e of basis) z = anwenden(z, e, this.inh);
    // was im Netz schon steht (gleich wie hier), muss nicht noch einmal hoch
    const hoch = basis === gueltigNetz ? gueltigNetz.length : gemeinsam;
    if (anders) this.ablage.ersetze(this.team, lauf, gueltigNetz);
    else if (basis === gueltigNetz && gueltigNetz.length > lokal.length) this.ablage.anhaengen(this.team, lauf, gueltigNetz.slice(lokal.length));
    // Liste L (L2.4): Der Team-Laptop hat Einträge an Plätzen, die im Netz hinter einer Lücke schon ein anderes Fenster belegt hat –
    // zwei Verläufe, die niemand zusammenführen kann (weder hochladen noch übernehmen)
    const luecke = this.hostErlaubt ? this.hinterLuecke(netz, gueltigNetz.length, basis) : null;
    const zwei = !!luecke?.kollidiert;
    this.hochGrenze = luecke && !zwei ? luecke.ab - 1 : Infinity;
    this.aendern({ zustand: z, protokoll: basis, geladen: true, upload: zwei ? { hoch, zwei: true, fehler: ZWEI_TEXT } : { hoch } });
    if (zwei) this.meldeZwei();
    this.pruefeSzenario(z);
    if (this.hostErlaubt && !this.abschluss) this.hostStarten();
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

  /**
   * L2.4: Stehen im Netz Einträge hinter einer Lücke (seq größer als das lückenlose Stück)? `ab`: erster solcher Platz;
   * `kollidiert`: das eigene Protokoll hat an einem dieser Plätze schon einen ANDEREN Eintrag – dann gibt es zwei Verläufe. Sonst
   * (das eigene Protokoll ist noch nicht so weit) lädt der Laptop bis vor die Lücke hoch; erreicht er den Platz, greift K Festlegung 4.
   */
  private hinterLuecke(roh: Ereignis[], lueckenlos: number, eigen: Ereignis[]): { ab: number; kollidiert: boolean } | null {
    const fremd = roh.filter((e) => typeof e?.seq === "number" && e.seq > lueckenlos);
    if (!fremd.length) return null;
    const kollidiert = fremd.some((e) => {
      const l = eigen[e.seq - 1];
      return !!l && !(l.typ === e.typ && l.ts === e.ts);
    });
    return { ab: Math.min(...fremd.map((e) => e.seq)), kollidiert };
  }

  /** L2.4: nur bis vor diesen Platz hochladen (dahinter stehen im Netz Einträge eines anderen Fensters) */
  private hochGrenze = Infinity;

  private zweiGemeldet = false;
  private meldeZwei(): void {
    if (this.zweiGemeldet) return;
    this.zweiGemeldet = true;
    this.opt.hinweise.hinweis("fehler", this.hostErlaubt
      ? `${ZWEI_TEXT} Dieser Laptop spielt weiter, kann aber nicht hochladen – Protokoll mit „⇩ Protokoll“ sichern.`
      : ZWEI_TEXT);
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
    // K3.2: Spielleitung liest die Aktionen des Laufs mit – was noch nicht im Protokoll steht, steht aus
    if (this.opt.aktionenLesen && !this.aktionenAbo) {
      this.aktionenAbo = this.kanal.aufAktionen(lauf, (a) => {
        if (!a?.id || this.imKanal.has(a.id) || lauf !== this.s.lauf) return;
        this.imKanal.set(a.id, a);
        this.ausstehendNeu();
      });
    }
  }

  /** Aktionen im Kanal (und eigene gesendete), die noch nicht im Protokoll stehen – in der Reihenfolge des Sendens. */
  private ausstehendNeu(z: Spielzustand = this.s.zustand, melden = true): Aktion[] {
    const alle = new Map<string, Aktion>([...this.imKanal, ...Object.entries(this.s.offen)]);
    const liste = [...alle.values()].filter((a) => z.aktionen[a.id] === undefined).sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0) || (a.id < b.id ? -1 : 1));
    const gleich = liste.length === this.s.ausstehend.length && liste.every((a, i) => a.id === this.s.ausstehend[i].id);
    if (!gleich && melden) this.aendern({ ausstehend: liste });
    return gleich ? this.s.ausstehend : liste;
  }

  /**
   * K3.2: Was die Spielleitung zuletzt für die Uhr dieses Teams wollte und was noch nicht ausgeführt ist („Start wartet auf
   * Laptop“): der letzte ausstehende Start- oder Pause-Befehl, sonst null.
   */
  ausstehendeUhr(): "start" | "pause" | null {
    for (let i = this.s.ausstehend.length - 1; i >= 0; i--) {
      const a = this.s.ausstehend[i];
      const b = a.typ === "uhr" ? (a.daten as { befehl?: string }).befehl : undefined;
      if (b === "start" || b === "pause") return b;
    }
    return null;
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
    let ueberfaellig = this.s.ueberfaellig;
    for (const n of neu) {
      if (n.aktion && offen[n.aktion]) {
        const { [n.aktion]: _erledigt, ...rest } = offen;
        offen = rest;
        this.fristAus(n.aktion);
        if (ueberfaellig[n.aktion]) {
          const { [n.aktion]: _spaet, ...uebrig } = ueberfaellig;
          ueberfaellig = uebrig;
        }
        if (n.typ === "aktion_abgelehnt") this.opt.hinweise.hinweis("warnung", `Nicht ausgeführt: ${n.daten.grund}`);
      }
    }
    this.s = { ...this.s, offen };
    this.aendern({ zustand: z, protokoll: [...this.s.protokoll, ...neu], offen, ueberfaellig, ausstehend: this.ausstehendNeu(z, false), upload: { hoch: z.seq } });
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
    if (!this.hostErlaubt || this.host || !this.s.lauf || !this.s.geladen || this.gestoppt || this.abschluss) return;
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

  /**
   * Abschließen (K4.1 Sitzung beendet, K4.2 Team verlassen): Host anhalten – ab jetzt entsteht hier kein Ereignis mehr – und den Rest
   * des Protokolls hochladen (höchstens `ms` warten). true, wenn alles im Netz ist.
   */
  async abschliessen(ms = 4000): Promise<boolean> {
    const war = !!this.host;
    const lauf = this.s.lauf;
    this.abschluss = true;
    // letzter Stand für die Spielleitung, dann sofort anhalten (kein Ereignis mehr nach diesem Aufruf)
    const st = war && lauf ? teamStatus(this.inh, this.s.zustand, this.kanal.serverJetzt(), { client: this.opt.client, lauf, hoch: this.s.upload.hoch }) : null;
    this.hostStoppen();
    this.aendern({ abgeschlossen: true });
    if (st) void this.kanal.schreibeStatus(st).catch(() => {});
    if (!war || !lauf) return true;
    const fertig = () => this.s.upload.hoch >= this.s.protokoll.length;
    if (!fertig() && !this.s.upload.fremd && !this.s.upload.zwei) void this.hochladen();
    const ende = Date.now() + ms;
    while (!fertig() && Date.now() < ende && !this.gestoppt && !this.s.upload.fremd && !this.s.upload.zwei) await new Promise((r) => setTimeout(r, 50));
    return fertig();
  }

  /** Abschluss zurücknehmen (Team verlassen ging nicht): wieder rechnen, wenn dieses Fenster der Team-Laptop ist. */
  wiederAufnehmen(): void {
    if (!this.abschluss || this.gestoppt) return;
    this.abschluss = false;
    this.aendern({ abgeschlossen: false });
    if (this.hostErlaubt && this.s.lauf) void this.wechsleLauf(this.s.lauf);
  }

  /**
   * Protokoll dieses Rechners aus der Ablage, wenn es von dem abweicht, was dieses Fenster gerade zeigt (K2.2: Ein anderer Laptop
   * führt das Spiel weiter – das eigene Protokoll bleibt als Datei greifbar). Sonst null.
   */
  eigenesProtokoll(): Ereignis[] | null {
    const lauf = this.s.lauf;
    if (!lauf || this.host) return null;
    const lokal = this.ablage.lade(this.team, lauf);
    if (!lokal.length) return null;
    const gemeinsam = this.gemeinsam(lokal, this.s.protokoll);
    return gemeinsam === lokal.length ? null : lokal;
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
    if (this.gestoppt || !this.s.lauf || this.s.upload.fremd || this.s.upload.zwei) return;
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
    if (!lauf || this.hochLaeuft || this.gestoppt || this.s.upload.fremd || this.s.upload.zwei) return;
    this.hochLaeuft = true;
    try {
      const stueck = this.opt.upload?.stueck ?? STUECK;
      while (!this.gestoppt && lauf === this.s.lauf && this.s.upload.hoch < Math.min(this.s.protokoll.length, this.hochGrenze)) {
        const teil = this.s.protokoll.slice(this.s.upload.hoch, Math.min(this.s.upload.hoch + stueck, this.hochGrenze));
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
    if (this.gestoppt || lauf !== this.s.lauf || this.s.upload.fehler) return;
    if (this.s.upload.hoch >= this.hochGrenze && this.s.protokoll.length > this.hochGrenze) {
      // L2.4: Das eigene Protokoll hat den Platz erreicht, den im Netz ein anderes Fenster belegt – neu abgleichen (K Festlegung 4)
      this.hochGrenze = Infinity;
      void this.abgleichen(lauf);
    } else if (this.s.upload.hoch < Math.min(this.s.protokoll.length, this.hochGrenze)) this.hochladenBald(0);
  }

  /** Nach einem Fehler: Was steht im Netz? Passt es zum eigenen Protokoll, geht es dort weiter; sonst kein Upload mehr. */
  private async abgleichen(lauf: string): Promise<void> {
    if (this.gestoppt || lauf !== this.s.lauf || !this.host) return;
    let netz: Ereignis[];
    let roh: Ereignis[];
    try {
      roh = await this.ladeNetz(lauf, true);
      netz = this.gueltig(roh);
    } catch {
      this.hochWarte = Math.min(30000, Math.max(2000, this.hochWarte * 2));
      setTimeout(() => void this.abgleichen(lauf), this.hochWarte);
      return;
    }
    if (this.gestoppt || lauf !== this.s.lauf) return;
    const gemeinsam = this.gemeinsam(this.s.protokoll, netz);
    if (netz.length > gemeinsam) {
      // Liste K (K2.2): Im Netz steht ein anderer Spielstand – der vorige Laptop hat beim Wiederverbinden noch hochgeladen. Dieser
      // Laptop rechnet jetzt für das Team: Er übernimmt, was im Netz steht (nur anhängen möglich), und rechnet ab dort weiter.
      this.opt.hinweise.hinweis("warnung", "Im Netz steht ein anderer Spielstand dieses Teams (der vorige Laptop hat noch hochgeladen). Dieser Laptop übernimmt ihn und rechnet ab dort weiter.");
      this.ablage.ersetze(this.team, lauf, netz);
      this.hochWarte = 0;
      void this.wechsleLauf(lauf);
      return;
    }
    const luecke = this.hinterLuecke(roh, netz.length, this.s.protokoll);
    if (luecke?.kollidiert) {
      // Liste L (L2.4): Hinter einer Lücke stehen Einträge eines anderen Fensters, und dieser Laptop hat dieselben Plätze schon anders
      // belegt. Übernehmen geht nicht (kein lückenloser Stand), hochladen auch nicht (ein Stück ist ganz oder gar nicht) – bis
      // Stand K versuchte er es endlos („Upload hängt bei 10 von 122“). Jetzt: sagen, was los ist.
      this.aendern({ upload: { hoch: gemeinsam, zwei: true, fehler: ZWEI_TEXT } });
      this.meldeZwei();
      return;
    }
    this.hochGrenze = luecke ? luecke.ab - 1 : Infinity;
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
