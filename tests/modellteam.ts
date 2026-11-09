// Modellteams wie tools/referenz/simuliere_durchlauf.py, diesmal gegen die echte Engine: je Team eine lokale Engine (Host, wie seit
// 2.6 am Team-Laptop), eine gemeinsame gesteuerte Uhr und ein Protokoll im Speicher. Das Modellteam sendet Entscheidungen wie die
// Ansicht der Zielbearbeitung; die Spielleitung startet die Uhr, spielt Verstärkungen ein und notiert.
//
//  naiv  – folgt ARGUS (bei gestörtem Datenlink der gestörten Ausgabe): BEKÄMPFEN außer bei UNKLAR (ABLEHNEN), mit dem ersten
//          Wirkmittel ohne Warnung, sonst LM, sonst Mörser. Modellzeit 20 s je Entscheidung.
//  ideal – handelt nach der Lösung im Szenario (loesung.entscheid); BEKÄMPFEN nur mit einem Wirkmittel der Lösung, ohne Warnung und
//          wenn beim vorausberechneten Einschlag nichts Geschütztes im Wirkradius ist, sonst ZURÜCKSTELLEN. Modellzeit 35 s.
//
// Wie in der Simulation arbeitet das Team die Meldungen in der Reihenfolge ihres Erscheinens ab: Es öffnet die nächste, sobald es
// frei ist, und entscheidet nach der Modellzeit (Sekunden ab Öffnen). Meldungen, die vorher entfallen, überspringt es. Zurückgestellte
// bleiben offen.
//
// Lagemeldungen (für Kennzahlen und Replay der Auswertung): Das Team klickt jede Lagemeldung im Feed eine feste Zeit nach Eingang an
// (ideal nach 20 s; naiv nach 40 s, die zum polnischen Gegenangriff – I-04, Fall S3 – erst nach 270 s). Klicks ändern den Ablauf der
// Meldungen nicht (Vergleich mit der Simulation).
import { NACH, naechsteFaelligkeit } from "../src/engine/ablauf";
import { Host } from "../src/engine/host";
import type { Inhalte, Meldung } from "../src/inhalte/typen";
import type { Absender, Aktion, AktionsDaten, AktionsTyp, Ereignis } from "../src/kern/ereignisse";
import { argusBei } from "../src/kern/eloka";
import { offeneEinschlaege, weltFuer } from "../src/kern/lage";
import { SCHUTZ_KATEGORIEN, vorhersage, wirkungBeimEinschlag } from "../src/kern/regeln";
import { weg } from "../src/kern/geometrie";
import type { Spielzustand } from "../src/kern/zustand";
import type { Abmelden } from "../src/sync/adapter";

export type Team = "naiv" | "ideal";

/** Was das ideale Team nicht treffen will (wie argus_lib.SCHUTZ und die Attrappe). */
const SCHUTZ = new Set([...SCHUTZ_KATEGORIEN, "sanitaet", "attrappe"]);

/** Wie das Team mit Lagemeldungen umgeht (null: klickt nichts an). */
export interface LageVerhalten {
  /** klickt jede Lagemeldung so viele s nach Eingang an */
  quittieren_s: number;
  /** Lagemeldung zu Fall S3 (I-04): eigene Zeit in s nach Eingang */
  i04_s?: number;
}

/** So viele Sekunden vor Spielende klickt das Modellteam nichts mehr an. */
export const LAGE_VOR_ENDE_S = 10;

export const LAGE_STANDARD: Record<Team, LageVerhalten> = {
  ideal: { quittieren_s: 20 },
  naiv: { quittieren_s: 40, i04_s: 270 },
};

/** Modellzeit je Entscheidung (s ab Öffnen), wie simuliere_durchlauf.py (T_NAIV, T_IDEAL). */
export const ZEITEN_STANDARD: Record<Team, number> = { naiv: 20, ideal: 35 };

export interface ModellOptionen {
  team: Team;
  /** Lagemeldungen (Standard nach Team, siehe LAGE_STANDARD; null = keine) */
  lage?: LageVerhalten | null;
  /** Notizen der Spielleitung (Demo der Auswertung): Spielzeit, Fall, Text */
  notizen?: { t: number; fall?: string; text: string }[];
  /** Verstärkung → Einspielzeit t0 (s) */
  einspielen?: Record<string, number>;
  /** Sekunden je Entscheidung (Standard nach Team) */
  dauer?: number;
  reihenfolge?: string[];
}

export const START_MS = 1_800_000_000_000;

/** Uhr für alle Teams (Serverzeit in ms, Spielzeit 0 = START_MS, solange Tempo 1 und ohne Pause). */
export class Uhr {
  ms = START_MS;
  setze(t: number): void {
    this.ms = START_MS + Math.round(t * 1000);
  }
}

