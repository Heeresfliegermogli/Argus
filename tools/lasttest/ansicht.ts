// Darstellung des Lasttests ohne Framework: Einstellungen vor dem Start, danach eine Seite für Verlauf und Ergebnis, die in
// 1530 × 800 passt (zum Abfotografieren). Knöpfe tragen data-aktion (ein Klick-Hörer für alles).
import { uhrzeit } from "../../src/kern/uhr";
import { type Ampel, type Auswertung, SCHWELLEN, type TeamAuswertung } from "./auswertung";
import type { LastOptionen } from "./lauf";
import type { Kennzahlen } from "./messung";
import { ANZAHL_LAEUFE, MODELLE } from "./plan";

export const TEMPI = [1, 2, 5, 10, 20];
export const VERZUEGE = [0, 5, 15];
/** Trennung der Team-Laptops: [ab s nach Start, Dauer s] */
export const TRENNUNGEN: { wert: string; text: string }[] = [
  { wert: "", text: "keine" },
  { wert: "30,20", text: "20 s (ab 30 s nach dem Start)" },
  { wert: "30,60", text: "60 s (ab 30 s nach dem Start)" },
];

export type Aufteilung = "alles" | "sl" | "beitreten";

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

function sek(s: number | null | undefined): string {
  return s === null || s === undefined ? "–" : dauer(s * 1000);
}

