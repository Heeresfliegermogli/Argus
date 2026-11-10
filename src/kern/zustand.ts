// Spielstand als reine Funktion des Protokolls: zustand = protokoll.reduce(anwenden, anfangsZustand).
// Läuft auf jedem Rechner gleich; deshalb zeigen alle Fenster denselben Stand, sobald sie dieselben
// Ereignisse haben. Keine Zufälle, keine Uhrzeit-Abfragen hier drin.
// Seit 2.6 (H2): eine Rolle je Team – eine Meldung ist offen im Eingang, bis das Team entscheidet (BEKÄMPFEN, ZURÜCKSTELLEN,
// ABLEHNEN); Ereignisse älterer Versionen (g1_entscheid … fast_track) zählen nur für seq.
import type { Inhalte } from "../inhalte/typen";
import type { Absender, EinschlagDaten, EinschlagFlach, Entscheid, Ereignis, TrefferDaten } from "./ereignisse";
import { UHR_START, type UhrStand } from "./uhr";

/**
 * Stand einer Meldung (seit 2.6 eine Rolle): offen im Eingang des Teams (auch zurückgestellt), Wirkung unterwegs (BEKÄMPFEN, Einschlag
 * steht aus), erledigt (abgelehnt oder bekämpft) oder entfallen (alle Fahrzeuge zerstört oder abgezogen, solange sie offen war).
 */
export type Stufe = "offen" | "wirkung" | "erledigt" | "entfallen";
export type Ergebnis = "abgelehnt" | "bekaempft";

/** Wann und von wem ein Schritt kam. */
export interface Schritt {
  seq: number;
  t_s: number;
  ts: number;
  von: Absender;
}

/** Ein Einschlag einer Freigabe (seit 2.4: bei einer Zug-Bekämpfung je Fahrzeug einer). */
export interface EinzelWirkung {
  nr: number;
  t_einschlag: number;
  pos: [number, number];
  ziel?: string;
  getroffen: TrefferDaten[];
  verstoesse: string[];
  seq: number;
}

export interface MeldungsStand {
  id: string;
  erschienen: Schritt;
  manuell: boolean;
  /** seit 2.4 (E4): Datenlink zur Meldezeit gestört (EloKa) – ARGUS meldete unsicherer (kern/eloka.ts, argusBei) */
  gestoert?: boolean;
  stufe: Stufe;
  ergebnis?: Ergebnis;
  /** ZURÜCKSTELLEN: bleibt offen im Eingang, hinten (seit 2.6; bis 2.5 BEOBACHTEN bei der Zielprüfung) */
  zurueckgestellt: boolean;
  /** letzte Entscheidung des Teams zu dieser Meldung (mit Sekunden ab Eingang und ab Öffnen) */
  entscheid?: Schritt & { entscheid: Entscheid; wirkmittel?: string; warnungen: string[]; t_offen?: number; sek_eingang?: number; sek_offen?: number };
  /** BEKÄMPFEN (= Freigabe): Wirkmittel, Warnungen am vorausberechneten Einschlagort und die Einschläge */
  freigabe?: Schritt & { wirkmittel: string; warnungen: string[]; einschlag?: EinschlagDaten; einschlaege?: EinschlagFlach[] };
  /** seit 2.4 (E3): die Einschläge, die schon da sind (je Fahrzeug eines Zuges einer); `wirkung` fasst sie zusammen, sobald alle da sind */
  wirkungen?: EinzelWirkung[];
  wirkung?: Schritt & {
    wirkmittel: string; pos: [number, number]; t_freigabe: number; getroffen: TrefferDaten[];
    /** Einschlagzeit (bei Abrechnung zum Spielende nach t_s) */
    t_einschlag: number; ziel?: string; verstoesse: string[];
  };
  /** entfallen, solange sie offen war (jedes Fahrzeug zerstört oder weg) */
  entfallen?: Schritt & { grund: string };
  /** seit 2.7 (I3.2): nach Zeit aufgelöst (z. B. als verbündet erkannt) – nicht mehr offen, keine Freigabe mehr */
  aufgeloest?: Schritt & { als: string; aufloesung: string };
  /** seq aller Ereignisse zu dieser Meldung (für Verlauf und Replay) */
  verlauf: number[];
}

export interface InjectStand {
  id: string;
  erschienen: Schritt;
  manuell: boolean;
  quittiert?: Schritt;
  /** seit 2.3: Text aus dem Protokoll (Druckmeldung K-… oder gefüllte Platzhalter) */
  text?: string;
  /** seit 2.3: Druckmeldung – Zug und Stufe der Dringlichkeit (0–3) */
  zug?: string;
  stufe?: number;
}

