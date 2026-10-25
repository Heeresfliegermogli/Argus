// Ablauf des Lasttests: eine echte Sitzung in der Firebase-Datenbank mit n Teams à 3 Bot-Spielern und einem Host
// (Spielleitung), optional dazu Plenum und eine zweite Spielleitung, die nur zusehen. Jeder Teilnehmer ist eine
// eigene Sitzung der App (src/sitzung/sitzung.ts) mit eigener Firebase-Verbindung – Lobby, Anwesenheit, Teams,
// Host für alle Teams, Protokolle laufen genau wie in den Fenstern im Hörsaal; es fehlt nur die Oberfläche.
//
//   1. Plan: die Modellteams spielen einmal ohne Netz durch (plan.ts).
//   2. Sitzung anlegen (neuer Code), Host verbindet sich und übernimmt die Steuerung.
//   3. Bots verbinden sich; je Team legt G1 das Team an, G2 und G3 treten bei (wie in der Lobby).
//   4. Spiel öffnen – alle Teams, Tempo setzen, Uhr starten – alle.
//   5. Jeder Bot schickt die Aktionen seiner Rolle zur geplanten Spielzeit (wie tools/e2e_drehbuch.py: erst wenn die
//      Meldung bei ihm ist und seine vorige Aktion bestätigt), die Spielleitung spielt die Verstärkungen ein.
//   6. Spielende → Abschluss (Stand je Fenster, Ausgang wie ohne Netz?) → Verbindungen trennen.
//
// Verteilt auf mehrere Geräte (falls ein Browser nicht alle Verbindungen gleichzeitig offen hält): Ein Gerät legt die
// Sitzung an und führt den Host (host: true), weitere Geräte treten mit dem Code bei (code) und spielen nur die Bots
// ihrer Teams (hier). Jedes Gerät misst seine eigenen Bots; der Host wartet, bis alle Teams voll sind.
import { FIREBASE_DB } from "../../src/config";
import { forceWebSockets } from "firebase/database";
import { ladeInhalte } from "../../src/inhalte/laden";
import type { Inhalte } from "../../src/inhalte/typen";
import { type AktionsDaten, type AktionsTyp, zufall } from "../../src/kern/ereignisse";
import { type GruppenRolle, GRUPPEN_ROLLEN, codeNormalisieren, neuerCode } from "../../src/kern/sitzungen";
import { type Spielzustand, fingerabdruck } from "../../src/kern/zustand";
import type { Spiel } from "../../src/sitzung/spiel";
import { Sitzung } from "../../src/sitzung/sitzung";
import { sitzungVorhanden } from "../../src/sync/fabrik";
import { FirebaseAdapter, type FirebaseEinstellungen } from "../../src/sync/firebase";
import { MessAdapter, Messung, type VerbindungsArt } from "./messung";
import { type PlanAktion, type TeamPlan, erstellePlan } from "./plan";

export interface LastOptionen {
  db: string;
  transport: "lp" | "auto";
  tempo: number;
  /** Teams in der Sitzung (gesamt) */
  teams: number;
  /** Team-Nummern (1…teams), deren Bots auf diesem Gerät laufen */
  hier: number[];
  /** dieses Gerät legt die Sitzung an und führt den Host */
  host: boolean;
  /** Gerät ohne Host: Code der Sitzung, der es beitritt */
  code: string | null;
  /** Plenum und zweite Spielleitung verbinden sich zusätzlich (sehen nur zu; nur mit Host) */
  beobachter: boolean;
}

export const STANDARD_OPTIONEN: LastOptionen = {
  db: FIREBASE_DB, transport: "lp", tempo: 5, teams: 5, hier: [1, 2, 3, 4, 5], host: true, code: null, beobachter: false,
};

export type Phase = "bereit" | "vorbereiten" | "laeuft" | "abschluss" | "ende" | "abgebrochen" | "fehler";

export interface Bot {
  nr: number;
  rolle: GruppenRolle;
  kennung: string;
  name: string;
  sitzung: Sitzung;
  plan: PlanAktion[];
  i: number;
  fehler: string[];
}

export interface TeamStand {
  seq: number;
  spielzeit: number;
  ende: boolean;
}

export interface TeamAbschluss {
  nr: number;
  name: string;
  seq: number;
  ende: boolean;
  /** die drei Bot-Fenster mit demselben Stand (seq, Fingerabdruck) wie der Host bzw. untereinander; null = Bots nicht hier */
  fensterGleich: boolean | null;
  /** Restbestand und zerstörte Fahrzeuge wie beim Durchlauf ohne Netz */
  ausgangGleich: boolean;
  abgelehnt: string[];
}

