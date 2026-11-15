// Plenum kurz (Liste O, 15.11.2026): Nach dem Spiel zeigt das Plenum nur noch ca. 5 min – Zitate, Diskussion und Abschluss laufen in
// der PowerPoint. Die Kapitel stehen in der Auswertung (auswertung.tsx, Plan aus kern/auswertung.ts kapitelPlan):
//   1 „Gefecht beendet“ – die Karten je Team aus Liste M (gemeinsam/abschluss.tsx), unverändert
//   2 je Schlüsselfall eine Folie (S3, S2, S1, S4; S5–S8 zuschaltbar): erst nur das Drohnenbild, wie die Teams es sahen (Standbild der
//     Meldung mit ARGUS-Rahmen und ARGUS-Zeile), Spielzeit der Meldung und klein der Ort auf der Karte, darunter „Was habt ihr
//     entschieden?“. Ein Klick (oder Bild ↓) deckt auf: was es wirklich war (Satz aus den Falldaten) und „x von n Teams haben das falsch
//     behandelt – y %“, darunter klein richtig / falsch / ohne Entscheidung. Keine Teamnamen, nur Summen (kern: fallQuote).
//   3 „Gesamt“ – alle gezeigten Fälle zusammen (richtig/falsch in %), ein Klick deckt die eine Zahl auf: Median der Sekunden vom Öffnen
//     bis zur Entscheidung über alle Entscheidungen aller Teams („Merkt euch diese Zahl.“; kern: hinschauZahl). Unten „Zurück zur
//     Präsentation“: ein ruhiger Abschlussbildschirm, damit der Beamer beim Umschalten nichts Zufälliges zeigt.
// Gebaut für das Smartboard (1530 × 800); kleinere Fenster verkleinern die ganze Auswertung (gemeinsam/fenster.ts).
// Leitplanken: keine Teamnamen auf den Fallfolien, keine Rangliste, keine Darstellung getöteter Menschen (nur das Bild der Meldung).
import { useMemo, useState } from "preact/hooks";
import { assetUrl, drohnenbild } from "../assets/assets";
import type { ArgusAusgabe, Inhalte, Meldung } from "../inhalte/typen";
import { type Auswertung, type FallDef, type GesamtQuote, type HinschauZahl, fallQuote } from "../kern/auswertung";
import { gemeldetePosition } from "../kern/regeln";
import { uhrzeit } from "../kern/uhr";
import { zielNr } from "../kern/zielnummern";
import { useManifest } from "./gemeinsam/drohnenbild";
import { Schild } from "./gemeinsam/logo";

/** ARGUS-Zeile wie im Spiel: „Panzer · Feind 96 % · BEKÄMPFEN“. */
export function argusZeile(a: ArgusAusgabe): string {
  return `${a.klasse}${a.zugehoerigkeit ? ` · ${a.zugehoerigkeit}` : ""} ${a.konfidenz} % · ${a.empfehlung}`;
}

/** „5 von 7 Teams haben das falsch behandelt“ – Einzahl, wo nötig. */
export function quoteText(falsch: number, n: number): string {
  return `${falsch} von ${n} ${n === 1 ? "Team" : "Teams"} ${falsch === 1 ? "hat" : "haben"} das falsch behandelt`;
}

/**
 * Drohnenbild der Meldung, wie die Teams es zur Meldezeit sahen: die Aufnahme aus dem Asset-Manifest (dieselbe, die das Spiel zeigt,
 * wenn das Ziel den Ausschnitt verlässt) mit den ARGUS-Rahmen und der Kopf- und Fußleiste der Drohne. ARGUS wie in den Daten (die
 * Schlüsselfälle liegen außerhalb der EloKa-Störung).
 */
