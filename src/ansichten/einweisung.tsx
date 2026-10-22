// Einweisungskarten (Schritt 6b: für Teams à 3 neu). Jede Person eines Teams hat eine Rolle; ihre Karte zeigt
//  • oben „Euer Team“: die Kette G1 → G2 → G3 mit den Namen aus der Lobby, die eigene Rolle hervorgehoben, je
//    Rolle in einer Zeile, was sie sieht – damit klar ist, welche Information nur bei wem liegt,
//  • links „Dein Auftrag“ (aus dem Szenario, lage.G1 …), rechts die Bedienung in drei Schritten (gleiche Nummern
//    wie in der Ansicht) und den wichtigsten Satz.
// Keine Lösungshinweise: Die Karte sagt, wer was sieht und dass das Team miteinander sprechen darf – nicht, was
// es weitergeben soll. Erscheint als Fenster in der Ansicht (Knopf „Einweisung“, vor Spielbeginn von selbst) und
// als Druckseite (…/?druck=einweisung, A5 quer, eine Karte je Rolle).
import { type ComponentChildren, Fragment } from "preact";
import type { Inhalte } from "../inhalte/typen";
import type { Rolle } from "../kern/ereignisse";
import { ROLLEN_NAME } from "../kern/sichten";
import { uhrzeit } from "../kern/uhr";

type KartenRolle = Exclude<Rolle, "plenum">;
type TeamRolle = "g1" | "g2" | "g3";

interface Schrittinfo {
  nr: number | null;
  zeichen?: string;
  titel: string;
  text: ComponentChildren;
}

interface KartenText {
  lage: string;
  unter: string;
  schritte: Schrittinfo[];
  wichtig: ComponentChildren;
}

/** Team auf der Karte: Name, Farbe und wer welche Rolle hat (aus der Lobby; fehlt im Direktaufruf und im Druck). */
export interface KartenTeam {
  name?: string;
  farbe?: string;
  /** Namen je Rolle */
  spieler: Partial<Record<TeamRolle, string[]>>;
  /** eigener Name (wird als „du“ markiert) */
  ich?: string;
}

const M = (p: { k?: string; children: ComponentChildren }) => <span class={`muster ${p.k ?? ""}`}>{p.children}</span>;

/** Die Rollen des Teams: was jede tut und was sie sieht (gleich auf allen drei Karten und im Plenum). */
const TEAM: { rolle: TeamRolle; tut: string; sieht: string }[] = [
  { rolle: "g1", tut: "prüft jede ARGUS-Meldung zuerst", sieht: "Drohnenbild live, Sensordaten" },
  { rolle: "g2", tut: "prüft die Einsatzregeln und wählt das Wirkmittel", sieht: "Zielmeldung, Wirkmittel, Warnungen" },
  { rolle: "g3", tut: "gibt frei und führt das Gefecht", sieht: "Empfehlung, Lagemeldungen" },
];