export interface Hinweis {
  /** Sekunden seit Start */
  t: number;
  wer: string;
  art: "info" | "warnung" | "fehler";
  text: string;
}

const SOLL: Partial<Record<AktionsTyp, string>> = { g1_entscheid: "g1", g2_empfehlung: "g2", g3_entscheid: "g3" };

class Abbruch extends Error {}

export function teamName(p: Pick<TeamPlan, "nr" | "modell" | "einspielen">): string {
  const v = Object.keys(p.einspielen).length;
  return `Last ${p.nr} · ${p.modell}${v ? ` +${v}V` : ""}`;
}

export class Lasttest {
  phase: Phase = "bereit";
  status = "";
  readonly fehler: string[] = [];
  readonly hinweise: Hinweis[] = [];
  readonly mess = new Messung();
  inh: Inhalte | null = null;
  /** Plan aller Teams der Sitzung */
  plan: TeamPlan[] = [];
  code: string | null = null;
  host: Sitzung | null = null;
  bots: Bot[] = [];
  beobachter: Sitzung[] = [];
  /** Team-Kennung je Team-Nummer − 1 ("" = noch unbekannt) */
  teamIds: string[] = [];
  teamNamen: string[] = [];
  abschluss: TeamAbschluss[] = [];
  /** HTTP-Protokoll je Anfrage der Long-Polling-Verbindungen (best effort, aus Resource Timing) */
  readonly protokolle = new Map<string, string>();
  beginn: Date | null = null;
  /** performance.now() beim Start der Uhren und bei Spielende */
  tUhrStart: number | null = null;
  tSpielende: number | null = null;
  /** Dauer bis alle Verbindungen standen (s) */
  verbindungsaufbauS: number | null = null;
  private tBeginn = 0;
  private slPlaene: { nr: number; i: number; aktionen: PlanAktion[] }[] = [];
  private abgebrochen = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private protokollTimer: ReturnType<typeof setInterval> | null = null;
  private hoerer = new Set<() => void>();
  private wachhalter: { release(): Promise<void> } | null = null;
  private letzterStand = new Map<number, TeamStand>();
  private letztesTempo: number | null = null;

  constructor(readonly opt: LastOptionen) {}

  abonnieren(cb: () => void): () => void {
    this.hoerer.add(cb);
    return () => this.hoerer.delete(cb);
  }

  private melden(): void {
    this.hoerer.forEach((cb) => cb());
  }

  private setze(phase: Phase, status: string): void {
    this.phase = phase;
    this.status = status;
    this.melden();
  }

  /** Teams, deren Bots auf diesem Gerät laufen */
  get lokal(): TeamPlan[] {
    return this.plan.filter((p) => this.opt.hier.includes(p.nr));
  }

  /** Teams, die dieses Gerät anzeigt: mit Host alle, sonst die eigenen */
  get sichtbar(): TeamPlan[] {
    return this.opt.host ? this.plan : this.lokal;
  }

  /** Sekunden seit dem Start des Lasttests */
  sekunden(): number {
    return this.beginn ? (performance.now() - this.tBeginn) / 1000 : 0;
  }

  /** Spiel eines Teams aus Sicht dieses Geräts: beim Host dessen Spiel, sonst das des ersten eigenen Bots. */
  private spielVon(nr: number): Spiel | null {
    const id = this.teamIds[nr - 1];
    if (!id) return null;
    if (this.host) return this.host.spiel(id);
    return this.bots.find((b) => b.nr === nr)?.sitzung.spiel(id) ?? null;
  }

  /** Stand eines Teams (während des Laufs live, danach der letzte bekannte). */
  teamStand(nr: number): TeamStand {
    const sp = this.spielVon(nr);
    if (sp?.stand.lauf) {
      const dauer = this.inh?.szenario.spieluhr.dauer_s ?? 1500;
      const s = { seq: sp.stand.zustand.seq, spielzeit: Math.min(dauer, sp.spielzeit()), ende: sp.stand.zustand.ende };
      this.letzterStand.set(nr, s);
      return s;
    }
    return this.letzterStand.get(nr) ?? { seq: 0, spielzeit: 0, ende: false };
  }

