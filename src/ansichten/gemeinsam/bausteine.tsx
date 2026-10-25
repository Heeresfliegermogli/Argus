// Kleine wiederverwendbare Bausteine der Ansichten.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Inhalte } from "../../inhalte/typen";
import type { Rolle } from "../../kern/ereignisse";
import { ROLLEN_NAME, type Zielmeldung, injectsFuer, lagehinweiseFuer } from "../../kern/sichten";
import { uhrzeit } from "../../kern/uhr";
import type { Spielzustand } from "../../kern/zustand";
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

/**
 * Kopf des Meldungsfelds (Schritt 6b): Eingang nur als Zahl – keine Liste, kein Verlauf. Die Meldungen selbst
 * stehen als Marken auf der Karte.
 */
export function EingangLeiste(p: { anzahl: number; zurueck?: number; testid: string; titel?: string; children?: ComponentChildren }) {
  return (
    <div class="eingang-leiste">
      <Schritt nr={1} />
      <span class="eingang-titel">{p.titel ?? "Eingang"}</span>
      <span class={`eingang-zahl ${p.anzahl ? "neu" : ""}`} data-testid={p.testid} title="offene Meldungen bei dir">{p.anzahl}</span>
      {!!p.zurueck && <span class="klein leise" data-testid="zurueck-zahl">+ {p.zurueck} zurückgestellt</span>}
      <span class="eingang-rechts">{p.children}</span>
    </div>
  );
}

/** Die Zielmeldung, wie Zielprüfung und Führung sie sehen (kein Bild, keine Sensordaten) – kompakt im Meldungsfeld. */
export function ZielmeldungKompakt(p: { zm: Zielmeldung }) {
  const zm = p.zm;
  return (
    <div class="zielkompakt" data-testid="zielmeldung">
      <span class="feldname">Ziel · Lage</span><span class="wert"><b>{zm.zielNr}</b> · {zm.lage}</span>
      <span class="feldname">Klasse</span><span class="wert"><b>{zm.klasse}</b></span>
      <span class="feldname">Konfidenz</span><span class="wert"><Konfidenz wert={zm.konfidenz} /></span>
      <span class="feldname">ARGUS</span><span class="wert"><Empfehlung wert={zm.argusEmpfehlung} />
        {zm.fastTrack && <span class="badge warn" style="margin-left:6px">Fast-Track – ohne Aufklärung</span>}</span>
    </div>
  );
}

/** Lagehinweise der Führung an Aufklärung/Zielprüfung und Meldungen „an alle“ (z. B. Reserve-Inject R-01 des ARGUS-Systems). */
function lagehinweisEintraege(inh: Inhalte, z: Spielzustand, rolle: Rolle) {
  return [
    ...lagehinweiseFuer(z, rolle).map((l) => ({ schl: `l${l.seq}`, seq: l.seq, t: l.t_s, von: ROLLEN_NAME.g3, an: `an ${l.an.map((r) => ROLLEN_NAME[r]).join(", ")}`, text: l.text })),
    ...injectsFuer(inh, z, rolle).filter((i) => inh.injects[i.id]?.an === "alle")
      .map((i) => ({ schl: `i${i.id}`, seq: i.erschienen.seq, t: i.erschienen.t_s, von: inh.injects[i.id].von, an: "an alle", text: inh.injects[i.id].text })),
  ].sort((a, b) => b.seq - a.seq);
}

/**
 * Lagehinweise auf der Karte (Aufklärung, Zielprüfung; Schritt 6b): Kasten oben links. Der neueste Hinweis steht ganz da, ältere
 * einzeilig (Klick zeigt sie ganz); ohne Hinweis nur eine Zeile.
 */
export function KartenLagehinweise(p: { inh: Inhalte; z: Spielzustand; rolle: Rolle }) {
  const start = p.inh.szenario.spieluhr.start;
  const eintraege = lagehinweisEintraege(p.inh, p.z, p.rolle);
  const [offen, setOffen] = useState<string | null>(null);
  return (
    <section class={`karten-hinweise ${eintraege.length ? "voll" : "leer"}`} data-testid="lagehinweise">
      <h2>Lagehinweise <span class="leise" style="font-weight:500">der Führung</span>
        {eintraege.length > 0 ? <span class="badge info" data-testid="lagehinweise-zahl">{eintraege.length}</span>
          : <span class="klein sehr-leise" style="font-weight:500">· noch keine</span>}
      </h2>
      {eintraege.length > 0 && (
        <div class="karten-hinweise-liste rolle-liste">
          {eintraege.map((l, i) => {
            const ganz = i === 0 || offen === l.schl;
            return (
              <div class={`inject ${ganz ? "" : "zu"}`} key={l.schl} onClick={() => setOffen(offen === l.schl ? null : l.schl)} title={ganz ? undefined : "Klick: ganzen Text zeigen"}>
                <div class="kopfzeile"><span>{uhrzeit(start, l.t)} · {l.von}</span><span>{l.an}</span></div>
                <div class={ganz ? "text" : "einzeilig"}>{l.text}</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
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
