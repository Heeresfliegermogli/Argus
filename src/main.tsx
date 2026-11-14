// Einstieg: Einstellungen aus der Adresse lesen, Inhalte laden, Sitzung starten, Fenster zeigen.
//   ohne Parameter               Startseite (Code eingeben, Sitzung anlegen)
//   ?sitzung=CODE                Teilnehmer: Lobby, dann die Ansicht des Teams. Seit Liste K nimmt derselbe Browser seine gemerkte
//                                Kennung wieder (K1.1); ein zweiter Tab desselben Browsers sieht nur zu (K1.3, Tab-Wache)
//   ?sitzung=CODE&rolle=sl       Spielleitung: Übersicht aller Teams, Steuerung, Zuschauen
//   ?sitzung=CODE&rolle=plenum   Smartboard
//   ?rolle=g1&raum=kraehe        Direktaufruf ohne Lobby (ein Team, für Tests und Probeläufe)
//   ?druck=einweisung            Einweisungskarten zum Drucken
//   ?auswertung=demo             Auswertung mit sieben Beispielteams (Üben der Auflösung, ohne Sitzung; nur Webseite)
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { AuswertungAnsicht } from "./ansichten/auswertung";
import { EinweisungDruck } from "./ansichten/einweisung";
import { PlenumFenster, SLFenster } from "./ansichten/sl-fenster";
import { Start } from "./ansichten/start";
import { TTFenster } from "./ansichten/tt-fenster";
import { skalierungAnwenden } from "./ansichten/gemeinsam/fenster";
import { type Einstellungen, leseEinstellungen, merke, merkeSitzung, merken, sitzungsAdresse } from "./config";
import { setzeBildrateMax } from "./karte/bildrate";
import { ladeInhalte } from "./inhalte/laden";
import type { Inhalte } from "./inhalte/typen";
import type { TeamLauf } from "./kern/auswertung";
import { type Ereignis, type Rolle, zufall } from "./kern/ereignisse";
import { ROLLEN_NAME } from "./kern/sichten";
import { zustandAus } from "./kern/zustand";
import { meldeSitzung } from "./sitzung/fehlersuche";
import { Merker } from "./sitzung/gemerkt";
import { Sitzung } from "./sitzung/sitzung";
import { TabWache } from "./sitzung/tabwache";
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
 * Kennung des Fensters. Teilnehmer in einer Sitzung: aus der Adresse (ich=…, Neuladen und Lesezeichen), sonst – seit Liste K (K1.1) –
 * die im Browser gemerkte Kennung dieser Sitzung (Startseite → Code nach dem Schließen des Tabs), sonst eine neue. Sie steht danach
 * in der Adresse und im Merker. Spielleitung und Plenum je Tab im sessionStorage: Eine neu geladene Spielleitung ist sofort wieder
 * dieselbe und übernimmt ihre Steuerung ohne Wartezeit.
 */
