// Rahmen jeder Ansicht: Kopfzeile mit Rolle (bei Doppelrolle: Umschalter), Team, Spieluhr,
// Fast-Track, Verbindung und dem Knopf „Einweisung“. Vor Spielbeginn öffnet sich die Einweisungskarte
// der Gruppe von selbst (je Rolle einmal), bei Spielende sperrt eine Tafel die Gruppen-Ansichten.
// Der Wurzelknoten trägt data-Attribute (seq, Fingerabdruck), damit Tests Fenster vergleichen können.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Inhalte } from "../../inhalte/typen";
import { DIREKT_TEAM } from "../../kern/sitzungen";
import { ROLLEN_NAME } from "../../kern/sichten";
import { mmss, phaseZu, uhrzeit } from "../../kern/uhr";
import { type Spielzustand, fingerabdruck } from "../../kern/zustand";
import type { Sicht } from "../../sitzung/sicht";
import { istVeraltet } from "../../sync/adapter";
import { EinweisungFenster } from "../einweisung";
import { Hinweise } from "./bausteine";
import { useSpielzeit, useStand } from "./hooks";

function gelesen(rolle: string): boolean {
  try {
    return sessionStorage.getItem(`argus:einweisung:${rolle}`) === "1";
  } catch {
    return false;
  }
}

function merkeGelesen(rolle: string): void {
  try {
    sessionStorage.setItem(`argus:einweisung:${rolle}`, "1");
  } catch {
    /* privater Modus */
  }
}

/** Spieluhr mit Status und Phase (Kopfzeile). */
export function UhrAnzeige(p: { inh: Inhalte; z: Spielzustand; t: number; lauf: string | null; kurz?: boolean }) {
  const sz = p.inh.szenario;
  const z = p.z;
  const tAnzeige = Math.min(p.t, sz.spieluhr.dauer_s);
  const phase = phaseZu(sz, tAnzeige);
  const uhrText = !p.lauf ? "kein Spiel" : z.ende ? "Spielende" : z.uhr.laeuft ? `läuft${z.uhr.tempo !== 1 ? ` ×${z.uhr.tempo}` : ""}` : tAnzeige === 0 ? "noch nicht gestartet" : "angehalten";
  return (
    <div class="uhr" title={`Spielzeit ${mmss(tAnzeige)} von ${mmss(sz.spieluhr.dauer_s)}`}>
      <span class="uhr-zeit" data-testid="uhr">{uhrzeit(sz.spieluhr.start, tAnzeige)}</span>
      <span class="uhr-info">{uhrText}{!p.kurz && <><br />Phase {phase.nr}: {phase.name}</>}</span>
    </div>
  );
}

/** Teamname mit Farbe. */
export function TeamMarke(p: { name: string; farbe: string; klein?: boolean }) {
  return (
    <span class={`team-marke ${p.klein ? "klein" : ""}`} title={`Team ${p.name}`}>
      <i style={{ background: p.farbe }} /><span>{p.name}</span>
    </span>
  );
}

