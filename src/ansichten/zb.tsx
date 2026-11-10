// Zielbearbeitung (intern zb; seit 2.6, Änderungen H2): eine Ansicht je Team, 2–3 Personen an einem Laptop, eine Entscheidung je
// Meldung. Aufbau in 1530 × 800:
//   links   schmaler Feed der Lagemeldungen (Brigade, Nachbarn, 1. Kp); seit 2.7 (I4) steht eine Lagemeldung, bis sie angeklickt wird
//           oder 30 s Spielzeit um sind (regeln.anzeige.lagemeldung_s), dann ist sie ganz weg – unter Druck läuft sie unter (S3 lebt
//           davon); das Protokoll zeigt, ob und wann sie angeklickt wurde
//   Mitte   Lagekarte: Marken der Meldungen im Eingang, bekämpfte Ziele mit Countdown bis zum Einschlag, Vorschau des Wirkmittels
//   rechts  seit 2.7 (I5) fest aufgeteilt, nichts verschiebt sich: oben eine Zeile „Wirkung unterwegs“ (Chips „Ziel 17 ×3 0:23“,
//           Rest „+3“ als Überlagerung), darunter der Eingang mit fester Höhe und eigener Rollleiste (Wartezeit je Meldung, dazu
//           Vermerke: verbündet, durchgebrochen, abgezogen, zerstört), darunter die geöffnete Meldung: Live-Drohnenbild (Klick: groß
//           mit Lupe), ARGUS-Ausgabe, Wirkmittel mit Bestand, Countdown und Warnungen am vorausberechneten Einschlagort; die drei
//           Knöpfe BEKÄMPFEN mit … · ZURÜCKSTELLEN · ABLEHNEN stehen immer an derselben Stelle
// Die Kopfzeile (rahmen.tsx) zeigt Uhr, Phase, die vier Panzer und den Bestand groß.
// Jede Entscheidung trägt die Sekunden ab Eingang und ab Öffnen ins Protokoll (H2.4). Der Team-Laptop rechnet das Spiel selbst:
// Ein Klick ist sofort im Spielstand – ohne Netz.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { drohnenbild, drohnenEbenen, vorladen } from "../assets/assets";
import type { LiveLage } from "../drohne/livebild";
import type { Inhalte, Meldung } from "../inhalte/typen";
import type { Vorschau } from "../karte/lagekarte";
import { bekannteZiele, effekte } from "../kern/effekte";
import { argusBei, bildalter } from "../kern/eloka";
import { position } from "../kern/geometrie";
import { lagebildZielmeldungen } from "../kern/lagebild";
import { type ZugWirkung, vorhersage, zugArt } from "../kern/regeln";
import { injectsFuer, VERMERK_S, type Vermerk, vermerke, warteschlange } from "../kern/sichten";
import { injectAnzeige } from "../kern/verluste";
import { zielName } from "../kern/zielnummern";
import type { InjectStand, MeldungsStand, Spielzustand } from "../kern/zustand";
import type { Sicht } from "../sitzung/sicht";
import { Empfehlung } from "./gemeinsam/bausteine";
import { useManifest } from "./gemeinsam/drohnenbild";
import { useAuswahl, useEntfallHinweis, useSpielzeit, useStand } from "./gemeinsam/hooks";
import { type KartenMarke, LagekarteAnsicht, meldungsMarken, wirkungsMarken } from "./gemeinsam/lagekarte";
import { LiveDrohnenFenster } from "./gemeinsam/livedrohne";

/**
 * Mitte des Kartenausschnitts beim Start (seit 2.7, G4b): Die Karte füllt ihr Feld; bei 1530 × 800 sieht das Team rund 700 m von den
 * eigenen Panzern am Westrand über Bach und Brücke bis in die Ortschaft. Neue Meldungen außerhalb zeigt ein Pfeil am Rand.
 */
export const KARTE_MITTE_ZB: [number, number] = [378, 350];

/** Drohnenbild in der Ansicht (16 : 10) */
export const DROHNEN_BILD = { breite: 520, hoehe: 325 };

