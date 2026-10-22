// Live-Drohnenbild in der Ansicht G1 (Schritt 6b): als Fenster am Ort des Ziels auf der Karte und – per Klick –
// groß mit Lupe. Gezeichnet wird mit src/drohne/livebild.ts auf eine Leinwand; die ARGUS-Markierung (Eckrahmen,
// Klasse, Konfidenz) liegt als HTML darüber, folgt dem Fahrzeug und bleibt so scharf wie zuvor.
//
// Takt: höchstens 30 Bilder/s, solange die Uhr läuft (Fahrzeuge fahren), sonst 12 für Schleifen (Feuer, Rauch,
// Bildstörung), sonst nur bei Änderungen; höchstens `?fps=…`. Bildrate und Zeichenzeit stehen am Element
// (data-fps, data-ms) und unter `argusLive` (Tests, Fehlersuche).
import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { type AssetManifest, assetUrl, drohnenbild } from "../../assets/assets";
import type { BildZiel, Drohnenbild } from "../../assets/typen";
import { type LiveDrohnenbild, type LiveLage, type LiveTransform, type Szene, erzeugeLiveBild, vergleicheMitStandbild } from "../../drohne/livebild";
import type { Meldung } from "../../inhalte/typen";
import { bildrateMax } from "../../karte/bildrate";
import type { KartenUhr } from "../../karte/lagekarte";
import { uhrzeit } from "../../kern/uhr";
import { useManifest } from "./drohnenbild";

/** Vergrößerung der Lupe: Start und Grenzen (Mausrad ändert sie). */
const LUPE = { start: 2.6, min: 1.6, max: 6, radius: 115 };

/** Live-Bild einer Meldung laden (Ressourcen werden geteilt); null, solange es lädt oder keine Ebenen hat. */
export function useLiveBild(man: AssetManifest | null, id: string | null): LiveDrohnenbild | null {
  const [bild, setBild] = useState<LiveDrohnenbild | null>(null);
  useEffect(() => {
    setBild(null);
    if (!man || !id) return;
    let aktiv = true;
    erzeugeLiveBild(man, id).then((b) => aktiv && setBild(b)).catch((e) => console.warn("Live-Drohnenbild:", e));
    return () => {
      aktiv = false;
    };
  }, [man, id]);
  return bild;
}

interface LeinwandOpt {
  bild: LiveDrohnenbild;
  lage: () => LiveLage;
  uhr: () => KartenUhr;
  start: string;
  /** Leinwand zeichnet nicht (z. B. Fenster hinter der Vergrößerung) */
  pausiert?: boolean;
  /** Lupe: Zeiger in CSS-px über dem Bild, Faktor */
  lupe?: { x: number; y: number; faktor: number } | null;
}

/**
 * Zeichen-Takt für eine Leinwand (und optional die Lupe): rechnet die Szene, zeichnet, setzt die
 * ARGUS-Rahmen (HTML, in % des Bildes) und die Uhrzeit im Kopf.
 */
interface TaktElemente {
  huelle: HTMLElement | null;
  leinwand: HTMLCanvasElement | null;
  lupe: HTMLCanvasElement | null;
  rahmen: Map<string, HTMLElement>;
  /** Kopfzeile rechts: „● LIVE 10:14:31“ bzw. „AUFNAHME 10:14:30“ */
  status: HTMLElement | null;
}

