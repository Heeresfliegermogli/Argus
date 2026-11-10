// Zielbearbeitung (intern zb; seit 2.6, Änderungen H2): eine Ansicht je Team, 2–3 Personen an einem Laptop, eine Entscheidung je
// Meldung. Aufbau seit Liste J (10.11.2026) – die ganze Karte passt ins Fenster, geprüft in 1536 × 730 (Dienst-Laptop), 1366 × 650,
// 1530 × 800 und 1920 × 960:
//   links   die Lagekarte, immer ganz und im Seitenverhältnis 10 : 7: Höhe = verfügbare Höhe unter der Kopfzeile, Breite = 1,43 × Höhe
//           (wird die rechte Spalte schmaler als 440 px, wird das Feld schmaler und die Karte steht mit schmalem Rand oben und unten
//           in der Mitte). Zoom, Verschieben und ⤢ bleiben. Oben links auf der Karte die Lagemeldungen als Einblendung (höchstens zwei,
//           wie I4: bis zum Klick oder 30 s Spielzeit, dann ganz weg – unter Druck laufen sie unter, S3 lebt davon), unten links die
//           Legende (einklappbar)
//   rechts  die Restbreite, feste Aufteilung von oben – nichts verschiebt sich: eine Zeile „Wirkung unterwegs“ (Chips „Ziel 17 ×3
//           0:23“, Rest „+3“ als Überlagerung), der Eingang mit fester Höhe für vier Zeilen und eigener Rollleiste (Wartezeit je
//           Meldung, Vermerke: verbündet, durchgebrochen, abgezogen, zerstört), darunter die geöffnete Meldung: Kopf, Live-Drohnenbild
//           (Klick: groß mit Lupe), ARGUS-Zeile, die drei Wirkmittel als Kacheln (Bestand groß, Countdown bis zum Einschlag, ✓/⚠),
//           eine Zeile Warnung zum gewählten Wirkmittel und ganz unten an fester Stelle BEKÄMPFEN mit … · ZURÜCKSTELLEN · ABLEHNEN
// Die Kopfzeile (rahmen.tsx) zeigt Uhr, Phase, die vier Panzer und den Bestand groß.
// Jede Entscheidung trägt die Sekunden ab Eingang und ab Öffnen ins Protokoll (H2.4). Der Team-Laptop rechnet das Spiel selbst:
// Ein Klick ist sofort im Spielstand – ohne Netz.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { drohnenbild, drohnenEbenen, vorladen } from "../assets/assets";
import type { LiveLage } from "../drohne/livebild";
import type { Inhalte, Meldung, Wirkmittel } from "../inhalte/typen";
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

// ---------------------------------------------------------------- Lagemeldungen als Einblendung auf der Karte (H5.5, I4, seit Liste J)

/** So lange (Spielzeit, s) steht eine Lagemeldung, wenn die Regeln nichts sagen. */
export const LAGEMELDUNG_S = 30;

/** Höchstens so viele Lagemeldungen stehen gleichzeitig auf der Karte (J1.2); weitere warten dahinter („+1 weitere“). */
export const LAGEMELDUNG_MAX = 2;

/**
 * Lagemeldungen, die gerade stehen (seit 2.7, I4): nicht angeklickt und höchstens lagemeldung_s Spielzeit alt, die neueste zuerst.
 * Angeklickte und abgelaufene sind ganz weg (Spielleitung und Auswertung sehen weiter alle).
 */
export function feedSichtbar(inh: Inhalte, injects: InjectStand[], t: number): InjectStand[] {
  const sek = inh.regeln.anzeige?.lagemeldung_s ?? LAGEMELDUNG_S;
  return [...injects].reverse().filter((i) => !i.quittiert && t - i.erschienen.t_s < sek);
}

/**
 * Lagemeldungen auf der Karte (seit Liste J, J1.2): die neuesten zwei, die übrigen stehenden dahinter. Eine verdeckte läuft weiter
 * ab und erscheint, sobald eine der beiden weg ist (Klick oder 30 s) – mit ihrer Restzeit.
 */
