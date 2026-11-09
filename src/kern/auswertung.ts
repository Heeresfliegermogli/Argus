// Auswertung (Schritt 8): Teamvergleich, Kennzahlen, Konfidenz und Replay aus den Protokollen der Teams.
//
// Reine Funktionen von Inhalten und Protokollen – dieselben Zahlen in jedem Fenster (Plenum, Spielleitung)
// und im Export. Die Auswertung bleibt bei der Ethik: Sie zeigt, was das Team je Meldung entschieden hat, wie lange es
// hingeschaut hat (seit 2.6: Sekunden ab Eingang und ab Öffnen, H2.4) und was beim Einschlag wirklich getroffen wurde – nie
// Namen von Personen, nur Teams.
//
// Begriffe
//  • Fall: Schlüsselfall (S1–S8, Reihenfolge der Auflösung aus den Daten) oder Nebenfall (N1–N4). Zu einem Fall
//    gehören seine Meldung und Folgemeldungen mit demselben `fall` (S4: M18 und M23, S5: M32 und M36, S8: M33 und M34).
//    Seit 2.4 (E5) sind S5–S8 `zuschaltbar`: Sie stehen im Teamvergleich, das Replay zeigt sie nur, wenn die
//    Spielleitung sie zuschaltet (replayPlan, Budget 12 min bleibt).
//  • Ausgang eines Falls je Team:
//      falsch          – eine Bekämpfung traf Verbündete, Geschütztes, Zivilpersonen, die Attrappe oder Wehrlose,
//                        oder schlug unter Verstoß gegen R2/R3 ein (Lage beim Einschlag)
//      richtig         – nichts davon; das Team hat abgelehnt, zurückgestellt oder (bei echtem Ziel) sauber bekämpft
//      verpasst        – echtes Ziel, das nach der Lösung bekämpft werden sollte, aber abgelehnt wurde (N3)
//      offen           – bei Spielende noch im Eingang
//      entfallen       – Fahrzeug zerstört oder abgezogen, bevor das Team entschied
//      nicht_erreicht  – die Meldung kam nicht (Spiel vorher beendet)
//  • Widerspruch gegen ARGUS: Das Team hat anders gehandelt, als ARGUS empfahl – BEKÄMPFEN, aber das Team hat abgelehnt oder
//    zurückgestellt und es kam zu keiner Wirkung; oder NICHT BEKÄMPFEN, aber das Team hat bekämpft. Zu Recht, wenn die Lösung im
//    Szenario das verlangt bzw. die Wirkung ohne Fehltreffer und ohne Regelverstoß blieb. PRÜFEN/UNKLAR ist keine Empfehlung, der
//    man widersprechen könnte.
import { mitVerlusten, panzer, type Stufe, verlustStand, verlustVerlauf } from "./verluste";
import type { Inhalte, Meldung, Nebenfall, Schluesselfall } from "../inhalte/typen";
import type { Entscheid, Ereignis } from "./ereignisse";
import { gtBei } from "./geometrie";
import { durchgebrochen } from "./durchbruch";
import { elokaAktiv } from "./eloka";
import { weltFuer } from "./lage";
import { FEHL } from "./lagebild";
import { ENTSCHEID_TEXT } from "./sichten";
import { uhrzeit } from "./uhr";
import { zielNr } from "./zielnummern";
import { type Spielzustand, anfangsZustand, anwenden } from "./zustand";

/** „Ziel 8“ für eine Meldung des Szenarios – in allen Teams dieselbe Nummer (B7). */
function zielText(inh: Inhalte, id: string): string {
  return `Ziel ${zielNr(inh, null, id)}`;
}

/** Ein Team mit seinem Lauf, wie die Auswertung es braucht (Plenum, Spielleitung, Demo, Test). */
export interface TeamLauf {
  id: string;
  name: string;
  farbe: string;
  zustand: Spielzustand;
  protokoll: Ereignis[];
}

export type FallAusgang = "richtig" | "falsch" | "verpasst" | "offen" | "entfallen" | "nicht_erreicht";

export const AUSGANG_TEXT: Record<FallAusgang, string> = {
  richtig: "richtig",
  falsch: "falsch",
  verpasst: "zu Unrecht abgelehnt",
  offen: "offen bei Spielende",
  entfallen: "entfallen",
  nicht_erreicht: "nicht erreicht",
};

export interface FallDef {
  id: string;
  art: "schluessel" | "neben";
  titel: string;
  /** Meldung des Falls */
  meldung: string;
  /** Folgemeldungen mit demselben Fall (S4: M23) */
  folge: string[];
  /** Schlüsselfall, der im Replay nur auf Wunsch der Spielleitung läuft (seit 2.4: S5–S8) */
  zuschaltbar?: boolean;
  /** Schlüsselfall: volle Daten (Leitfragen, Bezüge) */
  sf?: Schluesselfall;
  nf?: Nebenfall;
}

/** Fälle in der Reihenfolge der Auflösung: Schlüsselfälle nach `reihenfolge` (S3, S2, S1, S4, S5–S8), dann die Nebenfälle. */
export function faelle(inh: Inhalte): FallDef[] {
  const sz = (inh.basis ?? inh).szenario;
  const folge = (f: { id: string; meldung: string }) => sz.meldungen.filter((m) => m.fall === f.id && m.id !== f.meldung).map((m) => m.id);
  return [
    ...[...sz.schluesselfaelle].sort((a, b) => a.reihenfolge - b.reihenfolge)
      .map((f): FallDef => ({ id: f.id, art: "schluessel", titel: f.titel, meldung: f.meldung, folge: folge(f), ...(f.zuschaltbar ? { zuschaltbar: true } : {}), sf: f })),
    ...[...sz.nebenfaelle].sort((a, b) => a.id.localeCompare(b.id))
      .map((f): FallDef => ({ id: f.id, art: "neben", titel: f.titel, meldung: f.meldung, folge: folge(f), nf: f })),
  ];
}

/**
 * Regelwarnung (R2, R3, Einsatzbereich, No-Strike) – im Gegensatz zum Hinweis auf den Bestand („Bestand LM aufgebraucht“,
 * seit 2.4 auch „nur 3 von 4 Fahrzeugen – Bestand LM reicht nicht“). Nur Regelwarnungen zählen als „Freigabe trotz Warnung“.
 */
export function regelWarnung(w: string): boolean {
  return !/^(Bestand |nur \d+ von \d+ )/.test(w);
}

// ---------------------------------------------------------------- Replay-Plan (seit 2.4, E5)

/** Zeitbudget der Auflösung in s (12 min), wenn das Szenario keines nennt. */
export const REPLAY_BUDGET_S = 720;
/** Feste Kapitel vor den Fällen: Teamvergleich 45 s, Kennzahlen 45 s, Konfidenz 30 s. */
export const REPLAY_FEST = { teams: 45, kennzahlen: 45, konfidenz: 30 } as const;
/** „Preis des Abwartens“ nach den Fällen (seit 2.3, nur mit Verlustmodell). */
export const REPLAY_PREIS_S = 60;
/** Unter so vielen s je Fall wird es knapp (Hinweis an die Spielleitung, kein Verbot). */
export const REPLAY_KNAPP_S = 90;

