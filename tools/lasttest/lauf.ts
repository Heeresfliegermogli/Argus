// Ablauf des Lasttests (seit 2.6, H1.6): eine echte Sitzung in der Firebase-Datenbank mit n Team-Laptops (je Team ein Fenster,
// das sein Spiel selbst rechnet), der Spielleitung und dem Plenum. Jeder Teilnehmer ist eine eigene Sitzung der App
// (src/sitzung/sitzung.ts) mit eigener Firebase-Verbindung – Lobby, Anwesenheit, Teams, Upload, Statusmeldungen laufen genau wie
// in den Fenstern im Hörsaal; es fehlt nur die Oberfläche. Um jede Verbindung liegt ein VerzugAdapter: künstlicher Netzverzug
// (je Richtung) und eine simulierte Trennung der Team-Laptops.
//
//   1. Plan: die Modellteams spielen einmal ohne Netz durch (plan.ts).
//   2. Sitzung anlegen (neuer Code), Spielleitung verbindet sich.
//   3. Team-Laptops verbinden sich und legen je ihr Team an (wie in der Lobby); das Plenum verbindet sich.
//   4. Spiel öffnen – alle Teams (jeder Team-Laptop legt sein Spiel an), Tempo setzen.
//   5. Ab jetzt Verzug; „Start für alle“ von der Spielleitung. Jeder Bot entscheidet zur geplanten Spielzeit an seinem Laptop.
//      Zur eingestellten Zeit verlieren die Team-Laptops die Verbindung und bekommen sie wieder.
//   6. Spielende in allen Teams → warten, bis Spielleitung und Plenum alles haben → Abgleich, Auswertung → trennen.
//
// Verteilt auf mehrere Geräte (falls ein Browser nicht alle Verbindungen gleichzeitig offen hält): Ein Gerät legt die Sitzung an
// und führt Spielleitung und Plenum (sl: true), weitere Geräte treten mit dem Code bei und führen nur ihre Team-Laptops (hier).
import { FIREBASE_DB } from "../../src/config";
import { forceWebSockets } from "firebase/database";
import { ladeInhalte } from "../../src/inhalte/laden";
import type { Inhalte } from "../../src/inhalte/typen";
import { type Auswertung as SpielAuswertung, auswerten as spielAuswerten } from "../../src/kern/auswertung";
import { type AktionsDaten, zufall } from "../../src/kern/ereignisse";
import { codeNormalisieren, neuerCode } from "../../src/kern/sitzungen";
import { fingerabdruck } from "../../src/kern/zustand";
import type { Spiel } from "../../src/sitzung/spiel";
import { Sitzung } from "../../src/sitzung/sitzung";
import { sitzungVorhanden } from "../../src/sync/fabrik";
import { type FirebaseEinstellungen } from "../../src/sync/firebase";
import { VerzugAdapter } from "../../src/sync/verzug";
import { type KlickMessung, MessAdapter, Messung, type VerbindungsArt } from "./messung";
import { type PlanAktion, type TeamPlan, erstellePlan, teamName } from "./plan";

export interface LastOptionen {
  db: string;
  transport: "lp" | "auto";
  tempo: number;
  /** Teams in der Sitzung (gesamt, 1–7) */
  teams: number;
  /** Team-Nummern (1…teams), deren Laptops auf diesem Gerät laufen */
  hier: number[];
  /** dieses Gerät legt die Sitzung an und führt Spielleitung (und Plenum) */
  sl: boolean;
  /** Gerät ohne Spielleitung: Code der Sitzung, der es beitritt */
  code: string | null;
  /** Plenum verbindet sich zusätzlich (nur mit Spielleitung) */
  plenum: boolean;
  /** künstlicher Netzverzug je Richtung in ms (ab „Start für alle“) */
  verzug: number;
  /** Team-Laptops dieses Geräts trennen: ab … s nach dem Start (Echtzeit) für … s */
  trennen: { ab: number; dauer: number } | null;
}

export const STANDARD_OPTIONEN: LastOptionen = {
  db: FIREBASE_DB, transport: "lp", tempo: 5, teams: 7, hier: [1, 2, 3, 4, 5, 6, 7], sl: true, code: null, plenum: true, verzug: 0, trennen: null,
};

