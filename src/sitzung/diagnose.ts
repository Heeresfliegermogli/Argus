// „Diagnose kopieren“ (Liste L, L6.1): ein Text zum Einfügen in den Chat, wenn im Test etwas hängt. Ohne Namen der Teilnehmer –
// nur Gerätenamen (Kennung), Programmstände, Verbindung, Läufe und was aussteht.
import { geraeteName } from "../kern/sitzungen";
import { mmss } from "../kern/uhr";
import type { Sitzung } from "./sitzung";

function alter(ts: number | null | undefined, jetzt: number): string {
  return typeof ts === "number" && ts > 0 ? `vor ${mmss(Math.max(0, Math.round((jetzt - ts) / 1000)))}` : "–";
}

export function diagnoseText(s: Sitzung): string {
  const st = s.stand;
  const jetzt = s.adapter.serverJetzt();
  const z: string[] = [];
  const ort = typeof location !== "undefined" ? `${location.host}${location.pathname}` : "";
  z.push(`ARGUS Diagnose · ${new Date().toLocaleString("de-DE")}`);
  z.push(`Sitzung ${st.code}${st.direkt ? " (Test ohne Lobby)" : ""} · Szenario ${s.inh.szenario.id} v${s.inh.szenario.version} · ${ort}`);
  z.push(`Dieses Fenster: ${st.art === "sl" ? "Spielleitung" : st.art} ${st.client} · Stand ${__ARGUS_STAND__} · ${st.istHost ? "steuert" : `steuert nicht (Steuerung: ${st.host ? `${st.host.id}, Puls ${alter(st.host.puls, jetzt)}` : "niemand"})`}`);
  z.push(`Transport: ${st.verbindung.art} · ${st.verbindung.verbunden ? "verbunden" : "NICHT verbunden"}${st.verbindung.fehler ? ` · Fehler: ${st.verbindung.fehler}` : ""}`);
  z.push(`Serverzeit − Uhr dieses Rechners: ${Math.round(jetzt - Date.now())} ms`);
  z.push(`Marke „Alle Sitzungen beendet“: ${!st.reset.geladen ? "noch keine Antwort" : !st.reset.lesbar ? "nicht lesbar (Firebase-Regeln ohne argus/v1/reset)" : st.reset.ts ? new Date(st.reset.ts).toLocaleString("de-DE") : "keine"}`);
  z.push(`Sitzung beendet: ${st.beendet !== null ? "ja" : "nein"} · Regelfehler: ${st.regelFehler || st.regelFehlerBei.length ? `ja${st.regelFehlerBei.length ? ` (${st.regelFehlerBei.join(", ")})` : ""}` : "nein"}`);
  z.push("");
  z.push(`Fenster (${st.teilnehmer.length} verbunden):`);
  const rechner = new Map(st.teams.filter((t) => t.rechner).map((t) => [t.rechner!, t]));
  const teamVon = (client: string) => st.teams.find((t) => t.spieler.some((x) => x.client === client));
  for (const t of [...st.teilnehmer].sort((a, b) => a.art.localeCompare(b.art) || a.client.localeCompare(b.client))) {
    const team = teamVon(t.client);
    z.push(`- ${t.art === "tt" ? "Team" : t.art === "sl" ? "SL" : "Plenum"} ${t.art === "tt" ? geraeteName(t.client) : t.client} · Team ${team?.name ?? "–"} · Stand ${t.version ?? "?"}${t.version && t.version !== __ARGUS_COMMIT__ ? " (WEICHT AB)" : ""} · Fenster ${t.fenster ?? "?"}${t.hintergrund ? " · Tab im HINTERGRUND" : ""} · Puls ${alter(t.puls, jetzt)} · rechnet ${rechner.has(t.client) ? "ja" : "nein"}${t.regeln ? " · Regelfehler" : ""}${t.zwei ? " · zwei Verläufe" : ""}`);
  }
  z.push("");
  z.push(`Teams (${st.teams.length}):`);
  for (const t of st.teams) {
    const sp = s.spiel(t.id);
    const u = st.status[t.id];
    const netz = sp?.stand.zustand.seq ?? 0;
    const aus = sp?.stand.ausstehend ?? [];
    const grund = s.uhrGrund(t.id);
    z.push(`- ${t.name} (${t.id}) · Lauf ${t.lauf ?? "–"} · rechnet: ${t.rechner ? `${geraeteName(t.rechner)} ${t.rechnerOnline ? "verbunden" : "NICHT verbunden"}, zuletzt ${alter(t.rechnerZuletzt, jetzt)}` : "kein Laptop"} · Einträge im Team: ${t.spieler.map((x) => `${geraeteName(x.client)}${x.online ? "" : " (weg)"}`).join(", ") || "keine"}`);
    z.push(`  Protokoll: im Netz bis ${netz}${u && u.lauf === t.lauf ? ` · Laptop meldet seq ${u.seq}, hoch ${u.hoch}, Status ${alter(u.ts, jetzt)} von ${geraeteName(u.client)}, Uhr ${u.laeuft ? "läuft" : "steht"} bei ${mmss(u.t_s)}` : u ? ` · Statusmeldung gehört zu anderem Lauf (${u.lauf})` : " · keine Statusmeldung"}${s.zweiVerlaeufe(t.id) ? " · ZWEI VERLÄUFE" : ""}`);
    z.push(`  Ausstehend: ${aus.length ? aus.map((a) => `${a.typ}${a.typ === "uhr" ? `/${(a.daten as { befehl?: string }).befehl ?? ""}` : ""} ${alter(a.ts, jetzt)}`).join(", ") : "nichts"}${grund ? ` · ${grund.kurz}` : ""}`);
  }
  return z.join("\n");
}

/** Text in die Zwischenablage; false, wenn der Browser es nicht erlaubt (dann zeigt die Ansicht den Text zum Markieren). */
export async function kopiere(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const feld = document.createElement("textarea");
      feld.value = text;
      feld.style.position = "fixed";
      feld.style.opacity = "0";
      document.body.appendChild(feld);
      feld.select();
      const ok = document.execCommand("copy");
      feld.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
