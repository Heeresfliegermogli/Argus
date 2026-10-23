// Modellteams wie tools/referenz/simuliere_durchlauf.py, diesmal gegen die echte Engine: je Team ein Host
// an einem gemeinsamen Taktgeber, eine gesteuerte Uhr und ein Kanal im Speicher. Die Modellpersonen G1, G2,
// G3 senden Aktionen wie die Ansichten; die Spielleitung startet die Uhr und spielt Verstärkungen ein.
//
//  naiv  – folgt ARGUS: G1 nimmt alles an außer UNKLAR, G2 nimmt das erste Wirkmittel ohne Warnung (für eine
//          Freigabe nach T_G3), sonst LM, sonst Mörser; G3 gibt immer frei; Fast-Track 30 s nach dem Angebot.
//  ideal – handelt nach der Lösung im Szenario; G3 gibt nur frei, wenn die Warnung zum Einschlag frei ist.
//
// Lagemeldungen (seit Schritt 8, für Kennzahlen und Replay der Auswertung): G3 quittiert jede Lagemeldung
// („gelesen“) eine feste Zeit nach Eingang. ideal: nach 20 s, und 35 s nach der Lagemeldung zum polnischen
// Gegenangriff (I-04, Fall S3) ein Lagehinweis an G1 und G2. naiv: nach 40 s, I-04 erst nach 270 s (10:21:30),
// kein Lagehinweis. Quittieren und Lagehinweis ändern den Ablauf der Meldungen nicht (Vergleich mit der Simulation).
//
// Wie in der Simulation arbeitet jede Person die Meldungen in der Reihenfolge ihres Erscheinens ab (G1 40 s,
// G2 50 s, G3 30 s je Meldung) und wartet dabei auf eine frühere Meldung, die noch zu ihr kommt. Unterschiede
// zur Simulation, die das Ergebnis nicht ändern: Die Engine lässt eine Meldung entfallen, sobald ihr letztes
// Fahrzeug weg ist (die Simulation prüft beim Aufnehmen); wechselt G3 (ideal) das Wirkmittel, geht die
// Meldung ZURÜCK AN G2, die sofort mit dem anderen Wirkmittel empfiehlt; Fast-Track schaltet 0,05 s vor dem
// Zeitpunkt der Simulation, damit eine Meldung genau zu diesem Zeitpunkt schon Fast-Track hat.
import { NACH, naechsteFaelligkeit } from "../src/engine/ablauf";
import { Host } from "../src/engine/host";
import { Taktgeber } from "../src/engine/taktgeber";
import type { Inhalte, Meldung } from "../src/inhalte/typen";
import type { Absender, Aktion, AktionsDaten, AktionsTyp, Ereignis } from "../src/kern/ereignisse";
import { einschlagVon, weltFuer } from "../src/kern/lage";
import { vorhersage, wirkungBeimEinschlag } from "../src/kern/regeln";
import { weg } from "../src/kern/geometrie";
import type { Spielzustand } from "../src/kern/zustand";
import type { Abmelden, TeamKanal } from "../src/sync/adapter";

export type Team = "naiv" | "ideal";

/** Wie G3 mit Lagemeldungen umgeht (null: liest nichts, wie bis Schritt 7). */
export interface LageVerhalten {
  /** quittiert jede Lagemeldung so viele s nach Eingang */
  quittieren_s: number;
  /** Lagemeldung zu Fall S3 (I-04): eigene Zeit in s nach Eingang */
  i04_s?: number;
  /** Lagehinweis an G1 und G2 so viele s nach Eingang von I-04 (fehlt: keiner) */
  hinweis_s?: number;
  hinweis?: string;
}

/** So viele Sekunden vor Spielende quittiert und meldet G3 der Modellteams nichts mehr. */
export const LAGE_VOR_ENDE_S = 10;

export const LAGE_STANDARD: Record<Team, LageVerhalten> = {
  ideal: { quittieren_s: 20, hinweis_s: 35, hinweis: "Polnischer Gegenangriff ab 10:19 entlang Feldweg Süd (PT-91, sehen aus wie T-72) – dort kein Feuer!" },
  naiv: { quittieren_s: 40, i04_s: 270 },
};

