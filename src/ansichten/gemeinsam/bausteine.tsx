// Kleine wiederverwendbare Bausteine der Ansichten.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Hinweis } from "../../sitzung/hinweise";
import type { Sicht } from "../../sitzung/sicht";

/** Schrittnummer wie auf der Einweisungskarte. */
export function Schritt(p: { nr: number }) {
  return <span class="schritt" aria-label={`Schritt ${p.nr}`}>{p.nr}</span>;
}

/**
 * Feld mit Kopfzeile. `liste`: Inhalt darf länger werden als das Feld und rollt dann ohne
 * sichtbaren Balken (unten ausgeblendet, solange mehr folgt).
 */
export function Panel(p: {
  titel: ComponentChildren; rechts?: ComponentChildren; children?: ComponentChildren; klasse?: string; stil?: string;
  schritt?: number; liste?: boolean; testid?: string;
  /** geöffnete Meldung (data-meldung, für Tests und Fehlersuche) */
  meldung?: string;
}) {
  return (
    <section class={`panel ${p.klasse ?? ""}`} style={p.stil} data-testid={p.testid} data-meldung={p.meldung}>
      <header>
        <h2>{p.schritt !== undefined && <Schritt nr={p.schritt} />}<span>{p.titel}</span></h2>
        {p.rechts}
      </header>
      {p.liste ? <RollRumpf>{p.children}</RollRumpf> : <div class="rumpf">{p.children}</div>}
    </section>
  );
}

function RollRumpf(p: { children?: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ueber, setUeber] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pruefen = () => setUeber(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    pruefen();
    const ro = new ResizeObserver(pruefen);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    el.addEventListener("scroll", pruefen, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", pruefen);
    };
  }, []);
  return <div ref={ref} class={`rumpf rolle-liste ${ueber ? "ueberlauf" : ""}`} data-liste="1"><div>{p.children}</div></div>;
}

export function Leer(p: { children: ComponentChildren }) {
  return <div class="leer">{p.children}</div>;
}

const EMPF_KLASSE: Record<string, string> = {
  "BEKÄMPFEN": "e-bek", "PRÜFEN": "e-pru", "UNKLAR": "e-unk", "NICHT BEKÄMPFEN": "e-nicht",
};

export function Empfehlung(p: { wert: string }) {
  return <span class={`empfehlung ${EMPF_KLASSE[p.wert] ?? ""}`}>{p.wert}</span>;
}

export function Konfidenz(p: { wert: number }) {
  return (
    <div class="konfidenz">
      <div class="balken"><i style={{ width: `${Math.max(0, Math.min(100, p.wert))}%` }} /></div>
      <span class="mono">{p.wert} %</span>
    </div>
  );
}

/** Ton bei neuer Meldung nur auf Wunsch (?ton=1, im Browser gemerkt) – im Hörsaal mit 15 Rechnern sonst zu laut. */
function tonAn(): boolean {
  try {
    const q = new URLSearchParams(location.search).get("ton");
    if (q !== null) localStorage.setItem("argus:einst:ton", q === "1" ? "1" : "0");
    return localStorage.getItem("argus:einst:ton") === "1";
  } catch {
    return false;
  }
}

let tonKontext: AudioContext | null = null;
function ton(): void {
  try {
    tonKontext ??= new AudioContext();
    const o = tonKontext.createOscillator();
    const g = tonKontext.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.08, tonKontext.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, tonKontext.currentTime + 0.18);
    o.connect(g).connect(tonKontext.destination);
    o.start();
    o.stop(tonKontext.currentTime + 0.2);
  } catch {
    /* ohne Ton */
  }
}

/** Neueste neu eingegangene Meldung der letzten 6 s (was beim ersten Bild schon da ist, gilt als gesehen); Ton auf Wunsch. */
export function useNeueMeldung(offen?: string[]): string | null {
  const gesehen = useRef<Set<string> | null>(null);
  const zaehler = useRef(0);
  const [neu, setNeu] = useState<string | null>(null);
  const schl = (offen ?? []).join(",");
  useEffect(() => {
    if (!offen) return;
    if (!gesehen.current) {
      gesehen.current = new Set(offen);
      return;
    }
    const dazu = offen.filter((id) => !gesehen.current!.has(id));
    for (const id of dazu) gesehen.current.add(id);
    if (!dazu.length) return;
    setNeu(dazu[dazu.length - 1]);
    if (tonAn()) ton();
    const nr = ++zaehler.current;
    setTimeout(() => {
      if (zaehler.current === nr) setNeu(null);
    }, 6000);
  }, [schl]);
  return neu && offen?.includes(neu) ? neu : null;
}

