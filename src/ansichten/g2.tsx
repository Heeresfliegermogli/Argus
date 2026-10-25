// Zielprüfung (intern g2; Schritt 6b): Die Karte ist die Arbeitsfläche. Angenommene Ziele stehen als Marke „Ziel 7“ am
// Ziel, zurückgestellte (BEOBACHTEN) bleiben als Marke stehen. Rechts: Eingang als Zahl, die geöffnete Zielmeldung,
// Wirkmittel mit Warnungen am vorausberechneten Einschlagort (Vorschau auf der Karte) und die Empfehlung an die Führung.
//   ① Zielmeldung öffnen (Marke; die älteste neue öffnet sich von selbst)  ② Wirkmittel wählen, Warnungen prüfen
//   ③ BEKÄMPFEN mit Wirkmittel, BEOBACHTEN (zurückstellen) oder NICHT BEKÄMPFEN
import { useMemo, useState } from "preact/hooks";
import { bekannteZiele, effekte } from "../kern/effekte";
import { TEXT_MAX } from "../kern/ereignisse";
import { abstandZone, position } from "../kern/geometrie";
import { lagebildZielmeldungen } from "../kern/lagebild";
import { type Wirkungsergebnis, vorhersage } from "../kern/regeln";
import { warteschlange, zielmeldung } from "../kern/sichten";
import { uhrzeit } from "../kern/uhr";
import { zielName } from "../kern/zielnummern";
import type { Spielzustand } from "../kern/zustand";
import type { Vorschau } from "../karte/lagekarte";
import type { Inhalte, Meldung, Punkt } from "../inhalte/typen";
import type { Sicht } from "../sitzung/sicht";
import { AktionsKnopf, EingangLeiste, KartenLagehinweise, Panel, ZielmeldungKompakt } from "./gemeinsam/bausteine";
import { useAuswahl, useEntfallHinweis, useSpielzeit, useStand } from "./gemeinsam/hooks";
import { LagekarteAnsicht, meldungsMarken, wirkungsMarken } from "./gemeinsam/lagekarte";

/**
 * Wirkradius-Vorschau eines Wirkmittels für eine Freigabe jetzt (auch für G3): am vorausberechneten
 * Einschlagort, mit dem Weg des Ziels dorthin (Trefferregel seit Szenario 2.0).
 */
export function vorschauFuer(inh: Inhalte, z: Spielzustand, m: Meldung, wmId: string, t: number): { vorschau: Vorschau; v: Wirkungsergebnis } {
  const w = inh.wirkmittel[wmId];
  const v = vorhersage(inh, m, wmId, t, z.zerstoert);
  const pr = v.pruefung;
  const ziel = inh.ziele[v.einschlag.ziel];
  return {
    v,
    vorschau: {
      pos: v.einschlag.pos,
      von: ziel ? position(ziel, t) : undefined,
      radius_m: w.wirkradius_m,
      ok: pr.zulaessig,
      zonen: pr.verstoesse.flatMap((x) => (x.zone ? [x.zone] : [])),
      grenzeX: w.einsatzbereich?.x_max,
      grenzeVerletzt: pr.verstoesse.some((x) => x.regel === "EB"),
      grenzeText: w.einsatzbereich ? `Einsatzgrenze ${w.kurz}` : undefined,
      text: `${w.kurz} · Einschlag ${uhrzeit(inh.szenario.spieluhr.start, v.einschlag.t)}${pr.zulaessig ? "" : " · Warnung"}`,
    },
  };
}

/** Abstände eines Orts (Ziel jetzt oder Einschlag) zu den Zonen und zur Einsatzgrenze – eine Zeile je Wert. */
export function Abstaende(p: { inh: Inhalte; pos: Punkt; titel?: string }) {
  const { inh, pos } = p;
  const grenzen = Object.values(inh.wirkmittel).filter((w) => w.einsatzbereich?.x_max !== undefined);
  return (
    <div class="abstaende" data-testid="abstaende">
      {p.titel && <span class="abstaende-titel">{p.titel}</span>}
      {inh.szenario.zonen.map((z) => {
        const a = abstandZone(pos, z);
        return <span>{z.id} {z.typ === "no_strike" ? "(No-Strike)" : `(≤ ${z.max_wirkradius_m} m)`} <b>{a === 0 ? "im Gebiet" : `${Math.round(a)} m`}</b></span>;
      })}
      {grenzen.map((w) => {
        const d = w.einsatzbereich!.x_max! - pos[0];
        return <span>Grenze {w.kurz} <b>{d > 0 ? `${Math.round(d)} m diesseits` : `${Math.round(-d)} m jenseits`}</b></span>;
      })}
    </div>
  );
}