/** Bedienung je Rolle. Auftrag und Lage kommen aus dem Szenario; hier steht nur, wie die Ansicht geht. */
function texte(inh: Inhalte): Record<KartenRolle, KartenText> {
  const ft = inh.regeln.fast_track.schwelle;
  const uhr = inh.szenario.spieluhr;
  const von = uhrzeit(uhr.start, 0).slice(0, 5);
  const bis = uhrzeit(uhr.start, uhr.dauer_s).slice(0, 5);
  const wm = Object.values(inh.wirkmittel).map((w) => w.kurz).join(", ");
  return {
    g1: {
      lage: "G1",
      unter: "Du prüfst jede ARGUS-Meldung zuerst.",
      schritte: [
        { nr: 1, titel: "Meldung öffnen", text: <>Jede ARGUS-Meldung erscheint als Marke auf der Karte; oben rechts steht, wie viele warten. Die älteste öffnet sich von selbst, ein Klick auf eine Marke öffnet eine andere.</> },
        { nr: 2, titel: "Drohnenbild und Daten prüfen", text: <>Das Drohnenbild läuft live in einem Fenster neben dem Ziel. Klick aufs Bild: groß mit Lupe (Mausrad: stärker). Rechts stehen <M k="argus">ARGUS</M>-Klasse, Konfidenz, Empfehlung und die Sensordaten.</> },
        { nr: 3, titel: "Entscheiden", text: <><M>ANNEHMEN</M> schickt das Ziel an G2, <M>ABLEHNEN</M> beendet die Meldung. Ein Vermerk (eine Zeile) geht mit an G2.</> },
      ],
      wichtig: <>Du bist die erste Prüfstufe. Was du annimmst, geht als Zielmeldung an G2 – ohne Drohnenbild und ohne Sensordaten.</>,
    },
    g2: {
      lage: "G2",
      unter: "Du prüfst die Einsatzregeln und wählst das Wirkmittel.",
      schritte: [
        { nr: 1, titel: "Zielmeldung öffnen", text: <>Ziele, die G1 angenommen hat, erscheinen als Marke auf der Karte; oben rechts steht, wie viele warten. Die älteste öffnet sich von selbst, ein Klick auf eine Marke öffnet eine andere.</> },
        { nr: 2, titel: "Wirkmittel wählen, Warnungen prüfen", text: <>{wm}: Die Karte zeigt den Wirkradius am Ort des Einschlags – grün ohne Warnung, rot bei Verstoß gegen R2 (No-Strike-Zone), R3 (Einschränkungsgebiet) oder die Einsatzgrenze.</> },
        { nr: 3, titel: "Empfehlen", text: <><M k="toedlich">BEKÄMPFEN mit …</M> geht an G3. <M>BEOBACHTEN</M> stellt das Ziel zurück – es bleibt als Marke „zurückgestellt“ auf der Karte. <M>NICHT BEKÄMPFEN</M> schließt ab.</> },
      ],
      wichtig: <>Das System warnt, verhindert aber nichts. Wirkmittel sind begrenzt – der Bestand steht am Wirkmittel.</>,
    },
    g3: {
      lage: "G3",
      unter: "Du gibst frei und führst das Gefecht.",
      schritte: [
        { nr: 1, titel: "Empfehlung öffnen", text: <>Empfehlungen von G2 erscheinen als Marke auf der Karte (⚠ = mit Regelwarnung); oben rechts steht, wie viele warten. Die älteste öffnet sich von selbst.</> },
        { nr: 2, titel: "Entscheiden", text: <><M k="toedlich">FREIGABE</M> löst die Wirkung aus. <M>ABLEHNEN</M> beendet, <M>ZURÜCK AN G2</M> schickt zur erneuten Prüfung. Bis zum Einschlag steht ein gestrichelter roter Kreis mit der Uhrzeit auf der Karte.</> },
        { nr: null, zeichen: "✉", titel: "Jederzeit: Lagemeldungen", text: <>Nur du bekommst Meldungen von Brigade, Nachbarn und Kompanien (rechts). Lesen, dann <M k="weiter">Gelesen</M>. Ein Lagehinweis erscheint bei G1 und G2 auf der Karte. Fast-Track (ab {ft} % ohne G1) schaltest du oben rechts.</> },
      ],
      wichtig: <>Ohne deine Freigabe wird nichts bekämpft. Du verantwortest jede Wirkung.</>,
    },
    sl: {
      lage: "spielleitung",
      unter: "SL 1 steuert alle Teams, SL 2 beobachtet und protokolliert.",
      schritte: [
        { nr: null, zeichen: "▶", titel: "Vor dem Spiel", text: <>Sitzung anlegen, „Plenum öffnen“ – das Smartboard zeigt den Code. Die Teilnehmer geben ihn ein und bilden Teams à drei (Doppelrolle, wenn jemand fehlt). Dann <M k="weiter">Spiel öffnen – alle Teams</M>, Einweisung lesen lassen, <M k="weiter">▶ Uhr starten – alle</M>. Die Uhr läuft {von}–{bis}.</> },
        { nr: null, zeichen: "◷", titel: "Während des Spiels", text: <>Meldungen und Injects kommen von selbst. Die Übersicht zeigt je Team Eingang, Schlüsselfälle und Fehltreffer. „ansehen ›“ öffnet ein Team: Steuerung (Fast-Track, Reserve, Notiz) oder Zuschauen bei G1–G3.</> },
        { nr: null, zeichen: "■", titel: "Spielende", text: <>Um {bis} hält die Uhr an und die Ansichten der Teams sperren. Das Plenum zeigt die Auflösung je Team. Protokolle je Team als JSON exportieren.</> },
      ],
      wichtig: <>Nicht eingreifen und keine Hinweise geben. Fragen zur Bedienung beantworten, Fragen zur Lage nicht.</>,
    },
  };
}