export interface ReplayPlan {
  /** Schlüsselfälle in der gewählten Reihenfolge */
  faelle: FallDef[];
  /** Zeit je Fall in s (auf 5 s abgerundet) */
  jeFall: number;
  /** Preis des Abwartens dabei? (dann 60 s) */
  preis: number;
  /** Summe aller Kapitel in s, höchstens das Budget */
  summe: number;
  budget: number;
  /** Fälle, die zugeschaltet werden können und noch nicht gewählt sind */
  zuschaltbar: FallDef[];
  /** Zeit je Fall unter REPLAY_KNAPP_S */
  knapp: boolean;
}

/** Standard-Reihenfolge des Replays: aus szenario.auswertung.replay.standard, sonst alle nicht zuschaltbaren Schlüsselfälle. */
export function replayStandard(inh: Inhalte): string[] {
  const sz = (inh.basis ?? inh).szenario;
  return sz.auswertung.replay?.standard ?? faelle(inh).filter((f) => f.art === "schluessel" && !f.zuschaltbar).map((f) => f.id);
}

/**
 * Welche Schlüsselfälle das Replay zeigt, in welcher Reihenfolge und wie lange: Die Spielleitung wählt Fälle und
 * Reihenfolge (Standard S3, S2, S1, S4; S5–S8 zuschaltbar), das Budget von 12 min bleibt – die festen Kapitel
 * (2 min, mit Verlustmodell 1 min Preis des Abwartens) gehen ab, der Rest teilt sich gleich auf die gewählten Fälle.
 * Unbekannte, doppelte und Nebenfälle in `auswahl` fallen weg; ohne Auswahl gilt der Standard.
 */
export function replayPlan(inh: Inhalte, auswahl?: string[] | null, mitPreis = false): ReplayPlan {
  const sz = (inh.basis ?? inh).szenario;
  const alle = faelle(inh).filter((f) => f.art === "schluessel");
  const nachId = new Map(alle.map((f) => [f.id, f]));
  const ids = [...new Set(auswahl ?? replayStandard(inh))].filter((id) => nachId.has(id));
  const gewaehlt = ids.map((id) => nachId.get(id)!);
  const budget = sz.auswertung.replay?.budget_s ?? REPLAY_BUDGET_S;
  const fest = REPLAY_FEST.teams + REPLAY_FEST.kennzahlen + REPLAY_FEST.konfidenz;
  const preis = mitPreis ? REPLAY_PREIS_S : 0;
  const jeFall = gewaehlt.length ? Math.floor((budget - fest - preis) / gewaehlt.length / 5) * 5 : 0;
  return {
    faelle: gewaehlt,
    jeFall,
    preis,
    summe: fest + preis + jeFall * gewaehlt.length,
    budget,
    zuschaltbar: alle.filter((f) => !ids.includes(f.id)),
    knapp: gewaehlt.length > 0 && jeFall < REPLAY_KNAPP_S,
  };
}

// ---------------------------------------------------------------- Verlauf je Meldung aus dem Protokoll

/** Eine Entscheidung des Teams (seit 2.6 eine je Meldung; nach ZURÜCKSTELLEN kann eine zweite folgen). */
export interface Entscheidung {
  t: number;
  was: Entscheid;
  wirkmittel?: string;
  /** Regelwarnungen beim BEKÄMPFEN (am vorausberechneten Einschlagort) */
  warnungen?: string[];
  /** Sekunden ab Eingang (Erscheinen) und ab Öffnen bis zu dieser Entscheidung (H2.4) */
  sekEingang?: number;
  sekOffen?: number;
}

export type FehlArt = "verbuendet" | "geschuetzt" | "zivil" | "attrappe" | "ausser_gefecht";

export const FEHL_TEXT: Record<FehlArt, string> = {
  verbuendet: "Verbündete",
  geschuetzt: "Sanität",
  zivil: "Zivilpersonen",
  attrappe: "Attrappe",
  ausser_gefecht: "Wehrlose", // Besatzung, die sich ergibt (N2), Verwundete am Wrack (S6)
};

export interface WirkungInfo {
  t_freigabe: number;
  t: number;
  wirkmittel: string;
  /** bekämpftes Fahrzeug */
  ziel?: string;
  /** Treffer als Text, z. B. „Z-15 verbündet“, „Z-19: 4 Zivilpersonen“ */
  treffer: string[];
  /** Arten der Fehlbekämpfung (leer: kein Fehltreffer) */
  fehl: FehlArt[];
  /** Regelverstöße beim Einschlag (R2, R3, EB) */
  verstoesse: string[];
}

export interface MeldungsVerlauf {
  id: string;
  t: number;
  entscheidungen: Entscheidung[];
  wirkung?: WirkungInfo;
  /** entfallen (vor einer Entscheidung oder während sie zurückgestellt war); beimErscheinen: schon beim Erscheinen */
  entfallen?: { t: number; grund: string; beimErscheinen?: boolean };
  /** Stand bei Spielende */
  stufe: string;
  /** zurückgestellt und bei Spielende noch offen */
  zurueckgestellt: boolean;
}

function fehlArt(kategorie: string): FehlArt | null {
  if (!FEHL.has(kategorie)) return null;
  if (kategorie === "besatzung_ergibt_sich") return "ausser_gefecht";
  return kategorie as FehlArt;
}

const PERSONEN: Record<string, string> = { zivil: "Zivilpersonen", soldat: "Soldaten", besatzung_ergibt_sich: "Besatzung (ergibt sich)" };
const KATEGORIE: Record<string, string> = {
  feind: "Feind", verbuendet: "verbündet", zivil: "zivil", geschuetzt: "Sanität", attrappe: "Attrappe", ausser_gefecht: "außer Gefecht",
};

/** Verlauf aller Meldungen eines Teams (Entscheidungen in Protokollreihenfolge, Einschlag, Entfallen). */
export function meldungsVerlaeufe(team: TeamLauf): Map<string, MeldungsVerlauf> {
  const z = team.zustand;
  const out = new Map<string, MeldungsVerlauf>();
  for (const id of z.reihenfolge) {
    const st = z.meldungen[id];
    out.set(id, {
      id, t: st.erschienen.t_s, entscheidungen: [], stufe: st.stufe,
      zurueckgestellt: st.stufe === "offen" && st.zurueckgestellt,
      ...(st.stufe === "entfallen" && !st.entfallen ? { entfallen: { t: st.erschienen.t_s, grund: "schon beim Erscheinen", beimErscheinen: true } } : {}),
    });
  }
  for (const e of team.protokoll) {
    if (e.typ === "entscheid") {
      const mv = out.get(e.daten.meldung);
      if (!mv) continue;
      mv.entscheidungen.push({
        t: e.t_s, was: e.daten.entscheid, wirkmittel: e.daten.wirkmittel, warnungen: e.daten.warnungen ?? [],
        sekEingang: e.daten.sek_eingang, sekOffen: e.daten.sek_offen,
      });
    } else if (e.typ === "meldung_entfaellt") {
      const mv = out.get(e.daten.meldung);
      if (mv && !mv.entfallen) mv.entfallen = { t: e.t_s, grund: e.daten.grund };
    }
  }
  for (const id of z.reihenfolge) {
    const w = z.meldungen[id].wirkung;
    const mv = out.get(id)!;
    if (!w) continue;
    const fehl = new Set<FehlArt>();
    const treffer: string[] = [];
    for (const g of w.getroffen) {
      const f = fehlArt(g.kategorie);
      if (f) fehl.add(f);
      treffer.push(g.was === "personen" ? `${g.ziel}: ${g.anzahl ?? ""} ${PERSONEN[g.kategorie] ?? g.kategorie}`.replace("  ", " ") : `${g.ziel} ${KATEGORIE[g.kategorie] ?? g.kategorie}`);
    }
    mv.wirkung = {
      t_freigabe: w.t_freigabe, t: w.t_einschlag, wirkmittel: w.wirkmittel, ziel: w.ziel, treffer,
      fehl: [...fehl], verstoesse: w.verstoesse.filter((v) => /^(R2|R3|EB)\b/.test(v)),
    };
  }
  return out;
}