export interface Spielzustand {
  lauf: string | null;
  szenario: string | null;
  version: string | null;
  /** zuletzt angewandtes Ereignis */
  seq: number;
  uhr: UhrStand;
  ende: boolean;
  meldungen: Record<string, MeldungsStand>;
  reihenfolge: string[];
  injects: Record<string, InjectStand>;
  injectReihenfolge: string[];
  /** Beobachtungen der Spielleitung, optional zu einem Fall (Auswertung, Schritt 8) */
  notizen: (Schritt & { text: string; fall?: string })[];
  /** Restbestand je Wirkmittel, null = unbegrenzt */
  bestand: Record<string, number | null>;
  /** Fahrzeuge, die ausgefallen sind (Wirkung, Hintergrundgefecht, Skriptereignis): Ziel → Spielzeit */
  zerstoert: Record<string, number>;
  /** wodurch: Meldung (M07), Hintergrundgefecht (H-02) oder Skriptereignis (E-01) */
  zerstoertDurch: Record<string, string>;
  /** eingespielte Verstärkungen in Protokollreihenfolge */
  verstaerkungen: { gruppe: string; t0: number; seq: number }[];
  /** Hintergrundgefecht: abgearbeitete Ereignisse */
  hintergrund: Record<string, Schritt & { wirkt?: boolean; grund?: string }>;
  /** Durchbruch-Gruppen (seit 2.1): entschieden nach ihrem Angriffszeitpunkt, durch = nicht aufgehalten */
  durchbrueche: Record<string, Schritt & { t_ab: number; durch: boolean; grund?: string }>;
  /** Skriptereignisse: entfallen oder je Wirkung (nr) abgearbeitet; seit 2.7 mit dem Ziel des Schusses */
  ereignisse: Record<string, { entfaellt?: Schritt & { grund?: string }; wirkungen: Record<number, Schritt & { wirkt: boolean; grund?: string; ziel?: string }> }>;
  /** seit 2.7 (I3.2): Auflösungen nach Zeit (A-01) */
  aufloesungen: Record<string, Schritt & { meldung: string; als: string }>;
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
    meldungen: {},
    reihenfolge: [],
    injects: {},
    injectReihenfolge: [],
    notizen: [],
    bestand: Object.fromEntries(Object.values(inh.wirkmittel).map((w) => [w.id, w.bestand])),
    zerstoert: {},
    zerstoertDurch: {},
    verstaerkungen: [],
    hintergrund: {},
    durchbrueche: {},
    ereignisse: {},
    aufloesungen: {},
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
  const zerstoeren = (ziel: string, durch: string, t = e.t_s) => {
    if (n.zerstoert[ziel] !== undefined) return;
    n.zerstoert = { ...n.zerstoert, [ziel]: t };
    n.zerstoertDurch = { ...n.zerstoertDurch, [ziel]: durch };
  };

