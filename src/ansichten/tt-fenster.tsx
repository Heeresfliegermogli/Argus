// Fenster eines Teams: erst die Lobby, dann – sobald die Spielleitung das Spiel für das eigene Team öffnet – die Ansicht der
// Zielbearbeitung (seit 2.6 eine Rolle je Team). Rechnet dieses Fenster das Spiel des Teams (Team-Laptop), ist es bedienbar; ein
// zweites Fenster desselben Teams sieht nur zu. Verschiebt die Spielleitung das Fenster in ein anderes Team, folgt es.
import { useMemo } from "preact/hooks";
import { Sicht } from "../sitzung/sicht";
import type { Sitzung } from "../sitzung/sitzung";
import type { Spiel } from "../sitzung/spiel";
import { useMeldeSicht, useSitzungWert } from "./gemeinsam/hooks";
import { Rahmen, type ZweiterTab } from "./gemeinsam/rahmen";
import { Lobby, Warten } from "./lobby";
import { ZBAnsicht } from "./zb";

function TeamSpiel(p: { s: Sitzung; spiel: Spiel; rechnet: boolean; zweiterTab?: ZweiterTab }) {
  const { s, spiel, rechnet } = p;
  const sicht = useMemo(() => new Sicht(s, spiel, "zb", { nurLesen: !rechnet }), [s, spiel, rechnet]);
  useMeldeSicht(sicht);
  return <Rahmen s={sicht} zweiterTab={p.zweiterTab}><ZBAnsicht s={sicht} /></Rahmen>;
}

/** K4.1: Die Spielleitung hat die Sitzung beendet. */
function Beendet(p: { s: Sitzung }) {
  const st = p.s.stand;
  return (
    <div class="start">
      <div class="start-karte stapel" style="gap:12px;width:min(560px,100%)" data-testid="sitzung-beendet">
        <h1>ARGUS</h1>
        <div style="font-size:20px"><b>Sitzung beendet – danke.</b></div>
        <div class="leise">Die Spielleitung hat die Sitzung <b class="mono">{st.code}</b> beendet. Dieser Laptop rechnet nicht mehr; das Protokoll eures Teams liegt bei der Spielleitung.</div>
        <a class="knopf weiter" style="align-self:flex-start;text-decoration:none" href={location.pathname}>Zur Startseite</a>
      </div>
    </div>
  );
}

/** K1.3: zweiter Tab desselben Browsers, solange das Team noch in der Lobby ist (danach steht der Hinweis über der Ansicht). */
function ZweiterTabKarte(p: { s: Sitzung; z: ZweiterTab; team?: string }) {
  return (
    <div class="start">
      <div class="start-karte stapel" style="gap:12px;width:min(600px,100%)" data-testid="zweiter-tab">
        <h1>ARGUS</h1>
        <div>Diese Sitzung ist schon in einem <b>anderen Tab</b> dieses Browsers offen{p.team ? <> (Team <b>{p.team}</b>)</> : ""}. Ein Laptop spielt nur in einem Tab.</div>
        <div class="zeile" style="gap:8px">
          <button type="button" class="knopf weiter" onClick={() => void p.z.holen()} data-testid="tab-holen">hierher holen</button>
          <button type="button" class="knopf leise" onClick={p.z.neuesGeraet} data-testid="tab-neu"
            title="Dieses Fenster als eigenes Gerät in die Lobby – nur für Tests mit mehreren Teams an einem PC">anderes Team an diesem Fenster …</button>
        </div>
        <div class="klein sehr-leise">„hierher holen“ hält den anderen Tab an; das Spiel läuft dann hier weiter.</div>
      </div>
    </div>
  );
}

export function TTFenster(p: { s: Sitzung; zweiterTab?: ZweiterTab }) {
  const { s } = p;
  // Lobby und Spiel zeichnen sich selbst neu; hier zählt nur, was gezeigt wird.
  const st = useSitzungWert(s, (x) => {
    const t = x.ich.team ? x.teams.find((y) => y.id === x.ich.team) : undefined;
    return [x.teamsGeladen, x.infoGeladen, !!x.info, x.direkt, x.ich.team, x.ich.rechnet, t?.lauf, !!s.spiel(x.ich.team), x.beendet, t?.name].join("|");
  });
  const team = s.team(st.ich.team);
  const spiel = s.spiel(st.ich.team);
  if (!st.teamsGeladen || !st.infoGeladen) return <div class="start"><div class="leise">Sitzung {st.code} wird geladen …</div></div>;
  if (!st.info && !st.direkt) {
    return (
      <div class="start">
        <div class="start-karte stapel" style="gap:12px;width:min(560px,100%)" data-testid="sitzung-fehlt">
          <h1>ARGUS</h1>
          <div>Die Sitzung <b class="mono">{st.code}</b> gibt es nicht.</div>
          <a class="knopf weiter" style="align-self:flex-start;text-decoration:none" href={location.pathname}>Code neu eingeben</a>
        </div>
      </div>
    );
  }
  if (st.beendet !== null) return <Beendet s={s} />;
  if (team && team.lauf && spiel) return <TeamSpiel key={`${team.id}`} s={s} spiel={spiel} rechnet={st.ich.rechnet} zweiterTab={p.zweiterTab} />;
  if (p.zweiterTab) return <ZweiterTabKarte s={s} z={p.zweiterTab} team={team?.name} />;
  if (st.direkt) return <Warten s={s} text="Das Spiel wird angelegt …" />;
  return <Lobby s={s} />;
}
