// Darstellung des Lasttests ohne Framework: Einstellungen vor dem Start, danach eine Seite für Verlauf und
// Ergebnis, die in 1530 × 800 passt (zum Abfotografieren). Knöpfe tragen data-aktion (ein Klick-Hörer für alles).
import { uhrzeit } from "../../src/kern/uhr";
import { type Ampel, type Auswertung, FENSTER_S, SCHWELLEN, type TeamAuswertung } from "./auswertung";
import type { LastOptionen } from "./lauf";
import type { Kennzahlen } from "./messung";

export const TEMPI = [1, 2, 5, 10, 20];

export type Aufteilung = "alles" | "host" | "beitreten";

/** Uhrzeit des Spielbeginns (Szenario), für die Achsen */
let START = "10:00:00";

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** 640 ms · 1,4 s · 12 s */
export function dauer(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "–";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
  return `${Math.round(ms / 1000)} s`;
}

function minuten(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

const AMPEL: Record<Ampel, { zeichen: string; text: string }> = {
  gruen: { zeichen: "✓", text: "flüssig" },
  gelb: { zeichen: "▲", text: "spürbar verzögert" },
  rot: { zeichen: "✕", text: "zu langsam" },
  offen: { zeichen: "…", text: "noch keine Werte" },
};

// ---------------------------------------------------------------- Einstellungen

export function verbindungenFuer(o: LastOptionen, auf: Aufteilung): number {
  const bots = (auf === "alles" ? o.teams : o.hier.filter((n) => n <= o.teams).length) * 3;
  return bots + (auf === "beitreten" ? 0 : 1 + (o.beobachter ? 2 : 0));
}

export function einstellungenHtml(o: LastOptionen, auf: Aufteilung, dauerS: number): string {
  const tempo = TEMPI.map((t) => `<button type="button" class="knopf ${t === o.tempo ? "an" : ""}" data-aktion="tempo" data-wert="${t}">×${t}<small>${minuten(dauerS / t)} min</small></button>`).join("");
  const teams = [1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === o.teams ? "selected" : ""}>${n} ${n === 1 ? "Team" : "Teams"} · ${n * 3} Bots</option>`).join("");
  const verb = verbindungenFuer(o, auf);
  const wahl = (wert: Aufteilung, text: string) => `<label class="haken"><input type="radio" name="aufteilung" value="${wert}" ${auf === wert ? "checked" : ""} /> ${text}</label>`;
  const hier = Array.from({ length: o.teams }, (_, i) => i + 1)
    .map((n) => `<label class="haken"><input type="checkbox" name="hier" value="${n}" ${o.hier.includes(n) ? "checked" : ""} /> Team ${n}</label>`).join("");
  return `
  <main class="start">
    <section class="karte">
      <h1><span class="marke">ARGUS</span> Lasttest Firebase</h1>
      <p>Spielt eine echte Sitzung in der Datenbank durch: <b>${o.teams} ${o.teams === 1 ? "Team" : "Teams"} à 3 Bot-Spieler</b>
        (Aufklärung, Zielprüfung, Führung – je eine eigene Firebase-Verbindung) und ein <b>Host</b> (Spielleitung) – das Drehbuch der fünf Modellteams wie
        <code>tools/e2e_drehbuch.py</code>. Gemessen wird der Weg <b>Klick → Protokoll</b>: vom Senden einer Aktion bis das Ereignis
        dazu im eigenen Fenster steht.</p>
      <div class="felder">
        <label class="breit">Datenbank<input id="db" class="feld" value="${esc(o.db)}" spellcheck="false" /></label>
        <label>Verbindung
          <select id="transport" class="feld">
            <option value="lp" ${o.transport === "lp" ? "selected" : ""}>Long-Polling (wie im Hörsaal)</option>
            <option value="auto" ${o.transport === "auto" ? "selected" : ""}>WebSocket (nur wo das Netz es erlaubt)</option>
          </select></label>
        <label>Teams in der Sitzung<select id="teams" class="feld">${teams}</select></label>
      </div>
      <div class="gruppe">
        <span class="leise">Aufteilung</span>
        ${wahl("alles", "Alles auf diesem Gerät – Host und alle Bots")}
        ${wahl("host", "Verteilt – dieses Gerät legt die Sitzung an und führt den Host")}
        ${wahl("beitreten", `Verteilt – dieses Gerät tritt mit Bots bei: Code <input id="code" class="feld kurz" value="${esc(o.code ?? "")}" placeholder="K7P" spellcheck="false" />`)}
        ${auf !== "alles" ? `<div class="zeile"><span class="leise">Bots auf diesem Gerät:</span>${hier}</div>` : ""}
      </div>
      ${auf === "beitreten"
        ? `<p class="leise klein">Tempo und Start stellt das Host-Gerät ein. Erst alle Geräte starten, dann wartet dieses Gerät auf ▶.</p>`
        : `<div class="tempo"><span class="leise">Tempo</span>${tempo}</div>
           <label class="haken"><input type="checkbox" id="beobachter" ${o.beobachter ? "checked" : ""} /> dazu Plenum und 2. Spielleitung verbinden (sehen nur zu)</label>`}
      <p class="leise klein">×1 ist Echtzeit wie im Hörsaal (25 min Spielzeit); höheres Tempo drängt dieselben Klicks in kürzere Zeit und
        belastet die Datenbank stärker als echte Spieler. <b>${verb} Verbindungen auf diesem Gerät.</b> Während des Laufs diesen Tab im
        Vordergrund lassen und den Rechner nicht sperren (sonst bremst der Browser die Zeitgeber).${auf === "beitreten" ? "" : " Jeder Lauf legt eine neue Sitzung in der Datenbank an."}</p>
      <div class="zeile"><button type="button" class="knopf gross gut" data-aktion="start">▶ Lasttest starten</button></div>
    </section>
  </main>`;
}

// ---------------------------------------------------------------- Diagramm je Team

const Y_MIN = 20;
const Y_MAX = 20_000;
const B = 470;
const X0 = 34;

function xVon(s: number, dauerS: number): number {
  return X0 + (Math.max(0, Math.min(dauerS, s)) / dauerS) * (B - X0 - 8);
}

function streifen(t: TeamAuswertung, dauerS: number, jetztS: number | null, h = 50): string {
  const x = (s: number) => xVon(s, dauerS);
  const y = (ms: number) => {
    const v = Math.log10(Math.max(Y_MIN, Math.min(Y_MAX, ms)));
    const lo = Math.log10(Y_MIN);
    const hi = Math.log10(Y_MAX);
    return h - 4 - ((v - lo) / (hi - lo)) * (h - 8);
  };
  const raster = [];
  for (let s = 0; s <= dauerS; s += FENSTER_S) raster.push(`<line class="raster" x1="${x(s)}" x2="${x(s)}" y1="2" y2="${h - 2}" />`);
  const ticks = [100, 1000, 10_000].map((v) => `<line class="raster" x1="${X0}" x2="${B - 8}" y1="${y(v)}" y2="${y(v)}" /><text class="achse" x="${X0 - 4}" y="${y(v) + 3}" text-anchor="end">${v < 1000 ? "0,1 s" : `${v / 1000} s`}</text>`);
  const grenze = `<line class="grenze" x1="${X0}" x2="${B - 8}" y1="${y(SCHWELLEN.gruen.max)}" y2="${y(SCHWELLEN.gruen.max)}" />`;
  const jetzt = jetztS !== null ? `<line class="jetzt" x1="${x(jetztS)}" x2="${x(jetztS)}" y1="2" y2="${h - 2}" />` : "";
  const punkte = t.punkte.map(([s, ms, r]) => `<circle class="punkt" cx="${x(s).toFixed(1)}" cy="${y(ms).toFixed(1)}" r="2.6"><title>${uhrzeit(START, s)} · ${r.toUpperCase()} · ${dauer(ms)}</title></circle>`);
  // gleitender Median über 120 s Spielzeit
  const sortiert = [...t.punkte].sort((a, b) => a[0] - b[0]);
  const linie: string[] = [];
  for (let s = 60; s <= dauerS - 60 + 1; s += 30) {
    const w = sortiert.filter((p) => Math.abs(p[0] - s) <= 60).map((p) => p[1]).sort((a, b) => a - b);
    if (w.length >= 3) linie.push(`${x(s).toFixed(1)},${y(w[Math.floor(w.length / 2)]).toFixed(1)}`);
  }
  const median = linie.length > 1 ? `<polyline class="median" points="${linie.join(" ")}" />` : "";
  return `<svg class="streifen" viewBox="0 0 ${B} ${h}" width="${B}" height="${h}" role="img" aria-label="Klick → Protokoll über die Spielzeit, ${esc(t.name)}">
    ${raster.join("")}${ticks.join("")}${grenze}${jetzt}${median}${punkte.join("")}</svg>`;
}

function achsenzeile(dauerS: number): string {
  const labels = [];
  for (let s = 0; s <= dauerS; s += FENSTER_S) {
    const anker = s === 0 ? "start" : s + FENSTER_S > dauerS ? "end" : "middle";
    labels.push(`<text class="achse" x="${xVon(s, dauerS)}" y="11" text-anchor="${anker}">${uhrzeit(START, s).slice(0, 5)}</text>`);
  }
  return `<svg class="streifen" viewBox="0 0 ${B} 14" width="${B}" height="14" aria-hidden="true">${labels.join("")}</svg>`;
}

// ---------------------------------------------------------------- Verlauf und Ergebnis

function zelleFenster(k: Kennzahlen): string {
  if (!k.n) return `<td class="fenster leer">–</td>`;
  const warn = (k.max ?? 0) > SCHWELLEN.gruen.max;
  return `<td class="fenster"><b>${dauer(k.median)}</b><br><span class="${warn ? "warn" : "leise"}">${warn ? "⚠ " : ""}max ${dauer(k.max)}</span></td>`;
}

function teamZeile(t: TeamAuswertung, a: Auswertung, laeuft: boolean): string {
  const ab = t.abschluss;
  const stand = !ab
    ? `<span class="leise">${laeuft ? `${uhrzeit(START, t.spielzeit)} · ` : ""}seq ${t.seq}</span>`
    : [
      [ab.ende ? `<span class="ok">✓ Ende</span>` : `<span class="schlecht">✕ kein Spielende</span>`,
        ab.fensterGleich === null ? "" : ab.fensterGleich ? `<span class="ok">✓ Fenster gleich</span>` : `<span class="schlecht">✕ Fenster ungleich</span>`].filter(Boolean).join(" · "),
      ab.ausgangGleich ? `<span class="ok">✓ Ausgang wie ohne Netz</span>` : `<span class="warn">⚠ Ausgang anders als ohne Netz</span>`,
      ab.abgelehnt.length ? `<span class="schlecht">✕ ${ab.abgelehnt.length} abgelehnt</span>` : "",
    ].filter(Boolean).join("<br>");
  const anzahlFenster = t.fenster.length;
  if (!t.lokal) {
    return `<tr class="fremd">
      <th class="team"><span class="tname">${esc(t.name)}</span><br><span class="leise klein">Bots auf anderem Gerät</span></th>
      <td colspan="3" class="leise klein">Werte am anderen Gerät</td>
      <td class="diagramm leise klein">Host führt dieses Team · ${uhrzeit(START, t.spielzeit)} · seq ${t.seq}</td>
      <td colspan="${anzahlFenster}"></td>
      <td class="stand klein">${stand}</td>
    </tr>`;
  }
  const fehlt = t.gesendet - t.imProtokoll;
  return `<tr>
    <th class="team"><span class="tname">${esc(t.name)}</span><br><span class="leise klein">${t.imProtokoll}/${t.geplant} Aktionen${fehlt > 0 ? ` · ${fehlt} offen` : ""}${t.verzugMax !== null ? ` · Verzug ≤ ${t.verzugMax.toFixed(1).replace(".", ",")} s` : ""}</span></th>
    <td class="zahl gross">${dauer(t.klick.median)}</td>
    <td class="zahl">${dauer(t.klick.p95)}</td>
    <td class="zahl ${(t.klick.max ?? 0) > SCHWELLEN.gruen.max ? "warn" : ""}">${dauer(t.klick.max)}</td>
    <td class="diagramm">${streifen(t, a.dauerS, laeuft ? a.spielzeit : null)}</td>
    ${t.fenster.map(zelleFenster).join("")}
    <td class="stand klein">${stand}</td>
  </tr>`;
}

function diagnoseHtml(a: Auswertung): string {
  const d = a.diagnose;
  const z = (ok: boolean | null, text: string) => `<li class="${ok === null ? "" : ok ? "ok" : "warn"}">${ok === null ? "·" : ok ? "✓" : "⚠"} ${text}</li>`;
  const prot = Object.entries(d.protokolle).filter(([p]) => p !== "?");
  const p11 = prot.some(([p]) => p.startsWith("http/1"));
  const zeilen = [
    d.verbindungsgrenze
      ? z(false, `<b>Verdacht: Browser hält nicht alle ${a.verbindungen} Long-Polling-Verbindungen gleichzeitig offen</b> (bei HTTP/1.1 höchstens 6 je Server) – Gegenprobe mit 1 Team, oder Teams auf mehrere Geräte verteilen`)
      : "",
    z(d.schleifeMax <= 500, `Ereignisschleife dieser Seite: max. ${dauer(d.schleifeMax)} Verzug${d.schleifeP99 !== null ? `, 99 % ≤ ${dauer(d.schleifeP99)}` : ""}${d.schleifeMax > 500 ? " – Seite ausgelastet, Werte enthalten Rechenzeit" : ""}`),
    z(d.verdecktS === 0, d.verdecktS === 0 ? "Seite immer im Vordergrund" : `Seite ${d.verdecktS} s verdeckt – Zeitgeber gedrosselt, Werte unsicher`),
    d.aufbauS !== null ? z(d.aufbauS <= 15, `Verbindungsaufbau ${a.verbindungen} Verbindungen: ${d.aufbauS.toFixed(1).replace(".", ",")} s`) : "",
    z(d.abbrueche === 0, `Verbindungsabbrüche: ${d.abbrueche}`),
    a.transport !== "Long-Polling"
      ? z(null, "WebSocket statt Long-Polling – nicht wie im Hörsaal")
      : prot.length
        ? z(!p11, `HTTP der Long-Polling-Anfragen: ${prot.map(([p, n]) => `${esc(p)} (${n})`).join(", ")}`)
        : "",
    z(d.abgelehnt === 0, `Abgelehnte Aktionen: ${d.abgelehnt}`),
    ...(a.phase === "ende" ? [z(d.nichtGesendet === 0 && d.offen === 0, `Nicht gesendet: ${d.nichtGesendet} · ohne Antwort im Protokoll: ${d.offen}`)] : []),
    ...d.verbindungsFehler.slice(0, 2).map((f) => z(false, esc(f))),
    ...d.fehler.slice(-2).map((f) => z(false, esc(f))),
    ...d.hinweise.slice(-2).map((h) => z(false, esc(h))),
  ].filter(Boolean);
  return `<ul class="diagnose">${zeilen.join("")}</ul>`;
}

function aufbauText(a: Auswertung): string {
  if (a.mitHost && a.teamsHier === a.teams) return `${a.teams} ${a.teams === 1 ? "Team" : "Teams"} × 3 Bots + Host = ${a.verbindungen} Verbindungen`;
  if (a.mitHost) return `Host für ${a.teams} Teams, davon ${a.teamsHier} mit Bots auf diesem Gerät · ${a.verbindungen} Verbindungen hier`;
  return `${a.teamsHier} ${a.teamsHier === 1 ? "Team" : "Teams"} × 3 Bots auf diesem Gerät (Host auf anderem Gerät) = ${a.verbindungen} Verbindungen`;
}

export function laufHtml(a: Auswertung, status: string): string {
  START = a.start;
  const laeuft = a.phase === "laeuft" || a.phase === "vorbereiten" || a.phase === "abschluss";
  const amp = AMPEL[a.ampel];
  const fensterKopf = a.teamsAus[0]?.fenster.map((_, i) => `<th class="fenster">${uhrzeit(START, i * FENSTER_S).slice(0, 5)}–${uhrzeit(START, Math.min(a.dauerS, (i + 1) * FENSTER_S)).slice(0, 5)}</th>`).join("") ?? "";
  const knoepfe = laeuft
    ? `<button type="button" class="knopf warn" data-aktion="abbrechen" ${a.phase === "abschluss" ? "disabled" : ""}>Abbrechen</button>`
    : `<button type="button" class="knopf" data-aktion="json">Messdaten (JSON)</button><button type="button" class="knopf" data-aktion="neu">Neuer Lauf</button>`;
  const spiel = a.phase === "laeuft" || a.phase === "abschluss" || a.phase === "ende"
    ? `Spielzeit <b>${uhrzeit(START, Math.min(a.dauerS, a.spielzeit))}</b> · ` : "";
  return `
  <main class="lauf">
    <header class="kopf">
      <h1><span class="marke">ARGUS</span> Lasttest</h1>
      <div class="meta">
        <span><b>${esc(a.code ?? "…")}</b> · ${esc(a.datum)} · ${esc(a.db)} · ${esc(a.transport)} · Tempo ×${a.tempo}</span>
        <span>${aufbauText(a)} · ${esc(a.szenario)} · Stand ${esc(a.stand)}</span>
      </div>
      <div class="knoepfe">${knoepfe}</div>
    </header>
    <section class="ergebnis">
      <div class="ampel ampel-${a.ampel}"><span class="zeichen">${amp.zeichen}</span><span>${amp.text}</span></div>
      <div class="haupt">
        <div class="titel">Klick → Protokoll <span class="leise klein">(${a.mitHost && a.teamsHier === a.teams ? "alle Teams" : "Teams dieses Geräts"}, eigenes Fenster)</span></div>
        <div class="zahlen">
          <span><small>Median</small>${dauer(a.gesamt.median)}</span>
          <span><small>95 %</small>${dauer(a.gesamt.p95)}</span>
          <span><small>max.</small>${dauer(a.gesamt.max)}</span>
          <span><small>Aktionen</small>${a.gesamt.n}</span>
        </div>
      </div>
      <div class="status">
        <div class="phase phase-${a.phase}">${esc(status)}</div>
        <div class="leise">${spiel}Echtzeit ${minuten(a.laufzeitS)}</div>
        <div class="leise klein">Bewertung ✓ Median ≤ ${dauer(SCHWELLEN.gruen.median)} und max. ≤ ${dauer(SCHWELLEN.gruen.max)} · ▲ ≤ ${dauer(SCHWELLEN.gelb.median)} / ${dauer(SCHWELLEN.gelb.max)}</div>
      </div>
    </section>
    <table class="teams">
      <thead><tr><th>Team</th><th class="zahl">Median</th><th class="zahl">95 %</th><th class="zahl">max.</th>
        <th class="diagramm">über die Spielzeit <span class="leise">(Punkt = Klick, Linie = gleitender Median, gestrichelt = 2 s)</span></th>${fensterKopf}<th>Stand</th></tr></thead>
      <tbody>${a.teamsAus.map((t) => teamZeile(t, a, laeuft)).join("")}</tbody>
      <tfoot><tr><td colspan="4"></td><td class="diagramm">${achsenzeile(a.dauerS)}</td><td colspan="${(a.teamsAus[0]?.fenster.length ?? 0) + 1}"></td></tr></tfoot>
    </table>
    <section class="unten">
      <div>
        <h2>Teilstrecken <span class="leise klein">(Bot-Aktionen dieses Geräts · Median · max.${a.mitHost ? "" : " · Host-Teilstrecken nur am Host-Gerät"})</span></h2>
        <table class="strecken">${a.teilstrecken.filter((s) => a.mitHost || s.k.n > 0).map((s) => `<tr><th>${esc(s.name)} <span class="leise klein">${esc(s.erklaerung)}</span></th><td class="zahl">${dauer(s.k.median)}</td><td class="zahl">${dauer(s.k.max)}</td><td class="zahl leise klein">n = ${s.k.n}</td></tr>`).join("")}</table>
      </div>
      <div>
        <h2>Diagnose</h2>
        ${diagnoseHtml(a)}
      </div>
    </section>
  </main>`;
}
