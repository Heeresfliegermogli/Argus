// Einweisung (Änderung B5, 25.10.2026): kürzer und als kurze Anleitung in Folien. Je Rolle:
//   1. „Deine Rolle“: was du tust, „Euer Team“ (Aufklärung → Zielprüfung → Führung mit den Namen aus der Lobby, wer was
//      sieht) und der wichtigste Satz.
//   2.–4./5. Bedienung, je Folie ein Schritt mit kleinem Bild: auswählen, Drohnenbild öffnen bzw. Wirkmittel wählen,
//      entscheiden …
// Weiter mit „weiter ›“, Pfeiltasten oder Wischen; „Überspringen“ schließt; über „Einweisung“ in der Kopfzeile jederzeit
// wieder aufrufbar. Keine Lösungshinweise: Die Folien zeigen, wie man bedient und wer was sieht – nicht, was das Team
// weitergeben soll; die Beispiele (Ziel 3, Kampfpanzer) sind neutral.
// Der Druck (…/?druck=einweisung, A5 quer) zeigt dieselben Folien auf einer Karte je Rolle.
import { type ComponentChildren, Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Inhalte } from "../inhalte/typen";
import type { Rolle } from "../kern/ereignisse";
import { ROLLEN_NAME } from "../kern/sichten";
import { uhrzeit } from "../kern/uhr";

type KartenRolle = Exclude<Rolle, "plenum">;
type TeamRolle = "g1" | "g2" | "g3";

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

interface Folie {
  titel: string;
  text: ComponentChildren;
  bild: ComponentChildren;
}

interface RollenText {
  unter: string;
  wichtig: ComponentChildren;
  folien: Folie[];
}

// ---------------------------------------------------------------- kleine Bilder (Bedienung, neutral)

/** Ausschnitt der Karte mit einem Zeichen und einer Marke. */
function MiniKarte(p: { children?: ComponentChildren; marke?: string; art?: string; klasse?: string }) {
  return (
    <div class={`mini-karte ${p.klasse ?? ""}`} aria-hidden="true">
      <i class="mini-strasse" /><i class="mini-bach" />
      <span class="mini-zeichen" />
      {p.marke && <span class={`kmarke mini ${p.art ?? "offen"}`}>{p.marke}</span>}
      {p.children}
    </div>
  );
}

function MiniEingang(p: { n: number }) {
  return <span class="mini-eingang" aria-hidden="true"><span class="schritt">1</span>Eingang <b>{p.n}</b></span>;
}

function MiniDrohne() {
  return (
    <span class="mini-drohne">
      <span class="mini-drohne-kopf"><span>● LIVE 03:12</span><b class="mini-x">✕</b></span>
      <span class="mini-rahmen"><span>Kampfpanzer · 91 %</span></span>
      <span class="mini-lupe">Klick: groß mit Lupe</span>
    </span>
  );
}

function MiniKnoepfe(p: { liste: { text: string; unter?: string; klasse?: string }[] }) {
  return (
    <div class="mini-knoepfe" aria-hidden="true">
      {p.liste.map((k) => <span class={`knopf gross ${k.klasse ?? ""}`}>{k.text}{k.unter && <span class="unterzeile">{k.unter}</span>}</span>)}
    </div>
  );
}