function useLiveTakt(o: LeinwandOpt, refs: { current: TaktElemente }): void {
  const opt = useRef(o);
  opt.current = o;
  useEffect(() => {
    let lauf = 0;
    let letztes = 0;
    let schluessel = "";
    /** laufen im letzten Bild Schleifen in Echtzeit (Feuer, Rauch, Mündungsblitz, Nebel, Bildstörung)? */
    let schleifen = true;
    let zaehler = { n: 0, ab: performance.now() };
    const zeichne = (jetzt: number) => {
      lauf = requestAnimationFrame(zeichne);
      const x = opt.current;
      const e = refs.current;
      const lw = e.leinwand;
      if (x.pausiert || !lw || !e.huelle) return;
      const u = x.uhr();
      const lage = x.lage();
      const ziel = u.laeuft ? 30 : schleifen ? 12 : 0;
      const w = e.huelle.clientWidth;
      const h = e.huelle.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const bw = Math.max(1, Math.round(w * dpr));
      const bh = Math.max(1, Math.round(h * dpr));
      const lu = x.lupe;
      const k = `${bw}x${bh}|${u.t.toFixed(2)}|${lage.z.seq}|${lu && e.lupe ? `${lu.x},${lu.y},${lu.faktor}` : ""}`;
      const faellig = ziel > 0 ? jetzt - letztes >= 1000 / Math.min(ziel, bildrateMax()) - 4 : k !== schluessel;
      if (!faellig) return;
      letztes = jetzt;
      const b = x.bild;
      const sz: Szene = b.szene(lage, u.t);
      // Hat das Ziel den Ausschnitt verlassen (die Kamera steht), zeigt das Bild die Aufnahme zur Meldezeit.
      const aufnahme = !sz.zielImBild;
      const tMeldung = b.meldezeit(lage.inh);
      // Aufnahme: nur neu zeichnen, wenn sich Größe oder Lupe ändern (Rahmen und Kopf folgen trotzdem)
      const kz = aufnahme ? `A|${bw}x${bh}|${lu && e.lupe ? `${lu.x},${lu.y},${lu.faktor}` : ""}` : k;
      const malen = !(aufnahme && kz === schluessel);
      schluessel = kz;
      if (lw.width !== bw || lw.height !== bh) {
        lw.width = bw;
        lw.height = bh;
      }
      const ctx = lw.getContext("2d");
      if (!ctx) return;
      schleifen = !aufnahme && (!!b.db.ebenen?.bildstoerung || sz.fahrzeuge.some((f) => f.wrack || f.feuert)
        || lage.effekte.some((f) => f.art === "nebel" && f.t <= u.t && u.t <= (f.bis ?? f.t)));
      const tr: LiveTransform = { s: bw / b.breite, ox: 0, oy: 0 };
      if (malen) {
        if (aufnahme) b.zeichneAufnahme(ctx, tr, bw, bh);
        else b.zeichne(ctx, sz, lage, u.tempo, jetzt, tr, bw, bh);
        // Lupe: dieselbe Szene (bzw. Aufnahme), stärker vergrößert, Zeiger in der Mitte
        if (lu && e.lupe) {
          const ld = Math.round(LUPE.radius * 2 * dpr);
          if (e.lupe.width !== ld) e.lupe.width = e.lupe.height = ld;
          const lc = e.lupe.getContext("2d");
          if (lc) {
            const s = (w / b.breite) * lu.faktor * dpr;
            const ix = (lu.x / w) * b.breite;
            const iy = (lu.y / h) * b.hoehe;
            const ltr = { s, ox: ld / 2 - ix * s, oy: ld / 2 - iy * s };
            if (aufnahme) b.zeichneAufnahme(lc, ltr, ld, ld);
            else b.zeichne(lc, sz, lage, u.tempo, jetzt, ltr, ld, ld);
          }
        }
        zaehler.n += 1;
      }
      e.huelle.classList.toggle("aufnahme", aufnahme);
      if (e.status) {
        const txt = aufnahme ? `AUFNAHME ${uhrzeit(x.start, tMeldung)}` : `● LIVE ${uhrzeit(x.start, u.t)}`;
        if (e.status.textContent !== txt) e.status.textContent = txt;
      }
      // ARGUS-Rahmen: live am Fahrzeug, in der Aufnahme wie im Manifest
      const marken = aufnahme ? (b.db.ziele as BildZiel[]).map((z) => ({ id: z.id, box: z.box })) : sz.marken;
      const da = new Set<string>();
      for (const m of marken) {
        const r = e.rahmen.get(m.id);
        if (!r) continue;
        da.add(m.id);
        const [bx, by, bwid, bhoe] = m.box;
        r.style.left = `${(bx / b.breite) * 100}%`;
        r.style.top = `${(by / b.hoehe) * 100}%`;
        r.style.width = `${(bwid / b.breite) * 100}%`;
        r.style.height = `${(bhoe / b.hoehe) * 100}%`;
        // Beschriftung unter den Rahmen, wenn sie oben in die Kopfleiste ragte (ca. 36 px auf dem Schirm)
        r.firstElementChild?.classList.toggle("unten", (by / b.hoehe) * h < 38);
        r.style.visibility = "visible";
      }
      for (const [id, r] of e.rahmen) if (!da.has(id)) r.style.visibility = "hidden";
      // Bildrate (gezeichnete Bilder je Sekunde) und Zeichenzeit am Element
      if (jetzt - zaehler.ab >= 1000) {
        lw.dataset.fps = String(Math.round((zaehler.n * 1000) / (jetzt - zaehler.ab)));
        lw.dataset.ms = `${b.bildMs.mittel.toFixed(1)}/${b.bildMs.max.toFixed(1)}`;
        zaehler = { n: 0, ab: jetzt };
      }
      (lw as unknown as { argusLive?: unknown }).argusLive = {
        meldung: b.id, t: u.t, fps: Number(lw.dataset.fps ?? 0), bildMs: { ...b.bildMs },
        fahrzeuge: sz.fahrzeuge.map((f) => ({ id: f.id, sprite: f.sprite, px: f.px.map((v) => Math.round(v)), wrack: f.wrack })),
        figuren: sz.figuren.map((f) => ({ bei: f.fg.bei, art: f.fg.art, sprite: f.fg.sprite, px: f.px.map((v) => Math.round(v)) })),
        marken: marken.map((m) => m.id), zielImBild: sz.zielImBild, aufnahme, effekte: aufnahme ? [] : [...b.gezeigt],
        vergleich: () => vergleicheMitStandbild(b, opt.current.lage()),
      };
    };
    lauf = requestAnimationFrame(zeichne);
    return () => cancelAnimationFrame(lauf);
  }, []);
}

