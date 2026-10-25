// Führung (intern g3; Schritt 6b): Die Karte ist die Arbeitsfläche. Empfehlungen der Zielprüfung stehen als Marke
// „Ziel 7“ am Ziel, freigegebene Wirkungen mit der Spielzeit des Einschlags. Rechts: Eingang als Zahl, Entscheidung
// FREIGABE, ABLEHNEN oder ZURÜCK AN ZIELPRÜFUNG, das Postfach der Lagemeldungen (nur die Führung, „Gelesen“ – für die
// Auswertung: wann gelesen), Lagehinweis an Aufklärung und Zielprüfung und Fast-Track.
//   ① Empfehlung öffnen (Marke; die älteste öffnet sich von selbst)  ② entscheiden
//   · jederzeit: Lagemeldungen lesen, Lagehinweis geben
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { bekannteZiele, effekte } from "../kern/effekte";
import { TEXT_MAX } from "../kern/ereignisse";
import { lagebildZielmeldungen } from "../kern/lagebild";
import { injectsFuer, warteschlange, zielmeldung } from "../kern/sichten";
import { uhrzeit } from "../kern/uhr";
import { zielName } from "../kern/zielnummern";
import { ROLLEN_NAME } from "../kern/sichten";
import type { InjectStand } from "../kern/zustand";
import type { Sicht } from "../sitzung/sicht";
import { AktionsKnopf, EingangLeiste, Panel, ZielmeldungKompakt } from "./gemeinsam/bausteine";
import { useAuswahl, useEntfallHinweis, useSpielzeit, useStand } from "./gemeinsam/hooks";
import { LagekarteAnsicht, meldungsMarken, wirkungsMarken } from "./gemeinsam/lagekarte";
import { vorschauFuer } from "./g2";

