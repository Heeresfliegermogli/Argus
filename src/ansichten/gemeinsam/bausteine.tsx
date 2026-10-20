// Kleine wiederverwendbare Bausteine der Ansichten.
import type { ComponentChildren } from "preact";
import type { Inhalte } from "../../inhalte/typen";
import type { Rolle } from "../../kern/ereignisse";
import { STUFE_TEXT, type Zielmeldung, lagehinweiseFuer } from "../../kern/sichten";
import { uhrzeit } from "../../kern/uhr";
import type { MeldungsStand, Spielzustand } from "../../kern/zustand";
import type { Sitzung } from "../../sitzung/sitzung";

export function Panel(p: { titel: ComponentChildren; rechts?: ComponentChildren; children?: ComponentChildren; klasse?: string; stil?: string }) {
  return (
    <section class={`panel ${p.klasse ?? ""}`} style={p.stil}>
      <header>
        <h2>{p.titel}</h2>
        {p.rechts}
      </header>
      <div class="rumpf">{p.children}</div>
    </section>
  );
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
      <button type="button" class={`eintrag ${p.aktiv ? "aktiv" : ""} ${p.gedimmt ? "gedimmt" : ""}`} onClick={p.onWahl} data-meldung={p.st.id}>
        <span class="nr">{p.st.id}</span>
        <span>{m.argus.klasse}</span>
        <span class="mono klein">{m.argus.konfidenz} %</span>
        <span class="unter">
          {p.unter ?? <>{uhrzeit(p.inh.szenario.spieluhr.start, p.st.erschienen.t_s)} · {STUFE_TEXT[p.st.stufe]}</>}
          {p.st.fastTrack && <span class="badge warn" style="margin-left:6px">FT</span>}
          {p.st.beobachten && <span class="badge info" style="margin-left:6px">zurückgestellt</span>}
        </span>
      </button>
    </li>
  );
}

/** Die Zielmeldung, wie G2 und G3 sie sehen. */
export function ZielmeldungKarte(p: { zm: Zielmeldung }) {
  const zm = p.zm;
  return (
    <table class="tabelle">
      <tbody>
        <tr><th>Meldung</th><td><b class="mono">{zm.meldung}</b> · {zm.uhrzeit}{zm.folgeVon && <span class="leise"> · Folgemeldung zu {zm.folgeVon}</span>}</td></tr>
        <tr><th>Ziel-Nr.</th><td class="mono">{zm.zielNr}</td></tr>
        <tr><th>Lage</th><td class="mono">{zm.lage}</td></tr>
        <tr><th>ARGUS-Klasse</th><td>{zm.klasse}</td></tr>
        <tr><th>Konfidenz</th><td style="max-width:220px"><Konfidenz wert={zm.konfidenz} /></td></tr>
        <tr><th>ARGUS</th><td><Empfehlung wert={zm.argusEmpfehlung} /></td></tr>
        <tr><th>Vermerk G1</th><td>{zm.fastTrack ? <span class="badge warn">Fast-Track – ohne Prüfung durch G1</span> : zm.vermerkG1 ?? <span class="sehr-leise">–</span>}</td></tr>
      </tbody>
    </table>
  );
}

export function Lagehinweise(p: { inh: Inhalte; z: Spielzustand; rolle: Rolle }) {
  const liste = lagehinweiseFuer(p.z, p.rolle);
  return (
    <Panel titel="Lagehinweise G3" rechts={liste.length ? <span class="badge">{liste.length}</span> : null}>
      {liste.length === 0 ? <Leer>keine</Leer> : (
        <div class="stapel">
          {[...liste].reverse().map((l) => (
            <div class="inject" key={l.seq}>
              <div class="kopfzeile"><span>{uhrzeit(p.inh.szenario.spieluhr.start, l.t_s)}</span><span>an {l.an.map((r) => r.toUpperCase()).join(", ")}</span></div>
              {l.text}
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
}) {
  return (
    <button type="button" class={`knopf ${p.klasse ?? ""}`} disabled={p.wartet || p.gesperrt} onClick={p.onClick} title={p.titel}>
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
