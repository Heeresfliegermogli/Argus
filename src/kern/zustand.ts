// Spielstand als reine Funktion des Protokolls: zustand = protokoll.reduce(anwenden, anfangsZustand).
// Läuft auf jedem Rechner gleich; deshalb zeigen alle Fenster denselben Stand, sobald sie dieselben
// Ereignisse haben. Keine Zufälle, keine Uhrzeit-Abfragen hier drin.
import type { Inhalte } from "../inhalte/typen";
import type {
  Absender, Ereignis, G1Entscheid, G2Empfehlung, G3Entscheid, Rolle, TrefferDaten,
} from "./ereignisse";
import { UHR_START, type UhrStand } from "./uhr";

export type Stufe = "g1" | "g2" | "g3" | "wirkung" | "erledigt" | "entfallen";
export type Ergebnis = "abgelehnt_g1" | "nicht_bekaempfen_g2" | "abgelehnt_g3" | "bekaempft";

/** Wann und von wem ein Schritt kam. */
export interface Schritt {
  seq: number;
  t_s: number;
  ts: number;
  von: Absender;
}

export interface MeldungsStand {
  id: string;
  erschienen: Schritt;
  fastTrack: boolean;
  manuell: boolean;
  stufe: Stufe;
  ergebnis?: Ergebnis;
  /** von G2 zurückgestellt (BEOBACHTEN), bleibt bei G2 sichtbar */
  beobachten: boolean;
  g1?: Schritt & { entscheid: G1Entscheid; vermerk?: string };
  g2?: Schritt & { empfehlung: G2Empfehlung; wirkmittel?: string; begruendung?: string; warnungen: string[] };
  g3?: Schritt & { entscheid: G3Entscheid; bemerkung?: string; wirkmittel?: string; warnungen: string[] };
  wirkung?: Schritt & { wirkmittel: string; pos: [number, number]; t_freigabe: number; getroffen: TrefferDaten[] };
  /** seq aller Ereignisse zu dieser Meldung (für Verlauf und Replay) */
  verlauf: number[];
}

export interface InjectStand {
  id: string;
  erschienen: Schritt;
  manuell: boolean;
  quittiert?: Schritt;
}

export interface Spielzustand {
  lauf: string | null;
  szenario: string | null;
  version: string | null;
  /** zuletzt angewandtes Ereignis */
  seq: number;
  uhr: UhrStand;
  ende: boolean;
  fastTrack: boolean;
  meldungen: Record<string, MeldungsStand>;
  reihenfolge: string[];
  injects: Record<string, InjectStand>;
  injectReihenfolge: string[];
  lagehinweise: (Schritt & { text: string; an: Rolle[] })[];
  notizen: (Schritt & { text: string })[];
  /** Restbestand je Wirkmittel, null = unbegrenzt */
  bestand: Record<string, number | null>;
  /** Fahrzeuge, die durch Wirkung ausgefallen sind: Ziel → Spielzeit */
  zerstoert: Record<string, number>;
  abgelehnt: (Schritt & { aktionstyp: string; grund: string; aktion?: string })[];
  /** Aktion → seq des Ereignisses, das sie erledigt hat */
  aktionen: Record<string, number>;
}

export function anfangsZustand(inh: Inhalte): Spielzustand {
  return {
    lauf: null,
    szenario: null,
    version: null,
    seq: 0,
    uhr: { ...UHR_START, tempo: inh.szenario.spieluhr.tempo || 1 },
    ende: false,
    fastTrack: inh.regeln.fast_track.standard ?? false,
    meldungen: {},
    reihenfolge: [],
    injects: {},
    injectReihenfolge: [],
    lagehinweise: [],
    notizen: [],
    bestand: Object.fromEntries(Object.values(inh.wirkmittel).map((w) => [w.id, w.bestand])),
    zerstoert: {},
    abgelehnt: [],
    aktionen: {},
  };
}

export class ProtokollLuecke extends Error {
  constructor(readonly erwartet: number, readonly erhalten: number) {
    super(`Protokoll-Lücke: erwartet seq ${erwartet}, erhalten ${erhalten}`);
  }
}

function schritt(e: Ereignis): Schritt {
  return { seq: e.seq, t_s: e.t_s, ts: e.ts, von: e.von };
}

