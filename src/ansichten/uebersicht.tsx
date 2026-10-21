// Spielleitung: Übersicht aller Teams der Sitzung.
//   • Steuerleiste für alle Teams: Spiel öffnen, Uhr starten/anhalten, Tempo, Spielzeit, Reserve-Injects,
//     neues Spiel, Plenum.
//   • Tabelle je Team: Spieler je Rolle (mit Anwesenheit), Spielzeit, Eingang je Stufe, Schlüsselfälle
//     live, Fehltreffer, Fast-Track, Verbindung, Start/Halt einzeln, „ansehen“ (Zuschauen und Steuern).
//   • Lobby verwalten: Teams umbenennen und löschen, Spieler verschieben, Teilnehmer ohne Team zuweisen.
import { useState } from "preact/hooks";
import type { AktionsDaten, AktionsTyp } from "../kern/ereignisse";
import { GRUPPEN_ROLLEN, type GruppenRolle, TEAMNAME_MAX } from "../kern/sitzungen";
import { ROLLEN_NAME } from "../kern/sichten";
import { type FallStatus, teamUebersicht } from "../kern/uebersicht";
import { mmss, spielzeit, uhrzeit } from "../kern/uhr";
import type { Sitzung, SpielerStand, TeamStand } from "../sitzung/sitzung";
import { istVeraltet } from "../sync/adapter";
import { BestaetigenKnopf, Leer, Menue, Panel } from "./gemeinsam/bausteine";
import { useSitzung, useTakt } from "./gemeinsam/hooks";
import { TeamMarke } from "./gemeinsam/rahmen";
import { plenumOeffnen } from "./sl";

const TEMPI = [1, 2, 5, 10, 20];
const FALL_TEXT: Record<FallStatus, string> = { wartet: "kommt noch", offen: "offen", richtig: "richtig", falsch: "falsch" };

/** Menü für einen Spieler: Rollen im Team ändern, in ein anderes Team verschieben, herausnehmen. */
function SpielerMenue(p: { s: Sitzung; t: TeamStand; x: SpielerStand; schliessen: () => void }) {
  const { s, t, x } = p;
  const andere = s.stand.teams.filter((u) => u.id !== t.id);
  const setze = async (team: string | null, rollen: GruppenRolle[]) => {
    p.schliessen();
    await s.spielerSetzen(x.client, team, rollen);
  };
  const umschalten = (r: GruppenRolle) => {
    const neu = x.rollen.includes(r) ? x.rollen.filter((y) => y !== r) : [...x.rollen, r];
    void setze(neu.length ? t.id : null, neu);
  };
  return (
    <>
      <div class="menue-kopf"><b>{x.name}</b> <span class="sehr-leise">{x.online ? "da" : "nicht verbunden"}</span></div>
      <div class="menue-zeile"><span>Rollen in {t.name}</span>
        <span class="zeile" style="gap:4px">{GRUPPEN_ROLLEN.map((r) => (
          <button type="button" key={r} class={`knopf klein ${x.rollen.includes(r) ? "an" : ""}`} onClick={() => umschalten(r)}
            title={x.rollen.includes(r) ? `${r.toUpperCase()} abgeben` : `${r.toUpperCase()} dazu`}>{r.toUpperCase()}</button>
        ))}</span>
      </div>
      {andere.length > 0 && <div class="menue-titel">verschieben nach</div>}
      {andere.map((u) => (
        <div class="menue-zeile" key={u.id}><TeamMarke name={u.name} farbe={u.farbe} klein />
          <span class="zeile" style="gap:4px">{GRUPPEN_ROLLEN.map((r) => (
            <button type="button" key={r} class={`knopf klein ${u.frei.includes(r) ? "weiter" : ""}`} onClick={() => void setze(u.id, [r])}
              title={u.frei.includes(r) ? `${r.toUpperCase()} ist frei` : `${r.toUpperCase()} ist besetzt`}>{r.toUpperCase()}</button>
          ))}</span>
        </div>
      ))}
      <button type="button" class="knopf klein schlecht" style="margin-top:6px" onClick={() => void setze(null, [])}>aus dem Team nehmen</button>
    </>
  );
}

