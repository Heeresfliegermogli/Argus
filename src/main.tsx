// Einstieg: Einstellungen aus der Adresse lesen, Inhalte laden, Sitzung starten, Fenster zeigen.
//   ohne Parameter               Startseite (Code eingeben, Sitzung anlegen)
//   ?sitzung=CODE                Teilnehmer: Lobby, dann die Ansicht der eigenen Rolle(n)
//   ?sitzung=CODE&rolle=sl       Spielleitung: Übersicht aller Teams, Steuerung, Zuschauen
//   ?sitzung=CODE&rolle=plenum   Smartboard
//   ?rolle=g1&raum=kraehe        Direktaufruf ohne Lobby (ein Team, für Tests und Probeläufe)
//   ?druck=einweisung            Einweisungskarten zum Drucken
//   ?auswertung=demo             Auswertung mit fünf Beispielteams (Üben der Auflösung, ohne Sitzung; nur Webseite)
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { AuswertungAnsicht } from "./ansichten/auswertung";
import { EinweisungDruck } from "./ansichten/einweisung";
import { PlenumFenster, SLFenster } from "./ansichten/sl-fenster";
import { Start } from "./ansichten/start";
import { TTFenster } from "./ansichten/tt-fenster";
import { type Einstellungen, leseEinstellungen, merke, merkeSitzung, merken, sitzungsAdresse } from "./config";
import { setzeBildrateMax } from "./karte/bildrate";
import { ladeInhalte } from "./inhalte/laden";
import type { Inhalte } from "./inhalte/typen";
import type { TeamLauf } from "./kern/auswertung";
import { type Ereignis, type Rolle, zufall } from "./kern/ereignisse";
import { ROLLEN_NAME } from "./kern/sichten";
import { zustandAus } from "./kern/zustand";
import { meldeSitzung } from "./sitzung/fehlersuche";
import { Sitzung } from "./sitzung/sitzung";
import type { FensterArt } from "./sync/adapter";
import { adapterFuer } from "./sync/fabrik";
import "@fontsource/barlow-semi-condensed/latin-400.css";
import "@fontsource/barlow-semi-condensed/latin-500.css";
import "@fontsource/barlow-semi-condensed/latin-600.css";
import "@fontsource/barlow-semi-condensed/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "./stil/basis.css";

const KENNUNG = /^[a-z0-9]{6}$/;

/**
 * Kennung des Fensters. Teilnehmer in einer Sitzung: aus der Adresse (ich=…, wird beim ersten Öffnen
 * gesetzt), damit Neuladen und Lesezeichen ins eigene Team zurückführen. Sonst je Tab im sessionStorage:
 * Eine neu geladene Spielleitung ist sofort wieder dieselbe und übernimmt ihre Steuerung ohne Wartezeit.
 */
function kennung(e: Einstellungen, art: FensterArt, rolle: Rolle | null): string {
  if (e.sitzung && art === "tt") {
    const id = e.ich ?? zufall(6);
    if (!e.ich) history.replaceState(null, "", sitzungsAdresse(e, e.sitzung, { ich: id }));
    return id;
  }
  const schluessel = `argus:kennung:${art}:${rolle ?? ""}:${e.sitzung ?? e.raum ?? ""}`;
  try {
    const alt = sessionStorage.getItem(schluessel);
    if (alt && KENNUNG.test(alt)) return alt;
    const neu = zufall(6);
    sessionStorage.setItem(schluessel, neu);
    return neu;
  } catch {
    return zufall(6);
  }
}

function artVon(rolle: Rolle | null): FensterArt {
  return rolle === "sl" ? "sl" : rolle === "plenum" ? "plenum" : "tt";
}

