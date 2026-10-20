// Kurzbeschreibung eines Ereignisses in Klartext (Protokollanzeige, Export, später Auswertung).
import type { Inhalte } from "../inhalte/typen";
import type { Ereignis } from "./ereignisse";
import { trefferText } from "./regeln";
import { ENTSCHEID_TEXT, ROLLEN_NAME } from "./sichten";
import { uhrzeit } from "./uhr";

export function absenderText(e: Ereignis): string {
  if (e.von.rolle === "system") return "System";
  return e.von.name || ROLLEN_NAME[e.von.rolle];
}

export function beschreibe(e: Ereignis, inh: Inhalte): string {
  const wm = (id?: string) => (id ? inh.wirkmittel[id]?.kurz ?? id : "");
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
      const zusatz = e.daten.entfaellt ? " – entfällt, Ziel schon zerstört" : e.daten.fast_track ? " – Fast-Track direkt an G2" : "";
      return `ARGUS ${e.daten.meldung}: ${m?.argus.klasse ?? "?"} ${m?.argus.konfidenz ?? "?"} % ${m?.argus.empfehlung ?? ""}${zusatz}${e.daten.manuell ? " (manuell)" : ""}`;
    }
    case "g1_entscheid":
      return `${e.daten.meldung} ${ENTSCHEID_TEXT[e.daten.entscheid]}${e.daten.vermerk ? ` – „${e.daten.vermerk}“` : ""}`;
    case "g2_empfehlung": {
      const d = e.daten;
      const w = d.warnungen?.length ? ` ⚠ ${d.warnungen.join("; ")}` : "";
      return `${d.meldung} ${ENTSCHEID_TEXT[d.empfehlung]}${d.wirkmittel ? ` mit ${wm(d.wirkmittel)}` : ""}${d.begruendung ? ` – „${d.begruendung}“` : ""}${w}`;
    }
    case "g3_entscheid": {
      const d = e.daten;
      const w = d.warnungen?.length ? ` ⚠ trotz Warnung: ${d.warnungen.join("; ")}` : "";
      return `${d.meldung} ${ENTSCHEID_TEXT[d.entscheid]}${d.wirkmittel ? ` (${wm(d.wirkmittel)})` : ""}${d.bemerkung ? ` – „${d.bemerkung}“` : ""}${w}`;
    }
    case "wirkung": {
      const g = e.daten.getroffen ?? [];
      return `Wirkung ${wm(e.daten.wirkmittel)} auf ${e.daten.meldung}: ${g.length ? g.map(trefferText).join(", ") : "nichts getroffen"}`;
    }
    case "inject": {
      const i = inh.injects[e.daten.inject];
      return `Inject ${e.daten.inject} an ${i?.an ?? "?"} (${i?.von ?? "?"})${e.daten.manuell ? " – manuell" : ""}`;
    }
    case "inject_quittiert":
      return `Inject ${e.daten.inject} quittiert`;
    case "lagehinweis":
      return `Lagehinweis an ${e.daten.an.map((r) => r.toUpperCase()).join("/")}: „${e.daten.text}“`;
    case "fast_track":
      return `Fast-Track ${e.daten.an ? "EIN" : "AUS"}`;
    case "notiz":
      return `Notiz: ${e.daten.text}`;
    case "spielende":
      return `Spielende (${e.daten.grund})`;
    case "aktion_abgelehnt":
      return `abgewiesen (${e.daten.aktionstyp}): ${e.daten.grund}`;
    default:
      return (e as { typ: string }).typ;
  }
}