/** Menü an einer freien Rolle: Teilnehmer ohne Team hierher setzen. */
function FreiMenue(p: { s: Sitzung; t: TeamStand; rolle: GruppenRolle; schliessen: () => void }) {
  const ohne = ohneTeam(p.s);
  return (
    <>
      <div class="menue-kopf"><b>{p.rolle.toUpperCase()} frei</b> <span class="sehr-leise">in {p.t.name}</span></div>
      {ohne.length === 0 ? <div class="klein sehr-leise">Alle Teilnehmer sind in Teams. Spieler aus anderen Teams über ihren Namen verschieben.</div> : (
        <>
          <div class="menue-titel">Teilnehmer ohne Team hierher setzen</div>
          {ohne.map((x) => (
            <button type="button" key={x.client} class="knopf klein" style="text-align:left"
              onClick={() => { p.schliessen(); void p.s.spielerSetzen(x.client, p.t.id, [p.rolle]); }}>{x.name || "Teilnehmer"}</button>
          ))}
        </>
      )}
    </>
  );
}

function ohneTeam(s: Sitzung) {
  const inTeams = new Set(s.stand.teams.flatMap((t) => t.spieler.map((x) => x.client)));
  return s.stand.teilnehmer.filter((x) => x.art === "tt" && !inTeams.has(x.client));
}

function RollenZelle(p: { s: Sitzung; t: TeamStand; rolle: GruppenRolle }) {
  const { s, t, rolle } = p;
  const [menue, setMenue] = useState<string | null>(null);
  const wer = t.spieler.filter((x) => x.rollen.includes(rolle)).sort((a, b) => Number(b.online) - Number(a.online));
  return (
    <td class="rollen-zelle" data-rolle-zelle={`${t.name}:${rolle}`}>
      {wer.length === 0 ? (
        <span class="menue-anker">
          <button type="button" class="spieler-chip frei" onClick={() => setMenue("frei")} title="Teilnehmer ohne Team hierher setzen">frei</button>
          <Menue offen={menue === "frei"} schliessen={() => setMenue(null)}><FreiMenue s={s} t={t} rolle={rolle} schliessen={() => setMenue(null)} /></Menue>
        </span>
      ) : wer.map((x) => (
        <span class="menue-anker" key={x.client}>
          <button type="button" class={`spieler-chip ${x.online ? "" : "weg"}`} onClick={() => setMenue(x.client)}
            title={`${x.name} · ${x.rollen.map((r) => r.toUpperCase()).join(" + ")} · ${x.online ? "da" : "nicht verbunden"} – Klick: Rolle ändern, verschieben`}>
            <i class="punkt" />{x.name}{x.rollen.length > 1 && <span class="sehr-leise"> ·{x.rollen.length}</span>}
          </button>
          <Menue offen={menue === x.client} schliessen={() => setMenue(null)}><SpielerMenue s={s} t={t} x={x} schliessen={() => setMenue(null)} /></Menue>
        </span>
      ))}
    </td>
  );
}

