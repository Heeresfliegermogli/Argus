// Auswertung (Schritt 8): Teamvergleich, Kennzahlen, Konfidenz und Replay aus den Protokollen der Teams.
//
// Reine Funktionen von Inhalten und Protokollen – dieselben Zahlen in jedem Fenster (Plenum, Spielleitung)
// und im Export. Die Auswertung bleibt bei der Ethik: Sie zeigt, wer im Team an welcher Stufe was entschieden
// hat und was beim Einschlag wirklich getroffen wurde – nie Namen von Personen, nur Teams.
//
// Begriffe
//  • Fall: Schlüsselfall (S1–S4, Reihenfolge der Auflösung aus den Daten) oder Nebenfall (N1–N4). Zu einem Fall
//    gehören seine Meldung und Folgemeldungen mit demselben `fall` (S4: M18 und M23).
//  • Ausgang eines Falls je Team:
//      falsch          – eine Freigabe traf Verbündete, Geschütztes, Zivilpersonen, die Attrappe oder Wehrlose,
//                        oder schlug unter Verstoß gegen R2/R3 ein (Lage beim Einschlag)
//      richtig         – nichts davon; das Team hat gestoppt, zurückgestellt oder (bei echtem Ziel) sauber bekämpft
//      verpasst        – echtes Ziel, das nach der Lösung bekämpft werden sollte, aber abgelehnt wurde (N3)
//      offen           – bei Spielende noch in der Kette
//      entfallen       – Fahrzeug zerstört oder abgezogen, bevor jemand entschied
//      nicht_erreicht  – die Meldung kam nicht (Spiel vorher beendet)
//  • Widerspruch gegen ARGUS: Das Team hat am Ende anders gehandelt, als ARGUS empfahl – BEKÄMPFEN, aber ein Mensch
//    hat gestoppt (G1 ABLEHNEN, G2 NICHT BEKÄMPFEN/BEOBACHTEN, G3 ABLEHNEN/ZURÜCK) und es kam zu keiner Wirkung;
//    oder NICHT BEKÄMPFEN, aber das Team hat bekämpft. Zu Recht, wenn die Lösung im Szenario das Stoppen verlangt
//    bzw. die Wirkung ohne Fehltreffer und ohne Regelverstoß blieb. PRÜFEN/UNKLAR ist keine Empfehlung, der man
//    widersprechen könnte.
import type { Inhalte, Meldung, Nebenfall, Schluesselfall } from "../inhalte/typen";
import type { Ereignis } from "./ereignisse";
import { gtBei } from "./geometrie";
import { weltFuer } from "./lage";
import { FEHL } from "./lagebild";
import { uhrzeit } from "./uhr";
import { type Spielzustand, anfangsZustand, anwenden } from "./zustand";

/** Ein Team mit seinem Lauf, wie die Auswertung es braucht (Plenum, Spielleitung, Demo, Test). */
export interface TeamLauf {
  id: string;
  name: string;
  farbe: string;
  zustand: Spielzustand;
  protokoll: Ereignis[];
}

export type Stufe3 = "g1" | "g2" | "g3";
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
  /** Schlüsselfall: volle Daten (Leitfragen, Bezüge) */
  sf?: Schluesselfall;
  nf?: Nebenfall;
}

/** Fälle in der Reihenfolge der Auflösung: Schlüsselfälle nach `reihenfolge` (S3, S2, S1, S4), dann die Nebenfälle. */
export function faelle(inh: Inhalte): FallDef[] {
  const sz = (inh.basis ?? inh).szenario;
  const folge = (f: { id: string; meldung: string }) => sz.meldungen.filter((m) => m.fall === f.id && m.id !== f.meldung).map((m) => m.id);
  return [
    ...[...sz.schluesselfaelle].sort((a, b) => a.reihenfolge - b.reihenfolge)
      .map((f): FallDef => ({ id: f.id, art: "schluessel", titel: f.titel, meldung: f.meldung, folge: folge(f), sf: f })),
    ...[...sz.nebenfaelle].sort((a, b) => a.id.localeCompare(b.id))
      .map((f): FallDef => ({ id: f.id, art: "neben", titel: f.titel, meldung: f.meldung, folge: folge(f), nf: f })),
  ];
}

// ---------------------------------------------------------------- Verlauf je Meldung aus dem Protokoll

export interface Entscheidung {
  stufe: Stufe3;
  t: number;
  /** annehmen, ablehnen · bekaempfen, beobachten, nicht_bekaempfen · freigabe, ablehnen, zurueck */
  was: string;
  wirkmittel?: string;
  /** Vermerk, Begründung, Bemerkung (Freitext) */
  text?: string;
  /** Regelwarnungen, die diese Stufe gesehen hat (G2, G3) */
  warnungen?: string[];
}

export type FehlArt = "verbuendet" | "geschuetzt" | "zivil" | "attrappe" | "ausser_gefecht";