export interface ModellOptionen {
  team: Team;
  /** G3 und Lagemeldungen (Standard nach Team, siehe LAGE_STANDARD; null = keine) */
  lage?: LageVerhalten | null;
  /** Notizen der Spielleitung (Demo der Auswertung): Spielzeit, Fall, Text */
  notizen?: { t: number; fall?: string; text: string }[];
  /** Verstärkung → Einspielzeit t0 (s) */
  einspielen?: Record<string, number>;
  zeiten?: { G1: number; G2: number; G3: number };
  ftNachAngebot?: number;
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

/** Kanal im Speicher: Aktionen gehen sofort an den Host, Ereignisse in das Protokoll. */
export class SpeicherKanal implements TeamKanal {
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
  async ladeProtokoll(): Promise<Ereignis[]> {
    return [...this.protokoll];
  }
  aufProtokoll(): Abmelden {
    return () => undefined;
  }
  async schreibeEreignis(_lauf: string, e: Ereignis): Promise<void> {
    if (this.protokoll.length && this.protokoll[this.protokoll.length - 1].seq !== e.seq - 1) throw new Error("seq");
    this.protokoll.push(e);
  }
  async sendeAktion(_lauf: string, a: Aktion): Promise<void> {
    this.gesendet.push(a);
    this.hoerer.forEach((f) => f(a));
  }
  aufAktionen(_lauf: string, cb: (a: Aktion) => void): Abmelden {
    this.hoerer.push(cb);
    return () => (this.hoerer = this.hoerer.filter((x) => x !== cb));
  }
}

type Stufe = "G1" | "G2" | "G3";

interface Person {
  stufe: Stufe;
  /** Index in der Reihenfolge der Meldungen, die als Nächstes dran ist */
  zeiger: number;
  /** in Arbeit: Meldung und Zeit der Entscheidung */
  aktuell: { meldung: string; ende: number } | null;
}

export interface Entscheidung {
  meldung: string;
  g1?: { t: number; ok: boolean };
  g2?: { t: number; wahl: string | "BEOBACHTEN" | "NICHT" };
  g3?: { t: number; was: "FREIGABE" | "ABLEHNEN" | "ZURUECK"; wm?: string };
}

/** Ein Team aus drei Modellpersonen und einem Host. */
export class Modellteam {
  readonly kanal: SpeicherKanal;
  readonly host: Host;
  readonly entscheidungen = new Map<string, Entscheidung>();
  private personen: Record<Stufe, Person>;
  private zeiten: { G1: number; G2: number; G3: number };
  private reihenfolge: string[];
  private ftAb: number | null;
  private ftGesendet = false;
  private gestartet = false;
  private eingespielt = new Set<string>();
  private lageG3: LageVerhalten | null;
  private quittiert = new Set<string>();
  private hinweisGesendet = false;
  private notizNr = 0;

  constructor(readonly inh: Inhalte, readonly opt: ModellOptionen, readonly name: string, private uhr: Uhr, tg: Taktgeber) {
    this.kanal = new SpeicherKanal(name, uhr);
    this.zeiten = opt.zeiten ?? { G1: 40, G2: 50, G3: 30 };
    this.reihenfolge = opt.reihenfolge ?? ["PZA", "ART", "MRS", "PRZ", "LM"];
    const i05 = inh.szenario.injects.find((i) => i.aktion === "fast_track_angebot")?.t_s;
    this.ftAb = opt.team === "naiv" && i05 !== undefined ? i05 + (opt.ftNachAngebot ?? 30) : null;
    this.lageG3 = opt.lage === undefined ? LAGE_STANDARD[opt.team] : opt.lage;
    this.personen = {
      G1: { stufe: "G1", zeiger: 0, aktuell: null },
      G2: { stufe: "G2", zeiger: 0, aktuell: null },
      G3: { stufe: "G3", zeiger: 0, aktuell: null },
    };
    this.host = new Host(inh, this.kanal, "20261104-1000-modl", [], { rolle: "sl", client: "slmod", name: "SL" }, {
      taktMs: 0,
      beiFehler: (e) => { throw e; },
    });
    this.host.starten();
    tg.anmelden(this.host);
  }

  get z(): Spielzustand {
    return this.host.zustand;
  }

  get welt(): Inhalte {
    return weltFuer(this.inh, this.z);
  }

  private senden<T extends AktionsTyp>(typ: T, daten: AktionsDaten[T], rolle: Absender["rolle"], ms = this.uhr.ms): void {
    const a = { id: this.kanal.neueId(), typ, von: { rolle, client: `${rolle}mod`, name: `${rolle.toUpperCase()} Modell` }, ts: ms, daten } as Aktion;
    void this.kanal.sendeAktion("", a);
  }

