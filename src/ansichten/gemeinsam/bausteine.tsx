// Kleine wiederverwendbare Bausteine der Ansichten.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Inhalte } from "../../inhalte/typen";
import type { Rolle } from "../../kern/ereignisse";
import { STUFE_TEXT, type Zielmeldung, injectsFuer, lagehinweiseFuer } from "../../kern/sichten";
import { uhrzeit } from "../../kern/uhr";
import type { MeldungsStand, Spielzustand } from "../../kern/zustand";
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
}) {
  return (
    <section class={`panel ${p.klasse ?? ""}`} style={p.stil} data-testid={p.testid}>
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

/** Eintrag in einer Meldungsliste (Warteschlange oder Verlauf). */
export function MeldungsEintrag(p: {
  inh: Inhalte; st: MeldungsStand; aktiv?: boolean; gedimmt?: boolean; onWahl?: () => void; unter?: ComponentChildren;
}) {
  const m = p.inh.meldungen[p.st.id];
  return (
    <li>
      <button type="button" class={`eintrag ${p.aktiv ? "aktiv" : ""} ${p.gedimmt ? "gedimmt" : ""}`} onClick={p.onWahl} data-meldung={p.st.id}
        tabIndex={p.gedimmt ? -1 : 0}>
        <span class="nr">{p.st.id}</span>
        <span class="klasse">{m.argus.klasse}</span>
        <span class="mono klein">{m.argus.konfidenz} %</span>
        <span class="unter">
          {p.unter ?? <>{uhrzeit(p.inh.szenario.spieluhr.start, p.st.erschienen.t_s)} · {STUFE_TEXT[p.st.stufe]}</>}
          {p.st.fastTrack && <span class="badge warn">FT</span>}
          {p.st.beobachten && <span class="badge info">zurückgestellt</span>}
        </span>
      </button>
    </li>
  );
}

/** Die Zielmeldung, wie G2 und G3 sie sehen – als Tabelle. */
export function ZielmeldungKarte(p: { zm: Zielmeldung }) {
  const zm = p.zm;
  return (
    <table class="tabelle">
      <tbody>
        <tr><th>Meldung</th><td><b>{zm.meldung}</b> · {zm.uhrzeit}{zm.folgeVon && <span class="leise"> · Folgemeldung zu {zm.folgeVon}</span>}</td></tr>
        <tr><th>Ziel-Nr.</th><td>{zm.zielNr}</td></tr>
        <tr><th>Lage</th><td class="zahl">{zm.lage}</td></tr>
        <tr><th>ARGUS-Klasse</th><td>{zm.klasse}</td></tr>
        <tr><th>Konfidenz</th><td style="max-width:200px"><Konfidenz wert={zm.konfidenz} /></td></tr>
        <tr><th>ARGUS</th><td><Empfehlung wert={zm.argusEmpfehlung} /></td></tr>
        <tr><th>Vermerk G1</th><td>{zm.fastTrack ? <span class="badge warn">Fast-Track – ohne Prüfung durch G1</span> : zm.vermerkG1 ?? <span class="sehr-leise">kein Vermerk</span>}</td></tr>
      </tbody>
    </table>
  );
}

/** Die Zielmeldung als Leiste über der Karte (G2). */
export function ZielmeldungLeiste(p: { zm: Zielmeldung }) {
  const zm = p.zm;
  return (
    <div class="zielleiste" data-testid="zielmeldung">
      <div><div class="feldname">Meldung</div><div class="wert">{zm.meldung} · {zm.uhrzeit}</div></div>
      <div><div class="feldname">Ziel-Nr. · Lage</div><div class="wert">{zm.zielNr} · {zm.lage}</div></div>
      <div><div class="feldname">ARGUS-Klasse</div><div class="wert">{zm.klasse}</div></div>
      <div style="min-width:150px"><div class="feldname">Konfidenz · ARGUS</div><div class="wert"><Konfidenz wert={zm.konfidenz} /></div><Empfehlung wert={zm.argusEmpfehlung} /></div>
      <div>
        <div class="feldname">Vermerk G1{zm.folgeVon ? ` · Folgemeldung zu ${zm.folgeVon}` : ""}</div>
        <div class="wert lang">{zm.fastTrack ? <span class="badge warn">Fast-Track – ohne Prüfung durch G1</span> : zm.vermerkG1 ? <span class="zwei-zeilen" title={zm.vermerkG1}>{zm.vermerkG1}</span> : <span class="sehr-leise">kein Vermerk</span>}</div>
      </div>
    </div>
  );
}

/** Lagehinweise von G3 an G1/G2 und Meldungen „an alle“ (z. B. Reserve-Inject R-01 des ARGUS-Systems). */
export function Lagehinweise(p: { inh: Inhalte; z: Spielzustand; rolle: Rolle; schritt?: number }) {
  const start = p.inh.szenario.spieluhr.start;
  const eintraege = [
    ...lagehinweiseFuer(p.z, p.rolle).map((l) => ({ schl: `l${l.seq}`, seq: l.seq, t: l.t_s, von: "G3", an: `an ${l.an.map((r) => r.toUpperCase()).join(", ")}`, text: l.text })),
    ...injectsFuer(p.inh, p.z, p.rolle).filter((i) => p.inh.injects[i.id]?.an === "alle")
      .map((i) => ({ schl: `i${i.id}`, seq: i.erschienen.seq, t: i.erschienen.t_s, von: p.inh.injects[i.id].von, an: "an alle", text: p.inh.injects[i.id].text })),
  ].sort((a, b) => b.seq - a.seq);
  return (
    <Panel titel="Lagehinweise" liste klasse="lagehinweise" rechts={eintraege.length ? <span class="badge info" data-testid="lagehinweise-zahl">{eintraege.length}</span> : null}>
      {eintraege.length === 0 ? <div class="hinweistext">Hier erscheinen Hinweise der Führung (G3).</div> : (
        <div class="stapel" style="gap:6px">
          {eintraege.map((l) => (
            <div class="inject" key={l.schl}>
              <div class="kopfzeile"><span>{uhrzeit(start, l.t)} · {l.von}</span><span>{l.an}</span></div>
              <div class="text">{l.text}</div>
            </div>
          ))}
        </div>
      )}
    </Panel>
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
