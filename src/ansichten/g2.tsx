// G2 Zielprüfung: bekommt nur die Zielmeldung, prüft die Einsatzregeln (R2, R3, Einsatzbereich)
// und gibt G3 eine Empfehlung: BEKÄMPFEN mit Wirkmittel, BEOBACHTEN oder NICHT BEKÄMPFEN.
import { useState } from "preact/hooks";
import { TEXT_MAX } from "../kern/ereignisse";
import { gemeldetePosition, pruefeWirkmittel } from "../kern/regeln";
import { ENTSCHEID_TEXT, ERGEBNIS_TEXT, STUFE_TEXT, verlauf, warteschlange, zielmeldung } from "../kern/sichten";
import { uhrzeit } from "../kern/uhr";
import type { Sitzung } from "../sitzung/sitzung";
import {
  AktionsKnopf, Lagehinweise, Leer, MeldungsEintrag, Panel, Platzhalter, ZielmeldungKarte,
} from "./gemeinsam/bausteine";
import { useAuswahl, useSpielzeit, useStand } from "./gemeinsam/hooks";

export function G2Ansicht(p: { s: Sitzung }) {
  const { s } = p;
  const st = useStand(s);
  const t = useSpielzeit(s, 1000);
  const inh = s.inh;
  const z = st.zustand;
  const offen = warteschlange(z, "g2");
  const [gewaehlt, waehle] = useAuswahl(offen.map((m) => m.id));
  const [wm, setWm] = useState<string | null>(null);
  const [begruendung, setBegruendung] = useState("");
  const m = gewaehlt ? inh.meldungen[gewaehlt] : null;
  const wartet = !!gewaehlt && s.wartetAuf("g2_empfehlung", gewaehlt);
  const start = inh.szenario.spieluhr.start;
  const pos = m ? gemeldetePosition(inh, m) : null;

  const empfehlen = (empfehlung: "bekaempfen" | "beobachten" | "nicht_bekaempfen") => {
    if (!gewaehlt) return;
    s.senden("g2_empfehlung", {
      meldung: gewaehlt, empfehlung, wirkmittel: empfehlung === "bekaempfen" ? wm ?? undefined : undefined,
      begruendung: begruendung.trim() || undefined,
    });
    setBegruendung("");
    setWm(null);
  };

  return (
    <main class="inhalt spalten-3">
      <div class="stapel">
        <Panel titel="Zielmeldungen" rechts={<span class="badge" data-testid="g2-offen">{offen.length}</span>} stil="flex:1 1 55%">
          {offen.length === 0 ? <Leer>keine offenen Zielmeldungen</Leer> : (
            <ul class="liste">
              {offen.map((x) => <MeldungsEintrag key={x.id} inh={inh} st={x} aktiv={x.id === gewaehlt} onWahl={() => waehle(x.id)} />)}
            </ul>
          )}
        </Panel>
        <Panel titel="Verlauf" stil="flex:1 1 45%">
          <ul class="liste">
            {verlauf(z, "g2").map((x) => (
              <MeldungsEintrag key={x.id} inh={inh} st={x} gedimmt
                unter={<>{uhrzeit(start, x.erschienen.t_s)} · {x.g2 ? ENTSCHEID_TEXT[x.g2.empfehlung] : ""} {x.ergebnis ? `· ${ERGEBNIS_TEXT[x.ergebnis]}` : `· ${STUFE_TEXT[x.stufe]}`}</>} />
            ))}
          </ul>
        </Panel>
      </div>

      <div class="stapel">
        <Panel titel="Zielmeldung" klasse="flach">
          {!m || !gewaehlt ? <Leer>Warten auf Zielmeldungen von G1 …</Leer> : <ZielmeldungKarte zm={zielmeldung(inh, z, gewaehlt)} />}
        </Panel>
        <Platzhalter titel="Lagekarte mit Planquadraten, NS-01, EZ-01 und Wirkradius-Vorschau" text="folgt in Schritt 5/6" stil="flex:1;min-height:180px" />
      </div>

      <div class="stapel">
        <Panel titel="Wirkmittel und Einsatzregeln" klasse="flach">
          {!m || !pos ? <Leer>keine Zielmeldung gewählt</Leer> : (
            <div class="stapel" style="gap:6px">
              {Object.values(inh.wirkmittel).map((w) => {
                const pr = pruefeWirkmittel(inh, pos, w.id, t);
                const bestand = z.bestand[w.id];
                const leer = bestand === 0;
                return (
                  <label key={w.id} class={`wahl ${wm === w.id ? "gewaehlt" : ""}`} data-wm={w.id}>
                    <input type="radio" name="wm" checked={wm === w.id} disabled={leer} onChange={() => setWm(w.id)} />
                    <div style="flex:1">
                      <div class="zeile zwischen"><b>{w.name}</b><span class="mono klein">{bestand === null ? "∞" : bestand}</span></div>
                      <div class="klein leise">Wirkradius {w.wirkradius_m} m · Vorlauf {w.vorlauf_s} s</div>
                      {pr.zulaessig
                        ? <div class="klein" style="color:var(--gut)">keine Warnung</div>
                        : pr.verstoesse.map((v) => <div class="klein" style="color:#f0b2ac">⚠ {v.regel}: {v.text}</div>)}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </Panel>
        <Panel titel="Empfehlung an G3" klasse="flach">
          <div class="stapel">
            <input class="feld" placeholder="Begründung (eine Zeile, optional)" maxLength={TEXT_MAX.begruendung} value={begruendung}
              onInput={(e) => setBegruendung((e.target as HTMLInputElement).value)} disabled={!m} />
            <AktionsKnopf s={s} wartet={wartet} gesperrt={!m || !wm} klasse="gross schlecht" onClick={() => empfehlen("bekaempfen")}
              titel={!wm ? "zuerst Wirkmittel wählen" : undefined}>
              BEKÄMPFEN{wm ? ` mit ${inh.wirkmittel[wm].kurz}` : ""}
            </AktionsKnopf>
            <div class="knopf-reihe">
              <AktionsKnopf s={s} wartet={wartet} gesperrt={!m} klasse="warn" onClick={() => empfehlen("beobachten")}>BEOBACHTEN</AktionsKnopf>
              <AktionsKnopf s={s} wartet={wartet} gesperrt={!m} onClick={() => empfehlen("nicht_bekaempfen")}>NICHT BEKÄMPFEN</AktionsKnopf>
            </div>
          </div>
        </Panel>
        <Lagehinweise inh={inh} z={z} rolle="g2" />
      </div>
    </main>
  );
}