/** Letzte Entscheidung (und ob es davor eine andere gab, z. B. erst zurückgestellt). */
function letzte(mv: MeldungsVerlauf): { e: Entscheidung; vorher?: Entscheidung } | null {
  const l = mv.entscheidungen;
  if (!l.length) return null;
  return { e: l[l.length - 1], vorher: l.length > 1 ? l[0] : undefined };
}

/** Wurde die Meldung bekämpft, und war das fehlerhaft (Fehltreffer oder Regelverstoß beim Einschlag)? */
export function wirkungFehlerhaft(w: WirkungInfo | undefined): boolean {
  return !!w && (w.fehl.length > 0 || w.verstoesse.some((v) => v.startsWith("R2") || v.startsWith("R3")));
}

/** Soll die Meldung nach der Lösung im Szenario bekämpft werden? (seit 2.6 eine Entscheidung je Meldung) */
export function sollBekaempfen(m: Meldung): boolean {
  return (m.loesung?.entscheid ?? "BEKÄMPFEN") === "BEKÄMPFEN";
}

/** Hat ARGUS falsch empfohlen? (BEKÄMPFEN, aber das Ziel war zur Meldezeit nicht legitim – wie pruefe_szenario.py.) */
export function argusFalsch(inh: Inhalte, m: Meldung): boolean {
  if (m.argus.empfehlung !== "BEKÄMPFEN") return false;
  return !m.ziele.every((id) => !inh.ziele[id] || gtBei(inh.ziele[id], m.t_s).legitim);
}

// ---------------------------------------------------------------- Entscheidung und Fall

export type GliedArt = "weiter" | "halt" | "warten" | "leer" | "offen";

/** Die Entscheidung des Teams zu einer Meldung, wie Teamvergleich und Replay sie zeigen. */
export interface KettenGlied {
  /** kurz: ✓ (bekämpft) ✕ (abgelehnt) ◷ (zurückgestellt) … – */
  zeichen: string;
  art: GliedArt;
  /** ausführlich (Tooltip, Replay) */
  titel: string;
  t?: number;
  was?: Entscheid;
  wirkmittel?: string;
  /** Sekunden ab Eingang bis zu dieser Entscheidung */
  sek?: number;
  /** Sekunden ab Öffnen */
  sekOffen?: number;
  /** davor anders entschieden (erst zurückgestellt) */
  vorher?: string;
}

export interface Kette {
  meldung: string;
  glied: KettenGlied;
  /** Einschlag: ✸, Fehltreffer rot */
  einschlag?: { t: number; fehl: boolean; text: string; regel: boolean };
}

const WAS_TEXT: Record<Entscheid, string> = { bekaempfen: "BEKÄMPFEN", zurueckstellen: "ZURÜCKSTELLEN", ablehnen: "ABLEHNEN" };
const WAS_ZEICHEN: Record<Entscheid, string> = { bekaempfen: "✓", zurueckstellen: "◷", ablehnen: "✕" };
const WAS_ART: Record<Entscheid, GliedArt> = { bekaempfen: "weiter", zurueckstellen: "warten", ablehnen: "halt" };

/** Sekunden lesbar: „14 s“. */
export function sekText(s: number | undefined | null): string {
  return s === undefined || s === null ? "" : `${Math.round(s)} s`;
}

/** Die Entscheidung des Teams zu einer Meldung und der Einschlag. */
export function kette(inh: Inhalte, mv: MeldungsVerlauf | undefined, meldung: string): Kette {
  const start = (inh.basis ?? inh).szenario.spieluhr.start;
  const uz = (t?: number) => (t === undefined ? "" : ` ${uhrzeit(start, t)}`);
  if (!mv) return { meldung, glied: { zeichen: "–", art: "leer", titel: "Meldung kam nicht" } };
  const l = letzte(mv);
  let glied: KettenGlied;
  if (l) {
    const e = l.e;
    const vorher = l.vorher && l.vorher.was !== e.was ? `erst ${WAS_TEXT[l.vorher.was]}${uz(l.vorher.t)}` : undefined;
    const wm = e.wirkmittel ? ` mit ${inh.wirkmittel[e.wirkmittel]?.kurz ?? e.wirkmittel}` : "";
    const sek = e.sekEingang !== undefined ? ` nach ${sekText(e.sekEingang)}${e.sekOffen !== undefined ? ` (${sekText(e.sekOffen)} angesehen)` : ""}` : "";
    glied = {
      zeichen: WAS_ZEICHEN[e.was], art: WAS_ART[e.was], t: e.t, was: e.was, wirkmittel: e.wirkmittel, sek: e.sekEingang, sekOffen: e.sekOffen, vorher,
      titel: `${WAS_TEXT[e.was]}${wm}${uz(e.t)}${sek}${vorher ? ` (${vorher})` : ""}${e.warnungen?.some(regelWarnung) ? ` trotz Warnung: ${e.warnungen.find(regelWarnung)}` : ""}`,
    };
  } else {
    glied = mv.stufe === "offen"
      ? { zeichen: "…", art: "offen", titel: "bei Spielende noch im Eingang" }
      : { zeichen: "–", art: "leer", titel: mv.entfallen ? `entfallen – ${mv.entfallen.grund}` : "–" };
  }
  const w = mv.wirkung;
  const einschlag = w ? {
    t: w.t, fehl: w.fehl.length > 0, regel: w.verstoesse.length > 0,
    text: `Einschlag${uz(w.t)} (${inh.wirkmittel[w.wirkmittel]?.kurz ?? w.wirkmittel}): ${w.treffer.length ? w.treffer.join(", ") : "nichts getroffen"}${w.verstoesse.length ? ` · ${w.verstoesse.map((v) => v.split(" – ")[0]).join(", ")}` : ""}`,
  } : undefined;
  return { meldung, glied, einschlag };
}

export interface FallErgebnis {
  fall: string;
  ausgang: FallAusgang;
  /** eine Zeile (Tooltip, Replay) */
  text: string;
  /** zwei kurze Zeilen für die Zelle im Teamvergleich: was entschieden wurde, und was folgte */
  zeilen: string[];
  t?: number;
  /** Sekunden ab Eingang bis zur Entscheidung der Fall-Meldung (H2.4) */
  sek?: number;
  /** Entscheidung zur Meldung des Falls (Folgemeldungen in `folge`) */
  kette: Kette;
  folge: Kette[];
}

const HALT: Partial<Record<Entscheid, string>> = { ablehnen: "ABLEHNEN", zurueckstellen: "ZURÜCKSTELLEN" };