/** Kopf- und Fußleiste wie im Bild der Drohne: rechts „● LIVE“ mit laufender Uhr bzw. „AUFNAHME“ mit der Meldezeit. */
function Leisten(p: { statusRef: (el: HTMLElement | null) => void; pq: string; start: string; t: number }) {
  return (
    <>
      <div class="drohne-kopf"><span>ARGUS 3.2 │ UAV-2 „Milan“ │ EO Tag</span><span class="live-status" ref={p.statusRef}>● LIVE {uhrzeit(p.start, p.t)}</span></div>
      <div class="drohne-fuss"><span>PQ {p.pq}</span><span class="nur-aufnahme">Ziel hat das Bild verlassen</span><span>Übung</span></div>
    </>
  );
}

/** Die Leinwand mit ARGUS-Rahmen und Leisten (Fenster am Ort und Vergrößerung). */
function LiveLeinwand(p: LeinwandOpt & { meldung: Meldung; db: Drohnenbild; lupeAn?: boolean; testid?: string }) {
  const { meldung: m, db } = p;
  const huelle = useRef<HTMLDivElement>(null);
  const leinwand = useRef<HTMLCanvasElement>(null);
  const lupe = useRef<HTMLCanvasElement>(null);
  const rahmen = useRef(new Map<string, HTMLElement>());
  const status = useRef<HTMLElement | null>(null);
  const refs = useRef<TaktElemente>({ huelle: null, leinwand: null, lupe: null, rahmen: rahmen.current, status: null });
  refs.current = { huelle: huelle.current, leinwand: leinwand.current, lupe: lupe.current, rahmen: rahmen.current, status: status.current };
  useLiveTakt(p, refs);
  // Refs nach dem Einhängen nachtragen (der Takt liest refs.current)
  useEffect(() => {
    refs.current = { huelle: huelle.current, leinwand: leinwand.current, lupe: lupe.current, rahmen: rahmen.current, status: status.current };
  });
  const einzeln = m.argus.einzeln ?? [];
  const t0 = p.uhr().t;
  return (
    <div class="drohne live" ref={huelle} data-testid={p.testid} data-meldung={m.id}>
      <canvas ref={leinwand} class="live-leinwand" data-testid="live-leinwand" aria-label={`Live-Drohnenbild ${m.id}: ${m.bild.beschreibung}`} />
      {db.ziele.map((z, i) => (
        <div key={z.id} class="argus-rahmen" style="visibility:hidden" data-ziel={z.id}
          ref={(el) => { if (el) rahmen.current.set(z.id, el); else rahmen.current.delete(z.id); }}>
          <span class="argus-marke">{m.argus.klasse} · {einzeln[i] ?? m.argus.konfidenz} %</span>
        </div>
      ))}
      <Leisten statusRef={(el) => { status.current = el; }} pq={db.pq} start={p.start} t={t0} />
      {p.lupeAn && (
        <canvas ref={lupe} class="lupe-glas live" data-testid={p.lupe ? "lupe" : undefined}
          style={p.lupe ? { left: `${p.lupe.x}px`, top: `${p.lupe.y}px`, visibility: "visible" } : { visibility: "hidden" }} />
      )}
    </div>
  );
}

/**
 * Drohnenbild im Fenster am Ort (Karte G1): live aus den Ebenen; bis die Ebenen geladen sind (oder ohne Ebenen)
 * das Standbild. Klick öffnet die Vergrößerung mit Lupe.
 */
