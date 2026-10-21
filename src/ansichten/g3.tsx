// G3 Führung: bekommt die Empfehlungen von G2 und entscheidet FREIGABE, ABLEHNEN oder ZURÜCK AN G2.
// Nur G3 bekommt Lagemeldungen (Postfach mit „Gelesen“ – für die Auswertung: wann gelesen),
// gibt Lagehinweise an G1/G2 und schaltet Fast-Track.
//   ① Empfehlung wählen  ② entscheiden  · jederzeit: Lagemeldungen lesen, Lagehinweis geben
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { TEXT_MAX } from "../kern/ereignisse";
import { lagebildZielmeldungen } from "../kern/lagebild";
import { gemeldetePosition } from "../kern/regeln";
import { ENTSCHEID_TEXT, ERGEBNIS_TEXT, STUFE_TEXT, injectsFuer, verlauf, warteschlange, zielmeldung } from "../kern/sichten";
import { uhrzeit } from "../kern/uhr";
import type { InjectStand } from "../kern/zustand";
import type { Sitzung } from "../sitzung/sitzung";
import { AktionsKnopf, Konfidenz, Empfehlung, Leer, MeldungsEintrag, Panel } from "./gemeinsam/bausteine";
import { useAuswahl, useSpielzeit, useStand } from "./gemeinsam/hooks";
import { LagekarteAnsicht } from "./gemeinsam/lagekarte";
import { vorschauFuer } from "./g2";

