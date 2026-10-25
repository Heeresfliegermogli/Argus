// Aufklärung (intern g1; Schritt 6b, Änderungen B6–B9 vom 25.10.2026): Die Karte ist die Arbeitsfläche. Jede
// ARGUS-Meldung erscheint als Marke „Ziel 7“ am Ziel; die geöffnete zeigt ihr Drohnenbild live in einem Fenster am Ort
// (Linie zum Ziel), Klick = groß mit Lupe. Das Fenster lässt sich an der Kopfleiste verschieben und mit ✕ schließen,
// die Marke öffnet es wieder; die Drohne verfolgt das Ziel. Rechts: Eingang als Zahl, ARGUS-Daten, Sensordaten,
// Entscheidung ANNEHMEN oder ABLEHNEN (gleich gewichtet, kein Vermerk mehr).
//   ① Meldung öffnen (Marke; die älteste öffnet sich von selbst)  ② Drohnenbild und Daten prüfen  ③ entscheiden
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { drohnenbild, drohnenEbenen, vorladen } from "../assets/assets";
import type { LiveLage } from "../drohne/livebild";
import { bekannteZiele, effekte } from "../kern/effekte";
import { feinlage } from "../kern/geometrie";
import { lagebildZielmeldungen } from "../kern/lagebild";
import { gemeldetePosition } from "../kern/regeln";
import { warteschlange } from "../kern/sichten";
import { uhrzeit } from "../kern/uhr";
import { zielName } from "../kern/zielnummern";
import type { Sicht } from "../sitzung/sicht";
import { AktionsKnopf, Empfehlung, EingangLeiste, KartenLagehinweise, Konfidenz, Panel } from "./gemeinsam/bausteine";
import { useAuswahl, useEntfallHinweis, useSpielzeit, useStand } from "./gemeinsam/hooks";
import { LagekarteAnsicht, meldungsMarken } from "./gemeinsam/lagekarte";
import { LiveDrohnenFenster } from "./gemeinsam/livedrohne";
import { useManifest } from "./gemeinsam/drohnenbild";

const SICHT_TEXT: Record<string, string> = {
  wolke: "Wolke", rauch: "Rauch", dunst: "Dunst", baeume: "Bäume", tarnnetz: "Tarnnetz", stoerung: "Bildstörung", unschaerfe: "Unschärfe",
};

/** Fenster des Drohnenbilds am Ort (16 : 10) */
export const DROHNEN_FENSTER = { breite: 416, hoehe: 260 };

