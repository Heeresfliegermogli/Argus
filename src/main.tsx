// Einstieg: Einstellungen aus der Adresse lesen, Inhalte laden, Sitzung starten, Ansicht zeigen.
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { ANSICHTEN } from "./ansichten/register";
import { Rahmen } from "./ansichten/gemeinsam/rahmen";
import { Start } from "./ansichten/start";
import { type Einstellungen, leseEinstellungen, merken } from "./config";
import { ladeInhalte } from "./inhalte/laden";
import type { Inhalte } from "./inhalte/typen";
import type { Rolle } from "./kern/ereignisse";
import { Sitzung } from "./sitzung/sitzung";
import type { SyncAdapter } from "./sync/adapter";
import { FirebaseAdapter } from "./sync/firebase";
import { LokalAdapter } from "./sync/lokal";
import { EinweisungDruck } from "./ansichten/einweisung";
import "@fontsource/barlow-semi-condensed/latin-400.css";
import "@fontsource/barlow-semi-condensed/latin-500.css";
import "@fontsource/barlow-semi-condensed/latin-600.css";
import "@fontsource/barlow-semi-condensed/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "./stil/basis.css";

function baueAdapter(e: Einstellungen): SyncAdapter {
  if (e.sync === "lokal") return new LokalAdapter(e.raum);
  return new FirebaseAdapter(e.raum, { databaseURL: e.db, transport: e.transport });
}

function Spiel(p: { e: Einstellungen; rolle: Rolle }) {
  const [sitzung, setSitzung] = useState<Sitzung | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => {
    let s: Sitzung | null = null;
    let aus = false;
    (async () => {
      const inh = await ladeInhalte(p.e.szenario);
      if (aus) return;
      s = new Sitzung(inh, baueAdapter(p.e), p.rolle, p.e.name);
      await s.starten();
      merken(p.e);
      setSitzung(s);
      (window as unknown as { argus?: Sitzung }).argus = s; // für Fehlersuche in der Konsole
    })().catch((err: Error) => setFehler(err.message));
    return () => {
      aus = true;
      s?.stoppen();
    };
  }, []);
  if (fehler) return <div class="start"><div class="start-karte warnung">Start fehlgeschlagen: {fehler}</div></div>;
  if (!sitzung) return <div class="start"><div class="leise">ARGUS wird geladen …</div></div>;
  const Ansicht = ANSICHTEN[p.rolle];
  return <Rahmen s={sitzung}><Ansicht s={sitzung} /></Rahmen>;
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

function App() {
  const e = leseEinstellungen();
  if (new URLSearchParams(location.search).get("druck") === "einweisung") {
    document.title = "ARGUS · Einweisungskarten";
    return <Druck e={e} />;
  }
  document.title = e.rolle ? `ARGUS · ${e.rolle.toUpperCase()}` : "ARGUS";
  return e.rolle ? <Spiel e={e} rolle={e.rolle} /> : <Start e={e} />;
}

render(<App />, document.getElementById("app")!);
