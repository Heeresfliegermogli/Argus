// Rahmen jeder Ansicht: Kopfzeile mit Rolle, Spieluhr, Fast-Track, Verbindung und Teilnehmern.
// Der Wurzelknoten trägt data-Attribute (seq, Fingerabdruck), damit Tests Fenster vergleichen können.
import type { ComponentChildren } from "preact";
import { istVeraltet } from "../../sync/adapter";
import { ROLLEN_NAME } from "../../kern/sichten";
import { mmss, phaseZu, uhrzeit } from "../../kern/uhr";
import { fingerabdruck } from "../../kern/zustand";
import type { Sitzung } from "../../sitzung/sitzung";
import { Hinweise } from "./bausteine";
import { useSpielzeit, useStand } from "./hooks";

export function Rahmen(p: { s: Sitzung; children: ComponentChildren }) {
  const st = useStand(p.s);
  const t = useSpielzeit(p.s);
  const sz = p.s.inh.szenario;
  const z = st.zustand;
  const tAnzeige = Math.min(t, sz.spieluhr.dauer_s);
  const phase = phaseZu(sz, tAnzeige);
  const hostDa = !!st.host && !istVeraltet(st.host.puls, p.s.adapter.serverJetzt());
  const uhrText = !st.lauf ? "kein Spiel" : z.ende ? "Spielende" : z.uhr.laeuft ? `läuft${z.uhr.tempo !== 1 ? ` ×${z.uhr.tempo}` : ""}` : "angehalten";
  return (
    <div class="rahmen" data-rolle={st.rolle} data-seq={z.seq} data-fp={fingerabdruck(z)} data-lauf={st.lauf ?? ""} data-host={st.istHost ? "1" : "0"}>
      <header class="kopf">
        <div class="kopf-links">
          <span class="marke">ARGUS</span>
          <span class={`rolle rolle-${st.rolle}`}>{ROLLEN_NAME[st.rolle]}</span>
          {st.name !== ROLLEN_NAME[st.rolle] && <span class="leise">{st.name}</span>}
          <span class="sehr-leise klein">{sz.anzeige} · fiktive Übungslage</span>
        </div>
        <div class="uhr" title={`Spielzeit ${mmss(tAnzeige)} von ${mmss(sz.spieluhr.dauer_s)}`}>
          <span class="uhr-zeit" data-testid="uhr">{uhrzeit(sz.spieluhr.start, tAnzeige)}</span>
          <span class="uhr-info">{uhrText}<br />Phase {phase.nr}: {phase.name}</span>
        </div>
        <div class="kopf-rechts">
          {z.fastTrack && <span class="badge warn" title="Meldungen ab 90 % mit BEKÄMPFEN gehen ohne G1 an G2">Fast-Track EIN</span>}
          {st.rolle !== "sl" && !hostDa && <span class="badge schlecht">Spielleitung fehlt</span>}
          <span class={`badge ${st.verbindung.verbunden ? "gut" : "schlecht"}`} title={st.verbindung.fehler ?? st.verbindung.art}>
            <span class="punkt" />{st.verbindung.verbunden ? st.verbindung.art : "keine Verbindung"}
          </span>
          <span class="badge" title={st.teilnehmer.map((x) => x.name).join(", ")}>{st.teilnehmer.length} Fenster · Raum {st.raum}</span>
        </div>
      </header>
      {p.children}
      <Hinweise s={p.s} />
    </div>
  );
}