function Fenster(p: { e: Einstellungen }) {
  const { e } = p;
  const [sitzung, setSitzung] = useState<Sitzung | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const art = artVon(e.rolle);
  useEffect(() => {
    let s: Sitzung | null = null;
    let aus = false;
    (async () => {
      const inh = await ladeInhalte(e.szenario);
      if (aus) return;
      const schluessel = e.sitzung ?? e.raum ?? "kraehe";
      const direkt = !e.sitzung && e.rolle ? { rolle: e.rolle } : undefined;
      s = new Sitzung(inh, adapterFuer(e, schluessel), { art, client: kennung(e, art, direkt?.rolle ?? null), name: e.name, direkt });
      await s.starten();
      merken(e);
      // Spielleitung einer Sitzung: auf der Startseite „Fortsetzen“ anbieten
      if (e.sitzung && art === "sl") merkeSitzung(e.sitzung, e.sync);
      setSitzung(s);
      meldeSitzung(s);
    })().catch((err: Error) => setFehler(err.message));
    return () => {
      aus = true;
      s?.stoppen();
      meldeSitzung(null);
    };
  }, []);
  if (fehler) return <div class="start"><div class="start-karte warnung">Start fehlgeschlagen: {fehler}</div></div>;
  if (!sitzung) return <div class="start"><div class="leise">ARGUS wird geladen …</div></div>;
  if (art === "sl") return <SLFenster s={sitzung} />;
  if (art === "plenum") return <PlenumFenster s={sitzung} />;
  return <TTFenster s={sitzung} />;
}

/** Druckseite der Einweisungskarten (…/?druck=einweisung), ohne Sitzung. */
function Druck(p: { e: Einstellungen }) {
  const [inh, setInh] = useState<Inhalte | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => {
    document.body.style.overflow = "auto";
    ladeInhalte(p.e.szenario).then(setInh).catch((err: Error) => setFehler(err.message));
  }, []);
  if (fehler) return <div class="start"><div class="start-karte warnung">Laden fehlgeschlagen: {fehler}</div></div>;
  return inh ? <EinweisungDruck inh={inh} /> : <div class="start"><div class="leise">Einweisungskarten werden geladen …</div></div>;
}

/**
 * Auswertung mit Beispielteams (…/?auswertung=demo): die fünf Modellteams des Drehbuchs (naiv, ideal, mit
 * Verstärkungen) aus public/demo/auswertung_demo.json, erzeugt mit tools/auswertung_demo.ts. Zum Üben der Auflösung.
 */
function AuswertungDemo(p: { e: Einstellungen }) {
  const [daten, setDaten] = useState<{ inh: Inhalte; teams: TeamLauf[] } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const inh = await ladeInhalte(p.e.szenario);
      const antwort = await fetch(new URL("demo/auswertung_demo.json", document.baseURI), { cache: "no-cache" });
      if (!antwort.ok) throw new Error(`Beispieldaten: HTTP ${antwort.status}`);
      const d = (await antwort.json()) as { teams: { id: string; name: string; farbe: string; protokoll: Ereignis[] }[] };
      setDaten({ inh, teams: d.teams.map((t) => ({ id: t.id, name: t.name, farbe: t.farbe, protokoll: t.protokoll, zustand: zustandAus(t.protokoll, inh) })) });
    })().catch((err: Error) => setFehler(err.message));
  }, []);
  if (fehler) return <div class="start"><div class="start-karte warnung">Beispiel nicht verfügbar ({fehler}). Die Beispieldaten gibt es nur auf der Webseite.</div></div>;
  if (!daten) return <div class="start"><div class="leise">Beispiel wird geladen …</div></div>;
  return <AuswertungAnsicht inh={daten.inh} teams={daten.teams} art="demo" kennung="Beispiel · Modellteams" />;
}

function titel(e: Einstellungen): string {
  if (e.sitzung) return e.rolle === "sl" ? "ARGUS · Spielleitung" : e.rolle === "plenum" ? "ARGUS · Plenum" : "ARGUS";
  return e.rolle ? `ARGUS · ${ROLLEN_NAME[e.rolle]}` : "ARGUS";
}

function App() {
  const e = leseEinstellungen();
  setzeBildrateMax(e.fps);
  if (new URLSearchParams(location.search).has("fps")) merke("fps", String(e.fps));
  if (new URLSearchParams(location.search).get("druck") === "einweisung") {
    document.title = "ARGUS · Einweisungskarten";
    return <Druck e={e} />;
  }
  if (new URLSearchParams(location.search).get("auswertung") === "demo") {
    document.title = "ARGUS · Auswertung (Beispiel)";
    return <AuswertungDemo e={e} />;
  }
  document.title = titel(e);
  return e.sitzung || e.rolle ? <Fenster e={e} /> : <Start e={e} />;
}

render(<App />, document.getElementById("app")!);