function texte(inh: Inhalte): Record<KartenRolle, RollenText> {
  const ft = inh.regeln.fast_track.schwelle;
  const uhr = inh.szenario.spieluhr;
  const von = uhrzeit(uhr.start, 0);
  const bis = uhrzeit(uhr.start, uhr.dauer_s);
  const wm = Object.values(inh.wirkmittel);
  return {
    g1: {
      unter: "Du prüfst jede ARGUS-Meldung zuerst.",
      wichtig: <>Du bist die erste Prüfstufe. Was du annimmst, geht als Zielmeldung an die Zielprüfung – ohne Drohnenbild und ohne Sensordaten.</>,
      folien: [
        {
          titel: "Meldung auswählen",
          text: <>Jede ARGUS-Meldung steht als Marke auf der Karte, z. B. <M>Ziel 3</M>. Die älteste öffnet sich von selbst; ein Klick auf eine andere Marke öffnet diese. Oben rechts steht, wie viele warten.</>,
          bild: <div class="mini-reihe"><MiniKarte marke="Ziel 3" /><MiniEingang n={2} /></div>,
        },
        {
          titel: "Drohnenbild ansehen",
          text: <>Neben dem Ziel läuft das Drohnenbild live; die Drohne verfolgt das Ziel. <b>Klick ins Bild:</b> groß mit Lupe (Mausrad: stärker). An der Kopfleiste verschiebst du das Fenster, <M>✕</M> schließt es, die Marke öffnet es wieder.</>,
          bild: <MiniKarte marke="Ziel 3" art="gewaehlt" klasse="mit-drohne"><MiniDrohne /></MiniKarte>,
        },
        {
          titel: "Daten prüfen",
          text: <>Rechts stehen die <M k="argus">ARGUS</M>-Daten (Klasse, Konfidenz, Empfehlung) und die Sensordaten der Drohne. Ganz unten steht das Kleingedruckte des Herstellers.</>,
          bild: (
            <div class="mini-panel" aria-hidden="true">
              <div class="mini-argus"><b>ARGUS</b><span>Kampfpanzer</span><span class="mono">91 %</span></div>
              <div class="mini-zeilen"><span>Wärmebild</span><span>Bewegung</span><span>Spuren</span><span>Kennzeichnung</span></div>
            </div>
          ),
        },
        {
          titel: "Entscheiden",
          text: <><M>ANNEHMEN</M> schickt das Ziel an die Zielprüfung, <M>ABLEHNEN</M> beendet die Meldung. Danach öffnet sich die nächste.</>,
          bild: <MiniKnoepfe liste={[{ text: "ANNEHMEN", unter: "als Ziel an die Zielprüfung" }, { text: "ABLEHNEN", unter: "kein Ziel" }]} />,
        },
      ],
    },
    g2: {
      unter: "Du prüfst die Einsatzregeln und wählst das Wirkmittel.",
      wichtig: <>Das System warnt, verhindert aber nichts. Wirkmittel sind begrenzt – der Bestand steht am Wirkmittel.</>,
      folien: [
        {
          titel: "Zielmeldung auswählen",
          text: <>Ziele, die die Aufklärung angenommen hat, stehen als Marke auf der Karte, z. B. <M>Ziel 3</M>. Die älteste öffnet sich von selbst; oben rechts steht, wie viele warten.</>,
          bild: <div class="mini-reihe"><MiniKarte marke="Ziel 3" /><MiniEingang n={1} /></div>,
        },
        {
          titel: "Wirkmittel wählen",
          text: <>{wm.map((w) => w.kurz).join(", ")}: Die Karte zeigt den Wirkradius dort, wo er <b>einschlagen</b> würde – grün ohne Warnung, rot bei Verstoß gegen eine Einsatzregel. Die Warnungen stehen am Wirkmittel.</>,
          bild: (
            <div class="mini-reihe">
              <MiniKarte marke="Ziel 3" art="gewaehlt"><span class="mini-kreis ok" /><span class="mini-kreis rot" /></MiniKarte>
              <div class="mini-wm" aria-hidden="true">
                <span class="ok">✓ keine Warnung</span>
                <span class="rot">⚠ Regel verletzt</span>
              </div>
            </div>
          ),
        },
        {
          titel: "Empfehlen",
          text: <><M k="toedlich">BEKÄMPFEN mit …</M> geht an die Führung. <M>BEOBACHTEN</M> stellt das Ziel zurück – die Marke bleibt als „zurückgestellt“ stehen. <M>NICHT BEKÄMPFEN</M> schließt ab.</>,
          bild: (
            <div class="mini-reihe">
              <MiniKnoepfe liste={[{ text: "BEKÄMPFEN mit LM", klasse: "toedlich" }, { text: "BEOBACHTEN" }, { text: "NICHT BEKÄMPFEN" }]} />
              <span class="kmarke mini zurueck">Ziel 3 · zurückgestellt</span>
            </div>
          ),
        },
      ],
    },
    g3: {
      unter: "Du gibst frei und führst das Gefecht.",
      wichtig: <>Ohne deine Freigabe wird nichts bekämpft. Du verantwortest jede Wirkung.</>,
      folien: [
        {
          titel: "Empfehlung auswählen",
          text: <>Empfehlungen der Zielprüfung stehen als Marke auf der Karte (<M>Ziel 3 · ⚠</M> = mit Regelwarnung). Die älteste öffnet sich von selbst; oben rechts steht, wie viele warten.</>,
          bild: <div class="mini-reihe"><MiniKarte marke="Ziel 3 · ⚠" /><MiniEingang n={1} /></div>,
        },
        {
          titel: "Entscheiden",
          text: <><M k="toedlich">FREIGABE</M> löst die Wirkung aus, <M>ABLEHNEN</M> beendet, <M>ZURÜCK</M> schickt zur erneuten Prüfung. Bis zum Einschlag steht ein gestrichelter roter Kreis mit der Spielzeit auf der Karte.</>,
          bild: (
            <div class="mini-reihe">
              <MiniKnoepfe liste={[{ text: "FREIGABE", klasse: "toedlich" }, { text: "ABLEHNEN" }, { text: "ZURÜCK" }]} />
              <MiniKarte><span class="mini-kreis geplant" /><span class="kmarke mini wirkung">Einschlag 03:40</span></MiniKarte>
            </div>
          ),
        },
        {
          titel: "Lagemeldungen und Lagehinweise",
          text: <>Nur du bekommst Meldungen von Brigade, Nachbarn und Kompanie (rechts). Lesen, dann <M k="weiter">Gelesen</M>. Ein Lagehinweis erscheint bei Aufklärung und Zielprüfung auf der Karte. Fast-Track (ab {ft} % ohne Aufklärung) schaltest du oben rechts.</>,
          bild: (
            <div class="mini-panel" aria-hidden="true">
              <div class="mini-inject"><span class="sehr-leise">02:10 · Brigade</span><span>Lagemeldung …</span><span class="knopf klein weiter">Gelesen</span></div>
              <div class="mini-hinweis">Lagehinweis an Aufklärung und Zielprüfung …</div>
            </div>
          ),
        },
      ],
    },
    sl: {
      unter: "SL 1 steuert alle Teams, SL 2 beobachtet und protokolliert.",
      wichtig: <>Nicht eingreifen und keine Hinweise geben. Fragen zur Bedienung beantworten, Fragen zur Lage nicht.</>,
      folien: [
        {
          titel: "Vor dem Spiel",
          text: <>Startseite → Spielleitung → Sitzung anlegen, „Plenum öffnen“ – das Smartboard zeigt den Code (drei Zeichen). Die Teilnehmer bilden Teams à drei (Doppelrolle, wenn jemand fehlt). Dann <M k="weiter">Spiel öffnen – alle Teams</M>, Anleitung lesen lassen, <M k="weiter">▶ Uhr starten – alle</M>. Die Uhr läuft {von}–{bis}.</>,
          bild: null,
        },
        {
          titel: "Während des Spiels",
          text: <>Meldungen und Injects kommen von selbst. Die Übersicht zeigt je Team Eingang, Schlüsselfälle und Fehltreffer. „ansehen ›“ öffnet ein Team: Steuerung (Fast-Track, Reserve, Verstärkung, Notiz, Fahrwege auf der Kontrollkarte) oder Zuschauen bei den drei Rollen.</>,
          bild: null,
        },
        {
          titel: "Spielende",
          text: <>Um {bis} hält die Uhr an und die Ansichten der Teams sperren. Das Plenum zeigt die Auswertung über alle Teams. Protokolle je Team als JSON exportieren.</>,
          bild: null,
        },
      ],
    },
  };
}

