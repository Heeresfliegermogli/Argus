// Spielleitung: Übersicht aller Teams der Sitzung (seit 2.6 aus den Statusmeldungen der Team-Laptops, H1.2/H7).
//   • Steuerleiste für alle Teams: Spiel öffnen, Start für alle, Anhalten, Tempo, Spielzeit, Reserve-Lagemeldungen, Plenum,
//     Auswertung, Protokoll aus Datei laden (H1.3), neues Spiel.
//   • Tabelle je Team: Laptop (Anwesenheit), Spielzeit, Eingang, Schlüsselfälle live, Fehltreffer, die vier Panzer, wie weit das
//     Protokoll im Netz ist und wie alt die letzte Statusmeldung ist; Start/Halt einzeln, „ansehen“.
// Jeder Team-Laptop rechnet sein Spiel selbst; Start und Pause gehen als Signal an alle (die Uhr läuft ab der Serverzeit des Klicks).
// Die Zahlen kommen etwa alle 5 s – bei Netzverzug später, die Uhr läuft aus der letzten Meldung weiter.
import { useRef, useState } from "preact/hooks";
import type { AktionsDaten, AktionsTyp } from "../kern/ereignisse";
import { TEAMNAME_MAX } from "../kern/sitzungen";
import { type FallStand, type FallStatus, type TeamStatus, statusFaelle, statusPanzer, statusUhr, teamStatus } from "../kern/uebersicht";
import { mmss, uhrzeit } from "../kern/uhr";
import { panzer } from "../kern/verluste";
import type { Sitzung, TeamStand } from "../sitzung/sitzung";
import { istVeraltet } from "../sync/adapter";
import { BestaetigenKnopf, Leer, Menue, Panel } from "./gemeinsam/bausteine";
import { useSitzung, useTakt } from "./gemeinsam/hooks";
import { RegelBanner, TeamMarke } from "./gemeinsam/rahmen";
import { VerstaerkungMenue } from "./gemeinsam/verstaerkung";
import { plenumOeffnen } from "./sl";

const TEMPI = [1, 2, 5, 10, 20];
const FALL_TEXT: Record<FallStatus, string> = { wartet: "kommt noch", offen: "offen", richtig: "richtig", falsch: "falsch" };

/** Menü an einem Fenster: in ein anderes Team verschieben oder herausnehmen. */
function FensterMenue(p: { s: Sitzung; t: TeamStand; client: string; name: string; online: boolean; schliessen: () => void }) {
  const andere = p.s.stand.teams.filter((u) => u.id !== p.t.id);
  const setze = async (team: string | null) => {
    p.schliessen();
    await p.s.spielerSetzen(p.client, team);
  };
  return (
    <>
      <div class="menue-kopf"><b>{p.name}</b> <span class="sehr-leise">{p.online ? "da" : "nicht verbunden"}</span></div>
      {andere.length > 0 && <div class="menue-titel">verschieben nach</div>}
      {andere.map((u) => (
        <button type="button" key={u.id} class="knopf klein" style="text-align:left" onClick={() => void setze(u.id)}><TeamMarke name={u.name} farbe={u.farbe} klein /></button>
      ))}
      <button type="button" class="knopf klein schlecht" style="margin-top:6px" onClick={() => void setze(null)}>aus dem Team nehmen</button>
    </>
  );
}

function ohneTeam(s: Sitzung) {
  const inTeams = new Set(s.stand.teams.flatMap((t) => t.spieler.map((x) => x.client)));
  return s.stand.teilnehmer.filter((x) => x.art === "tt" && !inTeams.has(x.client));
}