export type Phase = "bereit" | "vorbereiten" | "laeuft" | "abschluss" | "ende" | "abgebrochen" | "fehler";

/** Team-Laptop: ein Fenster, das das Spiel seines Teams rechnet; der Bot entscheidet daran nach Plan. */
export interface Laptop {
  nr: number;
  kennung: string;
  name: string;
  sitzung: Sitzung;
  verzug: VerzugAdapter;
  plan: PlanAktion[];
  i: number;
  fehler: string[];
  ab: (() => void) | null;
  gesehen: number;
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
  /** Spielleitung hat das vollständige Protokoll (gleicher Stand wie am Laptop bzw. wie die letzte Statusmeldung) */
  slGleich: boolean | null;
  plenumGleich: boolean | null;
  /** Restbestand und zerstörte Fahrzeuge wie beim Durchlauf ohne Netz (nur Teams dieses Geräts) */
  ausgangGleich: boolean | null;
  /** Ausgang je Fall in der Auswertung der Spielleitung wie ohne Netz */
  faelleGleich: boolean | null;
  faelleAnders: string[];
  abgelehnt: string[];
}

export interface Hinweis {
  /** Sekunden seit Start */
  t: number;
  wer: string;
  art: "info" | "warnung" | "fehler";
  text: string;
}

class Abbruch extends Error {}

/** Ablage der Team-Laptops im Speicher statt localStorage (sieben Laptops in einer Seite, viele Läufe hintereinander). */
class RamSpeicher implements Storage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  clear(): void {
    this.m.clear();
  }
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
}

export class Lasttest {
  phase: Phase = "bereit";
  status = "";
  readonly fehler: string[] = [];
  readonly hinweise: Hinweis[] = [];
  readonly mess = new Messung();
  inh: Inhalte | null = null;
  plan: TeamPlan[] = [];
  code: string | null = null;
  sl: Sitzung | null = null;
  plenum: Sitzung | null = null;
  laptops: Laptop[] = [];
  /** Team-Kennung je Team-Nummer − 1 ("" = noch unbekannt) */
  teamIds: string[] = [];
  teamNamen: string[] = [];
  abschluss: TeamAbschluss[] = [];
  /** Auswertung der Spielleitung bei Spielende (aus den hochgeladenen Protokollen) */
  auswertung: SpielAuswertung | null = null;
  beginn: Date | null = null;
  /** performance.now() beim „Start für alle“ und bei Spielende */
  tUhrStart: number | null = null;
  tSpielende: number | null = null;
  /** Dauer bis alle aufgeholt hatten (s nach Spielende) */
  aufholenS: number | null = null;
  verbindungsaufbauS: number | null = null;
  private tBeginn = 0;
  private abgebrochen = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private probenTimer: ReturnType<typeof setInterval> | null = null;
  private hoerer = new Set<() => void>();
  private wachhalter: { release(): Promise<void> } | null = null;
  private letzterStand = new Map<number, TeamStand>();
  private verzoegert: VerzugAdapter[] = [];
  private abos: (() => void)[] = [];
  private gesehenBei = new Map<string, number>();

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

  /** Teams, deren Laptops auf diesem Gerät laufen */
  get lokal(): TeamPlan[] {
    return this.plan.filter((p) => this.opt.hier.includes(p.nr));
  }

  /** Teams, die dieses Gerät anzeigt: mit Spielleitung alle, sonst die eigenen */
  get sichtbar(): TeamPlan[] {
    return this.opt.sl ? this.plan : this.lokal;
  }

  /** Sekunden seit dem Start des Lasttests */
  sekunden(): number {
    return this.beginn ? (performance.now() - this.tBeginn) / 1000 : 0;
  }

  /** Sekunden seit „Start für alle“ (Echtzeit) */
  seitStart(): number {
    return this.tUhrStart === null ? 0 : (performance.now() - this.tUhrStart) / 1000;
  }

  laptop(nr: number): Laptop | undefined {
    return this.laptops.find((l) => l.nr === nr);
  }