function Standbild(p: { inh: Inhalte; m: Meldung }) {
  const man = useManifest();
  const db = man ? drohnenbild(man, p.m.id) : null;
  const a = p.m.argus;
  const einzeln = a.einzeln ?? [];
  const start = p.inh.szenario.spieluhr.start;
  return (
    <div class="drohne pk-standbild" data-testid="pk-standbild" data-meldung={p.m.id}>
      {db ? <img src={assetUrl(db.datei)} width={db.breite} height={db.hoehe} alt={p.m.bild.beschreibung} draggable={false} />
        : <div class="drohne-leer">{man ? "Kein Drohnenbild" : "Bild wird geladen …"}</div>}
      {db?.ziele.map((z, i) => (
        <div key={z.id} class="argus-rahmen" data-ziel={z.id} style={{
          left: `${(z.box[0] / db.breite) * 100}%`, top: `${(z.box[1] / db.hoehe) * 100}%`,
          width: `${(z.box[2] / db.breite) * 100}%`, height: `${(z.box[3] / db.hoehe) * 100}%`,
        }}>
          <span class={`argus-marke ${z.box[1] / db.hoehe < 0.08 ? "unten" : ""}`}>{a.klasse} · {einzeln[i] ?? a.konfidenz} %</span>
        </div>
      ))}
      <div class="drohne-kopf"><span>ARGUS 3.2 │ UAV-2 „Milan“ │ EO Tag</span><span>AUFNAHME {uhrzeit(start, p.m.t_s)}</span></div>
      {db && <div class="drohne-fuss"><span>PQ {db.pq}</span><span>Übung</span></div>}
    </div>
  );
}

/**
 * Ort der Meldung auf der Karte, klein: die beschriftete Lagekarte (auf der Webseite; in der Offline-Datei die Topokarte, die
 * beschriftete ist dort nicht eingebettet) mit einem Ring an der gemeldeten Position.
 */
function OrtKarte(p: { inh: Inhalte; m: Meldung }) {
  const man = useManifest();
  const bild = useMemo(() => {
    if (!man) return null;
    for (const d of [man.karte.lagekarte?.datei, man.karte.topo?.datei]) {
      if (!d) continue;
      try {
        return assetUrl(d);
      } catch {
        /* nicht eingebettet – nächste Stufe */
      }
    }
    return null;
  }, [man]);
  const b = p.inh.karte.ausdehnung_m;
  const [x, y] = gemeldetePosition(p.inh, p.m);
  return (
    <div class="pk-ort" data-testid="pk-ort" style={bild ? { backgroundImage: `url("${bild}")` } : undefined}>
      <span class="pk-ort-ring" style={{ left: `${(x / b.breite) * 100}%`, top: `${(y / b.hoehe) * 100}%` }} />
    </div>
  );
}

/** Balken richtig / falsch / ohne Entscheidung (Breite nach Anzahl; Farbe und Zeichen, nicht nur Farbe). */
function Aufteilung(p: { richtig: number; falsch: number; ohne: number }) {
  const n = p.richtig + p.falsch + p.ohne || 1;
  return (
    <div class="pk-balken" aria-hidden="true">
      {p.falsch > 0 && <i class="falsch" style={{ width: `${(p.falsch / n) * 100}%` }}>✕ {p.falsch}</i>}
      {p.richtig > 0 && <i class="richtig" style={{ width: `${(p.richtig / n) * 100}%` }}>✓ {p.richtig}</i>}
      {p.ohne > 0 && <i class="ohne" style={{ width: `${(p.ohne / n) * 100}%` }}>– {p.ohne}</i>}
    </div>
  );
}

