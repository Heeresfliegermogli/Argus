// Lobby der Teilnehmer: Team erstellen (Name frei, Würfel schlägt einen vor, Farbe automatisch),
// einem Team beitreten, Rolle wählen und wechseln, Doppelrolle. Ohne Erklärung bedienbar:
// links steht, was als Nächstes zu tun ist, rechts sind die Teams mit ihren freien Rollen.
// Sobald die Spielleitung das Spiel für das eigene Team öffnet, wechselt das Fenster in die Ansicht.
import { useEffect, useState } from "preact/hooks";
import { GRUPPEN_ROLLEN, type GruppenRolle, SPIELERNAME_MAX, TEAMNAME_MAX, teamnameVorschlag } from "../kern/sitzungen";
import { ROLLEN_NAME, ROLLEN_ZEICHEN } from "../kern/sichten";
import type { Sitzung, TeamStand } from "../sitzung/sitzung";
import { Hinweise, Panel } from "./gemeinsam/bausteine";
import { useSitzung } from "./gemeinsam/hooks";
import { TeamMarke } from "./gemeinsam/rahmen";

/** Eigener Name je Tab (sessionStorage): übersteht Neuladen, gilt aber nicht für andere Fenster am selben PC. */
function gemerkterName(): string {
  try {
    return sessionStorage.getItem("argus:name") ?? "";
  } catch {
    return "";
  }
}

function merkeName(n: string): void {
  try {
    sessionStorage.setItem("argus:name", n);
  } catch {
    /* privater Modus */
  }
}

export const ROLLE_KURZTEXT: Record<GruppenRolle, string> = {
  g1: "prüft jede ARGUS-Meldung zuerst und sieht das Drohnenbild",
  g2: "prüft die Einsatzregeln und wählt das Wirkmittel",
  g3: "gibt frei oder lehnt ab und bekommt die Lagemeldungen",
};

function Slot(p: { s: Sitzung; t: TeamStand; rolle: GruppenRolle; eigenesTeam: boolean; gesperrt: boolean }) {
  const { s, t, rolle } = p;
  const ich = s.client;
  const besetzt = t.spieler.filter((x) => x.rollen.includes(rolle));
  const online = besetzt.filter((x) => x.online);
  const weg = besetzt.filter((x) => !x.online);
  const meins = besetzt.some((x) => x.client === ich);
  const frei = online.length === 0 && !meins;
  const [warte, setWarte] = useState(false);
  const klick = async (f: () => Promise<unknown>) => {
    setWarte(true);
    await f();
    setWarte(false);
  };
  const laeuft = !!t.lauf;
  const anderesTeam = !p.eigenesTeam && !!s.stand.ich.team;
  const knopf = p.eigenesTeam ? "+ dazu" : anderesTeam ? "wechseln" : "beitreten";
  const name = ROLLEN_NAME[rolle];
  const titel = p.eigenesTeam ? `${name} zusätzlich übernehmen (Doppelrolle)`
    : anderesTeam ? `Zu Team ${t.name} wechseln und dort ${name} übernehmen` : `Team ${t.name} als ${name} beitreten`;
  return (
    <div class={`slot ${frei ? "frei" : "besetzt"} ${meins ? "meins" : ""}`} data-slot={`${t.name}:${rolle}`}>
      <span class={`slot-rolle rolle-${rolle}`} aria-hidden="true">{ROLLEN_ZEICHEN[rolle]}</span>
      <div class="slot-mitte">
        <div class="slot-titel">{name}</div>
        <div class="slot-wer">
          {meins && <b>du{s.stand.name ? ` (${s.stand.name})` : ""}</b>}
          {online.filter((x) => x.client !== ich).map((x) => <span key={x.client}>{x.name}</span>)}
          {frei && <span class="sehr-leise">frei{weg.length ? ` · ${weg.map((x) => x.name).join(", ")} ist weg` : ""}</span>}
        </div>
      </div>
      {frei && !p.gesperrt && (
        <button type="button" class={`knopf klein ${p.eigenesTeam ? "" : "weiter"}`} disabled={warte}
          onClick={() => void klick(() => s.rolleWaehlen(t.id, rolle))} title={titel}>
          {knopf}
        </button>
      )}
      {meins && !laeuft && (
        <button type="button" class="knopf klein leise" disabled={warte} onClick={() => void klick(() => s.rolleAbgeben(rolle))} title="Diese Rolle abgeben">
          abgeben
        </button>
      )}
    </div>
  );
}