function minuten(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

const AMPEL: Record<Ampel, string> = { gruen: "✓", gelb: "▲", rot: "✕", offen: "…" };

// ---------------------------------------------------------------- Einstellungen

export function verbindungenFuer(o: LastOptionen, auf: Aufteilung): number {
  const laptops = auf === "alles" ? o.teams : o.hier.filter((n) => n <= o.teams).length;
  return laptops + (auf === "beitreten" ? 0 : 1 + (o.plenum ? 1 : 0));
}

export function trennenWert(t: LastOptionen["trennen"]): string {
  return t ? `${t.ab},${t.dauer}` : "";
}

export function einstellungenHtml(o: LastOptionen, auf: Aufteilung, dauerS: number): string {
  const tempo = TEMPI.map((t) => `<button type="button" class="knopf ${t === o.tempo ? "an" : ""}" data-aktion="tempo" data-wert="${t}">×${t}<small>${minuten(dauerS / t)} min</small></button>`).join("");
  const teams = Array.from({ length: ANZAHL_LAEUFE }, (_, i) => i + 1)
    .map((n) => `<option value="${n}" ${n === o.teams ? "selected" : ""}>${n} ${n === 1 ? "Team" : "Teams"}</option>`).join("");
  const verzug = VERZUEGE.map((v) => `<option value="${v}" ${v * 1000 === o.verzug ? "selected" : ""}>${v ? `${v} s je Richtung` : "keiner"}</option>`).join("");
  const trennen = TRENNUNGEN.map((t) => `<option value="${t.wert}" ${t.wert === trennenWert(o.trennen) ? "selected" : ""}>${t.text}</option>`).join("");
  const verb = verbindungenFuer(o, auf);
  const wahl = (wert: Aufteilung, text: string) => `<label class="haken"><input type="radio" name="aufteilung" value="${wert}" ${auf === wert ? "checked" : ""} /> ${text}</label>`;
  const hier = Array.from({ length: o.teams }, (_, i) => i + 1)
    .map((n) => `<label class="haken"><input type="checkbox" name="hier" value="${n}" ${o.hier.includes(n) ? "checked" : ""} /> Team ${n}</label>`).join("");
  const modelle = MODELLE.slice(0, o.teams).map((m, i) => `${i + 1}: ${m.modell} ${m.dauer} s`).join(" · ");
  return `
  <main class="start">
    <section class="karte">
      <h1><span class="marke">ARGUS</span> Lasttest Firebase <span class="leise klein">(2.6: jeder Team-Laptop rechnet selbst)</span></h1>
      <p>Spielt eine echte Sitzung in der Datenbank durch: <b>${o.teams} Team-Laptops</b> (je eine eigene Firebase-Verbindung, jeder
        rechnet sein Spiel selbst, ein Bot entscheidet nach Plan), die <b>Spielleitung</b> und das <b>Plenum</b>. Gemessen wird, ob das
        Spiel der Teams flüssig bleibt (Klick → eigener Stand), wie schnell Protokoll und Statusmeldungen bei der Spielleitung ankommen
        und ob die Auswertung am Ende vollständig ist – auch mit künstlichem Netzverzug und einer Trennung (H1.6).</p>
      <p class="leise klein">Modellteams: ${esc(modelle)} (Sekunden je Entscheidung)</p>
      <div class="felder">
        <label class="breit">Datenbank<input id="db" class="feld" value="${esc(o.db)}" spellcheck="false" /></label>
        <label>Verbindung
          <select id="transport" class="feld">
            <option value="lp" ${o.transport === "lp" ? "selected" : ""}>Long-Polling (wie im Hörsaal)</option>
            <option value="auto" ${o.transport === "auto" ? "selected" : ""}>WebSocket (Nachbildung, oder wo das Netz es erlaubt)</option>
          </select></label>
        <label>Teams in der Sitzung<select id="teams" class="feld">${teams}</select></label>
        <label>Künstlicher Netzverzug<select id="verzug" class="feld">${verzug}</select></label>
        <label>Team-Laptops trennen<select id="trennen" class="feld">${trennen}</select></label>
      </div>
      <div class="gruppe">
        <span class="leise">Aufteilung</span>
        ${wahl("alles", "Alles auf diesem Gerät – Spielleitung, Plenum und alle Team-Laptops")}
        ${wahl("sl", "Verteilt – dieses Gerät legt die Sitzung an und führt Spielleitung und Plenum")}
        ${wahl("beitreten", `Verteilt – dieses Gerät tritt mit Team-Laptops bei: Code <input id="code" class="feld kurz" value="${esc(o.code ?? "")}" placeholder="K7P" spellcheck="false" />`)}
        ${auf !== "alles" ? `<div class="zeile"><span class="leise">Team-Laptops auf diesem Gerät:</span>${hier}</div>` : ""}
      </div>
      ${auf === "beitreten"
        ? `<p class="leise klein">Tempo und Start stellt das Gerät der Spielleitung ein. Erst alle Geräte starten, dann wartet dieses Gerät auf ▶.</p>`
        : `<div class="tempo"><span class="leise">Tempo</span>${tempo}</div>
           <label class="haken"><input type="checkbox" id="plenum" ${o.plenum ? "checked" : ""} /> Plenum verbinden (liest alle Teams mit)</label>`}
      <p class="leise klein">×1 ist Echtzeit wie im Hörsaal (25 min Spielzeit). <b>${verb} Verbindungen auf diesem Gerät.</b> Den Tab im
        Vordergrund lassen und den Rechner nicht sperren (sonst bremst der Browser die Zeitgeber).${auf === "beitreten" ? "" : " Jeder Lauf legt eine neue Sitzung in der Datenbank an."}</p>
      <div class="zeile"><button type="button" class="knopf gross gut" data-aktion="start">▶ Lasttest starten</button></div>
    </section>
  </main>`;
}

// ---------------------------------------------------------------- Verlauf je Team

const B = 600;
const H = 44;
const X0 = 30;

/** Rückstand der Spielleitung (fett) und Alter der Statusmeldung (dünn) über die Echtzeit, Trennung grau hinterlegt. */
function verlauf(t: TeamAuswertung, a: Auswertung, xMax: number, yMax: number): string {
  const x = (s: number) => X0 + (Math.max(0, Math.min(xMax, s)) / xMax) * (B - X0 - 6);
  const y = (s: number) => H - 3 - (Math.max(0, Math.min(yMax, s)) / yMax) * (H - 8);
  const tr = a.trennung ? `<rect class="trennung" x="${x(a.trennung.von)}" y="2" width="${Math.max(1, x(a.trennung.bis ?? a.seitStart) - x(a.trennung.von))}" height="${H - 4}" />` : "";
  const ticks = [0, yMax / 2, yMax].map((v) => `<line class="raster" x1="${X0}" x2="${B - 6}" y1="${y(v)}" y2="${y(v)}" /><text class="achse" x="${X0 - 4}" y="${y(v) + 3}" text-anchor="end">${Math.round(v)} s</text>`).join("");
  const linie = (i: 1 | 2, cls: string) => {
    const pts = t.proben.filter((p) => p[i] !== null).map((p) => `${x(p[0]).toFixed(1)},${y(p[i]!).toFixed(1)}`);
    return pts.length > 1 ? `<polyline class="${cls}" points="${pts.join(" ")}" />` : "";
  };
  return `<svg class="streifen" viewBox="0 0 ${B} ${H}" width="${B}" height="${H}" role="img" aria-label="Rückstand der Spielleitung, ${esc(t.name)}">
    ${tr}${ticks}${linie(1, "status")}${linie(2, "rueckstand")}</svg>`;
}

function achsenzeile(xMax: number): string {
  const schritt = xMax > 600 ? 300 : xMax > 240 ? 60 : xMax > 90 ? 30 : 10;
  const labels = [];
  for (let s = 0; s <= xMax; s += schritt) {
    const anker = s === 0 ? "start" : s + schritt > xMax ? "end" : "middle";
    labels.push(`<text class="achse" x="${X0 + (s / xMax) * (B - X0 - 6)}" y="11" text-anchor="${anker}">${minuten(s)}</text>`);
  }
  return `<svg class="streifen" viewBox="0 0 ${B} 14" width="${B}" height="14" aria-hidden="true">${labels.join("")}</svg>`;
}

// ---------------------------------------------------------------- Verlauf und Ergebnis

function kz(k: Kennzahlen, warnAb?: number): string {
  if (!k.n) return `<span class="leise">–</span>`;
  const warn = warnAb !== undefined && (k.max ?? 0) > warnAb;
  return `<b>${dauer(k.median)}</b><span class="${warn ? "warn" : "leise"}"> / ${dauer(k.max)}</span>`;
}

function haken(w: boolean | null, ja: string, nein: string): string {
  if (w === null) return "";
  return w ? `<span class="ok">✓ ${ja}</span>` : `<span class="schlecht">✕ ${nein}</span>`;
}

function teamZeile(t: TeamAuswertung, a: Auswertung, xMax: number, yMax: number, laeuft: boolean): string {
  const ab = t.abschluss;
  const stand = !ab
    ? `<span class="leise">${laeuft ? `${uhrzeit(START, t.spielzeit)} · ` : ""}seq ${t.seq}</span>`
    : [
      [haken(ab.ende, "Ende", "kein Spielende"), haken(ab.slGleich, "SL", "SL unvollständig"), haken(ab.plenumGleich, "Plenum", "Plenum unvollst.")].filter(Boolean).join(" "),
      [ab.faelleGleich === null ? "" : ab.faelleGleich ? `<span class="ok">✓ Fälle wie ohne Netz</span>` : `<span class="warn" title="${esc(ab.faelleAnders.join("; "))}">▲ ${ab.faelleAnders.length} Fälle anders</span>`,
        ab.abgelehnt.length ? `<span class="schlecht">✕ ${ab.abgelehnt.length} abgelehnt</span>` : ""].filter(Boolean).join(" · "),
    ].filter(Boolean).join("<br>");
  const fehler = t.botFehler.length ? ` · <span class="warn" title="${esc(t.botFehler.join("; "))}">${t.botFehler.length} übersprungen</span>` : "";
  return `<tr class="${t.lokal ? "" : "fremd"}">
    <th class="team"><span class="tname">${esc(t.name)}</span><br><span class="leise klein">${t.lokal ? `${t.gesendet}/${t.geplant} Klicks${fehler}` : "Laptop auf anderem Gerät"}</span></th>
    <td class="zahl">${t.lokal ? kz(t.klick, SCHWELLEN.klick.gruen) : "–"}</td>
    <td class="zahl">${t.startMs !== null ? dauer(t.startMs) : "–"}</td>
    <td class="zahl">${kz(t.upload)}</td>
    <td class="zahl">${sek(t.statusMax)}</td>
    <td class="zahl">${t.lokal ? sek(t.rueckstandMax) : "–"}</td>
    <td class="diagramm">${verlauf(t, a, xMax, yMax)}</td>
    <td class="stand klein">${stand}</td>
  </tr>`;
}

function diagnoseHtml(a: Auswertung): string {
  const d = a.diagnose;
  const z = (ok: boolean | null, text: string) => `<li class="${ok === null ? "" : ok ? "ok" : "warn"}">${ok === null ? "·" : ok ? "✓" : "⚠"} ${text}</li>`;
  const zeilen = [
    z(d.schleifeMax <= SCHWELLEN.schleife.gruen, `Ereignisschleife dieser Seite während des Spiels: max. ${dauer(d.schleifeMax)} Verzug${d.schleifeP99 !== null ? `, 99 % ≤ ${dauer(d.schleifeP99)}` : ""} (alle Fenster in einer Seite)`),
    a.startSpanne !== null ? z(a.startSpanne <= 2, `Gleiche Spielzeit nach dem Start: Spanne ${a.startSpanne.toFixed(2).replace(".", ",")} s (H1.4: ≤ 1–2 s)`) : "",
    z(d.verdecktS === 0, d.verdecktS === 0 ? "Seite immer im Vordergrund" : `Seite ${d.verdecktS} s verdeckt – Zeitgeber gedrosselt, Werte unsicher`),
    d.aufbauS !== null ? z(d.aufbauS <= 20, `Verbindungsaufbau ${a.verbindungen} Verbindungen: ${d.aufbauS.toFixed(1).replace(".", ",")} s`) : "",
    a.trennung ? z(null, `Team-Laptops getrennt ${minuten(a.trennung.von)}–${a.trennung.bis !== null ? minuten(a.trennung.bis) : "…"} (Echtzeit nach dem Start)`) : "",
    a.aufholenS !== null ? z(true, `Nach Spielende aufgeholt in ${dauer(a.aufholenS * 1000)}`) : "",
    z(d.abgelehnt === 0, `Abgelehnte Entscheidungen: ${d.abgelehnt}`),
    ...(a.phase === "ende" ? [z(d.nichtGesendet === 0, `Nicht gesendet: ${d.nichtGesendet}`)] : []),
    ...d.verbindungsFehler.slice(0, 2).map((f) => z(false, esc(f))),
    ...d.fehler.slice(-2).map((f) => z(false, esc(f))),
    ...d.hinweise.filter((h) => !/simuliert/.test(h)).slice(-2).map((h) => z(false, esc(h))),
  ].filter(Boolean);
  return `<ul class="diagnose">${zeilen.join("")}</ul>`;
}

function aufbauText(a: Auswertung): string {
  const teile = [`${a.teamsHier} Team-Laptops`];
  if (a.mitSl) teile.push("Spielleitung");
  if (a.plenum) teile.push("Plenum");
  return `${teile.join(" + ")} = ${a.verbindungen} Verbindungen${a.mitSl && a.teamsHier < a.teams ? ` (${a.teams - a.teamsHier} Teams auf anderen Geräten)` : ""}`;
}

export function laufHtml(a: Auswertung, status: string): string {
  START = a.start;
  const laeuft = a.phase === "laeuft" || a.phase === "vorbereiten" || a.phase === "abschluss";
  const knoepfe = laeuft
    ? `<button type="button" class="knopf warn" data-aktion="abbrechen" ${a.phase === "abschluss" ? "disabled" : ""}>Abbrechen</button>`
    : `<button type="button" class="knopf" data-aktion="json">Messdaten (JSON)</button><button type="button" class="knopf" data-aktion="neu">Neuer Lauf</button>`;
  const spiel = a.phase === "laeuft" || a.phase === "abschluss" || a.phase === "ende"
    ? `Spielzeit <b>${uhrzeit(START, Math.min(a.dauerS, a.spielzeit))}</b> · ` : "";
  const xMax = Math.max(30, a.seitStart, a.dauerS / Math.max(1, a.tempo) + (a.aufholenS ?? 0));
  const beob = Math.max(0, ...a.teamsAus.flatMap((t) => t.proben.flatMap((p) => [p[1] ?? 0, p[2] ?? 0])));
  const yMax = Math.max(10, Math.ceil((Math.max(beob, a.verzugS * 2 + 6) * 1.1) / 10) * 10);
  const box = (amp: Ampel, titel: string, haupt: string, unter: string) => `
    <div class="box ampel-${amp}"><div class="box-kopf"><span class="zeichen">${AMPEL[amp]}</span>${titel}</div>
      <div class="box-zahl">${haupt}</div><div class="leise klein">${unter}</div></div>`;
  const aw = a.auswertungTeams;
  const verz = a.verzugS ? `Verzug ${a.verzugS} s je Richtung` : "ohne Verzug";
  const tr = a.trennen ? ` · Trennung ${a.trennen.dauer} s ab ${a.trennen.ab} s` : "";
  return `
  <main class="lauf">
    <header class="kopf">
      <h1><span class="marke">ARGUS</span> Lasttest</h1>
      <div class="meta">
        <span><b>${esc(a.code ?? "…")}</b> · ${esc(a.datum)} · ${esc(a.db)} · ${esc(a.transport)} · Tempo ×${a.tempo} · <b class="verzug">${verz}${tr}</b></span>
        <span>${aufbauText(a)} · ${esc(a.szenario)} · Stand ${esc(a.stand)}</span>
      </div>
      <div class="knoepfe">${knoepfe}</div>
    </header>
    <section class="ergebnis">
      ${box(a.ampel.spiel, "Spiel der Teams flüssig", `${dauer(a.klick.max)}`, `Klick → eigener Stand, max. (Median ${dauer(a.klick.median)}, n = ${a.klick.n}) – ohne Netz`)}
      ${box(a.ampel.sl, a.mitSl ? "Spielleitung holt auf" : "Protokoll hochgeladen", a.mitSl ? `${sek(a.rueckstandMax)}` : a.aufholenS !== null ? "vollständig" : "…",
        a.mitSl ? `größter Rückstand des Protokolls · Status max. ${sek(a.statusMax)} alt · Upload Median ${dauer(a.upload.median)}` : "alle Ereignisse der Laptops dieses Geräts im Netz")}
      ${box(a.ampel.auswertung, "Auswertung vollständig", aw ? `${aw.ende}/${a.teams} Teams` : "–", aw ? "mit Spielende in der Auswertung der Spielleitung, Fälle wie ohne Netz" : "nur am Gerät der Spielleitung")}
      <div class="status">
        <div class="phase phase-${a.phase}">${esc(status)}</div>
        <div class="leise">${spiel}Echtzeit ${minuten(a.laufzeitS)}</div>
        <div class="leise klein">✓ flüssig: Klick → Stand ≤ ${SCHWELLEN.klick.gruen} ms und Ereignisschleife ≤ ${dauer(SCHWELLEN.schleife.gruen)}</div>
      </div>
    </section>
    <table class="teams">
      <thead><tr><th>Team</th><th class="zahl">Klick → Stand<br><span class="leise">Median / max.</span></th><th class="zahl">Start<br><span class="leise">Signal</span></th>
        <th class="zahl">Laptop → SL<br><span class="leise">Median / max.</span></th><th class="zahl">Status<br><span class="leise">max. Alter</span></th>
        <th class="zahl">Rückstand<br><span class="leise">max.</span></th>
        <th class="diagramm">Verlauf nach dem Start <span class="leise">(fett: Rückstand des Protokolls bei der SL · dünn: Alter der Statusmeldung · grau: getrennt)</span></th><th>Stand</th></tr></thead>
      <tbody>${a.teamsAus.map((t) => teamZeile(t, a, xMax, yMax, laeuft)).join("")}</tbody>
      <tfoot><tr><td colspan="6"></td><td class="diagramm">${achsenzeile(xMax)}</td><td></td></tr></tfoot>
    </table>
    <section class="unten">
      <div>
        <h2>Diagnose</h2>
        ${diagnoseHtml(a)}
      </div>
    </section>
  </main>`;
}
