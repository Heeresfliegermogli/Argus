// G1 Aufklärung: sieht jede ARGUS-Meldung zuerst – Drohnenbild, ARGUS-Daten, Sensordaten,
// Kleingedrucktes – und entscheidet ANNEHMEN oder ABLEHNEN mit einem Vermerk.
import { useState } from "preact/hooks";
import { feinlage } from "../kern/geometrie";
import { gemeldetePosition } from "../kern/regeln";
import { ERGEBNIS_TEXT, STUFE_TEXT, verlauf, warteschlange } from "../kern/sichten";
import { uhrzeit } from "../kern/uhr";
import { TEXT_MAX } from "../kern/ereignisse";
import type { Sitzung } from "../sitzung/sitzung";
import {
  AktionsKnopf, Empfehlung, Konfidenz, Lagehinweise, Leer, MeldungsEintrag, Panel,
} from "./gemeinsam/bausteine";
import { DrohnenbildAnzeige } from "./gemeinsam/drohnenbild";
import { useAuswahl, useSpielzeit, useStand } from "./gemeinsam/hooks";

const SICHT_TEXT: Record<string, string> = {
  wolke: "Wolke", rauch: "Rauch", dunst: "Dunst", baeume: "Bäume", tarnnetz: "Tarnnetz", stoerung: "Bildstörung", unschaerfe: "Unschärfe",
};

export function G1Ansicht(p: { s: Sitzung }) {
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

  const entscheiden = (entscheid: "annehmen" | "ablehnen") => {
    if (!gewaehlt) return;
    s.senden("g1_entscheid", { meldung: gewaehlt, entscheid, vermerk: vermerk.trim() || undefined });
    setVermerk("");
  };

  const bildalter = m && ms ? Math.max(0, Math.round(t - ms.erschienen.t_s)) + (m.sensor.bildalter_s ?? 0) : 0;

  return (
    <main class="inhalt spalten-3">
      <div class="stapel">
        <Panel titel="Eingang ARGUS" rechts={<span class="badge" data-testid="g1-offen">{offen.length}</span>} stil="flex:1 1 55%">
          {offen.length === 0 ? <Leer>keine offenen Meldungen</Leer> : (
            <ul class="liste">
              {offen.map((x) => <MeldungsEintrag key={x.id} inh={inh} st={x} aktiv={x.id === gewaehlt} onWahl={() => waehle(x.id)} />)}
            </ul>
          )}
        </Panel>
        <Panel titel="Verlauf" stil="flex:1 1 45%">
          <ul class="liste">
            {verlauf(z, "g1").map((x) => (
              <MeldungsEintrag key={x.id} inh={inh} st={x} gedimmt
                unter={<>{uhrzeit(start, x.erschienen.t_s)} · {x.ergebnis ? ERGEBNIS_TEXT[x.ergebnis] : x.fastTrack && !x.g1 ? "Fast-Track an G1 vorbei" : STUFE_TEXT[x.stufe]}</>} />
            ))}
          </ul>
        </Panel>
      </div>

      <Panel titel={m ? `Meldung ${m.id} · ${uhrzeit(start, ms!.erschienen.t_s)} · ${feinlage(gemeldetePosition(inh, m), inh.karte)}` : "Meldung"}>
        {!m || !ms ? <Leer>Warten auf ARGUS-Meldungen …</Leer> : (
          <div class="stapel">
            <DrohnenbildAnzeige meldung={m} uhr={uhrzeit(start, ms.erschienen.t_s)} bildalter={bildalter}
              naechste={offen.filter((x) => x.id !== m.id).map((x) => x.id)} />
            <div class="klein leise" style="margin-top:-6px">
              {m.bild.beschreibung}
              {m.bild.sicht.length > 0 && <span> · Sicht: {m.bild.sicht.map((v) => `${SICHT_TEXT[v.art] ?? v.art} ${Math.round(v.anteil * 100)} % (${v.lage})`).join(", ")}</span>}
            </div>
            <div class="zeile" style="align-items:stretch;gap:10px">
              <div class="argus-box" style="flex:1 1 50%">
                <h3>{inh.szenario.argus_system.name}</h3>
                <table class="tabelle">
                  <tbody>
                    <tr><th>Klasse</th><td><b>{m.argus.klasse}</b>{m.argus.einzeln && <span class="leise"> ({m.ziele.length} Fahrzeuge: {m.argus.einzeln.join(" / ")} %)</span>}</td></tr>
                    <tr><th>Konfidenz</th><td><Konfidenz wert={m.argus.konfidenz} /></td></tr>
                    <tr><th>Empfehlung</th><td><Empfehlung wert={m.argus.empfehlung} /></td></tr>
                    {m.argus.hinweis && <tr><th>Hinweis</th><td>{m.argus.hinweis}</td></tr>}
                  </tbody>
                </table>
              </div>
              <div class="panel" style="flex:1 1 50%;padding:10px 12px">
                <h2 style="margin-bottom:6px">Sensordaten Drohne</h2>
                <table class="tabelle">
                  <tbody>
                    <tr><th>Wärmebild</th><td>{m.sensor.waerme}</td></tr>
                    <tr><th>Bewegung</th><td>{m.sensor.bewegung}</td></tr>
                    <tr><th>Spuren</th><td>{m.sensor.spuren}</td></tr>
                    <tr><th>Kennzeichnung</th><td>{m.sensor.kennzeichnung}</td></tr>
                    <tr><th>Personen</th><td>{m.sensor.personen}</td></tr>
                    <tr><th>Bildalter</th><td class="mono">{bildalter} s</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Panel>

      <div class="stapel">
        <Panel titel="Entscheidung G1" klasse="flach">
          <div class="stapel">
            <input class="feld" placeholder="Vermerk an G2 (eine Zeile, optional)" maxLength={TEXT_MAX.vermerk} value={vermerk}
              onInput={(e) => setVermerk((e.target as HTMLInputElement).value)} disabled={!m} data-testid="g1-vermerk" />
            <div class="knopf-reihe">
              <AktionsKnopf s={s} wartet={wartet} gesperrt={!m} klasse="gross gut" onClick={() => entscheiden("annehmen")}>ANNEHMEN</AktionsKnopf>
              <AktionsKnopf s={s} wartet={wartet} gesperrt={!m} klasse="gross schlecht" onClick={() => entscheiden("ablehnen")}>ABLEHNEN</AktionsKnopf>
            </div>
            <div class="klein sehr-leise">ANNEHMEN schickt die Zielmeldung an G2. G2 und G3 sehen weder Bild noch Sensordaten.</div>
          </div>
        </Panel>
        <Panel titel="ARGUS – Herstellerangaben" klasse="flach">
          <div class="klein leise" style="margin-bottom:6px">{inh.szenario.argus_system.herstellerangabe}</div>
          <div class="kleingedruckt">{inh.szenario.argus_system.kleingedrucktes}</div>
        </Panel>
        <Lagehinweise inh={inh} z={z} rolle="g1" />
      </div>
    </main>
  );
}