/** „Euer Team“: Kette G1 → G2 → G3, eigene Rolle hervorgehoben, Namen aus der Lobby. */
function TeamKette(p: { rolle: TeamRolle; team?: KartenTeam }) {
  const t = p.team;
  return (
    <section class="ekarte-team" data-testid="einweisung-team">
      <h3>
        Euer Team
        {t?.name && <span class="team-marke klein"><i style={{ background: t.farbe ?? "#9aa5b1" }} /><span>{t.name}</span></span>}
      </h3>
      <ol class="kette">
        {TEAM.map((r, i) => {
          const namen = (t?.spieler[r.rolle] ?? []).map((n) => (n === t?.ich && r.rolle === p.rolle ? `${n} (du)` : n));
          const du = r.rolle === p.rolle;
          return (
            <Fragment key={r.rolle}>
              {i > 0 && <li class="pfeil" aria-hidden="true">→</li>}
              <li class={`glied rolle-${r.rolle} ${du ? "du" : ""}`} data-rolle={r.rolle}>
                <div class="glied-kopf">
                  <b>{ROLLEN_NAME[r.rolle]}</b>
                  <span class="wer">{namen.length ? namen.join(", ") : du ? "du" : ""}</span>
                </div>
                <span class="tut">{r.tut}</span>
                <span class="sieht"><i>sieht</i> {r.sieht}</span>
              </li>
            </Fragment>
          );
        })}
      </ol>
      <p class="team-satz">Alle drei sehen die Karte mit den gemeldeten Zielen, sonst jede Person nur ihre eigene Ansicht. Ihr sitzt als Team zusammen und dürft miteinander sprechen.</p>
    </section>
  );
}

export function Einweisungskarte(p: { inh: Inhalte; rolle: KartenRolle; schliessen?: () => void; druck?: boolean; team?: KartenTeam }) {
  const tx = texte(p.inh)[p.rolle];
  const lage = p.inh.szenario.lage[tx.lage];
  const teamRolle = p.rolle === "sl" ? null : p.rolle;
  return (
    <article class={`ekarte ${p.rolle}`} data-testid={`einweisung-${p.rolle}`} onClick={(e) => e.stopPropagation()}>
      <header class="ekarte-kopf">
        <h1>{ROLLEN_NAME[p.rolle]}</h1>
        <span class="unter">{tx.unter}</span>
      </header>
      {teamRolle && <TeamKette rolle={teamRolle} team={p.team} />}
      <div class="ekarte-rumpf">
        <section>
          <h3>{teamRolle ? "Dein Auftrag" : "Auftrag"}</h3>
          {(lage?.absaetze ?? []).map((a) => <p>{a}</p>)}
        </section>
        <section>
          <h3>{teamRolle ? "So bedienst du die Ansicht" : "So bedient ihr die Ansicht"}</h3>
          <ol class="schrittliste">
            {tx.schritte.map((s) => (
              <li>
                {s.nr !== null ? <span class="schritt">{s.nr}</span> : <span class="schritt" aria-hidden="true">{s.zeichen}</span>}
                <div><b>{s.titel}</b><span>{s.text}</span></div>
              </li>
            ))}
          </ol>
          <div class="wichtig">{tx.wichtig}</div>
        </section>
      </div>
      <footer class="ekarte-fuss">
        <span>{p.inh.szenario.anzeige} · {p.inh.szenario.fiktiv}</span>
        {p.schliessen && <button type="button" class="knopf" onClick={p.schliessen} data-testid="einweisung-schliessen">Verstanden – zur Ansicht</button>}
      </footer>
    </article>
  );
}

export function EinweisungFenster(p: { inh: Inhalte; rolle: KartenRolle; schliessen: () => void; team?: KartenTeam }) {
  return (
    <div class="einweisung-schirm" onClick={p.schliessen} onKeyDown={(e) => e.key === "Escape" && p.schliessen()}>
      <Einweisungskarte inh={p.inh} rolle={p.rolle} schliessen={p.schliessen} team={p.team} />
    </div>
  );
}

/** Druckseite: je Rolle eine Karte (für jedes Team einen Satz G1–G3 drucken), dazu die Karte der Spielleitung. */
export function EinweisungDruck(p: { inh: Inhalte }) {
  return (
    <div class="druck-seiten">
      <div class="druck-leiste">
        <span>Einweisungskarten {p.inh.szenario.anzeige} – A5 quer, eine Karte je Seite (je Team G1–G3)</span>
        <button type="button" class="knopf" onClick={() => window.print()}>Drucken</button>
      </div>
      {(["g1", "g2", "g3", "sl"] as const).map((r) => <Einweisungskarte inh={p.inh} rolle={r} druck />)}
    </div>
  );
}

/** Einzeiler je Rolle für die Plenumsansicht (dritte Person: „prüft jede ARGUS-Meldung zuerst“). */
export function gruppenKurz(_inh: Inhalte): { rolle: TeamRolle; text: string }[] {
  return TEAM.map((r) => ({ rolle: r.rolle, text: `${r.tut.charAt(0).toUpperCase()}${r.tut.slice(1)}.` }));
}
