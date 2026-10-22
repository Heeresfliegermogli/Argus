// G2 Zielprüfung: bekommt nur die Zielmeldung, sieht das Ziel auf der Lagekarte, prüft die
// Einsatzregeln (R2, R3, Einsatzbereich) mit der Wirkradius-Vorschau und empfiehlt G3:
// BEKÄMPFEN mit Wirkmittel, BEOBACHTEN (zurückstellen) oder NICHT BEKÄMPFEN.
//   ① Zielmeldung wählen  ② Wirkmittel wählen, Vorschau und Warnungen prüfen  ③ empfehlen
import { useMemo, useState } from "preact/hooks";
import { bekannteZiele, effekte } from "../kern/effekte";
import { TEXT_MAX } from "../kern/ereignisse";
import { abstandZone, position } from "../kern/geometrie";
import { lagebildZielmeldungen } from "../kern/lagebild";
import { type Wirkungsergebnis, vorhersage } from "../kern/regeln";
import { ENTSCHEID_TEXT, ERGEBNIS_TEXT, STUFE_TEXT, verlauf, warteschlange, zielmeldung } from "../kern/sichten";
import { uhrzeit } from "../kern/uhr";
import type { Spielzustand } from "../kern/zustand";
import type { Vorschau } from "../karte/lagekarte";
import type { Inhalte, Meldung, Punkt } from "../inhalte/typen";
import type { Sicht } from "../sitzung/sicht";
import { AktionsKnopf, Lagehinweise, Leer, MeldungsEintrag, Panel, ZielmeldungLeiste } from "./gemeinsam/bausteine";
import { useAuswahl, useEntfallHinweis, useSpielzeit, useStand } from "./gemeinsam/hooks";
import { LagekarteAnsicht } from "./gemeinsam/lagekarte";

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

