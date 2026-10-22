// Drohnenbild einer ARGUS-Meldung mit ARGUS-Markierung (Eckrahmen, Klasse, Konfidenz).
// Bild und Rahmen kommen aus dem Asset-Manifest; die Markierung wird hier gezeichnet, nicht ins Bild
// eingebrannt, damit sie scharf bleibt. Ein Klick öffnet die Vergrößerung mit Lupe – wichtig für
// das Rote Kreuz (S2), die Kinder im Hof RABE (S4) und das weiße Tuch (N2).
import { useEffect, useRef, useState } from "preact/hooks";
import { type AssetManifest, type Drohnenbild, assetUrl, drohnenbild, ladeManifest, vorladen } from "../../assets/assets";
import type { Meldung } from "../../inhalte/typen";

export function useManifest(): AssetManifest | null {
  const [man, setMan] = useState<AssetManifest | null>(null);
  useEffect(() => {
    let aktiv = true;
    ladeManifest().then((m) => aktiv && setMan(m)).catch((e) => console.warn("Asset-Manifest:", e));
    return () => {
      aktiv = false;
    };
  }, []);
  return man;
}

/** Vergrößerung der Lupe: Start und Grenzen (Mausrad ändert sie). */
const LUPE = { start: 2.6, min: 1.6, max: 6 };

function Markierung(p: { m: Meldung; b: Drohnenbild }) {
  const { m, b } = p;
  const einzeln = m.argus.einzeln ?? [];
  return (
    <>
      {b.ziele.map((z, i) => (
        <div key={z.id} class="argus-rahmen" style={{
          left: `${(z.box[0] / b.breite) * 100}%`, top: `${(z.box[1] / b.hoehe) * 100}%`,
          width: `${(z.box[2] / b.breite) * 100}%`, height: `${(z.box[3] / b.hoehe) * 100}%`,
        }}>
          <span class={`argus-marke ${z.box[1] < 44 ? "unten" : ""}`}>{m.argus.klasse} · {einzeln[i] ?? m.argus.konfidenz} %</span>
        </div>
      ))}
    </>
  );
}

function Leisten(p: { uhr: string; bildalter: number; pq?: string }) {
  return (
    <>
      <div class="drohne-kopf"><span>ARGUS 3.2 │ UAV-2 „Milan“ │ EO Tag</span><span>{p.uhr}</span></div>
      <div class="drohne-fuss"><span>{p.pq ? `PQ ${p.pq} │ ` : ""}Bildalter {p.bildalter} s</span><span>Übung</span></div>
    </>
  );
}

export function DrohnenbildAnzeige(p: { meldung: Meldung; uhr: string; bildalter: number; naechste?: string[]; vergroesserbar?: boolean }) {
  const man = useManifest();
  const m = p.meldung;
  const b = man ? drohnenbild(man, m.id) : null;
  const [gross, setGross] = useState(false);
  useEffect(() => {
    if (man && p.naechste?.length) vorladen(p.naechste.map((id) => drohnenbild(man, id)?.datei).filter((d): d is string => !!d));
  }, [man, (p.naechste ?? []).join(",")]);
  useEffect(() => setGross(false), [m.id]);
  const zoom = p.vergroesserbar !== false && !!b;
  return (
    <>
      <div class={`drohne ${zoom ? "" : "ohne-zoom"}`} data-testid="drohnenbild" onClick={() => zoom && setGross(true)}
        role={zoom ? "button" : undefined} aria-label={zoom ? "Drohnenbild vergrößern" : undefined}>
        {b ? <img src={assetUrl(b.datei)} width={b.breite} height={b.hoehe} alt={m.bild.beschreibung} draggable={false} /> : <div class="drohne-leer">{man ? `Kein Drohnenbild – ${m.bild.beschreibung}` : "Bild wird geladen …"}</div>}
        {b && <Markierung m={m} b={b} />}
        <Leisten uhr={p.uhr} bildalter={p.bildalter} pq={b?.pq} />
        {zoom && <div class="drohne-lupe-hinweis">Klick: vergrößern mit Lupe</div>}
      </div>
      {gross && b && <Vergroesserung m={m} b={b} uhr={p.uhr} bildalter={p.bildalter} schliessen={() => setGross(false)} />}
    </>
  );
}

function Vergroesserung(p: { m: Meldung; b: Drohnenbild; uhr: string; bildalter: number; schliessen: () => void }) {
  const { m, b } = p;
  const rahmen = useRef<HTMLDivElement>(null);
  const [lupe, setLupe] = useState<{ x: number; y: number } | null>(null);
  const [faktor, setFaktor] = useState(LUPE.start);
  const [mass, setMass] = useState(() => masse());
  function masse() {
    const w = Math.min(window.innerWidth - 60, (window.innerHeight - 90) * (b.breite / b.hoehe));
    return { w: Math.round(w), h: Math.round(w * (b.hoehe / b.breite)) };
  }
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
  const url = assetUrl(b.datei);
  const r = 115;
  return (
    <div class="lupe-schirm" onClick={p.schliessen} data-testid="vergroesserung">
      <div class="lupe-rahmen" style={{ width: `${mass.w}px`, height: `${mass.h}px` }} onClick={(e) => e.stopPropagation()}>
        <div class="lupe-leiste">
          <span>Meldung {m.id} · Lupe folgt der Maus, {faktor.toLocaleString("de-DE", { maximumFractionDigits: 1 })}-fach · Mausrad: stärker/schwächer</span>
          <button type="button" class="knopf klein" onClick={p.schliessen}>Schließen (Esc)</button>
        </div>
        <div class="drohne" ref={rahmen} style={{ width: "100%", height: "100%" }}
          onPointerMove={(e) => {
            const rc = rahmen.current!.getBoundingClientRect();
            setLupe({ x: e.clientX - rc.left, y: e.clientY - rc.top });
          }}
          onPointerLeave={() => setLupe(null)}
          onWheel={(e) => {
            e.preventDefault();
            setFaktor((f) => Math.round(Math.max(LUPE.min, Math.min(LUPE.max, f * (e.deltaY < 0 ? 1.2 : 1 / 1.2))) * 10) / 10);
          }}>
          <img src={url} alt={m.bild.beschreibung} draggable={false} />
          <Markierung m={m} b={b} />
          <Leisten uhr={p.uhr} bildalter={p.bildalter} pq={b.pq} />
          {lupe && (
            <div class="lupe-glas" style={{
              left: `${lupe.x}px`, top: `${lupe.y}px`, backgroundImage: `url("${url}")`,
              backgroundSize: `${mass.w * faktor}px ${mass.h * faktor}px`,
              backgroundPosition: `${-(lupe.x * faktor - r)}px ${-(lupe.y * faktor - r)}px`,
            }} />
          )}
        </div>
      </div>
    </div>
  );
}
