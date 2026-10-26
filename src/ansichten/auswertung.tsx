// Auswertung im Plenum (Schritt 8): Auflösung nach Spielende am Smartboard, gesteuert von der Spielleitung.
//
// Kapitel (je ein Klick oder Bild ↓ / → am Presenter):
//   1 Teamvergleich – Teams × Schlüssel-/Nebenfälle: Ausgang und wer an welcher Stufe entschieden hat
//   2 Kennzahlen    – Fehlbekämpfungen, Widerspruch gegen ARGUS, Bearbeitungszeit je Stufe, Fast-Track, I-04, Lagehinweise
//   3 Konfidenz     – Kernaussage: ARGUS war bei den Fehlern sicherer als bei den echten Zielen
//   S3, S2, S1, S4  – Replay je Schlüsselfall: Zeitleiste aller Teams, Kontrollkarte zum Durchscrubben, Drohnenbild
//                     wie G1 es sah, Leitfragen und Bezüge, Notizen der SL 2
//   Schlussfrage
// Zeitbudget 12 min (2 min Kennzahlen, je Fall 2,5 min) oben rechts. Export der Ergebnisse ohne Namen.
//
// Leitplanken: Die Auswertung zeigt Teams, nie Namen von Personen. Sie bleibt bei der Ethik (Fehlbekämpfungen,
// Widerspruch, Informationsweitergabe) – keine Rangliste, keine Punkte.
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Inhalte } from "../inhalte/typen";
import {
  AUSGANG_TEXT, type Auswertung, FEHL_TEXT, type FallDef, type FallErgebnis, type KettenGlied, type TeamAuswertung, type TeamLauf, type ZeitMarke,
  auswerten, ereignisseBis, exportAnonym, exportCsv, fallFenster, fallInjects, zeitleiste, zustandBis,
} from "../kern/auswertung";
import { bekannteZiele, effekte } from "../kern/effekte";
import { weltFuer } from "../kern/lage";
import { lagebildKontrolle } from "../kern/lagebild";
import { position, vorhanden } from "../kern/geometrie";
import { gemeldetePosition } from "../kern/regeln";
import { mmss, uhrzeit } from "../kern/uhr";
import { ROLLEN_NAME, ROLLEN_ZEICHEN } from "../kern/sichten";
import { zielNr } from "../kern/zielnummern";

/** „Ziel 8“ – in allen Teams dieselbe Nummer (B7). */
function zielText(inh: Inhalte, id: string): string {
  return `Ziel ${zielNr(inh, null, id)}`;
}
import type { LiveLage } from "../drohne/livebild";
import { Menue } from "./gemeinsam/bausteine";
import { LagekarteAnsicht } from "./gemeinsam/lagekarte";
import { LiveDrohnenFenster } from "./gemeinsam/livedrohne";
import { TeamMarke } from "./gemeinsam/rahmen";

/**
 * Wie schnell das Replay läuft (Spielsekunden je Sekunde): so, dass ein Fall in ca. 45 s abläuft (×4 bis ×15) – vom
 * Budget von 2,5 min je Fall bleibt so der größte Teil für das Gespräch.
 */
export const REPLAY_DAUER_S = 45;
export function replayTempo(von: number, bis: number): number {
  return Math.max(4, Math.min(15, Math.round((bis - von) / REPLAY_DAUER_S)));
}

interface Kapitel {
  id: string;
  kurz: string;
  titel: string;
  /** Zeitbudget in s */
  budget: number;
  fall?: FallDef;
}

/** Kapitel der Auflösung: Teamvergleich, Kennzahlen, Konfidenz (zusammen 2 min), je Schlüsselfall 2,5 min, Schlussfrage. */
export function kapitelListe(a: Auswertung): Kapitel[] {
  return [
    { id: "teams", kurz: "Teams", titel: "Teamvergleich", budget: 45 },
    { id: "kennzahlen", kurz: "Kennzahlen", titel: "Kennzahlen je Team", budget: 45 },
    { id: "konfidenz", kurz: "Konfidenz", titel: "Was die Konfidenz sagt", budget: 30 },
    ...a.faelle.filter((f) => f.art === "schluessel").map((f) => ({ id: f.id, kurz: f.id, titel: `${f.id} · ${f.titel}`, budget: 150, fall: f })),
    { id: "schluss", kurz: "Schluss", titel: "Schlussfrage", budget: 0 },
  ];
}

export const BUDGET_GESAMT = 12 * 60;

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