  /** Spielzeit (erstes angezeigtes Team) */
  spielzeit(): number {
    const p = this.sichtbar[0];
    return p ? this.teamStand(p.nr).spielzeit : 0;
  }

  /** Tempo der Spieluhr (auf Geräten ohne Host stellt es das Host-Gerät ein) */
  tempoIst(): number {
    const p = this.sichtbar[0];
    const sp = p ? this.spielVon(p.nr) : null;
    if (sp?.stand.lauf) this.letztesTempo = sp.stand.zustand.uhr.tempo;
    return this.opt.host ? this.opt.tempo : this.letztesTempo ?? this.opt.tempo;
  }

  get verbindungen(): number {
    return this.mess.verbindungen.size;
  }

  private cfg(): FirebaseEinstellungen {
    return { databaseURL: this.opt.db, transport: this.opt.transport };
  }

  private adapter(sitzung: string, kennung: string, art: VerbindungsArt, name: string, extra: { teamNr?: number; rolle?: string } = {}): MessAdapter {
    this.mess.anmelden({ kennung, art, name, ...extra });
    return new MessAdapter(sitzung, this.cfg(), this.mess, kennung);
  }

  private beobachteHinweise(s: Sitzung, wer: string): void {
    const orig = s.hinweise.hinweis.bind(s.hinweise);
    s.hinweise.hinweis = (art, text) => {
      this.hinweise.push({ t: Math.round(this.sekunden()), wer, art, text });
      if (this.hinweise.length > 300) this.hinweise.splice(0, this.hinweise.length - 300);
      orig(art, text);
    };
  }