/** Abstände eines Orts (Ziel jetzt oder Einschlag) zu den Zonen und zur Einsatzgrenze. */
export function Abstaende(p: { inh: Inhalte; pos: Punkt; titel?: string }) {
  const { inh, pos } = p;
  const grenzen = Object.values(inh.wirkmittel).filter((w) => w.einsatzbereich?.x_max !== undefined);
  return (
    <div class="abstaende" data-testid="abstaende">
      {p.titel && <span class="sehr-leise" style="grid-column:1/-1;font-size:12px;line-height:1.25">{p.titel}</span>}
      {inh.szenario.zonen.map((z) => {
        const a = abstandZone(pos, z);
        return <><span>{z.id} {z.typ === "no_strike" ? "(No-Strike)" : `(≤ ${z.max_wirkradius_m} m)`}</span><b>{a === 0 ? "Ziel liegt im Gebiet" : `${Math.round(a)} m entfernt`}</b></>;
      })}
      {grenzen.map((w) => {
        const d = w.einsatzbereich!.x_max! - pos[0];
        return <><span>Einsatzgrenze {w.kurz}</span><b>{d > 0 ? `${Math.round(d)} m diesseits` : `${Math.round(-d)} m jenseits`}</b></>;
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
  const [gewaehlt, waehle] = useAuswahl(offen.map((m) => m.id));
  const [wm, setWm] = useState<string | null>(null);
  const [zeigeWm, setZeigeWm] = useState<string | null>(null);
  const [begruendung, setBegruendung] = useState("");
  const m = gewaehlt ? inh.meldungen[gewaehlt] : null;
  const wartet = !!gewaehlt && s.wartetAuf("g2_empfehlung", gewaehlt);
  const start = inh.szenario.spieluhr.start;
  const tLage = Math.floor(t);
  const pos = m ? position(inh.ziele[m.ziele.find((id) => z.zerstoert[id] === undefined) ?? m.ziele[0]], t) : null;
  const gesperrt = !m || z.ende;
  const lagebild = useMemo(() => lagebildZielmeldungen(inh, z, "g2", tLage), [inh, z, tLage]);
  const fx = useMemo(() => effekte(inh, z, bekannteZiele(inh, z, "g2")), [inh, z]);
  const historie = verlauf(z, "g2");

  const waehleMeldung = (id: string) => {
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
  };

  const vorschauWm = zeigeWm ?? wm;
  const vs = m && vorschauWm ? vorschauFuer(inh, z, m, vorschauWm, t) : null;
  const vorschau = vs?.vorschau ?? null;
  const pruefungGewaehlt = m && wm ? vorhersage(inh, m, wm, t, z.zerstoert).pruefung : null;

  return (
    <main class="inhalt ansicht-g2">
      <div class="stapel">
        <Panel schritt={1} titel="Zielmeldungen" rechts={<span class={`badge ${offen.length ? "neu" : ""}`} data-testid="g2-offen">{offen.length}</span>} liste stil="flex:1.3 1 0">
          {offen.length === 0 ? <Leer>Keine offene Zielmeldung. Angenommene Ziele von G1 erscheinen hier.</Leer> : (
            <ul class="liste">
              {offen.map((x) => <MeldungsEintrag key={x.id} inh={inh} st={x} aktiv={x.id === gewaehlt} onWahl={() => waehleMeldung(x.id)} />)}
            </ul>
          )}
        </Panel>
        <Panel titel="Verlauf" liste rechts={historie.length ? <span class="badge">{historie.length}</span> : null}>
          {historie.length === 0 ? <div class="hinweistext">Bearbeitete Zielmeldungen</div> : (
            <ul class="liste">
              {historie.map((x) => (
                <MeldungsEintrag key={x.id} inh={inh} st={x} gedimmt
                  unter={<>{uhrzeit(start, x.erschienen.t_s)} · {x.g2 ? ENTSCHEID_TEXT[x.g2.empfehlung] : ""}{x.g2?.wirkmittel ? ` ${inh.wirkmittel[x.g2.wirkmittel]?.kurz}` : ""} · {x.ergebnis ? ERGEBNIS_TEXT[x.ergebnis] : STUFE_TEXT[x.stufe]}</>} />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div class="stapel">
        <Panel titel={m ? `Zielmeldung ${m.id}` : "Zielmeldung"} klasse="flach">
          {!m || !gewaehlt ? <div class="hinweistext" style="padding:6px 0">Warten auf Zielmeldungen von G1 … Gewählte Ziele sind auf der Karte gelb umrandet.</div>
            : <ZielmeldungLeiste zm={zielmeldung(inh, z, gewaehlt)} />}
        </Panel>
        <Panel titel="Lagekarte" klasse="ohne-rand" rechts={<span class="klein sehr-leise">Zeichen = Zielmeldungen an der gemeldeten Position · Klick wählt</span>}>
          <LagekarteAnsicht inh={inh} lagebild={lagebild} vorschau={vorschau} gewaehlt={gewaehlt}
            onWahl={(id) => offen.some((x) => x.id === id) && waehleMeldung(id)} hintergrund="topo" legende="ziele"
            uhr={() => s.kartenUhr()} effekte={fx}
            banner={vorschau && vs && <div class={`karte-banner ${vorschau.ok ? "ok" : "verstoss"}`} data-testid="karte-banner">
              {inh.wirkmittel[vorschauWm!].kurz} bei Freigabe jetzt: Einschlag {uhrzeit(start, vs.v.einschlag.t)} – {vorschau.ok ? "keine Warnung" : `${vs.v.pruefung.verstoesse.map((x) => x.regel).join(", ")} verletzt`}
            </div>} />
        </Panel>
      </div>

      <div class="stapel">
        <Panel schritt={2} titel="Wirkmittel wählen" klasse="flach">
          {!m || !pos ? <div class="hinweistext">Erst links unter ① eine Zielmeldung wählen.</div> : (
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
                      <div class="klein leise">Wirkradius {w.wirkradius_m} m · Einschlag in {Math.round(vh.einschlag.t - t)} s ({uhrzeit(start, vh.einschlag.t)})</div>
                      {leer ? <div class="wm-status verstoss">aufgebraucht</div> : pr.zulaessig
                        ? <div class="wm-status ok">✓ keine Warnung</div>
                        : pr.verstoesse.map((v) => <div class="wm-status verstoss">⚠ {v.regel}: {v.text}</div>)}
                    </div>
                  </label>
                );
              })}
              <Abstaende inh={inh} pos={vs ? vs.v.einschlag.pos : pos} titel={vs ? `Abstände am Einschlagort (${inh.wirkmittel[vorschauWm!].kurz}, Freigabe jetzt)` : "Abstände des Ziels jetzt"} />
            </div>
          )}
        </Panel>
        <Panel schritt={3} titel="Empfehlung an G3" klasse="flach">
          <div class="stapel" style="gap:8px">
            <input class="feld" placeholder="Begründung (eine Zeile, freiwillig)" maxLength={TEXT_MAX.begruendung} value={begruendung}
              onInput={(e) => setBegruendung((e.target as HTMLInputElement).value)} disabled={gesperrt} data-testid="g2-begruendung" />
            <AktionsKnopf s={s} wartet={wartet} gesperrt={gesperrt || !wm} klasse="gross toedlich" onClick={() => empfehlen("bekaempfen")}
              titel={!wm ? "zuerst unter ② ein Wirkmittel wählen" : undefined} testid="g2-bekaempfen">
              BEKÄMPFEN{wm ? ` mit ${inh.wirkmittel[wm].kurz}` : ""}
              <span class="unterzeile">{!wm ? "erst Wirkmittel wählen" : pruefungGewaehlt && !pruefungGewaehlt.zulaessig ? "⚠ trotz Warnung – wird protokolliert" : "Empfehlung geht an G3"}</span>
            </AktionsKnopf>
            <div class="knopf-reihe">
              <AktionsKnopf s={s} wartet={wartet} gesperrt={gesperrt} onClick={() => empfehlen("beobachten")} testid="g2-beobachten">
                BEOBACHTEN<span class="unterzeile">zurückstellen</span>
              </AktionsKnopf>
              <AktionsKnopf s={s} wartet={wartet} gesperrt={gesperrt} onClick={() => empfehlen("nicht_bekaempfen")} testid="g2-nicht">
                NICHT BEKÄMPFEN<span class="unterzeile">abschließen</span>
              </AktionsKnopf>
            </div>
          </div>
        </Panel>
        <Lagehinweise inh={inh} z={z} rolle="g2" />
      </div>
    </main>
  );
}
