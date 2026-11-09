// Kurzbeschreibung eines Ereignisses in Klartext (Protokollanzeige der Spielleitung). Seit B3/B7 (25.10.2026) mit
// „Ziel 7 (M07)“: die Nummer der Spieler, die interne Kennung für die Spielleitung dahinter. Seit 2.6 (H2) eine Rolle je
// Team und eine Entscheidung je Meldung, mit den Sekunden ab Eingang und ab Öffnen.
import type { Inhalte } from "../inhalte/typen";
import type { Ereignis } from "./ereignisse";
import { trefferText } from "./regeln";
import { ENTSCHEID_TEXT, ROLLEN_NAME } from "./sichten";
import { uhrzeit } from "./uhr";
import { zielNr } from "./zielnummern";
import type { Spielzustand } from "./zustand";

/** Empfänger eines Injects (seit 2.6 immer das Team). */
function empfaenger(an: string | undefined): string {
  return an || "Team";
}

export function absenderText(e: Ereignis): string {
  if (e.von.rolle === "system") return "System";
  return e.von.name || ROLLEN_NAME[e.von.rolle];
}

export function beschreibe(e: Ereignis, inh: Inhalte, z: Spielzustand | null = null): string {
  const wm = (id?: string) => (id ? inh.wirkmittel[id]?.kurz ?? id : "");
  const ziel = (id: string) => {
    const n = zielNr(inh, z, id);
    return n === id ? id : `Ziel ${n} (${id})`;
  };
  switch (e.typ) {
    case "spiel_neu":
      return `Neues Spiel ${e.daten.lauf} (${e.daten.szenario} v${e.daten.version})`;
    case "uhr": {
      const d = e.daten;
      const zustand = d.laeuft ? `läuft ×${d.tempo}` : "angehalten";
      const bei = uhrzeit(inh.szenario.spieluhr.start, d.t_s);
      if (d.befehl === "setzen") return `Uhr auf ${bei} gesetzt, ${zustand}`;
      if (d.befehl === "tempo") return `Tempo ×${d.tempo}`;
      return d.laeuft ? `Uhr gestartet bei ${bei} (×${d.tempo})` : `Uhr angehalten bei ${bei}`;
    }
    case "meldung": {
      const m = inh.meldungen[e.daten.meldung];
      const zusatz = e.daten.entfaellt ? " – entfällt, Ziel schon zerstört oder weg" : "";
      return `ARGUS ${ziel(e.daten.meldung)}: ${m?.argus.klasse ?? "?"} ${m?.argus.konfidenz ?? "?"} % ${m?.argus.empfehlung ?? ""}${zusatz}${e.daten.manuell ? " (manuell)" : ""}`;
    }
    case "entscheid": {
      const d = e.daten;
      const w = d.warnungen?.length ? ` ⚠ trotz Warnung: ${d.warnungen.join("; ")}` : "";
      const sek = d.sek_eingang !== undefined ? ` nach ${Math.round(d.sek_eingang)} s${d.sek_offen !== undefined ? ` (${Math.round(d.sek_offen)} s angesehen)` : ""}` : "";
      const n = d.einschlaege?.length ?? 0;
      return `${ziel(d.meldung)} ${ENTSCHEID_TEXT[d.entscheid]}${d.wirkmittel ? ` mit ${wm(d.wirkmittel)}${n > 1 ? ` ×${n}` : ""}` : ""}${sek}${w}`;
    }
    case "wirkung": {
      const d = e.daten;
      const g = d.getroffen ?? [];
      const spaet = d.t_einschlag !== undefined && d.t_einschlag > e.t_s + 0.5 ? ` (Einschlag ${uhrzeit(inh.szenario.spieluhr.start, d.t_einschlag)}, bei Spielende abgerechnet)` : "";
      const v = d.verstoesse?.length ? ` ⚠ beim Einschlag: ${d.verstoesse.join("; ")}` : "";
      return `Einschlag ${wm(d.wirkmittel)} auf ${ziel(d.meldung)}${d.ziel ? ` – ${d.ziel}` : ""}${spaet}: ${g.length ? g.map(trefferText).join(", ") : "nichts getroffen"}${v}`;
    }
    case "meldung_entfaellt":
      return `${ziel(e.daten.meldung)} entfällt im Eingang – ${e.daten.grund}`;
    case "verstaerkung": {
      const g = inh.szenario.verstaerkungen?.gruppen.find((x) => x.id === e.daten.gruppe) ?? inh.basis?.szenario.verstaerkungen?.gruppen.find((x) => x.id === e.daten.gruppe);
      return `Verstärkung ${e.daten.gruppe} eingespielt: ${g?.name ?? "?"} (${g?.kurz ?? "?"})`;
    }
    case "hintergrund": {
      const d = e.daten;
      if (d.art === "feindartillerie") return `Hintergrund ${d.id}: Feindartillerie schlägt ein`;
      if (d.art === "rauch") return `Hintergrund ${d.id}: Feind nebelt ein`;
      if (!d.wirkt) return `Hintergrund ${d.id}: Kanone der 1. Kp auf ${d.ziel} entfällt (${d.grund ?? "?"})`;
      return `Hintergrund ${d.id}: Kanone der 1. Kp trifft ${d.ziel} – ${d.folge === "ausser_gefecht" ? "außer Gefecht" : "zerstört"}`;
    }
    case "durchbruch": {
      const d = e.daten;
      const g = (inh.basis ?? inh).szenario.durchbruch?.gruppen.find((x) => x.id === d.gruppe)
        ?? (inh.basis ?? inh).szenario.verstaerkungen?.gruppen.find((x) => x.id === d.gruppe);
      return d.durch ? `Durchbruch ${d.gruppe}: ${g?.name ?? "?"} nicht aufgehalten – bricht über den Bach durch`
        : `Durchbruch ${d.gruppe}: ${g?.name ?? "?"} aufgehalten (${d.grund ?? "?"})`;
    }
    case "ereignis": {
      const d = e.daten;
      if (d.entfaellt) return `${d.ereignis} entfällt (${d.grund ?? "?"})`;
      return d.wirkt ? `${d.ereignis}: ${d.von} trifft ${d.ziel}` : `${d.ereignis}: ${d.von} auf ${d.ziel} entfällt (${d.grund ?? "?"})`;
    }
    case "inject": {
      const i = inh.injects[e.daten.inject];
      // seit 2.3: Druckmeldung der eigenen Truppe (K-…) mit Text und Stufe aus dem Protokoll
      if (!i && e.daten.text) return `Lagemeldung ${e.daten.inject} der 1. Kp${e.daten.stufe !== undefined ? ` (Stufe ${e.daten.stufe})` : ""}: „${e.daten.text}“`;
      return `Inject ${e.daten.inject} an ${empfaenger(i?.an)} (${i?.von ?? "?"})${e.daten.manuell ? " – manuell" : ""}`;
    }
    case "inject_quittiert":
      return `Lagemeldung ${e.daten.inject} angeklickt`;
    case "notiz":
      return `Notiz${e.daten.fall ? ` zu ${e.daten.fall}` : ""}: ${e.daten.text}`;
    case "spielende":
      return `Spielende (${e.daten.grund})`;
    case "aktion_abgelehnt":
      return `abgewiesen (${e.daten.aktionstyp}): ${e.daten.grund}`;
    default:
      return (e as { typ: string }).typ;
  }
}
