// Fenster der Spielleitung und des Plenums in einer Sitzung.
//
// Spielleitung: Startet mit der Übersicht aller Teams (uebersicht.tsx). „ansehen ›“ öffnet ein Team:
// „Steuerung“ ist die bekannte Spielleitungsansicht für dieses Team (Uhr, Kontrollkarte, Zeitplan,
// Protokoll), Aufklärung · Zielprüfung · Führung zeigen die Ansicht der Rolle zum Zuschauen (nur lesen, deutlich
// gekennzeichnet). Im Test ohne Lobby (ein Team, B11) sind die drei Rollen dort bedienbar: Eine Person kann allein
// alle Rollen spielen. Die Leiste oben
// links führt zurück zur Übersicht und wechselt Team und Ansicht, ohne Platz unter der Kopfzeile zu
// brauchen (alles bleibt in 1530 × 800). Das steuernde Fenster führt die Hosts aller Teams – egal,
// welche Ansicht es gerade zeigt.
//
// Plenum: zeigt ein Team (Wahl oben links); vor dem ersten Spiel Einweisung mit Code und Teams. Haben alle Teams das
// Spielende erreicht, schaltet es von selbst auf die Auswertung über alle Teams (Schritt 8, auswertung.tsx).
//
// Auswertung: dieselbe Ansicht im Plenum (Smartboard) und bei der Spielleitung („Auswertung ›“ in der Übersicht);
// bei der Spielleitung mit Notizfeld je Fall. Während des Spiels notiert SL 2 über „✎ Notiz“ in der Teamansicht.
import { useMemo, useState } from "preact/hooks";
import { type FallDef, type TeamLauf, faelle } from "../kern/auswertung";
import { TEXT_MAX, type Rolle } from "../kern/ereignisse";
import { DIREKT_TEAM, GRUPPEN_ROLLEN } from "../kern/sitzungen";
import { ROLLEN_NAME } from "../kern/sichten";
import { seitenAdresse } from "../config";
import { Sicht } from "../sitzung/sicht";
import type { Sitzung, TeamStand } from "../sitzung/sitzung";
import type { Spiel } from "../sitzung/spiel";
import { EinweisungFenster } from "./einweisung";
import { AuswertungAnsicht } from "./auswertung";
import { Hinweise, Menue } from "./gemeinsam/bausteine";
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

/**
 * Fall, der für ein Team gerade „dran“ ist: der zuletzt erschienene Schlüsselfall, dessen Meldung noch in der Kette liegt,
 * sonst ein solcher Nebenfall, sonst der zuletzt erschienene Fall (SL 2 notiert vor allem zu den Schlüsselfällen).
 */
function aktuellerFall(s: Sitzung, team: string): FallDef | null {
  const z = s.spiel(team)?.stand.zustand;
  const fs = faelle(s.inh);
  if (!z) return fs[0] ?? null;
  const erschienen = fs.filter((f) => z.meldungen[f.meldung]).sort((a, b) => z.meldungen[b.meldung].erschienen.seq - z.meldungen[a.meldung].erschienen.seq);
  const offen = erschienen.filter((f) => ["g1", "g2", "g3", "wirkung"].includes(z.meldungen[f.meldung].stufe));
  return offen.find((f) => f.art === "schluessel") ?? offen[0] ?? erschienen[0] ?? fs[0] ?? null;
}

/**
 * SL 2 notiert je Schlüsselfall, was sie beobachtet (Drehbuch: wer hat was wann gesehen und entschieden, was wurde
 * gesagt). Die Notiz steht im Protokoll des Teams und erscheint in der Auswertung beim Fall.
 */
function NotizKnopf(p: { s: Sitzung; team: string }) {
  const [offen, setOffen] = useState(false);
  const [fall, setFall] = useState<string>("");
  const [text, setText] = useState("");
  const fs = faelle(p.s.inh);
  const oeffnen = () => {
    setFall(aktuellerFall(p.s, p.team)?.id ?? "");
    setOffen(!offen);
  };
  const speichern = () => {
    if (!text.trim()) return;
    p.s.sendenAn([p.team], "notiz", { text: text.trim(), ...(fall ? { fall } : {}) });
    setText("");
    setOffen(false);
  };
  return (
    <span class="menue-anker">
      <button type="button" class="knopf klein" onClick={oeffnen} data-testid="notiz-knopf" title="Beobachtung zu einem Fall notieren (erscheint in der Auswertung)">✎ Notiz</button>
      <Menue offen={offen} schliessen={() => setOffen(false)} testid="notiz-menue">
        <div class="menue-kopf"><b>Notiz für {p.s.team(p.team)?.name ?? "Team"}</b> <span class="sehr-leise">erscheint im Plenum – Rollen statt Namen</span></div>
        <div class="zeile" style="gap:4px">
          {fs.map((f) => <button type="button" key={f.id} class={`knopf klein ${fall === f.id ? "an" : ""}`} onClick={() => setFall(f.id)} title={f.titel} data-notiz-fall={f.id}>{f.id}</button>)}
          <button type="button" class={`knopf klein ${fall === "" ? "an" : ""}`} onClick={() => setFall("")}>allgemein</button>
        </div>
        <textarea class="feld" rows={3} maxLength={TEXT_MAX.notiz} value={text} style="width:380px;resize:none" ref={(el) => el?.focus()}
          placeholder="Welche Rolle hat was gesehen und entschieden? Was wurde gesagt?" onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); speichern(); } }} data-testid="notiz-text" />
        <button type="button" class="knopf klein gut" disabled={!text.trim()} onClick={speichern}>Speichern (Enter)</button>
      </Menue>
    </span>
  );
}