export function Platzhalter(p: { titel: string; text: string; stil?: string }) {
  return (
    <div class="platzhalter" style={p.stil}>
      <div><b>{p.titel}</b><div class="klein">{p.text}</div></div>
    </div>
  );
}

/** Knopf, der eine Aktion sendet und solange „gesendet …“ zeigt, bis sie im Protokoll steht. Beim Zuschauen gesperrt. */
export function AktionsKnopf(p: {
  s: Sicht; wartet: boolean; klasse?: string; gesperrt?: boolean; onClick: () => void; children: ComponentChildren; titel?: string;
  testid?: string;
}) {
  return (
    <button type="button" class={`knopf ${p.klasse ?? ""}`} disabled={p.wartet || p.gesperrt || p.s.nurLesen} onClick={p.onClick}
      title={p.s.nurLesen ? "Zuschauen – nur lesen" : p.titel} data-testid={p.testid}>
      {p.wartet ? "gesendet …" : p.children}
    </button>
  );
}

export function Hinweise(p: { liste: Hinweis[] }) {
  return (
    <div class="hinweise" aria-live="polite">
      {p.liste.map((h) => <div key={h.id} class={`hinweis ${h.art}`}>{h.text}</div>)}
    </div>
  );
}

/**
 * Kleines Auswahlmenü an einem Element (Spielleitung: Spieler verschieben). Schließt bei Klick
 * daneben oder Escape.
 */
export function Menue(p: {
  offen: boolean; schliessen: () => void; children: ComponentChildren; rechts?: boolean; testid?: string;
  /** feste Lage im Fenster (position: fixed), z. B. wenn das umgebende Feld abschneidet */
  fest?: { top: number; right: number; maxHoehe: number };
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!p.offen) return;
    const weg = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) p.schliessen(); };
    const taste = (e: KeyboardEvent) => { if (e.key === "Escape") p.schliessen(); };
    const t = setTimeout(() => document.addEventListener("mousedown", weg), 0);
    document.addEventListener("keydown", taste);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", weg);
      document.removeEventListener("keydown", taste);
    };
  }, [p.offen]);
  if (!p.offen) return null;
  const stil = p.fest ? { position: "fixed", top: `${p.fest.top}px`, right: `${p.fest.right}px`, left: "auto", maxHeight: `${p.fest.maxHoehe}px` } : undefined;
  return <div ref={ref} class={`menue ${p.rechts ? "rechts" : ""}`} style={stil} data-testid={p.testid} onClick={(e) => e.stopPropagation()}>{p.children}</div>;
}

/**
 * Knopf für Folgenreiches (neues Spiel, Team löschen): Der erste Klick fragt im Knopf nach, der
 * zweite führt aus; nach 5 s ohne zweiten Klick ist er wieder entschärft. Kein confirm(): Ein
 * Browser-Dialog hielte im Fenster der Spielleitung die Hosts aller Teams an.
 */
export function BestaetigenKnopf(p: {
  klasse?: string; frage: ComponentChildren; onClick: () => void; children: ComponentChildren; gesperrt?: boolean; titel?: string; testid?: string;
}) {
  const [scharf, setScharf] = useState(false);
  useEffect(() => {
    if (!scharf) return;
    const t = setTimeout(() => setScharf(false), 5000);
    return () => clearTimeout(t);
  }, [scharf]);
  return (
    <button type="button" class={`knopf ${p.klasse ?? ""} ${scharf ? "scharf" : ""}`} disabled={p.gesperrt} title={p.titel} data-testid={p.testid}
      data-scharf={scharf ? "1" : undefined}
      onClick={() => { if (scharf) { setScharf(false); p.onClick(); } else setScharf(true); }}>
      {scharf ? p.frage : p.children}
    </button>
  );
}