function Postfach(p: { s: Sitzung; injects: InjectStand[] }) {
  const { s } = p;
  const inh = s.inh;
  const start = inh.szenario.spieluhr.start;
  const [offenId, setOffenId] = useState<string | null>(null);
  const neu = p.injects.filter((i) => !i.quittiert).length;
  return (
    <Panel titel="Lagemeldungen" liste testid="postfach"
      rechts={neu ? <span class="badge neu" data-testid="postfach-neu">{neu} neu</span> : <span class="badge">{p.injects.length}</span>}>
      {p.injects.length === 0 ? <div class="hinweistext">Meldungen von Brigade, Nachbarn und Kompanien erscheinen hier. Nur ihr bekommt sie.</div> : (
        <div class="stapel" style="gap:6px">
          {[...p.injects].reverse().map((i) => {
            const inj = inh.injects[i.id];
            const aufgeklappt = !i.quittiert || offenId === i.id;
            if (!aufgeklappt) {
              return (
                <div key={i.id} class="inject zu" data-inject={i.id} onClick={() => setOffenId(i.id)} title="Klick: ganzen Text zeigen">
                  <div class="kopfzeile" style="margin:0"><span>{uhrzeit(start, i.erschienen.t_s)} · {inj?.von}</span><span>gelesen ✓</span></div>
                  <div class="einzeilig">{inj?.text}</div>
                </div>
              );
            }
            return (
              <div key={i.id} class={`inject ${i.quittiert ? "" : "neu"}`} data-inject={i.id} onClick={() => i.quittiert && setOffenId(null)}>
                <div class="kopfzeile"><span>{uhrzeit(start, i.erschienen.t_s)} · {inj?.von}</span><span class="mono">{i.id}</span></div>
                <div class="text">{inj?.text}</div>
                {!i.quittiert && (
                  <div class="zeile zwischen" style="margin-top:7px">
                    <span class="klein sehr-leise">Bestätigt der Spielleitung, dass ihr die Meldung gelesen habt.</span>
                    <AktionsKnopf s={s} wartet={s.wartetAuf("inject_quittiert", i.id)} klasse="klein weiter" onClick={() => s.senden("inject_quittiert", { inject: i.id })}>
                      Gelesen
                    </AktionsKnopf>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

export function G3Ansicht(p: { s: Sitzung }) {
  const { s } = p;
  const st = useStand(s);
  const t = useSpielzeit(s, 1000);
  const inh = s.inh;
  const z = st.zustand;
  const start = inh.szenario.spieluhr.start;
  const offen = warteschlange(z, "g3");
  const [gewaehlt, waehle] = useAuswahl(offen.map((m) => m.id));
  const [bemerkung, setBemerkung] = useState("");
  const [hinweis, setHinweis] = useState("");
  const [an, setAn] = useState<{ g1: boolean; g2: boolean }>({ g1: true, g2: true });
  const ms = gewaehlt ? z.meldungen[gewaehlt] : null;
  const m = gewaehlt ? inh.meldungen[gewaehlt] : null;
  const wartet = !!gewaehlt && s.wartetAuf("g3_entscheid", gewaehlt);
  const injects = injectsFuer(inh, z, "g3");
  const gesperrt = !ms || z.ende;
  const lagebild = useMemo(() => lagebildZielmeldungen(inh, z, "g3"), [inh, z]);
  const historie = verlauf(z, "g3");
  const wm = ms?.g2?.wirkmittel;
  const bestandLeer = !!wm && z.bestand[wm] === 0;
  const vorschau = m && wm ? vorschauFuer(inh, gemeldetePosition(inh, m), wm, t) : null;

  // Neue Lagemeldung: kurzer Hinweis unten rechts (zusätzlich zum Postfach)
  const bekannt = useRef<number | null>(null);
  useEffect(() => {
    if (!st.geladen) return;
    if (bekannt.current !== null && injects.length > bekannt.current) {
      const neu = injects[injects.length - 1];
      s.hinweis("info", `Neue Lagemeldung von ${inh.injects[neu.id]?.von ?? "Brigade"} – siehe rechts`);
    }
    bekannt.current = injects.length;
  }, [injects.length, st.geladen]);

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
  const zm = gewaehlt ? zielmeldung(inh, z, gewaehlt) : null;

  return (
    <main class="inhalt ansicht-g3">
      <div class="stapel">
        <Panel schritt={1} titel="Empfehlungen von G2" rechts={<span class={`badge ${offen.length ? "neu" : ""}`} data-testid="g3-offen">{offen.length}</span>} liste stil="flex:1.3 1 0">
          {offen.length === 0 ? <Leer>Keine offene Empfehlung. Empfehlungen von G2 erscheinen hier.</Leer> : (
            <ul class="liste">
              {offen.map((x) => (
                <MeldungsEintrag key={x.id} inh={inh} st={x} aktiv={x.id === gewaehlt} onWahl={() => waehle(x.id)}
                  unter={<>G2: BEKÄMPFEN mit {inh.wirkmittel[x.g2?.wirkmittel ?? ""]?.kurz ?? "?"}{x.g2?.warnungen.length ? <span class="badge schlecht">⚠ Warnung</span> : null}</>} />
              ))}
            </ul>
          )}
        </Panel>
        <Panel titel="Verlauf" liste rechts={historie.length ? <span class="badge">{historie.length}</span> : null}>
          {historie.length === 0 ? <div class="hinweistext">Entschiedene Empfehlungen</div> : (
            <ul class="liste">
              {historie.map((x) => (
                <MeldungsEintrag key={x.id} inh={inh} st={x} gedimmt
                  unter={<>{uhrzeit(start, x.erschienen.t_s)} · {x.g3 ? ENTSCHEID_TEXT[x.g3.entscheid] : x.g2 ? `G2 ${ENTSCHEID_TEXT[x.g2.empfehlung]}` : ""} · {x.ergebnis ? ERGEBNIS_TEXT[x.ergebnis] : STUFE_TEXT[x.stufe]}</>} />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div class="stapel">
        <Panel schritt={2} titel={m ? `Entscheiden: ${m.id}` : "Entscheiden"} klasse="flach" testid="g3-entscheiden">
          {!ms || !zm ? <div class="hinweistext" style="padding:4px 0 6px">Warten auf Empfehlungen von G2 … Ohne eure FREIGABE wird nichts bekämpft.</div> : (
            <div class="entscheid-raster">
              <table class="tabelle">
                <tbody>
                  <tr><th>Ziel · Lage</th><td><b>{zm.zielNr}</b> · {zm.lage}</td></tr>
                  <tr><th>ARGUS</th><td>{zm.klasse}</td></tr>
                  <tr><th>Konfidenz</th><td style="max-width:170px"><Konfidenz wert={zm.konfidenz} /></td></tr>
                  <tr><th>ARGUS meint</th><td><Empfehlung wert={zm.argusEmpfehlung} /></td></tr>
                  <tr><th>Vermerk G1</th><td>{zm.fastTrack ? <span class="badge warn">Fast-Track – ohne G1</span> : zm.vermerkG1 ? <span class="zwei-zeilen" title={zm.vermerkG1}>{zm.vermerkG1}</span> : <span class="sehr-leise">kein Vermerk</span>}</td></tr>
                </tbody>
              </table>
              <div class="stapel" style="gap:6px">
                <table class="tabelle">
                  <tbody>
                    <tr><th>G2 empfiehlt</th><td><b style="color:#ff8f86">BEKÄMPFEN</b> mit {inh.wirkmittel[wm ?? ""]?.name ?? "?"}</td></tr>
                    <tr><th>Begründung</th><td>{ms.g2?.begruendung ? <span class="zwei-zeilen" title={ms.g2.begruendung}>{ms.g2.begruendung}</span> : <span class="sehr-leise">keine</span>}</td></tr>
                  </tbody>
                </table>
                {ms.g2?.warnungen.length
                  ? <div class="warnung" data-testid="g3-warnungen">{ms.g2.warnungen.map((w) => <div>⚠ {w}</div>)}<div class="klein" style="opacity:.8">Freigabe möglich, der Verstoß wird protokolliert.</div></div>
                  : <div class="wm-status ok">✓ keine Regelwarnung</div>}
                {bestandLeer && <div class="warnung">{inh.wirkmittel[wm!].kurz} aufgebraucht – ZURÜCK AN G2</div>}
              </div>
              <div class="entscheid-knoepfe">
                <input class="feld" placeholder="Bemerkung (freiwillig)" maxLength={TEXT_MAX.bemerkung} value={bemerkung}
                  onInput={(e) => setBemerkung((e.target as HTMLInputElement).value)} disabled={gesperrt} />
                <AktionsKnopf s={s} wartet={wartet} gesperrt={gesperrt || bestandLeer} klasse="gross toedlich" onClick={() => entscheiden("freigabe")} testid="g3-freigabe">
                  FREIGABE
                </AktionsKnopf>
                <div class="knopf-reihe">
                  <AktionsKnopf s={s} wartet={wartet} gesperrt={gesperrt} onClick={() => entscheiden("ablehnen")} testid="g3-ablehnen">ABLEHNEN</AktionsKnopf>
                  <AktionsKnopf s={s} wartet={wartet} gesperrt={gesperrt} onClick={() => entscheiden("zurueck")} testid="g3-zurueck">ZURÜCK AN G2</AktionsKnopf>
                </div>
              </div>
            </div>
          )}
        </Panel>
        <Panel titel="Lagekarte" klasse="ohne-rand" rechts={<span class="klein sehr-leise">Zeichen = Ziele mit Empfehlung von G2 · Klick wählt</span>}>
          <LagekarteAnsicht inh={inh} lagebild={lagebild} vorschau={vorschau} gewaehlt={gewaehlt}
            onWahl={(id) => offen.some((x) => x.id === id) && waehle(id)} hintergrund="topo" legende="ziele" />
        </Panel>
      </div>

      <div class="stapel">
        <Postfach s={s} injects={injects} />
        <Panel titel="Lagehinweis an G1 und G2" klasse="flach">
          <div class="stapel" style="gap:7px">
            <textarea class="feld" rows={2} maxLength={TEXT_MAX.lagehinweis} placeholder="Hinweis an G1 und G2 (bis zwei Zeilen)" value={hinweis}
              onInput={(e) => setHinweis((e.target as HTMLTextAreaElement).value)} style="resize:none" data-testid="g3-lagehinweis" />
            <div class="zeile zwischen">
              <div class="zeile">
                <span class="klein sehr-leise">an</span>
                {(["g1", "g2"] as const).map((r) => (
                  <label class="zeile klein" key={r} style="gap:4px"><input type="checkbox" checked={an[r]} onChange={() => setAn({ ...an, [r]: !an[r] })} />{r.toUpperCase()}</label>
                ))}
              </div>
              <AktionsKnopf s={s} wartet={s.wartetAuf("lagehinweis")} gesperrt={!hinweis.trim() || (!an.g1 && !an.g2)} onClick={hinweisSenden}>Senden</AktionsKnopf>
            </div>
            {z.lagehinweise.length > 0 && (
              <div class="klein leise" data-testid="g3-gesendet" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                Zuletzt gesendet {uhrzeit(start, z.lagehinweise[z.lagehinweise.length - 1].t_s)} an {z.lagehinweise[z.lagehinweise.length - 1].an.map((r) => r.toUpperCase()).join(", ")}: {z.lagehinweise[z.lagehinweise.length - 1].text}
                {z.lagehinweise.length > 1 ? ` (insgesamt ${z.lagehinweise.length})` : ""}
              </div>
            )}
          </div>
        </Panel>
        <Panel titel="Fast-Track" klasse="flach" rechts={<span class={`badge ${z.fastTrack ? "warn" : ""}`} data-testid="fasttrack-status">{z.fastTrack ? "EIN" : "AUS"}</span>}>
          <div class="zeile zwischen" style="flex-wrap:nowrap">
            <span class="klein leise">Meldungen ab {inh.regeln.fast_track.schwelle} % mit BEKÄMPFEN gehen ohne Prüfung durch G1 direkt an G2.</span>
            <AktionsKnopf s={s} wartet={s.wartetAuf("fast_track")} gesperrt={z.ende} onClick={() => s.senden("fast_track", { an: !z.fastTrack })}>
              {z.fastTrack ? "ausschalten" : "einschalten"}
            </AktionsKnopf>
          </div>
        </Panel>
      </div>
    </main>
  );
}