function TeamKarte(p: { s: Sitzung; t: TeamStand }) {
  const { s, t } = p;
  const eigen = s.stand.ich.team === t.id;
  // Wer schon in einem laufenden Team ist, sieht die Lobby nicht mehr; im eigenen Team (noch Lobby)
  // kann man Rollen dazunehmen und abgeben.
  return (
    <section class={`team-karte ${eigen ? "eigen" : ""}`} style={{ "--teamfarbe": t.farbe }} data-team={t.id} data-teamname={t.name}>
      <header>
        <TeamMarke name={t.name} farbe={t.farbe} />
        <span class="klein sehr-leise">
          {t.lauf ? "Spiel läuft" : eigen ? "dein Team" : t.frei.length === 0 ? "voll" : `${3 - t.frei.length} von 3`}
        </span>
      </header>
      {GRUPPEN_ROLLEN.map((r) => <Slot key={r} s={s} t={t} rolle={r} eigenesTeam={eigen} gesperrt={false} />)}
    </section>
  );
}

export function Lobby(p: { s: Sitzung }) {
  const { s } = p;
  const st = useSitzung(s);
  const [name, setName] = useState(() => st.name || gemerkterName());
  const [teamname, setTeamname] = useState("");
  const [warte, setWarte] = useState(false);
  const eigen = s.team(st.ich.team);
  const vergeben = st.teams.map((t) => t.name);

  // Gemerkten Namen beim Öffnen übernehmen
  useEffect(() => {
    if (name && name !== st.name) void s.setzeName(name);
  }, []);
  const nameSpeichern = () => {
    const n = name.trim();
    merkeName(n);
    if (n !== st.name) void s.setzeName(n);
  };

  const erstellen = async (rolle: GruppenRolle) => {
    const n = teamname.trim() || teamnameVorschlag(vergeben);
    setWarte(true);
    nameSpeichern();
    const id = await s.teamErstellen(n, rolle);
    setWarte(false);
    if (id) setTeamname("");
  };

  return (
    <div class="rahmen lobby" data-rolle="lobby" data-sitzung={st.sitzung}>
      <header class="kopf">
        <div class="kopf-links">
          <div class="rollenband rolle-lobby"><span class="marke">ARGUS</span><span>Lobby</span></div>
          <span class="leise">Sitzung <b class="mono" data-testid="code">{st.code}</b></span>
          <span class="sehr-leise klein">{s.inh.szenario.anzeige} · Übungslage, fiktiv</span>
        </div>
        <div class="lobby-schritt">{eigen ? "Warten auf den Start durch die Spielleitung" : "Team erstellen oder einem Team beitreten"}</div>
        <div class="kopf-rechts">
          <span class={`badge ${st.verbindung.verbunden ? "gut" : "schlecht"}`} title={st.verbindung.fehler ?? st.verbindung.art}>
            <span class="punkt" />{st.verbindung.verbunden ? "verbunden" : "keine Verbindung"}
          </span>
        </div>
      </header>
      <main class="inhalt lobby-inhalt">
        <div class="stapel">
          <Panel titel="Dein Name" klasse="flach">
            <input class="feld" placeholder="z. B. Lt Müller (freiwillig)" maxLength={SPIELERNAME_MAX} value={name} data-testid="lobby-name"
              onInput={(e) => setName((e.target as HTMLInputElement).value)} onBlur={nameSpeichern}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
          </Panel>

          {eigen ? (
            <Panel titel="Du bist im Team" klasse="flach lobby-ich" testid="lobby-ich">
              <div class="stapel" style="gap:10px">
                <div class="zeile"><TeamMarke name={eigen.name} farbe={eigen.farbe} /></div>
                <div>Deine Rolle: <b>{st.ich.rollen.map((r) => ROLLEN_NAME[r]).join(" und ")}</b></div>
                {st.ich.rollen.length > 1 && <div class="klein leise">Doppelrolle: Im Spiel schaltest du oben zwischen den Rollen um.</div>}
                {eigen.frei.length > 0 && st.ich.rollen.length < 3 && (
                  <div class="klein leise">Noch frei: {eigen.frei.map((r) => ROLLEN_NAME[r]).join(", ")}. Fehlt jemand, übernimm die Rolle mit „+ dazu“.</div>
                )}
                <div class="hinweis-box">Die Spielleitung startet das Spiel für alle Teams. Dann erscheint hier deine Ansicht mit einer kurzen Einweisung.</div>
                <button type="button" class="knopf klein leise" style="align-self:flex-start" onClick={() => void s.teamVerlassen()}>Team verlassen</button>
              </div>
            </Panel>
          ) : (
            <Panel titel="Neues Team" klasse="flach" testid="lobby-neu">
              <div class="stapel" style="gap:10px">
                <div class="zeile" style="flex-wrap:nowrap">
                  <input class="feld" placeholder="Teamname" maxLength={TEAMNAME_MAX} value={teamname} data-testid="lobby-teamname"
                    onInput={(e) => setTeamname((e.target as HTMLInputElement).value)} />
                  <button type="button" class="knopf wuerfel" title="Namen vorschlagen" data-testid="lobby-wuerfel"
                    onClick={() => setTeamname(teamnameVorschlag(vergeben))}>🎲</button>
                </div>
                <div class="klein leise">Erstellen und beitreten als …</div>
                <div class="rollen-knoepfe">
                  {GRUPPEN_ROLLEN.map((r) => (
                    <button type="button" key={r} class={`knopf rolle-knopf rolle-${r}`} disabled={warte} onClick={() => void erstellen(r)} data-testid={`erstellen-${r}`}>
                      {ROLLEN_NAME[r]}
                    </button>
                  ))}
                </div>
                <div class="klein sehr-leise">Die Teamfarbe wird automatisch vergeben. Ohne Namen würfelt ARGUS einen.</div>
              </div>
            </Panel>
          )}

          <Panel titel="Die drei Rollen im Team" klasse="flach">
            <div class="rollen-erklaerung">
              {GRUPPEN_ROLLEN.map((r) => (
                <div key={r}><span class={`slot-rolle rolle-${r}`} aria-hidden="true">{ROLLEN_ZEICHEN[r]}</span><span><b>{ROLLEN_NAME[r]}</b> {ROLLE_KURZTEXT[r]}</span></div>
              ))}
              <div class="klein leise" style="margin-top:4px">Jede Rolle sitzt an einem eigenen Rechner. Seid ihr nur zu zweit, übernimmt eine Person zwei Rollen (im eigenen Team „+ dazu“).</div>
            </div>
          </Panel>
        </div>

        <Panel titel={<>Teams in dieser Sitzung <span class="badge" style="margin-left:6px">{st.teams.length}</span></>} liste testid="lobby-teams">
          {!st.teamsGeladen ? <div class="leer">Teams werden geladen …</div> : st.teams.length === 0 ? (
            <div class="leer lobby-leer">Noch keine Teams. Erstelle links das erste Team – die anderen treten dann hier bei.</div>
          ) : (
            <div class="team-raster">
              {st.teams.map((t) => <TeamKarte key={t.id} s={s} t={t} />)}
            </div>
          )}
        </Panel>
      </main>
      <Hinweise liste={s.hinweise.liste} />
    </div>
  );
}

/** Direktaufruf ohne Lobby: warten, bis die Spielleitung Team und Spiel angelegt hat. */
export function Warten(p: { s: Sitzung; text: string }) {
  const st = useSitzung(p.s);
  return (
    <div class="start">
      <div class="start-karte stapel" style="gap:10px;width:min(560px,100%)">
        <h1>ARGUS</h1>
        <div>{p.text}</div>
        <div class="klein sehr-leise">Sitzung {st.code} · {st.verbindung.verbunden ? "verbunden" : "keine Verbindung"}</div>
      </div>
    </div>
  );
}
