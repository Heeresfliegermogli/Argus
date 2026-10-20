// G3 Führung: bekommt die Empfehlungen von G2 und entscheidet FREIGABE, ABLEHNEN oder ZURÜCK AN G2.
// Nur G3 bekommt Lage-Injects (mit Quittieren), gibt Lagehinweise an G1/G2 und schaltet Fast-Track.
import { useState } from "preact/hooks";
import { TEXT_MAX } from "../kern/ereignisse";
import { ENTSCHEID_TEXT, ERGEBNIS_TEXT, STUFE_TEXT, injectsFuer, verlauf, warteschlange, zielmeldung } from "../kern/sichten";
import { uhrzeit } from "../kern/uhr";
import type { Sitzung } from "../sitzung/sitzung";
import { AktionsKnopf, Leer, MeldungsEintrag, Panel, Platzhalter, ZielmeldungKarte } from "./gemeinsam/bausteine";
import { useAuswahl, useStand } from "./gemeinsam/hooks";

export function G3Ansicht(p: { s: Sitzung }) {
  const { s } = p;
  const st = useStand(s);
  const inh = s.inh;
  const z = st.zustand;
  const start = inh.szenario.spieluhr.start;
  const offen = warteschlange(z, "g3");
  const [gewaehlt, waehle] = useAuswahl(offen.map((m) => m.id));
  const [bemerkung, setBemerkung] = useState("");
  const [hinweis, setHinweis] = useState("");
  const [an, setAn] = useState<{ g1: boolean; g2: boolean }>({ g1: true, g2: true });
  const ms = gewaehlt ? z.meldungen[gewaehlt] : null;
  const wartet = !!gewaehlt && s.wartetAuf("g3_entscheid", gewaehlt);
  const injects = injectsFuer(inh, z, "g3");
  const unquittiert = injects.filter((i) => !i.quittiert).length;

  const entscheiden = (entscheid: "freigabe" | "ablehnen" | "zurueck") => {
    if (!gewaehlt) return;
    s.senden("g3_entscheid", { meldung: gewaehlt, entscheid, bemerkung: bemerkung.trim() || undefined });
    setBemerkung("");
  };
  const hinweisSenden = () => {
    const empf = (["g1", "g2"] as const).filter((r) => an[r]);
    if (!hinweis.trim() || !empf.length) return;
    s.senden("lagehinweis", { text: hinweis.trim(), an: [...empf] });
    setHinweis("");
  };

  return (
    <main class="inhalt spalten-3">
      <div class="stapel">
        <Panel titel="Empfehlungen G2" rechts={<span class="badge" data-testid="g3-offen">{offen.length}</span>} stil="flex:1 1 55%">
          {offen.length === 0 ? <Leer>keine offenen Empfehlungen</Leer> : (
            <ul class="liste">
              {offen.map((x) => (
                <MeldungsEintrag key={x.id} inh={inh} st={x} aktiv={x.id === gewaehlt} onWahl={() => waehle(x.id)}
                  unter={<>G2: BEKÄMPFEN mit {inh.wirkmittel[x.g2?.wirkmittel ?? ""]?.kurz ?? "?"}{x.g2?.warnungen.length ? " ⚠" : ""}</>} />
              ))}
            </ul>
          )}
        </Panel>
        <Panel titel="Verlauf" stil="flex:1 1 45%">
          <ul class="liste">
            {verlauf(z, "g3").map((x) => (
              <MeldungsEintrag key={x.id} inh={inh} st={x} gedimmt
                unter={<>{uhrzeit(start, x.erschienen.t_s)} · {x.g3 ? ENTSCHEID_TEXT[x.g3.entscheid] : x.g2 ? `G2 ${ENTSCHEID_TEXT[x.g2.empfehlung]}` : ""} · {x.ergebnis ? ERGEBNIS_TEXT[x.ergebnis] : STUFE_TEXT[x.stufe]}</>} />
            ))}
          </ul>
        </Panel>
      </div>

      <div class="stapel">
        <Panel titel="Empfehlung zur Entscheidung" klasse="flach">
          {!ms || !gewaehlt ? <Leer>Warten auf Empfehlungen von G2 …</Leer> : (
            <div class="stapel">
              <div class="zeile" style="align-items:flex-start;gap:18px">
                <div style="flex:1 1 55%"><ZielmeldungKarte zm={zielmeldung(inh, z, gewaehlt)} /></div>
                <div style="flex:1 1 45%" class="stapel">
                  <table class="tabelle">
                    <tbody>
                      <tr><th>Empfehlung G2</th><td><b>BEKÄMPFEN</b> mit {inh.wirkmittel[ms.g2?.wirkmittel ?? ""]?.name ?? "?"}</td></tr>
                      <tr><th>Begründung</th><td>{ms.g2?.begruendung ?? <span class="sehr-leise">–</span>}</td></tr>
                    </tbody>
                  </table>
                  {ms.g2?.warnungen.map((w) => <div class="warnung">⚠ {w}</div>)}
                </div>
              </div>
              <input class="feld" placeholder="Bemerkung (optional)" maxLength={TEXT_MAX.bemerkung} value={bemerkung}
                onInput={(e) => setBemerkung((e.target as HTMLInputElement).value)} />
              <div class="knopf-reihe">
                <AktionsKnopf s={s} wartet={wartet} klasse="gross schlecht" onClick={() => entscheiden("freigabe")}>FREIGABE</AktionsKnopf>
                <AktionsKnopf s={s} wartet={wartet} klasse="gross" onClick={() => entscheiden("ablehnen")}>ABLEHNEN</AktionsKnopf>
                <AktionsKnopf s={s} wartet={wartet} klasse="gross warn" onClick={() => entscheiden("zurueck")}>ZURÜCK AN G2</AktionsKnopf>
              </div>
            </div>
          )}
        </Panel>
        <Platzhalter titel="Lagekarte (wie G2)" text="folgt in Schritt 5/6" stil="flex:1;min-height:160px" />
      </div>

      <div class="stapel">
        <Panel titel="Lagemeldungen" rechts={unquittiert ? <span class="badge warn">{unquittiert} neu</span> : <span class="badge">{injects.length}</span>}>
          {injects.length === 0 ? <Leer>keine Lagemeldungen</Leer> : (
            <div class="stapel" style="gap:8px">
              {[...injects].reverse().map((i) => {
                const inj = inh.injects[i.id];
                return (
                  <div key={i.id} class={`inject ${i.quittiert ? "" : "neu"}`} data-inject={i.id}>
                    <div class="kopfzeile"><span>{uhrzeit(start, i.erschienen.t_s)} · {inj?.von}</span><span class="mono">{i.id}</span></div>
                    <div>{inj?.text}</div>
                    <div class="zeile zwischen" style="margin-top:6px">
                      {i.quittiert ? <span class="klein sehr-leise">quittiert {uhrzeit(start, i.quittiert.t_s)}</span> : (
                        <AktionsKnopf s={s} wartet={s.wartetAuf("inject_quittiert", i.id)} klasse="klein" onClick={() => s.senden("inject_quittiert", { inject: i.id })}>
                          Gelesen – quittieren
                        </AktionsKnopf>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
        <Panel titel="Lagehinweis an G1/G2" klasse="flach">
          <div class="stapel" style="gap:8px">
            <textarea class="feld" rows={2} maxLength={TEXT_MAX.lagehinweis} placeholder="z. B. Feuerverbot Feldweg Süd" value={hinweis}
              onInput={(e) => setHinweis((e.target as HTMLTextAreaElement).value)} style="resize:none" />
            <div class="zeile zwischen">
              <div class="zeile">
                {(["g1", "g2"] as const).map((r) => (
                  <label class="zeile klein" key={r}><input type="checkbox" checked={an[r]} onChange={() => setAn({ ...an, [r]: !an[r] })} />{r.toUpperCase()}</label>
                ))}
              </div>
              <AktionsKnopf s={s} wartet={s.wartetAuf("lagehinweis")} gesperrt={!hinweis.trim() || (!an.g1 && !an.g2)} onClick={hinweisSenden}>Senden</AktionsKnopf>
            </div>
          </div>
        </Panel>
        <Panel titel="Fast-Track" klasse="flach" rechts={<span class={`badge ${z.fastTrack ? "warn" : ""}`}>{z.fastTrack ? "EIN" : "AUS"}</span>}>
          <div class="zeile zwischen">
            <span class="klein leise">Ab {inh.regeln.fast_track.schwelle} % mit BEKÄMPFEN direkt an G2, ohne G1.</span>
            <AktionsKnopf s={s} wartet={s.wartetAuf("fast_track")} klasse={z.fastTrack ? "" : "warn"} onClick={() => s.senden("fast_track", { an: !z.fastTrack })}>
              {z.fastTrack ? "ausschalten" : "einschalten"}
            </AktionsKnopf>
          </div>
        </Panel>
      </div>
    </main>
  );
}
