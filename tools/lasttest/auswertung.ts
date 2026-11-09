// Auswertung des Lasttests (seit 2.6, H1.6): Was die Änderung H1 verspricht, in drei Ampeln –
//   1. Spiel der Teams flüssig: Klick → eigener Spielstand (lokal, ohne Netz) und Ereignisschleife der Seite,
//   2. Spielleitung holt auf: Statusmeldungen und Protokolle kommen an, bei Spielende vollständig (wie am Laptop),
//   3. Auswertung vollständig: alle Teams mit Spielende, Ausgang je Fall wie ohne Netz.
// Dazu je Team die Wege Laptop → Spielleitung (Upload) und das Alter der Statusmeldung über die Echtzeit.
import type { Lasttest, TeamAbschluss } from "./lauf";
import { type Kennzahlen, type Probe, kennzahlen } from "./messung";

export type Ampel = "gruen" | "gelb" | "rot" | "offen";

/** Schwellen: Klick → eigener Stand (ms) und Verzug der Ereignisschleife (ms) */
export const SCHWELLEN = {
  klick: { gruen: 100, gelb: 300 },
  schleife: { gruen: 500, gelb: 1500 },
};

export interface TeamAuswertung {
  nr: number;
  name: string;
  modell: string;
  /** Team-Laptop läuft auf diesem Gerät */
  lokal: boolean;
  geplant: number;
  gesendet: number;
  klick: Kennzahlen;
  /** ms vom Entstehen am Laptop bis bei der Spielleitung / beim Plenum */
  upload: Kennzahlen;
  plenum: Kennzahlen;
  /** größtes Alter der Statusmeldung bei der Spielleitung (s) und größter Rückstand des Protokolls (s) */
  statusMax: number | null;
  rueckstandMax: number | null;
  startMs: number | null;
  proben: Probe[];
  abschluss: TeamAbschluss | null;
  botFehler: string[];
  seq: number;
  spielzeit: number;
}

export interface Auswertung {
  phase: string;
  code: string | null;
  datum: string;
  db: string;
  transport: string;
  tempo: number;
  teams: number;
  teamsHier: number;
  mitSl: boolean;
  plenum: boolean;
  verzugS: number;
  trennen: { ab: number; dauer: number } | null;
  trennung: { von: number; bis: number | null } | null;
  verbindungen: number;
  stand: string;
  szenario: string;
  laufzeitS: number;
  /** Echtzeit seit „Start für alle“ (s) */
  seitStart: number;
  start: string;
  spielzeit: number;
  dauerS: number;
  klick: Kennzahlen;
  upload: Kennzahlen;
  statusMax: number | null;
  rueckstandMax: number | null;
  startSpanne: number | null;
  aufholenS: number | null;
  ampel: { spiel: Ampel; sl: Ampel; auswertung: Ampel };
  /** Teams in der Auswertung der Spielleitung, davon mit Spielende */
  auswertungTeams: { n: number; ende: number } | null;
  teamsAus: TeamAuswertung[];
  diagnose: {
    schleifeMax: number;
    schleifeP99: number | null;
    aufbauS: number | null;
    verdecktS: number;
    abbrueche: number;
    verbindungsFehler: string[];
    nichtGesendet: number;
    abgelehnt: number;
    hinweise: string[];
    fehler: string[];
  };
}

function ampelKlick(k: Kennzahlen, schleifeMax: number): Ampel {
  if (k.max === null) return "offen";
  if (k.max <= SCHWELLEN.klick.gruen && schleifeMax <= SCHWELLEN.schleife.gruen) return "gruen";
  if (k.max <= SCHWELLEN.klick.gelb && schleifeMax <= SCHWELLEN.schleife.gelb) return "gelb";
  return "rot";
}