/**
 * Leiste der Spielleitung in der Teamansicht: zurück zur Übersicht, Team, Steuerung oder eine Rolle. Mit Lobby ist das
 * Zuschauen (nur lesen); im Test ohne Lobby (direkt) bedient die Spielleitung die Rollen selbst (B11).
 */
function SLLeiste(p: { s: Sitzung; wahl: Wahl; setze: (w: Wahl | null) => void; direkt: boolean }) {
  const st = useSitzung(p.s);
  const teams = st.teams.filter((t) => t.lauf);
  return (
    <div class="sl-leiste" data-testid="sl-leiste">
      <button type="button" class="sl-zurueck" onClick={() => p.setze(null)} title="Übersicht aller Teams" data-testid="zur-uebersicht">◂ Übersicht</button>
      {!p.direkt && <TeamWahl teams={teams} team={p.wahl.team} setze={(team) => p.setze({ ...p.wahl, team })} testid="sl-teamwahl" />}
      <div class="sl-rollen" role="tablist">
        {(["sl", ...GRUPPEN_ROLLEN] as SLRolle[]).map((r) => (
          <button type="button" role="tab" key={r} aria-selected={r === p.wahl.rolle} class={`rolle-tab rolle-${r} ${r === p.wahl.rolle ? "an" : ""}`}
            onClick={() => p.setze({ ...p.wahl, rolle: r })} data-sl-rolle={r}
            title={r === "sl" ? "Steuerung dieses Teams: Uhr, Kontrollkarte, Zeitplan, Protokoll"
              : p.direkt ? `${ROLLEN_NAME[r]} bedienen (Test ohne Lobby)` : `Zuschauen: Ansicht ${ROLLEN_NAME[r]} dieses Teams (nur lesen)`}>
            {r === "sl" ? "Steuerung" : p.direkt ? ROLLEN_NAME[r] : <><span class="auge" aria-hidden="true">◉</span>{ROLLEN_NAME[r]}</>}
          </button>
        ))}
      </div>
      <NotizKnopf s={p.s} team={p.wahl.team} />
    </div>
  );
}

function TeamAnsicht(p: { s: Sitzung; spiel: Spiel; wahl: Wahl; setze: (w: Wahl | null) => void }) {
  const { s, spiel, wahl } = p;
  const direkt = s.stand.direkt;
  // Zuschauen nur lesen; im Test ohne Lobby sind alle Rollen bedienbar (B11)
  const sicht = useMemo(() => new Sicht(s, spiel, wahl.rolle, { nurLesen: wahl.rolle !== "sl" && !direkt }), [s, spiel, wahl.rolle, direkt]);
  useMeldeSicht(sicht);
  const Ansicht = ANSICHTEN[wahl.rolle as Rolle];
  return (
    <Rahmen s={sicht} band={<SLLeiste s={s} wahl={wahl} setze={p.setze} direkt={direkt} />} teamImBand>
      <Ansicht s={sicht} />
    </Rahmen>
  );
}

function UebersichtRahmen(p: { s: Sitzung; ansehen: (team: string) => void; auswertung: () => void }) {
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
      <Uebersicht s={p.s} ansehen={p.ansehen} auswertung={p.auswertung} />
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
  const [auswertung, setAuswertung] = useState(false);
  const team = wahl ? s.team(wahl.team) : undefined;
  const spiel = wahl ? s.spiel(wahl.team) : null;
  if (auswertung) return <AuswertungFenster s={s} art="sl" zurueck={{ text: "◂ Übersicht", aktion: () => setAuswertung(false) }} />;
  if (wahl && team?.lauf && spiel) return <TeamAnsicht key={team.id} s={s} spiel={spiel} wahl={wahl} setze={setWahl} />;
  if (wahl && st.direkt && !team?.lauf) return <div class="start"><div class="leise">Spiel wird angelegt …</div></div>;
  return <UebersichtRahmen s={s} ansehen={(t) => setWahl({ team: t, rolle: "sl" })} auswertung={() => setAuswertung(true)} />;
}