/** „Euer Team“: Kette Aufklärung → Zielprüfung → Führung, eigene Rolle hervorgehoben, Namen aus der Lobby. */
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

/** Erste Folie: Rolle, Team, wichtigster Satz (für die Spielleitung: ihr Auftrag aus dem Szenario). */
function RollenFolie(p: { inh: Inhalte; rolle: KartenRolle; team?: KartenTeam; tx: RollenText }) {
  const teamRolle = p.rolle === "sl" ? null : p.rolle;
  return (
    <div class="folie folie-rolle">
      {teamRolle ? <TeamKette rolle={teamRolle} team={p.team} /> : (
        <section class="ekarte-team">
          <h3>Auftrag</h3>
          {(p.inh.szenario.lage.spielleitung?.absaetze ?? []).map((a) => <p>{a}</p>)}
        </section>
      )}
      <div class="wichtig folie-wichtig">{p.tx.wichtig}</div>
    </div>
  );
}

/**
 * Einweisung im Spiel: Folien mit weiter/zurück, Pfeiltasten und Wischen; „Überspringen“ schließt, auf der letzten
 * Folie „Verstanden – zur Ansicht“.
 */
export function EinweisungFenster(p: { inh: Inhalte; rolle: KartenRolle; schliessen: () => void; team?: KartenTeam }) {
  const tx = texte(p.inh)[p.rolle];
  const anzahl = tx.folien.length + 1;
  const [nr, setNr] = useState(0);
  const wisch = useRef<{ x: number; y: number } | null>(null);
  const geh = (n: number) => setNr(Math.max(0, Math.min(anzahl - 1, n)));
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.key === "Escape") p.schliessen();
      else if (e.key === "ArrowRight" || e.key === "PageDown") setNr((n) => Math.min(anzahl - 1, n + 1));
      else if (e.key === "ArrowLeft" || e.key === "PageUp") setNr((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, [anzahl]);
  const folie = nr > 0 ? tx.folien[nr - 1] : null;
  const letzte = nr === anzahl - 1;
  return (
    <div class="einweisung-schirm">
      <article class={`ekarte folien ${p.rolle}`} data-testid={`einweisung-${p.rolle}`} data-folie={nr + 1} data-folien={anzahl}
        onPointerDown={(e) => { wisch.current = { x: e.clientX, y: e.clientY }; }}
        onPointerUp={(e) => {
          const w = wisch.current;
          wisch.current = null;
          if (!w || e.pointerType === "mouse") return;
          const dx = e.clientX - w.x;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - w.y)) geh(nr + (dx < 0 ? 1 : -1));
        }}>
        <header class="ekarte-kopf">
          <h1>{ROLLEN_NAME[p.rolle]}</h1>
          <span class="unter">{tx.unter}</span>
        </header>
        <div class="folie-rumpf">
          {folie ? (
            <div class="folie folie-schritt" key={nr}>
              <div class="folie-text">
                <h2><span class="schritt">{nr}</span>{folie.titel}</h2>
                <p>{folie.text}</p>
              </div>
              {folie.bild && <div class="folie-bild">{folie.bild}</div>}
            </div>
          ) : <RollenFolie inh={p.inh} rolle={p.rolle} team={p.team} tx={tx} />}
        </div>
        <footer class="ekarte-fuss folie-fuss">
          <button type="button" class="knopf leise" onClick={p.schliessen} data-testid="einweisung-ueberspringen">Überspringen</button>
          <span class="folie-punkte" aria-label={`Folie ${nr + 1} von ${anzahl}`}>
            {Array.from({ length: anzahl }, (_, i) => (
              <button type="button" key={i} class={i === nr ? "an" : ""} onClick={() => geh(i)} aria-label={`Folie ${i + 1}`} />
            ))}
          </span>
          <span class="zeile" style="gap:8px">
            {nr > 0 && <button type="button" class="knopf leise" onClick={() => geh(nr - 1)}>‹ zurück</button>}
            {letzte
              ? <button type="button" class="knopf" onClick={p.schliessen} data-testid="einweisung-schliessen">Verstanden – zur Ansicht</button>
              : <button type="button" class="knopf" onClick={() => geh(nr + 1)} data-testid="einweisung-weiter">weiter ›</button>}
          </span>
        </footer>
      </article>
    </div>
  );
}

