// Einstieg: Einstellungen aus der Adresse lesen, Inhalte laden, Sitzung starten, Ansicht zeigen.
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { ANSICHTEN } from "./ansichten/register";
import { Rahmen } from "./ansichten/gemeinsam/rahmen";
import { Start } from "./ansichten/start";
import { type Einstellungen, leseEinstellungen, merken } from "./config";
import { ladeInhalte } from "./inhalte/laden";
import type { Rolle } from "./kern/ereignisse";
import { Sitzung } from "./sitzung/sitzung";
import type { SyncAdapter } from "./sync/adapter";
import { FirebaseAdapter } from "./sync/firebase";
import { LokalAdapter } from "./sync/lokal";
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

function App() {
  const e = leseEinstellungen();
  document.title = e.rolle ? `ARGUS · ${e.rolle.toUpperCase()}` : "ARGUS";
  return e.rolle ? <Spiel e={e} rolle={e.rolle} /> : <Start e={e} />;
}

render(<App />, document.getElementById("app")!);