  /** Spiel am Team-Laptop (Teams dieses Geräts) */
  laptopSpiel(nr: number): Spiel | null {
    const id = this.teamIds[nr - 1];
    const l = this.laptop(nr);
    return id && l ? l.sitzung.spiel(id) : null;
  }

  /** Spiel eines Teams bei der Spielleitung */
  slSpiel(nr: number): Spiel | null {
    const id = this.teamIds[nr - 1];
    return id && this.sl ? this.sl.spiel(id) : null;
  }

  /** Stand eines Teams: am Laptop, sonst bei der Spielleitung; danach der letzte bekannte. */
  teamStand(nr: number): TeamStand {
    const sp = this.laptopSpiel(nr) ?? this.slSpiel(nr);
    if (sp?.stand.lauf) {
      const dauer = this.inh?.szenario.spieluhr.dauer_s ?? 1500;
      const s = { seq: sp.stand.zustand.seq, spielzeit: Math.min(dauer, sp.spielzeit()), ende: sp.stand.zustand.ende };
      this.letzterStand.set(nr, s);
      return s;
    }
    return this.letzterStand.get(nr) ?? { seq: 0, spielzeit: 0, ende: false };
  }

  spielzeit(): number {
    const p = this.sichtbar[0];
    return p ? this.teamStand(p.nr).spielzeit : 0;
  }

  get verbindungen(): number {
    return this.mess.verbindungen.size;
  }

  get getrennt(): boolean {
    return this.laptops.some((l) => l.verzug.istGetrennt);
  }

  private cfg(): FirebaseEinstellungen {
    return { databaseURL: this.opt.db, transport: this.opt.transport };
  }

  private adapter(sitzung: string, kennung: string, art: VerbindungsArt, name: string, teamNr?: number): VerzugAdapter {
    this.mess.anmelden({ kennung, art, name, ...(teamNr ? { teamNr } : {}) });
    const v = new VerzugAdapter(new MessAdapter(sitzung, this.cfg(), this.mess, kennung), 0);
    this.verzoegert.push(v);
    return v;
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
      if (performance.now() > ende) throw new Error(`${text} – nicht erreicht nach ${Math.round(sek)} s`);
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
    return [...this.laptops.map((l) => l.sitzung), ...(this.plenum ? [this.plenum] : []), ...(this.sl ? [this.sl] : [])];
  }

  // ---------------------------------------------------------------- Start

  async starten(): Promise<void> {
    this.beginn = new Date();
    this.tBeginn = performance.now();
    this.mess.starteSeitenMessung();
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
      void this.beenden("abgebrochen");
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
      // „automatisch“ heißt hier: nur WebSocket (die Nachbildung kann nur WebSocket; viele gleichzeitig startende Verbindungen
      // setzen sonst die Marke „WebSocket fehlgeschlagen“ und beginnen mit Long-Polling).
      forceWebSockets();
      try {
        localStorage.removeItem("firebase:previous_websocket_failure");
      } catch {
        /* egal */
      }
    }

    if (this.opt.sl) {
      this.setze("vorbereiten", "Sitzung anlegen …");
      const s = await this.frist(Sitzung.anlegen(inh, (x) => new MessAdapter(x, this.cfg(), this.mess, "anlegen"), "Lasttest", neuerCode), 45, "Sitzung anlegen");
      if (!s) throw new Error("Sitzung konnte nicht angelegt werden (Datenbank erreichbar? Regeln?)");
      this.code = s;
    } else {
      const s = codeNormalisieren(this.opt.code ?? "");
      if (!s) throw new Error("Bitte den Code der Sitzung vom Gerät der Spielleitung eingeben");
      this.setze("vorbereiten", `Sitzung ${s.toUpperCase()} suchen …`);
      const da = await sitzungVorhanden({ sync: "firebase", db: this.opt.db, transport: this.opt.transport }, s, 20000);
      if (da !== "da") throw new Error(da === "fehlt" ? `Sitzung ${s.toUpperCase()} gibt es nicht` : "Datenbank antwortet nicht");
      this.code = s;
    }
    const code = this.code;

