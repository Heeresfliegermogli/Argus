// Auswertung im Plenum (Schritt 8): Auflösung nach Spielende am Smartboard, gesteuert von der Spielleitung.
//
// Seit 2.7 (Änderungsliste G) 15 min in Kapiteln (Plan aus den Daten, kern/auswertung.ts kapitelPlan), je ein Klick oder Bild ↓ / →:
//   Teamvergleich 1:00 – Fälle × Teams (7 Teams in 1530 px): Ausgang, Entscheidung, Sekunden ab Eingang
//   Replay 4:00       – Standard S3 und S2 (je 2:00), S1 und S4–S8 zuschaltbar (die Zeit je Fall sinkt): Zeitleiste aller Teams,
//                       Kontrollkarte zum Durchscrubben, Drohnenbild wie das Team es sah, „Wie lange habt ihr hingeschaut?“, Leitfragen
//   Bilanz 2:00       – „Das ist es wert“: je Team und „ARGUS allein“ (Referenzlauf mit der Engine) Feindfahrzeuge, Wert in Spielwerten,
//                       Munition, Zeit, eigene Panzer; ein Klick deckt auf, was nicht in der Bilanz steht (Fehlbekämpfungen ohne Preis)
//   Impuls 1:00       – Zitat ohne Quelle („Stimmt ihr zu?“), ein Klick deckt die Quelle auf; weitere Zitate zuschaltbar
//   Diskussion 6:00   – Wertekompass mit den fünf Leitfragen
//   Abschluss 1:00    – vier Kernaussagen, Schlussfrage
// Kennzahlen, Konfidenz und „Preis des Abwartens“ sind zuschaltbar (Menü „+“). Eine kleine Uhr je Kapitel zeigt Soll und Ist; nichts
// springt von selbst weiter. Export der Ergebnisse ohne Namen.
// Gebaut für das Smartboard (1530 × 800). Seit Liste J (J3.3): In kleineren Fenstern (Dienst-Laptop 1536 × 730) wird die Auswertung als
// Ganzes verkleinert (Mindestgröße 1530 × 800, gemeinsam/fenster.ts) – nichts wird abgeschnitten; ab 1920 × 960 wächst sie mit.
//
// Leitplanken: Die Auswertung zeigt Teams, nie Namen von Personen. Sie bleibt bei der Ethik (Fehlbekämpfungen,
// Widerspruch, Informationsweitergabe) – keine Rangliste, keine Punkte, keine Darstellung getöteter Menschen.
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Inhalte } from "../inhalte/typen";
import {
  AUSGANG_TEXT, type Auswertung, FEHL_TEXT, KONFIDENZ_HOCH, type FallDef, type FallErgebnis, type KapitelDef, type KapitelWahl, kapitelPlan,
  type TeamAuswertung, type TeamLauf, type ZeitMarke, auswerten, ereignisseBis, exportAnonym, exportCsv, fallFenster, fallInjects, sekText,
  zeitleiste, zustandBis,
} from "../kern/auswertung";
import { type Bilanz, euro, FEHL_IDS, mio } from "../kern/bilanz";
import { bekannteZiele, effekte } from "../kern/effekte";
import { weltFuer } from "../kern/lage";
import { lagebildKontrolle } from "../kern/lagebild";
import { position, vorhanden } from "../kern/geometrie";
import { gemeldetePosition } from "../kern/regeln";
import { mmss, uhrzeit } from "../kern/uhr";
import { argusBei } from "../kern/eloka";
import { zielNr } from "../kern/zielnummern";
import { PANZER_STUFE_TEXT } from "../kern/verluste";
import type { Spielzustand } from "../kern/zustand";

/** „Ziel 8“ – in allen Teams dieselbe Nummer (B7). */
function zielText(inh: Inhalte, id: string): string {
  return `Ziel ${zielNr(inh, null, id)}`;
}
import type { LiveLage } from "../drohne/livebild";
import { Menue } from "./gemeinsam/bausteine";
import { setzeMindestgroesse } from "./gemeinsam/fenster";
import { LagekarteAnsicht } from "./gemeinsam/lagekarte";
import { LiveDrohnenFenster } from "./gemeinsam/livedrohne";
import { TeamMarke } from "./gemeinsam/rahmen";

/**
 * Wie schnell das Replay läuft (Spielsekunden je Sekunde): so, dass ein Fall in ca. 45 s abläuft (×4 bis ×15) – vom
 * Budget je Fall bleibt so der größte Teil für das Gespräch.
 */
export const REPLAY_DAUER_S = 45;
export function replayTempo(von: number, bis: number): number {
  return Math.max(4, Math.min(15, Math.round((bis - von) / REPLAY_DAUER_S)));
}

/** Kapitel der Auswertung mit Soll in s (seit 2.7 aus kapitelPlan; budget = sek). */
export type Kapitel = KapitelDef & { budget: number };

/**
 * Kapitel der Auswertung (seit 2.7, G1): Standard aus den Daten (15 min), zugeschaltete Kapitel und Fälle nach Wahl der Spielleitung.
 */
export function kapitelListe(inh: Inhalte, wahl: KapitelWahl = {}): Kapitel[] {
  return kapitelPlan(inh, wahl).kapitel.map((k) => ({ ...k, budget: k.sek }));
}

/** Gesamtbudget, wenn das Szenario keinen Kapitelplan hat (seit 2.7 aus den Daten: 15 min). */
export const BUDGET_GESAMT = 15 * 60;

export interface AuswertungProps {
  inh: Inhalte;
  teams: TeamLauf[];
  /** plenum: Smartboard · sl: Fenster der Spielleitung (mit Notizen) · demo: Probe ohne Sitzung */
  art: "plenum" | "sl" | "demo";
  zurueck?: { text: string; aktion: () => void };
  /** Spielleitung: Notiz zu einem Fall für ein Team schreiben */
  notiz?: (team: string, fall: string, text: string) => void;
  /** oben links, z. B. Code der Sitzung */
  kennung?: string;
}

function teamSchluessel(teams: TeamLauf[]): string {
  return teams.map((t) => `${t.id}:${t.zustand.seq}:${t.protokoll.length}:${t.name}:${t.farbe}`).join("|");
}

/**
 * Referenzlauf „ARGUS allein“ (G2.1): einmal beim Öffnen der Auswertung mit der Engine gerechnet (ca. 0,2–0,5 s), nicht im ersten
 * Bild – bis dahin null.
 */
function useReferenz(inh: Inhalte): Spielzustand | null {
  const [z, setZ] = useState<Spielzustand | null>(null);
  useEffect(() => {
    if (!inh.regeln.bilanz) return;
    let aus = false;
    const t = setTimeout(() => {
      void import("../engine/referenzlauf").then(({ argusAllein }) => {
        if (!aus) setZ(argusAllein(inh).z);
      });
    }, 30);
    return () => {
      aus = true;
      clearTimeout(t);
    };
  }, [inh]);
  return z;
}

/** Schritte innerhalb eines Kapitels (der Presenter blättert erst sie, dann das nächste Kapitel). */
interface Schritte {
  /** Bilanz: Teil 2 „Nicht in der Bilanz“ aufgedeckt */
  aufgedeckt: boolean;
  /** Impuls: Folie (0 ohne Quelle, 1 aufgedeckt, ab 2 zugeschaltete Zitate) */
  folie: number;
  /** Impuls: weitere Zitate zugeschaltet */
  weitere: boolean;
}

/** Mindestgröße der Auswertung (Smartboard); darunter wird sie gleichmäßig verkleinert (J3.3). */
export const AUSWERTUNG_MIN = { breite: 1530, hoehe: 800 };

