// Fenster der Spielleitung und des Plenums in einer Sitzung.
//
// Spielleitung: Startet mit der Übersicht aller Teams (uebersicht.tsx). „ansehen ›“ öffnet ein Team:
// „Steuerung“ ist die bekannte Spielleitungsansicht für dieses Team (Uhr, Kontrollkarte, Zeitplan,
// Protokoll), G1 · G2 · G3 zeigen die Ansicht der Rolle zum Zuschauen (nur lesen). Die Leiste oben
// links führt zurück zur Übersicht und wechselt Team und Ansicht, ohne Platz unter der Kopfzeile zu
// brauchen (alles bleibt in 1530 × 800). Das steuernde Fenster führt die Hosts aller Teams – egal,
// welche Ansicht es gerade zeigt.
//
// Plenum: zeigt ein Team (Wahl oben links); vor dem ersten Spiel Einweisung mit Code und Teams.
import { useMemo, useState } from "preact/hooks";
import type { Rolle } from "../kern/ereignisse";
import { DIREKT_TEAM, GRUPPEN_ROLLEN } from "../kern/sitzungen";
import { ROLLEN_NAME } from "../kern/sichten";
import { seitenAdresse } from "../config";
import { Sicht } from "../sitzung/sicht";
import type { Sitzung, TeamStand } from "../sitzung/sitzung";
import type { Spiel } from "../sitzung/spiel";
import { EinweisungFenster } from "./einweisung";
import { Hinweise } from "./gemeinsam/bausteine";
import { useMeldeSicht, useSitzung, useSitzungWert } from "./gemeinsam/hooks";
import { Rahmen } from "./gemeinsam/rahmen";
import { type Beitritt, PlenumAnsicht, PlenumEinweisung } from "./plenum";
import { ANSICHTEN } from "./register";
import { plenumOeffnen } from "./sl";
import { Uebersicht } from "./uebersicht";

type SLRolle = "sl" | "g1" | "g2" | "g3";
interface Wahl {
  team: string;
  rolle: SLRolle;
}