    const tVerbinden = performance.now();
    if (this.opt.sl) {
      this.setze("vorbereiten", `Sitzung ${code.toUpperCase()}: Spielleitung verbindet sich …`);
      const k = zufall(6);
      this.sl = new Sitzung(inh, this.adapter(code, k, "sl", "Spielleitung"), { art: "sl", client: k, name: "Lasttest SL" });
      this.beobachteHinweise(this.sl, "SL");
      await this.sl.starten();
      await this.bis(() => !!this.sl?.stand.istHost, 40, "Spielleitung übernimmt die Steuerung");
    }

    const lokal = this.lokal;
    if (lokal.length) {
      this.setze("vorbereiten", `${lokal.length} Team-Laptops verbinden sich …`);
      const speicher = new RamSpeicher();
      for (const p of lokal) {
        const kennung = zufall(6);
        const name = `Laptop ${p.nr}`;
        const verzug = this.adapter(code, kennung, "laptop", name, p.nr);
        const s = new Sitzung(inh, verzug, { art: "tt", client: kennung, name, speicher });
        this.beobachteHinweise(s, name);
        this.laptops.push({ nr: p.nr, kennung, name, sitzung: s, verzug, plan: p.aktionen, i: 0, fehler: [], ab: null, gesehen: 0 });
      }
      await Promise.all(this.laptops.map((l) => l.sitzung.starten()));
      await this.bis(() => this.laptops.every((l) => l.sitzung.stand.verbindung.verbunden && l.sitzung.stand.teamsGeladen), 90, "Alle Team-Laptops verbunden");
      this.setze("vorbereiten", "Teams anlegen (Lobby) …");
      for (const l of this.laptops) {
        const name = this.teamNamen[l.nr - 1];
        if (l.sitzung.stand.teams.some((t) => t.name === name)) throw new Error(`„${name}“ gibt es in dieser Sitzung schon – jedes Team nur auf einem Gerät`);
        const id = await this.frist(l.sitzung.teamErstellen(name), 40, `Team ${l.nr} anlegen`);
        if (!id) throw new Error(`Team ${l.nr} konnte nicht angelegt werden`);
        this.teamIds[l.nr - 1] = id;
      }
      await this.bis(() => this.laptops.every((l) => l.sitzung.stand.ich.rechnet), 30, "Jeder Laptop rechnet sein Team");
    }
    if (this.opt.sl && this.opt.plenum) {
      const k = zufall(6);
      this.plenum = new Sitzung(inh, this.adapter(code, k, "plenum", "Plenum"), { art: "plenum", client: k, name: "Plenum" });
      this.beobachteHinweise(this.plenum, "Plenum");
      await this.plenum.starten();
      await this.bis(() => !!this.plenum?.stand.verbindung.verbunden && !!this.plenum.stand.teamsGeladen, 40, "Plenum verbunden");
    }
    this.verbindungsaufbauS = (performance.now() - tVerbinden) / 1000;