  /** Geplante Aktionen der Spielleitung und von G3 (Fast-Track), die zur Zeit t fällig sind. */
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
    if (this.ftAb !== null && !this.ftGesendet && t >= this.ftAb - 0.05) {
      this.senden("fast_track", { an: true }, "g3");
      this.ftGesendet = true;
    }
    for (const [id, tq] of this.lageTermine()) {
      if (t < tq - 1e-9) continue;
      if (id === "hinweis") {
        this.senden("lagehinweis", { text: this.lageG3!.hinweis!, an: ["g1", "g2"] }, "g3");
        this.hinweisGesendet = true;
      } else {
        this.senden("inject_quittiert", { inject: id }, "g3");
        this.quittiert.add(id);
      }
    }
    const notizen = this.opt.notizen ?? [];
    while (this.notizNr < notizen.length && t >= notizen[this.notizNr].t - 1e-9) {
      const n = notizen[this.notizNr++];
      this.senden("notiz", { text: n.text, ...(n.fall ? { fall: n.fall } : {}) }, "sl");
    }
  }

  /** Fällige Lagemeldungen zum Quittieren und der Lagehinweis nach I-04: Kennung → Zeitpunkt. */
  private lageTermine(): [string, number][] {
    const l = this.lageG3;
    if (!l || this.z.ende) return [];
    const i04 = this.inh.szenario.injects.find((i) => i.fall === "S3" && i.t_s !== undefined)?.id;
    const out: [string, number][] = [];
    for (const id of this.z.injectReihenfolge) {
      if (this.quittiert.has(id) || this.z.injects[id].quittiert) continue;
      out.push([id, this.z.injects[id].erschienen.t_s + (id === i04 && l.i04_s !== undefined ? l.i04_s : l.quittieren_s)]);
    }
    if (i04 && l.hinweis && l.hinweis_s !== undefined && !this.hinweisGesendet && this.z.injects[i04]) {
      out.push(["hinweis", this.z.injects[i04].erschienen.t_s + l.hinweis_s]);
    }
    // nichts mehr kurz vor Spielende: im Browser käme der Klick erst nach dem Ende an (z. B. I-08b um 10:24:40)
    const schluss = this.inh.szenario.spieluhr.dauer_s - LAGE_VOR_ENDE_S;
    return out.filter(([, tq]) => tq < schluss);
  }

  /** Zeitpunkte, zu denen dieses Team wieder etwas tun muss. */
  termine(t: number): number[] {
    const k: number[] = [];
    for (const p of Object.values(this.personen)) if (p.aktuell) k.push(p.aktuell.ende);
    for (const t0 of Object.values(this.opt.einspielen ?? {})) if (t0 > t) k.push(t0);
    if (this.ftAb !== null && !this.ftGesendet) k.push(this.ftAb - 0.05);
    for (const [, tq] of this.lageTermine()) k.push(tq);
    const n = this.opt.notizen?.[this.notizNr];
    if (n) k.push(n.t);
    if (!this.z.ende) k.push(naechsteFaelligkeit(this.inh, this.z, t));
    return k.filter((x) => x > t + 1e-9 && Number.isFinite(x));
  }

  /** Reihenfolge der Meldungen, wie sie erschienen sind (= Reihenfolge der Simulation). */
  private liste(): string[] {
    return this.z.reihenfolge;
  }

  // ---------------------------------------------------------------- Prognose wie die Simulation