export function AuswertungAnsicht(p: AuswertungProps) {
  useEffect(() => {
    setzeMindestgroesse(AUSWERTUNG_MIN);
    return () => setzeMindestgroesse(null);
  }, []);
  const schl = teamSchluessel(p.teams);
  const ref = useReferenz(p.inh);
  const a = useMemo(() => auswerten(p.inh, p.teams, ref ? { zustand: ref } : null), [p.inh, schl, ref]);
  const [wahl, setWahl] = useState<KapitelWahl>({});
  const plan = useMemo(() => kapitelPlan(p.inh, wahl), [p.inh, wahl]);
  const kapitel: Kapitel[] = useMemo(() => plan.kapitel.map((k) => ({ ...k, budget: k.sek })), [plan]);
  const [kid, setKid] = useState<string>(kapitel[0]?.id ?? "teams");
  const nr = Math.max(0, kapitel.findIndex((k) => k.id === kid));
  const [team, setTeam] = useState<string | null>(null);
  const [spielt, setSpielt] = useState(false);
  const [schritte, setSchritte] = useState<Schritte>({ aufgedeckt: false, folie: 0, weitere: false });
  const k = kapitel[Math.min(nr, kapitel.length - 1)];
  const teamId = team && a.teams.some((t) => t.id === team) ? team : a.teams[0]?.id ?? null;
  const uhr = useZeitbudget(k.id);
  const folien = p.inh.szenario.auswertung.impuls?.folien ?? [];
  const folienMax = schritte.weitere ? folien.length - 1 : Math.min(1, folien.length - 1);

  const geh = (n: number) => {
    setSpielt(false);
    const i = Math.max(0, Math.min(kapitel.length - 1, n));
    setKid(kapitel[i].id);
  };
  /** Presenter „weiter“: erst die Schritte im Kapitel (Bilanz aufdecken, Impuls-Folien), dann das nächste Kapitel. */
  const weiter = () => {
    if (k.id === "bilanz" && !schritte.aufgedeckt && a.teams.length) return setSchritte((x) => ({ ...x, aufgedeckt: true }));
    if (k.id === "impuls" && schritte.folie < folienMax) return setSchritte((x) => ({ ...x, folie: x.folie + 1 }));
    geh(nr + 1);
  };
  const zurueck = () => {
    if (k.id === "impuls" && schritte.folie > 0) return setSchritte((x) => ({ ...x, folie: x.folie - 1 }));
    if (k.id === "bilanz" && schritte.aufgedeckt) return setSchritte((x) => ({ ...x, aufgedeckt: false }));
    geh(nr - 1);
  };
  // Presenter und Tastatur: Bild ↓ / → weiter, Bild ↑ / ← zurück, Pos1/Ende, 1–9 Team, Leertaste/P Replay
  const tasten = useRef({ nr, geh, weiter, zurueck, kapitel, a, setTeam, setSpielt, k });
  tasten.current = { nr, geh, weiter, zurueck, kapitel, a, setTeam, setSpielt, k };
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      const ziel = e.target as HTMLElement | null;
      if (ziel && (ziel.tagName === "INPUT" || ziel.tagName === "TEXTAREA" || ziel.tagName === "SELECT" || ziel.isContentEditable)) return;
      if (document.querySelector(".lupe-schirm")) return; // Vergrößerung des Drohnenbilds offen (Esc schließt)
      const x = tasten.current;
      if (["PageDown", "ArrowRight", "ArrowDown"].includes(e.key)) x.weiter();
      else if (["PageUp", "ArrowLeft", "ArrowUp", "Backspace"].includes(e.key)) x.zurueck();
      else if (e.key === "Home") x.geh(0);
      else if (e.key === "End") x.geh(x.kapitel.length - 1);
      else if (/^[1-9]$/.test(e.key) && x.a.teams[Number(e.key) - 1]) x.setTeam(x.a.teams[Number(e.key) - 1].id);
      else if ((e.key === " " || e.key.toLowerCase() === "p") && x.k.fall) x.setSpielt((v) => !v);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, []);

  return (
    <div class="rahmen auswertung-rahmen" data-rolle="plenum" data-ansicht="auswertung">
      <header class="kopf auswertung-kopf">
        <div class="kopf-links">
          <div class="rollenband rolle-plenum"><span class="marke">ARGUS</span><span>Auswertung</span></div>
          {p.kennung && <span class="sehr-leise klein mono">{p.kennung}</span>}
        </div>
        <nav class="kapitel-leiste" aria-label="Kapitel der Auswertung">
          <button type="button" class="knopf kapitel-pfeil" onClick={zurueck} disabled={nr === 0 && !(k.id === "impuls" && schritte.folie > 0)} aria-label="zurück" title="zurück (Bild ↑, ←)">◂</button>
          {kapitel.map((x, i) => (
            <button type="button" key={x.id} class={`kapitel-chip ${i === nr ? "an" : ""} ${x.fall ? "fall" : ""} ${x.zuschaltbar ? "zusatz" : ""}`} onClick={() => geh(i)} data-kapitel={x.id}
              aria-current={i === nr ? "step" : undefined} title={`${x.titel} · ${mmss(x.budget)}`}>
              {x.fall ? x.kurz : <>{x.kurz}</>}
            </button>
          ))}
          <KapitelMenue plan={plan} wahl={wahl} setWahl={setWahl} />
          <button type="button" class="knopf kapitel-pfeil" onClick={weiter} disabled={nr === kapitel.length - 1} aria-label="weiter" title="weiter (Bild ↓, →, Presenter)" data-testid="weiter">▸</button>
        </nav>
        <div class="kopf-rechts">
          <Zeitbudget uhr={uhr} k={k} gesamt={plan.summe} />
          <ExportMenue inh={p.inh} teams={p.teams} a={a} />
          {p.zurueck && <button type="button" class="knopf klein" onClick={p.zurueck.aktion} data-testid="auswertung-zurueck">{p.zurueck.text}</button>}
        </div>
      </header>
      <main class="auswertung" data-kapitel={k.id} data-testid="auswertung">
        {a.teams.length === 0 && !["impuls", "diskussion", "abschluss"].includes(k.id) ? <div class="leer">Noch kein Team hat gespielt.</div>
          : k.id === "teams" ? <Teamvergleich a={a} inh={p.inh} waehle={(f, t) => {
            setTeam(t);
            if (!kapitel.some((x) => x.id === f)) setWahl((w) => ({ ...w, faelle: [...plan.replay.faelle.map((x) => x.id), f] }));
            setSpielt(false);
            setKid(f);
          }} />
            : k.id === "kennzahlen" ? <KennzahlenTafel a={a} inh={p.inh} />
              : k.id === "konfidenz" ? <KonfidenzTafel a={a} inh={p.inh} sl={p.art === "sl"} />
                : k.fall ? <Replay key={k.id} a={a} inh={p.inh} teams={p.teams} fall={k.fall} team={teamId!} setTeam={setTeam} spielt={spielt} setSpielt={setSpielt} notiz={p.notiz} />
                  : k.id === "preis" ? <PreisDesAbwartens a={a} inh={p.inh} />
                    : k.id === "bilanz" ? <BilanzTafel a={a} inh={p.inh} aufgedeckt={schritte.aufgedeckt} aufdecken={() => setSchritte((x) => ({ ...x, aufgedeckt: !x.aufgedeckt }))} />
                      : k.id === "impuls" ? <ImpulsTafel inh={p.inh} folie={schritte.folie} weitere={schritte.weitere}
                        setFolie={(f) => setSchritte((x) => ({ ...x, folie: f, weitere: x.weitere || f > 1 }))} />
                        : k.id === "diskussion" ? <DiskussionTafel inh={p.inh} />
                          : <Abschluss a={a} inh={p.inh} />}
      </main>
    </div>
  );
}

/** Menü „+“ (G1.1): zuschaltbare Kapitel (Kennzahlen, Konfidenz, Preis des Abwartens) und Fälle für das Replay. */
function KapitelMenue(p: { plan: ReturnType<typeof kapitelPlan>; wahl: KapitelWahl; setWahl: (w: KapitelWahl) => void }) {
  const [offen, setOffen] = useState(false);
  const an = new Set(p.wahl.zusatz ?? []);
  const faelle = p.plan.replay.faelle.map((f) => f.id);
  const alleFaelle = [...faelle, ...p.plan.replay.zuschaltbar.map((f) => f.id)];
  const titel = new Map([...p.plan.replay.faelle, ...p.plan.replay.zuschaltbar].map((f) => [f.id, f.titel]));
  const schalteKapitel = (id: string) => {
    const neu = new Set(an);
    if (neu.has(id)) neu.delete(id);
    else neu.add(id);
    p.setWahl({ ...p.wahl, zusatz: [...neu] });
  };
  const schalteFall = (id: string) => {
    const neu = faelle.includes(id) ? faelle.filter((x) => x !== id) : [...faelle, id];
    if (neu.length) p.setWahl({ ...p.wahl, faelle: alleFaelle.filter((x) => neu.includes(x)) });
  };
  return (
    <span class="menue-anker">
      <button type="button" class="knopf kapitel-plus" onClick={() => setOffen(!offen)} aria-expanded={offen} title="Kapitel und Fälle zuschalten" data-testid="kapitel-plus">＋</button>
      <Menue offen={offen} schliessen={() => setOffen(false)} testid="kapitel-menue">
        <div class="menue-kopf"><b>Zuschalten</b> <span class="sehr-leise">die Zeit der Auswertung wächst; Fälle teilen sich {mmss(p.plan.replay.budget)} Replay</span></div>
        {p.plan.zuschaltbar.map((k) => (
          <label key={k.id} class="menue-zeile"><input type="checkbox" checked={an.has(k.id)} onChange={() => schalteKapitel(k.id)} data-zusatz={k.id} />
            {k.titel} <span class="sehr-leise">+{mmss(k.sek)}</span></label>
        ))}
        <div class="menue-kopf"><b>Replay</b> <span class="sehr-leise">{faelle.length} Fälle je {mmss(p.plan.replay.jeFall)}{p.plan.replay.knapp ? " – knapp" : ""}</span></div>
        {alleFaelle.map((id) => (
          <label key={id} class="menue-zeile"><input type="checkbox" checked={faelle.includes(id)} onChange={() => schalteFall(id)} data-fall-wahl={id}
            disabled={faelle.length === 1 && faelle.includes(id)} /> {id} · {titel.get(id)}</label>
        ))}
      </Menue>
    </span>
  );
}

// ---------------------------------------------------------------- Zeitbudget

interface UhrStand {
  gesamt: number;
  kapitel: number;
  zuruecksetzen: () => void;
}

/** Stoppuhr der Auswertung: gesamt seit dem ersten Bild, je Kapitel aufsummiert. */
function useZeitbudget(kapitel: string): UhrStand {
  const start = useRef(Date.now());
  const je = useRef(new Map<string, number>());
  const seit = useRef({ k: kapitel, t: Date.now() });
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const jetzt = Date.now();
  if (seit.current.k !== kapitel) {
    je.current.set(seit.current.k, (je.current.get(seit.current.k) ?? 0) + (jetzt - seit.current.t));
    seit.current = { k: kapitel, t: jetzt };
  }
  return {
    gesamt: (jetzt - start.current) / 1000,
    kapitel: ((je.current.get(kapitel) ?? 0) + (jetzt - seit.current.t)) / 1000,
    zuruecksetzen: () => {
      start.current = Date.now();
      je.current.clear();
      seit.current = { k: kapitel, t: Date.now() };
      setN((n) => n + 1);
    },
  };
}

/** Kleine Uhr je Kapitel (G1.2): Ist / Soll des Kapitels, dazu gesamt; rot, wenn drüber. Nichts springt von selbst weiter. */
function Zeitbudget(p: { uhr: UhrStand; k: Kapitel; gesamt: number }) {
  const { uhr, k } = p;
  const ueber = k.budget > 0 && uhr.kapitel > k.budget;
  return (
    <button type="button" class={`zeitbudget ${ueber ? "ueber" : ""} ${uhr.gesamt > p.gesamt ? "ueber-gesamt" : ""}`} onClick={uhr.zuruecksetzen}
      title="Zeit der Auswertung: Kapitel Ist / Soll, gesamt Ist / Soll (Klick: neu beginnen)" data-testid="zeitbudget">
      {k.budget > 0 && <span title={`${k.titel}: Ist / Soll`}>{mmss(uhr.kapitel)} / {mmss(k.budget)}</span>}
      <span class="sehr-leise">Σ {mmss(uhr.gesamt)} / {mmss(p.gesamt)}</span>
    </button>
  );
}

// ---------------------------------------------------------------- Export

function herunterladen(name: string, inhalt: string, typ: string) {
  const url = URL.createObjectURL(new Blob([inhalt], { type: typ }));
  const el = document.createElement("a");
  el.href = url;
  el.download = name;
  document.body.appendChild(el);
  el.click();
  el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function ExportMenue(p: { inh: Inhalte; teams: TeamLauf[]; a: Auswertung }) {
  const [offen, setOffen] = useState(false);
  const datum = new Date().toISOString().slice(0, 10);
  const basis = `argus_auswertung_${p.inh.szenario.id.toLowerCase()}_${datum}`;
  const json = (freitext: boolean) => {
    setOffen(false);
    herunterladen(`${basis}${freitext ? "_freitext" : ""}.json`, JSON.stringify(exportAnonym(p.inh, p.teams, p.a, { freitext }), null, 1), "application/json");
  };
  return (
    <span class="menue-anker">
      <button type="button" class="knopf klein" onClick={() => setOffen(!offen)} data-testid="export-knopf" title="Ergebnisse ohne Namen für die Seminarauswertung">Export ▾</button>
      <Menue offen={offen} schliessen={() => setOffen(false)} rechts>
        <div class="menue-kopf"><b>Ergebnisse anonym</b> <span class="sehr-leise">Teams als A, B, C …, keine Namen</span></div>
        <button type="button" class="knopf klein" onClick={() => json(false)} data-export="json">JSON ohne Freitexte</button>
        <button type="button" class="knopf klein" onClick={() => json(true)} data-export="json-freitext"
          title="mit den Notizen der Spielleitung – können Namen enthalten">JSON mit Notizen</button>
        <button type="button" class="knopf klein" onClick={() => { setOffen(false); herunterladen(`${basis}.csv`, exportCsv(p.a), "text/csv;charset=utf-8"); }} data-export="csv">Kennzahlen und Fälle (CSV)</button>
      </Menue>
    </span>
  );
}

// ---------------------------------------------------------------- Bausteine

const AUSGANG_ZEICHEN: Record<string, string> = { richtig: "✓", falsch: "✕", verpasst: "◐", offen: "…", entfallen: "∅", nicht_erreicht: "–" };

function Ausgang(p: { e: FallErgebnis; gross?: boolean }) {
  return (
    <span class={`ausgang ${p.e.ausgang} ${p.gross ? "gross" : ""}`} title={`${AUSGANG_TEXT[p.e.ausgang]} – ${p.e.text}`}>
      <b>{AUSGANG_ZEICHEN[p.e.ausgang]}</b>{p.gross && <span>{AUSGANG_TEXT[p.e.ausgang]}</span>}
    </span>
  );
}

/** Entscheidung des Teams (✓ bekämpft, ◷ zurückgestellt, ✕ abgelehnt) mit Sekunden ab Eingang, dazu der Einschlag ✸ (rot: Fehltreffer). */
function KetteZeile(p: { e: FallErgebnis; kompakt?: boolean }) {
  const k = p.e.kette;
  const g = k.glied;
  return (
    <span class={`kette ${p.kompakt ? "kompakt" : ""}`} aria-label={g.titel}>
      <span class={`glied ${g.art}`} title={g.titel}><b>{g.vorher ? "◷›" : ""}{g.zeichen}</b>{g.sek !== undefined && <i class="glied-sek">{Math.round(g.sek)} s</i>}</span>
      {k.einschlag && <span class={`glied einschlag ${k.einschlag.fehl || k.einschlag.regel ? "fehl" : ""}`} title={k.einschlag.text}><b>✸</b></span>}
    </span>
  );
}

// ---------------------------------------------------------------- Kapitel 1: Teamvergleich

/** Zeile einer Zelle kürzen (Wirkmittel in Klammern und Uhrzeit weg; die Sekunden stehen an der Entscheidung). */
function zelleKurz(z: string): string {
  return z.replace(/\s*\([^)]*\)/, "").replace(/ \d\d:\d\d/, "").replace(/ · \d+ s$/, "");
}