export function LiveDrohnenFenster(p: {
  meldung: Meldung; lage: () => LiveLage; uhr: () => KartenUhr; start: string;
}) {
  const man = useManifest();
  const m = p.meldung;
  const db = man ? drohnenbild(man, m.id) : null;
  const bild = useLiveBild(man, m.id);
  const [gross, setGross] = useState(false);
  useEffect(() => setGross(false), [m.id]);
  return (
    <>
      <div class="drohne-fenster" role="button" tabIndex={0} aria-label="Drohnenbild vergrößern" data-testid="drohnenbild"
        onClick={() => db && setGross(true)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && db && setGross(true)}>
        {bild && db ? (
          <LiveLeinwand bild={bild} meldung={m} db={db} lage={p.lage} uhr={p.uhr} start={p.start} pausiert={gross} testid="live-fenster" />
        ) : (
          <div class="drohne">
            {db ? <img src={assetUrl(db.datei)} width={db.breite} height={db.hoehe} alt={m.bild.beschreibung} draggable={false} />
              : <div class="drohne-leer">{man ? `Kein Drohnenbild – ${m.bild.beschreibung}` : "Bild wird geladen …"}</div>}
          </div>
        )}
        {db && <div class="drohne-lupe-hinweis">Klick: groß mit Lupe</div>}
      </div>
      {/* über dem ganzen Fenster: außerhalb der Karte einhängen (das Fenster am Ort ist verschoben und schneidet ab) */}
      {gross && db && createPortal(
        <LiveVergroesserung m={m} db={db} bild={bild} lage={p.lage} uhr={p.uhr} start={p.start} schliessen={() => setGross(false)} />,
        document.body,
      )}
    </>
  );
}

/** Vergrößerung über dem ganzen Fenster: Live-Bild groß, Lupe folgt der Maus (Mausrad: stärker/schwächer). */
function LiveVergroesserung(p: {
  m: Meldung; db: Drohnenbild; bild: LiveDrohnenbild | null; lage: () => LiveLage; uhr: () => KartenUhr; start: string; schliessen: () => void;
}) {
  const { m, db } = p;
  const rahmen = useRef<HTMLDivElement>(null);
  const [lupe, setLupe] = useState<{ x: number; y: number } | null>(null);
  const [faktor, setFaktor] = useState(LUPE.start);
  const masse = () => {
    const w = Math.min(window.innerWidth - 60, (window.innerHeight - 90) * (db.breite / db.hoehe));
    return { w: Math.round(w), h: Math.round(w * (db.hoehe / db.breite)) };
  };
  const [mass, setMass] = useState(masse);
  useEffect(() => {
    const taste = (e: KeyboardEvent) => e.key === "Escape" && p.schliessen();
    const groesse = () => setMass(masse());
    window.addEventListener("keydown", taste);
    window.addEventListener("resize", groesse);
    return () => {
      window.removeEventListener("keydown", taste);
      window.removeEventListener("resize", groesse);
    };
  }, []);
  const url = assetUrl(db.datei);
  return (
    <div class="lupe-schirm" onClick={p.schliessen} data-testid="vergroesserung">
      <div class="lupe-rahmen" style={{ width: `${mass.w}px`, height: `${mass.h}px` }} onClick={(e) => e.stopPropagation()}>
        <div class="lupe-leiste">
          <span>Meldung {m.id} · Lupe folgt der Maus, {faktor.toLocaleString("de-DE", { maximumFractionDigits: 1 })}-fach · Mausrad: stärker/schwächer</span>
          <button type="button" class="knopf klein" onClick={p.schliessen}>Schließen (Esc)</button>
        </div>
        <div ref={rahmen} style={{ width: "100%", height: "100%" }}
          onPointerMove={(e) => {
            const rc = rahmen.current!.getBoundingClientRect();
            setLupe({ x: e.clientX - rc.left, y: e.clientY - rc.top });
          }}
          onPointerLeave={() => setLupe(null)}
          onWheel={(e) => {
            e.preventDefault();
            setFaktor((f) => Math.round(Math.max(LUPE.min, Math.min(LUPE.max, f * (e.deltaY < 0 ? 1.2 : 1 / 1.2))) * 10) / 10);
          }}>
          {p.bild ? (
            <LiveLeinwand bild={p.bild} meldung={m} db={db} lage={p.lage} uhr={p.uhr} start={p.start} lupeAn
              lupe={lupe ? { ...lupe, faktor } : null} testid="live-gross" />
          ) : (
            // ohne Ebenen: Standbild mit Lupe wie bisher
            <div class="drohne" style={{ width: "100%", height: "100%" }}>
              <img src={url} alt={m.bild.beschreibung} draggable={false} />
              {lupe && (
                <div class="lupe-glas" style={{
                  left: `${lupe.x}px`, top: `${lupe.y}px`, backgroundImage: `url("${url}")`,
                  backgroundSize: `${mass.w * faktor}px ${mass.h * faktor}px`,
                  backgroundPosition: `${-(lupe.x * faktor - LUPE.radius)}px ${-(lupe.y * faktor - LUPE.radius)}px`,
                }} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