/** Ausgang eines Falls für ein Team. */
export function fallErgebnis(inh: Inhalte, verlaeufe: Map<string, MeldungsVerlauf>, f: FallDef, zSpielende: boolean): FallErgebnis {
  const start = (inh.basis ?? inh).szenario.spieluhr.start;
  const uz = (t: number) => uhrzeit(start, t);
  const haupt = verlaeufe.get(f.meldung);
  const ids = [f.meldung, ...f.folge];
  const k = kette(inh, haupt, f.meldung);
  const folge = f.folge.map((id) => kette(inh, verlaeufe.get(id), id));
  const basis = { fall: f.id, kette: k, folge, sek: k.glied.sek };
  const wmKurz = (w: WirkungInfo) => inh.wirkmittel[w.wirkmittel]?.kurz ?? w.wirkmittel;
  const erg = (ausgang: FallAusgang, zeilen: (string | undefined)[], t?: number): FallErgebnis => {
    const z = zeilen.filter((x): x is string => !!x);
    return { ...basis, ausgang, zeilen: z, text: z.join(" · "), t };
  };
  const nach = (g: KettenGlied) => (g.sek !== undefined ? ` · ${sekText(g.sek)}` : "");

  // falsch: eine Bekämpfung im Fall traf, was nicht bekämpft werden durfte, oder verstieß beim Einschlag gegen R2/R3
  for (const id of ids) {
    const mv = verlaeufe.get(id);
    if (!mv?.wirkung || !wirkungFehlerhaft(mv.wirkung)) continue;
    const w = mv.wirkung;
    const kt = id === f.meldung ? k : folge[f.folge.indexOf(id)];
    const was = w.fehl.length ? `→ ${w.fehl.map((x) => FEHL_TEXT[x]).join(", ")} getroffen` : `→ Verstoß ${w.verstoesse.map((v) => v.split(":")[0]).join(", ")}`;
    return erg("falsch", [`${id !== f.meldung ? `${zielText(inh, id)} ` : ""}BEKÄMPFEN ${uz(w.t_freigabe)} (${wmKurz(w)})${nach(kt.glied)}`, was], w.t_freigabe);
  }
  if (!haupt) return erg("nicht_erreicht", [zSpielende ? `${zielText(inh, f.meldung)} kam vor Spielende nicht` : `${zielText(inh, f.meldung)} kommt noch`]);
  const m = inh.meldungen[f.meldung];
  const soll = m ? sollBekaempfen(m) : true;
  const stopp = stoppVon(haupt);
  const stoppText = (e: Entscheidung) => `${HALT[e.was] ?? WAS_TEXT[e.was]} ${uz(e.t)}${e.sekEingang !== undefined ? ` · ${sekText(e.sekEingang)}` : ""}`;
  const folgeText = () => {
    const teile: string[] = [];
    for (const id of f.folge) {
      const mv = verlaeufe.get(id);
      if (!mv) continue;
      const zt = zielText(inh, id);
      if (mv.wirkung) teile.push(`${zt} BEKÄMPFEN ${uz(mv.wirkung.t_freigabe)}`);
      else if (mv.entfallen) teile.push(`${zt} entfallen`);
      else if (mv.stufe === "offen") teile.push(`${zt} ${mv.zurueckgestellt ? "zurückgestellt" : "offen"}`);
      else {
        const s = stoppVon(mv);
        teile.push(s ? `${zt}: ${HALT[s.was] ?? WAS_TEXT[s.was]}` : `${zt} erledigt`);
      }
    }
    return teile.length ? teile.join(", ") : undefined;
  };

  if (haupt.wirkung) {
    // bekämpft ohne Fehltreffer und ohne Verstoß: echtes Ziel, sauber getroffen
    return erg("richtig", [`BEKÄMPFEN ${uz(haupt.wirkung.t_freigabe)} (${wmKurz(haupt.wirkung)})${nach(k.glied)}`, folgeText() ?? "ohne Fehltreffer"], haupt.wirkung.t_freigabe);
  }
  if (haupt.stufe === "erledigt" && stopp) {
    return soll ? erg("verpasst", [stoppText(stopp), "Ziel war echt"], stopp.t) : erg("richtig", [stoppText(stopp), folgeText()], stopp.t);
  }
  if (haupt.zurueckgestellt && stopp) {
    return erg("richtig", [stoppText(stopp), folgeText() ?? "bis Spielende zurückgestellt"], stopp.t);
  }
  if (haupt.entfallen) {
    return erg(stopp && !soll ? "richtig" : "entfallen", [stopp ? stoppText(stopp) : undefined, `entfallen – ${haupt.entfallen.grund}`, folgeText()], stopp?.t);
  }
  if (haupt.stufe === "wirkung") return erg("offen", ["bekämpft", "Einschlag nach Spielende"]);
  return erg("offen", [`${zSpielende ? "bei Spielende" : "jetzt"} im Eingang`, folgeText()]);
}

/** Letzte Entscheidung, die nicht bekämpft hat (ABLEHNEN oder ZURÜCKSTELLEN). */
function stoppVon(mv: MeldungsVerlauf): Entscheidung | undefined {
  return [...mv.entscheidungen].reverse().find((e) => e.was !== "bekaempfen");
}

// ---------------------------------------------------------------- Kennzahlen

/** Ab dieser Konfidenz trennt die Kennzahl „Wie lange habt ihr hingeschaut?“ (wie die frühere Fast-Track-Schwelle). */
export const KONFIDENZ_HOCH = 90;

export interface TempoZeiten {
  /** Median der Sekunden ab Eingang bzw. ab Öffnen bis zur Entscheidung */
  eingang: number | null;
  offen: number | null;
  n: number;
}

export interface Widerspruch {
  meldung: string;
  t: number;
  argus: string;
  recht: boolean;
}

export interface Kennzahlen {
  meldungen: { erschienen: number; bearbeitet: number; gesamt: number; offenEnde: number };
  feind: { bekaempft: number; gemeldet: number };
  fehl: { wirkungen: number; arten: { art: FehlArt; anzahl: number }[]; liste: { meldung: string; t: number; arten: FehlArt[]; konfidenz: number }[] };
  /** Bekämpfungen, obwohl das System eine Regelwarnung zum Einschlag zeigte */
  trotzWarnung: number;
  /** Bekämpfungen (je Meldung) und davon solche, bei denen ARGUS BEKÄMPFEN empfahl */
  freigaben: { gesamt: number; wieArgus: number };
  widerspruch: { gesamt: number; zuRecht: number; zuUnrecht: number; liste: Widerspruch[] };
  /** Wie lange habt ihr hingeschaut? (H2.4) – alle, Konfidenz ≥ KONFIDENZ_HOCH, darunter; dazu die schnellste und die längste Entscheidung */
  zeiten: { alle: TempoZeiten; hoch: TempoZeiten; niedrig: TempoZeiten; schwelle: number; kuerzeste: number | null; laengste: number | null; unter20: number };
  /** Lagemeldungen zu einem Fall (I-04, I-07): erschienen, angeklickt */
  lagemeldungen: { id: string; fall: string; erschienen?: number; gelesen?: number }[];
  /** Seit 2.1: Feindfahrzeuge, die nicht aufgehalten wurden und über den Bach durchbrachen (Kennzahl, keine Wertung) */
  durchbruch: { fahrzeuge: string[]; gruppen: string[]; erstesUeber: number | null };
  /**
   * Seit 2.3 (D5), seit 2.5 je Panzer (F2.9): Verluste der eigenen Truppe – Lage, keine Wertung. Zustand der vier Panzer bei Spielende
   * (bzw. jetzt), einsatzbereite (nicht ausgefallene), eingeschränkte und ausgefallene, Verwundete, Mittel des Zustands, Verlauf über
   * die Spielzeit (alle 15 s), Zahl der Druckmeldungen. Fehlt ohne Verlustmodell.
   */
  verluste?: {
    bereit: number; gesamt: number; eingeschraenkt: number; ausgefallen: number; verwundete: number;
    /** Mittel des Zustands der Panzer in % (abgerundet) */
    zustand: number;
    panzer: { id: string; name: string; zustand: number; stufe: Stufe; treffer: number; verwundete: number }[];
    verlauf: [number, number[], number, number][]; druckmeldungen: number;
  };
}

