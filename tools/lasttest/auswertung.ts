// Auswertung des Lasttests: Kennzahlen je Team und über die Spielzeit, Teilstrecken, Diagnose der Seite.
// Hauptwert ist „Klick → Protokoll“: vom Senden eines Bots bis das Ereignis dazu im Protokoll seines eigenen
// Fensters steht (über seine eigene Verbindung) – das, was ein Spieler als Reaktion auf seinen Klick sieht.
import type { Lasttest, TeamAbschluss } from "./lauf";
import { type AktionsMessung, type Kennzahlen, kennzahlen } from "./messung";

/** Zeitfenster der Auswertung über die Spielzeit (s); KRÄHE-01 dauert 1500 s = 10:00–10:25. */
export const FENSTER_S = 300;

export type Ampel = "gruen" | "gelb" | "rot" | "offen";

/** Schwellen der Bewertung (Klick → Protokoll, ms) */
export const SCHWELLEN = {
  gruen: { median: 1000, max: 2000 },
  gelb: { median: 2000, max: 5000 },
};

export interface TeamAuswertung {
  nr: number;
  name: string;
  modell: string;
  /** Bots dieses Teams laufen auf diesem Gerät (sonst nur Stand aus Sicht des Hosts) */
  lokal: boolean;
  geplant: number;
  gesendet: number;
  imProtokoll: number;
  klick: Kennzahlen;
  /** je Zeitfenster über die Spielzeit */
  fenster: Kennzahlen[];
  /** [Spielzeit beim Klick s, Klick → Protokoll ms, Rolle] */
  punkte: [number, number, string][];
  /** größter Verzug eines Klicks gegenüber dem Plan (s Spielzeit) */
  verzugMax: number | null;
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
  /** Teams mit Bots auf diesem Gerät */
  teamsHier: number;
  /** dieses Gerät führt den Host */
  mitHost: boolean;
  verbindungen: number;
  stand: string;
  szenario: string;
  laufzeitS: number;
  /** Uhrzeit des Spielbeginns, z. B. 10:00:00 */
  start: string;
  spielzeit: number;
  dauerS: number;
  gesamt: Kennzahlen;
  ampel: Ampel;
  teamsAus: TeamAuswertung[];
  teilstrecken: { name: string; erklaerung: string; k: Kennzahlen }[];
  diagnose: {
    schleifeMax: number;
    /** Dauer bis alle Verbindungen dieses Geräts standen (s) */
    aufbauS: number | null;
    /** Verdacht: Browser hält nicht alle Long-Polling-Verbindungen gleichzeitig offen */
    verbindungsgrenze: boolean;
    schleifeP99: number | null;
    verdecktS: number;
    abbrueche: number;
    verbindungsFehler: string[];
    protokolle: Record<string, number>;
    nichtGesendet: number;
    offen: number;
    abgelehnt: number;
    hinweise: string[];
    fehler: string[];
  };
}

export function ampel(k: Kennzahlen): Ampel {
  if (k.median === null || k.max === null) return "offen";
  if (k.median <= SCHWELLEN.gruen.median && k.max <= SCHWELLEN.gruen.max) return "gruen";
  if (k.median <= SCHWELLEN.gelb.median && k.max <= SCHWELLEN.gelb.max) return "gelb";
  return "rot";
}

function teamNr(l: Lasttest, team: string): number {
  return l.teamIds.indexOf(team) + 1;
}