export function G2Ansicht(p: { s: Sicht }) {
  const { s } = p;
  const st = useStand(s);
  useEntfallHinweis(s, st, "g2");
  const t = useSpielzeit(s, 1000);
  const inh = s.inh;
  const z = st.zustand;
  const offen = warteschlange(z, "g2");
  const neu = offen.filter((x) => !x.beobachten);
  const [gewaehlt, waehle] = useAuswahl(neu.map((x) => x.id), offen.map((x) => x.id));
  const [wm, setWm] = useState<string | null>(null);
  const [zeigeWm, setZeigeWm] = useState<string | null>(null);
  const [begruendung, setBegruendung] = useState("");
  const m = gewaehlt ? inh.meldungen[gewaehlt] : null;
  const ms = gewaehlt ? z.meldungen[gewaehlt] : null;
  const wartet = !!gewaehlt && s.wartetAuf("g2_empfehlung", gewaehlt);
  const start = inh.szenario.spieluhr.start;
  const tLage = Math.floor(t);
  const pos = m ? position(inh.ziele[m.ziele.find((id) => z.zerstoert[id] === undefined) ?? m.ziele[0]], t) : null;
  const gesperrt = !m || z.ende;
  const lagebild = useMemo(() => lagebildZielmeldungen(inh, z, "g2", tLage), [inh, z, tLage]);
  const fx = useMemo(() => effekte(inh, z, bekannteZiele(inh, z, "g2")), [inh, z]);

  const oeffnen = (id: string | null) => {
    if (id === gewaehlt) return;
    waehle(id);
    setWm(null);
    setBegruendung("");
  };

  const empfehlen = (empfehlung: "bekaempfen" | "beobachten" | "nicht_bekaempfen") => {
    if (!gewaehlt) return;
    s.senden("g2_empfehlung", {
      meldung: gewaehlt, empfehlung, wirkmittel: empfehlung === "bekaempfen" ? wm ?? undefined : undefined,
      begruendung: begruendung.trim() || undefined,
    });
    setBegruendung("");
    setWm(null);
    waehle(null);
  };

  const vorschauWm = zeigeWm ?? wm;
  const vs = m && vorschauWm ? vorschauFuer(inh, z, m, vorschauWm, t) : null;
  const vorschau = vs?.vorschau ?? null;
  const pruefungGewaehlt = m && wm ? vorhersage(inh, m, wm, t, z.zerstoert).pruefung : null;
  const marken = [...meldungsMarken(offen, gewaehlt, oeffnen, (id) => zielName(inh, z, id, false)), ...wirkungsMarken(lagebild)];

  return (
    <main class="inhalt ansicht-karte ansicht-g2">
      <section class="panel ohne-rand karten-feld" data-testid="g2-karte">
        <LagekarteAnsicht inh={inh} lagebild={lagebild} vorschau={vorschau} gewaehlt={gewaehlt}
          onWahl={(id) => offen.some((x) => x.id === id) && oeffnen(id)} hintergrund="topo" legende="ziele"
          uhr={() => s.kartenUhr()} effekte={fx} marken={marken}
          ecke={<KartenLagehinweise inh={inh} z={z} rolle="g2" />}
          banner={vorschau && vs && <div class={`karte-banner ${vorschau.ok ? "ok" : "verstoss"}`} data-testid="karte-banner">
            {inh.wirkmittel[vorschauWm!].kurz} bei Freigabe jetzt: Einschlag {uhrzeit(start, vs.v.einschlag.t)} – {vorschau.ok ? "keine Warnung" : `${vs.v.pruefung.verstoesse.map((x) => x.regel).join(", ")} verletzt`}
          </div>} />
      </section>

      <aside class="stapel meldungsfeld">
        <EingangLeiste anzahl={neu.length} zurueck={offen.length - neu.length} testid="g2-offen" />
        <Panel titel={m && ms ? <>Zielmeldung <span class="leise" style="font-weight:500">· {uhrzeit(start, ms.erschienen.t_s)}{m.folge_von ? ` · Folgemeldung zu ${zielName(inh, z, m.folge_von, false)}` : ""}</span></> : "Zielmeldung"}
          klasse="flach" testid="offene-meldung" meldung={ms?.id}
          rechts={ms?.beobachten ? <span class="badge info">zurückgestellt</span> : ms?.fastTrack ? <span class="badge warn">Fast-Track</span> : null}>
          {!m || !gewaehlt ? (
            <div class="hinweistext" style="padding:4px 0" data-testid="g2-warten">
              {offen.length ? "Zurückgestellte Ziele bleiben als Marke auf der Karte – anklicken öffnet sie." : "Warten auf Zielmeldungen der Aufklärung … Angenommene Ziele erscheinen als Marke auf der Karte und öffnen sich hier."}
            </div>
          ) : <ZielmeldungKompakt zm={zielmeldung(inh, z, gewaehlt)} />}
        </Panel>
        <Panel schritt={2} titel="Wirkmittel wählen" klasse="flach">
          {!m || !pos ? <div class="hinweistext">Erst eine Zielmeldung öffnen (Marke auf der Karte).</div> : (
            <div class="stapel" style="gap:4px" onMouseLeave={() => setZeigeWm(null)}>
              {Object.values(inh.wirkmittel).map((w) => {
                const vh = vorhersage(inh, m, w.id, t, z.zerstoert);
                const pr = vh.pruefung;
                const bestand = z.bestand[w.id];
                const leer = bestand === 0;
                return (
                  <label key={w.id} class={`wahl ${wm === w.id ? "gewaehlt" : ""} ${leer ? "aus" : ""}`} data-wm={w.id}
                    onMouseEnter={() => setZeigeWm(w.id)}>
                    <input type="radio" name="wm" checked={wm === w.id} disabled={leer || z.ende} onChange={() => setWm(w.id)} />
                    <div style="flex:1;min-width:0">
                      <div class="wm-zeile"><b>{w.name}</b><span class="zahl klein" title="Bestand">{bestand === null ? "∞" : `${bestand} übrig`}</span></div>
                      <div class="klein leise">
                        Wirkradius {w.wirkradius_m} m · Einschlag in {Math.round(vh.einschlag.t - t)} s ({uhrzeit(start, vh.einschlag.t)})
                        {!leer && pr.zulaessig && <span class="wm-status ok"> · ✓ keine Warnung</span>}
                      </div>
                      {leer ? <div class="wm-status verstoss">aufgebraucht</div>
                        : pr.verstoesse.map((v) => <div class="wm-status verstoss">⚠ {v.regel}: {v.text}</div>)}
                    </div>
                  </label>
                );
              })}
              <Abstaende inh={inh} pos={vs ? vs.v.einschlag.pos : pos} titel={vs ? `Abstände beim Einschlag (${inh.wirkmittel[vorschauWm!].kurz}):` : "Abstände jetzt:"} />
            </div>
          )}
        </Panel>
        <Panel schritt={3} titel="Empfehlung an die Führung" klasse="flach">
          <div class="stapel" style="gap:8px">
            <input class="feld" placeholder="Begründung (eine Zeile, freiwillig)" maxLength={TEXT_MAX.begruendung} value={begruendung}
              onInput={(e) => setBegruendung((e.target as HTMLInputElement).value)} disabled={gesperrt} data-testid="g2-begruendung" />
            <AktionsKnopf s={s} wartet={wartet} gesperrt={gesperrt || !wm} klasse="gross toedlich" onClick={() => empfehlen("bekaempfen")}
              titel={!wm ? "zuerst unter ② ein Wirkmittel wählen" : undefined} testid="g2-bekaempfen">
              BEKÄMPFEN{wm ? ` mit ${inh.wirkmittel[wm].kurz}` : ""}
              <span class="unterzeile">{!wm ? "erst Wirkmittel wählen" : pruefungGewaehlt && !pruefungGewaehlt.zulaessig ? "⚠ trotz Warnung – wird protokolliert" : "Empfehlung geht an die Führung"}</span>
            </AktionsKnopf>
            <div class="knopf-reihe">
              <AktionsKnopf s={s} wartet={wartet} gesperrt={gesperrt || !!ms?.beobachten} onClick={() => empfehlen("beobachten")} testid="g2-beobachten"
                titel={ms?.beobachten ? "schon zurückgestellt" : undefined}>
                BEOBACHTEN<span class="unterzeile">zurückstellen</span>
              </AktionsKnopf>
              <AktionsKnopf s={s} wartet={wartet} gesperrt={gesperrt} onClick={() => empfehlen("nicht_bekaempfen")} testid="g2-nicht">
                NICHT BEKÄMPFEN<span class="unterzeile">abschließen</span>
              </AktionsKnopf>
            </div>
          </div>
        </Panel>
      </aside>
    </main>
  );
}