function median(werte: number[]): number | null {
  if (!werte.length) return null;
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function tempoZeiten(liste: Entscheidung[]): TempoZeiten {
  return {
    eingang: median(liste.map((e) => e.sekEingang).filter((x): x is number => x !== undefined)),
    offen: median(liste.map((e) => e.sekOffen).filter((x): x is number => x !== undefined)),
    n: liste.length,
  };
}

/** Injects, die zu einem Fall gehören und fest kommen (I-04 zu S3, I-07 zu S4), in der Reihenfolge der Fälle. */
export function fallInjects(inh: Inhalte): { id: string; fall: string; t: number }[] {
  const sz = (inh.basis ?? inh).szenario;
  const rang = new Map(faelle(inh).map((f, i) => [f.id, i]));
  return sz.injects.filter((i) => i.fall && i.t_s !== undefined && !i.bedingung)
    .map((i) => ({ id: i.id, fall: i.fall!, t: i.t_s! }))
    .sort((a, b) => (rang.get(a.fall) ?? 99) - (rang.get(b.fall) ?? 99) || a.t - b.t);
}

export function kennzahlen(basis: Inhalte, team: TeamLauf, verlaeufe = meldungsVerlaeufe(team)): Kennzahlen {
  const z = team.zustand;
  const inh = weltFuer(basis, z);
  const liste = [...verlaeufe.values()];
  // Fehlbekämpfungen
  const arten = new Map<FehlArt, number>();
  const fehlListe: Kennzahlen["fehl"]["liste"] = [];
  for (const mv of liste) {
    if (!mv.wirkung?.fehl.length) continue;
    for (const a of mv.wirkung.fehl) arten.set(a, (arten.get(a) ?? 0) + 1);
    fehlListe.push({ meldung: mv.id, t: mv.wirkung.t_freigabe, arten: mv.wirkung.fehl, konfidenz: inh.meldungen[mv.id]?.argus.konfidenz ?? 0 });
  }
  // Feindziele
  const gemeldet = new Set<string>();
  const bekaempft = new Set<string>();
  for (const id of z.reihenfolge) {
    const m = inh.meldungen[id];
    if (!m) continue;
    for (const zid of m.ziele) if (inh.ziele[zid] && gtBei(inh.ziele[zid], m.t_s).kategorie === "feind") gemeldet.add(zid);
    for (const g of z.meldungen[id].wirkung?.getroffen ?? []) if (g.was === "fahrzeug" && g.kategorie === "feind") bekaempft.add(g.ziel);
  }
  // Widerspruch gegen ARGUS
  const widerspruch: Widerspruch[] = [];
  for (const mv of liste) {
    const m = inh.meldungen[mv.id];
    if (!m) continue;
    const emp = m.argus.empfehlung;
    if (emp === "BEKÄMPFEN" && !mv.wirkung && mv.stufe !== "wirkung") {
      const s = stoppVon(mv);
      if (!s || !(mv.stufe === "erledigt" || mv.zurueckgestellt || mv.entfallen)) continue;
      widerspruch.push({ meldung: mv.id, t: s.t, argus: emp, recht: !sollBekaempfen(m) });
    } else if (emp === "NICHT BEKÄMPFEN" && (mv.wirkung || mv.stufe === "wirkung")) {
      const l = letzte(mv);
      widerspruch.push({ meldung: mv.id, t: l?.e.t ?? mv.t, argus: emp, recht: !!mv.wirkung && !wirkungFehlerhaft(mv.wirkung) });
    }
  }
  // Wie lange habt ihr hingeschaut? (je Entscheidung)
  const alle: Entscheidung[] = [];
  const hoch: Entscheidung[] = [];
  const niedrig: Entscheidung[] = [];
  for (const mv of liste) {
    const k = inh.meldungen[mv.id]?.argus.konfidenz ?? 0;
    for (const e of mv.entscheidungen) {
      alle.push(e);
      (k >= KONFIDENZ_HOCH ? hoch : niedrig).push(e);
    }
  }
  const sekAlle = alle.map((e) => e.sekEingang).filter((x): x is number => x !== undefined);
  const lm = fallInjects(inh).map((i) => ({ id: i.id, fall: i.fall, erschienen: z.injects[i.id]?.erschienen.t_s, gelesen: z.injects[i.id]?.quittiert?.t_s }));
  const bekaempfung = (mv: MeldungsVerlauf) => mv.entscheidungen.some((e) => e.was === "bekaempfen");
  return {
    meldungen: {
      erschienen: z.reihenfolge.filter((id) => !(z.meldungen[id].stufe === "entfallen" && !z.meldungen[id].entfallen)).length,
      bearbeitet: liste.filter((mv) => mv.entscheidungen.length > 0 && (mv.stufe === "erledigt" || mv.stufe === "wirkung" || mv.zurueckgestellt)).length,
      gesamt: inh.szenario.meldungen.length,
      offenEnde: liste.filter((mv) => mv.stufe === "offen" && !mv.zurueckgestellt).length,
    },
    feind: { bekaempft: bekaempft.size, gemeldet: gemeldet.size },
    fehl: { wirkungen: fehlListe.length, arten: [...arten].map(([art, anzahl]) => ({ art, anzahl })), liste: fehlListe },
    trotzWarnung: liste.filter((mv) => mv.entscheidungen.some((e) => e.was === "bekaempfen" && (e.warnungen ?? []).some(regelWarnung))).length,
    freigaben: {
      gesamt: liste.filter(bekaempfung).length,
      wieArgus: liste.filter((mv) => bekaempfung(mv) && inh.meldungen[mv.id]?.argus.empfehlung === "BEKÄMPFEN").length,
    },
    widerspruch: { gesamt: widerspruch.length, zuRecht: widerspruch.filter((w) => w.recht).length, zuUnrecht: widerspruch.filter((w) => !w.recht).length, liste: widerspruch },
    zeiten: {
      alle: tempoZeiten(alle), hoch: tempoZeiten(hoch), niedrig: tempoZeiten(niedrig), schwelle: KONFIDENZ_HOCH,
      kuerzeste: sekAlle.length ? Math.min(...sekAlle) : null, laengste: sekAlle.length ? Math.max(...sekAlle) : null,
      unter20: sekAlle.filter((x) => x <= 20).length,
    },
    lagemeldungen: lm,
    durchbruch: durchgebrochen(inh, z.durchbrueche ?? {}, z.zerstoert, z.verstaerkungen),
    verluste: verlusteKennzahl(basis, z),
  };
}

/** Verluste der eigenen Truppe für die Auswertung (D5, seit 2.5 je Panzer): bei Spielende, sonst bis zur Spielzeit jetzt. */
function verlusteKennzahl(basis: Inhalte, z: Spielzustand): Kennzahlen["verluste"] {
  if (!mitVerlusten(basis)) return undefined;
  const dauer = (basis.basis ?? basis).szenario.spieluhr.dauer_s;
  const bis = z.ende ? dauer : Math.min(dauer, z.uhr.t_s);
  const st = verlustStand(basis, z, bis)!;
  const verlauf = verlustVerlauf(basis, z, 15).filter(([t]) => t <= bis + 1e-6);
  const pl = panzer(basis);
  return {
    ...st.zug, zustand: Math.floor(pl.reduce((a, p) => a + st.panzer[p.id].zustand, 0) / Math.max(1, pl.length)),
    panzer: pl.map((p) => ({ id: p.id, name: p.name, zustand: st.panzer[p.id].zustand, stufe: st.panzer[p.id].stufe, treffer: st.panzer[p.id].treffer, verwundete: st.panzer[p.id].verwundete })),
    verlauf, druckmeldungen: z.injectReihenfolge.filter((id) => z.injects[id].stufe !== undefined).length,
  };
}

// ---------------------------------------------------------------- Konfidenz

export interface KonfidenzPunkt {
  meldung: string;
  konfidenz: number;
  empfehlung: string;
  /** Anteil der Sichtstörung (0–1): größter verdeckter Anteil von Bild oder Ziel; seit 2.4 auch die EloKa-Störung */
  gestoert: number;
  /**
   * Seit 2.4 (E4): zur Meldezeit stört das EloKa-Fahrzeug den Datenlink (Stand der Daten, ohne Bekämpfung). ARGUS zeigte
   * dann eine niedrigere Konfidenz (argusBei); `konfidenz` ist der Wert der Daten, die Bilanz bleibt wie pruefe_szenario.py.
   */
  eloka?: boolean;
  falsch: boolean;
  fall?: string;
  /** Teams, die die Meldung bekämpft haben / bei denen sie entschieden wurde */
  bekaempft: number;
  entschieden: number;
}

export interface KonfidenzBild {
  punkte: KonfidenzPunkt[];
  richtig: number;
  falsch: number;
  mittelFalsch: number | null;
  mittelRichtig: number | null;
  /** Fehlbekämpfungen aller Teams, bei denen ARGUS falsch empfohlen hatte (Team folgte): Anzahl und Konfidenz */
  fehl: { n: number; min: number | null; max: number | null };
  /** übrige Fehlbekämpfungen (trotz ARGUS-Warnung, Nebenwirkung bei echtem Ziel) */
  fehlSonst: number;
  /** Konfidenz der Meldungen, bei denen Teams zu Recht widersprochen haben */
  widerspruch: { n: number; min: number | null; max: number | null };
}

function spanne(werte: number[]) {
  return { n: werte.length, min: werte.length ? Math.min(...werte) : null, max: werte.length ? Math.max(...werte) : null };
}

/** ARGUS-Bilanz der Grundlage (ohne Verstärkungen) und was die Teams daraus gemacht haben. */
export function konfidenzBild(basis: Inhalte, verlaeufe: Map<string, MeldungsVerlauf>[], kz: Kennzahlen[]): KonfidenzBild {
  const inh = basis.basis ?? basis;
  const punkte = inh.szenario.meldungen.map((m): KonfidenzPunkt => {
    const eloka = elokaAktiv(inh, {}, m.t_s);
    const gestoert = Math.max(eloka ? inh.szenario.eloka!.bildstoerung : 0, ...m.bild.sicht.map((s) => Math.max(s.anteil ?? 0, s.ziel_anteil ?? 0)));
    let bek = 0;
    let ent = 0;
    for (const v of verlaeufe) {
      const mv = v.get(m.id);
      if (!mv) continue;
      if (mv.wirkung || mv.stufe === "wirkung") bek += 1;
      if (mv.wirkung || mv.stufe === "wirkung" || mv.stufe === "erledigt" || mv.zurueckgestellt) ent += 1;
    }
    return {
      meldung: m.id, konfidenz: m.argus.konfidenz, empfehlung: m.argus.empfehlung, gestoert, ...(eloka ? { eloka: true } : {}), falsch: argusFalsch(inh, m),
      fall: m.fall, bekaempft: bek, entschieden: ent,
    };
  });
  const falsch = punkte.filter((p) => p.falsch);
  const richtigBek = punkte.filter((p) => !p.falsch && p.empfehlung === "BEKÄMPFEN");
  const mittel = (l: KonfidenzPunkt[]) => (l.length ? Math.round((l.reduce((s, p) => s + p.konfidenz, 0) / l.length) * 10) / 10 : null);
  return {
    punkte,
    richtig: punkte.length - falsch.length,
    falsch: falsch.length,
    mittelFalsch: mittel(falsch),
    mittelRichtig: mittel(richtigBek),
    fehl: spanne(kz.flatMap((k) => k.fehl.liste.filter((f) => inh.meldungen[f.meldung] && argusFalsch(inh, inh.meldungen[f.meldung])).map((f) => f.konfidenz))),
    fehlSonst: kz.reduce((n, k) => n + k.fehl.liste.filter((f) => !inh.meldungen[f.meldung] || !argusFalsch(inh, inh.meldungen[f.meldung])).length, 0),
    widerspruch: spanne(kz.flatMap((k) => k.widerspruch.liste.filter((w) => w.recht).map((w) => inh.meldungen[w.meldung]?.argus.konfidenz ?? 0))),
  };
}

// ---------------------------------------------------------------- Gesamt

export interface TeamAuswertung {
  id: string;
  name: string;
  farbe: string;
  ende: boolean;
  kennzahlen: Kennzahlen;
  faelle: Record<string, FallErgebnis>;
  verlaeufe: Map<string, MeldungsVerlauf>;
  notizen: { t: number; fall?: string; text: string }[];
}

export interface Auswertung {
  faelle: FallDef[];
  teams: TeamAuswertung[];
  konfidenz: KonfidenzBild;
}

export function auswerten(basis: Inhalte, teams: TeamLauf[]): Auswertung {
  const fs = faelle(basis);
  const tw = teams.map((t): TeamAuswertung => {
    const inh = weltFuer(basis, t.zustand);
    const verlaeufe = meldungsVerlaeufe(t);
    return {
      id: t.id, name: t.name, farbe: t.farbe, ende: t.zustand.ende,
      kennzahlen: kennzahlen(basis, t, verlaeufe),
      faelle: Object.fromEntries(fs.map((f) => [f.id, fallErgebnis(inh, verlaeufe, f, t.zustand.ende)])),
      verlaeufe,
      notizen: t.zustand.notizen.map((n) => ({ t: n.t_s, fall: n.fall, text: n.text })),
    };
  });
  return { faelle: fs, teams: tw, konfidenz: konfidenzBild(basis, tw.map((t) => t.verlaeufe), tw.map((t) => t.kennzahlen)) };
}

// ---------------------------------------------------------------- Replay

export type MarkenArt = "meldung" | "entscheid" | "einschlag" | "gelesen" | "notiz";

export interface ZeitMarke {
  t: number;
  art: MarkenArt;
  /** kurz auf der Leiste */
  zeichen: string;
  /** Tooltip / Text */
  text: string;
  /** weiter, halt, warten, fehl, ok, info */
  klasse: string;
  meldung?: string;
}

/** Zeitfenster eines Falls für das Replay (Spielzeit): etwas vor der ersten Lagemeldung bzw. Meldung bis nach dem letzten Ereignis. */
export function fallFenster(basis: Inhalte, teams: TeamAuswertung[], f: FallDef): [number, number] {
  const inh = basis.basis ?? basis;
  const dauer = inh.szenario.spieluhr.dauer_s;
  const ids = [f.meldung, ...f.folge];
  const tMeld = ids.map((id) => inh.meldungen[id]?.t_s).filter((t): t is number => t !== undefined);
  const tInj = fallInjects(inh).filter((i) => i.fall === f.id).map((i) => i.t);
  let von = Math.min(...tMeld, ...tInj) - 20;
  let bis = Math.max(...tMeld) + 60;
  for (const t of teams) {
    for (const id of ids) {
      const mv = t.verlaeufe.get(id);
      if (!mv) continue;
      for (const e of mv.entscheidungen) bis = Math.max(bis, e.t + 15);
      if (mv.wirkung) bis = Math.max(bis, mv.wirkung.t + 20);
    }
  }
  von = Math.max(0, Math.floor(von / 5) * 5);
  bis = Math.min(dauer, Math.ceil(bis / 5) * 5);
  return [von, bis];
}

/** Marken eines Teams für die Zeitleiste eines Falls: Meldung → Entscheidung (mit Sekunden) → Einschlag, Lagemeldungen angeklickt, Notizen. */
export function zeitleiste(basis: Inhalte, t: TeamAuswertung, f: FallDef): ZeitMarke[] {
  const inh = basis.basis ?? basis;
  const start = inh.szenario.spieluhr.start;
  const uz = (x: number) => uhrzeit(start, x);
  const out: ZeitMarke[] = [];
  for (const id of [f.meldung, ...f.folge]) {
    const mv = t.verlaeufe.get(id);
    if (!mv) continue;
    const zt = zielText(inh, id);
    out.push({ t: mv.t, art: "meldung", zeichen: zielNr(inh, null, id), text: `${zt} im Eingang ${uz(mv.t)}`, klasse: "info", meldung: id });
    for (const e of mv.entscheidungen) {
      const sek = e.sekEingang !== undefined ? ` nach ${sekText(e.sekEingang)}${e.sekOffen !== undefined ? ` (${sekText(e.sekOffen)} angesehen)` : ""}` : "";
      out.push({
        t: e.t, art: "entscheid", zeichen: `${WAS_ZEICHEN[e.was]}${e.sekEingang !== undefined ? ` ${Math.round(e.sekEingang)} s` : ""}`, klasse: WAS_ART[e.was] === "weiter" ? "weiter" : WAS_ART[e.was], meldung: id,
        text: `${zt}: ${ENTSCHEID_TEXT[e.was]}${e.wirkmittel ? ` mit ${inh.wirkmittel[e.wirkmittel]?.kurz ?? e.wirkmittel}` : ""} ${uz(e.t)}${sek}`,
      });
    }
    if (mv.wirkung) {
      const w = mv.wirkung;
      out.push({ t: w.t, art: "einschlag", zeichen: "✸", klasse: wirkungFehlerhaft(w) ? "fehl" : "ok", meldung: id, text: kette(inh, mv, id).einschlag?.text ?? "Einschlag" });
    }
    if (mv.entfallen && !mv.entfallen.beimErscheinen) out.push({ t: mv.entfallen.t, art: "meldung", zeichen: "∅", klasse: "entfallen", meldung: id, text: `${zt} entfällt ${uz(mv.entfallen.t)} – ${mv.entfallen.grund}` });
  }
  for (const lm of t.kennzahlen.lagemeldungen.filter((x) => x.fall === f.id)) {
    if (lm.erschienen !== undefined) out.push({ t: lm.erschienen, art: "gelesen", zeichen: "✉", klasse: "info", text: `Lagemeldung ${lm.id} ${uz(lm.erschienen)}${lm.gelesen !== undefined ? ` – angeklickt nach ${Math.round(lm.gelesen - lm.erschienen)} s` : ""}` });
  }
  for (const n of t.notizen.filter((x) => x.fall === f.id)) out.push({ t: n.t, art: "notiz", zeichen: "✎", klasse: "notiz", text: `Notiz SL: ${n.text}` });
  return out.sort((a, b) => a.t - b.t);
}

/** Spielstand eines Teams zur Spielzeit t (Protokoll bis t), für Karte und Drohnenbild im Replay. */
export function zustandBis(basis: Inhalte, protokoll: Ereignis[], t: number): { z: Spielzustand; n: number } {
  let z = anfangsZustand(basis);
  let n = 0;
  for (const e of protokoll) {
    if (e.t_s > t + 1e-6 && e.typ !== "spiel_neu") break;
    z = anwenden(z, e, basis);
    n += 1;
  }
  return { z, n };
}

/** Anzahl der Ereignisse bis zur Spielzeit t (Schlüssel für Zwischenspeicher). */
export function ereignisseBis(protokoll: Ereignis[], t: number): number {
  let n = 0;
  for (const e of protokoll) {
    if (e.t_s > t + 1e-6 && e.typ !== "spiel_neu") break;
    n += 1;
  }
  return n;
}

// ---------------------------------------------------------------- Export (anonym)

export interface ExportOptionen {
  /** Freitexte (Begründung, Bemerkung, Lagehinweise, Notizen der Spielleitung) mitnehmen */
  freitext: boolean;
}

/** Bezeichnung eines Teams im Export: Team A, B, C … (Reihenfolge wie in der Auswertung, keine Namen). */
export function teamKennung(i: number): string {
  return `Team ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ""}`;
}

/**
 * Ergebnisse für die Seminarauswertung ohne Personen- und Teamnamen, ohne Kennungen der Fenster und ohne Uhrzeit des
 * Seminars (nur Spielzeit). Freitexte (Notizen der Spielleitung) nur auf Wunsch (sie können Namen enthalten).
 */
export function exportAnonym(basis: Inhalte, teams: TeamLauf[], a: Auswertung, opt: ExportOptionen) {
  const inh = basis.basis ?? basis;
  const sz = inh.szenario;
  const r1 = (x: number | null | undefined) => (x === null || x === undefined ? null : Math.round(x * 10) / 10);
  const tz = (z: TempoZeiten) => ({ ab_eingang: r1(z.eingang), ab_oeffnen: r1(z.offen), n: z.n });
  return {
    art: "ARGUS-Auswertung (anonym)",
    szenario: { id: sz.id, version: sz.version, titel: sz.titel },
    erzeugt: new Date().toISOString().slice(0, 10),
    hinweis: "Spielzeit in s ab Spielbeginn (Spieluhr 00:00, Ende 25:00). Eine Rolle je Team (Zielbearbeitung), eine Entscheidung je Meldung: bekaempfen, zurueckstellen, ablehnen; dazu die Sekunden ab Eingang und ab Öffnen. Ziele wie im Spiel (ziel: „Ziel 8“), dazu die Kennung der Meldung. Keine Namen von Personen oder Teams, keine Kennungen der Rechner."
      + (opt.freitext ? " Freitexte sind enthalten." : " Ohne Freitexte."),
    faelle: a.faelle.map((f) => ({ id: f.id, art: f.art, titel: f.titel, meldung: f.meldung, ziel: zielText(inh, f.meldung), folge: f.folge })),
    argus: {
      richtig: a.konfidenz.richtig, falsch: a.konfidenz.falsch, konfidenz_falsch_mittel: a.konfidenz.mittelFalsch, konfidenz_richtig_bekaempfen_mittel: a.konfidenz.mittelRichtig,
      meldungen: a.konfidenz.punkte.map((p) => ({ meldung: p.meldung, ziel: zielText(inh, p.meldung), konfidenz: p.konfidenz, empfehlung: p.empfehlung, sicht_gestoert: p.gestoert, argus_falsch: p.falsch, fall: p.fall ?? null, teams_bekaempft: p.bekaempft, teams_entschieden: p.entschieden })),
    },
    teams: a.teams.map((t, i) => {
      const lauf = teams.find((x) => x.id === t.id)!;
      const k = t.kennzahlen;
      return {
        team: teamKennung(i),
        spielende: t.ende,
        verstaerkungen: lauf.zustand.verstaerkungen.map((v) => ({ gruppe: v.gruppe, t: r1(v.t0) })),
        kennzahlen: {
          meldungen_erschienen: k.meldungen.erschienen, meldungen_bearbeitet: k.meldungen.bearbeitet, meldungen_gesamt: k.meldungen.gesamt, meldungen_offen_ende: k.meldungen.offenEnde,
          feind_bekaempft: k.feind.bekaempft, feind_gemeldet: k.feind.gemeldet,
          fehlbekaempfungen: k.fehl.wirkungen, fehl_arten: Object.fromEntries(k.fehl.arten.map((x) => [x.art, x.anzahl])),
          bekaempft: k.freigaben.gesamt, bekaempft_wie_argus: k.freigaben.wieArgus, bekaempft_trotz_warnung: k.trotzWarnung,
          widerspruch: k.widerspruch.gesamt, widerspruch_zu_recht: k.widerspruch.zuRecht, widerspruch_zu_unrecht: k.widerspruch.zuUnrecht,
          widerspruch_liste: k.widerspruch.liste.map((w) => ({ meldung: w.meldung, t: r1(w.t), argus: w.argus, zu_recht: w.recht })),
          sekunden_median: { alle: tz(k.zeiten.alle), konfidenz_hoch: tz(k.zeiten.hoch), konfidenz_niedrig: tz(k.zeiten.niedrig), schwelle: k.zeiten.schwelle },
          sekunden_kuerzeste: r1(k.zeiten.kuerzeste), sekunden_laengste: r1(k.zeiten.laengste), entscheidungen_bis_20_s: k.zeiten.unter20,
          lagemeldungen: k.lagemeldungen.map((l) => ({ inject: l.id, fall: l.fall, erschienen: r1(l.erschienen), angeklickt: r1(l.gelesen) })),
          durchgebrochen: k.durchbruch.fahrzeuge.length, durchbruch_gruppen: k.durchbruch.gruppen, durchbruch_erstes_ueber_bach: r1(k.durchbruch.erstesUeber),
          // seit 2.3 (D5.3), seit 2.5 je Panzer: eigene Verluste (Zustand, Stufe, Verwundete) und Verlauf je Minute
          ...(k.verluste ? {
            einsatzbereit_ende: k.verluste.bereit, eingeschraenkt_ende: k.verluste.eingeschraenkt, ausgefallen_ende: k.verluste.ausgefallen,
            verwundete_ende: k.verluste.verwundete, zustand_mittel_ende: k.verluste.zustand, druckmeldungen: k.verluste.druckmeldungen,
            zustand_panzer: Object.fromEntries(k.verluste.panzer.map((x) => [x.name, { zustand: x.zustand, stufe: x.stufe, treffer: x.treffer, verwundete: x.verwundete }])),
            zustand_verlauf: k.verluste.verlauf.filter(([t]) => t % 60 === 0).map(([t, zs, bereit, vw]) => ({ t, zustand: zs, einsatzbereit: bereit, verwundete: vw })),
          } : {}),
        },
        faelle: Object.fromEntries(a.faelle.map((f) => {
          const e = t.faelle[f.id];
          const g = e.kette.glied;
          return [f.id, {
            ausgang: e.ausgang, t: r1(e.t), entscheid: g.was ?? null, ...(g.wirkmittel ? { wirkmittel: g.wirkmittel } : {}),
            sekunden_ab_eingang: r1(g.sek), sekunden_ab_oeffnen: r1(g.sekOffen), ...(g.vorher ? { vorher: g.vorher } : {}),
            einschlag: e.kette.einschlag ? { t: r1(e.kette.einschlag.t), fehl: e.kette.einschlag.fehl, regelverstoss: e.kette.einschlag.regel } : null,
          }];
        })),
        meldungen: [...t.verlaeufe.values()].map((mv) => ({
          meldung: mv.id, ziel: `Ziel ${zielNr(inh, lauf.zustand, mv.id)}`, t: r1(mv.t), stand: mv.zurueckgestellt ? "zurueckgestellt" : mv.stufe,
          entscheidungen: mv.entscheidungen.map((e) => ({
            t: r1(e.t), entscheid: e.was, ...(e.wirkmittel ? { wirkmittel: e.wirkmittel } : {}),
            sekunden_ab_eingang: r1(e.sekEingang), sekunden_ab_oeffnen: r1(e.sekOffen), warnungen: e.warnungen?.length ?? 0,
          })),
          wirkung: mv.wirkung ? { t_freigabe: r1(mv.wirkung.t_freigabe), t: r1(mv.wirkung.t), wirkmittel: mv.wirkung.wirkmittel, treffer: mv.wirkung.treffer, fehl: mv.wirkung.fehl, verstoesse: mv.wirkung.verstoesse.map((v) => v.split(":")[0]) } : null,
          entfallen: mv.entfallen ? { t: r1(mv.entfallen.t), grund: mv.entfallen.grund } : null,
        })),
        ...(opt.freitext ? { notizen_spielleitung: t.notizen.map((n) => ({ t: r1(n.t), fall: n.fall ?? null, text: n.text })) } : {}),
      };
    }),
  };
}

/** Kennzahlen und Fälle je Team als CSV (Semikolon, für Excel), anonym. */
export function exportCsv(a: Auswertung): string {
  const kopf = [
    "team", "meldungen_bearbeitet", "meldungen_erschienen", "offen_ende", "fehlbekaempfungen", "fehl_arten", "bekaempft", "trotz_warnung",
    "widerspruch", "zu_recht", "zu_unrecht", "median_s_ab_eingang", "median_s_ab_oeffnen", "median_s_konfidenz_hoch", "median_s_konfidenz_niedrig", "bis_20_s",
    "lagemeldung", "angeklickt_s", "durchgebrochen", "einsatzbereit_ende", "ausgefallen_ende", "verwundete_ende",
    ...a.faelle.flatMap((f) => [f.id, `${f.id}_s`]),
  ];
  const zelle = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "number" ? String(Math.round(v * 10) / 10).replace(".", ",") : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const zeilen = a.teams.map((t, i) => {
    const k = t.kennzahlen;
    const lm = k.lagemeldungen[0];
    return [
      teamKennung(i), k.meldungen.bearbeitet, k.meldungen.erschienen, k.meldungen.offenEnde, k.fehl.wirkungen, k.fehl.arten.map((x) => `${x.art} ${x.anzahl}`).join(", "),
      k.freigaben.gesamt, k.trotzWarnung, k.widerspruch.gesamt, k.widerspruch.zuRecht, k.widerspruch.zuUnrecht,
      k.zeiten.alle.eingang, k.zeiten.alle.offen, k.zeiten.hoch.eingang, k.zeiten.niedrig.eingang, k.zeiten.unter20,
      lm?.id ?? null, lm?.gelesen !== undefined && lm?.erschienen !== undefined ? lm.gelesen - lm.erschienen : null, k.durchbruch.fahrzeuge.length,
      k.verluste?.bereit ?? null, k.verluste?.ausgefallen ?? null, k.verluste?.verwundete ?? null,
      ...a.faelle.flatMap((f) => [t.faelle[f.id].ausgang, t.faelle[f.id].sek ?? null]),
    ].map(zelle).join(";");
  });
  return `\ufeff${[kopf.join(";"), ...zeilen].join("\r\n")}\r\n`;
}