  switch (e.typ) {
    case "spiel_neu": {
      const frisch = anfangsZustand(inh);
      n = { ...frisch, seq: e.seq, aktionen: n.aktionen, lauf: e.daten.lauf, szenario: e.daten.szenario, version: e.daten.version };
      break;
    }
    case "uhr":
      n.uhr = { laeuft: e.daten.laeuft, t_s: e.daten.t_s, ts: e.daten.ab_ts ?? e.ts, tempo: e.daten.tempo };
      break;
    case "meldung": {
      const d = e.daten;
      if (n.meldungen[d.meldung]) break;
      const m: MeldungsStand = {
        id: d.meldung,
        erschienen: s,
        manuell: !!d.manuell,
        ...(d.gestoert ? { gestoert: true } : {}),
        stufe: d.entfaellt ? "entfallen" : "offen",
        zurueckgestellt: false,
        verlauf: [e.seq],
      };
      n.meldungen = { ...n.meldungen, [d.meldung]: m };
      n.reihenfolge = [...n.reihenfolge, d.meldung];
      break;
    }
    case "entscheid": {
      const d = e.daten;
      meldungAendern(d.meldung, () => ({
        entscheid: {
          ...s, entscheid: d.entscheid, wirkmittel: d.wirkmittel, warnungen: d.warnungen ?? [],
          ...(d.t_offen !== undefined ? { t_offen: d.t_offen } : {}), ...(d.sek_eingang !== undefined ? { sek_eingang: d.sek_eingang } : {}),
          ...(d.sek_offen !== undefined ? { sek_offen: d.sek_offen } : {}),
        },
        ...(d.entscheid === "bekaempfen" && d.wirkmittel ? {
          freigabe: {
            ...s, wirkmittel: d.wirkmittel, warnungen: d.warnungen ?? [], einschlag: d.einschlag, ...(d.einschlaege ? { einschlaege: d.einschlaege } : {}),
          },
        } : {}),
        wirkungen: undefined,
        stufe: d.entscheid === "bekaempfen" ? "wirkung" : d.entscheid === "zurueckstellen" ? "offen" : "erledigt",
        zurueckgestellt: d.entscheid === "zurueckstellen",
        ergebnis: d.entscheid === "ablehnen" ? "abgelehnt" : undefined,
      }));
      if (d.entscheid === "bekaempfen" && d.wirkmittel) {
        // seit 2.4 (E3): eine LM je bekämpftem Fahrzeug eines Zuges
        const alt = n.bestand[d.wirkmittel];
        if (typeof alt === "number") n.bestand = { ...n.bestand, [d.wirkmittel]: Math.max(0, alt - (d.einschlaege?.length ?? 1)) };
      }
      break;
    }
    case "wirkung": {
      const d = e.daten;
      const getroffen = d.getroffen ?? [];
      const nr = d.nr ?? 0;
      const st0 = n.meldungen[d.meldung];
      if (!st0 || st0.wirkung || st0.wirkungen?.some((w) => w.nr === nr)) break;
      const einzeln: EinzelWirkung = {
        nr, t_einschlag: d.t_einschlag ?? e.t_s, pos: d.pos, ziel: d.ziel, getroffen, verstoesse: d.verstoesse ?? [], seq: e.seq,
      };
      const alle = [...(st0.wirkungen ?? []), einzeln].sort((a, b) => a.nr - b.nr);
      const anzahl = d.anzahl ?? st0.freigabe?.einschlaege?.length ?? 1;
      // seit 2.4 (E3): die Wirkung der Meldung steht fest, sobald alle Einschläge da sind (ein Zug: je Fahrzeug einer)
      const fertig = alle.length >= anzahl;
      meldungAendern(d.meldung, () => ({
        wirkungen: alle,
        ...(fertig ? {
          wirkung: {
            ...s, wirkmittel: d.wirkmittel, pos: alle[0].pos, t_freigabe: d.t_freigabe, getroffen: vereint(alle.flatMap((w) => w.getroffen)),
            t_einschlag: alle[0].t_einschlag, ziel: alle[0].ziel, verstoesse: [...new Set(alle.flatMap((w) => w.verstoesse))],
          },
          stufe: "erledigt" as const,
          ergebnis: "bekaempft" as const,
        } : {}),
      }));
      for (const g of getroffen) if (g.was !== "personen") zerstoeren(g.ziel, d.meldung, d.t_einschlag ?? e.t_s);
      break;
    }
    case "meldung_entfaellt": {
      const d = e.daten;
      const m = n.meldungen[d.meldung];
      if (!m || m.stufe !== "offen") break;
      meldungAendern(d.meldung, () => ({ stufe: "entfallen", entfallen: { ...s, grund: d.grund } }));
      break;
    }
    case "verstaerkung": {
      if (n.verstaerkungen.some((v) => v.gruppe === e.daten.gruppe)) break;
      n.verstaerkungen = [...n.verstaerkungen, { gruppe: e.daten.gruppe, t0: e.daten.t_ab, seq: e.seq }];
      break;
    }
    case "hintergrund": {
      const d = e.daten;
      if (n.hintergrund[d.id]) break;
      n.hintergrund = { ...n.hintergrund, [d.id]: { ...s, wirkt: d.wirkt, grund: d.grund } };
      // Zeit nach Drehbuch (der Host kann ein Ereignis nach einem Ausfall später schreiben)
      const plan = inh.szenario.hintergrund?.ereignisse.find((h) => h.id === d.id)?.t_s;
      if (d.wirkt && d.folge === "zerstoert" && d.ziel) zerstoeren(d.ziel, d.id, plan ?? e.t_s);
      break;
    }
    case "durchbruch": {
      const d = e.daten;
      if (n.durchbrueche[d.gruppe]) break;
      n.durchbrueche = { ...n.durchbrueche, [d.gruppe]: { ...s, t_ab: d.t_ab, durch: !!d.durch, grund: d.grund } };
      break;
    }
    case "ereignis": {
      const d = e.daten;
      const alt = n.ereignisse[d.ereignis] ?? { wirkungen: {} };
      if (d.entfaellt) {
        if (!alt.entfaellt) n.ereignisse = { ...n.ereignisse, [d.ereignis]: { ...alt, entfaellt: { ...s, grund: d.grund } } };
        break;
      }
      if (d.nr === undefined || alt.wirkungen[d.nr]) break;
      n.ereignisse = { ...n.ereignisse, [d.ereignis]: { ...alt, wirkungen: { ...alt.wirkungen, [d.nr]: { ...s, wirkt: !!d.wirkt, grund: d.grund, ...(d.ziel ? { ziel: d.ziel } : {}) } } } };
      const plan = inh.szenario.ereignisse?.find((x) => x.id === d.ereignis)?.wirkungen[d.nr]?.t_s;
      if (d.wirkt && d.ziel) zerstoeren(d.ziel, d.ereignis, plan ?? e.t_s);
      break;
    }
    case "aufloesung": {
      // seit 2.7 (I3.2): nach Zeit erkannt – eine offene (auch zurückgestellte) Meldung ist danach erledigt, ohne Entscheidung des Teams
      const d = e.daten;
      if (n.aufloesungen?.[d.aufloesung]) break;
      n.aufloesungen = { ...(n.aufloesungen ?? {}), [d.aufloesung]: { ...s, meldung: d.meldung, als: d.als } };
      const m = n.meldungen[d.meldung];
      if (m && m.stufe === "offen") meldungAendern(d.meldung, () => ({ stufe: "erledigt", aufgeloest: { ...s, als: d.als, aufloesung: d.aufloesung } }));
      break;
    }
    case "inject": {
      const id = e.daten.inject;
      if (n.injects[id]) break;
      const d = e.daten;
      n.injects = {
        ...n.injects,
        [id]: { id, erschienen: s, manuell: !!d.manuell, ...(d.text ? { text: d.text } : {}), ...(d.zug ? { zug: d.zug } : {}), ...(d.stufe !== undefined ? { stufe: d.stufe } : {}) },
      };
      n.injectReihenfolge = [...n.injectReihenfolge, id];
      break;
    }
    case "inject_quittiert": {
      const i = n.injects[e.daten.inject];
      if (i && !i.quittiert) n.injects = { ...n.injects, [i.id]: { ...i, quittiert: s } };
      break;
    }
    case "notiz":
      n.notizen = [...n.notizen, { ...s, text: e.daten.text, ...(e.daten.fall ? { fall: e.daten.fall } : {}) }];
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

/** Treffer mehrerer Einschläge: ein Eintrag je Ziel und Art (wie regeln.trefferVereint). */
function vereint(liste: TrefferDaten[]): TrefferDaten[] {
  const out: TrefferDaten[] = [];
  const gesehen = new Set<string>();
  for (const g of liste) {
    const k = `${g.ziel}|${g.was === "personen" ? "p" : "f"}|${g.kategorie}`;
    if (!gesehen.has(k)) {
      gesehen.add(k);
      out.push(g);
    }
  }
  return out;
}

export function zustandAus(protokoll: Ereignis[], inh: Inhalte): Spielzustand {
  return protokoll.reduce((z, e) => anwenden(z, e, inh), anfangsZustand(inh));
}

/** Kurzer Fingerabdruck des Stands, um Fenster zu vergleichen (Test und Anzeige). */
export function fingerabdruck(z: Spielzustand): string {
  const teile = [
    z.lauf, z.seq, z.uhr.laeuft ? 1 : 0, z.uhr.tempo, z.ende ? 1 : 0,
    z.reihenfolge.map((id) => `${id}:${z.meldungen[id].stufe}`).join(","),
    z.injectReihenfolge.map((id) => `${id}${z.injects[id].quittiert ? "q" : ""}`).join(","),
    Object.entries(z.bestand).map(([k, v]) => `${k}${v ?? "∞"}`).join(","),
    z.notizen.length, z.abgelehnt.length,
    Object.keys(z.zerstoert).sort().join(","), z.verstaerkungen.map((v) => v.gruppe).join(","),
    Object.entries(z.durchbrueche ?? {}).map(([k, v]) => `${k}${v.durch ? "!" : ""}`).sort().join(","),
  ];
  let h = 2166136261;
  for (const c of teile.join("|")) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}

