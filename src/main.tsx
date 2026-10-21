// Einstieg: Einstellungen aus der Adresse lesen, Inhalte laden, Sitzung starten, Fenster zeigen.
//   ohne Parameter               Startseite (Code eingeben, Sitzung anlegen)
//   ?sitzung=CODE                Teilnehmer: Lobby, dann die Ansicht der eigenen Rolle(n)
//   ?sitzung=CODE&rolle=sl       Spielleitung: Übersicht aller Teams, Steuerung, Zuschauen
//   ?sitzung=CODE&rolle=plenum   Smartboard
//   ?rolle=g1&raum=kraehe        Direktaufruf ohne Lobby (ein Team, für Tests und Probeläufe)
//   ?druck=einweisung            Einweisungskarten zum Drucken
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { EinweisungDruck } from "./ansichten/einweisung";
import { PlenumFenster, SLFenster } from "./ansichten/sl-fenster";
import { Start } from "./ansichten/start";
import { TTFenster } from "./ansichten/tt-fenster";
import { type Einstellungen, leseEinstellungen, merken, sitzungsAdresse } from "./config";
import { ladeInhalte } from "./inhalte/laden";
import type { Inhalte } from "./inhalte/typen";
import { type Rolle, zufall } from "./kern/ereignisse";
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

function titel(e: Einstellungen): string {
  if (e.sitzung) return e.rolle === "sl" ? "ARGUS · Spielleitung" : e.rolle === "plenum" ? "ARGUS · Plenum" : "ARGUS";
  return e.rolle ? `ARGUS · ${e.rolle.toUpperCase()}` : "ARGUS";
}

function App() {
  const e = leseEinstellungen();
  if (new URLSearchParams(location.search).get("druck") === "einweisung") {
    document.title = "ARGUS · Einweisungskarten";
    return <Druck e={e} />;
  }
  document.title = titel(e);
  return e.sitzung || e.rolle ? <Fenster e={e} /> : <Start e={e} />;
}

render(<App />, document.getElementById("app")!);