  private async bis(bedingung: () => boolean, sek: number, text: string): Promise<void> {
    const ende = performance.now() + sek * 1000;
    while (!bedingung()) {
      if (this.abgebrochen) throw new Abbruch("abgebrochen");
      if (performance.now() > ende) throw new Error(`${text} – nicht erreicht nach ${sek} s`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  /** Wartet auf ein Versprechen, höchstens sek Sekunden; Abbrechen beendet das Warten sofort. */
  private async frist<T>(p: Promise<T>, sek: number, text: string): Promise<T> {
    let timer: ReturnType<typeof setInterval> | null = null;
    const ende = performance.now() + sek * 1000;
    const wache = new Promise<never>((_, nein) => {
      timer = setInterval(() => {
        if (this.abgebrochen) nein(new Abbruch("abgebrochen"));
        else if (performance.now() > ende) nein(new Error(`${text} – keine Antwort nach ${sek} s (Datenbank erreichbar?)`));
      }, 100);
    });
    try {
      return await Promise.race([p, wache]);
    } finally {
      if (timer) clearInterval(timer);
    }
  }

  private alleSitzungen(): Sitzung[] {
    return [...this.bots.map((b) => b.sitzung), ...this.beobachter, ...(this.host ? [this.host] : [])];
  }

  // ---------------------------------------------------------------- Start

  async starten(): Promise<void> {
    this.beginn = new Date();
    this.tBeginn = performance.now();
    this.mess.starteSeitenMessung();
    this.protokollTimer = setInterval(() => this.protokolleSammeln(), 3000);
    try {
      this.wachhalter = await (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } })
        .wakeLock?.request("screen") ?? null;
    } catch {
      /* ohne Schutz vor Bildschirmsperre weiter */
    }
    try {
      await this.vorbereiten();
      await this.spielen();
    } catch (e) {
      if (e instanceof Abbruch) {
        this.setze("abgebrochen", "Abgebrochen");
      } else {
        this.fehler.push((e as Error).message);
        this.setze("fehler", (e as Error).message);
      }
      this.aufraeumen();
    }
  }

  abbrechen(): void {
    if (this.phase === "ende" || this.phase === "fehler" || this.phase === "abgebrochen" || this.phase === "abschluss") return;
    this.abgebrochen = true;
    if (this.phase === "laeuft") {
      this.fehler.push("Vom Benutzer abgebrochen");
      this.beenden("abgebrochen");
    }
  }

  private async vorbereiten(): Promise<void> {
    this.setze("vorbereiten", "Inhalte laden …");
    this.inh = await ladeInhalte();
    const inh = this.inh;
    this.setze("vorbereiten", "Modellteams ohne Netz durchspielen (Plan) …");
    await new Promise((r) => setTimeout(r, 30));
    this.plan = erstellePlan(inh, this.opt.teams);
    this.teamNamen = this.plan.map(teamName);
    this.teamIds = this.plan.map(() => "");

    if (this.opt.transport === "auto") {
      // „automatisch“ heißt hier: nur WebSocket. Mit vielen gleichzeitig startenden Verbindungen in einer Seite setzt
      // das SDK sonst die Marke „WebSocket fehlgeschlagen“ (jede Verbindung nimmt beim Öffnen erst einmal Fehler an)
      // und lässt andere Verbindungen mit Long-Polling beginnen – gegen die Nachbildung (nur WebSocket) hängen sie dann.
      forceWebSockets();
      try {
        localStorage.removeItem("firebase:previous_websocket_failure");
      } catch {
        /* egal */
      }
    }

    if (this.opt.host) {
      this.setze("vorbereiten", "Sitzung anlegen …");
      const s = await this.frist(Sitzung.anlegen(inh, (x) => new FirebaseAdapter(x, this.cfg()), "Lasttest", neuerCode), 45, "Sitzung anlegen");
      if (!s) throw new Error("Sitzung konnte nicht angelegt werden (Datenbank erreichbar? Regeln?)");
      this.code = s;
    } else {
      const s = codeNormalisieren(this.opt.code ?? "");
      if (!s) throw new Error("Bitte den Code der Sitzung vom Host-Gerät eingeben");
      this.setze("vorbereiten", `Sitzung ${s.toUpperCase()} suchen …`);
      const da = await sitzungVorhanden({ sync: "firebase", db: this.opt.db, transport: this.opt.transport }, s, 20000);
      if (da !== "da") throw new Error(da === "fehlt" ? `Sitzung ${s.toUpperCase()} gibt es nicht` : "Datenbank antwortet nicht");
      this.code = s;
    }
    const code = this.code;

    const tVerbinden = performance.now();
    if (this.opt.host) {
      this.setze("vorbereiten", `Sitzung ${code.toUpperCase()}: Host verbindet sich …`);
      const hostId = zufall(6);
      this.host = new Sitzung(inh, this.adapter(code, hostId, "host", "Host (SL 1)"), { art: "sl", client: hostId, name: "Lasttest SL" });
      this.beobachteHinweise(this.host, "Host");
      await this.host.starten();
      await this.bis(() => !!this.host?.stand.istHost, 40, "Host übernimmt die Steuerung");
    }

    const lokal = this.lokal;
    if (lokal.length) {
      this.setze("vorbereiten", `${lokal.length * 3} Bots verbinden sich …`);
      for (const p of lokal) {
        for (const rolle of GRUPPEN_ROLLEN) {
          const kennung = zufall(6);
          const name = `Bot ${rolle.toUpperCase()}-${p.nr}`;
          const s = new Sitzung(inh, this.adapter(code, kennung, "bot", name, { teamNr: p.nr, rolle }), { art: "tt", client: kennung, name });
          this.beobachteHinweise(s, name);
          this.bots.push({ nr: p.nr, rolle, kennung, name, sitzung: s, plan: p.aktionen.filter((a) => a.rolle === rolle), i: 0, fehler: [] });
        }
      }
      await Promise.all(this.bots.map((b) => b.sitzung.starten()));
      await this.bis(() => this.bots.every((b) => b.sitzung.stand.verbindung.verbunden && b.sitzung.stand.teamsGeladen), 90,
        "Alle Bots verbunden");
      this.verbindungsaufbauS = (performance.now() - tVerbinden) / 1000;

      this.setze("vorbereiten", "Teams bilden (Lobby) …");
      const ids = await Promise.all(lokal.map((p) => this.teamBilden(p)));
      lokal.forEach((p, k) => (this.teamIds[p.nr - 1] = ids[k]));
    } else {
      this.verbindungsaufbauS = (performance.now() - tVerbinden) / 1000;
    }

    if (this.opt.host) await this.hostVorbereiten();
    else await this.warteAufHost();
  }

  /** Wie in der Lobby: G1 legt das Team an, G2 und G3 treten mit ihrer Rolle bei. */
  private async teamBilden(p: TeamPlan): Promise<string> {
    const [g1, ...andere] = this.bots.filter((b) => b.nr === p.nr);
    const name = this.teamNamen[p.nr - 1];
    if (g1.sitzung.stand.teams.some((t) => t.name === name)) throw new Error(`„${name}“ gibt es in dieser Sitzung schon – jedes Team nur auf einem Gerät`);
    const id = await this.frist(g1.sitzung.teamErstellen(name, "g1"), 40, `Team ${p.nr} anlegen`);
    if (!id) throw new Error(`Team ${p.nr} konnte nicht angelegt werden`);
    await Promise.all(andere.map(async (b) => {
      await this.bis(() => !!b.sitzung.team(id), 30, `${b.name} sieht Team ${p.nr}`);
      if (!(await this.frist(b.sitzung.rolleWaehlen(id, b.rolle), 40, `${b.name} tritt bei`))) throw new Error(`${b.name} konnte nicht beitreten`);
    }));
    await this.bis(() => this.bots.filter((b) => b.nr === p.nr).every((b) => b.sitzung.stand.ich.team === id), 30, `Team ${p.nr} vollständig`);
    return id;
  }

  private async hostVorbereiten(): Promise<void> {
    const host = this.host!;
    const inh = this.inh!;
    const code = this.code!;
    const fremd = this.plan.length - this.lokal.length;
    this.setze("vorbereiten", fremd
      ? `Sitzung ${code.toUpperCase()}: warte auf ${fremd} ${fremd === 1 ? "Team" : "Teams"} von anderen Geräten …`
      : "Host wartet auf volle Teams …");
    await this.bis(() => this.plan.every((p) => {
      const t = host.stand.teams.find((x) => x.name === this.teamNamen[p.nr - 1]);
      return !!t && t.frei.length === 0 && t.spieler.filter((s) => s.online).length === 3;
    }), fremd ? 30 * 60 : 60, "Host sieht alle Teams voll und verbunden");
    this.plan.forEach((p, k) => (this.teamIds[k] = host.stand.teams.find((x) => x.name === this.teamNamen[p.nr - 1])!.id));

    if (this.opt.beobachter) {
      this.setze("vorbereiten", "Plenum und zweite Spielleitung verbinden sich …");
      const pl = zufall(6);
      const sl2 = zufall(6);
      const plenum = new Sitzung(inh, this.adapter(code, pl, "beobachter", "Plenum"), { art: "plenum", client: pl, name: "Plenum" });
      const zweite = new Sitzung(inh, this.adapter(code, sl2, "beobachter", "SL 2"), { art: "sl", client: sl2, name: "SL 2" });
      this.beobachteHinweise(plenum, "Plenum");
      this.beobachteHinweise(zweite, "SL 2");
      this.beobachter.push(plenum, zweite);
      await Promise.all(this.beobachter.map((s) => s.starten()));
      await this.bis(() => this.beobachter.every((s) => s.stand.verbindung.verbunden && s.stand.teamsGeladen), 40, "Beobachter verbunden");
    }

    this.setze("vorbereiten", "Spiel öffnen – alle Teams …");
    if (!(await this.frist(host.spielOeffnen(this.teamIds), 40, "Spiel öffnen"))) throw new Error("Spiel öffnen fehlgeschlagen");
    await this.bis(() => this.teamIds.every((id) => (host.spiel(id)?.stand.zustand.seq ?? 0) >= 2), 40, "Spielstände angelegt");
    await this.bis(() => this.botsImSpiel(), 40, "Alle Bots im Spiel ihres Teams");
    // Bots anderer Geräte laden ihr Protokoll selbst; ihnen etwas Zeit lassen
    if (this.plan.length > this.lokal.length) await new Promise((r) => setTimeout(r, 3000));

    if (this.teamIds.some((id) => host.spiel(id)?.stand.zustand.uhr.tempo !== this.opt.tempo)) {
      this.setze("vorbereiten", `Tempo ×${this.opt.tempo} …`);
      host.sendenAn(this.teamIds, "uhr", { befehl: "tempo", tempo: this.opt.tempo });
      await this.bis(() => this.teamIds.every((id) => host.spiel(id)?.stand.zustand.uhr.tempo === this.opt.tempo)
        && this.bots.every((b) => this.botSpiel(b)?.stand.zustand.uhr.tempo === this.opt.tempo), 30, `Tempo ×${this.opt.tempo} überall`);
    }
  }

  /** Gerät ohne Host: warten, bis das Host-Gerät das Spiel öffnet und die Uhr startet. */
  private async warteAufHost(): Promise<void> {
    this.setze("vorbereiten", `Sitzung ${this.code!.toUpperCase()}: Teams stehen – warte auf den Start am Host-Gerät …`);
    await this.bis(() => this.botsImSpiel(), 30 * 60, "Spiel geöffnet");
    this.setze("vorbereiten", "Spiel geöffnet – warte auf ▶ Uhr starten am Host-Gerät …");
    await this.bis(() => this.bots.every((b) => this.botSpiel(b)?.stand.zustand.uhr.laeuft), 30 * 60, "Uhr gestartet");
  }

  private botSpiel(b: Bot): Spiel | null {
    const id = this.teamIds[b.nr - 1];
    return id ? b.sitzung.spiel(id) : null;
  }

  private botsImSpiel(): boolean {
    return this.bots.every((b) => {
      const sp = this.botSpiel(b);
      const lauf = b.sitzung.team(this.teamIds[b.nr - 1])?.lauf;
      return !!sp && !!lauf && sp.stand.geladen && sp.stand.lauf === lauf && sp.stand.zustand.seq >= 2;
    });
  }

  // ---------------------------------------------------------------- Spiel

  private async spielen(): Promise<void> {
    const host = this.host;
    if (host) {
      this.slPlaene = this.plan.map((p) => ({ nr: p.nr, i: 0, aktionen: p.aktionen.filter((a) => a.rolle === "sl") }));
      this.setze("vorbereiten", "▶ Uhr starten – alle");
      host.sendenAn(this.teamIds, "uhr", { befehl: "start" });
      await this.bis(() => this.teamIds.every((id) => host.spiel(id)?.stand.zustand.uhr.laeuft), 30, "Alle Uhren laufen");
    }
    this.tUhrStart = performance.now();
    this.setze("laeuft", "Spiel läuft");
    const dauer = this.inh!.szenario.spieluhr.dauer_s;
    const tempo = this.sichtbar.length ? (this.spielVon(this.sichtbar[0].nr)?.stand.zustand.uhr.tempo ?? this.opt.tempo) : this.opt.tempo;
    const grenze = performance.now() + (dauer / tempo) * 1000 + 5 * 60_000;
    this.timer = setInterval(() => {
      try {
        this.takt();
        if (this.sichtbar.every((p) => this.spielVon(p.nr)?.stand.zustand.ende)) this.beenden("ende");
        else if (performance.now() > grenze) {
          this.fehler.push("Zeitüberschreitung: Spielende nicht in allen Teams erreicht");
          this.beenden("fehler");
        } else if (host && !host.stand.istHost) {
          this.fehler.push("Host hat die Steuerung verloren");
          this.beenden("fehler");
        }
      } catch (e) {
        this.fehler.push(`Ablauf: ${(e as Error).message}`);
        this.beenden("fehler");
      }
    }, 10);
  }

  private takt(): void {
    for (const b of this.bots) this.botTakt(b);
    if (!this.host) return;
    for (const p of this.slPlaene) {
      if (p.i >= p.aktionen.length) continue;
      const id = this.teamIds[p.nr - 1];
      const sp = this.host.spiel(id);
      if (!sp?.stand.lauf) continue;
      const t = sp.spielzeit();
      while (p.i < p.aktionen.length && t >= p.aktionen[p.i].t) {
        const a = p.aktionen[p.i++];
        this.host.sendenAn([id], a.typ, a.daten as AktionsDaten["verstaerkung_einspielen"]);
      }
    }
  }

  /** Modellperson wie MODELL_JS in tools/e2e_drehbuch.py. */
  private botTakt(b: Bot): void {
    if (b.i >= b.plan.length) return;
    const sp = this.botSpiel(b);
    if (!sp?.stand.lauf) return;
    const t = sp.spielzeit();
    if (t < b.plan[b.i].t) return;
    const st = sp.stand;
    if (st.zustand.ende) return;
    if (Object.keys(st.offen).length) return; // vorige Aktion noch nicht im Protokoll
    while (b.i < b.plan.length && t >= b.plan[b.i].t) {
      const a = b.plan[b.i];
      const m = (a.daten as { meldung?: string }).meldung;
      const inj = (a.daten as { inject?: string }).inject;
      if (a.typ === "inject_quittiert" && inj && !st.zustand.injects[inj]) return; // Lagemeldung noch nicht da
      const soll = SOLL[a.typ];
      if (soll && m) {
        const ms = st.zustand.meldungen[m];
        if (!ms || ms.stufe !== soll) {
          if (ms && (ms.stufe === "entfallen" || ms.stufe === "erledigt") && t > a.t + 30) {
            b.fehler.push(`${a.typ} ${m}: Meldung ist ${ms.stufe}`);
            b.i += 1;
            continue;
          }
          return; // Meldung noch nicht bei dieser Rolle
        }
      }
      const id = sp.senden(a.typ, a.daten as AktionsDaten[typeof a.typ], b.sitzung.absender(b.rolle));
      if (id) this.mess.notiere(id, { tSpiel: t, plan: a.t });
      b.i += 1;
      return;
    }
  }

  // ---------------------------------------------------------------- Ende

  private beenden(phase: "ende" | "fehler" | "abgebrochen"): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.tSpielende = performance.now();
    this.setze("abschluss", phase === "ende" ? "Spielende – Fenster abgleichen …" : "Abschluss …");
    // Kurz warten, bis jedes Bot-Fenster den Stand seines Teams hat (höchstens 10 s), dann vergleichen und trennen.
    const fertig = () => this.bots.every((b) => (this.botSpiel(b)?.stand.zustand.seq ?? -1) >= (this.spielVon(b.nr)?.stand.zustand.seq ?? 0)
      && (!!this.host || this.botSpiel(b)?.stand.zustand.ende));
    const start = performance.now();
    const warten = () => {
      if (!fertig() && performance.now() - start < 10_000 && phase !== "abgebrochen") {
        setTimeout(warten, 100);
        return;
      }
      this.protokolleSammeln();
      for (const p of this.sichtbar) this.teamStand(p.nr);
      this.abschliessen();
      this.aufraeumen();
      const text = phase === "ende" ? "Fertig – Spielende in allen Teams" : phase === "abgebrochen" ? "Abgebrochen" : this.fehler[this.fehler.length - 1] ?? "Fehler";
      this.setze(phase, text);
    };
    warten();
  }