  /** Zerstörungen, die die Simulation zur Zeit der Entscheidung schon kennt: Hintergrund und Wirkungen im Anflug. */
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
      if (st.stufe !== "wirkung" || !st.g3?.wirkmittel) continue;
      const e = einschlagVon(inh, z, id);
      if (!e) continue;
      for (const g of wirkungBeimEinschlag(inh, e, st.g3.wirkmittel, z.zerstoert).getroffen) {
        if (g.was !== "personen") p[g.ziel] = Math.min(p[g.ziel] ?? Infinity, e.t);
      }
    }
    return p;
  }

  /** Bestand, wie ihn die Simulation sieht: frühere Meldungen bei G3 mit diesem Wirkmittel sind schon abgezogen. */
  private bestand(wm: string, vor: string): number {
    const b = this.z.bestand[wm];
    if (b === null) return Infinity;
    const liste = this.liste();
    const bis = liste.indexOf(vor);
    let reserviert = 0;
    for (const id of liste.slice(0, bis)) {
      const st = this.z.meldungen[id];
      if (st.stufe === "g3" && st.g2?.wirkmittel === wm) reserviert += 1;
    }
    return b - reserviert;
  }

  private waehle(m: Meldung, tFreigabe: number, vor: string): string[] {
    const inh = this.welt;
    const zp = this.zerstoertPrognose();
    return this.reihenfolge.filter((w) => inh.wirkmittel[w] && this.bestand(w, vor) > 0 && vorhersage(inh, m, w, tFreigabe, zp).pruefung.zulaessig);
  }

  // ---------------------------------------------------------------- Personen

  /** Entscheidungen, die zur Zeit t fällig sind (in Reihenfolge der Meldungen). */
  entscheiden(t: number): void {
    const faellig = Object.values(this.personen).filter((p) => p.aktuell && p.aktuell.ende <= t + 1e-9);
    const liste = this.liste();
    faellig.sort((a, b) => liste.indexOf(a.aktuell!.meldung) - liste.indexOf(b.aktuell!.meldung));
    for (const p of faellig) {
      const id = p.aktuell!.meldung;
      p.aktuell = null;
      this.entscheide(p.stufe, id, t);
    }
  }

  private eintrag(id: string): Entscheidung {
    let e = this.entscheidungen.get(id);
    if (!e) this.entscheidungen.set(id, (e = { meldung: id }));
    return e;
  }

  private entscheide(stufe: Stufe, id: string, t: number): void {
    const z = this.z;
    if (z.ende) return;
    const st = z.meldungen[id];
    const inh = this.welt;
    const m = inh.meldungen[id];
    const loes = m.loesung ?? { G1: "ANNEHMEN", G2: "BEKÄMPFEN", G3: "FREIGABE" };
    const e = this.eintrag(id);
    if (stufe === "G1") {
      if (st.stufe !== "g1") return;
      const ok = this.opt.team === "naiv" ? m.argus.empfehlung !== "UNKLAR" : loes.G1.startsWith("ANNEHMEN");
      e.g1 = { t, ok };
      this.senden("g1_entscheid", { meldung: id, entscheid: ok ? "annehmen" : "ablehnen" }, "g1");
      return;
    }
    if (stufe === "G2") {
      if (st.stufe !== "g2") return;
      const zul = this.waehle(m, t + this.zeiten.G3, id);
      let wahl: string | null;
      if (this.opt.team === "naiv") {
        wahl = zul[0] ?? ["LM", "MRS"].find((w) => inh.wirkmittel[w] && this.bestand(w, id) > 0) ?? null;
      } else {
        if (loes.G2.split(":")[0].includes("BEOBACHTEN")) {
          e.g2 = { t, wahl: "BEOBACHTEN" };
          this.senden("g2_empfehlung", { meldung: id, empfehlung: "beobachten" }, "g2");
          return;
        }
        if (loes.G2.startsWith("NICHT") || loes.G1.startsWith("ABLEHNEN")) {
          e.g2 = { t, wahl: "NICHT" };
          this.senden("g2_empfehlung", { meldung: id, empfehlung: "nicht_bekaempfen" }, "g2");
          return;
        }
        wahl = zul[0] ?? null;
      }
      if (!wahl) {
        e.g2 = { t, wahl: "NICHT" };
        this.senden("g2_empfehlung", { meldung: id, empfehlung: "nicht_bekaempfen", begruendung: "kein Wirkmittel ohne Warnung" }, "g2");
        return;
      }
      e.g2 = { t, wahl };
      this.senden("g2_empfehlung", { meldung: id, empfehlung: "bekaempfen", wirkmittel: wahl }, "g2");
      return;
    }
    // G3
    if (st.stufe !== "g3") return;
    let wm = st.g2?.wirkmittel;
    if (this.opt.team === "ideal") {
      if (!loes.G3.startsWith("FREIGABE")) {
        e.g3 = { t, was: "ABLEHNEN" };
        this.senden("g3_entscheid", { meldung: id, entscheid: "ablehnen" }, "g3");
        return;
      }
      const jetzt = this.waehle(m, t, id);
      if (!wm || !jetzt.includes(wm)) {
        if (!jetzt.length) {
          e.g3 = { t, was: "ZURUECK" };
          this.senden("g3_entscheid", { meldung: id, entscheid: "zurueck", bemerkung: "Warnung zum Einschlag" }, "g3");
          return;
        }
        // anderes Wirkmittel: zurück an G2, G2 empfiehlt sofort neu, G3 gibt frei (alles zur selben Zeit)
        wm = jetzt[0];
        this.senden("g3_entscheid", { meldung: id, entscheid: "zurueck", bemerkung: `besser ${wm}` }, "g3");
        this.senden("g2_empfehlung", { meldung: id, empfehlung: "bekaempfen", wirkmittel: wm }, "g2");
      }
    }
    e.g3 = { t, was: "FREIGABE", wm };
    this.senden("g3_entscheid", { meldung: id, entscheid: "freigabe" }, "g3");
  }

  /** Freie Personen nehmen die nächste Meldung auf (in Reihenfolge, warten auf frühere, die noch kommen). */
  aufnehmen(t: number): void {
    if (this.z.ende) return;
    for (const p of [this.personen.G1, this.personen.G2, this.personen.G3]) {
      while (!p.aktuell) {
        const liste = this.liste();
        const id = liste[p.zeiger];
        if (!id) break;
        const was = this.lage(p.stufe, id);
        if (was === "warten") break;
        p.zeiger += 1;
        if (was === "aufnehmen") p.aktuell = { meldung: id, ende: t + this.zeiten[p.stufe] };
      }
    }
  }

  /** Was eine Person mit der Meldung tut: aufnehmen, überspringen (kommt nie zu ihr) oder warten. */
  private lage(stufe: Stufe, id: string): "aufnehmen" | "ueberspringen" | "warten" {
    const st = this.z.meldungen[id];
    const e = this.entscheidungen.get(id);
    if (st.stufe === "entfallen") return "ueberspringen";
    if (stufe === "G1") return st.stufe === "g1" ? "aufnehmen" : "ueberspringen";
    if (stufe === "G2") {
      if (e?.g2) return "ueberspringen";
      if (st.stufe === "g2") return "aufnehmen";
      return st.stufe === "g1" ? "warten" : "ueberspringen";
    }
    if (e?.g3) return "ueberspringen";
    if (st.stufe === "g3") return "aufnehmen";
    if (st.stufe === "g1" || (st.stufe === "g2" && !e?.g2)) return "warten";
    return "ueberspringen";
  }
}