export function AuswertungAnsicht(p: AuswertungProps) {
  const schl = teamSchluessel(p.teams);
  const a = useMemo(() => auswerten(p.inh, p.teams), [p.inh, schl]);
  const kapitel = useMemo(() => kapitelListe(a), [a]);
  const [nr, setNr] = useState(0);
  const [team, setTeam] = useState<string | null>(null);
  const [spielt, setSpielt] = useState(false);
  const k = kapitel[Math.min(nr, kapitel.length - 1)];
  const teamId = team && a.teams.some((t) => t.id === team) ? team : a.teams[0]?.id ?? null;
  const uhr = useZeitbudget(k.id);

  const geh = (n: number) => {
    setSpielt(false);
    setNr(Math.max(0, Math.min(kapitel.length - 1, n)));
  };
  // Presenter und Tastatur: Bild ↓ / → weiter, Bild ↑ / ← zurück, Pos1/Ende, 1–9 Team, Leertaste/P Replay
  const tasten = useRef({ nr, geh, kapitel, a, setTeam, setSpielt, k });
  tasten.current = { nr, geh, kapitel, a, setTeam, setSpielt, k };
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      const ziel = e.target as HTMLElement | null;
      if (ziel && (ziel.tagName === "INPUT" || ziel.tagName === "TEXTAREA" || ziel.tagName === "SELECT" || ziel.isContentEditable)) return;
      if (document.querySelector(".lupe-schirm")) return; // Vergrößerung des Drohnenbilds offen (Esc schließt)
      const x = tasten.current;
      if (["PageDown", "ArrowRight", "ArrowDown"].includes(e.key)) x.geh(x.nr + 1);
      else if (["PageUp", "ArrowLeft", "ArrowUp", "Backspace"].includes(e.key)) x.geh(x.nr - 1);
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
          <button type="button" class="knopf kapitel-pfeil" onClick={() => geh(nr - 1)} disabled={nr === 0} aria-label="vorheriges Kapitel" title="zurück (Bild ↑, ←)">◂</button>
          {kapitel.map((x, i) => (
            <button type="button" key={x.id} class={`kapitel-chip ${i === nr ? "an" : ""} ${x.fall ? "fall" : ""}`} onClick={() => geh(i)} data-kapitel={x.id}
              aria-current={i === nr ? "step" : undefined} title={x.titel}>
              {x.fall ? x.kurz : <><span class="kapitel-nr">{i + 1}</span>{x.kurz}</>}
            </button>
          ))}
          <button type="button" class="knopf kapitel-pfeil" onClick={() => geh(nr + 1)} disabled={nr === kapitel.length - 1} aria-label="nächstes Kapitel" title="weiter (Bild ↓, →, Presenter)" data-testid="weiter">▸</button>
        </nav>
        <div class="kopf-rechts">
          <Zeitbudget uhr={uhr} k={k} />
          <ExportMenue inh={p.inh} teams={p.teams} a={a} />
          {p.zurueck && <button type="button" class="knopf klein" onClick={p.zurueck.aktion} data-testid="auswertung-zurueck">{p.zurueck.text}</button>}
        </div>
      </header>
      <main class="auswertung" data-kapitel={k.id} data-testid="auswertung">
        {a.teams.length === 0 ? <div class="leer">Noch kein Team hat gespielt.</div>
          : k.id === "teams" ? <Teamvergleich a={a} inh={p.inh} waehle={(f, t) => { setTeam(t); const i = kapitel.findIndex((x) => x.id === f); if (i >= 0) geh(i); }} />
            : k.id === "kennzahlen" ? <KennzahlenTafel a={a} inh={p.inh} />
              : k.id === "konfidenz" ? <KonfidenzTafel a={a} inh={p.inh} sl={p.art === "sl"} />
                : k.fall ? <Replay key={k.id} a={a} inh={p.inh} teams={p.teams} fall={k.fall} team={teamId!} setTeam={setTeam} spielt={spielt} setSpielt={setSpielt} notiz={p.notiz} />
                  : <Schluss a={a} inh={p.inh} />}
      </main>
    </div>
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

function Zeitbudget(p: { uhr: UhrStand; k: Kapitel }) {
  const { uhr, k } = p;
  const ueber = k.budget > 0 && uhr.kapitel > k.budget;
  return (
    <button type="button" class={`zeitbudget ${ueber ? "ueber" : ""} ${uhr.gesamt > BUDGET_GESAMT ? "ueber-gesamt" : ""}`} onClick={uhr.zuruecksetzen}
      title="Zeitbudget der Auswertung: Kapitel / gesamt (Klick: neu beginnen)" data-testid="zeitbudget">
      {k.budget > 0 && <span>{mmss(uhr.kapitel)} / {mmss(k.budget)}</span>}
      <span class="sehr-leise">Σ {mmss(uhr.gesamt)} / {mmss(BUDGET_GESAMT)}</span>
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
          title="mit Vermerken, Begründungen, Lagehinweisen und Notizen der Spielleitung – können Namen enthalten">JSON mit Freitexten</button>
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

/** Kette A → Z → F (Aufklärung, Zielprüfung, Führung; → Einschlag): wer an welcher Stufe was entschieden hat; die entscheidende Stufe umrandet. */
function KetteZeile(p: { e: FallErgebnis; kompakt?: boolean }) {
  const k = p.e.kette;
  return (
    <span class={`kette ${p.kompakt ? "kompakt" : ""}`} aria-label={k.glieder.map((g) => g.titel).join("; ")}>
      {k.glieder.map((g: KettenGlied) => (
        <span key={g.stufe} class={`glied g-${g.stufe} ${g.art} ${g.entscheidend ? "entscheidend" : ""}`} title={g.titel}>
          <i>{ROLLEN_ZEICHEN[g.stufe]}</i><b>{g.vorher ? "◷›" : ""}{g.zeichen}</b>
        </span>
      ))}
      {k.einschlag && <span class={`glied einschlag ${k.einschlag.fehl || k.einschlag.regel ? "fehl" : ""}`} title={k.einschlag.text}><b>✸</b></span>}
    </span>
  );
}

// ---------------------------------------------------------------- Kapitel 1: Teamvergleich

/** Kurzfassung für die schmalen Zellen der Nebenfälle: ohne Wirkmittel, kurze Verben. */
/** Text in den schmalen Spalten der Nebenfälle: ohne Wirkmittel und ohne Rolle (die Kette darüber zeigt, wer es war). */
function zelleKurz(z: string): string {
  const k = z.replace(/\s*\([^)]*\)\s*$/, "").replace("stellt zurück", "zurück").replace("nicht bekämpfen", "nicht bek.").replace("FREIGABE", "Freigabe")
    .replace(/^(Aufklärung|Zielprüfung|Führung) /, "");
  return k.charAt(0).toUpperCase() + k.slice(1);
}

function Teamvergleich(p: { a: Auswertung; inh: Inhalte; waehle: (fall: string, team: string) => void }) {
  const { a } = p;
  const sf = a.faelle.filter((f) => f.art === "schluessel");
  const nf = a.faelle.filter((f) => f.art === "neben");
  return (
    <section class="tafel tafel-vergleich" data-testid="teamvergleich">
      <div class="tafel-kopf">
        <h1>Wer hat an welcher Stufe entschieden?</h1>
        <div class="legende-zeile">
          <span><span class="ausgang richtig"><b>✓</b></span> richtig</span>
          <span><span class="ausgang falsch"><b>✕</b></span> falsch</span>
          <span><span class="ausgang verpasst"><b>◐</b></span> zu Unrecht abgelehnt</span>
          <span><span class="ausgang offen"><b>…</b></span> offen / entfallen</span>
          <span class="trenner" />
          <span><span class="glied halt mini"><b>✕</b></span> gestoppt</span>
          <span><span class="glied warten mini"><b>◷</b></span> zurückgestellt</span>
          <span><span class="glied ft mini"><b>FT</b></span> Fast-Track</span>
          <span><span class="glied entscheidend mini"><b>·</b></span> hat entschieden</span>
          <span class="trenner" />
          <span class="leise">A Aufklärung · Z Zielprüfung · F Führung</span>
        </div>
      </div>
      <table class="vergleich">
        <colgroup>
          <col class="c-team" />
          {a.faelle.map((f) => <col key={f.id} class={f.art === "neben" ? "c-neben" : "c-fall"} />)}
        </colgroup>
        <thead>
          <tr class="gruppe">
            <th />
            <th colSpan={sf.length}>Schlüsselfälle</th>
            <th colSpan={nf.length} class="neben">Nebenfälle</th>
          </tr>
          <tr>
            <th class="team-spalte">Team</th>
            {a.faelle.map((f) => (
              <th key={f.id} class={f.art === "neben" ? "neben" : ""} title={f.titel}>
                <span class="fall-id">{f.id}</span><span class="fall-titel">{f.titel}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {a.teams.map((t) => (
            <tr key={t.id} data-team={t.id}>
              <th class="team-spalte"><TeamMarke name={t.name} farbe={t.farbe} />{!t.ende && <div class="klein sehr-leise">Spiel läuft</div>}</th>
              {a.faelle.map((f) => {
                const e = t.faelle[f.id];
                return (
                  <td key={f.id} class={`vergleich-zelle ${e.ausgang} ${f.art === "neben" ? "neben" : ""}`} data-fall={f.id} data-ausgang={e.ausgang}
                    title={`${f.id} · ${t.name}: ${AUSGANG_TEXT[e.ausgang]} – ${e.text}`}
                    onClick={() => f.art === "schluessel" && p.waehle(f.id, t.id)}>
                    <div class="zelle-oben"><Ausgang e={e} /><KetteZeile e={e} kompakt={f.art === "neben"} /></div>
                    {f.art === "schluessel" ? <div class="zelle-text">{e.zeilen.map((z) => <div>{z}</div>)}</div>
                      : <div class="zelle-text klein">{zelleKurz(e.zeilen[0] ?? "")}</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th class="team-spalte sehr-leise">alle Teams</th>
            {a.faelle.map((f) => {
              const n = (x: string) => a.teams.filter((t) => t.faelle[f.id].ausgang === x).length;
              return (
                <td key={f.id} class={f.art === "neben" ? "neben" : ""}>
                  <span class="summe">{n("falsch") > 0 && <span class="rot">✕ {n("falsch")}</span>} <span class="gruen">✓ {n("richtig")}</span>
                    {n("verpasst") > 0 && <span class="bernstein"> ◐ {n("verpasst")}</span>}</span>
                </td>
              );
            })}
          </tr>
        </tfoot>
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
  const schwelle = a.teams[0]?.kennzahlen.zeiten.schwelle ?? 90;
  return (
    <section class="tafel tafel-kennzahlen" data-testid="kennzahlen">
      <div class="tafel-kopf">
        <h1>Kennzahlen je Team</h1>
        <span class="leise">aus den Protokollen · Bearbeitungszeit = Eingang bei der Stufe bis zur Entscheidung (Median)</span>
      </div>
      <table class="kennzahlen">
        <colgroup>
          <col style="width:206px" /><col style="width:196px" /><col style="width:112px" /><col style="width:170px" />
          <col style="width:270px" /><col style="width:178px" /><col style="width:150px" /><col />
        </colgroup>
        <thead>
          <tr>
            <th class="team-spalte">Team</th>
            <th>Fehlbekämpfungen</th>
            <th>Freigabe trotz Regel&shy;warnung</th>
            <th>Widerspruch gegen ARGUS</th>
            <th>Bearbeitungszeit je Stufe <span class="th-zusatz">(A · Z · F)</span></th>
            <th>Fast-Track</th>
            <th>{lmId} gelesen{lmErschienen !== undefined && <span class="th-zusatz"> (kam {uhrzeit(start, lmErschienen).slice(0, 5)})</span>}</th>
            <th>Lagehinweise der Führung</th>
          </tr>
        </thead>
        <tbody>
          {a.teams.map((t) => {
            const k = t.kennzahlen;
            const lm = k.lagemeldungen[0];
            return (
              <tr key={t.id} data-team={t.id}>
                <th class="team-spalte"><TeamMarke name={t.name} farbe={t.farbe} />
                  <div class="klein sehr-leise">{k.meldungen.bearbeitet} von {k.meldungen.erschienen} Meldungen bearbeitet</div></th>
                <td data-kz="fehl">
                  <b class={`wert ${k.fehl.wirkungen ? "rot" : "gruen"}`}>{k.fehl.wirkungen}</b>
                  <div class="chips">{k.fehl.arten.map((x) => <span key={x.art} class="chip fehl">{FEHL_TEXT[x.art]}{x.anzahl > 1 ? ` ×${x.anzahl}` : ""}</span>)}</div>
                </td>
                <td data-kz="warnung"><b class={`wert ${k.trotzWarnung ? "rot" : ""}`}>{k.trotzWarnung}</b></td>
                <td data-kz="widerspruch">
                  <b class="wert">{k.widerspruch.gesamt}</b>
                  <div class="unter"><span class="gruen">{k.widerspruch.zuRecht} zu Recht</span> · <span class={k.widerspruch.zuUnrecht ? "rot" : ""}>{k.widerspruch.zuUnrecht} zu Unrecht</span></div>
                </td>
                <td data-kz="zeit">
                  <div class="stufen-zeit">
                    {(["g1", "g2", "g3"] as const).map((s) => <span key={s} class={`sz g-${s}`} title={ROLLEN_NAME[s]}><i>{ROLLEN_ZEICHEN[s]}</i><b>{sek(k.zeiten.alle[s])}</b> s</span>)}
                  </div>
                  <div class="unter">≥ {schwelle} %: {sek(k.zeiten.hoch.g1)} · {sek(k.zeiten.hoch.g2)} · {sek(k.zeiten.hoch.g3)} s · darunter {sek(k.zeiten.niedrig.g1)} · {sek(k.zeiten.niedrig.g2)} · {sek(k.zeiten.niedrig.g3)} s</div>
                </td>
                <td data-kz="ft">
                  {k.fastTrack.an ? <b class="wert bernstein">EIN</b> : <b class="wert leise">aus</b>}
                  <div class="unter">{k.fastTrack.an && k.fastTrack.seit !== undefined ? `ab ${uhrzeit(start, k.fastTrack.seit)}` : k.fastTrack.wechsel.length ? `zuletzt aus ${uhrzeit(start, k.fastTrack.wechsel[k.fastTrack.wechsel.length - 1].t)}` : "nie eingeschaltet"}
                    {k.fastTrack.meldungen > 0 && ` · ${k.fastTrack.meldungen} Meldungen ohne Aufklärung`}</div>
                </td>
                <td data-kz="lm">
                  {lm?.gelesen !== undefined ? <b class="wert">{uhrzeit(start, lm.gelesen)}</b> : <b class="wert rot">nicht gelesen</b>}
                  <div class="unter">{lm?.gelesen !== undefined && lm.erschienen !== undefined ? `${dauerText(lm.gelesen - lm.erschienen)} nach Eingang` : lm?.erschienen === undefined ? "kam nicht" : ""}</div>
                </td>
                <td data-kz="hinweise">
                  <b class="wert">{k.lagehinweise.anzahl}</b>
                  <div class="unter">{k.lagehinweise.ersterNach !== undefined ? `nach ${lmId}: ${uhrzeit(start, k.lagehinweise.ersterNach)}` : k.lagehinweise.anzahl ? `keiner nach ${lmId}` : "keiner"}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div class="tafel-fuss leise">
        Fehlbekämpfung: Wirkung traf Verbündete, Sanität, Zivilpersonen, die Attrappe oder Gegner, die sich ergeben. Widerspruch: anders gehandelt, als ARGUS empfahl –
        zu Recht, wo die Lage es verlangte. Gezählt wird nur, was im Protokoll steht.
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Kapitel 3: Konfidenz

function KonfidenzTafel(p: { a: Auswertung; inh: Inhalte; sl?: boolean }) {
  const { a, inh } = p;
  const k = a.konfidenz;
  const schwelle = inh.regeln.fast_track.schwelle;
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
          <text x={X(schwelle) + 6} y={O + 18} class="kd-bereich bernstein">Fast-Track ab {schwelle} %</text>
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
          {ueberFt > 0 && <li><b>{ueberFt === k.falsch ? `Alle ${k.falsch}` : `${ueberFt} von ${k.falsch}`} Fehler</b> lagen über der Fast-Track-Schwelle ({schwelle} %).</li>}
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
        <G1Bild inh={inh} welt={welt} lauf={lauf} tw={tw} fall={fall} />
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

/** Drohnenbild, wie die Aufklärung es bei der Entscheidung sah (live zur Zeit der Entscheidung, die Drohne verfolgt das Ziel; Lupe per Klick). */
function G1Bild(p: { inh: Inhalte; welt: Inhalte; lauf: TeamLauf; tw: TeamAuswertung; fall: FallDef }) {
  const { welt, tw, fall } = p;
  const start = p.inh.szenario.spieluhr.start;
  const mv = tw.verlaeufe.get(fall.meldung);
  const g1 = mv?.entscheidungen.find((x) => x.stufe === "g1");
  const tBild = g1?.t ?? mv?.t ?? welt.meldungen[fall.meldung]?.t_s ?? 0;
  const lage = useMemo((): LiveLage => {
    const z = zustandBis(p.inh, p.lauf.protokoll, tBild).z;
    return { inh: welt, z, effekte: effekte(welt, z, bekannteZiele(welt, z, "g1")) };
  }, [p.lauf, tBild, welt]);
  const m = welt.meldungen[fall.meldung];
  const hinweis = !mv ? "Die Meldung kam bei diesem Team nicht." : mv.fastTrack ? "Fast-Track: Die Aufklärung hat dieses Bild nie gesehen." : !g1 ? "Die Aufklärung hat nicht entschieden." : null;
  return (
    <div class="g1-bild" data-testid="g1-bild">
      <h2>Drohnenbild, wie die Aufklärung es sah <span class="sehr-leise klein">{g1 ? `bei der Entscheidung ${uhrzeit(start, g1.t)} – ${g1.was === "annehmen" ? "ANNEHMEN" : "ABLEHNEN"}` : mv ? `zur Meldezeit ${uhrzeit(start, mv.t)}` : ""}</span></h2>
      <div class={`g1-bild-rahmen ${hinweis ? "mit-hinweis" : ""}`}>
        {m && <LiveDrohnenFenster key={`${tw.id}-${fall.id}`} meldung={m} lage={() => lage} uhr={() => ({ t: tBild, tempo: 1, laeuft: false })} start={start} />}
        {hinweis && <div class="g1-bild-hinweis">{hinweis}</div>}
      </div>
      {m && (
        <div class="g1-sensor" title="Sensordaten der Drohne – nur die Aufklärung sah sie (ARGUS wertet sie nicht aus)">
          <span class="leise">Sensordaten (nur Aufklärung):</span> Wärme {m.sensor.waerme} · Bewegung {m.sensor.bewegung} · Spuren {m.sensor.spuren}
          {m.sensor.kennzeichnung && m.sensor.kennzeichnung !== "keine erkannt" ? <> · Kennzeichnung <b>{m.sensor.kennzeichnung}</b></> : null}
          {m.sensor.personen && m.sensor.personen !== "–" ? <> · Personen {m.sensor.personen}</> : null}
        </div>
      )}
    </div>
  );
}

/** Zeitleiste aller Teams zu einem Fall: Meldung → Aufklärung → Zielprüfung → Führung → Einschlag; Klick wählt Team und Zeit. */
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
    ...fallInjects(inh).filter((i) => i.fall === fall.id).map((i) => ({ t: i.t, text: i.id, klasse: "inject", titel: `${i.id} an die Führung ${uhrzeit(start, i.t)}: „${inh.injects[i.id]?.text ?? ""}“` })),
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
          <span><i class="zl-marke g1 muster">A✓</i><i class="zl-marke g2 muster">Z◷</i><i class="zl-marke g3 muster">F✕</i>Entscheidung (A Aufklärung, Z Zielprüfung, F Führung)</span>
          <span><i class="zl-marke g3 freigabe muster">F✓</i>Freigabe</span>
          <span><i class="zl-marke einschlag fehl muster">✸</i>Einschlag</span>
          <span><i class="zl-marke gelesen muster">✉</i>Lagemeldung gelesen</span>
          <span><i class="zl-marke hinweis muster">▲</i>Lagehinweis</span>
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

function Schluss(p: { a: Auswertung; inh: Inhalte }) {
  const { a, inh } = p;
  const summe = (f: (t: TeamAuswertung) => number) => a.teams.reduce((s, t) => s + f(t), 0);
  return (
    <section class="tafel tafel-schluss" data-testid="schluss">
      <p class="schlussfrage">{inh.szenario.auswertung.schlussfrage}</p>
      <div class="schluss-zahlen">
        <Zahl wert={summe((t) => t.kennzahlen.freigaben.gesamt)} text={`Freigaben in ${a.teams.length} Teams`} />
        <Zahl wert={summe((t) => t.kennzahlen.freigaben.wieArgus)} text="davon wie von ARGUS empfohlen" />
        <Zahl wert={summe((t) => t.kennzahlen.fastTrack.meldungen)} text="Meldungen per Fast-Track ohne Aufklärung" />
        <Zahl wert={summe((t) => t.kennzahlen.widerspruch.gesamt)} text={`Mal widersprochen – ${summe((t) => t.kennzahlen.widerspruch.zuRecht)} zu Recht`} />
      </div>
    </section>
  );
}

function Zahl(p: { wert: ComponentChildren; text: string }) {
  return <div class="schluss-zahl"><b>{p.wert}</b><span>{p.text}</span></div>;
}

