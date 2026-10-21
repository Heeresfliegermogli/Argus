// G1 Aufklärung: sieht jede ARGUS-Meldung zuerst – großes Drohnenbild mit ARGUS-Markierung,
// ARGUS-Daten, Sensordaten, Kleingedrucktes – und entscheidet ANNEHMEN oder ABLEHNEN mit Vermerk.
//   ① Meldung wählen (Eingang)  ② Bild und Daten prüfen  ③ entscheiden
import { useState } from "preact/hooks";
import { feinlage } from "../kern/geometrie";
import { gemeldetePosition } from "../kern/regeln";
import { ERGEBNIS_TEXT, STUFE_TEXT, verlauf, warteschlange } from "../kern/sichten";
import { uhrzeit } from "../kern/uhr";
import { TEXT_MAX } from "../kern/ereignisse";
import type { Sicht } from "../sitzung/sicht";
import {
  AktionsKnopf, Empfehlung, Konfidenz, Lagehinweise, Leer, MeldungsEintrag, Panel,
} from "./gemeinsam/bausteine";
import { DrohnenbildAnzeige } from "./gemeinsam/drohnenbild";
import { useAuswahl, useSpielzeit, useStand } from "./gemeinsam/hooks";

const SICHT_TEXT: Record<string, string> = {
  wolke: "Wolke", rauch: "Rauch", dunst: "Dunst", baeume: "Bäume", tarnnetz: "Tarnnetz", stoerung: "Bildstörung", unschaerfe: "Unschärfe",
};

