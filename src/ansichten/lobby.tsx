// Lobby der Teilnehmer (seit 2.6, H2.1): Team anlegen (Name frei, Würfel schlägt einen vor, Farbe automatisch) oder einem Team
// beitreten – keine Rollenwahl. Jedes Team ist die Zielbearbeitung des Bataillons: 2–3 Personen an einem Laptop. Der Laptop, der
// das Team anlegt, rechnet sein Spiel; ein weiteres Fenster desselben Teams sieht nur zu.
// Sobald die Spielleitung das Spiel für das eigene Team öffnet, wechselt das Fenster in die Ansicht.
import { useEffect, useState } from "preact/hooks";
import { SPIELERNAME_MAX, TEAMNAME_MAX, teamnameVorschlag } from "../kern/sitzungen";
import type { Sitzung, TeamStand } from "../sitzung/sitzung";
import { UEBERNAHME_MS } from "../sync/adapter";
import { BestaetigenKnopf, Hinweise, Panel } from "./gemeinsam/bausteine";
import { useSitzung } from "./gemeinsam/hooks";
import { RegelBanner, TeamMarke, seitText } from "./gemeinsam/rahmen";

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

function TeamKarte(p: { s: Sitzung; t: TeamStand }) {
  const { s, t } = p;
  const eigen = s.stand.ich.team === t.id;
  const [warte, setWarte] = useState(false);
  const da = t.spieler.filter((x) => x.online);
  const rechner = t.spieler.find((x) => x.client === t.rechner);
  const beitreten = async () => {
    setWarte(true);
    await s.teamBeitreten(t.id);
    setWarte(false);
  };
  // Liste K (K2.1): Der Laptop des Teams ist weg – nach 20 s kann dieses Fenster das Spiel sichtbar übernehmen
  const jetzt = s.adapter.serverJetzt();
  const weg = !!rechner && !t.rechnerOnline && rechner.client !== s.client;
  const rest = Math.ceil((UEBERNAHME_MS - (jetzt - (t.rechnerWegSeit ?? jetzt))) / 1000);
  const uebernehmen = async () => {
    setWarte(true);
    await s.teamUebernehmen(t.id);
    setWarte(false);
  };
  return (
    <section class={`team-karte ${eigen ? "eigen" : ""}`} style={{ "--teamfarbe": t.farbe }} data-team={t.id} data-teamname={t.name}>
      <header>
        <TeamMarke name={t.name} farbe={t.farbe} />
        <span class={`klein ${weg ? "wartet-text" : "sehr-leise"}`} data-testid="karte-stand">{weg ? `Laptop nicht verbunden · ${seitText(t.rechnerWegSeit, jetzt)}` : t.lauf ? "Spiel offen" : eigen ? "dein Team" : da.length ? "Laptop da" : "kein Laptop"}</span>
      </header>
      <div class="team-wer">
        {t.spieler.length === 0 ? <span class="sehr-leise">noch niemand</span> : t.spieler.map((x) => (
          <span key={x.client} class={`spieler-chip ${x.online ? "" : "weg"}`} title={x.client === t.rechner ? "Team-Laptop: rechnet das Spiel" : "sieht zu"}>
            <i class="punkt" />{x.name || "Team"}{x.client === s.client ? " (du)" : ""}{x.client === t.rechner ? " ★" : ""}
          </span>
        ))}
      </div>
      {weg && (t.uebernehmbar ? (
        <BestaetigenKnopf klasse="klein warn" gesperrt={warte} onClick={() => void uebernehmen()} testid={`weiterfuehren-${t.id}`}
          frage="Wirklich? Nur wenn der andere Laptop aus ist"
          titel={`Der Laptop von Team ${t.name} (${rechner!.name}) ist seit ${seitText(t.rechnerWegSeit, jetzt)} nicht verbunden. Dieser Laptop führt das Spiel dann weiter – ab dem, was im Netz steht.`}>
          Spiel hier weiterführen
        </BestaetigenKnopf>
      ) : <span class="klein leise" data-testid="karte-warten">Weiterführen hier in {Math.max(1, rest)} s möglich</span>)}
      {!eigen && (
        <button type="button" class={`knopf klein ${weg ? "leise" : "weiter"}`} disabled={warte} onClick={() => void beitreten()} data-beitreten={t.name}
          title={rechner ? `Team ${t.name} hat schon einen Laptop (${rechner.name}${t.rechnerOnline ? "" : ", gerade nicht verbunden"}) – hier nur zuschauen` : `Team ${t.name} beitreten – dieser Laptop rechnet dann das Spiel`}>
          {rechner ? "zuschauen" : "beitreten"}
        </button>
      )}
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

  const erstellen = async () => {
    const n = teamname.trim() || teamnameVorschlag(vergeben);
    setWarte(true);
    nameSpeichern();
    const id = await s.teamErstellen(n);
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
        <div class="lobby-schritt">{eigen ? "Warten auf die Spielleitung" : "Team anlegen oder beitreten"}</div>
        <div class="kopf-rechts">
          <span class={`badge ${st.verbindung.verbunden ? "gut" : "schlecht"}`} title={st.verbindung.fehler ?? st.verbindung.art}>
            <span class="punkt" />{st.verbindung.verbunden ? "verbunden" : "keine Verbindung"}
          </span>
        </div>
      </header>
      {st.regelFehler && <RegelBanner />}
      <main class="inhalt lobby-inhalt">
        <div class="stapel">
          <Panel titel="Eure Namen" klasse="flach">
            <input class="feld" placeholder="z. B. Lt Müller, Lt Schmidt (freiwillig)" maxLength={SPIELERNAME_MAX} value={name} data-testid="lobby-name"
              onInput={(e) => setName((e.target as HTMLInputElement).value)} onBlur={nameSpeichern}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
          </Panel>

          {eigen ? (
            <Panel titel="Ihr seid im Team" klasse="flach lobby-ich" testid="lobby-ich">
              <div class="stapel" style="gap:10px">
                <div class="zeile"><TeamMarke name={eigen.name} farbe={eigen.farbe} /></div>
                <div>{st.ich.rechnet ? "Dieser Laptop spielt für das Team." : <>Das Spiel des Teams läuft am Laptop von <b>{eigen.spieler.find((x) => x.client === eigen.rechner)?.name ?? "?"}</b> – hier nur zuschauen.</>}</div>
                <div class="hinweis-box">Die Spielleitung öffnet das Spiel für alle Teams. Dann erscheint hier eure Ansicht mit einer kurzen Einweisung.</div>
                {st.ich.abgeloest && <div class="hinweis-box" data-testid="lobby-abgeloest">Das Spiel wird an einem anderen Laptop weitergeführt.</div>}
                <button type="button" class="knopf klein leise" style="align-self:flex-start" onClick={() => void s.teamVerlassen()}>Team verlassen</button>
              </div>
            </Panel>
          ) : (
            <Panel titel="Neues Team" klasse="flach" testid="lobby-neu">
              <div class="stapel" style="gap:10px">
                <div class="zeile" style="flex-wrap:nowrap">
                  <input class="feld" placeholder="Teamname" maxLength={TEAMNAME_MAX} value={teamname} data-testid="lobby-teamname"
                    onInput={(e) => setTeamname((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && void erstellen()} />
                  <button type="button" class="knopf wuerfel" title="Namen vorschlagen" data-testid="lobby-wuerfel"
                    onClick={() => setTeamname(teamnameVorschlag(vergeben))}>🎲</button>
                </div>
                <button type="button" class="knopf weiter gross" disabled={warte} onClick={() => void erstellen()} data-testid="team-erstellen">
                  Team anlegen<span class="unterzeile">dieser Laptop spielt für das Team</span>
                </button>
                <div class="klein sehr-leise">Die Teamfarbe wird automatisch vergeben. Ohne Namen würfelt ARGUS einen.</div>
              </div>
            </Panel>
          )}

          <Panel titel="So spielt ihr" klasse="flach">
            <div class="rollen-erklaerung">
              <div class="klein">Ihr seid zu zweit oder zu dritt an <b>einem Laptop</b> und bildet die Zielbearbeitung: Jede ARGUS-Meldung entscheidet ihr –
                BEKÄMPFEN (mit Mörser, Loitering Munition oder Kanone), ZURÜCKSTELLEN oder ABLEHNEN.</div>
              <div class="klein leise">Ein Laptop je Team. Wer an einem zweiten Rechner beitritt, sieht nur zu.</div>
            </div>
          </Panel>
        </div>

        <Panel titel={<>Teams in dieser Sitzung <span class="badge" style="margin-left:6px">{st.teams.length}</span></>} liste testid="lobby-teams">
          {!st.teamsGeladen ? <div class="leer">Teams werden geladen …</div> : st.teams.length === 0 ? (
            <div class="leer lobby-leer">Noch keine Teams. Legt links euer Team an.</div>
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

/** Direktaufruf ohne Lobby: warten, bis Team und Spiel angelegt sind. */
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