function LaptopZelle(p: { s: Sitzung; t: TeamStand }) {
  const { s, t } = p;
  const [menue, setMenue] = useState<string | null>(null);
  const ohne = ohneTeam(s);
  return (
    <td class="rollen-zelle" data-laptop={t.name}>
      {t.spieler.length === 0 && (
        <span class="menue-anker">
          <button type="button" class="spieler-chip frei" onClick={() => setMenue("frei")} title="Fenster ohne Team hierher setzen">frei</button>
          <Menue offen={menue === "frei"} schliessen={() => setMenue(null)}>
            <div class="menue-kopf"><b>Laptop für {t.name}</b></div>
            {ohne.length === 0 ? <div class="klein sehr-leise">Alle Fenster sind in Teams.</div> : ohne.map((x) => (
              <button type="button" key={x.client} class="knopf klein" style="text-align:left"
                onClick={() => { setMenue(null); void s.spielerSetzen(x.client, t.id); }}>{x.name || "Teilnehmer"}</button>
            ))}
          </Menue>
        </span>
      )}
      {t.spieler.map((x) => (
        <span class="menue-anker" key={x.client}>
          <button type="button" class={`spieler-chip ${x.online ? "" : "weg"}`} onClick={() => setMenue(x.client)}
            title={`${x.name} · ${x.client === t.rechner ? "rechnet das Spiel" : "sieht zu"} · ${x.online ? "da" : "nicht verbunden"} – Klick: verschieben`}>
            <i class="punkt" />{x.name || "Team"}{x.client === t.rechner && t.spieler.length > 1 ? " ★" : ""}
          </button>
          <Menue offen={menue === x.client} schliessen={() => setMenue(null)}>
            <FensterMenue s={s} t={t} client={x.client} name={x.name} online={x.online} schliessen={() => setMenue(null)} />
          </Menue>
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

/** Stand eines Teams für die Übersicht: die Statusmeldung des Team-Laptops, sonst aus dem hochgeladenen Protokoll gerechnet. */
interface TeamZeile {
  t: TeamStand;
  st: TeamStatus | null;
  /** Statusmeldung vom Team-Laptop (sonst aus dem Protokoll) */
  vomLaptop: boolean;
  alterS: number | null;
}

function zeileVon(s: Sitzung, t: TeamStand, jetzt: number): TeamZeile {
  const roh = s.stand.status[t.id];
  const sp = s.spiel(t.id);
  if (roh && roh.lauf === t.lauf) return { t, st: roh, vomLaptop: true, alterS: Math.max(0, (jetzt - roh.ts) / 1000) };
  const z = sp?.stand.zustand;
  if (t.lauf && z && z.seq > 0 && sp?.stand.lauf === t.lauf) {
    return { t, st: teamStatus(s.inh, z, jetzt, { client: "", lauf: t.lauf, hoch: z.seq }), vomLaptop: false, alterS: null };
  }
  return { t, st: null, vomLaptop: false, alterS: null };
}

function PanzerMini(p: { st: TeamStatus; namen: string[] }) {
  const pz = statusPanzer(p.st);
  if (!pz.length) return <span class="sehr-leise">–</span>;
  return (
    <span class="pz-mini-reihe" title={pz.map((x, i) => `${p.namen[i] ?? i + 1}: ${x.ausgefallen ? "ausgefallen" : `${x.zustand} %`}`).join("\n")}>
      {pz.map((x, i) => (
        <span key={i} class={`pz-balken ${x.ausgefallen ? "aus" : x.zustand < 60 ? "schwach" : ""}`} data-zustand={x.zustand}>
          <i style={{ width: `${x.ausgefallen ? 100 : x.zustand}%` }} />
        </span>
      ))}
      <span class="klein sehr-leise zahl">{p.st.bereit}/4</span>
    </span>
  );
}

function ProtokollLaden(p: { s: Sitzung }) {
  const datei = useRef<HTMLInputElement>(null);
  const laden = async (f: File | undefined) => {
    if (!f) return;
    const erg = await p.s.protokollLaden(await f.text());
    p.s.hinweis(erg.ok ? "info" : "fehler", erg.text);
    if (datei.current) datei.current.value = "";
  };
  return (
    <>
      <input ref={datei} type="file" accept=".json,application/json" style="display:none" data-testid="protokoll-datei"
        onChange={(e) => void laden((e.target as HTMLInputElement).files?.[0])} />
      <button type="button" class="knopf klein" onClick={() => datei.current?.click()} data-testid="protokoll-laden"
        title="Protokoll eines Teams aus einer Datei laden (wenn der Upload vom Team-Laptop nicht ging)">Protokoll laden</button>
    </>
  );
}

export function Uebersicht(p: { s: Sitzung; ansehen: (team: string) => void; auswertung?: () => void }) {
  const { s } = p;
  const st = useSitzung(s);
  useTakt(500);
  const inh = s.inh;
  const sz = inh.szenario;
  const start = sz.spieluhr.start;
  const dauer = sz.spieluhr.dauer_s;
  const jetzt = s.adapter.serverJetzt();
  const [zeit, setZeit] = useState("");
  const hostDa = !!st.host && !istVeraltet(st.host.puls, jetzt);
  const darfSteuern = st.istHost || hostDa;
  const zeilen = st.teams.map((t) => zeileVon(s, t, jetzt));
  const mitLauf = zeilen.filter((x) => x.t.lauf && s.spiel(x.t.id));
  const ohneLauf = st.teams.filter((t) => !t.lauf);
  const ids = mitLauf.map((x) => x.t.id);
  const allen = <T extends AktionsTyp>(typ: T, daten: AktionsDaten[T], nur?: string[]) => s.sendenAn(nur ?? ids, typ, daten);
  const laeuft = (x: TeamZeile) => !!x.st?.laeuft;
  const laufend = mitLauf.filter(laeuft).length;
  const tempi = new Set(mitLauf.map((x) => x.st?.tempo));
  const ohne = ohneTeam(s);
  const panzerNamen = panzer(inh).map((x) => x.name);
  const vMenue = inh.regeln.spielleitung?.verstaerkung_menue ?? false;

  const zeitSetzen = () => {
    const m = zeit.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return s.hinweis("warnung", "Spielzeit als mm:ss eingeben, z. B. 08:30");
    allen("uhr", { befehl: "setzen", t_s: Number(m[1]) * 60 + Number(m[2]) });
    setZeit("");
  };

  return (
    <main class="inhalt uebersicht" data-testid="uebersicht">
      <Panel titel={<>Alle Teams <span class="sehr-leise" style="font-weight:500;margin-left:6px">{st.teams.length} Teams · {st.teams.filter((t) => t.rechnerOnline).length} Laptops da{ohne.length ? ` · ${ohne.length} ohne Team` : ""}</span></>}
        klasse="flach steuerleiste" rechts={!st.istHost ? (
          <span class="zeile" style="gap:8px"><span class="klein leise">Steuerung: {st.host ? `„${st.host.name}“${hostDa ? "" : " (keine Rückmeldung)"}` : "niemand"}</span>
            <button type="button" class="knopf klein warn" onClick={() => void s.uebernehmen()}>Steuerung übernehmen</button></span>
        ) : <span class="badge gut" data-testid="host">steuert alle Teams</span>}>
        <div class="steuer-zeile">
          {ohneLauf.length > 0 && (
            <button type="button" class="knopf gut gross" disabled={!st.istHost} data-testid="alle-oeffnen"
              title="Legt für jedes Team einen Spielstand an. Die Teams sehen ihre Ansicht mit der Einweisung, die Uhr steht noch."
              onClick={() => void s.spielOeffnen(ohneLauf.map((t) => t.id))}>
              Spiel öffnen – {ohneLauf.length === st.teams.length ? "alle Teams" : `${ohneLauf.length} Team${ohneLauf.length > 1 ? "s" : ""}`}
              <span class="unterzeile">Ansicht und Einweisung erscheinen, Uhr steht</span>
            </button>
          )}
          <button type="button" class="knopf gut gross" disabled={!darfSteuern || !ids.length || laufend === ids.length} data-testid="alle-start"
            title="Startsignal an alle Team-Laptops – jede Uhr läuft ab diesem Klick"
            onClick={() => allen("uhr", { befehl: "start" }, mitLauf.filter((x) => !laeuft(x) && !x.st?.ende).map((x) => x.t.id))}>
            ▶ Start für alle
          </button>
          <button type="button" class="knopf warn gross" disabled={!darfSteuern || laufend === 0} data-testid="alle-halt"
            onClick={() => allen("uhr", { befehl: "pause" }, mitLauf.filter(laeuft).map((x) => x.t.id))}>
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
              const fehlt = mitLauf.filter((x) => !s.spiel(x.t.id)?.stand.zustand.injects[r.id]).map((x) => x.t.id);
              return (
                <button type="button" key={r.id} class="knopf klein" disabled={!darfSteuern || !fehlt.length} title={`${r.von}: „${r.text}“ – ${r.einsatz}`}
                  onClick={() => allen("inject_ausloesen", { inject: r.id }, fehlt)}>{r.id}</button>
              );
            })}
          </span>
          {vMenue && (
            <>
              <span class="trenner" />
              <VerstaerkungMenue inh={inh} jetzt={jetzt} gesperrt={!darfSteuern || !ids.length}
                teams={mitLauf.map((x) => ({ id: x.t.id, name: x.t.name, farbe: x.t.farbe, z: s.spiel(x.t.id)!.stand.zustand, eingang: x.st?.eingang ?? 0 }))}
                einspielen={(gruppe, teams) => allen("verstaerkung_einspielen", { gruppe }, teams)} />
            </>
          )}
          <span class="trenner" />
          <button type="button" class="knopf klein" onClick={plenumOeffnen}>Plenum öffnen</button>
          {p.auswertung && ids.length > 0 && <button type="button" class="knopf klein weiter" onClick={p.auswertung} data-testid="auswertung-knopf"
            title="Teamvergleich, Kennzahlen, Replay je Schlüsselfall, Export – dieselbe Ansicht wie im Plenum">Auswertung ›</button>}
          {ids.length > 0 && <ProtokollLaden s={s} />}
          {ids.length > 0 && <BestaetigenKnopf klasse="klein schlecht" gesperrt={!st.istHost} onClick={() => void s.spielOeffnen(ids)}
            frage="Wirklich? Klick = neues Spiel für alle" titel="Neuer Lauf für alle Teams. Die jetzigen Läufe bleiben gespeichert.">
            Neues Spiel – alle
          </BestaetigenKnopf>}
        </div>
      </Panel>
      {st.regelFehler && <RegelBanner />}

      <Panel titel="Teams" liste testid="team-tabelle"
        rechts={<span class="klein sehr-leise">Name: umbenennen · Laptop: verschieben · Stand aus den Statusmeldungen der Team-Laptops (etwa alle 5 s)</span>}>
        {st.teams.length === 0 ? (
          <Leer>Noch keine Teams. Die Teilnehmer öffnen die Spielseite, geben den Code <b class="mono">{st.code}</b> ein und legen in der Lobby ihre Teams an.</Leer>
        ) : (
          <table class="tabelle team-tabelle">
            <thead>
              <tr>
                <th>Team</th>
                <th>Laptop</th>
                <th>Spielzeit</th>
                <th title="neue Meldungen im Eingang (zurückgestellte in Klammern)">Eingang</th>
                <th title="Schlüsselfälle live: grau kommt noch, blau offen, grün richtig, rot falsch">Schlüsselfälle</th>
                <th title="Bekämpfungen, die Geschütztes, Verbündete, Zivilpersonen oder die Attrappe treffen">Fehl</th>
                <th title="die vier Panzer der 1. Kp (Zustand)">Panzer</th>
                <th title="Protokoll im Netz / beim Team · Alter der letzten Statusmeldung">Protokoll</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {zeilen.map((x) => {
                const t = x.t;
                const u = x.st;
                const tt = u ? statusUhr(u, jetzt, dauer) : 0;
                const faelle: FallStand[] = u ? statusFaelle(inh, u) : [];
                const status = !t.lauf ? "Lobby" : !u ? (t.rechnerOnline ? "lädt …" : t.rechner ? "Laptop nicht verbunden" : "kein Laptop") : u.ende ? "Spielende" : u.laeuft ? `läuft${u.tempo !== 1 ? ` ×${u.tempo}` : ""}` : tt === 0 ? "bereit" : "angehalten";
                const z = s.spiel(t.id)?.stand.zustand;
                const hochNetz = s.spiel(t.id)?.stand.zustand.seq ?? 0;
                const alt = x.alterS !== null && x.alterS > 15;
                return (
                  <tr key={t.id} data-team-zeile={t.name} data-team={t.id} class={u?.laeuft ? "laeuft" : ""} data-status-seq={u?.seq ?? ""} data-netz-seq={hochNetz}>
                    <td><TeamName s={s} t={t} /></td>
                    <LaptopZelle s={s} t={t} />
                    <td class="zahl"><b data-testid="team-uhr">{u ? uhrzeit(start, tt) : "–"}</b><div class="klein sehr-leise">{status}
                      {z && z.verstaerkungen.length > 0 && <span data-verstaerkungen={z.verstaerkungen.map((v) => v.gruppe).join(",")}> · +{z.verstaerkungen.length} V</span>}</div></td>
                    <td class="zahl">{u ? <span class="eingang">{u.eingang}{u.zurueck ? ` (${u.zurueck})` : ""}</span> : "–"}</td>
                    <td>{u ? (
                      <span class="faelle">{faelle.map((f) => (
                        <span key={f.id} class={`fall ${f.status}`} data-fall={f.id} data-status={f.status} title={`${f.id} ${f.titel}: ${FALL_TEXT[f.status]}`}>{f.id}</span>
                      ))}</span>
                    ) : "–"}</td>
                    <td class="zahl">{u ? <b class={u.fehl ? "rot" : ""}>{u.fehl}</b> : "–"}</td>
                    <td>{u ? <PanzerMini st={u} namen={panzerNamen} /> : "–"}</td>
                    <td class="zahl klein" data-testid="protokoll-stand">{t.lauf ? (
                      <span title={x.vomLaptop ? `Team-Laptop: ${u?.seq} Einträge, davon ${u?.hoch} hochgeladen; hier angekommen: ${hochNetz}` : "noch keine Statusmeldung – Stand aus dem hochgeladenen Protokoll"}>
                        {hochNetz}{u && x.vomLaptop ? ` / ${u.seq}` : ""}
                        <div class={alt ? "rot" : "sehr-leise"}>{x.alterS !== null ? `Status vor ${Math.round(x.alterS)} s` : "kein Status"}</div>
                      </span>
                    ) : "–"}</td>
                    <td class="aktionen">
                      {!t.lauf ? (
                        <button type="button" class="knopf klein gut" disabled={!st.istHost} onClick={() => void s.spielOeffnen([t.id])} data-oeffnen={t.name}>öffnen</button>
                      ) : u && !u.ende ? (
                        u.laeuft
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
          Teilnehmer: Spielseite öffnen, Code <b class="mono">{st.code}</b> eingeben. · Spielzeit gesamt {mmss(dauer)} · Schlüsselfälle: <span class="fall wartet">S</span> kommt noch <span class="fall offen">S</span> offen <span class="fall richtig">S</span> richtig <span class="fall falsch">S</span> falsch
        </div>
      </div>
    </main>
  );
}