/** Wendet ein Ereignis an. Wirft ProtokollLuecke, wenn seq nicht direkt auf z.seq folgt. */
export function anwenden(z: Spielzustand, e: Ereignis, inh: Inhalte): Spielzustand {
  if (e.seq !== z.seq + 1) throw new ProtokollLuecke(z.seq + 1, e.seq);
  let n: Spielzustand = { ...z, seq: e.seq };
  if (e.aktion) n.aktionen = { ...z.aktionen, [e.aktion]: e.seq };
  const s = schritt(e);

  const meldungAendern = (id: string, f: (m: MeldungsStand) => Partial<MeldungsStand>) => {
    const m = n.meldungen[id];
    if (!m) return; // unbekannt: der Host lässt das nicht zu, ein fremdes Protokoll schon
    n = { ...n, meldungen: { ...n.meldungen, [id]: { ...m, ...f(m), verlauf: [...m.verlauf, e.seq] } } };
  };

  switch (e.typ) {
    case "spiel_neu": {
      const frisch = anfangsZustand(inh);
      n = { ...frisch, seq: e.seq, aktionen: n.aktionen, lauf: e.daten.lauf, szenario: e.daten.szenario, version: e.daten.version };
      break;
    }
    case "uhr":
      n.uhr = { laeuft: e.daten.laeuft, t_s: e.daten.t_s, ts: e.ts, tempo: e.daten.tempo };
      break;
    case "meldung": {
      const d = e.daten;
      if (n.meldungen[d.meldung]) break;
      const m: MeldungsStand = {
        id: d.meldung,
        erschienen: s,
        fastTrack: !!d.fast_track,
        manuell: !!d.manuell,
        stufe: d.entfaellt ? "entfallen" : d.fast_track ? "g2" : "g1",
        beobachten: false,
        verlauf: [e.seq],
      };
      n.meldungen = { ...n.meldungen, [d.meldung]: m };
      n.reihenfolge = [...n.reihenfolge, d.meldung];
      break;
    }
    case "g1_entscheid": {
      const d = e.daten;
      meldungAendern(d.meldung, () => ({
        g1: { ...s, entscheid: d.entscheid, vermerk: d.vermerk },
        stufe: d.entscheid === "annehmen" ? "g2" : "erledigt",
        ergebnis: d.entscheid === "annehmen" ? undefined : "abgelehnt_g1",
      }));
      break;
    }
    case "g2_empfehlung": {
      const d = e.daten;
      meldungAendern(d.meldung, () => ({
        g2: { ...s, empfehlung: d.empfehlung, wirkmittel: d.wirkmittel, begruendung: d.begruendung, warnungen: d.warnungen ?? [] },
        stufe: d.empfehlung === "bekaempfen" ? "g3" : d.empfehlung === "beobachten" ? "g2" : "erledigt",
        beobachten: d.empfehlung === "beobachten",
        ergebnis: d.empfehlung === "nicht_bekaempfen" ? "nicht_bekaempfen_g2" : undefined,
      }));
      break;
    }
    case "g3_entscheid": {
      const d = e.daten;
      meldungAendern(d.meldung, () => ({
        g3: { ...s, entscheid: d.entscheid, bemerkung: d.bemerkung, wirkmittel: d.wirkmittel, warnungen: d.warnungen ?? [] },
        stufe: d.entscheid === "freigabe" ? "wirkung" : d.entscheid === "zurueck" ? "g2" : "erledigt",
        beobachten: false,
        ergebnis: d.entscheid === "ablehnen" ? "abgelehnt_g3" : undefined,
      }));
      if (d.entscheid === "freigabe" && d.wirkmittel) {
        const alt = n.bestand[d.wirkmittel];
        if (typeof alt === "number") n.bestand = { ...n.bestand, [d.wirkmittel]: Math.max(0, alt - 1) };
      }
      break;
    }
    case "wirkung": {
      const d = e.daten;
      const getroffen = d.getroffen ?? [];
      meldungAendern(d.meldung, () => ({
        wirkung: { ...s, wirkmittel: d.wirkmittel, pos: d.pos, t_freigabe: d.t_freigabe, getroffen },
        stufe: "erledigt",
        ergebnis: "bekaempft",
      }));
      const zerstoert = { ...n.zerstoert };
      for (const g of getroffen) {
        if (g.was !== "personen" && zerstoert[g.ziel] === undefined) zerstoert[g.ziel] = e.t_s;
      }
      n.zerstoert = zerstoert;
      break;
    }
    case "inject": {
      const id = e.daten.inject;
      if (n.injects[id]) break;
      n.injects = { ...n.injects, [id]: { id, erschienen: s, manuell: !!e.daten.manuell } };
      n.injectReihenfolge = [...n.injectReihenfolge, id];
      break;
    }
    case "inject_quittiert": {
      const i = n.injects[e.daten.inject];
      if (i && !i.quittiert) n.injects = { ...n.injects, [i.id]: { ...i, quittiert: s } };
      break;
    }
    case "lagehinweis":
      n.lagehinweise = [...n.lagehinweise, { ...s, text: e.daten.text, an: e.daten.an }];
      break;
    case "notiz":
      n.notizen = [...n.notizen, { ...s, text: e.daten.text }];
      break;
    case "fast_track":
      n.fastTrack = e.daten.an;
      break;
    case "spielende":
      n.ende = true;
      break;
    case "aktion_abgelehnt":
      n.abgelehnt = [...n.abgelehnt, { ...s, aktionstyp: e.daten.aktionstyp, grund: e.daten.grund, aktion: e.aktion }];
      break;
    default:
      // Unbekannter Typ aus einer neueren Version: zählt für seq, ändert sonst nichts.
      break;
  }
  return n;
}

export function zustandAus(protokoll: Ereignis[], inh: Inhalte): Spielzustand {
  return protokoll.reduce((z, e) => anwenden(z, e, inh), anfangsZustand(inh));
}

/** Kurzer Fingerabdruck des Stands, um Fenster zu vergleichen (Test und Anzeige). */
export function fingerabdruck(z: Spielzustand): string {
  const teile = [
    z.lauf, z.seq, z.uhr.laeuft ? 1 : 0, z.uhr.tempo, z.fastTrack ? 1 : 0, z.ende ? 1 : 0,
    z.reihenfolge.map((id) => `${id}:${z.meldungen[id].stufe}`).join(","),
    z.injectReihenfolge.map((id) => `${id}${z.injects[id].quittiert ? "q" : ""}`).join(","),
    Object.entries(z.bestand).map(([k, v]) => `${k}${v ?? "∞"}`).join(","),
    z.lagehinweise.length, z.notizen.length, z.abgelehnt.length,
  ];
  let h = 2166136261;
  for (const c of teile.join("|")) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}