export function G1Ansicht(p: { s: Sicht }) {
  const { s } = p;
  const st = useStand(s);
  useEntfallHinweis(s, st, "g1");
  const t = useSpielzeit(s, 1000);
  const inh = s.inh;
  const z = st.zustand;
  const offen = warteschlange(z, "g1");
  const [gewaehlt, waehle] = useAuswahl(offen.map((m) => m.id));
  /** Meldung, deren Drohnenbild geschlossen ist (B8; die Marke öffnet es wieder) */
  const [zu, setZu] = useState<string | null>(null);
  const m = gewaehlt ? inh.meldungen[gewaehlt] : null;
  const ms = gewaehlt ? z.meldungen[gewaehlt] : null;
  const wartet = !!gewaehlt && s.wartetAuf("g1_entscheid", gewaehlt);
  const start = inh.szenario.spieluhr.start;
  const gesperrt = !m || z.ende;
  const tLage = Math.floor(t);
  const lagebild = useMemo(() => lagebildZielmeldungen(inh, z, "g1", tLage), [inh, z, tLage]);
  const fx = useMemo(() => effekte(inh, z, bekannteZiele(inh, z, "g1")), [inh, z]);
  // Lage für das Live-Drohnenbild: immer der neueste Stand (der Takt des Bildes liest sie selbst)
  const lage = useRef<LiveLage>({ inh, z, effekte: fx });
  lage.current = { inh, z, effekte: fx };
  // Bilder der nächsten zwei Meldungen vorladen (Ebenen und Aufnahme), damit das Fenster sofort steht
  const man = useManifest();
  const naechste = offen.map((x) => x.id).filter((id) => id !== gewaehlt).slice(0, 2);
  useEffect(() => {
    if (!man) return;
    vorladen(naechste.flatMap((id) => [...(drohnenEbenen(man, id)?.dateien ?? []), drohnenbild(man, id)?.datei ?? ""]).filter(Boolean));
  }, [man, naechste.join(",")]);

  const oeffnen = (id: string | null) => {
    setZu(null); // Klick auf die Marke der offenen Meldung öffnet ihr Drohnenbild wieder
    if (id === gewaehlt) return;
    waehle(id);
  };
  const entscheiden = (entscheid: "annehmen" | "ablehnen") => {
    if (!gewaehlt) return;
    s.senden("g1_entscheid", { meldung: gewaehlt, entscheid });
    waehle(null);
  };

  const alter = m && ms ? Math.max(0, Math.round(t - ms.erschienen.t_s)) + (m.sensor.bildalter_s ?? 0) : 0;
  const name = (id: string) => zielName(inh, z, id, false);
  const marken = meldungsMarken(offen, gewaehlt, oeffnen, name);
  const fensterZu = !!m && zu === m.id;
  const fenster = m && !fensterZu ? {
    id: m.id, ...DROHNEN_FENSTER,
    inhalt: <LiveDrohnenFenster meldung={m} lage={() => lage.current} uhr={() => s.kartenUhr()} start={start} />,
    onSchliessen: () => setZu(m.id),
  } : null;

  return (
    <main class="inhalt ansicht-karte ansicht-g1">
      <section class="panel ohne-rand karten-feld" data-testid="g1-karte">
        <LagekarteAnsicht inh={inh} lagebild={lagebild} gewaehlt={gewaehlt}
          onWahl={(id) => offen.some((x) => x.id === id) && oeffnen(id)} hintergrund="topo" legende="ziele"
          uhr={() => s.kartenUhr()} effekte={fx} marken={marken} fenster={fenster}
          ecke={<KartenLagehinweise inh={inh} z={z} rolle="g1" />} />
      </section>

      <aside class="stapel meldungsfeld">
        <EingangLeiste anzahl={offen.length} testid="g1-offen" />
        {!m || !ms ? (
          <Panel titel="Meldung" klasse="flach">
            <div class="hinweistext" style="padding:6px 0" data-testid="g1-warten">
              {offen.length ? "Marke auf der Karte anklicken, um die Meldung zu öffnen." : "Warten auf ARGUS-Meldungen … Neue Meldungen erscheinen als Marke auf der Karte und öffnen sich hier mit dem Drohnenbild am Ort."}
            </div>
          </Panel>
        ) : (
          <>
            <section class="argus-box" data-testid="argus-box">
              <h3>
                <span>{inh.szenario.argus_system.name}</span>
                <span class="argus-meldung" data-testid="offene-meldung" data-meldung={m.id}>
                  <b>{zielName(inh, z, m.id)}</b> · {uhrzeit(start, ms.erschienen.t_s)} · Lage {feinlage(gemeldetePosition(inh, m), inh.karte)}
                  {ms.fastTrack && <span class="badge warn">Fast-Track</span>}
                </span>
              </h3>
              <table class="tabelle">
                <tbody>
                  <tr><th>Klasse</th><td><b>{m.argus.klasse}</b>{m.argus.einzeln && <span class="klein"> · {m.ziele.length} Fahrzeuge</span>}</td></tr>
                  <tr><th>Konfidenz</th><td><Konfidenz wert={m.argus.konfidenz} />{m.argus.einzeln && <div class="klein">einzeln {m.argus.einzeln.join(" / ")} %</div>}</td></tr>
                  <tr><th>Empfehlung</th><td><Empfehlung wert={m.argus.empfehlung} /></td></tr>
                  {m.argus.hinweis && <tr><th>Hinweis</th><td>{m.argus.hinweis}</td></tr>}
                </tbody>
              </table>
              {fensterZu && <div class="klein leise" data-testid="drohnenbild-zu">Drohnenbild geschlossen – die Marke „{name(m.id)}“ öffnet es wieder.</div>}
            </section>
            <Panel schritt={2} titel="Sensordaten Drohne" klasse="flach">
              <table class="tabelle" data-testid="sensordaten">
                <tbody>
                  <tr><th>Wärmebild</th><td>{m.sensor.waerme}</td></tr>
                  <tr><th>Bewegung</th><td>{m.sensor.bewegung}</td></tr>
                  <tr><th>Spuren</th><td>{m.sensor.spuren}</td></tr>
                  <tr><th>Kennzeichnung</th><td>{m.sensor.kennzeichnung}</td></tr>
                  <tr><th>Personen</th><td>{m.sensor.personen}</td></tr>
                  <tr><th>Meldung vor</th><td class="zahl">{alter} s</td></tr>
                  <tr><th>Sicht</th><td class="sichtleiste">
                    {m.bild.sicht.length === 0 ? <span>frei</span>
                      : m.bild.sicht.map((v) => <span class="badge">{SICHT_TEXT[v.art] ?? v.art} {v.lage === "Ziel" ? "am Ziel" : v.lage} {Math.round(v.anteil * 100)} %</span>)}
                  </td></tr>
                </tbody>
              </table>
            </Panel>
          </>
        )}
        <Panel schritt={3} titel="Entscheiden" klasse="flach">
          <div class="knopf-reihe">
            <AktionsKnopf s={s} wartet={wartet} gesperrt={gesperrt} klasse="gross" onClick={() => entscheiden("annehmen")} testid="g1-annehmen">
              ANNEHMEN<span class="unterzeile">als Ziel an die Zielprüfung</span>
            </AktionsKnopf>
            <AktionsKnopf s={s} wartet={wartet} gesperrt={gesperrt} klasse="gross" onClick={() => entscheiden("ablehnen")} testid="g1-ablehnen">
              ABLEHNEN<span class="unterzeile">kein Ziel</span>
            </AktionsKnopf>
          </div>
        </Panel>
        <div class="kleingedruckt" style="padding:0 2px" data-testid="kleingedrucktes">
          <div style="margin-bottom:3px">{inh.szenario.argus_system.herstellerangabe}</div>
          <div>{inh.szenario.argus_system.kleingedrucktes}</div>
        </div>
      </aside>
    </main>
  );
}