/** m:ss für Wartezeit und Countdown */
export function mss(s: number): string {
  const x = Math.max(0, Math.round(s));
  return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`;
}

/**
 * Wirkradius-Vorschau eines Wirkmittels für BEKÄMPFEN jetzt: am vorausberechneten Einschlagort, mit dem Weg des Ziels dorthin
 * (Trefferregel seit Szenario 2.0). Text mit Countdown statt Uhrzeit (H5.3).
 */
export function vorschauFuer(inh: Inhalte, z: Spielzustand, m: Meldung, wmId: string, t: number): { vorschau: Vorschau; v: ZugWirkung } {
  const w = inh.wirkmittel[wmId];
  const v = vorhersage(inh, m, wmId, t, z.zerstoert, z.bestand[wmId] ?? null);
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
      text: `${w.kurz} · Einschlag in ${mss(v.einschlag.t - t)}${pr.zulaessig ? "" : " · Warnung"}`,
    },
  };
}

/** Nächster ausstehender Einschlag einer bekämpften Meldung (Spielzeit), sonst null. */
export function naechsterEinschlag(st: MeldungsStand, t: number): number | null {
  const f = st.freigabe;
  if (!f || st.wirkung) return null;
  const liste = (f.einschlaege?.map((e) => e.t) ?? [f.einschlag?.t]).filter((x): x is number => typeof x === "number");
  const kommend = liste.filter((x) => x > t - 0.5).sort((a, b) => a - b);
  return kommend[0] ?? (liste.length ? Math.max(...liste) : null);
}

/** Bestand knapp (regeln.anzeige.bestand_knapp, H5.6)? */
export function bestandKnapp(inh: Inhalte, wm: string, bestand: number | null | undefined): boolean {
  const grenze = inh.regeln.anzeige?.bestand_knapp?.[wm];
  return typeof bestand === "number" && grenze !== undefined && bestand <= grenze;
}

/** Klasse · Zugehörigkeit Konfidenz, wie ARGUS es dem Team zeigt (EloKa: gestört). */
export function argusZeile(inh: Inhalte, m: Meldung, gestoert?: boolean): string {
  const a = argusBei(inh, m, gestoert);
  const zug = a.zugehoerigkeit && a.zugehoerigkeit !== "unbekannt" ? ` · ${a.zugehoerigkeit}` : a.zugehoerigkeit === "unbekannt" && a.klasse !== "unbekannt" ? " · unbekannt" : "";
  return `${a.klasse === "unbekannt" ? "unbekannt" : a.klasse}${zug} ${a.konfidenz} %`;
}

// ---------------------------------------------------------------- Feed der Lagemeldungen (H5.5, seit 2.7 I4)

/** So lange (Spielzeit, s) steht eine Lagemeldung im Feed, wenn die Regeln nichts sagen. */
export const LAGEMELDUNG_S = 30;

/**
 * Lagemeldungen, die das Team gerade sieht (seit 2.7, I4): nicht angeklickt und höchstens lagemeldung_s Spielzeit alt, die neueste
 * oben. Angeklickte und abgelaufene sind ganz weg (Spielleitung und Auswertung sehen weiter alle).
 */
export function feedSichtbar(inh: Inhalte, injects: InjectStand[], t: number): InjectStand[] {
  const sek = inh.regeln.anzeige?.lagemeldung_s ?? LAGEMELDUNG_S;
  return [...injects].reverse().filter((i) => !i.quittiert && t - i.erschienen.t_s < sek);
}

function LageFeed(p: { s: Sicht; injects: InjectStand[]; t: number }) {
  const { s } = p;
  const inh = s.inh;
  const sek = inh.regeln.anzeige?.lagemeldung_s ?? LAGEMELDUNG_S;
  const sichtbar = feedSichtbar(inh, p.injects, p.t);
  const lesen = (i: InjectStand) => {
    if (!i.quittiert && !s.nurLesen) s.senden("inject_quittiert", { inject: i.id });
  };
  return (
    <section class="feed" data-tour="feed" data-testid="feed">
      <h2>Lagemeldungen</h2>
      <div class="feed-frisch" data-testid="feed-frisch">
        {sichtbar.length === 0 && <div class="feed-leer">{p.injects.length ? "Neue Lagemeldungen erscheinen hier." : "Meldungen von Brigade, Nachbarn und der 1. Kp erscheinen hier."}</div>}
        {sichtbar.map((i) => {
          const a = injectAnzeige(inh, i);
          const rest = Math.max(0, Math.min(1, 1 - (p.t - i.erschienen.t_s) / sek));
          return (
            <button type="button" key={i.id} class={`feed-meldung frisch ${(i.stufe ?? 0) >= 2 ? "dringend" : ""}`} data-inject={i.id} onClick={() => lesen(i)}
              title={`Klick: gelesen – die Meldung verschwindet (sonst nach ${sek} s)`}>
              <div class="feed-von">{mss(i.erschienen.t_s)} · {a.von}<span class="feed-x" aria-label="gelesen">✕</span></div>
              <div class="feed-text">{a.text}</div>
              <i class="feed-rest" style={{ width: `${Math.round(rest * 100)}%` }} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Eingang (H2.3, H5.3)

function EingangListe(p: {
  inh: Inhalte; z: Spielzustand; t: number; offen: MeldungsStand[]; vermerke: Vermerk[]; gewaehlt: string | null; waehle: (id: string) => void;
}) {
  const { inh, z, t } = p;
  const neu = p.offen.filter((x) => !x.zurueckgestellt);
  const zurueck = p.offen.filter((x) => x.zurueckgestellt);
  return (
    <section class="eingang" data-tour="eingang" data-testid="eingang">
      <header>
        <h2>Eingang</h2>
        <span class={`eingang-zahl ${neu.length ? "neu" : ""}`} data-testid="eingang-zahl" title="neue Meldungen im Eingang">{neu.length}</span>
        {zurueck.length > 0 && <span class="klein leise" data-testid="zurueck-zahl">+ {zurueck.length} zurückgestellt</span>}
      </header>
      <div class="eingang-liste rolle-liste" data-liste>
        {p.offen.length === 0 && p.vermerke.length === 0 && <div class="feed-leer">Warten auf ARGUS-Meldungen …</div>}
        {[...neu, ...zurueck].map((st) => {
          const m = inh.meldungen[st.id];
          if (!m) return null;
          const a = argusBei(inh, m, st.gestoert);
          const warte = t - st.erschienen.t_s;
          return (
            <button type="button" key={st.id} class={`eingang-zeile ${st.id === p.gewaehlt ? "gewaehlt" : ""} ${st.zurueckgestellt ? "zurueck" : ""} ${warte >= 30 && !st.zurueckgestellt ? "lange" : ""}`}
              data-meldung={st.id} onClick={() => p.waehle(st.id)} aria-pressed={st.id === p.gewaehlt}>
              <b class="ez-ziel">{zielName(inh, z, st.id, false)}</b>
              <span class="ez-argus">{a.klasse} {a.konfidenz} %</span>
              <Empfehlung wert={a.empfehlung} />
              <span class="ez-zeit zahl" title={st.zurueckgestellt ? "zurückgestellt" : "im Eingang seit"}>{st.zurueckgestellt ? "◷ " : ""}{mss(warte)}</span>
            </button>
          );
        })}
        {/* seit 2.7 (I1.2, I3.2): warum ein Ziel aus dem Eingang fiel oder den Raum verließ – steht VERMERK_S Spielzeit, das Zeichen bleibt */}
        {p.vermerke.map((v) => (
          <div key={`${v.meldung}-${v.art}`} class={`eingang-zeile vermerk ${v.art}`} data-vermerk={v.meldung} data-art={v.art}>
            <b class="ez-ziel">{zielName(inh, z, v.meldung, false)}</b>
            <span class="ez-argus">{v.text}</span>
            <span class="ez-zeit zahl">{mss(v.t)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Höchstens so viele Chips stehen in der Zeile „Wirkung unterwegs“; der Rest kommt hinter „+n“ (I5.1). */
export const UNTERWEGS_CHIPS = 3;

/**
 * „Wirkung unterwegs“ (seit 2.7, I5.1): eine Zeile fester Höhe über dem Eingang, je bekämpfter Meldung mit ausstehendem Einschlag ein Chip
 * „Ziel 17 ×3 0:23“ (der nächste Einschlag zuerst); passen nicht alle, „+n“ – Klick zeigt alle als Überlagerung (verschiebt nichts).
 */
function UnterwegsLeiste(p: { inh: Inhalte; z: Spielzustand; t: number; unterwegs: MeldungsStand[] }) {
  const { inh, z, t } = p;
  const [offen, setOffen] = useState(false);
  const liste = p.unterwegs
    .map((st) => ({ st, tE: naechsterEinschlag(st, t) }))
    .sort((a, b) => (a.tE ?? Infinity) - (b.tE ?? Infinity));
  const zeigen = liste.length > UNTERWEGS_CHIPS ? liste.slice(0, UNTERWEGS_CHIPS - 1) : liste;
  const rest = liste.length - zeigen.length;
  useEffect(() => {
    if (!liste.length) setOffen(false);
  }, [liste.length]);
  const chip = ({ st, tE }: (typeof liste)[number]) => {
    const wm = st.freigabe ? inh.wirkmittel[st.freigabe.wirkmittel]?.kurz ?? st.freigabe.wirkmittel : "";
    const n = st.freigabe?.einschlaege?.length ?? 1;
    return (
      <span key={st.id} class="unterwegs-chip" data-unterwegs={st.id} title={`${zielName(inh, z, st.id, false)}: bekämpft mit ${wm}${n > 1 ? ` ×${n}` : ""}`}>
        <b>{zielName(inh, z, st.id, false)}</b>{n > 1 ? <span class="leise"> ×{n}</span> : null}
        <span class="zahl rot">{tE !== null ? mss(tE - t) : "–"}</span>
      </span>
    );
  };
  return (
    <section class="unterwegs-leiste" data-testid="unterwegs">
      <span class="unterwegs-titel">Wirkung unterwegs</span>
      {liste.length === 0 && <span class="sehr-leise klein">keine</span>}
      <span class="unterwegs-chips">{zeigen.map(chip)}</span>
      {rest > 0 && (
        <button type="button" class="unterwegs-mehr" onClick={() => setOffen(!offen)} aria-expanded={offen} data-testid="unterwegs-mehr">+{rest}</button>
      )}
      {offen && rest > 0 && (
        <div class="unterwegs-alle" data-testid="unterwegs-alle" onClick={() => setOffen(false)}>{liste.map(chip)}</div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Geöffnete Meldung

function WirkmittelZeile(p: {
  inh: Inhalte; z: Spielzustand; m: Meldung; wm: string; t: number; gewaehlt: boolean; gesperrt: boolean; waehle: () => void; zeige: (an: boolean) => void;
}) {
  const { inh, z, m, wm, t } = p;
  const w = inh.wirkmittel[wm];
  const bestand = z.bestand[wm];
  const leer = bestand === 0;
  const v = vorhersage(inh, m, wm, t, z.zerstoert, bestand ?? null);
  const knapp = bestandKnapp(inh, wm, bestand);
  const regeln = v.pruefung.verstoesse;
  const nurK = zugArt(w) === "je_fahrzeug" && v.k < v.n;
  return (
    <label class={`wm-wahl ${p.gewaehlt ? "gewaehlt" : ""} ${leer ? "aus" : ""} ${regeln.length ? "warn" : ""}`} data-wm={wm}
      onMouseEnter={() => p.zeige(true)} onMouseLeave={() => p.zeige(false)}>
      <input type="radio" name="wm" checked={p.gewaehlt} disabled={leer || p.gesperrt} onChange={p.waehle} />
      <span class={`wm-bestand ${knapp ? "knapp" : ""} ${leer ? "leer" : ""}`} title={bestand === null ? `${w.name}: kein Bestand nötig` : `${w.name}: ${bestand} übrig`}>
        {w.kurz} <b>{bestand === null || bestand === undefined ? "" : bestand}</b>
      </span>
      <span class="wm-info">
        <span class="wm-zeit">{leer ? "aufgebraucht" : <>Einschlag in <b class="zahl">{mss(v.einschlag.t - t)}</b>{v.k > 1 ? ` · ×${v.k}` : ""}</>}</span>
        {/* seit 2.7 (I5): eine Zeile – alle Warnungen hintereinander (ganz im Tooltip), damit die Meldung gleich hoch bleibt */}
        {!leer && (regeln.length || nurK ? (
          <span class="wm-status verstoss" title={[...regeln.map((x) => `${x.regel}: ${x.text}`), ...(nurK ? [`nur ${v.k} von ${v.n} Fahrzeugen – Bestand reicht nicht`] : [])].join("\n")}>
            ⚠ {[...regeln.map((x) => `${x.regel}: ${x.text}`), ...(nurK ? [`nur ${v.k} von ${v.n} Fahrzeugen – Bestand reicht nicht`] : [])].join(" · ")}
          </span>
        ) : <span class="wm-status ok">✓ keine Warnung</span>)}
      </span>
    </label>
  );
}

function Kleingedrucktes(p: { inh: Inhalte }) {
  const [offen, setOffen] = useState(false);
  const a = p.inh.szenario.argus_system;
  return (
    <span class="i-knopf-anker">
      <button type="button" class="i-knopf" onClick={() => setOffen(!offen)} aria-expanded={offen} title="Angaben des Herstellers" data-testid="kleingedrucktes-knopf">i</button>
      {offen && (
        <div class="i-text" data-testid="kleingedrucktes" onClick={() => setOffen(false)}>
          <b>{a.name}</b> – {a.herstellerangabe}
          <div class="klein" style="margin-top:4px">{a.kleingedrucktes}</div>
        </div>
      )}
    </span>
  );
}

export function ZBAnsicht(p: { s: Sicht }) {
  const { s } = p;
  const st = useStand(s);
  const t = useSpielzeit(s, 250);
  useEntfallHinweis(s, st, t);
  const inh = s.inh;
  const z = st.zustand;
  const start = inh.szenario.spieluhr.start;
  const offen = warteschlange(z);
  const neu = offen.filter((x) => !x.zurueckgestellt);
  const [gewaehlt, waehle] = useAuswahl(neu.map((x) => x.id), offen.map((x) => x.id));
  const [wm, setWm] = useState<string | null>(null);
  const [zeigeWm, setZeigeWm] = useState<string | null>(null);
  const ms = gewaehlt ? z.meldungen[gewaehlt] : null;
  const m = gewaehlt ? inh.meldungen[gewaehlt] : null;
  const gesperrt = !m || z.ende || st.nurLesen;
  const tLage = Math.floor(t);
  const lagebild = useMemo(() => lagebildZielmeldungen(inh, z, tLage), [inh, z, tLage]);
  const fx = useMemo(() => effekte(inh, z, bekannteZiele(inh, z)), [inh, z]);
  const injects = injectsFuer(inh, z);
  const unterwegs = z.reihenfolge.map((id) => z.meldungen[id]).filter((x) => x.stufe === "wirkung" && !x.wirkung);
  // Vermerke der letzten VERMERK_S Spielzeit, der neueste zuerst
  const vm = vermerke(inh, z, t).filter((v) => t - v.t < VERMERK_S).reverse();
  // Öffnen merken (Spielzeit), für die Sekunden „ab Öffnen“ (H2.4)
  const geoeffnet = useRef(new Map<string, number>());
  if (gewaehlt && !geoeffnet.current.has(gewaehlt)) geoeffnet.current.set(gewaehlt, t);
  // Lage für das Live-Drohnenbild: immer der neueste Stand
  const lage = useRef<LiveLage>({ inh, z, effekte: fx });
  lage.current = { inh, z, effekte: fx };
  // Bilder der nächsten zwei Meldungen vorladen
  const man = useManifest();
  const naechste = offen.map((x) => x.id).filter((id) => id !== gewaehlt).slice(0, 2);
  useEffect(() => {
    if (!man) return;
    vorladen(naechste.flatMap((id) => [...(drohnenEbenen(man, id)?.dateien ?? []), drohnenbild(man, id)?.datei ?? ""]).filter(Boolean));
  }, [man, naechste.join(",")]);
  // Wirkmittel zurücksetzen, wenn eine andere Meldung offen ist; aufgebrauchtes abwählen
  useEffect(() => setWm(null), [gewaehlt]);
  useEffect(() => {
    if (wm && z.bestand[wm] === 0) setWm(null);
  }, [wm, z.bestand[wm ?? ""]]);

  const oeffnen = (id: string | null) => {
    if (id === gewaehlt) return;
    waehle(id);
  };
  const entscheiden = (entscheid: "bekaempfen" | "zurueckstellen" | "ablehnen") => {
    if (!gewaehlt || gesperrt) return;
    if (entscheid === "bekaempfen" && !wm) return;
    const tOffen = geoeffnet.current.get(gewaehlt);
    s.senden("entscheid", {
      meldung: gewaehlt, entscheid, ...(entscheid === "bekaempfen" ? { wirkmittel: wm! } : {}), ...(tOffen !== undefined ? { t_offen: Math.round(tOffen * 10) / 10 } : {}),
    });
    setWm(null);
    waehle(null);
  };

  const vorschauWm = zeigeWm ?? wm;
  const vs = m && vorschauWm && z.bestand[vorschauWm] !== 0 ? vorschauFuer(inh, z, m, vorschauWm, t) : null;
  const gewaehltV = m && wm ? vorhersage(inh, m, wm, t, z.zerstoert, z.bestand[wm] ?? null) : null;
  const name = (id: string) => zielName(inh, z, id, false);
  const marken: KartenMarke[] = [...meldungsMarken(offen, gewaehlt, oeffnen, name), ...wirkungsMarken(lagebild, () => s.kartenUhr().t)];
  const a = m && ms ? argusBei(inh, m, ms.gestoert) : null;
  const bestand = wm ? z.bestand[wm] : undefined;
  const k = gewaehltV?.k ?? 1;
  const bekText = !wm ? "BEKÄMPFEN" : `BEKÄMPFEN mit ${inh.wirkmittel[wm].kurz}${k > 1 ? ` ×${k}` : ""}`;
  const bekUnter = !wm ? "erst Wirkmittel wählen" : typeof bestand === "number" ? `Bestand ${bestand} → ${Math.max(0, bestand - k)}` : "Kanone der 1. Kp";

  return (
    <main class="inhalt ansicht-zb">
      <LageFeed s={s} injects={injects} t={t} />
      <section class="panel ohne-rand karten-feld" data-testid="zb-karte" data-tour="karte">
        <LagekarteAnsicht inh={inh} lagebild={lagebild} vorschau={vs?.vorschau ?? null} gewaehlt={gewaehlt}
          onWahl={(id) => offen.some((x) => x.id === id) && oeffnen(id)} hintergrund="topo" legende="ziele" fuellen={KARTE_MITTE_ZB}
          uhr={() => s.kartenUhr()} effekte={fx} marken={marken}
          banner={vs && <div class={`karte-banner ${vs.vorschau.ok ? "ok" : "verstoss"}`} data-testid="karte-banner">
            {inh.wirkmittel[vorschauWm!].kurz}: Einschlag in {mss(vs.v.einschlag.t - t)} – {vs.vorschau.ok ? "keine Warnung" : `${vs.v.pruefung.verstoesse.map((x) => x.regel).join(", ")} verletzt`}
          </div>} />
      </section>
      <aside class="zb-rechts">
        <UnterwegsLeiste inh={inh} z={z} t={t} unterwegs={unterwegs} />
        <EingangListe inh={inh} z={z} t={t} offen={offen} vermerke={vm} gewaehlt={gewaehlt} waehle={oeffnen} />
        <section class="zb-meldung" data-tour="entscheiden" data-testid="offene-meldung" data-meldung={ms?.id}>
          {!m || !ms || !a ? (
            <div class="zb-warten" data-testid="zb-warten">
              {offen.length ? "Meldung im Eingang anklicken, um sie zu öffnen." : "Warten auf ARGUS-Meldungen … Neue Meldungen kommen oben in den Eingang und öffnen sich hier mit dem Drohnenbild."}
            </div>
          ) : (
            <>
              <div class="zb-kopf">
                <b data-testid="zb-ziel">{zielName(inh, z, m.id)}</b>
                <span class="leise">{ms.zurueckgestellt ? "zurückgestellt · " : ""}im Eingang seit <b class="zahl">{mss(t - ms.erschienen.t_s)}</b></span>
                {m.folge_von && <span class="sehr-leise klein">Folgemeldung zu {name(m.folge_von)}</span>}
                <span style="flex:1" />
                <Kleingedrucktes inh={inh} />
              </div>
              <div class="zb-drohne" style={{ maxWidth: `${DROHNEN_BILD.breite}px`, maxHeight: `${DROHNEN_BILD.hoehe}px` }} data-tour="drohne">
                <LiveDrohnenFenster key={m.id} meldung={m} argus={a} lage={() => lage.current} uhr={() => s.kartenUhr()} start={start} />
              </div>
              <div class="zb-argus" data-testid="argus-zeile">
                <span class="feldname">{inh.szenario.argus_system.name}</span>
                <b data-testid="argus-klasse">{argusZeile(inh, m, ms.gestoert)}</b>
                <Empfehlung wert={a.empfehlung} />
                <span class="sehr-leise klein">Bild {bildalter(inh, m, ms.gestoert)} s alt{a.gestoert ? " · Datenlink gestört" : ""}</span>
              </div>
              <div class="wm-liste" data-tour="wirkmittel" data-testid="wirkmittel" onMouseLeave={() => setZeigeWm(null)}>
                {Object.keys(inh.wirkmittel).map((id) => (
                  <WirkmittelZeile key={id} inh={inh} z={z} m={m} wm={id} t={t} gewaehlt={wm === id} gesperrt={gesperrt}
                    waehle={() => setWm(id)} zeige={(an) => setZeigeWm(an ? id : null)} />
                ))}
              </div>
            </>
          )}
          {/* seit 2.7 (I5.1): die Knöpfe stehen immer an derselben Stelle (ohne Meldung gesperrt) */}
          <div class="zb-knoepfe" data-testid="zb-knoepfe">
            <button type="button" class="knopf gross toedlich" disabled={gesperrt || !wm} onClick={() => entscheiden("bekaempfen")} data-testid="zb-bekaempfen"
              title={!m ? undefined : !wm ? "zuerst ein Wirkmittel wählen" : gewaehltV && !gewaehltV.pruefung.zulaessig ? "trotz Warnung – wird protokolliert" : undefined}>
              {bekText}<span class="unterzeile">{m ? bekUnter : "keine Meldung offen"}{gewaehltV && !gewaehltV.pruefung.zulaessig ? " · ⚠ trotz Warnung" : ""}</span>
            </button>
            <button type="button" class="knopf gross" disabled={gesperrt || !!ms?.zurueckgestellt} onClick={() => entscheiden("zurueckstellen")} data-testid="zb-zurueckstellen"
              title={ms?.zurueckgestellt ? "schon zurückgestellt" : "beobachten, später entscheiden"}>
              ZURÜCKSTELLEN<span class="unterzeile">beobachten</span>
            </button>
            <button type="button" class="knopf gross" disabled={gesperrt} onClick={() => entscheiden("ablehnen")} data-testid="zb-ablehnen">
              ABLEHNEN<span class="unterzeile">nicht bekämpfen</span>
            </button>
          </div>
        </section>
      </aside>
    </main>
  );
}