export function lageEinblendung(inh: Inhalte, injects: InjectStand[], t: number): { zeigen: InjectStand[]; weitere: InjectStand[] } {
  const alle = feedSichtbar(inh, injects, t);
  return { zeigen: alle.slice(0, LAGEMELDUNG_MAX), weitere: alle.slice(LAGEMELDUNG_MAX) };
}

/**
 * Einblendung oben links auf der Karte (seit Liste J statt eigener Spalte): je Lagemeldung Absender, Zeit, Text, Restbalken und ✕.
 * Während der Einweisung steht hier ein Beispiel, falls gerade keine echte Lagemeldung da ist (nur sichtbar, solange die Übersicht
 * läuft: body[data-tour]).
 */
function LageEinblendung(p: { s: Sicht; injects: InjectStand[]; t: number }) {
  const { s } = p;
  const inh = s.inh;
  const sek = inh.regeln.anzeige?.lagemeldung_s ?? LAGEMELDUNG_S;
  const { zeigen, weitere } = lageEinblendung(inh, p.injects, p.t);
  const lesen = (i: InjectStand) => {
    if (!i.quittiert && !s.nurLesen) s.senden("inject_quittiert", { inject: i.id });
  };
  return (
    <section class="lage-einblendung" data-tour="feed" data-testid="feed" aria-label="Lagemeldungen" aria-live="polite">
      <div class="feed-frisch" data-testid="feed-frisch">
        {zeigen.map((i) => {
          const a = injectAnzeige(inh, i);
          const rest = Math.max(0, Math.min(1, 1 - (p.t - i.erschienen.t_s) / sek));
          return (
            <button type="button" key={i.id} class={`feed-meldung frisch echt ${(i.stufe ?? 0) >= 2 ? "dringend" : ""}`} data-inject={i.id} onClick={() => lesen(i)}
              title={`Klick: gelesen – die Meldung verschwindet (sonst nach ${sek} s)`}>
              <div class="feed-von"><span class="feed-titel">Lagemeldung</span> · {a.von} · {mss(i.erschienen.t_s)}<span class="feed-x" aria-label="gelesen">✕</span></div>
              <div class="feed-text">{a.text}</div>
              <i class="feed-rest" style={{ width: `${Math.round(rest * 100)}%` }} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      {weitere.length > 0 && (
        <div class="feed-weitere" data-testid="feed-weitere" title="Höchstens zwei Lagemeldungen stehen gleichzeitig auf der Karte. Klickt eine weg, erscheint die nächste.">
          + {weitere.length} weitere Lagemeldung{weitere.length > 1 ? "en" : ""}
        </div>
      )}
      <div class="feed-meldung feed-beispiel" aria-hidden="true">
        <div class="feed-von"><span class="feed-titel">Lagemeldung</span> · Brigade · Beispiel<span class="feed-x">✕</span></div>
        <div class="feed-text">So erscheinen Meldungen von Brigade, Nachbarn und 1. Kp – 30 Sekunden lang oder bis ihr sie anklickt.</div>
        <i class="feed-rest" style="width:62%" />
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
      <div class="eingang-liste" data-liste>
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

/** Warnungen eines Wirkmittels am vorausberechneten Einschlagort (dazu: Bestand reicht nicht für alle Fahrzeuge). */
function warnungen(w: Wirkmittel, v: ZugWirkung): string[] {
  const nurK = zugArt(w) === "je_fahrzeug" && v.k < v.n;
  return [...v.pruefung.verstoesse.map((x) => `${x.regel}: ${x.text}`), ...(nurK ? [`nur ${v.k} von ${v.n} Fahrzeugen – Bestand reicht nicht`] : [])];
}

/**
 * Ein Wirkmittel als Kachel (seit Liste J, J1.3): Name, Bestand groß, Countdown bis zum Einschlag, ✓ (keine Warnung) oder ⚠. Ohne
 * offene Meldung zeigt die Kachel nur den Bestand – sie steht immer an derselben Stelle.
 */
function WirkmittelKachel(p: {
  inh: Inhalte; z: Spielzustand; m: Meldung | null; wm: string; t: number; gewaehlt: boolean; gesperrt: boolean; waehle: () => void; zeige: (an: boolean) => void;
}) {
  const { inh, z, m, wm, t } = p;
  const w = inh.wirkmittel[wm];
  const bestand = z.bestand[wm];
  const leer = bestand === 0;
  const v = m ? vorhersage(inh, m, wm, t, z.zerstoert, bestand ?? null) : null;
  const knapp = bestandKnapp(inh, wm, bestand);
  const warn = v ? warnungen(w, v) : [];
  const ohneBestand = bestand === null || bestand === undefined;
  const titel = `${w.name}${ohneBestand ? " – kein Bestand nötig" : `: ${bestand} übrig`}${v && !leer ? `\nEinschlag in ${mss(v.einschlag.t - t)}${v.k > 1 ? ` · ×${v.k}` : ""}` : ""}${warn.length ? `\n⚠ ${warn.join("\n⚠ ")}` : v && !leer ? "\n✓ keine Warnung" : ""}`;
  return (
    <label class={`wm-kachel ${p.gewaehlt ? "gewaehlt" : ""} ${leer ? "aus" : ""} ${warn.length ? "warn" : ""} ${!m ? "ohne" : ""}`} data-wm={wm} title={titel}
      onMouseEnter={() => p.zeige(true)} onMouseLeave={() => p.zeige(false)}>
      <span class="wk-oben">
        <input type="radio" name="wm" checked={p.gewaehlt} disabled={leer || p.gesperrt} onChange={p.waehle} />
        <span class="wk-name">{w.kurz}</span>
        <b class={`wk-bestand ${knapp ? "knapp" : ""} ${leer ? "leer" : ""} ${ohneBestand ? "ohne" : ""}`} data-bestand={bestand ?? ""}>{ohneBestand ? "∞" : bestand}</b>
      </span>
      <span class="wk-unten">
        {leer ? <span class="wk-zeit">aufgebraucht</span> : v ? (
          <>
            <span class="wk-zeit">Einschlag <b class="zahl">{mss(v.einschlag.t - t)}</b>{v.k > 1 ? <span class="leise"> ×{v.k}</span> : null}</span>
            <span class={`wk-status ${warn.length ? "verstoss" : "ok"}`} data-status={warn.length ? "warnung" : "ok"}>{warn.length ? "⚠" : "✓"}</span>
          </>
        ) : <span class="wk-zeit sehr-leise">–</span>}
      </span>
    </label>
  );
}

/**
 * Eine Zeile unter den Kacheln (J1.3): Warnung zum gezeigten Wirkmittel (Maus darüber, sonst das gewählte) – voller Text als Tooltip
 * und per Klick als Kasten darüber (verschiebt nichts).
 */
function WarnZeile(p: { inh: Inhalte; z: Spielzustand; m: Meldung | null; wm: string | null; t: number }) {
  const { inh, z, m, wm, t } = p;
  const [offen, setOffen] = useState(false);
  useEffect(() => setOffen(false), [m?.id, wm]);
  if (!m) return <div class="wm-warnzeile sehr-leise" data-testid="wm-warnung">Meldung öffnen, dann Wirkmittel wählen.</div>;
  if (!wm) return <div class="wm-warnzeile sehr-leise" data-testid="wm-warnung">Wirkmittel wählen – die Karte zeigt, wo es einschlägt.</div>;
  const w = inh.wirkmittel[wm];
  if (z.bestand[wm] === 0) return <div class="wm-warnzeile leise" data-testid="wm-warnung" data-wm={wm}>{w.kurz}: aufgebraucht</div>;
  const v = vorhersage(inh, m, wm, t, z.zerstoert, z.bestand[wm] ?? null);
  const warn = warnungen(w, v);
  if (!warn.length) return <div class="wm-warnzeile ok" data-testid="wm-warnung" data-wm={wm}>✓ {w.kurz}: keine Warnung am Einschlagort</div>;
  const text = `⚠ ${w.kurz}: ${warn.join(" · ")}`;
  return (
    <div class="wm-warnzeile verstoss" data-testid="wm-warnung" data-wm={wm} title={warn.join("\n")} role="button" tabIndex={0}
      onClick={() => setOffen(!offen)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOffen(!offen)}>
      <span class="wm-warntext">{text}</span>
      {offen && <div class="wm-warn-voll" data-testid="wm-warnung-voll">{warn.map((x) => <div key={x}>⚠ {x}</div>)}</div>}
    </div>
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
      <div class="zb-raster">
        <section class="karten-feld" data-testid="zb-karte" data-tour="karte">
          <LagekarteAnsicht inh={inh} lagebild={lagebild} vorschau={vs?.vorschau ?? null} gewaehlt={gewaehlt}
            onWahl={(id) => offen.some((x) => x.id === id) && oeffnen(id)} hintergrund="topo" legende="ziele" senkrechtMitte
            uhr={() => s.kartenUhr()} effekte={fx} marken={marken} ecke={<LageEinblendung s={s} injects={injects} t={t} />}
            banner={vs && <div class={`karte-banner unten ${vs.vorschau.ok ? "ok" : "verstoss"}`} data-testid="karte-banner">
              {inh.wirkmittel[vorschauWm!].kurz}: Einschlag in {mss(vs.v.einschlag.t - t)} – {vs.vorschau.ok ? "keine Warnung" : `${vs.v.pruefung.verstoesse.map((x) => x.regel).join(", ")} verletzt`}
            </div>} />
        </section>
        <aside class="zb-rechts">
          <UnterwegsLeiste inh={inh} z={z} t={t} unterwegs={unterwegs} />
          <EingangListe inh={inh} z={z} t={t} offen={offen} vermerke={vm} gewaehlt={gewaehlt} waehle={oeffnen} />
          <section class="zb-meldung" data-tour="entscheiden" data-testid="offene-meldung" data-meldung={ms?.id}>
            <div class="zb-kopf">
              {m && ms ? (
                <>
                  <b data-testid="zb-ziel">{zielName(inh, z, m.id)}</b>
                  <span class="leise">{ms.zurueckgestellt ? "zurückgestellt · " : ""}im Eingang seit <b class="zahl">{mss(t - ms.erschienen.t_s)}</b></span>
                  {m.folge_von && <span class="sehr-leise klein einzeilig">Folgemeldung zu {name(m.folge_von)}</span>}
                </>
              ) : <span class="sehr-leise">keine Meldung offen</span>}
              <span style="flex:1" />
              <Kleingedrucktes inh={inh} />
            </div>
            <div class="zb-drohne" data-tour="drohne">
              {m && ms && a ? (
                <div class="zb-drohne-bild">
                  <LiveDrohnenFenster key={m.id} meldung={m} argus={a} lage={() => lage.current} uhr={() => s.kartenUhr()} start={start} />
                </div>
              ) : (
                <div class="zb-warten" data-testid="zb-warten">
                  {offen.length ? "Meldung im Eingang anklicken, um sie zu öffnen." : "Warten auf ARGUS-Meldungen … Neue Meldungen kommen in den Eingang und öffnen sich hier mit dem Drohnenbild."}
                </div>
              )}
            </div>
            <div class="zb-argus" data-testid="argus-zeile">
              <span class="feldname">{inh.szenario.argus_system.name}</span>
              {m && ms && a ? (
                <>
                  <b data-testid="argus-klasse">{argusZeile(inh, m, ms.gestoert)}</b>
                  <Empfehlung wert={a.empfehlung} />
                  <span class="sehr-leise klein einzeilig">Bild {bildalter(inh, m, ms.gestoert)} s alt{a.gestoert ? " · Datenlink gestört" : ""}</span>
                </>
              ) : <span class="sehr-leise">–</span>}
            </div>
            <div class="wm-kacheln" data-tour="wirkmittel" data-testid="wirkmittel" onMouseLeave={() => setZeigeWm(null)}>
              {Object.keys(inh.wirkmittel).map((id) => (
                <WirkmittelKachel key={id} inh={inh} z={z} m={m} wm={id} t={t} gewaehlt={wm === id} gesperrt={gesperrt}
                  waehle={() => setWm(id)} zeige={(an) => setZeigeWm(an ? id : null)} />
              ))}
            </div>
            <WarnZeile inh={inh} z={z} m={m} wm={vorschauWm} t={t} />
            {/* seit 2.7 (I5.1), Liste J: die Knöpfe stehen immer ganz unten an derselben Stelle (ohne Meldung gesperrt) */}
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
      </div>
    </main>
  );
}