/** Netz des Modellteams im Speicher: Aktionen der Spielleitung gehen sofort an den Host, Ereignisse ins Protokoll. */
export class SpeicherKanal {
  readonly protokoll: Ereignis[] = [];
  /** alle gesendeten Aktionen in Reihenfolge (für tools/drehbuch_plan.ts: Nachspielen im Browser) */
  readonly gesendet: Aktion[] = [];
  private hoerer: ((a: Aktion) => void)[] = [];
  private n = 0;
  constructor(readonly team: string, private uhr: Uhr) {}
  serverJetzt(): number {
    return this.uhr.ms;
  }
  neueId(): string {
    this.n += 1;
    return `${this.team}-a${String(this.n).padStart(5, "0")}`;
  }
  ausgabe(e: Ereignis): void {
    if (this.protokoll.length && this.protokoll[this.protokoll.length - 1].seq !== e.seq - 1) throw new Error("seq");
    this.protokoll.push(e);
  }
  sendeAktion(a: Aktion): void {
    this.gesendet.push(a);
    this.hoerer.forEach((f) => f(a));
  }
  aufAktionen(_lauf: string, cb: (a: Aktion) => void): Abmelden {
    this.hoerer.push(cb);
    return () => (this.hoerer = this.hoerer.filter((x) => x !== cb));
  }
}

export interface Entscheidung {
  meldung: string;
  /** Öffnen und Entscheidung (Spielzeit) */
  t_offen: number;
  t: number;
  entscheid: "BEKÄMPFEN" | "ZURÜCKSTELLEN" | "ABLEHNEN";
  wm?: string;
  /** ZURÜCKSTELLEN, weil kein Wirkmittel passte */
  keinWirkmittel?: boolean;
}

/** Ein Team mit einer lokalen Engine (Host) und einer Modellperson, die nacheinander entscheidet. */
export class Modellteam {
  readonly kanal: SpeicherKanal;
  readonly host: Host;
  readonly entscheidungen = new Map<string, Entscheidung>();
  private dauer: number;
  private reihenfolge: string[];
  private zeiger = 0;
  private aktuell: { meldung: string; t_offen: number; ende: number } | null = null;
  private gestartet = false;
  private eingespielt = new Set<string>();
  private lage: LageVerhalten | null;
  private quittiert = new Set<string>();
  private notizNr = 0;

  constructor(readonly inh: Inhalte, readonly opt: ModellOptionen, readonly name: string, private uhr: Uhr) {
    this.kanal = new SpeicherKanal(name, uhr);
    this.dauer = opt.dauer ?? ZEITEN_STANDARD[opt.team];
    this.reihenfolge = opt.reihenfolge ?? ["PZA", "ART", "MRS", "PRZ", "LM"];
    this.lage = opt.lage === undefined ? LAGE_STANDARD[opt.team] : opt.lage;
    this.host = new Host(inh, this.kanal, "20261104-1000-modl", [], { rolle: "zb", client: "zbmodl", name: "Team" }, {
      taktMs: 0,
      ausgabe: (e) => this.kanal.ausgabe(e),
    });
    this.host.starten();
  }

  get z(): Spielzustand {
    return this.host.zustand;
  }

  get welt(): Inhalte {
    return weltFuer(this.inh, this.z);
  }

  private senden<T extends AktionsTyp>(typ: T, daten: AktionsDaten[T], rolle: Absender["rolle"], ms = this.uhr.ms): void {
    const a = { id: this.kanal.neueId(), typ, von: { rolle, client: `${rolle}modl`, name: rolle === "sl" ? "SL Modell" : "Team" }, ts: ms, daten } as Aktion;
    this.kanal.sendeAktion(a);
  }

  /** Geplante Aktionen der Spielleitung und Klicks auf Lagemeldungen, die zur Zeit t fällig sind. */
  steuern(t: number): void {
    if (!this.gestartet) {
      this.senden("uhr", { befehl: "start" }, "sl");
      this.gestartet = true;
    }
    for (const [g, t0] of Object.entries(this.opt.einspielen ?? {})) {
      if (!this.eingespielt.has(g) && t >= t0) {
        this.senden("verstaerkung_einspielen", { gruppe: g }, "sl");
        this.eingespielt.add(g);
      }
    }
    for (const [id, tq] of this.lageTermine()) {
      if (t < tq - 1e-9) continue;
      this.senden("inject_quittiert", { inject: id }, "zb");
      this.quittiert.add(id);
    }
    const notizen = this.opt.notizen ?? [];
    while (this.notizNr < notizen.length && t >= notizen[this.notizNr].t - 1e-9) {
      const n = notizen[this.notizNr++];
      this.senden("notiz", { text: n.text, ...(n.fall ? { fall: n.fall } : {}) }, "sl");
    }
  }