export const FEHL_TEXT: Record<FehlArt, string> = {
  verbuendet: "Verbündete",
  geschuetzt: "Sanität",
  zivil: "Zivilpersonen",
  attrappe: "Attrappe",
  ausser_gefecht: "ergibt sich",
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
  fastTrack: boolean;
  entscheidungen: Entscheidung[];
  wirkung?: WirkungInfo;
  entfallen?: { t: number; stufe: Stufe3 | "meldung"; grund: string };
  /** Stand bei Spielende */
  stufe: string;
  /** zurückgestellt (BEOBACHTEN) und bei Spielende noch bei G2 */
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
      id, t: st.erschienen.t_s, fastTrack: st.fastTrack, entscheidungen: [], stufe: st.stufe,
      zurueckgestellt: st.stufe === "g2" && st.beobachten,
      ...(st.stufe === "entfallen" && !st.entfallen ? { entfallen: { t: st.erschienen.t_s, stufe: "meldung" as const, grund: "schon beim Erscheinen" } } : {}),
    });
  }
  for (const e of team.protokoll) {
    if (e.typ === "g1_entscheid" || e.typ === "g2_empfehlung" || e.typ === "g3_entscheid") {
      const mv = out.get(e.daten.meldung);
      if (!mv) continue;
      if (e.typ === "g1_entscheid") mv.entscheidungen.push({ stufe: "g1", t: e.t_s, was: e.daten.entscheid, text: e.daten.vermerk });
      else if (e.typ === "g2_empfehlung") {
        mv.entscheidungen.push({ stufe: "g2", t: e.t_s, was: e.daten.empfehlung, wirkmittel: e.daten.wirkmittel, text: e.daten.begruendung, warnungen: e.daten.warnungen ?? [] });
      } else {
        mv.entscheidungen.push({ stufe: "g3", t: e.t_s, was: e.daten.entscheid, wirkmittel: e.daten.wirkmittel, text: e.daten.bemerkung, warnungen: e.daten.warnungen ?? [] });
      }
    } else if (e.typ === "meldung_entfaellt") {
      const mv = out.get(e.daten.meldung);
      if (mv && !mv.entfallen) mv.entfallen = { t: e.t_s, stufe: e.daten.stufe, grund: e.daten.grund };
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

/** Letzte Entscheidung einer Stufe (und ob es davor schon eine andere gab). */
function letzte(mv: MeldungsVerlauf, stufe: Stufe3): { e: Entscheidung; vorher?: Entscheidung } | null {
  const liste = mv.entscheidungen.filter((x) => x.stufe === stufe);
  if (!liste.length) return null;
  return { e: liste[liste.length - 1], vorher: liste.length > 1 ? liste[0] : undefined };
}

/** Wurde die Meldung bekämpft, und war das fehlerhaft (Fehltreffer oder Regelverstoß beim Einschlag)? */
export function wirkungFehlerhaft(w: WirkungInfo | undefined): boolean {
  return !!w && (w.fehl.length > 0 || w.verstoesse.some((v) => v.startsWith("R2") || v.startsWith("R3")));
}

/**
 * Soll die Meldung nach der Lösung im Szenario bekämpft werden? Nein, wenn G1 ablehnen, G2 zurückstellen oder nicht
 * bekämpfen oder G3 ablehnen bzw. nicht freigeben soll (z. B. S3: G1/G2 nehmen an, G3 lehnt ab).
 */
export function sollBekaempfen(m: Meldung): boolean {
  const l = m.loesung ?? { G1: "ANNEHMEN", G2: "BEKÄMPFEN", G3: "FREIGABE" };
  if (/^ABLEHNEN/i.test(l.G1.trim())) return false;
  if (/^(BEOBACHTEN|NICHT)/i.test(l.G2.trim())) return false;
  if (/^(ABLEHNEN|keine|nicht)/i.test(l.G3.trim())) return false;
  return true;
}

/** Hat ARGUS falsch empfohlen? (BEKÄMPFEN, aber das Ziel war zur Meldezeit nicht legitim – wie pruefe_szenario.py.) */
export function argusFalsch(inh: Inhalte, m: Meldung): boolean {
  if (m.argus.empfehlung !== "BEKÄMPFEN") return false;
  return !m.ziele.every((id) => !inh.ziele[id] || gtBei(inh.ziele[id], m.t_s).legitim);
}

// ---------------------------------------------------------------- Kette und Fall

export type GliedArt = "weiter" | "halt" | "warten" | "ft" | "leer" | "offen";

export interface KettenGlied {
  stufe: Stufe3;
  /** kurz: ✓ ✕ ◷ ↩ FT – … */
  zeichen: string;
  art: GliedArt;
  /** ausführlich (Tooltip, Replay) */
  titel: string;
  t?: number;
  /** diese Stufe hat den Ausgang entschieden */
  entscheidend?: boolean;
  /** davor anders entschieden (z. B. erst zurückgestellt) */
  vorher?: string;
}

export interface Kette {
  meldung: string;
  glieder: KettenGlied[];
  /** Einschlag: ✸, Fehltreffer rot */
  einschlag?: { t: number; fehl: boolean; text: string; regel: boolean };
}

const WAS_TEXT: Record<string, string> = {
  annehmen: "ANNEHMEN", ablehnen: "ABLEHNEN", bekaempfen: "BEKÄMPFEN", beobachten: "BEOBACHTEN (zurückgestellt)",
  nicht_bekaempfen: "NICHT BEKÄMPFEN", freigabe: "FREIGABE", zurueck: "ZURÜCK AN G2",
};

/** Kette G1 → G2 → G3 → Einschlag einer Meldung, wie das Team sie durchlaufen hat. */
export function kette(inh: Inhalte, mv: MeldungsVerlauf | undefined, meldung: string): Kette {
  const start = (inh.basis ?? inh).szenario.spieluhr.start;
  const uz = (t?: number) => (t === undefined ? "" : ` ${uhrzeit(start, t)}`);
  if (!mv) return { meldung, glieder: (["g1", "g2", "g3"] as Stufe3[]).map((s) => ({ stufe: s, zeichen: "–", art: "leer" as const, titel: `${s.toUpperCase()}: Meldung kam nicht` })) };
  const glieder: KettenGlied[] = [];
  // G1
  const g1 = letzte(mv, "g1");
  if (mv.fastTrack) glieder.push({ stufe: "g1", zeichen: "FT", art: "ft", titel: "G1: Fast-Track – G1 hat die Meldung nicht gesehen" });
  else if (g1) glieder.push({ stufe: "g1", zeichen: g1.e.was === "annehmen" ? "✓" : "✕", art: g1.e.was === "annehmen" ? "weiter" : "halt", t: g1.e.t, titel: `G1: ${WAS_TEXT[g1.e.was]}${uz(g1.e.t)}${g1.e.text ? ` – „${g1.e.text}“` : ""}` });
  else glieder.push({ stufe: "g1", zeichen: mv.stufe === "g1" ? "…" : "–", art: mv.stufe === "g1" ? "offen" : "leer", titel: mv.stufe === "g1" ? "G1: bei Spielende noch offen" : "G1: –" });
  // G2
  const g2 = letzte(mv, "g2");
  if (g2) {
    const e = g2.e;
    const art: GliedArt = e.was === "bekaempfen" ? "weiter" : e.was === "beobachten" ? "warten" : "halt";
    const vorher = g2.vorher && g2.vorher.was !== e.was ? `erst ${WAS_TEXT[g2.vorher.was]}${uz(g2.vorher.t)}` : undefined;
    glieder.push({
      stufe: "g2", zeichen: e.was === "bekaempfen" ? "✓" : e.was === "beobachten" ? "◷" : "✕",
      art, t: e.t, vorher,
      titel: `G2: ${WAS_TEXT[e.was]}${e.wirkmittel ? ` mit ${inh.wirkmittel[e.wirkmittel]?.kurz ?? e.wirkmittel}` : ""}${uz(e.t)}${vorher ? ` (${vorher})` : ""}${e.warnungen?.length ? ` · Warnung: ${e.warnungen[0]}` : ""}${e.text ? ` – „${e.text}“` : ""}`,
    });
  } else glieder.push({ stufe: "g2", zeichen: mv.stufe === "g2" ? "…" : "–", art: mv.stufe === "g2" ? "offen" : "leer", titel: mv.stufe === "g2" ? "G2: bei Spielende noch offen" : "G2: –" });
  // G3
  const g3 = letzte(mv, "g3");
  if (g3) {
    const e = g3.e;
    const vorher = g3.vorher && g3.vorher.was !== e.was ? `erst ${WAS_TEXT[g3.vorher.was]}${uz(g3.vorher.t)}` : undefined;
    glieder.push({
      stufe: "g3", zeichen: e.was === "freigabe" ? "✓" : e.was === "zurueck" ? "↩" : "✕", art: e.was === "freigabe" ? "weiter" : e.was === "zurueck" ? "warten" : "halt",
      t: e.t, vorher,
      titel: `G3: ${WAS_TEXT[e.was]}${uz(e.t)}${vorher ? ` (${vorher})` : ""}${e.warnungen?.length ? ` trotz Warnung: ${e.warnungen[0]}` : ""}${e.text ? ` – „${e.text}“` : ""}`,
    });
  } else glieder.push({ stufe: "g3", zeichen: mv.stufe === "g3" ? "…" : "–", art: mv.stufe === "g3" ? "offen" : "leer", titel: mv.stufe === "g3" ? "G3: bei Spielende noch offen" : "G3: –" });
  const w = mv.wirkung;
  const einschlag = w ? {
    t: w.t, fehl: w.fehl.length > 0, regel: w.verstoesse.length > 0,
    text: `Einschlag${uz(w.t)} (${inh.wirkmittel[w.wirkmittel]?.kurz ?? w.wirkmittel}): ${w.treffer.length ? w.treffer.join(", ") : "nichts getroffen"}${w.verstoesse.length ? ` · ${w.verstoesse.map((v) => v.split(" – ")[0]).join(", ")}` : ""}`,
  } : undefined;
  return { meldung, glieder, einschlag };
}

export interface FallErgebnis {
  fall: string;
  ausgang: FallAusgang;
  /** eine Zeile (Tooltip, Replay) */
  text: string;
  /** zwei kurze Zeilen für die Zelle im Teamvergleich: was entschieden wurde, und was folgte */
  zeilen: string[];
  /** Stufe, die den Ausgang entschieden hat */
  stufe?: Stufe3;
  t?: number;
  /** Kette der Meldung des Falls (Folgemeldungen in `folge`) */
  kette: Kette;
  folge: Kette[];
  fastTrack: boolean;
}

const STUFE_HALT: Record<string, string> = {
  ablehnen: "lehnt ab", nicht_bekaempfen: "nicht bekämpfen", beobachten: "stellt zurück", zurueck: "zurück an G2",
};

/** Ausgang eines Falls für ein Team. */
export function fallErgebnis(inh: Inhalte, verlaeufe: Map<string, MeldungsVerlauf>, f: FallDef, zSpielende: boolean): FallErgebnis {
  const start = (inh.basis ?? inh).szenario.spieluhr.start;
  const uz = (t: number) => uhrzeit(start, t);
  const haupt = verlaeufe.get(f.meldung);
  const ids = [f.meldung, ...f.folge];
  const k = kette(inh, haupt, f.meldung);
  const folge = f.folge.map((id) => kette(inh, verlaeufe.get(id), id));
  const markiere = (stufe: Stufe3 | undefined, kt: Kette = k) => {
    for (const g of kt.glieder) g.entscheidend = g.stufe === stufe;
  };
  const basis = { fall: f.id, kette: k, folge, fastTrack: !!haupt?.fastTrack };
  const wmKurz = (w: WirkungInfo) => inh.wirkmittel[w.wirkmittel]?.kurz ?? w.wirkmittel;
  const erg = (ausgang: FallAusgang, zeilen: (string | undefined)[], stufe?: Stufe3, t?: number): FallErgebnis => {
    const z = zeilen.filter((x): x is string => !!x);
    return { ...basis, ausgang, zeilen: z, text: z.join(" · "), stufe, t };
  };

  // falsch: eine Freigabe im Fall traf, was nicht bekämpft werden durfte, oder verstieß beim Einschlag gegen R2/R3
  for (const id of ids) {
    const mv = verlaeufe.get(id);
    if (!mv?.wirkung || !wirkungFehlerhaft(mv.wirkung)) continue;
    const w = mv.wirkung;
    const kt = id === f.meldung ? k : folge[f.folge.indexOf(id)];
    markiere("g3", kt);
    const was = w.fehl.length ? `→ ${w.fehl.map((x) => FEHL_TEXT[x]).join(", ")} getroffen` : `→ Verstoß ${w.verstoesse.map((v) => v.split(":")[0]).join(", ")}`;
    return erg("falsch", [`${id !== f.meldung ? `${id} ` : ""}FREIGABE ${uz(w.t_freigabe)} (${wmKurz(w)})`, was], "g3", w.t_freigabe);
  }
  if (!haupt) return erg("nicht_erreicht", [zSpielende ? `${f.meldung} kam vor Spielende nicht` : `${f.meldung} kommt noch`]);
  const m = inh.meldungen[f.meldung];
  const soll = m ? sollBekaempfen(m) : true;
  // Wer hat gestoppt? (letzte stoppende Entscheidung, falls am Ende keine Wirkung)
  const stopp = stoppVon(haupt);
  const stoppText = (e: Entscheidung) => `${e.stufe.toUpperCase()} ${STUFE_HALT[e.was] ?? e.was} ${uz(e.t)}`;
  const folgeText = () => {
    const teile: string[] = [];
    for (const id of f.folge) {
      const mv = verlaeufe.get(id);
      if (!mv) continue;
      if (mv.wirkung) teile.push(`${id} FREIGABE ${uz(mv.wirkung.t_freigabe)}`);
      else if (mv.entfallen) teile.push(`${id} entfallen`);
      else if (mv.stufe === "g1" || mv.stufe === "g2" || mv.stufe === "g3") teile.push(`${id} offen bei ${mv.stufe.toUpperCase()}`);
      else {
        const s = stoppVon(mv);
        teile.push(s ? `${id} ${s.stufe.toUpperCase()} ${STUFE_HALT[s.was] ?? s.was}` : `${id} erledigt`);
      }
    }
    return teile.length ? teile.join(", ") : undefined;
  };

  if (haupt.wirkung) {
    // bekämpft ohne Fehltreffer und ohne Verstoß: echtes Ziel, sauber getroffen
    markiere("g3");
    return erg("richtig", [`FREIGABE ${uz(haupt.wirkung.t_freigabe)} (${wmKurz(haupt.wirkung)})`, folgeText() ?? "ohne Fehltreffer"], "g3", haupt.wirkung.t_freigabe);
  }
  if (haupt.stufe === "erledigt" && stopp) {
    markiere(stopp.stufe);
    return soll ? erg("verpasst", [stoppText(stopp), "Ziel war echt"], stopp.stufe, stopp.t) : erg("richtig", [stoppText(stopp), folgeText()], stopp.stufe, stopp.t);
  }
  if (haupt.zurueckgestellt && stopp) {
    markiere("g2");
    return erg("richtig", [stoppText(stopp), folgeText() ?? "bis Spielende zurückgestellt"], "g2", stopp.t);
  }
  if (haupt.entfallen) {
    if (stopp) markiere(stopp.stufe);
    const wo = haupt.entfallen.stufe !== "meldung" ? ` bei ${haupt.entfallen.stufe.toUpperCase()}` : "";
    return erg(stopp && !soll ? "richtig" : "entfallen", [stopp ? stoppText(stopp) : undefined, `entfallen${wo} – ${haupt.entfallen.grund}`, folgeText()], stopp?.stufe, stopp?.t);
  }
  if (haupt.stufe === "wirkung") return erg("offen", ["freigegeben", "Einschlag nach Spielende"], "g3");
  return erg("offen", [`${zSpielende ? "bei Spielende" : "jetzt"} bei ${haupt.stufe.toUpperCase()}`, folgeText()]);
}

function stoppVon(mv: MeldungsVerlauf): Entscheidung | undefined {
  return [...mv.entscheidungen].reverse().find((e) => (e.stufe === "g1" && e.was === "ablehnen") || (e.stufe === "g2" && e.was !== "bekaempfen")
    || (e.stufe === "g3" && e.was !== "freigabe"));
}

// ---------------------------------------------------------------- Kennzahlen

export interface StufenZeiten {
  g1: number | null;
  g2: number | null;
  g3: number | null;
  n: { g1: number; g2: number; g3: number };
}

export interface Widerspruch {
  meldung: string;
  stufe: Stufe3;
  t: number;
  argus: string;
  recht: boolean;
}

export interface Kennzahlen {
  meldungen: { erschienen: number; bearbeitet: number; gesamt: number };
  feind: { bekaempft: number; gemeldet: number };
  fehl: { wirkungen: number; arten: { art: FehlArt; anzahl: number }[]; liste: { meldung: string; t: number; arten: FehlArt[]; konfidenz: number }[] };
  /** Freigaben, obwohl G3 eine Regelwarnung zum Einschlag sah */
  trotzWarnung: number;
  /** Freigaben durch G3 (je Meldung) und davon solche, bei denen ARGUS BEKÄMPFEN empfahl */
  freigaben: { gesamt: number; wieArgus: number };
  widerspruch: { gesamt: number; zuRecht: number; zuUnrecht: number; liste: Widerspruch[] };
  /** Median der Bearbeitungszeit je Stufe (s): alle, Konfidenz ≥ Schwelle, darunter */
  zeiten: { alle: StufenZeiten; hoch: StufenZeiten; niedrig: StufenZeiten; schwelle: number };
  fastTrack: { an: boolean; seit?: number; angebot?: number; wechsel: { t: number; an: boolean }[]; meldungen: number };
  /** Lagemeldungen zu einem Fall (I-04, I-07): erschienen, gelesen (quittiert) */
  lagemeldungen: { id: string; fall: string; erschienen?: number; gelesen?: number }[];
  lagehinweise: { anzahl: number; liste: { t: number; an: string[]; text: string }[]; ersterNach?: number };
}

function median(werte: number[]): number | null {
  if (!werte.length) return null;
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Bearbeitungszeiten einer Meldung je Stufe: Eingang bei der Stufe bis zur ersten Entscheidung dort (jede Runde). */
function bearbeitung(mv: MeldungsVerlauf): { stufe: Stufe3; dauer: number }[] {
  const out: { stufe: Stufe3; dauer: number }[] = [];
  let bei: Stufe3 | null = mv.fastTrack ? "g2" : "g1";
  let seit = mv.t;
  for (const e of mv.entscheidungen) {
    if (e.stufe !== bei) continue;
    out.push({ stufe: e.stufe, dauer: Math.max(0, e.t - seit) });
    seit = e.t;
    if (e.stufe === "g1") bei = e.was === "annehmen" ? "g2" : null;
    else if (e.stufe === "g2") bei = e.was === "bekaempfen" ? "g3" : e.was === "beobachten" ? "g2" : null;
    else bei = e.was === "zurueck" ? "g2" : null;
  }
  return out;
}

function stufenZeiten(listen: { stufe: Stufe3; dauer: number }[]): StufenZeiten {
  const je = (s: Stufe3) => listen.filter((x) => x.stufe === s).map((x) => x.dauer);
  return {
    g1: median(je("g1")), g2: median(je("g2")), g3: median(je("g3")),
    n: { g1: je("g1").length, g2: je("g2").length, g3: je("g3").length },
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
  const schwelle = inh.regeln.fast_track.schwelle;
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
      widerspruch.push({ meldung: mv.id, stufe: s.stufe, t: s.t, argus: emp, recht: !sollBekaempfen(m) });
    } else if (emp === "NICHT BEKÄMPFEN" && (mv.wirkung || mv.stufe === "wirkung")) {
      const g3 = letzte(mv, "g3");
      widerspruch.push({ meldung: mv.id, stufe: "g3", t: g3?.e.t ?? mv.t, argus: emp, recht: !!mv.wirkung && !wirkungFehlerhaft(mv.wirkung) });
    }
  }
  // Zeiten
  const alle: { stufe: Stufe3; dauer: number }[] = [];
  const hoch: { stufe: Stufe3; dauer: number }[] = [];
  const niedrig: { stufe: Stufe3; dauer: number }[] = [];
  for (const mv of liste) {
    const k = inh.meldungen[mv.id]?.argus.konfidenz ?? 0;
    for (const b of bearbeitung(mv)) {
      alle.push(b);
      (k >= schwelle ? hoch : niedrig).push(b);
    }
  }
  // Fast-Track
  const wechsel = team.protokoll.filter((e) => e.typ === "fast_track").map((e) => ({ t: e.t_s, an: (e.daten as { an: boolean }).an }));
  const angebotId = inh.szenario.injects.find((i) => i.aktion === "fast_track_angebot")?.id;
  const letzterAn = [...wechsel].reverse().find((w) => w.an);
  // Lagemeldungen zum Fall und Lagehinweise
  const lm = fallInjects(inh).map((i) => ({ id: i.id, fall: i.fall, erschienen: z.injects[i.id]?.erschienen.t_s, gelesen: z.injects[i.id]?.quittiert?.t_s }));
  const ersteLm = lm[0]?.erschienen;
  const hinweise = z.lagehinweise.map((l) => ({ t: l.t_s, an: l.an, text: l.text }));
  return {
    meldungen: {
      erschienen: z.reihenfolge.filter((id) => !(z.meldungen[id].stufe === "entfallen" && !z.meldungen[id].entfallen)).length,
      bearbeitet: liste.filter((mv) => mv.entscheidungen.length > 0 && (mv.stufe === "erledigt" || mv.stufe === "wirkung" || mv.zurueckgestellt)).length,
      gesamt: inh.szenario.meldungen.length,
    },
    feind: { bekaempft: bekaempft.size, gemeldet: gemeldet.size },
    fehl: { wirkungen: fehlListe.length, arten: [...arten].map(([art, anzahl]) => ({ art, anzahl })), liste: fehlListe },
    trotzWarnung: liste.filter((mv) => mv.entscheidungen.some((e) => e.stufe === "g3" && e.was === "freigabe" && (e.warnungen?.length ?? 0) > 0)).length,
    freigaben: {
      gesamt: liste.filter((mv) => mv.entscheidungen.some((e) => e.stufe === "g3" && e.was === "freigabe")).length,
      wieArgus: liste.filter((mv) => mv.entscheidungen.some((e) => e.stufe === "g3" && e.was === "freigabe") && inh.meldungen[mv.id]?.argus.empfehlung === "BEKÄMPFEN").length,
    },
    widerspruch: { gesamt: widerspruch.length, zuRecht: widerspruch.filter((w) => w.recht).length, zuUnrecht: widerspruch.filter((w) => !w.recht).length, liste: widerspruch },
    zeiten: { alle: stufenZeiten(alle), hoch: stufenZeiten(hoch), niedrig: stufenZeiten(niedrig), schwelle },
    fastTrack: {
      an: z.fastTrack, seit: z.fastTrack ? letzterAn?.t : undefined, angebot: angebotId ? z.injects[angebotId]?.erschienen.t_s : undefined,
      wechsel, meldungen: liste.filter((mv) => mv.fastTrack).length,
    },
    lagemeldungen: lm,
    lagehinweise: { anzahl: hinweise.length, liste: hinweise, ersterNach: ersteLm !== undefined ? hinweise.find((h) => h.t >= ersteLm)?.t : undefined },
  };
}

// ---------------------------------------------------------------- Konfidenz

export interface KonfidenzPunkt {
  meldung: string;
  konfidenz: number;
  empfehlung: string;
  /** Anteil der Sichtstörung (0–1): größter verdeckter Anteil von Bild oder Ziel */
  gestoert: number;
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
    const gestoert = Math.max(0, ...m.bild.sicht.map((s) => Math.max(s.anteil ?? 0, s.ziel_anteil ?? 0)));
    let bek = 0;
    let ent = 0;
    for (const v of verlaeufe) {
      const mv = v.get(m.id);
      if (!mv) continue;
      if (mv.wirkung || mv.stufe === "wirkung") bek += 1;
      if (mv.wirkung || mv.stufe === "wirkung" || mv.stufe === "erledigt" || mv.zurueckgestellt) ent += 1;
    }
    return { meldung: m.id, konfidenz: m.argus.konfidenz, empfehlung: m.argus.empfehlung, gestoert, falsch: argusFalsch(inh, m), fall: m.fall, bekaempft: bek, entschieden: ent };
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

export type MarkenArt = "meldung" | "g1" | "g2" | "g3" | "einschlag" | "gelesen" | "hinweis" | "ft" | "notiz";

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

const MARKE_G: Record<string, { zeichen: string; klasse: string }> = {
  annehmen: { zeichen: "✓", klasse: "weiter" }, ablehnen: { zeichen: "✕", klasse: "halt" },
  bekaempfen: { zeichen: "✓", klasse: "weiter" }, beobachten: { zeichen: "◷", klasse: "warten" }, nicht_bekaempfen: { zeichen: "✕", klasse: "halt" },
  freigabe: { zeichen: "✓", klasse: "freigabe" }, zurueck: { zeichen: "↩", klasse: "warten" },
};

/** Marken eines Teams für die Zeitleiste eines Falls: Meldung → G1 → G2 → G3 → Einschlag, Lagemeldungen gelesen, Lagehinweise. */
export function zeitleiste(basis: Inhalte, t: TeamAuswertung, f: FallDef): ZeitMarke[] {
  const inh = basis.basis ?? basis;
  const start = inh.szenario.spieluhr.start;
  const uz = (x: number) => uhrzeit(start, x);
  const out: ZeitMarke[] = [];
  for (const id of [f.meldung, ...f.folge]) {
    const mv = t.verlaeufe.get(id);
    if (!mv) continue;
    out.push({ t: mv.t, art: "meldung", zeichen: id, text: `${id} erscheint ${uz(mv.t)}${mv.fastTrack ? " – Fast-Track direkt an G2" : ""}`, klasse: mv.fastTrack ? "ft" : "info", meldung: id });
    for (const e of mv.entscheidungen) {
      const g = MARKE_G[e.was] ?? { zeichen: "•", klasse: "info" };
      out.push({
        t: e.t, art: e.stufe, zeichen: `${e.stufe.toUpperCase()}${g.zeichen}`, klasse: g.klasse, meldung: id,
        text: `${id} · ${e.stufe.toUpperCase()}: ${WAS_TEXT[e.was] ?? e.was}${e.wirkmittel ? ` (${inh.wirkmittel[e.wirkmittel]?.kurz ?? e.wirkmittel})` : ""} ${uz(e.t)}${e.text ? ` – „${e.text}“` : ""}`,
      });
    }
    if (mv.wirkung) {
      const w = mv.wirkung;
      out.push({ t: w.t, art: "einschlag", zeichen: "✸", klasse: wirkungFehlerhaft(w) ? "fehl" : "ok", meldung: id, text: kette(inh, mv, id).einschlag?.text ?? "Einschlag" });
    }
    if (mv.entfallen && mv.entfallen.stufe !== "meldung") out.push({ t: mv.entfallen.t, art: "meldung", zeichen: "∅", klasse: "entfallen", meldung: id, text: `${id} entfällt ${uz(mv.entfallen.t)} – ${mv.entfallen.grund}` });
  }
  for (const lm of t.kennzahlen.lagemeldungen.filter((x) => x.fall === f.id)) {
    if (lm.gelesen !== undefined) out.push({ t: lm.gelesen, art: "gelesen", zeichen: "✉", klasse: "info", text: `G3 hat ${lm.id} gelesen ${uz(lm.gelesen)}${lm.erschienen !== undefined ? ` (${Math.round(lm.gelesen - lm.erschienen)} s nach Eingang)` : ""}` });
  }
  for (const h of t.kennzahlen.lagehinweise.liste) {
    out.push({ t: h.t, art: "hinweis", zeichen: "▲", klasse: "hinweis", text: `Lagehinweis G3 → ${h.an.map((r) => r.toUpperCase()).join(", ")} ${uz(h.t)}: „${h.text}“` });
  }
  for (const w of t.kennzahlen.fastTrack.wechsel) out.push({ t: w.t, art: "ft", zeichen: w.an ? "FT ein" : "FT aus", klasse: "ft", text: `Fast-Track ${w.an ? "EIN" : "AUS"} ${uz(w.t)}` });
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
  /** Freitexte (Vermerk, Begründung, Bemerkung, Lagehinweise, Notizen der Spielleitung) mitnehmen */
  freitext: boolean;
}

/** Bezeichnung eines Teams im Export: Team A, B, C … (Reihenfolge wie in der Auswertung, keine Namen). */
export function teamKennung(i: number): string {
  return `Team ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ""}`;
}

/**
 * Ergebnisse für die Seminarauswertung ohne Personen- und Teamnamen, ohne Kennungen der Fenster und ohne Uhrzeit des
 * Seminars (nur Spielzeit). Freitexte nur auf Wunsch (sie können Namen enthalten).
 */
export function exportAnonym(basis: Inhalte, teams: TeamLauf[], a: Auswertung, opt: ExportOptionen) {
  const inh = basis.basis ?? basis;
  const sz = inh.szenario;
  const r1 = (x: number | null | undefined) => (x === null || x === undefined ? null : Math.round(x * 10) / 10);
  return {
    art: "ARGUS-Auswertung (anonym)",
    szenario: { id: sz.id, version: sz.version, titel: sz.titel },
    erzeugt: new Date().toISOString().slice(0, 10),
    hinweis: "Spielzeit in s ab Spielbeginn (10:00:00). Keine Namen von Personen oder Teams, keine Kennungen der Rechner."
      + (opt.freitext ? " Freitexte sind enthalten." : " Ohne Freitexte."),
    faelle: a.faelle.map((f) => ({ id: f.id, art: f.art, titel: f.titel, meldung: f.meldung, folge: f.folge })),
    argus: {
      richtig: a.konfidenz.richtig, falsch: a.konfidenz.falsch, konfidenz_falsch_mittel: a.konfidenz.mittelFalsch, konfidenz_richtig_bekaempfen_mittel: a.konfidenz.mittelRichtig,
      meldungen: a.konfidenz.punkte.map((p) => ({ meldung: p.meldung, konfidenz: p.konfidenz, empfehlung: p.empfehlung, sicht_gestoert: p.gestoert, argus_falsch: p.falsch, fall: p.fall ?? null, teams_bekaempft: p.bekaempft, teams_entschieden: p.entschieden })),
    },
    teams: a.teams.map((t, i) => {
      const lauf = teams.find((x) => x.id === t.id)!;
      const k = t.kennzahlen;
      return {
        team: teamKennung(i),
        spielende: t.ende,
        verstaerkungen: lauf.zustand.verstaerkungen.map((v) => ({ gruppe: v.gruppe, t: r1(v.t0) })),
        kennzahlen: {
          meldungen_erschienen: k.meldungen.erschienen, meldungen_bearbeitet: k.meldungen.bearbeitet, meldungen_gesamt: k.meldungen.gesamt,
          feind_bekaempft: k.feind.bekaempft, feind_gemeldet: k.feind.gemeldet,
          fehlbekaempfungen: k.fehl.wirkungen, fehl_arten: Object.fromEntries(k.fehl.arten.map((x) => [x.art, x.anzahl])),
          freigaben_trotz_warnung: k.trotzWarnung,
          widerspruch: k.widerspruch.gesamt, widerspruch_zu_recht: k.widerspruch.zuRecht, widerspruch_zu_unrecht: k.widerspruch.zuUnrecht,
          widerspruch_liste: k.widerspruch.liste.map((w) => ({ meldung: w.meldung, stufe: w.stufe, t: r1(w.t), argus: w.argus, zu_recht: w.recht })),
          zeit_median_s: { alle: { g1: r1(k.zeiten.alle.g1), g2: r1(k.zeiten.alle.g2), g3: r1(k.zeiten.alle.g3) },
            konfidenz_hoch: { g1: r1(k.zeiten.hoch.g1), g2: r1(k.zeiten.hoch.g2), g3: r1(k.zeiten.hoch.g3) },
            konfidenz_niedrig: { g1: r1(k.zeiten.niedrig.g1), g2: r1(k.zeiten.niedrig.g2), g3: r1(k.zeiten.niedrig.g3) }, schwelle: k.zeiten.schwelle },
          fast_track: { an: k.fastTrack.an, seit: r1(k.fastTrack.seit), angebot: r1(k.fastTrack.angebot), wechsel: k.fastTrack.wechsel.map((w) => ({ t: r1(w.t), an: w.an })), meldungen: k.fastTrack.meldungen },
          lagemeldungen: k.lagemeldungen.map((l) => ({ inject: l.id, fall: l.fall, erschienen: r1(l.erschienen), gelesen: r1(l.gelesen) })),
          lagehinweise: k.lagehinweise.anzahl, lagehinweis_erster_nach_lagemeldung: r1(k.lagehinweise.ersterNach),
        },
        faelle: Object.fromEntries(a.faelle.map((f) => {
          const e = t.faelle[f.id];
          return [f.id, {
            ausgang: e.ausgang, entschieden_von: e.stufe ?? null, t: r1(e.t), fast_track: e.fastTrack,
            kette: e.kette.glieder.map((g) => ({ stufe: g.stufe, zeichen: g.zeichen, t: r1(g.t) })),
            einschlag: e.kette.einschlag ? { t: r1(e.kette.einschlag.t), fehl: e.kette.einschlag.fehl, regelverstoss: e.kette.einschlag.regel } : null,
          }];
        })),
        meldungen: [...t.verlaeufe.values()].map((mv) => ({
          meldung: mv.id, t: r1(mv.t), fast_track: mv.fastTrack, stand: mv.zurueckgestellt ? "zurueckgestellt" : mv.stufe,
          entscheidungen: mv.entscheidungen.map((e) => ({
            stufe: e.stufe, t: r1(e.t), entscheid: e.was, ...(e.wirkmittel ? { wirkmittel: e.wirkmittel } : {}),
            warnungen: e.warnungen?.length ?? 0, ...(opt.freitext && e.text ? { text: e.text } : {}),
          })),
          wirkung: mv.wirkung ? { t_freigabe: r1(mv.wirkung.t_freigabe), t: r1(mv.wirkung.t), wirkmittel: mv.wirkung.wirkmittel, treffer: mv.wirkung.treffer, fehl: mv.wirkung.fehl, verstoesse: mv.wirkung.verstoesse.map((v) => v.split(":")[0]) } : null,
          entfallen: mv.entfallen ? { t: r1(mv.entfallen.t), stufe: mv.entfallen.stufe } : null,
        })),
        lagehinweise: k.lagehinweise.liste.map((h) => ({ t: r1(h.t), an: h.an, ...(opt.freitext ? { text: h.text } : {}) })),
        ...(opt.freitext ? { notizen_spielleitung: t.notizen.map((n) => ({ t: r1(n.t), fall: n.fall ?? null, text: n.text })) } : {}),
      };
    }),
  };
}

/** Kennzahlen und Fälle je Team als CSV (Semikolon, für Excel), anonym. */
export function exportCsv(a: Auswertung): string {
  const kopf = [
    "team", "meldungen_bearbeitet", "meldungen_erschienen", "fehlbekaempfungen", "fehl_arten", "freigaben_trotz_warnung",
    "widerspruch", "zu_recht", "zu_unrecht", "median_g1_s", "median_g2_s", "median_g3_s", "fast_track_seit_s", "lagemeldung", "gelesen_s",
    "lagehinweise", ...a.faelle.map((f) => f.id),
  ];
  const zelle = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "number" ? String(Math.round(v * 10) / 10).replace(".", ",") : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const zeilen = a.teams.map((t, i) => {
    const k = t.kennzahlen;
    const lm = k.lagemeldungen[0];
    return [
      teamKennung(i), k.meldungen.bearbeitet, k.meldungen.erschienen, k.fehl.wirkungen, k.fehl.arten.map((x) => `${x.art} ${x.anzahl}`).join(", "),
      k.trotzWarnung, k.widerspruch.gesamt, k.widerspruch.zuRecht, k.widerspruch.zuUnrecht, k.zeiten.alle.g1, k.zeiten.alle.g2, k.zeiten.alle.g3,
      k.fastTrack.seit ?? null, lm?.id ?? null, lm?.gelesen ?? null, k.lagehinweise.anzahl, ...a.faelle.map((f) => t.faelle[f.id].ausgang),
    ].map(zelle).join(";");
  });
  return `﻿${[kopf.join(";"), ...zeilen].join("\r\n")}\r\n`;
}
