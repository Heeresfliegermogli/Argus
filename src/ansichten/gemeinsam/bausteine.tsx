// Kleine wiederverwendbare Bausteine der Ansichten.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Inhalte } from "../../inhalte/typen";
import type { Rolle } from "../../kern/ereignisse";
import { STUFE_TEXT, type Zielmeldung, injectsFuer, lagehinweiseFuer } from "../../kern/sichten";
import { uhrzeit } from "../../kern/uhr";
import type { MeldungsStand, Spielzustand } from "../../kern/zustand";
import type { Sitzung } from "../../sitzung/sitzung";

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

/** Knopf, der eine Aktion sendet und solange „gesendet …“ zeigt, bis sie im Protokoll steht. */
export function AktionsKnopf(p: {
  s: Sitzung; wartet: boolean; klasse?: string; gesperrt?: boolean; onClick: () => void; children: ComponentChildren; titel?: string;
  testid?: string;
}) {
  return (
    <button type="button" class={`knopf ${p.klasse ?? ""}`} disabled={p.wartet || p.gesperrt} onClick={p.onClick} title={p.titel} data-testid={p.testid}>
      {p.wartet ? "gesendet …" : p.children}
    </button>
  );
}

export function Hinweise(p: { s: Sitzung }) {
  return (
    <div class="hinweise" aria-live="polite">
      {p.s.stand.hinweise.map((h) => <div key={h.id} class={`hinweis ${h.art}`}>{h.text}</div>)}
    </div>
  );
}