  /** Fällige Klicks auf Lagemeldungen: Kennung → Zeitpunkt. */
  private lageTermine(): [string, number][] {
    const l = this.lage;
    if (!l || this.z.ende) return [];
    const i04 = this.inh.szenario.injects.find((i) => i.fall === "S3" && i.t_s !== undefined)?.id;
    const out: [string, number][] = [];
    for (const id of this.z.injectReihenfolge) {
      if (this.quittiert.has(id) || this.z.injects[id].quittiert) continue;
      out.push([id, this.z.injects[id].erschienen.t_s + (id === i04 && l.i04_s !== undefined ? l.i04_s : l.quittieren_s)]);
    }
    // nichts mehr kurz vor Spielende: im Browser käme der Klick erst nach dem Ende an
    const schluss = this.inh.szenario.spieluhr.dauer_s - LAGE_VOR_ENDE_S;
    return out.filter(([, tq]) => tq < schluss);
  }

  /** Zeitpunkte, zu denen dieses Team wieder etwas tun muss. */
  termine(t: number): number[] {
    const k: number[] = [];
    if (this.aktuell) k.push(this.aktuell.ende);
    for (const t0 of Object.values(this.opt.einspielen ?? {})) if (t0 > t) k.push(t0);
    for (const [, tq] of this.lageTermine()) k.push(tq);
    const n = this.opt.notizen?.[this.notizNr];
    if (n) k.push(n.t);
    if (!this.z.ende) k.push(naechsteFaelligkeit(this.inh, this.z, t));
    return k.filter((x) => x > t + 1e-9 && Number.isFinite(x));
  }

  // ---------------------------------------------------------------- Prognose wie die Simulation

  /** Zerstörungen, die die Simulation zur Zeit der Entscheidung schon kennt: Hintergrundgefecht und Wirkungen im Anflug. */
  private zerstoertPrognose(): Record<string, number> {
    const inh = this.welt;
    const z = this.z;
    const p: Record<string, number> = { ...z.zerstoert };
    for (const h of inh.szenario.hintergrund?.ereignisse ?? []) {
      if (h.art !== "panzerabwehr" || h.folge !== "zerstoert" || z.hintergrund[h.id]) continue;
      const ziel = inh.ziele[h.ziel];
      if (ziel && !weg(ziel, h.t_s, z.zerstoert)) p[h.ziel] = Math.min(p[h.ziel] ?? Infinity, h.t_s);
    }
    for (const id of z.reihenfolge) {
      const st = z.meldungen[id];
      if (st.stufe !== "wirkung" || !st.freigabe?.wirkmittel) continue;
      // je ausstehendem Einschlag eines Zuges, nacheinander
      const zer = { ...z.zerstoert };
      for (const { e } of offeneEinschlaege(inh, z, id)) {
        for (const g of wirkungBeimEinschlag(inh, e, st.freigabe.wirkmittel, zer).getroffen) {
          if (g.was !== "personen") {
            p[g.ziel] = Math.min(p[g.ziel] ?? Infinity, e.t);
            zer[g.ziel] = Math.min(zer[g.ziel] ?? Infinity, e.t);
          }
        }
      }
    }
    return p;
  }

  /**
   * Wirkmittel ohne Warnung für BEKÄMPFEN zur Zeit t. ideal: nur die Wirkmittel der Lösung; dazu (bild) nur, wenn beim vorausberechneten
   * Einschlag nichts Geschütztes im Wirkradius ist (wie die Simulation).
   */
  private waehle(m: Meldung, t: number, bild = false): string[] {
    const inh = this.welt;
    const zp = this.zerstoertPrognose();
    const erlaubt = this.opt.team === "ideal" ? m.loesung?.wirkmittel : undefined;
    return this.reihenfolge.filter((w) => {
      if (!inh.wirkmittel[w] || (erlaubt && !erlaubt.includes(w))) return false;
      const b = this.z.bestand[w];
      if (b !== null && b !== undefined && b <= 0) return false;
      const v = vorhersage(inh, m, w, t, zp, b ?? null);
      if (!v.pruefung.zulaessig) return false;
      if (bild && this.opt.team === "ideal" && v.getroffen.some((g) => SCHUTZ.has(g.kategorie))) return false;
      return true;
    });
  }

  // ---------------------------------------------------------------- Entscheiden

  /** Entscheidung, die zur Zeit t fällig ist. */
  entscheiden(t: number): void {
    const a = this.aktuell;
    if (!a || a.ende > t + 1e-9) return;
    this.aktuell = null;
    this.entscheide(a.meldung, a.t_offen, t);
  }