export function G1Ansicht(p: { s: Sicht }) {
  const { s } = p;
  const st = useStand(s);
  const t = useSpielzeit(s, 1000);
  const inh = s.inh;
  const z = st.zustand;
  const offen = warteschlange(z, "g1");
  const [gewaehlt, waehle] = useAuswahl(offen.map((m) => m.id));
  const [vermerk, setVermerk] = useState("");
  const m = gewaehlt ? inh.meldungen[gewaehlt] : null;
  const ms = gewaehlt ? z.meldungen[gewaehlt] : null;
  const wartet = !!gewaehlt && s.wartetAuf("g1_entscheid", gewaehlt);
  const start = inh.szenario.spieluhr.start;
  const gesperrt = !m || z.ende;

  const entscheiden = (entscheid: "annehmen" | "ablehnen") => {
    if (!gewaehlt) return;
    s.senden("g1_entscheid", { meldung: gewaehlt, entscheid, vermerk: vermerk.trim() || undefined });
    setVermerk("");
  };

  const bildalter = m && ms ? Math.max(0, Math.round(t - ms.erschienen.t_s)) + (m.sensor.bildalter_s ?? 0) : 0;
  const historie = verlauf(z, "g1");

  return (
    <main class="inhalt ansicht-g1">
      <div class="stapel">
        <Panel schritt={1} titel="Eingang ARGUS" rechts={<span class={`badge ${offen.length ? "neu" : ""}`} data-testid="g1-offen">{offen.length}</span>} liste stil="flex:1.2 1 0">
          {offen.length === 0 ? <Leer>Keine offene Meldung. Neue ARGUS-Meldungen erscheinen hier.</Leer> : (
            <ul class="liste">
              {offen.map((x) => <MeldungsEintrag key={x.id} inh={inh} st={x} aktiv={x.id === gewaehlt} onWahl={() => waehle(x.id)} />)}
            </ul>
          )}
        </Panel>
        <Lagehinweise inh={inh} z={z} rolle="g1" />
        <Panel titel="Verlauf" liste rechts={historie.length ? <span class="badge">{historie.length}</span> : null}>
          {historie.length === 0 ? <div class="hinweistext">Bearbeitete Meldungen</div> : (
            <ul class="liste">
              {historie.map((x) => (
                <MeldungsEintrag key={x.id} inh={inh} st={x} gedimmt
                  unter={<>{uhrzeit(start, x.erschienen.t_s)} · {x.ergebnis ? ERGEBNIS_TEXT[x.ergebnis] : x.fastTrack && !x.g1 ? "Fast-Track, an G1 vorbei" : STUFE_TEXT[x.stufe]}</>} />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel schritt={2} testid="g1-bildfeld"
        titel={m && ms ? <>Meldung {m.id} prüfen <span class="leise" style="font-weight:500">· {uhrzeit(start, ms.erschienen.t_s)} · Lage {feinlage(gemeldetePosition(inh, m), inh.karte)}</span></> : "Meldung prüfen"}
        rechts={ms?.fastTrack ? <span class="badge warn">Fast-Track</span> : null}>
        {!m || !ms ? (
          <div class="stapel" style="height:100%;justify-content:center">
            <Leer>Warten auf ARGUS-Meldungen … Das Drohnenbild erscheint hier, sobald links unter ① eine Meldung steht.</Leer>
          </div>
        ) : (
          <div>
            <DrohnenbildAnzeige meldung={m} uhr={uhrzeit(start, ms.erschienen.t_s)} bildalter={bildalter}
              naechste={offen.filter((x) => x.id !== m.id).map((x) => x.id)} />
            <div class="sichtleiste">
              {m.bild.sicht.length === 0 ? <span>Sicht frei</span> : <>
                <span>Sicht gestört:</span>
                {m.bild.sicht.map((v) => <span class="badge">{SICHT_TEXT[v.art] ?? v.art} {v.lage === "Ziel" ? "am Ziel" : v.lage} {Math.round(v.anteil * 100)} %</span>)}
              </>}
            </div>
          </div>
        )}
      </Panel>

      <div class="stapel">
        <section class="argus-box" data-testid="argus-box">
          <h3><span>{inh.szenario.argus_system.name}</span><span class="mono" style="font-weight:500">{m?.id ?? ""}</span></h3>
          {!m ? <div class="klein sehr-leise">keine Meldung gewählt</div> : (
            <table class="tabelle">
              <tbody>
                <tr><th>Klasse</th><td><b>{m.argus.klasse}</b>{m.argus.einzeln && <span class="klein"> · {m.ziele.length} Fahrzeuge</span>}</td></tr>
                <tr><th>Konfidenz</th><td><Konfidenz wert={m.argus.konfidenz} />{m.argus.einzeln && <div class="klein">einzeln {m.argus.einzeln.join(" / ")} %</div>}</td></tr>
                <tr><th>Empfehlung</th><td><Empfehlung wert={m.argus.empfehlung} /></td></tr>
                {m.argus.hinweis && <tr><th>Hinweis</th><td>{m.argus.hinweis}</td></tr>}
              </tbody>
            </table>
          )}
        </section>
        <Panel titel="Sensordaten Drohne" klasse="flach">
          {!m ? <div class="klein sehr-leise">–</div> : (
            <table class="tabelle" data-testid="sensordaten">
              <tbody>
                <tr><th>Wärmebild</th><td>{m.sensor.waerme}</td></tr>
                <tr><th>Bewegung</th><td>{m.sensor.bewegung}</td></tr>
                <tr><th>Spuren</th><td>{m.sensor.spuren}</td></tr>
                <tr><th>Kennzeichnung</th><td>{m.sensor.kennzeichnung}</td></tr>
                <tr><th>Personen</th><td>{m.sensor.personen}</td></tr>
                <tr><th>Bildalter</th><td class="zahl">{bildalter} s</td></tr>
              </tbody>
            </table>
          )}
        </Panel>
        <Panel schritt={3} titel="Entscheidung G1" klasse="flach">
          <div class="stapel" style="gap:8px">
            <input class="feld" placeholder="Vermerk an G2 (eine Zeile, freiwillig)" maxLength={TEXT_MAX.vermerk} value={vermerk}
              onInput={(e) => setVermerk((e.target as HTMLInputElement).value)} disabled={gesperrt} data-testid="g1-vermerk"
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} />
            <div class="knopf-reihe">
              <AktionsKnopf s={s} wartet={wartet} gesperrt={gesperrt} klasse="gross" onClick={() => entscheiden("annehmen")} testid="g1-annehmen">
                ANNEHMEN<span class="unterzeile">als Ziel an G2</span>
              </AktionsKnopf>
              <AktionsKnopf s={s} wartet={wartet} gesperrt={gesperrt} klasse="gross" onClick={() => entscheiden("ablehnen")} testid="g1-ablehnen">
                ABLEHNEN<span class="unterzeile">kein Ziel</span>
              </AktionsKnopf>
            </div>
          </div>
        </Panel>
        <div class="kleingedruckt" style="padding:0 2px" data-testid="kleingedrucktes">
          <div style="margin-bottom:3px">{inh.szenario.argus_system.herstellerangabe}</div>
          <div>{inh.szenario.argus_system.kleingedrucktes}</div>
        </div>
      </div>
    </main>
  );
}