export function Rahmen(p: {
  s: Sicht; children: ComponentChildren;
  /** ersetzt das Rollenband (z. B. Umschalter bei Doppelrolle) */
  band?: ComponentChildren;
  /** zusätzlich links neben dem Band (z. B. Teamwahl im Plenum) */
  links?: ComponentChildren;
  /** Band oder links zeigen das Team schon (Spielleitung, Plenum): keine zweite Teammarke */
  teamImBand?: boolean;
}) {
  const st = useStand(p.s);
  const t = useSpielzeit(p.s);
  const sz = p.s.inh.szenario;
  const z = st.zustand;
  const rolle = st.rolle;
  const gruppe = rolle === "g1" || rolle === "g2" || rolle === "g3";
  const [einweisung, setEinweisung] = useState(false);
  const [sperreZu, setSperreZu] = useState(false);
  const entschieden = useRef(new Set<string>());

  // Einweisungskarte der Gruppe von selbst zeigen: einmal je Tab und Rolle (vor dem Start, bei
  // spätem Beitritt auch im laufenden Spiel; nach dem Schließen nicht wieder, auch nicht nach Neuladen)
  useEffect(() => {
    if (!st.geladen || !gruppe || st.nurLesen || entschieden.current.has(rolle)) return;
    entschieden.current.add(rolle);
    if (!gelesen(rolle) && !z.ende) setEinweisung(true);
  }, [st.geladen, rolle]);
  useEffect(() => {
    if (!z.ende) setSperreZu(false);
  }, [z.ende]);

  const schliessen = () => {
    setEinweisung(false);
    merkeGelesen(rolle);
  };

  const hostDa = !!st.host && !istVeraltet(st.host.puls, p.s.adapter.serverJetzt());
  const zeigeTeam = st.team !== DIREKT_TEAM && rolle !== "sl" && rolle !== "plenum" && !p.teamImBand;
  return (
    <div class="rahmen" data-rolle={rolle} data-seq={z.seq} data-fp={fingerabdruck(z)} data-lauf={st.lauf ?? ""} data-host={st.istHost ? "1" : "0"} data-team={st.team}>
      <header class="kopf">
        <div class="kopf-links">
          {p.band ?? <div class={`rollenband rolle-${rolle}`}><span class="marke">ARGUS</span><span>{ROLLEN_NAME[rolle]}</span></div>}
          {p.links}
          {zeigeTeam && <TeamMarke name={st.teamName} farbe={st.teamFarbe} />}
          {!zeigeTeam && !p.teamImBand && st.name !== ROLLEN_NAME[rolle] && <span class="leise">{st.name}</span>}
          {!p.band && !zeigeTeam && <span class="sehr-leise klein">{sz.anzeige} · Übungslage, fiktiv</span>}
        </div>
        <UhrAnzeige inh={p.s.inh} z={z} t={t} lauf={st.lauf} />
        <div class="kopf-rechts">
          {st.nurLesen && <span class="badge info" data-testid="nur-lesen">Zuschauen – nur lesen</span>}
          {z.fastTrack && <span class="badge warn" title={`Meldungen ab ${p.s.inh.regeln.fast_track.schwelle} % mit BEKÄMPFEN gehen ohne G1 an G2`}>Fast-Track EIN</span>}
          {rolle !== "sl" && !hostDa && <span class="badge schlecht">Spielleitung fehlt</span>}
          <span class={`badge ${st.verbindung.verbunden ? "gut" : "schlecht"}`} title={`${st.verbindung.fehler ?? st.verbindung.art} · ${st.teilnehmer.length} Fenster · Sitzung ${st.raum}`}>
            <span class="punkt" />{st.verbindung.verbunden ? `verbunden · ${st.teilnehmer.length}` : "keine Verbindung"}
          </span>
          {rolle !== "plenum" && (
            <button type="button" class="knopf klein" onClick={() => setEinweisung(true)} data-testid="einweisung-knopf" title="Einweisungskarte dieser Gruppe">
              Einweisung
            </button>
          )}
        </div>
      </header>
      {p.children}
      {gruppe && z.ende && !sperreZu && !st.nurLesen && (
        <div class="sperre" data-testid="spielende">
          <div class="sperre-karte">
            <h2>Spielende {uhrzeit(sz.spieluhr.start, sz.spieluhr.dauer_s)}</h2>
            <div class="leise" style="margin-bottom:14px">Eingaben sind gesperrt. Bitte zum Plenum – die Auswertung beginnt.</div>
            <button type="button" class="knopf klein" onClick={() => setSperreZu(true)}>Ansicht ansehen</button>
          </div>
        </div>
      )}
      {einweisung && rolle !== "plenum" && <EinweisungFenster inh={p.s.inh} rolle={rolle} schliessen={schliessen} />}
      <Hinweise liste={st.hinweise} />
    </div>
  );
}