    if (this.opt.sl) await this.slVorbereiten();
    else await this.warteAufSl();
  }

  private async slVorbereiten(): Promise<void> {
    const sl = this.sl!;
    const code = this.code!;
    const fremd = this.plan.length - this.lokal.length;
    this.setze("vorbereiten", fremd
      ? `Sitzung ${code.toUpperCase()}: warte auf ${fremd} ${fremd === 1 ? "Team" : "Teams"} von anderen Geräten …`
      : "Spielleitung wartet auf alle Teams …");
    await this.bis(() => this.plan.every((p) => {
      const t = sl.stand.teams.find((x) => x.name === this.teamNamen[p.nr - 1]);
      return !!t && !!t.rechner;
    }), fremd ? 30 * 60 : 60, "Spielleitung sieht alle Teams mit Laptop");
    this.plan.forEach((p, k) => (this.teamIds[k] = sl.stand.teams.find((x) => x.name === this.teamNamen[p.nr - 1])!.id));

    this.setze("vorbereiten", "Spiel öffnen – alle Teams …");
    if (!(await this.frist(sl.spielOeffnen(this.teamIds), 40, "Spiel öffnen"))) throw new Error("Spiel öffnen fehlgeschlagen");
    await this.bis(() => this.teamIds.every((id) => (sl.spiel(id)?.stand.zustand.seq ?? 0) >= 2), 60, "Spielstände angelegt und hochgeladen");
    await this.bis(() => this.laptopsImSpiel(), 40, "Alle Laptops im Spiel ihres Teams");
    if (this.plenum) await this.bis(() => this.teamIds.every((id) => (this.plenum!.spiel(id)?.stand.zustand.seq ?? 0) >= 2), 40, "Plenum liest mit");

    if (this.teamIds.some((id) => sl.spiel(id)?.stand.zustand.uhr.tempo !== this.opt.tempo)) {
      this.setze("vorbereiten", `Tempo ×${this.opt.tempo} …`);
      sl.sendenAn(this.teamIds, "uhr", { befehl: "tempo", tempo: this.opt.tempo });
      await this.bis(() => this.teamIds.every((id) => sl.spiel(id)?.stand.zustand.uhr.tempo === this.opt.tempo)
        && this.laptops.every((l) => this.laptopSpiel(l.nr)?.stand.zustand.uhr.tempo === this.opt.tempo), 40, `Tempo ×${this.opt.tempo} überall`);
    }
  }

  /** Gerät ohne Spielleitung: warten, bis die Spielleitung das Spiel öffnet. */
  private async warteAufSl(): Promise<void> {
    this.setze("vorbereiten", `Sitzung ${this.code!.toUpperCase()}: Teams stehen – warte, bis die Spielleitung das Spiel öffnet …`);
    await this.bis(() => this.laptopsImSpiel(), 30 * 60, "Spiel geöffnet");
  }

  private laptopsImSpiel(): boolean {
    return this.laptops.every((l) => {
      const sp = this.laptopSpiel(l.nr);
      return !!sp && sp.stand.rechnet && !!sp.stand.lauf && sp.stand.zustand.seq >= 2;
    });
  }

  // ---------------------------------------------------------------- Spiel

  /** Spielstände beobachten: neue Ereignisse am Laptop, bei der Spielleitung und beim Plenum. */
  private beobachten(): void {
    for (const l of this.laptops) {
      const sp = this.laptopSpiel(l.nr)!;
      const neu = () => {
        const p = sp.stand.protokoll;
        for (let i = l.gesehen; i < p.length; i++) {
          const e = p[i];
          this.mess.lokalesEreignis(l.nr, e.seq, e.aktion, e.typ === "aktion_abgelehnt" ? (e.daten as { grund: string }).grund : undefined);
        }
        l.gesehen = p.length;
      };
      neu();
      this.abos.push(sp.abonnieren(neu));
    }
    for (const [wer, s] of [["sl", this.sl], ["plenum", this.plenum]] as const) {
      if (!s) continue;
      for (const p of this.plan) {
        const sp = s.spiel(this.teamIds[p.nr - 1]);
        if (!sp) continue;
        const schluessel = `${wer}|${p.nr}`;
        const neu = () => {
          const prot = sp.stand.protokoll;
          const ab = this.gesehenBei.get(schluessel) ?? 0;
          if (prot.length <= ab) return;
          const jetzt = s.adapter.serverJetzt();
          for (let i = ab; i < prot.length; i++) this.mess.angekommen(wer, p.nr, prot[i].seq, jetzt - prot[i].ts);
          this.gesehenBei.set(schluessel, prot.length);
        };
        // was schon da ist (Spiel öffnen), zählt nicht
        this.gesehenBei.set(schluessel, sp.stand.protokoll.length);
        this.abos.push(sp.abonnieren(neu));
      }
    }
  }

  /** Alle 500 ms: Alter der Statusmeldung und Rückstand des Protokolls bei Spielleitung und Plenum, je Team. */
  private proben(): void {
    const t = Math.round(this.seitStart() * 10) / 10;
    for (const p of this.sichtbar) {
      const id = this.teamIds[p.nr - 1];
      const st = this.sl?.stand.status[id];
      const alter = this.sl && st ? Math.max(0, (this.sl.adapter.serverJetzt() - st.ts) / 1000) : null;
      const lokal = this.mess.lokal.get(p.nr);
      const rueck = (s: Sitzung | null): number | null => {
        if (!s || !lokal) return null;
        const seqHier = s.spiel(id)?.stand.zustand.seq ?? 0;
        const naechstes = lokal.get(seqHier + 1);
        return naechstes === undefined ? 0 : Math.max(0, (performance.now() - naechstes) / 1000);
      };
      this.mess.probe(p.nr, [t, alter === null ? null : Math.round(alter * 10) / 10, rueck(this.sl), rueck(this.plenum)]);
    }
    // simulierte Trennung der Team-Laptops dieses Geräts
    const tr = this.opt.trennen;
    if (tr && this.laptops.length && this.phase === "laeuft") {
      if (!this.mess.trennung && t >= tr.ab) {
        this.laptops.forEach((l) => l.verzug.trennenSimuliert(true));
        this.mess.trennung = { von: t, bis: null };
      } else if (this.mess.trennung && this.mess.trennung.bis === null && t >= tr.ab + tr.dauer) {
        this.laptops.forEach((l) => l.verzug.trennenSimuliert(false));
        this.mess.trennung.bis = t;
      }
    }
  }

  private async spielen(): Promise<void> {
    const sl = this.sl;
    this.beobachten();
    // ab jetzt mit Verzug (Startsignal, Upload, Status, Lesen)
    for (const v of this.verzoegert) v.verzugMs = this.opt.verzug;
    const vz = this.opt.verzug / 1000;
    if (sl) {
      this.setze("vorbereiten", `▶ Start für alle${vz ? ` (Verzug ${vz} s je Richtung)` : ""} …`);
      const klick = performance.now();
      this.tUhrStart = klick;
      sl.sendenAn(this.teamIds, "uhr", { befehl: "start" });
      await this.bis(() => this.laptops.every((l) => {
        const lauf = this.laptopSpiel(l.nr)?.stand.zustand.uhr.laeuft;
        if (lauf && !this.mess.start.has(l.nr)) this.mess.start.set(l.nr, performance.now() - klick);
        return lauf;
      }), 4 * vz + 40, "Uhren laufen an allen Laptops");
    } else {
      this.setze("vorbereiten", "Spiel geöffnet – warte auf ▶ Start für alle am Gerät der Spielleitung …");
      await this.bis(() => this.laptops.every((l) => this.laptopSpiel(l.nr)?.stand.zustand.uhr.laeuft), 30 * 60, "Uhr gestartet");
      this.tUhrStart = performance.now();
    }
    // gleiche Spielzeit (H1.4): Spanne der Spielzeiten der Laptops dieses Geräts, sobald alle laufen
    const zeiten = this.laptops.map((l) => this.laptopSpiel(l.nr)!.spielzeit());
    if (zeiten.length) this.mess.startSpanne = Math.max(...zeiten) - Math.min(...zeiten);

    this.setze("laeuft", "Spiel läuft");
    this.probenTimer = setInterval(() => this.proben(), 500);
    const dauer = this.inh!.szenario.spieluhr.dauer_s;
    const grenze = performance.now() + (dauer / this.opt.tempo) * 1000 + 5 * 60_000 + 4 * this.opt.verzug;
    this.timer = setInterval(() => {
      try {
        for (const l of this.laptops) this.botTakt(l);
        const fertig = this.laptops.length
          ? this.laptops.every((l) => this.laptopSpiel(l.nr)?.stand.zustand.ende)
          : this.sichtbar.every((p) => this.sl?.stand.status[this.teamIds[p.nr - 1]]?.ende);
        if (fertig) void this.beenden("ende");
        else if (performance.now() > grenze) {
          this.fehler.push("Zeitüberschreitung: Spielende nicht in allen Teams erreicht");
          void this.beenden("fehler");
        }
      } catch (e) {
        this.fehler.push(`Ablauf: ${(e as Error).message}`);
        void this.beenden("fehler");
      }
    }, 20);
  }

  /** Bot am Team-Laptop: entscheidet zur geplanten Spielzeit (Meldung muss im Eingang sein, Lagemeldung da). */
  private botTakt(l: Laptop): void {
    if (l.i >= l.plan.length) return;
    const sp = this.laptopSpiel(l.nr);
    if (!sp?.stand.lauf || sp.stand.zustand.ende) return;
    const t = sp.spielzeit();
    while (l.i < l.plan.length && t >= l.plan[l.i].t) {
      const a = l.plan[l.i];
      const z = sp.stand.zustand;
      if (a.typ === "inject_quittiert") {
        const inj = (a.daten as AktionsDaten["inject_quittiert"]).inject;
        if (!z.injects[inj]) {
          if (t > a.t + 30) {
            l.fehler.push(`${inj}: Lagemeldung nicht da`);
            l.i += 1;
            continue;
          }
          return;
        }
      } else {
        const m = (a.daten as AktionsDaten["entscheid"]).meldung;
        const ms = z.meldungen[m];
        if (!ms || ms.stufe !== "offen" || ms.zurueckgestellt) {
          if (ms && (ms.stufe !== "offen" || ms.zurueckgestellt) && t > a.t + 5) {
            l.fehler.push(`${m}: Meldung ist ${ms.zurueckgestellt ? "zurückgestellt" : ms.stufe}`);
            l.i += 1;
            continue;
          }
          if (!ms && t > a.t + 30) {
            l.fehler.push(`${m}: Meldung nicht erschienen`);
            l.i += 1;
            continue;
          }
          return;
        }
      }
      const tKlick = performance.now();
      const id = sp.senden(a.typ, a.daten as AktionsDaten[typeof a.typ], l.sitzung.absender("zb"));
      if (id) {
        const d = a.daten as { meldung?: string };
        const k = { nr: l.nr, id, typ: a.typ, ...(d.meldung ? { meldung: d.meldung } : {}), tSpiel: t, plan: a.t, tKlick } as KlickMessung;
        this.mess.klicks.push(k);
        // Der Team-Laptop hat die Aktion schon verarbeitet (lokal, im selben Aufruf); der Hörer hat die Zeit des Ereignisses notiert.
        const p = sp.stand.protokoll;
        for (let i = p.length - 1; i >= Math.max(0, p.length - 30); i--) {
          if (p[i].aktion !== id) continue;
          k.tLokal = this.mess.lokal.get(l.nr)?.get(p[i].seq) ?? performance.now();
          if (p[i].typ === "aktion_abgelehnt") k.abgelehnt = (p[i].daten as { grund: string }).grund;
          break;
        }
      }
      l.i += 1;
    }
  }

  // ---------------------------------------------------------------- Ende

  /** Alle haben aufgeholt: Spielleitung und Plenum mit dem letzten Stand jedes Teams, Laptops alles hochgeladen. */
  private aufgeholt(): boolean {
    const laptopsOk = this.laptops.every((l) => {
      const sp = this.laptopSpiel(l.nr);
      return !!sp && sp.stand.zustand.ende && sp.stand.upload.hoch === sp.stand.zustand.seq;
    });
    if (!laptopsOk) return false;
    if (!this.sl) return true;
    return this.plan.every((p) => {
      const id = this.teamIds[p.nr - 1];
      const st = this.sl!.stand.status[id];
      const lokal = this.laptopSpiel(p.nr);
      const ziel = lokal ? lokal.stand.zustand.seq : st?.ende ? st.seq : -1;
      if (ziel < 0 || !st || st.seq !== ziel || !st.ende) return false;
      if ((this.sl!.spiel(id)?.stand.zustand.seq ?? 0) !== ziel) return false;
      return !this.plenum || (this.plenum.spiel(id)?.stand.zustand.seq ?? 0) === ziel;
    });
  }

  private beendet = false;

  private async beenden(phase: "ende" | "fehler" | "abgebrochen"): Promise<void> {
    if (this.beendet) return;
    this.beendet = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.tSpielende = performance.now();
    // eine noch laufende Trennung aufheben, damit Upload und Status nachkommen
    if (this.mess.trennung && this.mess.trennung.bis === null) {
      this.laptops.forEach((l) => l.verzug.trennenSimuliert(false));
      this.mess.trennung.bis = Math.round(this.seitStart() * 10) / 10;
    }
    if (phase === "ende") {
      this.setze("abschluss", "Spielende – Spielleitung und Plenum holen auf …");
      const frist = 90 + (8 * this.opt.verzug) / 1000;
      const start = performance.now();
      while (!this.aufgeholt() && (performance.now() - start) / 1000 < frist && !this.abgebrochen) await new Promise((r) => setTimeout(r, 200));
      if (this.aufgeholt()) this.aufholenS = (performance.now() - start) / 1000;
      else this.fehler.push(`Nach ${Math.round(frist)} s noch nicht aufgeholt`);
    } else {
      this.setze("abschluss", "Abschluss …");
    }
    if (this.probenTimer) clearInterval(this.probenTimer);
    this.probenTimer = null;
    this.proben();
    for (const p of this.sichtbar) this.teamStand(p.nr);
    this.abschliessen();
    this.aufraeumen();
    const text = phase === "ende"
      ? this.aufholenS !== null ? "Fertig – Spielende in allen Teams, Spielleitung vollständig" : "Spielende – Spielleitung nicht vollständig"
      : phase === "abgebrochen" ? "Abgebrochen" : this.fehler[this.fehler.length - 1] ?? "Fehler";
    this.setze(phase === "ende" && this.aufholenS === null ? "fehler" : phase, text);
  }

  private abschliessen(): void {
    const inh = this.inh!;
    if (this.sl) {
      const laeufe = this.plan.flatMap((p) => {
        const sp = this.sl!.spiel(this.teamIds[p.nr - 1]);
        return sp?.stand.lauf ? [{ id: this.teamIds[p.nr - 1], name: this.teamNamen[p.nr - 1], farbe: "#888888", zustand: sp.stand.zustand, protokoll: sp.stand.protokoll }] : [];
      });
      this.auswertung = spielAuswerten(inh, laeufe);
    }
    this.abschluss = this.sichtbar.map((p) => {
      const id = this.teamIds[p.nr - 1];
      const lokal = this.laptopSpiel(p.nr);
      const slSp = this.slSpiel(p.nr);
      const plSp = this.plenum?.spiel(id) ?? null;
      const z = (lokal ?? slSp)!.stand.zustand;
      const fp = fingerabdruck(z);
      const gleich = (sp: Spiel | null) => (!sp ? null : sp.stand.zustand.seq === z.seq && fingerabdruck(sp.stand.zustand) === fp);
      const st = this.sl?.stand.status[id];
      const gleichAuchOhneLaptop = (sp: Spiel | null) => (!sp ? null : lokal ? gleich(sp) : !!st?.ende && sp.stand.zustand.seq === st.seq);
      const vergleich = (a: Record<string, unknown>, b: Record<string, unknown>) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
      const t = this.auswertung?.teams.find((x) => x.id === id);
      const anders = t ? Object.entries(p.ende.faelle).filter(([f, aus]) => t.faelle[f]?.ausgang !== aus).map(([f, aus]) => `${f}: ${t.faelle[f]?.ausgang} statt ${aus}`) : [];
      return {
        nr: p.nr,
        name: this.teamNamen[p.nr - 1],
        seq: z.seq,
        ende: z.ende,
        slGleich: this.sl ? gleichAuchOhneLaptop(slSp) ?? false : null,
        plenumGleich: this.plenum ? gleichAuchOhneLaptop(plSp) ?? false : null,
        ausgangGleich: lokal ? z.ende && vergleich(z.bestand, p.ende.bestand) && Object.keys(z.zerstoert).sort().join() === p.ende.zerstoert.join() : null,
        faelleGleich: t ? anders.length === 0 : null,
        faelleAnders: anders,
        abgelehnt: z.abgelehnt.map((a) => `${a.aktionstyp}: ${a.grund}`),
      };
    });
  }

  private aufraeumen(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.probenTimer) clearInterval(this.probenTimer);
    this.probenTimer = null;
    this.abos.forEach((ab) => ab());
    this.abos = [];
    this.mess.stoppeSeitenMessung();
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
}