export function auswerten(l: Lasttest): Auswertung {
  const m = l.mess;
  const verb = [...m.verbindungen.values()];
  const botKennungen = new Map<number, string[]>();
  for (const v of verb) if (v.art === "bot" && v.teamNr) botKennungen.set(v.teamNr, [...(botKennungen.get(v.teamNr) ?? []), v.kennung]);
  const istBot = new Set(verb.filter((v) => v.art === "bot").map((v) => v.kennung));
  const botAktionen = [...m.aktionen.values()].filter((a) => istBot.has(a.sender));
  const weg = (a: AktionsMessung) => {
    const z = m.zurueck(a);
    return z === undefined ? undefined : z - a.tKlick;
  };
  const dauer = l.inh?.szenario.spieluhr.dauer_s ?? 1500;
  const anzahlFenster = Math.ceil(dauer / FENSTER_S);

  const teamsAus: TeamAuswertung[] = l.sichtbar.map((p) => {
    const id = l.teamIds[p.nr - 1];
    const lokal = l.opt.hier.includes(p.nr);
    const eigene = botAktionen.filter((a) => a.team === id);
    const punkte: [number, number, string][] = [];
    const werte: number[] = [];
    const proFenster: number[][] = Array.from({ length: anzahlFenster }, () => []);
    let verzugMax: number | null = null;
    for (const a of eigene) {
      const w = weg(a);
      if (a.tSpiel !== undefined && a.plan !== undefined) verzugMax = Math.max(verzugMax ?? 0, a.tSpiel - a.plan);
      if (w === undefined) continue;
      werte.push(w);
      const t = a.tSpiel ?? 0;
      punkte.push([t, w, a.rolle ?? "?"]);
      proFenster[Math.min(anzahlFenster - 1, Math.max(0, Math.floor(t / FENSTER_S)))].push(w);
    }
    const st = l.teamStand(p.nr);
    return {
      nr: p.nr,
      name: l.teamNamen[p.nr - 1] ?? `Team ${p.nr}`,
      modell: p.modell,
      lokal,
      geplant: p.aktionen.filter((a) => a.rolle !== "sl").length,
      gesendet: eigene.length,
      imProtokoll: werte.length,
      klick: kennzahlen(werte),
      fenster: proFenster.map(kennzahlen),
      punkte,
      verzugMax,
      abschluss: l.abschluss.find((x) => x.nr === p.nr) ?? null,
      botFehler: l.bots.filter((b) => b.nr === p.nr).flatMap((b) => b.fehler.map((f) => `${b.name}: ${f}`)),
      seq: st.seq,
      spielzeit: st.spielzeit,
    };
  });

  const alle = teamsAus.flatMap((t) => t.punkte.map((x) => x[1]));
  const gesamt = kennzahlen(alle);

  // Teilstrecken (alle Bot-Aktionen)
  const strecke = (f: (a: AktionsMessung) => number | undefined) => kennzahlen(botAktionen.map(f).filter((x): x is number => x !== undefined));
  const kameraden = (a: AktionsMessung) => (botKennungen.get(teamNr(l, a.team)) ?? []).filter((k) => k !== a.sender);
  const verteilung: number[] = [];
  for (const e of m.ereignisse.values()) {
    const nr = teamNr(l, e.team);
    for (const k of botKennungen.get(nr) ?? []) {
      const t = e.ankunft.get(k);
      if (t !== undefined && e.tGeschrieben !== undefined && e.seq > 2) verteilung.push(t - e.tGeschrieben);
    }
  }
  const teilstrecken = [
    { name: "Klick → Server bestätigt", erklaerung: "Schreiben der Aktion über die Verbindung des Bots", k: strecke((a) => a.tBestaetigt !== undefined ? a.tBestaetigt - a.tKlick : undefined) },
    { name: "Klick → beim Host", erklaerung: "Aktion kommt über die Verbindung des Hosts an", k: strecke((a) => a.tHost !== undefined ? a.tHost - a.tKlick : undefined) },
    { name: "Host verarbeitet", erklaerung: "Empfang bis Ereignis geschrieben (Engine)", k: strecke((a) => a.tHost !== undefined && a.tGeschrieben !== undefined ? a.tGeschrieben - a.tHost : undefined) },
    { name: "Host → eigenes Fenster", erklaerung: "Ereignis zurück über die Verbindung des Bots", k: strecke((a) => { const z = m.zurueck(a); return z !== undefined && a.tGeschrieben !== undefined ? z - a.tGeschrieben : undefined; }) },
    { name: "Klick → alle im Team", erklaerung: "bis auch beide Teamkameraden es haben (spätester)", k: strecke((a) => { const z = m.beiTeam(a, kameraden(a)); return z !== undefined ? z - a.tKlick : undefined; }) },
    { name: "Host → Fenster (alle Ereignisse)", erklaerung: "jedes Ereignis inkl. Zeitplan, an jeden Bot", k: kennzahlen(verteilung) },
  ];

  const lags = m.schleife.map((x) => x[1]);
  const lagK = kennzahlen(lags);
  const protokolle: Record<string, number> = {};
  for (const p of l.protokolle.values()) protokolle[p] = (protokolle[p] ?? 0) + 1;
  const fertig = l.phase === "ende";

  return {
    phase: l.phase,
    code: l.code ? l.code.toUpperCase() : null,
    datum: l.beginn ? l.beginn.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "",
    db: l.opt.db.replace(/^https?:\/\//, ""),
    transport: l.opt.transport === "lp" ? "Long-Polling" : "WebSocket",
    tempo: l.tempoIst(),
    teams: l.plan.length || l.opt.teams,
    teamsHier: l.opt.hier.filter((n) => n <= (l.plan.length || l.opt.teams)).length,
    mitHost: l.opt.host,
    verbindungen: l.verbindungen,
    stand: `${__ARGUS_VERSION__} · ${__ARGUS_STAND__}`,
    szenario: l.inh ? `${l.inh.szenario.anzeige ?? l.inh.szenario.id} v${l.inh.szenario.version}` : "",
    laufzeitS: Math.round(l.sekunden()),
    start: l.inh?.szenario.spieluhr.start ?? "10:00:00",
    spielzeit: l.spielzeit(),
    dauerS: dauer,
    gesamt,
    ampel: gesamt.n ? ampel(gesamt) : "offen",
    teamsAus,
    teilstrecken,
    diagnose: {
      schleifeMax: lagK.max ?? 0,
      aufbauS: l.verbindungsaufbauS,
      verbindungsgrenze: l.opt.transport === "lp" && l.verbindungen > 5
        && ((teilstrecken[0].k.max ?? 0) > 5000 || (teilstrecken[0].k.median ?? 0) > 1500 || (l.verbindungsaufbauS ?? 0) > 20),
      schleifeP99: lags.length ? [...lags].sort((a, b) => a - b)[Math.floor(lags.length * 0.99)] : null,
      verdecktS: Math.round(m.verdecktGesamt / 1000),
      abbrueche: verb.reduce((n, v) => n + v.abbrueche, 0),
      verbindungsFehler: [...new Set(verb.flatMap((v) => v.fehler.map((f) => `${v.name}: ${f}`)))],
      protokolle,
      nichtGesendet: fertig ? l.bots.reduce((n, b) => n + (b.plan.length - b.i), 0) : 0,
      offen: botAktionen.filter((a) => weg(a) === undefined).length,
      abgelehnt: botAktionen.filter((a) => a.abgelehnt).length,
      hinweise: l.hinweise.filter((h) => h.art !== "info").map((h) => `${h.t} s · ${h.wer}: ${h.text}`),
      fehler: [...l.fehler],
    },
  };
}

/** Rohdaten zum Herunterladen (JSON): Auswertung plus jede Aktion mit allen Zeitpunkten. */
export function rohdaten(l: Lasttest): unknown {
  const m = l.mess;
  const a = auswerten(l);
  const rund = (x: number | undefined, bezug: number) => (x === undefined ? null : Math.round((x - bezug) * 10) / 10);
  return {
    ...a,
    teamsAus: a.teamsAus.map(({ punkte: _p, ...rest }) => rest),
    aktionen: [...m.aktionen.values()].map((x) => ({
      id: x.id, team: teamNr(l, x.team), rolle: x.rolle, typ: x.typ, meldung: x.meldung, t_spiel: x.tSpiel, plan: x.plan,
      bestaetigt_ms: rund(x.tBestaetigt, x.tKlick), host_ms: rund(x.tHost, x.tKlick), geschrieben_ms: rund(x.tGeschrieben, x.tKlick),
      zurueck_ms: rund(m.zurueck(x), x.tKlick), seq: x.seq, abgelehnt: x.abgelehnt, fehler: x.fehler,
    })),
    verbindungen: [...m.verbindungen.values()],
    seite: { schleife_verzug_ms: m.schleife.filter((x) => x[1] > 50) },
  };
}