// ---------------------------------------------------------------- Auswertung (Schritt 8)

/** Teams mit Lauf und geladenem Protokoll, wie die Auswertung sie braucht (nur neu, wenn sich ein Protokoll ändert). */
function useTeamLaeufe(s: Sitzung): TeamLauf[] {
  const st = useSitzung(s);
  const liste = st.teams.map((t) => ({ t, sp: s.spiel(t.id) })).filter((x) => x.t.lauf && x.sp?.stand.geladen && x.sp.stand.zustand.seq > 0);
  const schl = liste.map((x) => `${x.t.id}:${x.sp!.stand.lauf}:${x.sp!.stand.zustand.seq}:${x.t.name}:${x.t.farbe}`).join("|");
  return useMemo(() => liste.map((x) => ({ id: x.t.id, name: x.t.name, farbe: x.t.farbe, zustand: x.sp!.stand.zustand, protokoll: x.sp!.stand.protokoll })), [schl]);
}

/** Auswertung über alle Teams der Sitzung (Plenum und Spielleitung). */
export function AuswertungFenster(p: { s: Sitzung; art: "plenum" | "sl"; zurueck?: { text: string; aktion: () => void } }) {
  const teams = useTeamLaeufe(p.s);
  const notiz = p.art === "sl" ? (team: string, fall: string, text: string) => { p.s.sendenAn([team], "notiz", { text, fall }); } : undefined;
  return (
    <>
      <AuswertungAnsicht inh={p.s.inh} teams={teams} art={p.art} zurueck={p.zurueck} notiz={notiz} kennung={p.s.stand.direkt ? undefined : `Code ${p.s.stand.code}`} />
      <Hinweise liste={p.s.hinweise.liste} />
    </>
  );
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

function PlenumTeam(p: { s: Sitzung; spiel: Spiel; teams: TeamStand[]; setze: (team: string) => void; zurAuswertung: () => void }) {
  const sicht = useMemo(() => new Sicht(p.s, p.spiel, "plenum"), [p.s, p.spiel]);
  useMeldeSicht(sicht);
  useSitzung(p.s);
  const links = p.teams.length > 1 || !p.s.stand.direkt ? <TeamWahl teams={p.teams} team={p.spiel.team} setze={p.setze} testid="plenum-teamwahl" /> : undefined;
  return (
    <Rahmen s={sicht} links={links} teamImBand>
      <PlenumAnsicht s={sicht} beitritt={beitritt(p.s)} zurAuswertung={p.zurAuswertung} />
    </Rahmen>
  );
}

export function PlenumFenster(p: { s: Sitzung }) {
  const { s } = p;
  const st = useSitzungWert(s, (x) => [x.verbindung.verbunden, ...x.teams.map((t) => `${t.id}:${t.lauf ?? ""}:${t.name}:${t.farbe}:${t.spieler.filter((y) => y.online).length}:${s.spiel(t.id) ? 1 : 0}:${s.spiel(t.id)?.stand.zustand.ende ? "E" : ""}`)].join("|"));
  const [wahl, setWahl] = useState<string | null>(null);
  const mitLauf = st.teams.filter((t) => t.lauf && s.spiel(t.id));
  const team = mitLauf.find((t) => t.id === wahl) ?? mitLauf[0];
  const spiel = team ? s.spiel(team.id) : null;
  // Spielende in allen Teams: Auswertung über alle Teams (von Hand zurück zum Spiel und wieder hin)
  const alleEnde = mitLauf.length > 0 && mitLauf.every((t) => s.spiel(t.id)?.stand.zustand.ende);
  const [ansicht, setAnsicht] = useState<{ auswertung: boolean; bei: boolean } | null>(null);
  const auswertung = ansicht && ansicht.bei === alleEnde ? ansicht.auswertung : alleEnde;
  if (team && spiel && auswertung) return <AuswertungFenster s={s} art="plenum" zurueck={{ text: "◂ Spiel", aktion: () => setAnsicht({ auswertung: false, bei: alleEnde }) }} />;
  if (team && spiel) return <PlenumTeam key={team.id} s={s} spiel={spiel} teams={mitLauf} setze={setWahl} zurAuswertung={() => setAnsicht({ auswertung: true, bei: alleEnde })} />;
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