/** Folie eines Schlüsselfalls (O1.3/O1.4). */
export function FallFolie(p: { a: Auswertung; inh: Inhalte; fall: FallDef; nr: number; von: number; aufgedeckt: boolean; aufdecken: () => void }) {
  const { inh, fall } = p;
  const m = inh.meldungen[fall.meldung];
  const q = fallQuote(p.a, fall.id);
  const start = inh.szenario.spieluhr.start;
  if (!m) return <div class="leer">Meldung {fall.meldung} fehlt im Szenario.</div>;
  return (
    <section class="pk-fall" data-testid="pk-fall" data-fall={fall.id} data-aufgedeckt={p.aufgedeckt ? "1" : "0"}
      data-falsch={q.falsch} data-richtig={q.richtig} data-ohne={q.ohne} data-n={q.n} data-prozent={q.prozent ?? ""}>
      <div class="pk-links">
        <div class="pk-kopf">
          <span class="fall-marke gross">{fall.id}</span>
          <span class="pk-kopf-text">Ziel {zielNr(inh, null, m.id)} · Meldung um <b class="mono">{uhrzeit(start, m.t_s)}</b> <span class="sehr-leise">Spielzeit</span></span>
          <span class="sehr-leise pk-nr">Schlüsselfall {p.nr} von {p.von}</span>
        </div>
        <div class="pk-bild-feld"><Standbild inh={inh} m={m} /></div>
        <div class="pk-argus" data-testid="pk-argus"><span class="leise">ARGUS:</span> <b>{argusZeile(m.argus)}</b>
          {m.argus.hinweis && <span class="pk-argus-hinweis"> · {m.argus.hinweis}</span>}</div>
      </div>
      <div class="pk-rechts">
        <div class="pk-ort-feld">
          <div class="pk-feld-titel">Ort auf der Karte</div>
          <OrtKarte inh={inh} m={m} />
        </div>
        {!p.aufgedeckt ? (
          <div class="pk-frage-feld">
            <p class="pk-frage" data-testid="pk-frage">Was habt ihr entschieden?</p>
            <button type="button" class="knopf pk-aufdecken" onClick={p.aufdecken} data-testid="pk-aufdecken">aufdecken ▸</button>
            <span class="sehr-leise">Klick oder Bild ↓</span>
          </div>
        ) : (
          <div class="pk-aufloesung" data-testid="pk-aufloesung">
            <div class="pk-es-war"><span class="leise">Es war:</span> <b data-testid="pk-wirklich">{fall.sf?.wirklich ?? fall.titel}</b></div>
            {q.n > 0 ? (
              <>
                <div class="pk-quote" data-testid="pk-quote">{quoteText(q.falsch, q.n)} – <b class="pk-prozent">{q.prozent}{"\u202f"}%</b></div>
                <Aufteilung richtig={q.richtig} falsch={q.falsch} ohne={q.ohne} />
                <div class="pk-klein leise" data-testid="pk-aufteilung">richtig {q.richtig} · falsch {q.falsch} · ohne Entscheidung {q.ohne}</div>
              </>
            ) : (
              <div class="pk-quote" data-testid="pk-quote">kein Team hat diesen Fall entschieden</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** Folie „Gesamt“ (O1.6–O1.8): alle gezeigten Fälle zusammen, auf Klick die eine Zahl, unten „Zurück zur Präsentation“. */
export function GesamtFolie(p: { gq: GesamtQuote; zahl: HinschauZahl; aufgedeckt: boolean; aufdecken: () => void; ende: () => void }) {
  const { gq, zahl } = p;
  const k = gq.faelle.length;
  return (
    <section class="pk-gesamt" data-testid="pk-gesamt" data-falsch={gq.falsch} data-richtig={gq.richtig} data-n={gq.n}
      data-prozent-falsch={gq.prozentFalsch ?? ""} data-zahl={zahl.sekunden ?? ""} data-entscheidungen={zahl.n} data-aufgedeckt={p.aufgedeckt ? "1" : "0"}>
      <div class="pk-gesamt-kopf"><h1>Gesamt</h1><span class="leise">alle gezeigten Schlüsselfälle zusammen</span></div>
      <div class="pk-gesamt-oben">
        <div class="pk-gesamt-quote">
          {gq.n > 0 ? (
            <>
              <div class="pk-gesamt-text" data-testid="pk-gesamt-text">
                <b class="rot">{gq.prozentFalsch} % falsch behandelt</b> <span class="sehr-leise">·</span> <b class="gruen">{gq.prozentRichtig} % richtig</b>
              </div>
              <div class="pk-gesamt-balken" aria-hidden="true">
                <i class="falsch" style={{ width: `${gq.prozentFalsch}%` }} /><i class="richtig" style={{ width: `${gq.prozentRichtig}%` }} />
              </div>
              <div class="pk-klein leise">aus {gq.n} Entscheidungen in {k} {k === 1 ? "Schlüsselfall" : "Schlüsselfällen"}{gq.ohne ? ` · ${gq.ohne} ohne Entscheidung` : ""}</div>
            </>
          ) : <div class="pk-gesamt-text">Kein Team hat einen der Fälle entschieden.</div>}
        </div>
        <ul class="pk-je-fall" data-testid="pk-je-fall">
          {gq.faelle.map((q) => (
            <li key={q.fall} data-fall={q.fall}>
              <span class="fall-marke">{q.fall}</span>
              <span class="pk-mini"><i style={{ width: `${q.prozent ?? 0}%` }} /></span>
              <b>{q.prozent === null ? "–" : `${q.prozent} %`}</b>
              <span class="sehr-leise">{q.n ? `${q.falsch}/${q.n}` : "–"}</span>
            </li>
          ))}
        </ul>
      </div>
      <div class={`pk-zahl-feld ${p.aufgedeckt ? "an" : ""}`}>
        {p.aufgedeckt ? (
          <div class="pk-zahl" data-testid="pk-zahl">
            <b class="pk-zahl-wert">{zahl.sekunden === null ? "–" : `${zahl.sekunden}\u202fs`}</b>
            <div class="pk-zahl-text">
              <p>So lange habt ihr im Mittel auf ein Ziel geschaut.</p>
              <p class="pk-merkt">Merkt euch diese Zahl.</p>
              <span class="sehr-leise pk-klein">Median über {zahl.n} {zahl.n === 1 ? "Entscheidung" : "Entscheidungen"} · Sekunden vom Öffnen der Meldung bis zur Entscheidung</span>
            </div>
          </div>
        ) : (
          <button type="button" class="knopf pk-zahl-aufdecken" onClick={p.aufdecken} data-testid="pk-zahl-aufdecken">Und eine Zahl … ▸ <span class="sehr-leise">Klick oder Bild ↓</span></button>
        )}
      </div>
      <div class="pk-gesamt-fuss">
        <button type="button" class="knopf weiter pk-zur-praesentation" onClick={p.ende} data-testid="zur-praesentation"
          title="Ruhiger Abschlussbildschirm – dann zur PowerPoint umschalten">Zurück zur Präsentation</button>
      </div>
    </section>
  );
}

/** Ruhiger Abschlussbildschirm (O1.8): Schild und „ARGUS – Planspiel beendet“, sonst nichts. Zurück mit Bild ↑, Esc oder ◂. */
export function PraesentationEnde(p: { zurueck: () => void }) {
  return (
    <div class="pk-ende" data-testid="praesentation-ende">
      <Schild hoehe={230} klasse="pk-ende-schild" />
      <div class="pk-ende-titel">ARGUS – Planspiel beendet</div>
      <button type="button" class="pk-ende-zurueck" onClick={p.zurueck} title="zurück zum Plenum (Bild ↑, Esc)" data-testid="ende-zurueck">◂</button>
    </div>
  );
}

/** Text in die Zwischenablage (mit Rückfall für Fenster ohne Clipboard-API, z. B. die Offline-Datei). */
async function kopieren(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    el.remove();
    return ok;
  }
}

/**
 * Die Zahl für die Folie in der PowerPoint (O1.7), in der Übersicht der Spielleitung: dieselbe Rechnung wie „Gesamt“ im Plenum
 * (hinschauZahl über alle Teams), mit „kopieren“.
 */
export function ZahlFuerFolie(p: { zahl: HinschauZahl }) {
  const [status, setStatus] = useState<"" | "ok" | "fehler">("");
  const text = p.zahl.sekunden === null ? "" : `${p.zahl.sekunden} s`;
  return (
    <span class="pk-sl-zahl" data-testid="sl-zahl" data-zahl={p.zahl.sekunden ?? ""} data-entscheidungen={p.zahl.n}
      title="Median über alle Entscheidungen aller Teams: Sekunden vom Öffnen der Meldung bis zur Entscheidung – dieselbe Zahl wie im Plenum („Gesamt“)">
      <span class="leise">Die Zahl für die Folie:</span> <b>{text ? `${p.zahl.sekunden}\u202fs` : "–"}</b>
      <span class="sehr-leise"> Median über {p.zahl.n} Entscheidungen</span>
      <button type="button" class="knopf klein" disabled={!text} data-testid="sl-zahl-kopieren"
        onClick={() => void kopieren(text).then((ok) => { setStatus(ok ? "ok" : "fehler"); setTimeout(() => setStatus(""), 2500); })}>
        {status === "ok" ? "kopiert ✓" : status === "fehler" ? "nicht kopiert" : "kopieren"}
      </button>
    </span>
  );
}