/** Druckkarte (A5 quer): Rolle, Team und alle Folien auf einer Seite. */
export function Einweisungskarte(p: { inh: Inhalte; rolle: KartenRolle; team?: KartenTeam }) {
  const tx = texte(p.inh)[p.rolle];
  const teamRolle = p.rolle === "sl" ? null : p.rolle;
  return (
    <article class={`ekarte druck ${p.rolle}`} data-testid={`einweisung-${p.rolle}`}>
      <header class="ekarte-kopf">
        <h1>{ROLLEN_NAME[p.rolle]}</h1>
        <span class="unter">{tx.unter}</span>
      </header>
      {teamRolle ? <TeamKette rolle={teamRolle} team={p.team} /> : (
        <section class="ekarte-team"><h3>Auftrag</h3>{(p.inh.szenario.lage.spielleitung?.absaetze ?? []).map((a) => <p>{a}</p>)}</section>
      )}
      <ol class={`druck-folien n${tx.folien.length}`}>
        {tx.folien.map((f, i) => (
          <li>
            {f.bild && <div class="folie-bild">{f.bild}</div>}
            <div><b><span class="schritt">{i + 1}</span>{f.titel}</b><span>{f.text}</span></div>
          </li>
        ))}
      </ol>
      <div class="wichtig druck-wichtig">{tx.wichtig}</div>
      <footer class="ekarte-fuss"><span>{p.inh.szenario.anzeige} · {p.inh.szenario.fiktiv}</span></footer>
    </article>
  );
}

/** Druckseite: je Rolle eine Karte (für jedes Team einen Satz Aufklärung, Zielprüfung, Führung), dazu die Spielleitung. */
export function EinweisungDruck(p: { inh: Inhalte }) {
  return (
    <div class="druck-seiten">
      <div class="druck-leiste">
        <span>Einweisungskarten {p.inh.szenario.anzeige} – A5 quer, eine Karte je Seite (je Team Aufklärung, Zielprüfung, Führung)</span>
        <button type="button" class="knopf" onClick={() => window.print()}>Drucken</button>
      </div>
      {(["g1", "g2", "g3", "sl"] as const).map((r) => <Einweisungskarte inh={p.inh} rolle={r} />)}
    </div>
  );
}

/** Einzeiler je Rolle für die Plenumsansicht (dritte Person: „prüft jede ARGUS-Meldung zuerst“). */
export function gruppenKurz(_inh: Inhalte): { rolle: TeamRolle; text: string }[] {
  return TEAM.map((r) => ({ rolle: r.rolle, text: `${r.tut.charAt(0).toUpperCase()}${r.tut.slice(1)}.` }));
}
