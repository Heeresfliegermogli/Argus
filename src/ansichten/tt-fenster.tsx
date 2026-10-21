// Fenster eines Teilnehmers: erst die Lobby, dann – sobald die Spielleitung das Spiel für das eigene
// Team öffnet – die Ansicht der eigenen Rolle. Bei Doppelrolle schaltet ein Umschalter im Kopf
// zwischen den Rollen um; die Zahl am Umschalter zeigt, was bei der anderen Rolle wartet.
// Verschiebt die Spielleitung jemanden in ein anderes Team oder eine andere Rolle, folgt das Fenster.
import { useMemo, useState } from "preact/hooks";
import { type GruppenRolle, ROLLEN_KURZ } from "../kern/sitzungen";
import { ROLLEN_NAME, injectsFuer, warteschlange } from "../kern/sichten";
import { Sicht } from "../sitzung/sicht";
import type { Sitzung } from "../sitzung/sitzung";
import type { Spiel } from "../sitzung/spiel";
import { useMeldeSicht, useSitzungWert, useStand } from "./gemeinsam/hooks";
import { Rahmen } from "./gemeinsam/rahmen";
import { Lobby, Warten } from "./lobby";
import { ANSICHTEN } from "./register";

/** Was bei einer Rolle wartet: offene Meldungen, bei G3 auch ungelesene Lagemeldungen. */
function offenFuer(s: Sicht, r: GruppenRolle): number {
  const z = s.stand.zustand;
  const n = warteschlange(z, r).filter((m) => !m.beobachten).length;
  return r === "g3" ? n + injectsFuer(s.inh, z, "g3").filter((i) => !i.quittiert).length : n;
}

function Rollenwahl(p: { sichten: Record<string, Sicht>; rollen: GruppenRolle[]; aktiv: GruppenRolle; setze: (r: GruppenRolle) => void }) {
  const st = useStand(p.sichten[p.aktiv]);
  void st; // neu zeichnen, wenn sich der Stand ändert (Zahlen an den anderen Rollen)
  return (
    <div class="rollenwahl-kopf" role="tablist" data-testid="rollenwahl">
      <span class="marke-klein">ARGUS</span>
      {p.rollen.map((r) => {
        const n = r === p.aktiv ? 0 : offenFuer(p.sichten[r], r);
        return (
          <button type="button" role="tab" aria-selected={r === p.aktiv} key={r} class={`rolle-tab rolle-${r} ${r === p.aktiv ? "an" : ""}`}
            onClick={() => p.setze(r)} data-rolle-tab={r} title={`Zur Ansicht ${ROLLEN_NAME[r]} wechseln`}>
            {r === p.aktiv ? ROLLEN_NAME[r] : ROLLEN_KURZ[r]}
            {n > 0 && <span class="badge neu">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

function TeamSpiel(p: { s: Sitzung; spiel: Spiel; rollen: GruppenRolle[] }) {
  const { s, spiel, rollen } = p;
  const [wahl, setWahl] = useState<GruppenRolle>(rollen[0]);
  const aktiv = rollen.includes(wahl) ? wahl : rollen[0];
  const sichten = useMemo(() => Object.fromEntries(rollen.map((r) => [r, new Sicht(s, spiel, r)])) as Record<string, Sicht>, [s, spiel, rollen.join(",")]);
  const sicht = sichten[aktiv];
  useMeldeSicht(sicht);
  const Ansicht = ANSICHTEN[aktiv];
  const band = rollen.length > 1 ? <Rollenwahl sichten={sichten} rollen={rollen} aktiv={aktiv} setze={setWahl} /> : undefined;
  return <Rahmen s={sicht} band={band}><Ansicht s={sicht} /></Rahmen>;
}

export function TTFenster(p: { s: Sitzung }) {
  const { s } = p;
  // Lobby und Spiel zeichnen sich selbst neu; hier zählt nur, was gezeigt wird.
  const st = useSitzungWert(s, (x) => {
    const t = x.ich.team ? x.teams.find((y) => y.id === x.ich.team) : undefined;
    return [x.teamsGeladen, x.infoGeladen, !!x.info, x.direkt, x.ich.team, x.ich.rollen.join(), t?.lauf, !!s.spiel(x.ich.team)].join("|");
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
  if (team && team.lauf && spiel && st.ich.rollen.length) {
    return <TeamSpiel key={`${team.id}`} s={s} spiel={spiel} rollen={st.ich.rollen} />;
  }
  if (st.direkt) return <Warten s={s} text="Warten auf die Spielleitung – sie legt das Spiel an." />;
  return <Lobby s={s} />;
}