const WAS_KLEIN: Record<string, string> = { bekaempfen: "bekämpft", zurueckstellen: "zurückgestellt", ablehnen: "abgelehnt" };

/**
 * Eine Zeile je Zelle (seit 2.6, 7 Teams in 1530 × 800): Was folgte – Treffer, Folgemeldung, entfallen. Die Entscheidung selbst
 * zeigt das Zeichen davor (✓ bekämpft, ◷ zurückgestellt, ✕ abgelehnt) mit den Sekunden ab Eingang.
 */
function zelleFolge(e: FallErgebnis): string {
  if (e.zeilen.length > 1) return zelleKurz(e.zeilen[1]);
  const was = e.kette.glied.was;
  return was ? WAS_KLEIN[was] : zelleKurz(e.zeilen[0] ?? "");
}

/**
 * Teamvergleich (seit 2.6 gedreht, H6): Zeilen = Fälle, Spalten = Teams – 7 Teams passen in 1530 px. Je Zelle der Ausgang, die
 * Entscheidung mit Sekunden ab Eingang und was danach geschah. Klick auf einen Schlüsselfall öffnet das Replay.
 */
function Teamvergleich(p: { a: Auswertung; inh: Inhalte; waehle: (fall: string, team: string) => void }) {
  const { a } = p;
  return (
    <section class="tafel tafel-vergleich" data-testid="teamvergleich">
      <div class="tafel-kopf">
        <h1>Was hat jedes Team entschieden – und wie schnell?</h1>
        <div class="legende-zeile">
          <span><span class="ausgang richtig"><b>✓</b></span> richtig</span>
          <span><span class="ausgang falsch"><b>✕</b></span> falsch</span>
          <span><span class="ausgang verpasst"><b>◐</b></span> zu Unrecht abgelehnt</span>
          <span><span class="ausgang offen"><b>…</b></span> offen / entfallen</span>
          <span class="trenner" />
          <span><span class="glied weiter mini"><b>✓</b></span> bekämpft</span>
          <span><span class="glied warten mini"><b>◷</b></span> zurückgestellt</span>
          <span><span class="glied halt mini"><b>✕</b></span> abgelehnt</span>
          <span class="leise">· Sekunden ab Eingang</span>
        </div>
      </div>
      <table class="vergleich gedreht" data-teams={a.teams.length}>
        <colgroup>
          <col class="c-fall-name" />
          {a.teams.map((t) => <col key={t.id} class="c-team" />)}
          <col class="c-summe" />
        </colgroup>
        <thead>
          <tr>
            <th class="fall-spalte">Fall</th>
            {a.teams.map((t) => (
              <th key={t.id} data-team={t.id}><TeamMarke name={t.name} farbe={t.farbe} />{!t.ende && <div class="klein sehr-leise">Spiel läuft</div>}</th>
            ))}
            <th class="summe-spalte sehr-leise">alle</th>
          </tr>
        </thead>
        <tbody>
          {a.faelle.map((f) => {
            const n = (x: string) => a.teams.filter((t) => t.faelle[f.id].ausgang === x).length;
            return (
              <tr key={f.id} class={f.art === "neben" ? "neben" : ""} data-fall-zeile={f.id}>
                <th class="fall-spalte" title={f.titel}><span class="fall-id">{f.id}</span><span class="fall-titel">{f.titel}</span></th>
                {a.teams.map((t) => {
                  const e = t.faelle[f.id];
                  return (
                    <td key={t.id} class={`vergleich-zelle ${e.ausgang}`} data-fall={f.id} data-team={t.id} data-ausgang={e.ausgang}
                      title={`${f.id} · ${t.name}: ${AUSGANG_TEXT[e.ausgang]} – ${e.text}`}
                      onClick={() => f.art === "schluessel" && p.waehle(f.id, t.id)}>
                      <div class="zelle-oben"><Ausgang e={e} /><KetteZeile e={e} /></div>
                      <div class="zelle-text"><div>{zelleFolge(e)}</div></div>
                    </td>
                  );
                })}
                <td class="summe-spalte">
                  <span class="summe">{n("falsch") > 0 && <span class="rot">✕{n("falsch")} </span>}<span class="gruen">✓{n("richtig")}</span>
                    {n("verpasst") > 0 && <span class="bernstein"> ◐{n("verpasst")}</span>}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ---------------------------------------------------------------- Kapitel 2: Kennzahlen

function sek(x: number | null): string {
  return x === null ? "–" : `${Math.round(x)}`;
}

/** Dauer lesbar: „20 s“, „4:30 min“. */
function dauerText(s: number): string {
  const r = Math.max(0, Math.round(s));
  return r < 60 ? `${r} s` : `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")} min`;
}

function KennzahlenTafel(p: { a: Auswertung; inh: Inhalte }) {
  const { a, inh } = p;
  const start = inh.szenario.spieluhr.start;
  const lmId = a.teams[0]?.kennzahlen.lagemeldungen[0]?.id ?? "I-04";
  const lmErschienen = a.teams.map((t) => t.kennzahlen.lagemeldungen[0]?.erschienen).find((x) => x !== undefined);
  const schwelle = a.teams[0]?.kennzahlen.zeiten.schwelle ?? KONFIDENZ_HOCH;
  return (
    <section class="tafel tafel-kennzahlen" data-testid="kennzahlen">
      <div class="tafel-kopf">
        <h1>Kennzahlen je Team</h1>
        <span class="leise">aus den Protokollen · hingeschaut = Sekunden vom Eingang einer Meldung bis zur Entscheidung (Median)</span>
      </div>
      <table class="kennzahlen">
        <colgroup>
          <col style="width:206px" /><col style="width:290px" /><col style="width:118px" /><col style="width:170px" />
          <col style="width:330px" /><col style="width:140px" /><col />
        </colgroup>
        <thead>
          <tr>
            <th class="team-spalte">Team</th>
            <th>Fehlbekämpfungen</th>
            <th>Bekämpft trotz Regel&shy;warnung</th>
            <th>Widerspruch gegen ARGUS</th>
            <th>Wie lange habt ihr hingeschaut? <span class="th-zusatz">(ab Eingang · ab Öffnen)</span></th>
            <th>{lmId} angeklickt{lmErschienen !== undefined && <span class="th-zusatz"> (kam {uhrzeit(start, lmErschienen).slice(0, 5)})</span>}</th>
            <th>Eigene Truppe</th>
          </tr>
        </thead>
        <tbody>
          {a.teams.map((t) => {
            const k = t.kennzahlen;
            const lm = k.lagemeldungen[0];
            const z = k.zeiten;
            return (
              <tr key={t.id} data-team={t.id}>
                <th class="team-spalte"><TeamMarke name={t.name} farbe={t.farbe} />
                  <div class="klein sehr-leise">{k.meldungen.bearbeitet} von {k.meldungen.erschienen} Meldungen entschieden</div>
                  <div class="klein sehr-leise" data-kz="durchbruch">{k.durchbruch.fahrzeuge.length ? `Feind durchgebrochen: ${k.durchbruch.fahrzeuge.length} Fz` : "kein Durchbruch"}</div></th>
                <td data-kz="fehl">
                  <b class={`wert ${k.fehl.wirkungen ? "rot" : "gruen"}`}>{k.fehl.wirkungen}</b>
                  <div class="chips">{k.fehl.arten.map((x) => <span key={x.art} class="chip fehl">{FEHL_TEXT[x.art]}{x.anzahl > 1 ? ` ×${x.anzahl}` : ""}</span>)}</div>
                </td>
                <td data-kz="warnung"><b class={`wert ${k.trotzWarnung ? "rot" : ""}`}>{k.trotzWarnung}</b>
                  <div class="unter">von {k.freigaben.gesamt} Bekämpfungen</div></td>
                <td data-kz="widerspruch">
                  <b class="wert">{k.widerspruch.gesamt}</b>
                  <div class="unter"><span class="gruen">{k.widerspruch.zuRecht} zu Recht</span> · <span class={k.widerspruch.zuUnrecht ? "rot" : ""}>{k.widerspruch.zuUnrecht} zu Unrecht</span></div>
                </td>
                <td data-kz="zeit">
                  <div class="tempo-zeile"><b class="wert">{sek(z.alle.eingang)} s</b><span class="leise"> · {sek(z.alle.offen)} s angesehen</span></div>
                  <div class="unter">ab {schwelle} %: {sek(z.hoch.eingang)} s · darunter {sek(z.niedrig.eingang)} s · {z.unter20} von {z.alle.n} Entscheidungen in höchstens 20 s{z.kuerzeste !== null ? ` · schnellste ${sekText(z.kuerzeste)}` : ""}</div>
                </td>
                <td data-kz="lm">
                  {lm?.gelesen !== undefined ? <b class="wert">{uhrzeit(start, lm.gelesen)}</b> : <b class="wert rot">nicht angeklickt</b>}
                  <div class="unter">{lm?.gelesen !== undefined && lm.erschienen !== undefined ? `${dauerText(lm.gelesen - lm.erschienen)} nach Eingang` : lm?.erschienen === undefined ? "kam nicht" : "lief im Feed durch"}</div>
                </td>
                <td data-kz="verluste">
                  {k.verluste ? <><b class="wert">{k.verluste.bereit}/{k.verluste.gesamt}</b><div class="unter">einsatzbereit bei Spielende · {k.verluste.verwundete} Verwundete</div></> : <span class="sehr-leise">–</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div class="tafel-fuss leise">
        Fehlbekämpfung: Wirkung traf Verbündete, Sanität, Zivilpersonen, die Attrappe oder Gegner, die sich ergeben. Widerspruch: anders gehandelt, als ARGUS empfahl –
        zu Recht, wo die Lage es verlangte. Hingeschaut: je Meldung die Sekunden vom Eingang bis zur Entscheidung. Gezählt wird nur, was im Protokoll steht.
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Kapitel 3: Konfidenz

function KonfidenzTafel(p: { a: Auswertung; inh: Inhalte; sl?: boolean }) {
  const { a, inh } = p;
  const k = a.konfidenz;
  const schwelle = KONFIDENZ_HOCH;
  const bek = inh.regeln.argus.schwellen.bekaempfen;
  const pru = inh.regeln.argus.schwellen.pruefen;
  const falsch = k.punkte.filter((x) => x.falsch).sort((x, y) => y.konfidenz - x.konfidenz);
  const ueberFt = falsch.filter((x) => x.konfidenz >= schwelle).length;
  const nTeams = a.teams.length;
  const fmt = (x: number | null) => (x === null ? "–" : x.toLocaleString("de-DE", { maximumFractionDigits: 1 }));
  // Diagramm: x Konfidenz, y Sichtstörung. Meldungen mit klarer Sicht (0 %) stehen in einer eigenen Bahn unter der
  // Achse, nebeneinander gestapelt (sonst lägen sie übereinander und täuschten eine Störung vor).
  const W = 900, H = 560, L = 76, R = 262, O = 40, BAHN = 70;
  const yBot = H - 50 - BAHN - 16;
  const xmin = 50, xmax = 100, ymax = 0.8;
  const X = (v: number) => L + ((v - xmin) / (xmax - xmin)) * (W - L - R);
  const Y = (v: number) => O + (1 - v / ymax) * (yBot - O);
  const bahnOben = yBot + 16;
  const reihen: number[][] = [];
  const pos = [...k.punkte].sort((x, y) => x.konfidenz - y.konfidenz).map((pt) => {
    const x = X(pt.konfidenz);
    if (pt.gestoert > 0) return { pt, x, y: Y(pt.gestoert) };
    let r = reihen.findIndex((reihe) => reihe.every((x2) => Math.abs(x2 - x) >= 17));
    if (r < 0) r = reihen.push([]) - 1;
    reihen[r].push(x);
    return { pt, x, y: bahnOben + 9 + r * 17 };
  });
  // Beschriftungen von oben nach unten wie die Punkte, bei gleicher Höhe der linke zuerst (Leitlinien kreuzen sich nicht)
  const labels = pos.filter((x) => x.pt.falsch).sort((p1, p2) => p1.y - p2.y || p1.x - p2.x);
  const lx = W - R + 34;
  return (
    <section class="tafel tafel-konfidenz" data-testid="konfidenz">
      <div class="konfidenz-diagramm">
        <h1>Konfidenz und Sicht je ARGUS-Meldung</h1>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Streudiagramm: ${k.punkte.length} Meldungen, x Konfidenz, y Sichtstörung; ${k.falsch} falsche Empfehlungen`}>
          {/* Bereiche der Empfehlungslogik */}
          <rect x={X(schwelle)} y={O} width={X(xmax) - X(schwelle)} height={bahnOben + BAHN - O} class="kd-ft" />
          <text x={X(schwelle) + 6} y={O + 18} class="kd-bereich bernstein">ab {schwelle} %: „sicher“</text>
          {[pru, bek].map((v) => <line key={v} x1={X(v)} x2={X(v)} y1={O} y2={bahnOben + BAHN} class="kd-schwelle" />)}
          <text x={(X(xmin) + X(pru)) / 2} y={H - 8} class="kd-bereich mitte">UNKLAR</text>
          <text x={(X(pru) + X(bek)) / 2} y={H - 8} class="kd-bereich mitte">PRÜFEN</text>
          <text x={(X(bek) + X(xmax)) / 2} y={H - 8} class="kd-bereich mitte">BEKÄMPFEN</text>
          {/* Achsen und Bahn „klare Sicht“ */}
          <rect x={L} y={bahnOben} width={X(xmax) - L} height={BAHN} class="kd-bahn" />
          <text x={L - 10} y={bahnOben + BAHN / 2 - 2} class="kd-tick rechts">klare</text>
          <text x={L - 10} y={bahnOben + BAHN / 2 + 15} class="kd-tick rechts">Sicht</text>
          {[50, 60, 70, 80, 90, 100].map((v) => (
            <g key={v}><line x1={X(v)} x2={X(v)} y1={bahnOben + BAHN} y2={bahnOben + BAHN + 5} class="kd-achse" />
              <text x={X(v)} y={bahnOben + BAHN + 22} class="kd-tick mitte">{v} %</text></g>
          ))}
          {[0.2, 0.4, 0.6, 0.8].map((v) => (
            <g key={v}><line x1={L} x2={X(xmax)} y1={Y(v)} y2={Y(v)} class="kd-gitter" /><text x={L - 10} y={Y(v) + 5} class="kd-tick rechts">{Math.round(v * 100)} %</text></g>
          ))}
          <line x1={L} x2={X(xmax)} y1={yBot} y2={yBot} class="kd-gitter" />
          <text x={22} y={(O + yBot) / 2} class="kd-achsentitel" transform={`rotate(-90 22 ${(O + yBot) / 2})`}>Bild verdeckt</text>
          {/* Mittelwerte */}
          {k.mittelRichtig !== null && <g><line x1={X(k.mittelRichtig)} x2={X(k.mittelRichtig)} y1={O + 26} y2={bahnOben + BAHN} class="kd-mittel richtig" />
            <text x={X(k.mittelRichtig) - 6} y={O + 40} class="kd-mittel-text rechts">Ø richtig {fmt(k.mittelRichtig)} %</text></g>}
          {k.mittelFalsch !== null && <g><line x1={X(k.mittelFalsch)} x2={X(k.mittelFalsch)} y1={O + 26} y2={bahnOben + BAHN} class="kd-mittel falsch" />
            <text x={X(k.mittelFalsch) + 6} y={O + 40} class="kd-mittel-text falsch">Ø falsch {fmt(k.mittelFalsch)} %</text></g>}
          {/* Punkte: richtig hohl und grau, falsch rot als Raute mit Beschriftung */}
          {pos.filter((x) => !x.pt.falsch).map(({ pt, x, y }) => (
            <circle key={pt.meldung} cx={x} cy={y} r={7} class={`kd-punkt richtig ${pt.empfehlung === "NICHT BEKÄMPFEN" ? "warnt" : ""}`} data-meldung={pt.meldung}>
              <title>{`${zielText(p.inh, pt.meldung)}: ${pt.konfidenz} %, ${pt.empfehlung}, Bild ${Math.round(pt.gestoert * 100)} % verdeckt – ARGUS lag richtig`}</title>
            </circle>
          ))}
          <text x={lx} y={O + 76} class="kd-label-kopf">ARGUS lag falsch</text>
          {labels.map(({ pt, x, y }, i) => {
            const ly = O + 118 + i * 88;
            return (
              <g key={pt.meldung} data-falsch={pt.meldung}>
                <polyline points={`${x + 9},${y} ${lx - 18},${ly - 7} ${lx - 6},${ly - 7}`} class="kd-leitlinie" />
                <rect x={x - 8} y={y - 8} width={16} height={16} transform={`rotate(45 ${x} ${y})`} class="kd-punkt falsch">
                  <title>{`${zielText(p.inh, pt.meldung)}: ${pt.konfidenz} % – ARGUS lag falsch`}</title>
                </rect>
                <text x={lx} y={ly} class="kd-label">✕ {zielText(p.inh, pt.meldung)}{pt.fall ? ` · ${pt.fall}` : ""} · {pt.konfidenz} %{p.sl ? <tspan class="kd-intern"> {pt.meldung}</tspan> : null}</text>
                <text x={lx} y={ly + 22} class="kd-label-unter">{pt.bekaempft} von {nTeams} Teams bekämpft</text>
              </g>
            );
          })}
        </svg>
        <div class="kd-legende">
          <span><svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6" class="kd-punkt richtig" /></svg>ARGUS lag richtig</span>
          <span><svg width="16" height="16" aria-hidden="true"><rect x="3" y="3" width="10" height="10" transform="rotate(45 8 8)" class="kd-punkt falsch" /></svg>ARGUS lag falsch</span>
          <span><svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6" class="kd-punkt richtig warnt" /></svg>ARGUS warnte (NICHT BEKÄMPFEN)</span>
          <span class="sehr-leise">Konfidenz in Prozent · eine Meldung je Punkt</span>
        </div>
      </div>
      <aside class="konfidenz-aussage">
        <div class="aussage-zahlen">
          <div><b>{k.richtig} von {k.richtig + k.falsch}</b><span>Empfehlungen richtig</span></div>
          <div><b class="rot">Ø {fmt(k.mittelFalsch)} %</b><span>Konfidenz bei den {k.falsch} falschen</span></div>
          <div><b>Ø {fmt(k.mittelRichtig)} %</b><span>bei den richtigen BEKÄMPFEN</span></div>
        </div>
        <ul class="aussage-punkte">
          {ueberFt > 0 && <li><b>{ueberFt === k.falsch ? `Alle ${k.falsch}` : `${ueberFt} von ${k.falsch}`} Fehler</b> hatten eine Konfidenz von {schwelle} % und mehr.</li>}
          {k.fehl.n > 0 && <li>Die Teams folgten einer falschen Empfehlung <b>{k.fehl.n}-mal</b> – immer bei {k.fehl.min === k.fehl.max ? `${k.fehl.min}` : `${k.fehl.min}–${k.fehl.max}`} %.</li>}
          {k.fehl.n === 0 && <li>Kein Team ist einer falschen Empfehlung gefolgt.</li>}
          {k.widerspruch.n > 0 && <li>Zu Recht widersprochen haben die Teams <b>{k.widerspruch.n}-mal</b>, auch bei bis zu {k.widerspruch.max} %.</li>}
        </ul>
        <p class="kernaussage" data-testid="kernaussage">{inh.szenario.auswertung.kernaussage}</p>
      </aside>
    </section>
  );
}

// ---------------------------------------------------------------- Replay je Schlüsselfall

function Replay(p: {
  a: Auswertung; inh: Inhalte; teams: TeamLauf[]; fall: FallDef; team: string; setTeam: (t: string) => void;
  spielt: boolean; setSpielt: (f: boolean | ((v: boolean) => boolean)) => void; notiz?: AuswertungProps["notiz"];
}) {
  const { a, inh, fall } = p;
  const start = inh.szenario.spieluhr.start;
  const [von, bis] = useMemo(() => fallFenster(inh, a.teams, fall), [a, fall]);
  const tempo = replayTempo(von, bis);
  const tw = a.teams.find((t) => t.id === p.team) ?? a.teams[0];
  const lauf = p.teams.find((t) => t.id === tw.id) ?? p.teams[0];
  const welt = useMemo(() => weltFuer(inh, lauf.zustand), [inh, lauf.zustand]);
  // Spielzeit des Replays: in der Ref für die Karte (jedes Bild), als Zustand für Leiste und Lagebild (10 ×/s)
  const tRef = useRef(von);
  const [t, setT] = useState(von);
  const setze = (x: number) => {
    tRef.current = Math.max(von, Math.min(bis, x));
    setT(tRef.current);
  };
  useEffect(() => {
    if (!p.spielt) return;
    if (tRef.current >= bis - 0.5) setze(von);
    let letzte = performance.now();
    let anzeige = 0;
    let lauf2 = 0;
    const schritt = (jetzt: number) => {
      tRef.current = Math.min(bis, tRef.current + ((jetzt - letzte) / 1000) * tempo);
      letzte = jetzt;
      if (jetzt - anzeige > 100) {
        anzeige = jetzt;
        setT(tRef.current);
      }
      if (tRef.current >= bis) {
        setT(bis);
        p.setSpielt(false);
        return;
      }
      lauf2 = requestAnimationFrame(schritt);
    };
    lauf2 = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(lauf2);
  }, [p.spielt, von, bis, tempo]);

  const n = ereignisseBis(lauf.protokoll, t);
  const zT = useMemo(() => zustandBis(inh, lauf.protokoll, t).z, [lauf, n]);
  const tSek = Math.floor(t);
  const lb = useMemo(() => lagebildKontrolle(welt, zT, tSek), [welt, zT, tSek]);
  const fx = useMemo(() => effekte(welt, zT, "alle"), [welt, zT]);
  const fokus = useMemo(() => fallFokus(welt, a, fall, von, bis), [fall.id]);
  const uhrFn = () => ({ t: tRef.current, tempo: p.spielt ? tempo : 1, laeuft: true });
  const e = tw.faelle[fall.id];
  const sf = fall.sf!;
  const zitat = inh.szenario.auswertung.bilanz?.zitat;
  // Notizen zum Fall: gewähltes Team zuerst, dann die anderen
  const notizen = [tw, ...a.teams.filter((x) => x.id !== tw.id)].flatMap((x) => x.notizen.filter((nz) => nz.fall === fall.id).map((nz) => ({ ...nz, team: x })));

  return (
    <section class="replay" data-fall={fall.id} data-team={tw.id} data-von={von} data-bis={bis} data-tempo={tempo} data-t={Math.round(t * 10) / 10}>
      <div class="replay-links">
        <div class="replay-karte panel ohne-rand">
          <header>
            <h2><span class="fall-marke">{fall.id}</span> Kontrollkarte · <TeamMarke name={tw.name} farbe={tw.farbe} klein /></h2>
            <span class="replay-uhr mono" data-testid="replay-uhr">{uhrzeit(start, t)}</span>
          </header>
          <div class="rumpf">
            <LagekarteAnsicht inh={welt} lagebild={lb} hintergrund="luftbild" sprites legende="kontrolle" zeichenGroesse={16} testid="replay-karte"
              uhr={uhrFn} effekte={fx} fokus={fokus} />
          </div>
        </div>
        <FallZeitleiste a={a} inh={inh} fall={fall} von={von} bis={bis} t={t} setze={setze} team={tw.id} setTeam={p.setTeam} tempo={tempo}
          spielt={p.spielt} umschalten={() => p.setSpielt((v) => !v)} />
      </div>
      <div class="replay-rechts">
        <div class="fall-kopf">
          <h1><span class="fall-marke gross">{fall.id}</span>{fall.titel}</h1>
          <div class="fall-info"><span class="leise">Information lag bei:</span> {sf.info_bei}</div>
          <div class="fall-ausgang"><TeamMarke name={tw.name} farbe={tw.farbe} klein /> <Ausgang e={e} gross /> <span class="leise">{e.text}</span></div>
        </div>
        <TeamBild inh={inh} welt={welt} lauf={lauf} tw={tw} fall={fall}>
          {/* seit 2.7 (G, Stand 09.11.): Sekunden bis zur Entscheidung neben dem Zitat „20 seconds for each target“ */}
          <div class="hingeschaut" data-testid="hingeschaut">
            <span>Wie lange habt ihr hingeschaut?</span>
            <b class="zahl">{e.kette.glied.sek !== undefined ? sekText(e.kette.glied.sek) : "keine Entscheidung"}</b>
            {zitat && <span class="hingeschaut-zitat">„{zitat.text}“ <i>– {zitat.quelle}</i></span>}
          </div>
        </TeamBild>
        <div class="leitfragen" data-testid="leitfragen">
          <h2>Leitfragen</h2>
          <ol>{sf.leitfragen.map((q) => <li>{q}</li>)}</ol>
          <div class="bezuege">{sf.bezuege.map((b) => <span class="chip">{b}</span>)}</div>
        </div>
        <div class="notizen-sl" data-testid="notizen-sl">
          <h2>Notizen SL 2 <span class="sehr-leise klein">{notizen.length ? "" : "– keine zu diesem Fall"}</span></h2>
          {notizen.length > 0 && (
            <RollListe><ul>{notizen.map((nz) => <li class={nz.team.id === tw.id ? "gewaehlt" : ""}><TeamMarke name={nz.team.name} farbe={nz.team.farbe} klein /> <span class="mono sehr-leise">{uhrzeit(start, nz.t).slice(0, 5)}</span> {nz.text}</li>)}</ul></RollListe>
          )}
          {p.notiz && <NotizFeld fall={fall.id} team={tw} senden={(text) => p.notiz!(tw.id, fall.id, text)} />}
        </div>
      </div>
    </section>
  );
}

/** Liste, die innerhalb ihres Feldes rollt (ohne Balken, unten ausgeblendet, solange mehr folgt). */
function RollListe(p: { children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mehr, setMehr] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pruefen = () => setMehr(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    pruefen();
    el.addEventListener("scroll", pruefen, { passive: true });
    const ro = new ResizeObserver(pruefen);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", pruefen);
      ro.disconnect();
    };
  }, []);
  return <div ref={ref} class={`rolle-liste roll-notizen ${mehr ? "ueberlauf" : ""}`}>{p.children}</div>;
}

/** Ausschnitt der Kontrollkarte für einen Fall: Weg der Fahrzeuge im Zeitfenster und die Einschläge aller Teams. */
function fallFokus(welt: Inhalte, a: Auswertung, fall: FallDef, von: number, bis: number): { pos: [number, number]; faktor: number; schluessel: string } | undefined {
  const pts: [number, number][] = [];
  for (const id of [fall.meldung, ...fall.folge]) {
    const m = welt.meldungen[id];
    if (!m) continue;
    pts.push(gemeldetePosition(welt, m));
    for (const zid of m.ziele) {
      const z = welt.ziele[zid];
      if (!z) continue;
      for (let t = von; t <= bis; t += 10) if (vorhanden(z, t)) pts.push(position(z, t));
    }
    for (const t of a.teams) {
      const w = t.verlaeufe.get(id)?.wirkung;
      if (w) {
        const zw = w.ziel ? welt.ziele[w.ziel] : undefined;
        if (zw) pts.push(position(zw, w.t));
      }
    }
  }
  if (!pts.length) return undefined;
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const b = welt.karte.ausdehnung_m;
  // Das Kartenfeld im Replay ist gut doppelt so breit wie hoch: maßgeblich ist meist die Höhe (sichtbar = Kartenhöhe / Zoom)
  const faktor = Math.max(1.3, Math.min(2.6, (b.hoehe * 2.3) / ((x1 - x0) * 1.3 + 60), b.hoehe / ((y1 - y0) * 1.3 + 60)));
  return { pos: [(x0 + x1) / 2, (y0 + y1) / 2], faktor, schluessel: fall.id };
}

function NotizFeld(p: { fall: string; team: TeamAuswertung; senden: (text: string) => void }) {
  const [text, setText] = useState("");
  const ab = () => {
    if (!text.trim()) return;
    p.senden(text.trim());
    setText("");
  };
  return (
    <div class="zeile notiz-feld" style="flex-wrap:nowrap">
      <input class="feld" maxLength={500} value={text} placeholder={`Notiz zu ${p.fall} für ${p.team.name} …`} onInput={(e) => setText((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => e.key === "Enter" && ab()} data-testid="notiz-auswertung" />
      <button type="button" class="knopf klein" disabled={!text.trim()} onClick={ab}>+</button>
    </div>
  );
}

/**
 * Drohnenbild, wie das Team es bei der Entscheidung sah (live zur Zeit der Entscheidung, die Drohne verfolgt das Ziel; Lupe per Klick),
 * mit der ARGUS-Ausgabe von damals (EloKa: gestört). Seit 2.6 ohne Sensordaten (E6.3).
 */
function TeamBild(p: { inh: Inhalte; welt: Inhalte; lauf: TeamLauf; tw: TeamAuswertung; fall: FallDef; children?: ComponentChildren }) {
  const { welt, tw, fall } = p;
  const start = p.inh.szenario.spieluhr.start;
  const mv = tw.verlaeufe.get(fall.meldung);
  const e = mv?.entscheidungen[mv.entscheidungen.length - 1];
  const tBild = e?.t ?? mv?.t ?? welt.meldungen[fall.meldung]?.t_s ?? 0;
  const lage = useMemo((): LiveLage => {
    const z = zustandBis(p.inh, p.lauf.protokoll, tBild).z;
    return { inh: welt, z, effekte: effekte(welt, z, bekannteZiele(welt, z)) };
  }, [p.lauf, tBild, welt]);
  const m = welt.meldungen[fall.meldung];
  const gestoert = p.lauf.zustand.meldungen[fall.meldung]?.gestoert;
  const a = m ? argusBei(welt, m, gestoert) : null;
  const was: Record<string, string> = { bekaempfen: "BEKÄMPFEN", zurueckstellen: "ZURÜCKSTELLEN", ablehnen: "ABLEHNEN" };
  const hinweis = !mv ? "Die Meldung kam bei diesem Team nicht." : !e ? "Das Team hat nicht entschieden." : null;
  return (
    <div class="g1-bild" data-testid="team-bild">
      <h2>Drohnenbild, wie das Team es sah <span class="sehr-leise klein">{e ? `bei der Entscheidung ${uhrzeit(start, e.t)} – ${was[e.was]}${e.sekEingang !== undefined ? ` nach ${sekText(e.sekEingang)}` : ""}` : mv ? `zur Meldezeit ${uhrzeit(start, mv.t)}` : ""}</span></h2>
      <div class="g1-bild-zeile">
        <div class={`g1-bild-rahmen ${hinweis ? "mit-hinweis" : ""}`}>
          {m && <LiveDrohnenFenster key={`${tw.id}-${fall.id}`} meldung={m} argus={a ?? undefined} lage={() => lage} uhr={() => ({ t: tBild, tempo: 1, laeuft: false })} start={start} />}
          {hinweis && <div class="g1-bild-hinweis">{hinweis}</div>}
        </div>
        {p.children}
      </div>
      {m && a && (
        <div class="g1-sensor" title="So meldete ARGUS diese Meldung dem Team">
          <span class="leise">ARGUS:</span> {a.klasse}{a.zugehoerigkeit ? ` · ${a.zugehoerigkeit}` : ""} {a.konfidenz} % · {a.empfehlung}{a.gestoert ? " · Datenlink gestört" : ""}
        </div>
      )}
    </div>
  );
}

/** Zeitleiste aller Teams zu einem Fall: Meldung → Entscheidung (mit Sekunden) → Einschlag; Klick wählt Team und Zeit. */
function FallZeitleiste(p: {
  a: Auswertung; inh: Inhalte; fall: FallDef; von: number; bis: number; t: number; setze: (t: number) => void; team: string; setTeam: (t: string) => void;
  spielt: boolean; umschalten: () => void; tempo: number;
}) {
  const { a, inh, fall, von, bis } = p;
  const start = inh.szenario.spieluhr.start;
  const pct = (x: number) => `${((Math.max(von, Math.min(bis, x)) - von) / (bis - von)) * 100}%`;
  const ticks: number[] = [];
  const schritt = bis - von > 420 ? 60 : 30;
  for (let x = Math.ceil(von / schritt) * schritt; x <= bis; x += schritt) ticks.push(x);
  const global = [
    ...fallInjects(inh).filter((i) => i.fall === fall.id).map((i) => ({ t: i.t, text: i.id, klasse: "inject", titel: `Lagemeldung ${i.id} ${uhrzeit(start, i.t)}: „${inh.injects[i.id]?.text ?? ""}“` })),
    ...[fall.meldung, ...fall.folge].map((id) => ({ t: inh.meldungen[id]?.t_s ?? 0, text: zielText(inh, id), klasse: "meldung", titel: `${zielText(inh, id)} von ARGUS ${uhrzeit(start, inh.meldungen[id]?.t_s ?? 0)}` })),
  ];
  const spur = useRef<HTMLDivElement | null>(null);
  const zuZeit = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return von + ((clientX - r.left) / r.width) * (bis - von);
  };
  const ziehen = useRef<{ el: HTMLElement } | null>(null);
  return (
    <div class="zeitleiste panel" data-testid="zeitleiste">
      <div class="zl-steuer">
        <button type="button" class="knopf replay-play" onClick={p.umschalten} data-testid="replay-play" title={`Replay ×${p.tempo}, ca. ${Math.round((bis - von) / p.tempo)} s (Leertaste)`}>
          {p.spielt ? "❚❚" : "▶"} <span class="klein">×{p.tempo}</span>
        </button>
        <span class="zl-legende klein">
          <span><i class="zl-marke meldung muster">M</i>ARGUS-Meldung</span>
          <span><i class="zl-marke entscheid weiter muster">✓ 9 s</i><i class="zl-marke entscheid warten muster">◷</i><i class="zl-marke entscheid halt muster">✕</i>Entscheidung (Sekunden ab Eingang)</span>
          <span><i class="zl-marke einschlag fehl muster">✸</i>Einschlag</span>
          <span><i class="zl-marke gelesen muster">✉</i>Lagemeldung</span>
        </span>
      </div>
      <div class="zl-gitter" ref={spur}>
        <div class="zl-achse">
          <span class="zl-name" />
          <div class="zl-spur achse">
            {ticks.map((x) => (x % 60 === 0
              ? <span key={x} class="zl-tick" style={{ left: pct(x) }}>{uhrzeit(start, x).slice(0, 5)}</span>
              : <span key={x} class="zl-tick halb" style={{ left: pct(x) }} />))}
            {global.map((g) => <span key={g.text} class={`zl-global-kopf ${g.klasse}`} style={{ left: pct(g.t) }} title={g.titel}>{g.text}</span>)}
          </div>
        </div>
        {a.teams.map((t) => {
          const marken = zeitleiste(inh, t, fall).filter((x) => x.t >= von - 1 && x.t <= bis + 1);
          const e = t.faelle[fall.id];
          let letzteX = -1e9;
          let bahn = 0;
          const breite = (bis - von) / 34; // ca. 22 px Abstand auf ca. 750 px
          return (
            <div key={t.id} class={`zl-zeile ${t.id === p.team ? "an" : ""}`} data-team={t.id}>
              <button type="button" class="zl-name" onClick={() => p.setTeam(t.id)} title={`${t.name}: ${AUSGANG_TEXT[e.ausgang]} – ${e.text}`}>
                <Ausgang e={e} /><TeamMarke name={t.name} farbe={t.farbe} klein />
              </button>
              <div class="zl-spur"
                onPointerDown={(ev) => {
                  const el = ev.currentTarget as HTMLElement;
                  el.setPointerCapture(ev.pointerId);
                  ziehen.current = { el };
                  p.setTeam(t.id);
                  p.setze(zuZeit(ev.clientX, el));
                }}
                onPointerMove={(ev) => { if (ziehen.current) p.setze(zuZeit(ev.clientX, ziehen.current.el)); }}
                onPointerUp={() => { ziehen.current = null; }}>
                {global.map((g) => <span key={g.text} class={`zl-global ${g.klasse}`} style={{ left: pct(g.t) }} />)}
                {marken.map((mk: ZeitMarke, i) => {
                  if (mk.t - letzteX < breite) bahn = bahn === 0 ? 1 : 0;
                  else bahn = 0;
                  letzteX = mk.t;
                  return (
                    <span key={i} class={`zl-marke ${mk.art} ${mk.klasse} bahn-${bahn}`} style={{ left: pct(mk.t) }} title={mk.text} data-art={mk.art}
                      onPointerDown={(ev) => { ev.stopPropagation(); p.setTeam(t.id); p.setze(mk.t + 0.05); }}>
                      {mk.zeichen}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div class="zl-kopf-linie" style={{ left: `calc(var(--zl-name) + (100% - var(--zl-name)) * ${(Math.max(von, Math.min(bis, p.t)) - von) / (bis - von)})` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Schlussfrage

// ---------------------------------------------------------------- Preis des Abwartens (seit 2.3, D5)

/** Fälle, an denen sich Abwarten und eigene Verluste gegenüberstehen (Marken auf den Kurven). */
const PREIS_FAELLE = ["S4", "N4", "S3"];

/** Mittel des Zustands der Panzer zu einem Eintrag des Verlaufs (abgerundet). */
function mittel(zs: number[]): number {
  return zs.length ? Math.floor(zs.reduce((x, y) => x + y, 0) / zs.length) : 100;
}

/** Ordnung für weniger/mehr Verluste: ausgefallen, dann eingeschränkt, dann Mittel des Zustands. */
function schwere(v: NonNullable<TeamAuswertung["kennzahlen"]["verluste"]>): number {
  return v.ausgefallen * 10000 + v.eingeschraenkt * 1000 + (100 - v.zustand);
}

/**
 * „Preis des Abwartens“ (D5.1/D5.2, seit 2.5 F2.9): Zustand der vier Panzer der eigenen Kp je Team über die Spielzeit (Mittel,
 * Linien bei 70 % einsatzbereit und 40 % ausgefallen), markiert mit den Entscheidungen bei S4, N4 und S3 (✓ richtig, ✕ falsch);
 * daneben je Team die vier Panzer (Balken nach Zustand und Stufe), einsatzbereite, Verwundete und Fehlbekämpfungen, die Leitfragen
 * und die Offenlegung, dass der Druck gebaut war. Verluste sind Lage, keine Wertung – keine Rangliste.
 */
function PreisDesAbwartens(p: { a: Auswertung; inh: Inhalte }) {
  const { a, inh } = p;
  const sz = inh.basis?.szenario ?? inh.szenario;
  const text = sz.verluste?.auswertung;
  const zugName = sz.eigene_truppe?.name ?? "eigene Truppe";
  const dauer = sz.spieluhr.dauer_s;
  const vr = inh.regeln.verluste;
  const unter = vr?.stufen.ausgefallen_unter ?? 40;
  const voll = vr?.stufen.einsatzbereit_ab ?? 70;
  const teams = a.teams.filter((t) => t.kennzahlen.verluste);
  const W = 900, H = 640, L = 64, R = 178, O = 30, U = 54;
  const X = (t: number) => L + (t / dauer) * (W - L - R);
  const ymin = Math.min(unter - 10, 10 * Math.floor(Math.min(100, ...teams.flatMap((t) => t.kennzahlen.verluste!.verlauf.map((v) => mittel(v[1])))) / 10));
  const Y = (v: number) => O + ((100 - v) / (100 - ymin)) * (H - O - U);
  const amOrt = (verlauf: [number, number[], number, number][], t: number) => {
    let m = 100;
    for (const [tv, zs] of verlauf) {
      if (tv > t) break;
      m = mittel(zs);
    }
    return m;
  };
  // Beschriftungen am Kurvenende ohne Überlappung (von oben nach unten, mind. 22 px Abstand)
  const enden = teams.map((t) => ({ t, y: Y(t.kennzahlen.verluste!.zustand) })).sort((x, y) => x.y - y.y);
  for (let i = 1; i < enden.length; i++) enden[i].y = Math.max(enden[i].y, enden[i - 1].y + 22);
  const fmtT = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:00`;
  // Marken S4/N4/S3 je Team; Beschriftung nur, wo sie frei steht (über, sonst unter der Marke), sonst nur Tooltip
  const belegt: [number, number, number, number][] = [];
  const marken = teams.flatMap((t) => PREIS_FAELLE.map((f) => {
    const e = t.faelle[f];
    if (!e || e.t === undefined || (e.ausgang !== "richtig" && e.ausgang !== "falsch")) return null;
    const x = X(Math.min(e.t, dauer));
    const y = Y(amOrt(t.kennzahlen.verluste!.verlauf, e.t));
    return { schl: `${t.id}-${f}`, t, f, x, y, ok: e.ausgang === "richtig", ly: null as number | null, titel: `${t.name} · ${f} ${AUSGANG_TEXT[e.ausgang]}: ${e.text}` };
  }).filter((m) => m !== null)).sort((m1, m2) => m1.x - m2.x);
  for (const m of marken) belegt.push([m.x - 9, m.y - 9, m.x + 9, m.y + 9]);
  for (const m of marken) {
    for (const ly of [m.y - 13, m.y + 26]) {
      const r: [number, number, number, number] = [m.x - 19, ly - 14, m.x + 19, ly + 3];
      if (belegt.some((b) => r[0] < b[2] && r[2] > b[0] && r[1] < b[3] && r[3] > b[1])) continue;
      m.ly = ly;
      belegt.push(r);
      break;
    }
  }
  const sMin = Math.min(...teams.map((t) => schwere(t.kennzahlen.verluste!)));
  const sMax = Math.max(...teams.map((t) => schwere(t.kennzahlen.verluste!)));
  const oben = teams.filter((t) => schwere(t.kennzahlen.verluste!) === sMin);
  const unten = teams.filter((t) => schwere(t.kennzahlen.verluste!) === sMax && sMax > sMin);
  const fehlText = (t: TeamAuswertung) => t.kennzahlen.fehl.wirkungen === 1 ? "1 Fehlbekämpfung" : `${t.kennzahlen.fehl.wirkungen} Fehlbekämpfungen`;
  const zugText = (t: TeamAuswertung) => `${t.kennzahlen.verluste!.bereit}/${t.kennzahlen.verluste!.gesamt} einsatzbereit`;
  return (
    <section class="tafel tafel-preis" data-testid="preis">
      <div class="preis-diagramm">
        <h1>{text?.titel ?? "Preis des Abwartens"}: Zustand der Panzer des {zugName}es je Team</h1>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Zustand der vier eigenen Panzer über die Spielzeit (Mittel), ${teams.length} Teams, Marken bei ${PREIS_FAELLE.join(", ")}`}>
          {[100, 90, 80, 70, 60, 50, 40, 30, 20].filter((v) => v >= ymin).map((v) => (
            <g key={v}><line x1={L} x2={X(dauer)} y1={Y(v)} y2={Y(v)} class={`kd-gitter ${v === unter || v === voll ? "untergrenze" : ""}`} />
              <text x={L - 10} y={Y(v) + 5} class="kd-tick rechts">{v} %</text></g>
          ))}
          <text x={X(dauer)} y={Y(voll) - 6} class="kd-tick rechts">darunter eingeschränkt</text>
          <text x={X(dauer)} y={Y(unter) - 6} class="kd-tick rechts">darunter ausgefallen – höchstens zwei, die Kp hält</text>
          {[0, 300, 600, 900, 1200, 1500].map((t) => (
            <g key={t}><line x1={X(t)} x2={X(t)} y1={H - U} y2={H - U + 5} class="kd-achse" /><text x={X(t)} y={H - U + 24} class="kd-tick mitte">{fmtT(t)}</text></g>
          ))}
          <text x={(L + X(dauer)) / 2} y={H - 6} class="kd-bereich mitte">Spielzeit</text>
          {teams.map((t) => {
            const v = t.kennzahlen.verluste!.verlauf;
            const pts = v.map(([tv, zs]) => `${X(tv).toFixed(1)},${Y(mittel(zs)).toFixed(1)}`).join(" ");
            return <polyline key={t.id} points={pts} class="preis-kurve" style={{ stroke: t.farbe }} data-team={t.name} />;
          })}
          {marken.map((m) => (
            <g key={m.schl} class={`preis-marke ${m.ok ? "richtig" : "falsch"}`} data-fall={m.f} data-team={m.t.name}>
              {m.ok ? <circle cx={m.x} cy={m.y} r={7} style={{ stroke: m.t.farbe }} /> : <rect x={m.x - 7} y={m.y - 7} width={14} height={14} transform={`rotate(45 ${m.x} ${m.y})`} style={{ stroke: m.t.farbe }} />}
              {m.ly !== null && <text x={m.x} y={m.ly} class="preis-marke-text">{m.f}{m.ok ? " ✓" : " ✕"}</text>}
              <title>{m.titel}</title>
            </g>
          ))}
          {enden.map(({ t, y }) => (
            <text key={t.id} x={X(dauer) + 10} y={y + 5} class="preis-ende" style={{ fill: t.farbe }}>{t.name} {t.kennzahlen.verluste!.bereit}/{t.kennzahlen.verluste!.gesamt}</text>
          ))}
        </svg>
        <div class="kd-legende">
          <span><svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6" class="preis-legende richtig" /></svg>Entscheidung richtig</span>
          <span><svg width="16" height="16" aria-hidden="true"><rect x="3" y="3" width="10" height="10" transform="rotate(45 8 8)" class="preis-legende falsch" /></svg>falsch (Fehlbekämpfung oder Regelverstoß)</span>
          <span class="sehr-leise">Zustand der Panzer im Mittel · Verluste sind Lage, keine Wertung</span>
        </div>
      </div>
      <aside class="preis-aussage">
        <table class="preis-tabelle">
          <thead><tr><th>Team</th><th>Panzer</th><th>Verw.</th><th>Fehl</th>{PREIS_FAELLE.map((f) => <th key={f}>{f}</th>)}</tr></thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id} data-team={t.name}>
                <td><TeamMarke name={t.name} farbe={t.farbe} klein /></td>
                <td class="preis-panzer" title={`${zugText(t)}\n${t.kennzahlen.verluste!.panzer.map((x) => `${x.name}: ${x.zustand} % ${PANZER_STUFE_TEXT[x.stufe]}`).join("\n")}`}>
                  {t.kennzahlen.verluste!.panzer.map((x) => (
                    <span key={x.id} class="pz-balken" data-pz={x.name} data-stufe={x.stufe}><i style={{ width: `${x.stufe === "ausgefallen" ? 100 : x.zustand}%` }} /></span>
                  ))}
                  <span class="preis-bereit">{t.kennzahlen.verluste!.bereit}/{t.kennzahlen.verluste!.gesamt}</span>
                </td>
                <td class="zahl">{t.kennzahlen.verluste!.verwundete}</td>
                <td class={`zahl ${t.kennzahlen.fehl.wirkungen ? "rot" : ""}`} title={t.kennzahlen.fehl.arten.map((x) => `${FEHL_TEXT[x.art] ?? x.art} ${x.anzahl}`).join(", ")}>{t.kennzahlen.fehl.wirkungen}</td>
                {PREIS_FAELLE.map((f) => {
                  const e = t.faelle[f];
                  return <td key={f} class={`ausgang-zelle ${e?.ausgang ?? ""}`} title={e?.text}>{e?.ausgang === "richtig" ? "✓" : e?.ausgang === "falsch" ? "✕" : "…"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {text && (
          <div class="preis-fragen" data-testid="preis-leitfragen">
            {oben.length > 0 && unten.length > 0 ? (
              <>
                <p><b>{oben.map((t) => t.name).join(", ")}</b> <span class="leise">({zugText(oben[0])}, {oben.map(fehlText).join(" / ")})</span><br />{text.leitfragen.weniger}</p>
                <p><b>{unten.map((t) => t.name).join(", ")}</b> <span class="leise">({zugText(unten[0])}, {unten.map(fehlText).join(" / ")})</span><br />{text.leitfragen.mehr}</p>
              </>
            ) : (
              <><p>{text.leitfragen.weniger}</p><p>{text.leitfragen.mehr}</p></>
            )}
          </div>
        )}
        {text && (
          <div class="preis-offenlegung" data-testid="offenlegung">
            <p>{text.offenlegung}</p>
            <ul>{text.bezuege.map((b) => <li key={b}>{b}</li>)}</ul>
          </div>
        )}
      </aside>
    </section>
  );
}

// ---------------------------------------------------------------- Bilanz „Das ist es wert“ (seit 2.7, G2)

/** Eine Spalte der Bilanz: ein Team oder „ARGUS allein“. */
interface BilanzSpalte {
  id: string;
  name: string;
  farbe?: string;
  argus?: boolean;
  laeuft?: boolean;
  b: Bilanz | null;
}

/** Zahl oder Strich. */
function zahlOder(x: number | null | undefined, f: (v: number) => string = (v) => String(v)): string {
  return x === null || x === undefined ? "–" : f(x);
}

/** „schneller als alle Teams“ usw. – was der Hinweis für die Spielleitung heute trifft (G2.5, keine Rangfolge der Teams). */
function heuteText(ref: Bilanz, teams: Bilanz[]): string {
  if (!teams.length) return "";
  const zeiten = teams.map((b) => b.medianS).filter((x): x is number => x !== null);
  const schneller = ref.medianS !== null && zeiten.every((x) => ref.medianS! < x);
  const mehr = teams.filter((b) => ref.wertMio > b.wertMio).length;
  const geschont = ref.panzer && teams.every((b) => !b.panzer || ref.panzer!.bereit >= b.panzer.bereit);
  return [
    schneller ? "schneller als alle Teams ✓" : "nicht schneller als jedes Team",
    mehr === teams.length ? "mehr zerstört als alle Teams ✓" : `mehr zerstört als ${mehr} von ${teams.length} Teams`,
    geschont ? "Panzer mindestens so gut erhalten wie jedes Team ✓" : "ein Team hat seine Panzer besser erhalten",
  ].join(" · ");
}

/**
 * Kapitel „Bilanz – Das ist es wert“ (G2.2–G2.5): je Team (feste Reihenfolge, keine Ränge) und „ARGUS allein“ (abgesetzt):
 * zerstörte Feindfahrzeuge und ihr Wert in Spielwerten, Munitionskosten, Zeit von der Meldung bis zur Wirkung, wie lange hingeschaut,
 * eigene Panzer. Ein Klick (oder „weiter“) deckt auf, was nicht in der Bilanz steht: die Fehlbekämpfungen als Zahl mit Zeichen, ohne
 * Eurowert. Keine Bilder aus den Treffern.
 */
function BilanzTafel(p: { a: Auswertung; inh: Inhalte; aufgedeckt: boolean; aufdecken: () => void }) {
  const { a, inh } = p;
  const regel = inh.regeln.bilanz;
  const text = inh.szenario.auswertung.bilanz;
  const refName = a.referenz?.name ?? inh.szenario.auswertung.referenz?.name ?? "ARGUS allein";
  if (!regel) return <div class="leer">Dieses Szenario hat keine Spielwerte für die Bilanz.</div>;
  const spalten: BilanzSpalte[] = [
    ...a.teams.map((t) => ({ id: t.id, name: t.name, farbe: t.farbe, laeuft: !t.ende, b: t.bilanz })),
    { id: "argus", name: refName, argus: true, b: a.referenz?.bilanz ?? null },
  ];
  const maxWert = Math.max(0.01, ...spalten.map((x) => x.b?.wertMio ?? 0));
  const teamB = a.teams.map((t) => t.bilanz).filter((x): x is Bilanz => !!x);
  const zelle = (x: BilanzSpalte, inhalt: ComponentChildren, klasse = "") => (
    <td key={x.id} class={`bz ${x.argus ? "bz-argus" : ""} ${klasse}`} data-spalte={x.id}>{x.argus && !a.referenz ? <span class="sehr-leise klein">wird gerechnet …</span> : inhalt}</td>
  );
  const zeile = (titel: ComponentChildren, f: (b: Bilanz) => ComponentChildren, klasse = "", unter?: ComponentChildren) => (
    <tr class={klasse}>
      <th class="bz-titel">{titel}{unter && <div class="bz-unter">{unter}</div>}</th>
      {spalten.map((x) => zelle(x, x.b ? f(x.b) : "–"))}
    </tr>
  );
  return (
    <section class="tafel tafel-bilanz" data-testid="bilanz">
      <div class="tafel-kopf">
        <h1>{text?.titel ?? "Bilanz – Das ist es wert"}</h1>
        <span class="leise">so viel habt ihr getroffen – in Spielwerten, gerundet · Teams in der Reihenfolge des Beitritts, keine Rangfolge</span>
      </div>
      <table class="bilanz" data-spalten={spalten.length}>
        <colgroup><col class="bz-c-titel" />{a.teams.map((t) => <col key={t.id} />)}<col class="bz-c-argus" /></colgroup>
        <thead>
          <tr>
            <th />
            {spalten.map((x) => (
              <th key={x.id} class={`bz-kopf ${x.argus ? "bz-argus" : ""}`} data-spalte={x.id}>
                {x.argus ? <><b>{x.name}</b><div class="klein">jede BEKÄMPFEN-Empfehlung sofort, ohne Prüfung</div></>
                  : <><TeamMarke name={x.name} farbe={x.farbe!} />{x.laeuft && <div class="klein sehr-leise">Spiel läuft</div>}</>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {zeile("Wert der zerstörten Feindfahrzeuge", (b) => (
            <div class="bz-wert"><b>{mio(b.wertMio)}</b> <span class="leise">Mio €</span>
              <i class="bz-balken" style={{ width: `${Math.round((b.wertMio / maxWert) * 100)}%` }} /></div>
          ), "bz-haupt")}
          {zeile("Feindfahrzeuge zerstört", (b) => <b class="bz-zahl">{b.fahrzeuge}</b>)}
          {zeile("Munition verschossen", (b) => <span class="bz-zahl">{euro(b.munitionEur)}</span>, "", "LM, Mörser, Kanone")}
          {zeile("Meldung bis Wirkung", (b) => <span class="bz-zahl">{zahlOder(b.medianS, (v) => `${Math.round(v)} s`)}</span>, "", "Median")}
          {zeile(<>Wie lange habt ihr hingeschaut?</>, (b) => <span class="bz-zahl">{zahlOder(b.hingeschautS, (v) => `${Math.round(v)} s`)}</span>, "bz-hinschauen",
            text?.zitat ? <span class="bz-zitat">„{text.zitat.text}“ <i>– {text.zitat.quelle}</i></span> : "Sekunden ab Eingang bis zur Entscheidung, Median")}
          {zeile("Eigene Panzer einsatzbereit", (b) => b.panzer ? (
            <span class="bz-panzer" title={`${b.panzer.bereit} von ${b.panzer.gesamt} einsatzbereit bei Spielende`}>
              {Array.from({ length: b.panzer.gesamt }, (_, i) => <i key={i} class={i < b.panzer!.bereit ? "an" : ""} />)}<b>{b.panzer.bereit}/{b.panzer.gesamt}</b>
            </span>) : "–")}
          <tr class="bz-trenner">
            <th colSpan={spalten.length + 1}>
              <button type="button" class={`knopf bz-aufdecken ${p.aufgedeckt ? "an" : ""}`} onClick={p.aufdecken} data-testid="bilanz-aufdecken" aria-expanded={p.aufgedeckt}>
                {p.aufgedeckt ? "▾" : "▸"} {text?.nicht_in_bilanz ?? "Nicht in der Bilanz"}
              </button>
              {!p.aufgedeckt && <span class="sehr-leise klein"> – Klick oder „weiter“ deckt auf</span>}
            </th>
          </tr>
          {p.aufgedeckt && regel.fehl.map((f) => (
            <tr key={f.id} class="bz-fehl" data-fehl={f.id}>
              <th class="bz-titel"><span class="bz-zeichen">{f.zeichen}</span> {f.text}{f.einheit && <span class="bz-einheit"> ({f.einheit})</span>}</th>
              {spalten.map((x) => {
                const n = x.b?.fehl[f.id as (typeof FEHL_IDS)[number]] ?? 0;
                return zelle(x, n ? <span class="bz-fehlzahl"><span class="bz-zeichen">{f.zeichen}</span> <b>{n}</b>
                  {f.kinder && x.b && x.b.kinder > 0 ? <span class="klein"> davon {x.b.kinder} Kinder</span> : null}</span> : <span class="sehr-leise">–</span>, n ? "fehl" : "");
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div class="tafel-fuss bz-fuss">
        <span class="sehr-leise">{regel.fuss}</span>
        {text?.hinweis_sl && a.referenz?.bilanz && (
          <span class="bz-hinweis" data-testid="bilanz-hinweis-sl" title="Hinweis für die Spielleitung – nicht vorlesen">
            SL: {text.hinweis_sl} <span class="sehr-leise">(heute: {heuteText(a.referenz.bilanz, teamB)})</span>
          </span>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Impuls (seit 2.7, G3)

/**
 * Kapitel „Impuls“: Folie 1 das Zitat ohne Quelle mit „Stimmt ihr zu?“, ein Klick (oder „weiter“) deckt die Quelle auf (Folie 2,
 * mit Pflichtzeile). Weitere Zitate (Karp, Thiel, Luckey, Gegenstimme Guterres) nur nach Klick auf „weitere Zitate“, je eine Folie mit
 * Quelle. Zitate wörtlich aus den Daten (G3.3).
 */
function ImpulsTafel(p: { inh: Inhalte; folie: number; weitere: boolean; setFolie: (f: number) => void }) {
  const imp = p.inh.szenario.auswertung.impuls;
  if (!imp?.folien.length) return <div class="leer">Kein Impuls im Szenario.</div>;
  const f = imp.folien[Math.min(p.folie, imp.folien.length - 1)];
  const erste = imp.folien[0];
  return (
    <section class="tafel tafel-impuls" data-testid="impuls" data-folie={f.id}>
      {f.ohne_quelle ? (
        <div class="impuls-folie ohne-quelle">
          <blockquote class="impuls-zitat gross" lang="en">„{f.original}“</blockquote>
          {f.deutsch && <p class="impuls-deutsch">„{f.deutsch}“</p>}
          <p class="impuls-frage">{imp.frage}</p>
          <button type="button" class="knopf impuls-aufdecken" onClick={() => p.setFolie(1)} data-testid="impuls-aufdecken">Wer sagt das? ▸</button>
        </div>
      ) : f.punkte ? (
        <div class="impuls-folie aufgedeckt">
          <h1 class="impuls-titel">{f.titel}</h1>
          <div class="impuls-quelle">{f.quelle}</div>
          <blockquote class="impuls-zitat" lang="en">„{erste.original}“</blockquote>
          {f.vorspann && <p class="impuls-vorspann">{f.vorspann}</p>}
          <ul class="impuls-punkte">
            {f.punkte.map((x) => <li key={x.text}><b>{x.text}</b>{x.zitat && <> – <q lang="en">{x.zitat}</q></>}</li>)}
          </ul>
          {f.pflicht && <p class="impuls-pflicht" data-testid="impuls-pflicht">{f.pflicht}</p>}
          <p class="impuls-frage klein-frage">{imp.frage}</p>
        </div>
      ) : (
        <div class={`impuls-folie weitere ${f.gegenstimme ? "gegenstimme" : ""}`}>
          {f.gegenstimme && <div class="impuls-marke">Gegenstimme</div>}
          <p class="impuls-wer"><b>{f.wer}</b>{f.rolle ? ` (${f.rolle}${f.anlass ? `, ${f.anlass}` : ""})` : f.anlass ? ` (${f.anlass})` : ""}{f.vorspann ? ` ${f.vorspann}` : ""}</p>
          <blockquote class="impuls-zitat gross" lang="en">„{f.original}“</blockquote>
          <p class="impuls-frage klein-frage">{imp.frage}</p>
        </div>
      )}
      <nav class="impuls-punkte-nav" aria-label="Folien des Impulses">
        {imp.folien.map((x, i) => (i <= 1 || p.weitere ? (
          <button type="button" key={x.id} class={`impuls-punkt ${i === p.folie ? "an" : ""}`} onClick={() => p.setFolie(i)} data-impuls={x.id}
            title={i === 0 ? "Zitat ohne Quelle" : i === 1 ? "Quelle" : x.wer}>{i === 0 ? "Zitat" : i === 1 ? "Quelle" : x.wer?.split(" ").slice(-1)[0]}</button>
        ) : null))}
        {!p.weitere && imp.folien.length > 2 && p.folie >= 1 && (
          <button type="button" class="knopf klein impuls-weitere" onClick={() => p.setFolie(2)} data-testid="impuls-weitere">weitere Zitate ›</button>
        )}
      </nav>
    </section>
  );
}

// ---------------------------------------------------------------- Diskussion (seit 2.7, G4.1)

/** Kapitel „Diskussion“: Folie „Wertekompass“ (Werte und Tugenden) mit den fünf Leitfragen; steht während der Diskussion. */
function DiskussionTafel(p: { inh: Inhalte }) {
  const d = p.inh.szenario.auswertung.diskussion;
  if (!d) return <div class="leer">Keine Diskussionsfolie im Szenario.</div>;
  const genannt = new Set(d.leitfragen.flatMap((l) => l.werte));
  return (
    <section class="tafel tafel-diskussion" data-testid="diskussion">
      <div class="kompass">
        <h1>{d.titel}</h1>
        <div class="sehr-leise">{d.quelle}</div>
        <h2>Werte</h2>
        <div class="kompass-chips">{d.werte.map((w) => <span key={w} class={`kompass-chip wert ${genannt.has(w) ? "genannt" : ""}`}>{w}</span>)}</div>
        <h2>Tugenden</h2>
        <div class="kompass-chips">{d.tugenden.map((w) => <span key={w} class={`kompass-chip tugend ${genannt.has(w) ? "genannt" : ""}`}>{w}</span>)}</div>
      </div>
      <ol class="leitfragen-diskussion">
        {d.leitfragen.map((l) => (
          <li key={l.titel}><b>{l.titel}</b>{l.werte.some((w) => !l.titel.includes(w)) && <span class="sehr-leise"> · {l.werte.filter((w) => !l.titel.includes(w)).join(", ")}</span>}<p>{l.text}</p></li>
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------- Abschluss (seit 2.7, G4.2)

/** Kapitel „Abschluss“: vier Kernaussagen und die Schlussfrage; darunter klein, was die Teams entschieden haben. */
function Abschluss(p: { a: Auswertung; inh: Inhalte }) {
  const { a, inh } = p;
  const au = inh.szenario.auswertung;
  const summe = (f: (t: TeamAuswertung) => number) => a.teams.reduce((s, t) => s + f(t), 0);
  return (
    <section class="tafel tafel-schluss" data-testid="schluss">
      {au.abschluss && (
        <div class="kernaussagen" data-testid="kernaussagen">
          {au.abschluss.kernaussagen.map((k, i) => (
            <div key={k.titel} class="kernaussage-karte"><span class="kernaussage-nr">{i + 1}</span><b>{k.titel}</b><p>{k.text}</p></div>
          ))}
        </div>
      )}
      <p class="schlussfrage">{au.schlussfrage}</p>
      {a.teams.length > 0 && (
        <div class="schluss-zahlen">
          <Zahl wert={summe((t) => t.kennzahlen.freigaben.gesamt)} text={`Bekämpfungen in ${a.teams.length} Teams`} />
          <Zahl wert={summe((t) => t.kennzahlen.freigaben.wieArgus)} text="davon wie von ARGUS empfohlen" />
          <Zahl wert={summe((t) => t.kennzahlen.zeiten.unter20)} text="Entscheidungen in höchstens 20 s" />
          <Zahl wert={summe((t) => t.kennzahlen.widerspruch.gesamt)} text={`Mal widersprochen – ${summe((t) => t.kennzahlen.widerspruch.zuRecht)} zu Recht`} />
        </div>
      )}
    </section>
  );
}

function Zahl(p: { wert: ComponentChildren; text: string }) {
  return <div class="schluss-zahl"><b>{p.wert}</b><span>{p.text}</span></div>;
}