export function auswerten(l: Lasttest): Auswertung {
  const m = l.mess;
  const verb = [...m.verbindungen.values()];
  // Ereignisschleife nur während des Spiels (Plan und Lobby rechnen vorher viel in derselben Seite)
  const von = l.tUhrStart ?? Infinity;
  const bis = l.tSpielende ?? Infinity;
  const lags = m.schleife.filter((x) => x[0] >= von && x[0] <= bis).map((x) => x[1]);
  const lagK = kennzahlen(lags);
  const fertig = l.phase === "ende" || l.phase === "fehler" || l.phase === "abgebrochen";

  const teamsAus: TeamAuswertung[] = l.sichtbar.map((p) => {
    const lokal = l.opt.hier.includes(p.nr) && !!l.laptop(p.nr);
    const klicks = m.klicks.filter((k) => k.nr === p.nr);
    const proben = m.proben.get(p.nr) ?? [];
    const werte = (wer: string) => [...(m.ankunft.get(wer)?.get(p.nr)?.values() ?? [])];
    const maxVon = (i: 1 | 2) => {
      const w = proben.map((x) => x[i]).filter((x): x is number => x !== null);
      return w.length ? Math.max(...w) : null;
    };
    const st = l.teamStand(p.nr);
    const lp = l.laptop(p.nr);
    return {
      nr: p.nr,
      name: l.teamNamen[p.nr - 1] ?? `Team ${p.nr}`,
      modell: `${p.modell} · ${p.dauer} s`,
      lokal,
      geplant: p.aktionen.length,
      gesendet: klicks.length,
      klick: kennzahlen(klicks.filter((k) => k.tLokal !== undefined).map((k) => k.tLokal! - k.tKlick)),
      upload: kennzahlen(werte("sl")),
      plenum: kennzahlen(werte("plenum")),
      statusMax: maxVon(1),
      rueckstandMax: maxVon(2),
      startMs: m.start.get(p.nr) ?? null,
      proben,
      abschluss: l.abschluss.find((x) => x.nr === p.nr) ?? null,
      botFehler: lp ? lp.fehler.map((f) => `${lp.name}: ${f}`) : [],
      seq: st.seq,
      spielzeit: st.spielzeit,
    };
  });

  const klick = kennzahlen(m.klicks.filter((k) => k.tLokal !== undefined).map((k) => k.tLokal! - k.tKlick));
  const upload = kennzahlen(teamsAus.flatMap((t) => [...(m.ankunft.get("sl")?.get(t.nr)?.values() ?? [])]));
  const maxAlle = (f: (t: TeamAuswertung) => number | null) => {
    const w = teamsAus.map(f).filter((x): x is number => x !== null);
    return w.length ? Math.max(...w) : null;
  };
  const abschluss = teamsAus.map((t) => t.abschluss).filter((x): x is TeamAbschluss => !!x);

  // Ampel 2: Spielleitung (am Gerät mit Spielleitung); bei Spielende vollständig, sonst offen
  let sl: Ampel = "offen";
  if (l.opt.sl && fertig && abschluss.length) {
    sl = abschluss.every((a) => a.slGleich && a.plenumGleich !== false) && l.aufholenS !== null ? "gruen" : "rot";
  } else if (!l.opt.sl && fertig && abschluss.length) {
    // Gerät ohne Spielleitung: alles hochgeladen?
    sl = l.aufholenS !== null ? "gruen" : "rot";
  }
  // Ampel 3: Auswertung der Spielleitung
  let auswertung: Ampel = "offen";
  const ausw = l.auswertung;
  const auswertungTeams = ausw ? { n: ausw.teams.length, ende: ausw.teams.filter((t) => t.ende).length } : null;
  if (ausw && fertig) {
    const vollstaendig = ausw.teams.length === l.plan.length && ausw.teams.every((t) => t.ende);
    const wieOhneNetz = abschluss.every((a) => a.faelleGleich !== false);
    auswertung = !vollstaendig ? "rot" : wieOhneNetz ? "gruen" : "gelb";
  }

  return {
    phase: l.phase,
    code: l.code ? l.code.toUpperCase() : null,
    datum: l.beginn ? l.beginn.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "",
    db: l.opt.db.replace(/^https?:\/\//, ""),
    transport: l.opt.transport === "lp" ? "Long-Polling" : "WebSocket",
    tempo: l.opt.tempo,
    teams: l.plan.length || l.opt.teams,
    teamsHier: l.laptops.length,
    mitSl: l.opt.sl,
    plenum: !!l.plenum,
    verzugS: l.opt.verzug / 1000,
    trennen: l.opt.trennen,
    trennung: m.trennung,
    verbindungen: l.verbindungen,
    stand: `${__ARGUS_VERSION__} · ${__ARGUS_STAND__}`,
    szenario: l.inh ? `${l.inh.szenario.anzeige ?? l.inh.szenario.id} v${l.inh.szenario.version}` : "",
    laufzeitS: Math.round(l.sekunden()),
    seitStart: l.seitStart(),
    start: l.inh?.szenario.spieluhr.start ?? "10:00:00",
    spielzeit: l.spielzeit(),
    dauerS: l.inh?.szenario.spieluhr.dauer_s ?? 1500,
    klick,
    upload,
    statusMax: maxAlle((t) => t.statusMax),
    rueckstandMax: maxAlle((t) => t.rueckstandMax),
    startSpanne: m.startSpanne,
    aufholenS: l.aufholenS,
    ampel: { spiel: ampelKlick(klick, lagK.max ?? 0), sl, auswertung },
    auswertungTeams,
    teamsAus,
    diagnose: {
      schleifeMax: lagK.max ?? 0,
      schleifeP99: lags.length ? [...lags].sort((a, b) => a - b)[Math.floor(lags.length * 0.99)] : null,
      aufbauS: l.verbindungsaufbauS,
      verdecktS: Math.round(m.verdecktGesamt / 1000),
      abbrueche: verb.reduce((n, v) => n + v.abbrueche, 0),
      verbindungsFehler: [...new Set(verb.flatMap((v) => v.fehler.map((f) => `${v.name}: ${f}`)))],
      nichtGesendet: l.phase === "ende" ? l.laptops.reduce((n, x) => n + (x.plan.length - x.i), 0) : 0,
      abgelehnt: m.klicks.filter((k) => k.abgelehnt).length,
      hinweise: l.hinweise.filter((h) => h.art !== "info").map((h) => `${h.t} s · ${h.wer}: ${h.text}`),
      fehler: [...l.fehler],
    },
  };
}

/** Rohdaten zum Herunterladen (JSON): Auswertung plus jeder Klick und alle Proben. */
export function rohdaten(l: Lasttest): unknown {
  const m = l.mess;
  const a = auswerten(l);
  return {
    ...a,
    klicks: m.klicks.map((k) => ({ team: k.nr, typ: k.typ, meldung: k.meldung, t_spiel: k.tSpiel, plan: k.plan, lokal_ms: k.tLokal !== undefined ? Math.round((k.tLokal - k.tKlick) * 10) / 10 : null, abgelehnt: k.abgelehnt })),
    ankunft: Object.fromEntries([...m.ankunft].map(([wer, teams]) => [wer, Object.fromEntries([...teams].map(([nr, seqs]) => [nr, [...seqs].map(([seq, ms]) => [seq, Math.round(ms)])]))])),
    verbindungen: [...m.verbindungen.values()],
    seite: { schleife_verzug_ms: m.schleife.filter((x) => x[1] > 50).map(([t, v]) => [Math.round(t - (l.tUhrStart ?? 0)), v]) },
  };
}