  private abschliessen(): void {
    this.abschluss = this.sichtbar.flatMap((p) => {
      const sp = this.spielVon(p.nr);
      if (!sp) return [];
      const z = sp.stand.zustand;
      const fp = fingerabdruck(z);
      const fenster: (Spielzustand | undefined)[] = this.bots.filter((b) => b.nr === p.nr).map((b) => this.botSpiel(b)?.stand.zustand);
      const gleich = (a: Record<string, unknown>, b: Record<string, unknown>) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
      return [{
        nr: p.nr,
        name: this.teamNamen[p.nr - 1],
        seq: z.seq,
        ende: z.ende,
        fensterGleich: fenster.length ? fenster.every((x) => !!x && x.seq === z.seq && fingerabdruck(x) === fp) : null,
        ausgangGleich: z.ende && gleich(z.bestand, p.ende.bestand) && Object.keys(z.zerstoert).sort().join() === p.ende.zerstoert.join(),
        abgelehnt: z.abgelehnt.map((a) => `${a.aktionstyp}: ${a.grund}`),
      }];
    });
  }

  private aufraeumen(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.protokollTimer) clearInterval(this.protokollTimer);
    this.protokollTimer = null;
    this.mess.stoppeSeitenMessung();
    // Bots und Beobachter zuerst, Host zuletzt (gibt die Steuerung über onDisconnect frei)
    for (const s of this.alleSitzungen()) {
      try {
        s.stoppen();
      } catch {
        /* weiter */
      }
    }
    void this.wachhalter?.release().catch(() => {});
    this.wachhalter = null;
  }

  /**
   * HTTP-Protokoll der Long-Polling-Anfragen (h2 oder http/1.1). Das SDK lädt sie als Skripte in je einem
   * versteckten iframe pro Verbindung. Ohne Timing-Allow-Origin verrät der Browser das Protokoll fremder Server
   * nicht (dann leer); bei der Nachbildung oder einem Proxy kann es da stehen.
   */
  private protokolleSammeln(): void {
    const sammeln = (w: Window) => {
      for (const e of w.performance.getEntriesByType("resource") as PerformanceResourceTiming[]) {
        if (!/\.lp\?|firebaseio|firebasedatabase/.test(e.name)) continue;
        this.protokolle.set(`${e.name}@${Math.round(e.startTime)}`, e.nextHopProtocol || "?");
      }
    };
    try {
      sammeln(window);
    } catch {
      /* egal */
    }
    for (const f of Array.from(document.querySelectorAll("iframe"))) {
      try {
        if (f.contentWindow) sammeln(f.contentWindow);
      } catch {
        /* fremder Ursprung */
      }
    }
  }
}