function TeamName(p: { s: Sitzung; t: TeamStand }) {
  const { s, t } = p;
  const [bearbeiten, setBearbeiten] = useState(false);
  const [wert, setWert] = useState(t.name);
  if (bearbeiten) {
    const fertig = (speichern: boolean) => {
      setBearbeiten(false);
      if (speichern && wert.trim() && wert.trim() !== t.name) void s.teamUmbenennen(t.id, wert);
    };
    return (
      <input class="feld team-umbenennen" value={wert} maxLength={TEAMNAME_MAX} ref={(el) => el?.focus()}
        onInput={(e) => setWert((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => { if (e.key === "Enter") fertig(true); if (e.key === "Escape") fertig(false); }} onBlur={() => fertig(true)} />
    );
  }
  return (
    <span class="zeile team-name-zelle" style="flex-wrap:nowrap;gap:4px">
      <button type="button" class="team-name-knopf" title="Umbenennen" onClick={() => { setWert(t.name); setBearbeiten(true); }}>
        <TeamMarke name={t.name} farbe={t.farbe} />
      </button>
      <BestaetigenKnopf klasse="klein leise loeschen" titel={`Team ${t.name} löschen${t.lauf ? " (der Spielstand bleibt gespeichert)" : ""}`} testid={`loeschen-${t.id}`}
        frage="löschen?" onClick={() => void s.teamLoeschen(t.id)}>✕</BestaetigenKnopf>
    </span>
  );
}

export function Uebersicht(p: { s: Sitzung; ansehen: (team: string) => void }) {
  const { s } = p;
  const st = useSitzung(s);
  useTakt(500);
  const inh = s.inh;
  const sz = inh.szenario;
  const start = sz.spieluhr.start;
  const jetzt = s.adapter.serverJetzt();
  const [zeit, setZeit] = useState("");
  const hostDa = !!st.host && !istVeraltet(st.host.puls, jetzt);
  const darfSteuern = st.istHost || hostDa;
  const mitLauf = st.teams.filter((t) => t.lauf && s.spiel(t.id)?.stand.geladen);
  const ohneLauf = st.teams.filter((t) => !t.lauf);
  const ids = mitLauf.map((t) => t.id);
  const zustand = (t: TeamStand) => s.spiel(t.id)?.stand.zustand;
  const allen = <T extends AktionsTyp>(typ: T, daten: AktionsDaten[T], nur?: string[]) => s.sendenAn(nur ?? ids, typ, daten);
  const laufend = mitLauf.filter((t) => zustand(t)?.uhr.laeuft).length;
  const tempi = new Set(mitLauf.map((t) => zustand(t)?.uhr.tempo));
  const spieler = st.teams.flatMap((t) => t.spieler);
  const ohne = ohneTeam(s);

  const zeitSetzen = () => {
    const m = zeit.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return s.hinweis("warnung", "Spielzeit als mm:ss eingeben, z. B. 08:30");
    allen("uhr", { befehl: "setzen", t_s: Number(m[1]) * 60 + Number(m[2]) });
    setZeit("");
  };

  return (
    <main class="inhalt uebersicht" data-testid="uebersicht">
      <Panel titel={<>Alle Teams <span class="sehr-leise" style="font-weight:500;margin-left:6px">{st.teams.length} Teams · {spieler.filter((x) => x.online).length} von {spieler.length} Spielern da{ohne.length ? ` · ${ohne.length} ohne Team` : ""}</span></>}
        klasse="flach steuerleiste" rechts={!st.istHost ? (
          <span class="zeile" style="gap:8px"><span class="klein leise">Steuerung: {st.host ? `„${st.host.name}“${hostDa ? "" : " (keine Rückmeldung)"}` : "niemand"}</span>
            <button type="button" class="knopf klein warn" onClick={() => void s.uebernehmen()}>Steuerung übernehmen</button></span>
        ) : <span class="badge gut" data-testid="host">steuert alle Teams</span>}>
        <div class="steuer-zeile">
          {ohneLauf.length > 0 && (
            <button type="button" class="knopf gut gross" disabled={!st.istHost} data-testid="alle-oeffnen"
              title="Legt für jedes Team einen Spielstand an. Die Teilnehmer sehen ihre Ansicht mit der Einweisung, die Uhr steht noch."
              onClick={() => void s.spielOeffnen(ohneLauf.map((t) => t.id))}>
              Spiel öffnen – {ohneLauf.length === st.teams.length ? "alle Teams" : `${ohneLauf.length} Team${ohneLauf.length > 1 ? "s" : ""}`}
              <span class="unterzeile">Ansichten und Einweisung erscheinen, Uhr steht</span>
            </button>
          )}
          <button type="button" class="knopf gut gross" disabled={!darfSteuern || !ids.length || laufend === ids.length} data-testid="alle-start"
            onClick={() => allen("uhr", { befehl: "start" }, mitLauf.filter((t) => !zustand(t)?.uhr.laeuft && !zustand(t)?.ende).map((t) => t.id))}>
            ▶ Uhr starten – alle
          </button>
          <button type="button" class="knopf warn gross" disabled={!darfSteuern || laufend === 0} data-testid="alle-halt"
            onClick={() => allen("uhr", { befehl: "pause" }, mitLauf.filter((t) => zustand(t)?.uhr.laeuft).map((t) => t.id))}>
            ❚❚ Anhalten – alle
          </button>
          <span class="trenner" />
          <span class="zeile" style="gap:4px"><span class="klein leise">Tempo</span>
            {TEMPI.map((v) => (
              <button type="button" key={v} class={`knopf klein ${tempi.size === 1 && tempi.has(v) ? "an" : ""}`} disabled={!darfSteuern || !ids.length}
                onClick={() => allen("uhr", { befehl: "tempo", tempo: v })}>×{v}</button>
            ))}
          </span>
          <span class="zeile" style="gap:4px;flex-wrap:nowrap">
            <input class="feld zahl" style="width:70px" placeholder="mm:ss" value={zeit} onInput={(e) => setZeit((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => e.key === "Enter" && zeitSetzen()} data-testid="alle-zeit" />
            <button type="button" class="knopf klein" disabled={!darfSteuern || !ids.length} onClick={zeitSetzen}>Spielzeit setzen</button>
          </span>
          <span class="trenner" />
          <span class="zeile" style="gap:4px"><span class="klein leise">Reserve an alle</span>
            {(sz.reserve_injects ?? []).map((r) => {
              const fehlt = mitLauf.filter((t) => !zustand(t)?.injects[r.id]).map((t) => t.id);
              return (
                <button type="button" key={r.id} class="knopf klein" disabled={!darfSteuern || !fehlt.length} title={`${r.von} an ${r.an}: „${r.text}“ – ${r.einsatz}`}
                  onClick={() => allen("inject_ausloesen", { inject: r.id }, fehlt)}>{r.id}</button>
              );
            })}
          </span>
          <span class="trenner" />
          <button type="button" class="knopf klein" onClick={plenumOeffnen}>Plenum öffnen</button>
          {ids.length > 0 && <BestaetigenKnopf klasse="klein schlecht" gesperrt={!st.istHost} onClick={() => void s.spielOeffnen(ids)}
            frage="Wirklich? Klick = neues Spiel für alle" titel="Neuer Lauf für alle Teams. Die jetzigen Läufe bleiben gespeichert.">
            Neues Spiel – alle
          </BestaetigenKnopf>}
        </div>
      </Panel>

      <Panel titel="Teams" liste testid="team-tabelle"
        rechts={<span class="klein sehr-leise">Name: umbenennen · Spieler: Rolle ändern, verschieben · „frei“: Teilnehmer zuweisen</span>}>
        {st.teams.length === 0 ? (
          <Leer>Noch keine Teams. Die Teilnehmer öffnen die Spielseite, geben den Code <b class="mono">{st.code}</b> ein und erstellen in der Lobby ihre Teams.</Leer>
        ) : (
          <table class="tabelle team-tabelle">
            <thead>
              <tr>
                <th>Team</th>
                {GRUPPEN_ROLLEN.map((r) => <th key={r}><span class={`rolle-punkt rolle-${r}`} />{ROLLEN_NAME[r]}</th>)}
                <th>Spielzeit</th>
                <th title="offene Meldungen bei G1 · G2 · G3 (zurückgestellt bei G2 in Klammern)">Eingang G1·G2·G3</th>
                <th title="Schlüsselfälle live: grau kommt noch, blau offen, grün richtig, rot falsch">Schlüsselfälle</th>
                <th title="Freigaben, die Geschütztes, Verbündete, Zivilpersonen oder die Attrappe treffen">Fehl</th>
                <th>FT</th>
                <th title="verbundene Spieler / Spieler im Team">da</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {st.teams.map((t) => {
                const sp = s.spiel(t.id);
                const z = sp?.stand.zustand;
                const offen = !!t.lauf && !!z && z.seq > 0;
                const u = offen ? teamUebersicht(inh, z!) : null;
                const tt = offen ? Math.min(spielzeit(z!.uhr, jetzt), sz.spieluhr.dauer_s) : 0;
                const da = t.spieler.filter((x) => x.online).length;
                const status = !t.lauf ? "Lobby" : !offen ? "lädt …" : z!.ende ? "Spielende" : z!.uhr.laeuft ? `läuft${z!.uhr.tempo !== 1 ? ` ×${z!.uhr.tempo}` : ""}` : tt === 0 ? "bereit" : "angehalten";
                return (
                  <tr key={t.id} data-team-zeile={t.name} data-team={t.id} class={offen && z!.uhr.laeuft ? "laeuft" : ""}>
                    <td><TeamName s={s} t={t} /></td>
                    {GRUPPEN_ROLLEN.map((r) => <RollenZelle key={r} s={s} t={t} rolle={r} />)}
                    <td class="zahl"><b data-testid="team-uhr">{offen ? uhrzeit(start, tt) : "–"}</b><div class="klein sehr-leise">{status}</div></td>
                    <td class="zahl">{u ? <span class="eingang">{u.eingang.g1} · {u.eingang.g2}{u.zurueckgestellt ? ` (${u.zurueckgestellt})` : ""} · {u.eingang.g3}</span> : "–"}</td>
                    <td>{u ? (
                      <span class="faelle">{u.faelle.map((f) => (
                        <span key={f.id} class={`fall ${f.status}`} data-fall={f.id} data-status={f.status} title={`${f.id} ${f.titel}: ${FALL_TEXT[f.status]} – ${f.text}`}>{f.id}</span>
                      ))}</span>
                    ) : "–"}</td>
                    <td class="zahl">{u ? <b class={u.fehltreffer ? "rot" : ""}>{u.fehltreffer}</b> : "–"}</td>
                    <td>{offen ? (z!.fastTrack ? <span class="badge warn">EIN</span> : <span class="sehr-leise">aus</span>) : "–"}</td>
                    <td class="zahl"><span class={`badge ${da === t.spieler.length && da >= 1 ? "gut" : da === 0 ? "schlecht" : "warn"}`}
                      title={t.spieler.filter((x) => !x.online).map((x) => `${x.name} nicht verbunden`).join(", ") || "alle verbunden"}>{da}/{t.spieler.length}</span></td>
                    <td class="aktionen">
                      {!t.lauf ? (
                        <button type="button" class="knopf klein gut" disabled={!st.istHost} onClick={() => void s.spielOeffnen([t.id])} data-oeffnen={t.name}>öffnen</button>
                      ) : offen && !z!.ende ? (
                        z!.uhr.laeuft
                          ? <button type="button" class="knopf klein warn" disabled={!darfSteuern} onClick={() => allen("uhr", { befehl: "pause" }, [t.id])} title={`Uhr von ${t.name} anhalten`}>❚❚</button>
                          : <button type="button" class="knopf klein gut" disabled={!darfSteuern} onClick={() => allen("uhr", { befehl: "start" }, [t.id])} title={`Uhr von ${t.name} starten`}>▶</button>
                      ) : null}
                      {t.lauf && <button type="button" class="knopf klein" onClick={() => p.ansehen(t.id)} data-ansehen={t.name}>ansehen ›</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <div class="uebersicht-fuss">
        <div class="zeile" style="gap:6px">
          <span class="klein leise">Ohne Team:</span>
          {ohne.length === 0 ? <span class="klein sehr-leise">niemand</span> : ohne.map((x) => <span key={x.client} class="spieler-chip klein"><i class="punkt" />{x.name || "Teilnehmer"}</span>)}
        </div>
        <div class="klein sehr-leise">
          Teilnehmer: Spielseite öffnen, Code <b class="mono">{st.code}</b> eingeben. · Spielzeit gesamt {mmss(sz.spieluhr.dauer_s)} · Schlüsselfälle: <span class="fall wartet">S</span> kommt noch <span class="fall offen">S</span> offen <span class="fall richtig">S</span> richtig <span class="fall falsch">S</span> falsch
        </div>
      </div>
    </main>
  );
}
