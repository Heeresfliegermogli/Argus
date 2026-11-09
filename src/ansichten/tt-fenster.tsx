// Fenster eines Teams: erst die Lobby, dann – sobald die Spielleitung das Spiel für das eigene Team öffnet – die Ansicht der
// Zielbearbeitung (seit 2.6 eine Rolle je Team). Rechnet dieses Fenster das Spiel des Teams (Team-Laptop), ist es bedienbar; ein
// zweites Fenster desselben Teams sieht nur zu. Verschiebt die Spielleitung das Fenster in ein anderes Team, folgt es.
import { useMemo } from "preact/hooks";
import { Sicht } from "../sitzung/sicht";
import type { Sitzung } from "../sitzung/sitzung";
import type { Spiel } from "../sitzung/spiel";
import { useMeldeSicht, useSitzungWert } from "./gemeinsam/hooks";
import { Rahmen } from "./gemeinsam/rahmen";
import { Lobby, Warten } from "./lobby";
import { ZBAnsicht } from "./zb";

function TeamSpiel(p: { s: Sitzung; spiel: Spiel; rechnet: boolean }) {
  const { s, spiel, rechnet } = p;
  const sicht = useMemo(() => new Sicht(s, spiel, "zb", { nurLesen: !rechnet }), [s, spiel, rechnet]);
  useMeldeSicht(sicht);
  return <Rahmen s={sicht}><ZBAnsicht s={sicht} /></Rahmen>;
}

export function TTFenster(p: { s: Sitzung }) {
  const { s } = p;
  // Lobby und Spiel zeichnen sich selbst neu; hier zählt nur, was gezeigt wird.
  const st = useSitzungWert(s, (x) => {
    const t = x.ich.team ? x.teams.find((y) => y.id === x.ich.team) : undefined;
    return [x.teamsGeladen, x.infoGeladen, !!x.info, x.direkt, x.ich.team, x.ich.rechnet, t?.lauf, !!s.spiel(x.ich.team)].join("|");
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
  if (team && team.lauf && spiel) return <TeamSpiel key={`${team.id}`} s={s} spiel={spiel} rechnet={st.ich.rechnet} />;
  if (st.direkt) return <Warten s={s} text="Das Spiel wird angelegt …" />;
  return <Lobby s={s} />;
}