function Postfach(p: { s: Sicht; injects: InjectStand[] }) {
  const { s } = p;
  const inh = s.inh;
  const start = inh.szenario.spieluhr.start;
  const [offenId, setOffenId] = useState<string | null>(null);
  const neu = p.injects.filter((i) => !i.quittiert).length;
  return (
    <Panel titel="Lagemeldungen" liste testid="postfach"
      rechts={neu ? <span class="badge neu" data-testid="postfach-neu">{neu} neu</span> : <span class="badge">{p.injects.length}</span>}>
      {p.injects.length === 0 ? <div class="hinweistext">Meldungen von Brigade, Nachbarn und Kompanien erscheinen hier. Nur du bekommst sie.</div> : (
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
                    <span class="klein sehr-leise">Bestätigt der Spielleitung, dass du die Meldung gelesen hast.</span>
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

export function G3Ansicht(p: { s: Sicht }) {
  const { s } = p;
  const st = useStand(s);
  useEntfallHinweis(s, st, "g3");
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
  const tLage = Math.floor(t);
  const lagebild = useMemo(() => lagebildZielmeldungen(inh, z, "g3", tLage), [inh, z, tLage]);
  const fx = useMemo(() => effekte(inh, z, bekannteZiele(inh, z, "g3")), [inh, z]);
  const wm = ms?.g2?.wirkmittel;
  const bestandLeer = !!wm && z.bestand[wm] === 0;
  // Warnung zum Einschlag bei Freigabe jetzt (live; G2 hat zu seiner Zeit gerechnet)
  const vs = m && wm && ms?.stufe === "g3" ? vorschauFuer(inh, z, m, wm, t) : null;
  const vorschau = vs?.vorschau ?? null;
  // Warnungen von G2, deren Regel die Prüfung jetzt nicht mehr meldet (z. B. Ziel weitergefahren)
  const jetztRegeln = new Set<string>(vs?.v.pruefung.verstoesse.map((x) => x.regel) ?? []);
  const g2Extra = (ms?.g2?.warnungen ?? []).filter((w) => !jetztRegeln.has(w.split(":")[0].trim()));

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

  const oeffnen = (id: string | null) => {
    if (id === gewaehlt) return;
    waehle(id);
    setBemerkung("");
  };
  const entscheiden = (entscheid: "freigabe" | "ablehnen" | "zurueck") => {
    if (!gewaehlt) return;
    s.senden("g3_entscheid", { meldung: gewaehlt, entscheid, bemerkung: bemerkung.trim() || undefined });
    setBemerkung("");
    waehle(null);
  };
  const hinweisSenden = () => {
    const empf = (["g1", "g2"] as const).filter((r) => an[r]);
    if (!hinweis.trim() || !empf.length) return;
    s.senden("lagehinweis", { text: hinweis.trim(), an: [...empf] });
    setHinweis("");
  };
  const zm = gewaehlt ? zielmeldung(inh, z, gewaehlt) : null;
  const marken = [...meldungsMarken(offen, gewaehlt, oeffnen, (id) => zielName(inh, z, id, false), (x) => (x.g2?.warnungen.length ? "⚠" : undefined)), ...wirkungsMarken(lagebild)];
  const letzter = z.lagehinweise[z.lagehinweise.length - 1];

  return (
    <main class="inhalt ansicht-karte ansicht-g3">
      <section class="panel ohne-rand karten-feld" data-testid="g3-karte">
        <LagekarteAnsicht inh={inh} lagebild={lagebild} vorschau={vorschau} gewaehlt={gewaehlt}
          onWahl={(id) => offen.some((x) => x.id === id) && oeffnen(id)} hintergrund="topo" legende="ziele"
          uhr={() => s.kartenUhr()} effekte={fx} marken={marken} />
      </section>

      <aside class="stapel meldungsfeld">
        <EingangLeiste anzahl={offen.length} testid="g3-offen">
          <span class="fasttrack" title={`Fast-Track: Meldungen ab ${inh.regeln.fast_track.schwelle} % mit BEKÄMPFEN gehen ohne Prüfung durch die Aufklärung direkt an die Zielprüfung`}>
            Fast-Track <span class={`badge ${z.fastTrack ? "warn" : ""}`} data-testid="fasttrack-status">{z.fastTrack ? "EIN" : "AUS"}</span>
          </span>
          <AktionsKnopf s={s} wartet={s.wartetAuf("fast_track")} gesperrt={z.ende} klasse="klein" onClick={() => s.senden("fast_track", { an: !z.fastTrack })}>
            {z.fastTrack ? "ausschalten" : "einschalten"}
          </AktionsKnopf>
        </EingangLeiste>
        <Panel schritt={2} titel={m && ms ? <>Entscheiden <span class="leise" style="font-weight:500">· {uhrzeit(start, ms.erschienen.t_s)}</span></> : "Entscheiden"}
          klasse="flach" testid="g3-entscheiden" meldung={ms?.id}>
          {!ms || !zm ? (
            <div class="hinweistext" style="padding:2px 0 4px" data-testid="g3-warten">Warten auf Empfehlungen der Zielprüfung … Sie erscheinen als Marke auf der Karte und öffnen sich hier. Ohne deine FREIGABE wird nichts bekämpft.</div>
          ) : (
            <div class="stapel" style="gap:7px">
              <ZielmeldungKompakt zm={zm} />
              <div class="g2-zeile">
                <span class="feldname">Zielprüfung empfiehlt</span>
                <span><b class="rot">BEKÄMPFEN</b> mit {inh.wirkmittel[wm ?? ""]?.name ?? "?"}</span>
                {ms.g2?.begruendung && <span class="zwei-zeilen leise" title={ms.g2.begruendung}>„{ms.g2.begruendung}“</span>}
              </div>
              {/* Warnungen der Zielprüfung (zu ihrer Zeit gerechnet) nur, soweit die Prüfung jetzt sie nicht ohnehin zeigt */}
              {g2Extra.length > 0 && (
                <div class="g2-warnung" data-testid="g3-warnungen">{g2Extra.map((w) => <div>⚠ bei der Zielprüfung: {w}</div>)}</div>
              )}
              {vs && (
                <div class={vs.v.pruefung.zulaessig ? "wm-status ok" : "warnung"} data-testid="g3-jetzt">
                  Freigabe jetzt: Einschlag {uhrzeit(start, vs.v.einschlag.t)}{vs.v.pruefung.zulaessig ? " – keine Regelwarnung" : ""}
                  {vs.v.pruefung.verstoesse.map((x) => <div>⚠ {x.regel}: {x.text}</div>)}
                  {!vs.v.pruefung.zulaessig && <div class="klein" style="opacity:.8">{ms.g2?.warnungen.length ? "Die Zielprüfung hat dazu gewarnt. " : ""}Freigabe möglich, der Verstoß wird protokolliert.</div>}
                </div>
              )}
              {bestandLeer && <div class="warnung">{inh.wirkmittel[wm!].kurz} aufgebraucht – ZURÜCK AN ZIELPRÜFUNG</div>}
            </div>
          )}
          <div class="stapel" style="gap:7px;margin-top:8px">
            <input class="feld" placeholder="Bemerkung (freiwillig)" maxLength={TEXT_MAX.bemerkung} value={bemerkung}
              onInput={(e) => setBemerkung((e.target as HTMLInputElement).value)} disabled={gesperrt} />
            <div class="knopf-reihe g3-knoepfe">
              <AktionsKnopf s={s} wartet={wartet} gesperrt={gesperrt || bestandLeer} klasse="gross toedlich" onClick={() => entscheiden("freigabe")} testid="g3-freigabe">
                FREIGABE
              </AktionsKnopf>
              <AktionsKnopf s={s} wartet={wartet} gesperrt={gesperrt} klasse="gross" onClick={() => entscheiden("ablehnen")} testid="g3-ablehnen">ABLEHNEN</AktionsKnopf>
              <AktionsKnopf s={s} wartet={wartet} gesperrt={gesperrt} klasse="gross" onClick={() => entscheiden("zurueck")} testid="g3-zurueck">ZURÜCK<span class="unterzeile">an die Zielprüfung</span></AktionsKnopf>
            </div>
          </div>
        </Panel>
        <Postfach s={s} injects={injects} />
        <Panel titel="Lagehinweis an Aufklärung und Zielprüfung" klasse="flach">
          <div class="stapel" style="gap:6px">
            <textarea class="feld" rows={2} maxLength={TEXT_MAX.lagehinweis} placeholder="Hinweis an Aufklärung und Zielprüfung (bis zwei Zeilen)" value={hinweis}
              onInput={(e) => setHinweis((e.target as HTMLTextAreaElement).value)} style="resize:none" data-testid="g3-lagehinweis" />
            <div class="zeile zwischen" style="flex-wrap:nowrap">
              <div class="zeile" style="flex-wrap:nowrap;min-width:0;flex:1">
                <span class="klein sehr-leise">an</span>
                {(["g1", "g2"] as const).map((r) => (
                  <label class="zeile klein" key={r} style="gap:4px;flex:0 0 auto;flex-wrap:nowrap"><input type="checkbox" checked={an[r]} onChange={() => setAn({ ...an, [r]: !an[r] })} />{ROLLEN_NAME[r]}</label>
                ))}
                {letzter && (
                  <span class="klein leise einzeilig" data-testid="g3-gesendet" title={letzter.text}>
                    zuletzt {uhrzeit(start, letzter.t_s)}: {letzter.text}
                  </span>
                )}
              </div>
              <AktionsKnopf s={s} wartet={s.wartetAuf("lagehinweis")} gesperrt={!hinweis.trim() || (!an.g1 && !an.g2)} onClick={hinweisSenden}>Senden</AktionsKnopf>
            </div>
          </div>
        </Panel>
      </aside>
    </main>
  );
}