  private entscheide(id: string, tOffen: number, t: number): void {
    const z = this.z;
    if (z.ende) return;
    const st = z.meldungen[id];
    if (!st || st.stufe !== "offen") return; // inzwischen entfallen (letztes Fahrzeug weg)
    const inh = this.welt;
    const m = inh.meldungen[id];
    const loes = m.loesung ?? { entscheid: "BEKÄMPFEN" as const };
    const sende = (e: Omit<Entscheidung, "meldung" | "t_offen" | "t">) => {
      this.entscheidungen.set(id, { meldung: id, t_offen: tOffen, t, ...e });
      const was = e.entscheid === "BEKÄMPFEN" ? "bekaempfen" : e.entscheid === "ZURÜCKSTELLEN" ? "zurueckstellen" : "ablehnen";
      this.senden("entscheid", { meldung: id, entscheid: was, ...(e.wm ? { wirkmittel: e.wm } : {}), t_offen: tOffen }, "zb");
    };
    let wahl: string | null;
    if (this.opt.team === "naiv") {
      if (argusBei(inh, m, st.gestoert).empfehlung === "UNKLAR") return sende({ entscheid: "ABLEHNEN" });
      const zul = this.waehle(m, t);
      wahl = zul[0] ?? ["LM", "MRS"].find((w) => inh.wirkmittel[w] && (z.bestand[w] ?? Infinity) > 0) ?? null;
    } else {
      if (loes.entscheid === "ABLEHNEN") return sende({ entscheid: "ABLEHNEN" });
      if (loes.entscheid === "ZURÜCKSTELLEN") return sende({ entscheid: "ZURÜCKSTELLEN" });
      wahl = this.waehle(m, t, true)[0] ?? null;
    }
    if (!wahl) return sende({ entscheid: "ZURÜCKSTELLEN", keinWirkmittel: true });
    sende({ entscheid: "BEKÄMPFEN", wm: wahl });
  }

  /** Ist das Team frei, öffnet es die nächste Meldung in der Reihenfolge des Erscheinens (entfallene überspringt es). */
  aufnehmen(t: number): void {
    if (this.z.ende || this.aktuell) return;
    const liste = this.z.reihenfolge;
    while (this.zeiger < liste.length) {
      const id = liste[this.zeiger];
      const st = this.z.meldungen[id];
      this.zeiger += 1;
      if (st.stufe !== "offen" || st.zurueckgestellt || this.entscheidungen.has(id)) continue;
      this.aktuell = { meldung: id, t_offen: t, ende: t + this.dauer };
      return;
    }
  }
}

/** Referenz der Simulation (tests/referenz_durchlauf.json), soweit die Modellteams sie brauchen. */
export interface DrehbuchReferenz {
  zeiten: Record<Team, number>;
  reihenfolge_wirkmittel: string[];
  laeufe: { team: Team; einspielen: Record<string, number> }[];
}

/**
 * Die fünf Teams des Drehbuchs (tools/drehbuch_plan.ts für tools/e2e_drehbuch.py, Demo der Auswertung): die Läufe der Simulation,
 * Lagemeldungen nach LAGE_STANDARD. Team 3 (naiv + 4 Verstärkungen) klickt I-04 nach einer Minute an – bekämpft die PT-91 aber trotzdem
 * (folgt ARGUS): Die Information kam an, entschieden hat sie nicht. Am Ausgang der Meldungen ändert das nichts.
 */
export function drehbuchTeams(ref: DrehbuchReferenz, notizen: Record<number, ModellOptionen["notizen"]> = {}): { name: string; opt: ModellOptionen }[] {
  return ref.laeufe.map((l, i) => ({
    name: `team${i + 1}`,
    opt: {
      team: l.team, einspielen: l.einspielen, dauer: ref.zeiten[l.team], reihenfolge: ref.reihenfolge_wirkmittel,
      ...(i === 2 ? { lage: { quittieren_s: 30, i04_s: 60 } } : {}),
      ...(notizen[i] ? { notizen: notizen[i] } : {}),
    },
  }));
}

/** Spielt mehrere Teams parallel mit gesteuerter Uhr bis zum Spielende durch (jedes Team eine eigene Engine). */
export function spieleDurch(inh: Inhalte, teams: { name: string; opt: ModellOptionen }[]): Modellteam[] {
  const uhr = new Uhr();
  const liste = teams.map((x) => new Modellteam(inh, x.opt, x.name, uhr));
  const takt = () => liste.forEach((m) => m.host.takt());
  let t = 0;
  for (let schritt = 0; schritt < 20000; schritt++) {
    uhr.setze(t);
    for (const m of liste) m.steuern(t);
    takt();
    for (let runde = 0; runde < 5; runde++) {
      for (const m of liste) m.entscheiden(t);
      takt();
      for (const m of liste) m.aufnehmen(t);
    }
    if (liste.every((m) => m.z.ende)) break;
    const naechste = Math.min(...liste.flatMap((m) => m.termine(t)));
    if (!Number.isFinite(naechste)) break;
    t = naechste;
  }
  liste.forEach((m) => m.host.stoppen());
  return liste;
}

export { NACH };
