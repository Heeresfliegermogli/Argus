// Rahmen jeder Ansicht: Kopfzeile mit Rolle, Spieluhr, Fast-Track, Verbindung, Teilnehmern und dem
// Knopf „Einweisung“. Vor Spielbeginn öffnet sich die Einweisungskarte der Gruppe von selbst, bei
// Spielende sperrt eine Tafel die Gruppen-Ansichten.
// Der Wurzelknoten trägt data-Attribute (seq, Fingerabdruck), damit Tests Fenster vergleichen können.
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { istVeraltet } from "../../sync/adapter";
import { ROLLEN_NAME } from "../../kern/sichten";
import { mmss, phaseZu, uhrzeit } from "../../kern/uhr";
import { fingerabdruck } from "../../kern/zustand";
import type { Sitzung } from "../../sitzung/sitzung";
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

export function Rahmen(p: { s: Sitzung; children: ComponentChildren }) {
  const st = useStand(p.s);
  const t = useSpielzeit(p.s);
  const sz = p.s.inh.szenario;
  const z = st.zustand;
  const rolle = st.rolle;
  const gruppe = rolle === "g1" || rolle === "g2" || rolle === "g3";
  const [einweisung, setEinweisung] = useState(false);
  const [sperreZu, setSperreZu] = useState(false);
  const [entschieden, setEntschieden] = useState(false);

  // Vor Spielbeginn: Einweisungskarte der Gruppe zeigen (einmal je Fenster)
  useEffect(() => {
    if (entschieden || !st.geladen || !gruppe) return;
    setEntschieden(true);
    if (!gelesen(rolle) && !z.uhr.laeuft && z.uhr.t_s === 0 && !z.ende) setEinweisung(true);
  }, [st.geladen]);
  useEffect(() => {
    if (!z.ende) setSperreZu(false);
  }, [z.ende]);

  const schliessen = () => {
    setEinweisung(false);
    merkeGelesen(rolle);
  };

  const tAnzeige = Math.min(t, sz.spieluhr.dauer_s);
  const phase = phaseZu(sz, tAnzeige);
  const hostDa = !!st.host && !istVeraltet(st.host.puls, p.s.adapter.serverJetzt());
  const uhrText = !st.lauf ? "kein Spiel" : z.ende ? "Spielende" : z.uhr.laeuft ? `läuft${z.uhr.tempo !== 1 ? ` ×${z.uhr.tempo}` : ""}` : tAnzeige === 0 ? "noch nicht gestartet" : "angehalten";
  return (
    <div class="rahmen" data-rolle={rolle} data-seq={z.seq} data-fp={fingerabdruck(z)} data-lauf={st.lauf ?? ""} data-host={st.istHost ? "1" : "0"}>
      <header class="kopf">
        <div class="kopf-links">
          <div class={`rollenband rolle-${rolle}`}><span class="marke">ARGUS</span><span>{ROLLEN_NAME[rolle]}</span></div>
          {st.name !== ROLLEN_NAME[rolle] && <span class="leise">{st.name}</span>}
          <span class="sehr-leise klein">{sz.anzeige} · Übungslage, fiktiv</span>
        </div>
        <div class="uhr" title={`Spielzeit ${mmss(tAnzeige)} von ${mmss(sz.spieluhr.dauer_s)}`}>
          <span class="uhr-zeit" data-testid="uhr">{uhrzeit(sz.spieluhr.start, tAnzeige)}</span>
          <span class="uhr-info">{uhrText}<br />Phase {phase.nr}: {phase.name}</span>
        </div>
        <div class="kopf-rechts">
          {z.fastTrack && <span class="badge warn" title={`Meldungen ab ${p.s.inh.regeln.fast_track.schwelle} % mit BEKÄMPFEN gehen ohne G1 an G2`}>Fast-Track EIN</span>}
          {rolle !== "sl" && !hostDa && <span class="badge schlecht">Spielleitung fehlt</span>}
          <span class={`badge ${st.verbindung.verbunden ? "gut" : "schlecht"}`} title={`${st.verbindung.fehler ?? st.verbindung.art} · ${st.teilnehmer.length} Fenster · Raum ${st.raum}`}>
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
      {gruppe && z.ende && !sperreZu && (
        <div class="sperre" data-testid="spielende">
          <div class="sperre-karte">
            <h2>Spielende {uhrzeit(sz.spieluhr.start, sz.spieluhr.dauer_s)}</h2>
            <div class="leise" style="margin-bottom:14px">Eingaben sind gesperrt. Bitte zum Plenum – die Auswertung beginnt.</div>
            <button type="button" class="knopf klein" onClick={() => setSperreZu(true)}>Ansicht ansehen</button>
          </div>
        </div>
      )}
      {einweisung && rolle !== "plenum" && <EinweisungFenster inh={p.s.inh} rolle={rolle} schliessen={schliessen} />}
      <Hinweise s={p.s} />
    </div>
  );
}