function kennung(e: Einstellungen, art: FensterArt, rolle: Rolle | null, merker?: Merker): string {
  if (e.sitzung && art === "tt") {
    const id = e.ich ?? merker?.lies()?.client ?? zufall(6);
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

/** Neue Kennung für diesen Tab (Test ohne Lobby: zweites Fenster, dessen Kennung schon ein anderer Tab führt). */
function neueTabKennung(e: Einstellungen, art: FensterArt, rolle: Rolle): string {
  const neu = zufall(6);
  try {
    sessionStorage.setItem(`argus:kennung:${art}:${rolle}:${e.sitzung ?? e.raum ?? ""}`, neu);
  } catch {
    /* privater Modus */
  }
  return neu;
}

function artVon(rolle: Rolle | null): FensterArt {
  return rolle === "sl" ? "sl" : rolle === "plenum" ? "plenum" : "tt";
}

function Fenster(p: { e: Einstellungen }) {
  const { e } = p;
  const [sitzung, setSitzung] = useState<Sitzung | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [tab, setTab] = useState<TabStand>({ art: "inhaber" });
  const art = artVon(e.rolle);
  useEffect(() => {
    let s: Sitzung | null = null;
    let wache: TabWache | null = null;
    let aus = false;
    (async () => {
      const inh = await ladeInhalte(e.szenario);
      if (aus) return;
      const schluessel = e.sitzung ?? e.raum ?? "kraehe";
      const direkt = !e.sitzung && e.rolle ? { rolle: e.rolle } : undefined;
      // Team-Fenster: gemerkte Kennung (K1.1) und Tab-Wache (K1.3). In einer Sitzung mit Lobby sieht ein zweiter Tab desselben
      // Browsers als Gast zu. Im Test ohne Lobby (…?rolle=zb&raum=…) ist ein zweites Fenster wie bisher ein eigenes Fenster des
      // Teams (sieht zu) – aber wer den einzigen Tab schließt und neu öffnet, ist wieder der Team-Laptop.
      const direktZb = direkt?.rolle === "zb";
      let merker = (e.sitzung && art === "tt") || direktZb ? new Merker(schluessel, e.geraet) : undefined;
      let client = kennung(e, art, direkt?.rolle ?? null, merker);
      let gastVon: string | undefined;
      const holen = async () => {
        await wache?.holen();
        location.reload();
      };
      if (merker) {
        const eigene = client;
        if (direktZb) client = merker.lies()?.client ?? eigene;
        wache = new TabWache(`${schluessel}:${client}${e.geraet ? `@${e.geraet}` : ""}`);
        if (await wache.beanspruchen()) {
          // „hierher holen“ in einem anderen Tab: sauber anhalten (Rest hochladen), dann erst frei melden
          wache.aufVerlust(() => {
            const alt = s;
            s = null;
            setTab({ art: "abgegeben", holen });
            setSitzung(null);
            meldeSitzung(null);
            void (async () => {
              const sp = alt?.spiel(alt.stand.ich.team);
              if (sp?.hostAktiv) await sp.abschliessen(1500);
              alt?.stoppen();
            })();
          });
        } else if (direktZb) {
          // Test ohne Lobby: zweites Fenster mit eigener Kennung (je Tab), ohne Merker
          wache.stoppen();
          wache = null;
          merker = undefined;
          client = eigene !== client ? eigene : neueTabKennung(e, art, "zb");
        } else {
          gastVon = client;
          setTab({ art: "zweiter", holen });
        }
        if (aus) return;
      }
      s = new Sitzung(inh, adapterFuer(e, schluessel), {
        art, client: gastVon ? zufall(6) : client, name: e.name, direkt, merker: gastVon ? undefined : merker, gastVon,
      });
      // Liste L (L3.2): Notbremse „Alle Sitzungen beenden“ – das Fenster hat abgeschlossen (Host aus, Rest hochgeladen, Sitzungen
      // vergessen) und geht zur Startseite; dort steht einmal „Die Spielleitung hat alle Sitzungen beendet“.
      const fenster = s;
      fenster.abonnieren(() => {
        if (!fenster.stand.alleBeendet || aus) return;
        aus = true;
        try {
          sessionStorage.setItem("argus:meldung", "reset");
          // Kennung dieses Tabs (Spielleitung, Testraum) nicht wiederverwenden
          for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const k = sessionStorage.key(i);
            if (k?.startsWith("argus:kennung:")) sessionStorage.removeItem(k);
          }
        } catch {
          /* privater Modus */
        }
        fenster.stoppen();
        wache?.stoppen();
        location.href = location.pathname;
      });
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
      wache?.stoppen();
      meldeSitzung(null);
    };
  }, []);
  if (fehler) return <div class="start"><div class="start-karte warnung">Start fehlgeschlagen: {fehler}</div></div>;
  if (tab.art === "abgegeben") return <TabAbgegeben holen={tab.holen} />;
  if (!sitzung) return <div class="start"><div class="leise">ARGUS wird geladen …</div></div>;
  if (art === "sl") return <SLFenster s={sitzung} />;
  if (art === "plenum") return <PlenumFenster s={sitzung} />;
  return <TTFenster s={sitzung} zweiterTab={tab.art === "zweiter" ? { holen: tab.holen, neuesGeraet: () => { location.href = sitzungsAdresse({ ...e, geraet: zufall(4) }, e.sitzung!); } } : undefined} />;
}

/** K1.3: Was dieser Tab für die Kennung ist – Inhaber (rechnet), zweiter Tab (sieht zu) oder abgegeben („hierher holen“ im anderen Tab). */
type TabStand = { art: "inhaber" } | { art: "zweiter"; holen: () => Promise<void> } | { art: "abgegeben"; holen: () => Promise<void> };

function TabAbgegeben(p: { holen: () => Promise<void> }) {
  return (
    <div class="start">
      <div class="start-karte stapel" style="gap:12px;width:min(560px,100%)" data-testid="tab-abgegeben">
        <h1>ARGUS</h1>
        <div>Das Spiel läuft jetzt in einem <b>anderen Tab</b> dieses Browsers. Dieser Tab kann geschlossen werden.</div>
        <button type="button" class="knopf weiter" style="align-self:flex-start" onClick={() => void p.holen()} data-testid="tab-holen">Spiel wieder hierher holen</button>
      </div>
    </div>
  );
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

// Seit Liste J: unter 1280 × 600 wird die ganze Ansicht gleichmäßig verkleinert (nicht beim Druck der Einweisungskarten)
if (new URLSearchParams(location.search).get("druck") !== "einweisung") skalierungAnwenden(document.getElementById("app")!);

render(<App />, document.getElementById("app")!);