/** Auswahl eines Teams (Spielleitung, Plenum): Farbpunkt und Name. */
function TeamWahl(p: { teams: TeamStand[]; team: string; setze: (team: string) => void; testid?: string }) {
  const t = p.teams.find((x) => x.id === p.team);
  return (
    <label class="team-wahl" title="Team wählen">
      <i style={{ background: t?.farbe ?? "#9aa5b1" }} />
      <select value={p.team} onChange={(e) => p.setze((e.target as HTMLSelectElement).value)} data-testid={p.testid}>
        {p.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
    </label>
  );
}

/** Leiste der Spielleitung in der Teamansicht: zurück zur Übersicht, Team, Steuerung oder Zuschauen. */
function SLLeiste(p: { s: Sitzung; wahl: Wahl; setze: (w: Wahl | null) => void }) {
  const st = useSitzung(p.s);
  const teams = st.teams.filter((t) => t.lauf);
  return (
    <div class="sl-leiste" data-testid="sl-leiste">
      <button type="button" class="sl-zurueck" onClick={() => p.setze(null)} title="Übersicht aller Teams" data-testid="zur-uebersicht">◂ Übersicht</button>
      <TeamWahl teams={teams} team={p.wahl.team} setze={(team) => p.setze({ ...p.wahl, team })} testid="sl-teamwahl" />
      <div class="sl-rollen" role="tablist">
        {(["sl", ...GRUPPEN_ROLLEN] as SLRolle[]).map((r) => (
          <button type="button" role="tab" key={r} aria-selected={r === p.wahl.rolle} class={`rolle-tab rolle-${r} ${r === p.wahl.rolle ? "an" : ""}`}
            onClick={() => p.setze({ ...p.wahl, rolle: r })} data-sl-rolle={r}
            title={r === "sl" ? "Steuerung dieses Teams: Uhr, Kontrollkarte, Zeitplan, Protokoll" : `Zuschauen: Ansicht ${ROLLEN_NAME[r]} dieses Teams (nur lesen)`}>
            {r === "sl" ? "Steuerung" : r.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

function TeamAnsicht(p: { s: Sitzung; spiel: Spiel; wahl: Wahl; setze: (w: Wahl | null) => void }) {
  const { s, spiel, wahl } = p;
  const sicht = useMemo(() => new Sicht(s, spiel, wahl.rolle, { nurLesen: wahl.rolle !== "sl" }), [s, spiel, wahl.rolle]);
  useMeldeSicht(sicht);
  const Ansicht = ANSICHTEN[wahl.rolle as Rolle];
  return (
    <Rahmen s={sicht} band={<SLLeiste s={s} wahl={wahl} setze={p.setze} />} teamImBand>
      <Ansicht s={sicht} />
    </Rahmen>
  );
}

function UebersichtRahmen(p: { s: Sitzung; ansehen: (team: string) => void }) {
  const st = useSitzung(p.s);
  const [einweisung, setEinweisung] = useState(false);
  return (
    <div class="rahmen" data-rolle="sl" data-ansicht="uebersicht" data-host={st.istHost ? "1" : "0"} data-sitzung={st.sitzung}>
      <header class="kopf">
        <div class="kopf-links">
          <div class="rollenband rolle-sl"><span class="marke">ARGUS</span><span>Spielleitung</span></div>
          {st.name !== ROLLEN_NAME.sl && <span class="leise">{st.name}</span>}
          <span class="sehr-leise klein">{p.s.inh.szenario.anzeige} · Übungslage, fiktiv</span>
        </div>
        <div class="code-anzeige" title={`Teilnehmer: ${seitenAdresse()} öffnen und diesen Code eingeben`}>
          <span class="leise">Code</span> <b class="mono" data-testid="code">{st.code}</b>
        </div>
        <div class="kopf-rechts">
          <span class={`badge ${st.verbindung.verbunden ? "gut" : "schlecht"}`} title={`${st.verbindung.fehler ?? st.verbindung.art} · Sitzung ${st.code}`}>
            <span class="punkt" />{st.verbindung.verbunden ? `verbunden · ${st.teilnehmer.length}` : "keine Verbindung"}
          </span>
          <button type="button" class="knopf klein" onClick={() => setEinweisung(true)} data-testid="einweisung-knopf" title="Einweisungskarte der Spielleitung">Einweisung</button>
        </div>
      </header>
      <Uebersicht s={p.s} ansehen={p.ansehen} />
      {einweisung && <EinweisungFenster inh={p.s.inh} rolle="sl" schliessen={() => setEinweisung(false)} />}
      <Hinweise liste={p.s.hinweise.liste} />
    </div>
  );
}

export function SLFenster(p: { s: Sitzung }) {
  const { s } = p;
  // Übersicht und Teamansicht zeichnen sich selbst neu; hier zählt nur, welche Teams ein Spiel haben.
  const st = useSitzungWert(s, (x) => [x.direkt, ...x.teams.map((t) => `${t.id}:${t.lauf ?? ""}:${s.spiel(t.id) ? 1 : 0}`)].join("|"));
  // Direktaufruf (ein Team ohne Lobby): gleich die Steuerung des Teams, wie bis Schritt 6
  const [wahl, setWahl] = useState<Wahl | null>(st.direkt ? { team: DIREKT_TEAM, rolle: "sl" } : null);
  const team = wahl ? s.team(wahl.team) : undefined;
  const spiel = wahl ? s.spiel(wahl.team) : null;
  if (wahl && team?.lauf && spiel) return <TeamAnsicht key={team.id} s={s} spiel={spiel} wahl={wahl} setze={setWahl} />;
  if (wahl && st.direkt && !team?.lauf) return <div class="start"><div class="leise">Spiel wird angelegt …</div></div>;
  return <UebersichtRahmen s={s} ansehen={(t) => setWahl({ team: t, rolle: "sl" })} />;
}

// ---------------------------------------------------------------- Plenum

function beitritt(s: Sitzung): Beitritt | undefined {
  const st = s.stand;
  if (st.direkt) return undefined;
  return {
    code: st.code,
    adresse: seitenAdresse(),
    teams: st.teams.map((t) => ({ id: t.id, name: t.name, farbe: t.farbe, spieler: t.spieler.filter((x) => x.online).length })),
  };
}

function PlenumTeam(p: { s: Sitzung; spiel: Spiel; teams: TeamStand[]; setze: (team: string) => void }) {
  const sicht = useMemo(() => new Sicht(p.s, p.spiel, "plenum"), [p.s, p.spiel]);
  useMeldeSicht(sicht);
  useSitzung(p.s);
  const links = p.teams.length > 1 || !p.s.stand.direkt ? <TeamWahl teams={p.teams} team={p.spiel.team} setze={p.setze} testid="plenum-teamwahl" /> : undefined;
  return (
    <Rahmen s={sicht} links={links} teamImBand>
      <PlenumAnsicht s={sicht} beitritt={beitritt(p.s)} />
    </Rahmen>
  );
}

export function PlenumFenster(p: { s: Sitzung }) {
  const { s } = p;
  const st = useSitzungWert(s, (x) => [x.verbindung.verbunden, ...x.teams.map((t) => `${t.id}:${t.lauf ?? ""}:${t.name}:${t.farbe}:${t.spieler.filter((y) => y.online).length}:${s.spiel(t.id) ? 1 : 0}`)].join("|"));
  const [wahl, setWahl] = useState<string | null>(null);
  const mitLauf = st.teams.filter((t) => t.lauf && s.spiel(t.id));
  const team = mitLauf.find((t) => t.id === wahl) ?? mitLauf[0];
  const spiel = team ? s.spiel(team.id) : null;
  if (team && spiel) return <PlenumTeam key={team.id} s={s} spiel={spiel} teams={mitLauf} setze={setWahl} />;
  // Noch kein Spiel geöffnet: Einweisung mit Code, damit die Teilnehmer beitreten können
  return (
    <div class="rahmen" data-rolle="plenum" data-ansicht="warten">
      <header class="kopf">
        <div class="kopf-links">
          <div class="rollenband rolle-plenum"><span class="marke">ARGUS</span><span>Plenum</span></div>
          <span class="sehr-leise klein">{s.inh.szenario.anzeige} · Übungslage, fiktiv</span>
        </div>
        <div />
        <div class="kopf-rechts">
          <span class={`badge ${st.verbindung.verbunden ? "gut" : "schlecht"}`} title={st.verbindung.fehler ?? st.verbindung.art}>
            <span class="punkt" />{st.verbindung.verbunden ? "verbunden" : "keine Verbindung"}
          </span>
        </div>
      </header>
      <main class="plenum" data-modus="einweisung">
        <div class="plenum-kopf"><h2 style="font-size:20px">{s.inh.szenario.titel}</h2></div>
        <PlenumEinweisung inh={s.inh} beitritt={beitritt(s)} />
      </main>
    </div>
  );
}

export { plenumOeffnen };