/** Referenz der Simulation (tests/referenz_durchlauf.json), soweit die Modellteams sie brauchen. */
export interface DrehbuchReferenz {
  zeiten: { G1: number; G2: number; G3: number; ft_nach_angebot: number };
  reihenfolge_wirkmittel: string[];
  laeufe: { team: Team; einspielen: Record<string, number> }[];
}

/**
 * Die fünf Teams des Drehbuchs (tools/drehbuch_plan.ts für tools/e2e_drehbuch.py, Demo der Auswertung): die Läufe
 * der Simulation, G3 mit Lagemeldungen nach LAGE_STANDARD. Team 3 (naiv + 4 Verstärkungen) liest I-04 nach einer
 * Minute und warnt G1 und G2 – gibt die PT-91 aber trotzdem frei (Fast-Track, G2 folgt ARGUS): Die Information kam
 * an, entschieden hat sie nicht. Am Ausgang der Meldungen ändert das nichts.
 */
export function drehbuchTeams(ref: DrehbuchReferenz, notizen: Record<number, ModellOptionen["notizen"]> = {}): { name: string; opt: ModellOptionen }[] {
  return ref.laeufe.map((l, i) => ({
    name: `team${i + 1}`,
    opt: {
      team: l.team, einspielen: l.einspielen, zeiten: ref.zeiten, ftNachAngebot: ref.zeiten.ft_nach_angebot, reihenfolge: ref.reihenfolge_wirkmittel,
      ...(i === 2 ? { lage: { quittieren_s: 30, i04_s: 60, hinweis_s: 110, hinweis: "Achtung: im Süden polnische Panzer möglich (PT-91)" } } : {}),
      ...(notizen[i] ? { notizen: notizen[i] } : {}),
    },
  }));
}

/** Spielt mehrere Teams parallel mit gesteuerter Uhr bis zum Spielende durch. */
export function spieleDurch(inh: Inhalte, teams: { name: string; opt: ModellOptionen }[]): Modellteam[] {
  const uhr = new Uhr();
  const tg = new Taktgeber(0);
  const liste = teams.map((x) => new Modellteam(inh, x.opt, x.name, uhr, tg));
  let t = 0;
  for (let schritt = 0; schritt < 20000; schritt++) {
    uhr.setze(t);
    for (const m of liste) m.steuern(t);
    tg.takt();
    for (let runde = 0; runde < 5; runde++) {
      for (const m of liste) m.entscheiden(t);
      tg.takt();
      for (const m of liste) m.aufnehmen(t);
    }
    if (liste.every((m) => m.z.ende)) break;
    const naechste = Math.min(...liste.flatMap((m) => m.termine(t)));
    if (!Number.isFinite(naechste)) break;
    t = naechste;
  }
  tg.stoppen();
  return liste;
}

export { NACH };
